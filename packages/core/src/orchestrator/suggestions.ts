import { z } from "zod";
import { callStructured, type Router } from "../router/index.js";
import type { Store } from "../store/index.js";
import { randomUUID } from "../util/uuid.js";
import { requireStory } from "./turn.js";

export const SuggestedActionSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["action", "move", "dialogue"]),
  text: z.string().trim().min(1).max(240),
  actionId: z.string().optional(),
  rationale: z.string().trim().min(1).max(160),
});
export type SuggestedAction = z.infer<typeof SuggestedActionSchema>;

const SuggestionsSchema = z.object({
  suggestions: z.array(SuggestedActionSchema.omit({ id: true })).min(5).max(6),
});

function fallbackSuggestions(
  actions: readonly { id: string; label: string; description?: string }[]
): SuggestedAction[] {
  const mechanical = actions.slice(0, 4).map((action) => ({
    id: randomUUID(),
    kind: "action" as const,
    text: action.label,
    actionId: action.id,
    rationale: action.description ?? "A mechanically valid action in this story.",
  }));
  return [
    ...mechanical,
    {
      id: randomUUID(),
      kind: "dialogue" as const,
      text: "Ask the nearest character what they know about the immediate situation.",
      rationale: "A grounded way to learn more without assuming an outcome.",
    },
    {
      id: randomUUID(),
      kind: "move" as const,
      text: "Pause and carefully observe the surroundings before committing.",
      rationale: "A cautious contextual move that preserves player choice.",
    },
  ].slice(0, 6);
}

/** Generate five or six optional, context-grounded player choices without taking an action. */
export async function suggestPlayerActions(
  router: Router,
  store: Store,
  storyId: string,
  signal?: AbortSignal
): Promise<SuggestedAction[]> {
  const story = await requireStory(store, storyId);
  const messages = await store.messages.recent(storyId, 8);
  const catalog = story.schema.actions.map((action) => ({
    id: action.id,
    label: action.label,
    category: action.category,
    description: action.description,
    aliases: action.aliases,
    requiresSkill: action.requiresSkill,
  }));
  try {
    const response = await callStructured(
      router,
      "classifier",
      {
        system: [
          "You suggest optional next moves for a roleplay player.",
          "Return 5 or 6 concise possibilities mixing valid actions, movement, and dialogue.",
          "Ground every option in the current scene. Never decide an outcome or speak as if the player already acted.",
          "When kind=action, use only an exact actionId from the provided catalog. Dialogue and non-consequential movement may omit actionId.",
          `The story permits ${story.actionBudget ?? 2} consequential actions per submitted turn.`,
        ].join("\n"),
        user: [
          "ACTION CATALOG:",
          catalog.map((action) => JSON.stringify(action)).join("\n"),
          "",
          "RECENT SCENE:",
          messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n"),
        ].join("\n"),
      },
      SuggestionsSchema,
      { maxRepairs: 2, ...(signal ? { signal } : {}) }
    );
    const validIds = new Set(catalog.map((action) => action.id));
    const suggestions = response.suggestions
      .filter(
        (suggestion) =>
          suggestion.kind !== "action" ||
          (suggestion.actionId !== undefined && validIds.has(suggestion.actionId))
      )
      .map((suggestion) => ({ id: randomUUID(), ...suggestion }));
    if (suggestions.length >= 5) return suggestions.slice(0, 6);
  } catch (error) {
    if (signal?.aborted) throw error;
  }
  return fallbackSuggestions(catalog);
}
