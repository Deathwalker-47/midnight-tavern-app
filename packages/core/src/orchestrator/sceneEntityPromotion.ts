import type { CharacterRecord } from "../store/index.js";
import type { StorySchema } from "../types/index.js";

export interface SceneEntityCandidate {
  id: string;
  name: string;
}

interface SceneEntityPromotionInput {
  storyId: string;
  schema: StorySchema;
  recentNarration: readonly string[];
  roster: readonly CharacterRecord[];
}

const ACTOR_HEADS = new Set([
  "assailant",
  "bandit",
  "beast",
  "creature",
  "enemy",
  "guard",
  "knight",
  "man",
  "monster",
  "soldier",
  "stranger",
  "thug",
  "woman",
  "wolf",
  "wight",
]);

const ACTOR_VERBS = [
  "approaches",
  "attacks",
  "blocks",
  "breathes",
  "crawls",
  "draws",
  "emerges",
  "enters",
  "follows",
  "laughs",
  "lurks",
  "moves",
  "runs",
  "speaks",
  "stands",
  "steps",
  "turns",
  "walks",
  "watches",
];

function normalize(value: string): string {
  return value
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}'-]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function slug(value: string): string {
  return normalize(value).replace(/['’]/g, "").replace(/\s+/g, "-");
}

function displayName(value: string): string {
  return value.length > 0 ? value[0]!.toLocaleUpperCase("en-US") + value.slice(1) : value;
}

function narratedActors(narration: string, schema: StorySchema): string[] {
  const actors = new Set<string>();
  const heads = [...ACTOR_HEADS].join("|");
  const verbs = ACTOR_VERBS.join("|");
  const describedActor = new RegExp(
    `\\b(?:a|an|the)\\s+((?:[a-z'-]+\\s+){0,3}(?:${heads}))\\s+(?:${verbs})\\b`,
    "giu"
  );
  for (const match of narration.matchAll(describedActor)) {
    const actor = normalize(match[1] ?? "");
    if (actor) actors.add(actor);
  }

  const properActor = new RegExp(
    `\\b([A-Z][\\p{L}'-]+(?:\\s+[A-Z][\\p{L}'-]+){0,2})\\s+(?:${verbs})\\b`,
    "gu"
  );
  for (const match of narration.matchAll(properActor)) {
    const actor = normalize(match[1] ?? "");
    if (actor) actors.add(actor);
  }

  const normalizedNarration = normalize(narration);
  for (const template of schema.npcTemplates) {
    const templateName = normalize(template.name);
    const followedByActorVerb = ACTOR_VERBS.some((verb) =>
      normalizedNarration.includes(`${templateName} ${verb}`)
    );
    if (followedByActorVerb) actors.add(templateName);
  }
  return [...actors];
}

/**
 * Discover actual NPCs established by recent narration. Explicit player provocation is an extra
 * signal, but registry membership does not depend on combat: every narrated actor matching a sealed
 * template, a proper name, or a bounded actor noun is returned. Depictions and arbitrary prose
 * nouns such as scenery, doors, murals, statues, or crowds do not satisfy the actor grammar.
 */
export function discoverNarratedSceneEntities(
  input: SceneEntityPromotionInput
): SceneEntityCandidate[] {
  const rawNarration = input.recentNarration.slice(-2).join(" ");
  const narration = normalize(rawNarration);
  if (!rawNarration.trim()) return [];

  const knownNames = new Set(input.roster.map((character) => normalize(character.name)));
  const knownIds = new Set(input.roster.map((character) => character.id));
  const found = new Map<string, SceneEntityCandidate>();
  const establishedActors = new Set(narratedActors(rawNarration, input.schema));

  for (const target of establishedActors) {
    if (!narration.includes(target) || knownNames.has(target)) continue;

    const template = input.schema.npcTemplates.find((candidate) => {
      const templateName = normalize(candidate.name);
      return (
        normalize(candidate.templateId) === target ||
        templateName === target ||
        templateName.includes(target) ||
        target.includes(templateName)
      );
    });
    const name = template?.name ?? displayName(target);
    const baseId = `${input.storyId}:scene:${slug(template?.templateId ?? target)}`;
    if (knownIds.has(baseId)) continue;
    found.set(baseId, { id: baseId, name });
  }

  return [...found.values()];
}
