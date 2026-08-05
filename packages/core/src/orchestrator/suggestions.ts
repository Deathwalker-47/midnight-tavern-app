import { z } from "zod";
import { callStructured, type Router } from "../router/index.js";
import type { Store } from "../store/index.js";
import { randomUUID } from "../util/uuid.js";
import {
  assemblePlayerSuggestionContext,
  type PlayerSuggestionContext,
} from "./context.js";
import { requireStory } from "./turn.js";

export const SuggestedActionSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["action", "move", "dialogue"]),
  text: z.string().trim().min(1).max(240),
  actionId: z.string().optional(),
  rationale: z.string().trim().min(1).max(160).optional(),
});
export type SuggestedAction = z.infer<typeof SuggestedActionSchema>;

export class SuggestionGenerationError extends Error {
  override readonly name = "SuggestionGenerationError";

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}

const KNOWN_GENERIC_SUGGESTIONS = [
  "nearest character",
  "immediate situation",
  "observe the surroundings",
  "before committing",
  "look around carefully",
];

function normalized(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function includesWholePhrase(text: string, phrase: string): boolean {
  if (!phrase) return false;
  return ` ${text} `.includes(` ${phrase} `);
}

function actionTextMatches(
  text: string,
  action: { label: string; aliases?: string[] }
): boolean {
  const candidate = normalized(text);
  return [action.label, ...(action.aliases ?? [])]
    .map(normalized)
    .filter(Boolean)
    .some((phrase) => includesWholePhrase(candidate, phrase));
}

function deterministicFallbackSuggestions(
  context: PlayerSuggestionContext
): SuggestedAction[] {
  if (!context.latestNarrator?.trim()) return [];
  const player = context.visibleCharacters.find((character) => character.isPlayer);
  if (!player) return [];

  const characterAnchors = context.sceneAnchors
    .filter((a) => a.kind === "character")
    .map((a) => a.name);
  const locationAnchors = context.sceneAnchors
    .filter((a) => a.kind === "location" || a.kind === "thread")
    .map((a) => a.name);

  const primaryAnchor = locationAnchors[0] ?? characterAnchors[1];
  const secondaryAnchor = locationAnchors[1] ?? locationAnchors[0];
  if (!primaryAnchor || !secondaryAnchor) return [];
  const npc = context.visibleCharacters.find((character) => !character.isPlayer);
  const safeAction = context.availableActions.find((action) =>
    npc
      ? action.category !== "combat"
      : ["exploration", "utility", "crafting"].includes(action.category)
  );
  const suggestions: Array<Omit<SuggestedAction, "id">> = npc
    ? [
        {
          kind: "dialogue",
          text: `Ask ${npc.name} what they know about ${primaryAnchor}.`,
        },
        {
          kind: "dialogue",
          text: `Tell ${npc.name} what you noticed about ${secondaryAnchor}.`,
        },
        {
          kind: "move",
          text: `Examine ${primaryAnchor} while keeping ${npc.name} in view.`,
        },
        {
          kind: "move",
          text: `Move toward ${secondaryAnchor} and watch ${npc.name} for a reaction.`,
        },
        safeAction
          ? {
              kind: "action",
              text: `${safeAction.label} while investigating ${primaryAnchor}.`,
              actionId: safeAction.id,
            }
          : {
              kind: "move",
              text: `Check whether ${primaryAnchor} and ${secondaryAnchor} are connected before moving on.`,
            },
      ]
    : [
        {
          kind: "move",
          text: `Examine ${primaryAnchor} for details connected to ${secondaryAnchor}.`,
        },
        {
          kind: "move",
          text: `Move toward ${primaryAnchor} while keeping ${secondaryAnchor} in view.`,
        },
        {
          kind: "move",
          text: `Check whether ${primaryAnchor} and ${secondaryAnchor} are connected.`,
        },
        {
          kind: "dialogue",
          text: `Call out about ${primaryAnchor} and listen near ${secondaryAnchor}.`,
        },
        safeAction
          ? {
              kind: "action",
              text: `${safeAction.label} while investigating ${primaryAnchor}.`,
              actionId: safeAction.id,
            }
          : {
              kind: "move",
              text: `Compare what changed around ${primaryAnchor} with ${secondaryAnchor}.`,
            },
      ];

  return suggestions.map((suggestion) => ({ id: randomUUID(), ...suggestion }));
}

/** Generate five or six optional, context-grounded player choices without taking an action. */
export async function suggestPlayerActions(
  router: Router,
  store: Store,
  storyId: string,
  signal?: AbortSignal
): Promise<SuggestedAction[]> {
  const story = await requireStory(store, storyId);
  const context = await assemblePlayerSuggestionContext(store, story);
  if (context.recentScene.length === 0) return [];

  const visibleCharacterIds = new Set(
    context.visibleCharacters.map((character) => character.id)
  );
  const unavailableCharacterNames = (await store.characters.listByStory(storyId))
    .filter(
      (character) => !visibleCharacterIds.has(character.id) || !character.hard.alive
    )
    .map((character) => normalized(character.name))
    .filter(Boolean);
  const validActions = new Map(
    context.availableActions.map((action) => [action.id, action] as const)
  );
  const SuggestionsSchema = z
    .object({
      suggestions: z.array(SuggestedActionSchema.omit({ id: true })).min(5).max(6),
    })
    .superRefine(({ suggestions }, refinement) => {
      const seen = new Set<string>();
      for (const [index, suggestion] of suggestions.entries()) {
        const text = normalized(suggestion.text);
        if (seen.has(text)) {
          refinement.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["suggestions", index, "text"],
            message: "Duplicate suggestion.",
          });
        }
        seen.add(text);
        if (KNOWN_GENERIC_SUGGESTIONS.some((phrase) => text.includes(phrase))) {
          refinement.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["suggestions", index, "text"],
            message: "Generic fallback phrasing is not grounded in this scene.",
          });
        }
        const absentName = unavailableCharacterNames.find((name) =>
          includesWholePhrase(text, name)
        );
        if (absentName) {
          refinement.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["suggestions", index, "text"],
            message:
              "Suggestion names a registered character who is not visible in the live scene.",
          });
        }
      }
    });

  try {
    const response = await callStructured(
      router,
      "classifier",
      {
        system: [
          "You suggest optional next moves for a roleplay player.",
          "Return exactly 5 or 6 concise possibilities. Mix dialogue, movement, and a mechanical action only when a relevant action candidate is supplied.",
          "Every option must be specific to the latest narrator message and current scene. Use supplied character and location names where natural, but natural pronouns and paraphrases are valid.",
          "Never use generic filler such as asking the nearest character, observing the surroundings, or pausing before committing.",
          "Never decide an outcome or speak as if the player already acted.",
          "When kind=action, use only an exact actionId from the available actions and include that action's exact label or one of its aliases in text. If that list is empty, return no kind=action options.",
          "Return JSON shaped as {\"suggestions\":[{\"kind\":\"dialogue|move|action\",\"text\":\"...\",\"actionId\":\"only for action\",\"rationale\":\"optional\"}]}",
          `The story permits ${story.actionBudget ?? 2} consequential actions per submitted turn.`,
        ].join("\n"),
        user: [
          "LIVE SCENE TRANSCRIPT (oldest to newest; long messages preserve their latest tail):",
          context.recentScene.join("\n"),
          "",
          "VISIBLE CHARACTERS:",
          context.visibleCharacters.length
            ? context.visibleCharacters.map((character) => JSON.stringify(character)).join("\n")
            : "(none evidenced)",
          "",
          "CURRENT HARD STATE:",
          context.hardState.join("\n") || "(no mechanical state)",
          "",
          "CURRENT-LOCATION BACKGROUND (context only; the live transcript wins):",
          context.worldContext ?? "(none)",
          "",
          "SCENE ANCHORS (typed):",
          context.sceneAnchors
            .map((a) => `${a.kind}: ${a.name}`)
            .join(", ") || "(none)",
          "",
          "CURRENTLY GATE-ALLOWED ACTIONS:",
          context.availableActions.length
            ? context.availableActions.map((action) => JSON.stringify(action)).join("\n")
            : "(none; do not invent mechanical actions)",
        ].join("\n"),
      },
      SuggestionsSchema,
      { maxRepairs: 2, ...(signal ? { signal } : {}) }
    );
    return response.suggestions.map((suggestion) => {
      if (suggestion.kind === "action") {
        const action = suggestion.actionId
          ? validActions.get(suggestion.actionId)
          : undefined;
        if (action && actionTextMatches(suggestion.text, action)) {
          return { id: randomUUID(), ...suggestion };
        }
        // Suggestions are insert-only prose; invalid mechanical metadata must never make an
        // otherwise useful, scene-specific option unavailable. The real turn classifier and DM
        // still decide whether the text maps to a mechanical action when the player sends it.
        const { actionId: _ignored, ...safeSuggestion } = suggestion;
        return {
          id: randomUUID(),
          ...safeSuggestion,
          kind: "move" as const,
        };
      }
      const { actionId: _ignored, ...safeSuggestion } = suggestion;
      return { id: randomUUID(), ...safeSuggestion };
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    return deterministicFallbackSuggestions(context);
  }
}
