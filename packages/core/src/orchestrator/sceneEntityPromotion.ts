import type { CharacterRecord } from "../store/index.js";
import type { StorySchema } from "../types/index.js";

export interface SceneEntityCandidate {
  id: string;
  name: string;
  skillIds: string[];
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
  "boy",
  "child",
  "creature",
  "elder",
  "enemy",
  "girl",
  "guard",
  "innkeeper",
  "knight",
  "man",
  "merchant",
  "monster",
  "priest",
  "survivor",
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
  "asks",
  "calls",
  "lurks",
  "moves",
  "runs",
  "says",
  "speaks",
  "stands",
  "steps",
  "turns",
  "replies",
  "walks",
  "watches",
];

/** Capitalized sentence starters that can satisfy the proper-name grammar but never name an NPC. */
const NON_CHARACTER_PROPER_ACTORS = new Set([
  "anybody",
  "anyone",
  "anything",
  "everybody",
  "everyone",
  "everything",
  "nobody",
  "nothing",
  "somebody",
  "someone",
  "something",
]);

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

function properDisplayName(value: string): string {
  return value
    .split(/\s+/)
    .map((part) =>
      part.length > 0 ? part[0]!.toLocaleUpperCase("en-US") + part.slice(1) : part
    )
    .join(" ");
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
    if (actor && !NON_CHARACTER_PROPER_ACTORS.has(actor)) actors.add(actor);
  }

  // Names followed by an appositive actor description are common narrative prose:
  // "Marta Hearthwright, a broad-shouldered innkeeper, steps forward." Keep the grammar
  // bounded by both an actor head and an actor verb so locations/titles are not promoted.
  const properAppositiveActor = new RegExp(
    `\\b([A-Z][\\p{L}'-]+(?:\\s+[A-Z][\\p{L}'-]+){0,2})\\s*(?:,|—|-)\\s*(?:a|an|the)?\\s*[^.!?\\n]{0,60}\\b(?:${heads})\\b[^.!?\\n]{0,40}\\b(?:${verbs})\\b`,
    "gu"
  );
  for (const match of narration.matchAll(properAppositiveActor)) {
    const actor = normalize(match[1] ?? "");
    if (actor && !NON_CHARACTER_PROPER_ACTORS.has(actor)) actors.add(actor);
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

function inferredSkillIds(narration: string, schema: StorySchema): string[] {
  const words = new Set(normalize(narration).split(" ").filter((word) => word.length >= 4));
  const chosen: string[] = [];
  const add = (skillId: string | undefined) => {
    if (skillId && !chosen.includes(skillId) && schema.skills.some((skill) => skill.id === skillId)) {
      chosen.push(skillId);
    }
  };

  // Prefer skills explicitly evoked by the prose (name or description), then fill a broad,
  // story-authored social/exploration/combat set so a newly registered NPC is not a blank card.
  for (const skill of [...schema.skills].sort((left, right) => {
    const score = (candidate: typeof left) =>
      normalize(`${candidate.name} ${candidate.description}`)
        .split(" ")
        .filter((word) => word.length >= 4 && words.has(word)).length;
    return score(right) - score(left);
  })) {
    const overlap = normalize(`${skill.name} ${skill.description}`)
      .split(" ")
      .some((word) => word.length >= 4 && words.has(word));
    if (overlap) add(skill.id);
    if (chosen.length >= 3) return chosen;
  }

  const hostile = /\b(?:attack|assailant|bandit|beast|creature|enemy|monster|thug|weapon|wight|wolf)\b/i.test(
    narration
  );
  const categoryOrder = hostile
    ? ["combat", "movement", "exploration", "social"]
    : ["social", "exploration", "movement", "combat"];
  for (const category of categoryOrder) {
    const actions = schema.actions.filter(
      (action) => action.category === category && action.requiresSkill
    );
    for (const action of [
      ...actions.filter((candidate) => !candidate.requiresItemKind),
      ...actions.filter((candidate) => candidate.requiresItemKind),
    ]) {
      add(action.requiresSkill);
      if (chosen.length >= 3) return chosen;
    }
  }
  for (const skill of schema.skills) {
    add(skill.id);
    if (chosen.length >= 3) break;
  }
  return chosen;
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
    const properName = properDisplayName(target);
    const name =
      template?.name ?? (rawNarration.includes(properName) ? properName : displayName(target));
    const baseId = `${input.storyId}:scene:${slug(template?.templateId ?? target)}`;
    if (knownIds.has(baseId)) continue;
    found.set(baseId, { id: baseId, name, skillIds: inferredSkillIds(rawNarration, input.schema) });
  }

  return [...found.values()];
}
