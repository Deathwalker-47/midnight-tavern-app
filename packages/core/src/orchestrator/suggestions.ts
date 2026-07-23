import { z } from "zod";
import { callStructured, type Router } from "../router/index.js";
import type { Store } from "../store/index.js";
import { randomUUID } from "../util/uuid.js";
import { assemblePlayerSuggestionContext } from "./context.js";
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

function groundedInScene(text: string, anchors: readonly string[]): boolean {
  const candidate = normalized(text);
  return anchors.some((anchor) => includesWholePhrase(candidate, anchor));
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

  const validActions = new Map(
    context.availableActions.map((action) => [action.id, action] as const)
  );
  const normalizedAnchors = context.sceneAnchors
    .map(normalized)
    .filter((anchor) => anchor.length >= 4);
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
        if (suggestion.kind === "action") {
          const action = suggestion.actionId
            ? validActions.get(suggestion.actionId)
            : undefined;
          if (!action) {
            refinement.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["suggestions", index, "actionId"],
              message: "Action suggestions must use an offered, currently available actionId.",
            });
          } else if (!actionTextMatches(suggestion.text, action)) {
            refinement.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["suggestions", index, "text"],
              message: `Action text must include its supplied label or alias (${action.label}).`,
            });
          }
        } else if (suggestion.actionId !== undefined) {
          refinement.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["suggestions", index, "actionId"],
            message: "Only kind=action may include actionId.",
          });
        }
        if (KNOWN_GENERIC_SUGGESTIONS.some((phrase) => text.includes(phrase))) {
          refinement.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["suggestions", index, "text"],
            message: "Generic fallback phrasing is not grounded in this scene.",
          });
        }
        if (normalizedAnchors.length > 0 && !groundedInScene(text, normalizedAnchors)) {
          refinement.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["suggestions", index, "text"],
            message: "Mention an exact supplied live-scene anchor.",
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
          "Every option must be specific to the latest narrator message and current scene. Mention at least one exact supplied live-scene anchor in every option.",
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
          "EXACT LIVE-SCENE ANCHORS:",
          context.sceneAnchors.join(", "),
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
    return response.suggestions.map((suggestion) => ({
      id: randomUUID(),
      ...suggestion,
    }));
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new SuggestionGenerationError(
      "The suggestion model did not return five context-grounded options.",
      { cause: error }
    );
  }
}
