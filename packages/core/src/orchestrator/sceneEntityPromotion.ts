import type { CharacterRecord } from "../store/index.js";
import type { StorySchema } from "../types/index.js";

export interface SceneEntityCandidate {
  id: string;
  name: string;
  /** Narration-grounded provisional labels that refer to this same character. */
  aliases?: string[];
  skillIds: string[];
  present?: boolean;
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
  "dog",
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
  "called",
  "descended",
  "appeared",
  "emerged",
  "glanced",
  "held",
  "jerked",
  "left",
  "lifted",
  "looked",
  "lowered",
  "loped",
  "lurks",
  "made",
  "moves",
  "runs",
  "says",
  "speaks",
  "stands",
  "steps",
  "turns",
  "replies",
  "repeated",
  "said",
  "sniffed",
  "snuffled",
  "stepped",
  "studied",
  "walks",
  "watches",
  "wagged",
];

const GENERIC_HUMAN_ACTORS = new Set([
  "boy",
  "child",
  "elder",
  "girl",
  "man",
  "stranger",
  "survivor",
  "woman",
]);

/** Quantified pronouns that cannot be a direct identity declaration. */
const NON_CHARACTER_IDENTITIES = new Set([
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

/** Capitalized sentence starters that satisfy name casing but do not name an NPC. */
const NON_CHARACTER_PROPER_ACTORS = new Set([
  ...NON_CHARACTER_IDENTITIES,
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "finally",
  "he",
  "her",
  "hers",
  "him",
  "his",
  "it",
  "its",
  "our",
  "ours",
  "she",
  "their",
  "theirs",
  "them",
  "they",
  "we",
  "you",
  "your",
  "yours",
]);

function isGenericHumanActor(value: string): boolean {
  return GENERIC_HUMAN_ACTORS.has(normalize(value).split(" ").at(-1) ?? "");
}

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface ExplicitIdentities {
  all: Set<string>;
  self: Set<string>;
}

interface NarrativeIdentityReveal {
  identity: string;
  alias?: string;
  index: number;
}

/** Extract direct identity declarations without treating arbitrary capitalized prose as a name. */
function explicitIdentities(narration: string): ExplicitIdentities {
  const all = new Set<string>();
  const self = new Set<string>();
  const proper = "([A-Z][\\p{L}'-]+(?:\\s+[A-Z][\\p{L}'-]+){0,2})";
  const selfPattern = new RegExp(`\\b(?:I am|I['’]m|my name is)\\s+${proper}\\b`, "gu");
  for (const match of narration.matchAll(selfPattern)) {
    const identity = normalize(match[1] ?? "");
    if (!identity || NON_CHARACTER_IDENTITIES.has(identity)) continue;
    self.add(identity);
    all.add(identity);
  }
  const introducedPattern = new RegExp(`\\b(?:This is|Meet)\\s+${proper}\\b`, "gu");
  for (const match of narration.matchAll(introducedPattern)) {
    const identity = normalize(match[1] ?? "");
    if (identity && !NON_CHARACTER_IDENTITIES.has(identity)) all.add(identity);
  }
  return { all, self };
}

/**
 * Extract bounded third-person identity reveals used by ordinary narrator prose. These patterns
 * require both a proper name and either an actor description or a dialogue vocative; they do not
 * promote arbitrary capitalized words.
 */
function narrativeIdentityReveals(narration: string): NarrativeIdentityReveal[] {
  const reveals: NarrativeIdentityReveal[] = [];
  const proper = "([A-Z][\\p{L}'-]+(?:\\s+[A-Z][\\p{L}'-]+){0,2})";
  const heads = [...ACTOR_HEADS].join("|");
  const actor = `((?:[a-z'-]+\\s+){0,3}(?:${heads}))`;
  const dash = "(?:\\u2014|\\u2013|-)";

  // "Daen — apparently the first man's name — lowered his weapon."
  const explainedName = new RegExp(
    `\\b${proper}\\s*${dash}\\s*(?:apparently\\s+)?(?:the\\s+)?${actor}['\\u2019]s\\s+name\\s*${dash}`,
    "gu"
  );
  for (const match of narration.matchAll(explainedName)) {
    const identity = normalize(match[1] ?? "");
    const alias = normalize(match[2] ?? "");
    if (!identity || !alias || NON_CHARACTER_PROPER_ACTORS.has(identity)) continue;
    reveals.push({ identity, alias, index: match.index ?? 0 });
  }

  // "The younger man — Daenin, apparently some relation — shook his head."
  const appositiveName = new RegExp(
    `\\b(?:[Aa]n?|[Tt]he)\\s+${actor}\\s*${dash}\\s*${proper}(?:\\s*,[^\\u2014\\u2013\\n-]{0,100})?\\s*${dash}`,
    "gu"
  );
  for (const match of narration.matchAll(appositiveName)) {
    const alias = normalize(match[1] ?? "");
    const identity = normalize(match[2] ?? "");
    if (!identity || !alias || NON_CHARACTER_PROPER_ACTORS.has(identity)) continue;
    reveals.push({ identity, alias, index: match.index ?? 0 });
  }

  // Dialogue vocatives can reveal a nearby provisional actor: `"Not safe, Mera."`
  const vocativeName = new RegExp(`,\\s*${proper}\\s*[.!?]?\\s*["”']`, "gu");
  for (const match of narration.matchAll(vocativeName)) {
    const identity = normalize(match[1] ?? "");
    if (!identity || NON_CHARACTER_PROPER_ACTORS.has(identity)) continue;
    reveals.push({ identity, index: match.index ?? 0 });
  }

  const unique = new Map<string, NarrativeIdentityReveal>();
  for (const reveal of reveals.sort((left, right) => left.index - right.index)) {
    unique.set(`${reveal.index}:${reveal.identity}:${reveal.alias ?? ""}`, reveal);
  }
  return [...unique.values()];
}

function aliasFamily(
  seed: string,
  candidates: readonly CharacterRecord[]
): string[] {
  const normalizedSeed = normalize(seed);
  const related = candidates
    .map((candidate) => normalize(candidate.name))
    .filter(
      (name) =>
        name === normalizedSeed ||
        normalizedSeed.endsWith(` ${name}`) ||
        name.endsWith(` ${normalizedSeed}`)
    )
    .sort((left, right) => right.length - left.length);
  return [...new Set([normalizedSeed, ...related])].filter(Boolean);
}

/** Prefer a more specific provisional label when a broad duplicate overlaps it (Woman/Older woman). */
function canonicalContextCandidates(
  narration: string,
  candidates: readonly CharacterRecord[]
): CharacterRecord[] {
  const normalizedNarration = normalize(narration);
  return candidates.filter((candidate) => {
    const name = normalize(candidate.name);
    return !candidates.some((other) => {
      if (other.id === candidate.id) return false;
      const otherName = normalize(other.name);
      return otherName.endsWith(` ${name}`) && normalizedNarration.includes(otherName);
    });
  });
}

function contextualNarrativeTarget(
  narration: string,
  revealIndex: number,
  candidates: readonly CharacterRecord[]
): CharacterRecord | undefined {
  const before = narration.slice(Math.max(0, revealIndex - 600), revealIndex);
  let best: { candidate: CharacterRecord; score: number } | undefined;
  let tied = false;
  for (const candidate of canonicalContextCandidates(narration, candidates)) {
    const pattern = new RegExp(
      `\\b${escapeRegExp(candidate.name).replace(/\\s+/g, "\\s+")}\\b`,
      "giu"
    );
    let lastIndex = -1;
    for (const match of before.matchAll(pattern)) lastIndex = match.index ?? lastIndex;
    if (lastIndex < 0) continue;
    const score = lastIndex * 100 + normalize(candidate.name).length;
    if (!best || score > best.score) {
      best = { candidate, score };
      tied = false;
    } else if (score === best.score && candidate.id !== best.candidate.id) {
      tied = true;
    }
  }
  return tied ? undefined : best?.candidate;
}

function isDepictedActor(narration: string, index: number | undefined): boolean {
  const before = narration.slice(0, index ?? 0);
  const sentenceStart = Math.max(
    before.lastIndexOf("."),
    before.lastIndexOf("!"),
    before.lastIndexOf("?"),
    before.lastIndexOf("\n")
  );
  const sentencePrefix = before.slice(sentenceStart + 1);
  return /\b(?:carving|fresco|mural|painting|portrait|statue|tapestry)\b[^.!?\n]{0,60}\b(?:depicts?|depicted|of|portrays?|portrayed|shows?|showed)\s*$/iu.test(
    sentencePrefix
  );
}

function contextualIdentityTarget(
  narration: string,
  identity: string,
  candidates: readonly CharacterRecord[]
): CharacterRecord | undefined {
  const declaration = new RegExp(
    `\\b(?:I am|I['’]m|my name is)\\s+${escapeRegExp(properDisplayName(identity))}\\b`,
    "giu"
  );
  let best: { candidate: CharacterRecord; score: number } | undefined;
  let tied = false;
  for (const match of narration.matchAll(declaration)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const before = normalize(narration.slice(Math.max(0, start - 240), start));
    const after = normalize(narration.slice(end, end + 160));
    for (const candidate of candidates) {
      const name = normalize(candidate.name);
      const afterIndex = after.indexOf(name);
      const beforeIndex = before.lastIndexOf(name);
      const score = afterIndex >= 0 ? 10_000 - afterIndex : beforeIndex;
      if (score < 0) continue;
      if (!best || score > best.score) {
        best = { candidate, score };
        tied = false;
      } else if (score === best.score && candidate.id !== best.candidate.id) {
        tied = true;
      }
    }
  }
  return tied ? undefined : best?.candidate;
}

function narratedActors(narration: string, schema: StorySchema): string[] {
  const actors = new Set<string>();
  const appositiveDescriptions = new Set<string>();
  const heads = [...ACTOR_HEADS].join("|");
  const verbs = ACTOR_VERBS.join("|");
  const describedActor = new RegExp(
    `\\b(?:a|an|the)\\s+((?:[a-z'-]+\\s+){0,3}(?:${heads}))\\b([^.!?\\n]{0,120}?)\\b(?:${verbs})\\b`,
    "giu"
  );
  for (const match of narration.matchAll(describedActor)) {
    if (isDepictedActor(narration, match.index)) continue;
    const actor = normalize(match[1] ?? "");
    const betweenActorAndVerb = normalize(match[2] ?? "");
    const changesSubject = /\\b(?:he|i|it|she|they|we|you)\\b/i.test(betweenActorAndVerb);
    if (actor && !changesSubject) actors.add(actor);
  }

  const properActor = new RegExp(
    `\\b([A-Z][\\p{L}'-]+(?:\\s+[A-Z][\\p{L}'-]+){0,2})\\s+(?:${verbs})\\b`,
    "gu"
  );
  for (const match of narration.matchAll(properActor)) {
    if (isDepictedActor(narration, match.index)) continue;
    const actor = normalize(match[1] ?? "");
    if (actor && !NON_CHARACTER_PROPER_ACTORS.has(actor)) actors.add(actor);
  }

  // Names followed by an appositive actor description are common narrative prose:
  // "Marta Hearthwright, a broad-shouldered innkeeper, steps forward." Keep the grammar
  // bounded by both an actor head and an actor verb so locations/titles are not promoted.
  const properAppositiveActor = new RegExp(
    `\\b([A-Z][\\p{L}'-]+(?:\\s+[A-Z][\\p{L}'-]+){0,2})\\s*(?:,|—|-)\\s*(?:a|an|the)?\\s*((?:[a-z'-]+\\s+){0,3}(?:${heads}))\\b([^.!?\\n]{0,60}?)\\b(?:${verbs})\\b`,
    "gu"
  );
  for (const match of narration.matchAll(properAppositiveActor)) {
    if (isDepictedActor(narration, match.index)) continue;
    const actor = normalize(match[1] ?? "");
    const appositiveDescription = normalize(match[2] ?? "");
    const betweenActorAndVerb = normalize(match[3] ?? "");
    const changesSubject = /\\b(?:he|i|it|she|they|we|you)\\b/i.test(betweenActorAndVerb);
    if (actor && !changesSubject && !NON_CHARACTER_PROPER_ACTORS.has(actor)) {
      actors.add(actor);
      if (appositiveDescription) appositiveDescriptions.add(appositiveDescription);
    }
  }
  for (const description of appositiveDescriptions) actors.delete(description);

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
  const rawNarration = input.recentNarration.join(" ");
  const narration = normalize(rawNarration);
  const latestNarration = normalize(input.recentNarration.at(-1) ?? "");
  if (!rawNarration.trim()) return [];

  const knownNames = new Set(input.roster.map((character) => normalize(character.name)));
  const knownIds = new Set(input.roster.map((character) => character.id));
  const found = new Map<string, SceneEntityCandidate>();
  const establishedActors = new Set(narratedActors(rawNarration, input.schema));
  const identities = explicitIdentities(rawNarration);
  const playerNames = new Set(
    input.roster.filter((character) => character.isPlayer).map((character) => normalize(character.name))
  );
  for (const identity of [...identities.self]) {
    if (!playerNames.has(identity)) continue;
    identities.self.delete(identity);
    identities.all.delete(identity);
  }
  for (const identity of identities.all) establishedActors.add(identity);
  const allGenericHumans = input.roster.filter(
    (character) =>
      !character.isPlayer &&
      isGenericHumanActor(character.name)
  );
  const genericHumans = allGenericHumans.filter((character) => character.present);
  const claimedGenericIds = new Set<string>();
  const aliasesByIdentity = new Map<string, string[]>();

  for (const reveal of narrativeIdentityReveals(rawNarration)) {
    if (playerNames.has(reveal.identity)) continue;
    const existingIdentity = input.roster.find(
      (character) => normalize(character.name) === reveal.identity
    );
    const exactAliasTarget = reveal.alias
      ? allGenericHumans.find((character) => normalize(character.name) === reveal.alias)
      : undefined;
    const contextualCandidates = genericHumans.filter(
      (character) => !claimedGenericIds.has(character.id)
    );
    const target =
      existingIdentity ??
      exactAliasTarget ??
      contextualNarrativeTarget(rawNarration, reveal.index, contextualCandidates);
    if (target?.isPlayer) continue;

    const aliasSeed = reveal.alias ?? (target && isGenericHumanActor(target.name) ? target.name : "");
    const aliases = aliasSeed ? aliasFamily(aliasSeed, allGenericHumans) : [];
    for (const alias of aliases) establishedActors.delete(alias);

    if (!target) {
      establishedActors.add(reveal.identity);
      if (aliases.length > 0) aliasesByIdentity.set(reveal.identity, aliases);
      continue;
    }
    if (isGenericHumanActor(target.name)) claimedGenericIds.add(target.id);
    const meaningfulAliases = aliases.filter((alias) => alias !== reveal.identity);
    if (normalize(target.name) === reveal.identity && meaningfulAliases.length === 0) continue;
    const existing = found.get(target.id);
    found.set(target.id, {
      id: target.id,
      name: properDisplayName(reveal.identity),
      ...(meaningfulAliases.length > 0
        ? { aliases: [...new Set([...(existing?.aliases ?? []), ...meaningfulAliases])] }
        : {}),
      skillIds: inferredSkillIds(rawNarration, input.schema),
    });
  }

  const selfIdentity = identities.self.size === 1 ? [...identities.self][0] : undefined;
  const identityTarget = selfIdentity
    ? contextualIdentityTarget(rawNarration, selfIdentity, genericHumans) ??
      (genericHumans.length === 1 ? genericHumans[0] : undefined)
    : undefined;

  for (const target of establishedActors) {
    if (!narration.includes(target)) continue;
    // "Bram repeated ... I am Bram Kelder" is one person, not Bram plus Bram Kelder.
    if ([...identities.all].some((identity) => identity !== target && identity.startsWith(`${target} `))) {
      continue;
    }
    // A revealed self-identity replaces the generic human from the same recent scene. When an
    // older package failed to register that generic row, suppress it so repair creates only the
    // canonical named person.
    if (selfIdentity && isGenericHumanActor(target)) continue;
    const enrichesGeneric = target === selfIdentity && identityTarget !== undefined;
    if (knownNames.has(target) && !enrichesGeneric) continue;

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
    const baseId = enrichesGeneric
      ? identityTarget.id
      : `${input.storyId}:scene:${slug(template?.templateId ?? target)}`;
    if (knownIds.has(baseId) && !enrichesGeneric) continue;
    found.set(baseId, {
      id: baseId,
      name,
      ...(aliasesByIdentity.get(target)?.length
        ? { aliases: aliasesByIdentity.get(target)! }
        : {}),
      skillIds: inferredSkillIds(rawNarration, input.schema),
      ...(!latestNarration.includes(target) ? { present: false } : {}),
    });
  }

  return [...found.values()];
}
