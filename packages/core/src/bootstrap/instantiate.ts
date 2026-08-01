/**
 * Hard-state instantiation (low-level-plan §5, §M5).
 *
 * Turns declarative schema tables into a live `CharacterHardState`:
 *  • `instantiatePlayer` builds the protagonist from `startingState` at freeze time.
 *  • `instantiateFromTemplate` builds an NPC from an `NpcTemplate` (the orchestrator calls
 *    this the first time an NPC acts mechanically — §5 step 3).
 *  • `instantiateGeneric` builds a generic NPC with median lethal resources and any validated
 *    story skill seeds when no template matches — §5 step 3's fallback.
 *
 * All three are pure: they read the frozen schema and return a fresh state object. Resource
 * ceilings always come from the schema's ResourceDef; a starting value never invents a max.
 */
import type {
  StorySchema,
  StartingState,
  NpcTemplate,
  CharacterHardState,
  LearnedSkill,
  InventoryEntry,
} from "../types/index.js";

/** Build the resource map for a character, taking each ceiling from the schema. */
function resourceStates(
  schema: StorySchema,
  values: Record<string, number>
): CharacterHardState["resources"] {
  const out: CharacterHardState["resources"] = {};
  for (const def of schema.resources) {
    const current = values[def.id] ?? def.start;
    out[def.id] = { current: Math.min(current, def.max), max: def.max };
  }
  return out;
}

/** Skills start with a fresh success counter. */
function learnedSkills(skills: StartingState["skills"] | NpcTemplate["skills"]): LearnedSkill[] {
  return skills.map((s) => ({ skillId: s.skillId, rank: s.rank, successCount: 0 }));
}

function inventory(entries: readonly { itemId: string; qty: number }[]): InventoryEntry[] {
  return entries.map((e) => ({ itemId: e.itemId, qty: e.qty }));
}

function attributeScores(
  schema: StorySchema,
  values: Record<string, number>
): CharacterHardState["attributes"] {
  if (schema.statMode === "none") return {};
  return Object.fromEntries(
    schema.attributes.map((definition) => [
      definition.id,
      values[definition.id] ?? definition.defaultScore,
    ])
  );
}

/** Instantiate the player's hard state from the frozen schema's starting state. */
export function instantiatePlayer(schema: StorySchema, characterId: string): CharacterHardState {
  return {
    characterId,
    isPlayer: true,
    attributes: attributeScores(schema, schema.startingState.attributes),
    resources: resourceStates(schema, schema.startingState.resources),
    skills: learnedSkills(schema.startingState.skills),
    inventory: inventory(schema.startingState.inventory),
    flags: {},
    alive: true,
  };
}

/** Instantiate an NPC's hard state from a named template (§5 step 3). */
export function instantiateFromTemplate(
  schema: StorySchema,
  characterId: string,
  template: NpcTemplate
): CharacterHardState {
  return {
    characterId,
    isPlayer: false,
    templateId: template.templateId,
    attributes: attributeScores(schema, template.attributes),
    resources: resourceStates(schema, template.resources),
    skills: learnedSkills(template.skills),
    inventory: inventory(template.inventory),
    flags: {},
    alive: true,
  };
}

/** The median of the lethal resources' maxima (generic NPC hp), or 0 when stat-less. */
function medianLethalMax(schema: StorySchema): number {
  const maxima = schema.resources.filter((r) => r.lethal).map((r) => r.max).sort((a, b) => a - b);
  if (maxima.length === 0) return 0;
  const mid = Math.floor(maxima.length / 2);
  return maxima.length % 2 === 1 ? maxima[mid]! : Math.round((maxima[mid - 1]! + maxima[mid]!) / 2);
}

/**
 * Instantiate a generic NPC when no template matches (§5 step 3): only the lethal
 * resource(s), seeded to the median lethal max so a plain foe can still take and deal
 * damage. Valid proposed story skills are seeded at novice rank; inventory remains empty.
 */
export function instantiateGeneric(
  schema: StorySchema,
  characterId: string,
  proposedSkillIds: readonly string[] = []
): CharacterHardState {
  const hp = medianLethalMax(schema);
  const resources: CharacterHardState["resources"] = {};
  for (const def of schema.resources) {
    if (def.lethal) resources[def.id] = { current: hp, max: hp };
  }
  const knownSkillIds = new Set(schema.skills.map((skill) => skill.id));
  const skills: LearnedSkill[] = [...new Set(proposedSkillIds)]
    .filter((skillId) => knownSkillIds.has(skillId))
    .map((skillId) => ({ skillId, rank: "novice", successCount: 0 }));
  return {
    characterId,
    isPlayer: false,
    attributes: {},
    resources,
    skills,
    inventory: [],
    flags: {},
    alive: true,
  };
}
