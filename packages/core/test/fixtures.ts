/**
 * Test fixtures: a small but complete FROZEN story schema and character builders.
 * Shared across every engine suite. Validated through the real Zod schema so the
 * fixtures themselves stay honest.
 */
import {
  StorySchemaSchema,
  type StorySchema,
  type ActionDef,
  type CharacterHardState,
  type EffectSpec,
  type MasteryRank,
} from "../src/index.js";

/** A no-op effect (used to fill outcome-table slots that do nothing). */
const NONE = (hint: string): EffectSpec => ({ narrationHint: hint });

/** Damage effect: reduce target hp, scalable by a weapon's `damage` prop. */
const hitTarget = (hp: number, scale?: string): EffectSpec => ({
  resourceDeltaTarget: { hp: -hp },
  ...(scale ? { scaleByItemProp: scale } : {}),
  narrationHint: "a solid blow lands",
});

const actions: ActionDef[] = [
  {
    id: "attack_melee",
    category: "combat",
    label: "Attack (melee)",
    requiresSkill: "blade",
    requiresItemKind: "weapon",
    dc: 12,
    costs: { resources: { stamina: 2 } },
    effects: {
      crit_success: hitTarget(10, "damage"),
      success: hitTarget(4, "damage"),
      failure: NONE("the strike goes wide"),
      crit_failure: {
        resourceDeltaSelf: { hp: -2 },
        narrationHint: "the blade turns in your grip",
      },
    },
  },
  {
    id: "attack_wild",
    category: "combat",
    label: "Wild swing (no skill)",
    dc: 15,
    effects: {
      crit_success: hitTarget(6),
      success: hitTarget(3),
      failure: NONE("a clumsy miss"),
      crit_failure: NONE("you stumble"),
    },
  },
  {
    id: "duel",
    category: "combat",
    label: "Duel (opposed)",
    requiresSkill: "blade",
    requiresItemKind: "weapon",
    dc: 10,
    opposed: true,
    effects: {
      crit_success: hitTarget(12, "damage"),
      success: hitTarget(5, "damage"),
      failure: NONE("parried"),
      crit_failure: { resourceDeltaSelf: { hp: -3 }, narrationHint: "your guard fails" },
    },
  },
  {
    id: "pick_lock",
    category: "exploration",
    label: "Pick a lock",
    requiresSkill: "lockpicking",
    dc: 15,
    effects: {
      crit_success: { setFlag: { flagId: "door_open", value: true }, narrationHint: "silent" },
      success: { setFlag: { flagId: "door_open", value: true }, narrationHint: "the lock gives" },
      failure: NONE("the pick slips"),
      crit_failure: NONE("the pick snaps"),
    },
  },
  {
    id: "master_strike",
    category: "combat",
    label: "Master strike",
    requiresSkill: "blade",
    minRank: "expert",
    requiresItemKind: "weapon",
    dc: 8,
    effects: {
      crit_success: hitTarget(20, "damage"),
      success: hitTarget(12, "damage"),
      failure: NONE("even a master can miss"),
      crit_failure: NONE("overextended"),
    },
  },
  {
    id: "persuade",
    category: "social",
    label: "Persuade",
    requiresSkill: "silver_tongue",
    dc: 13,
    effects: {
      crit_success: { setFlag: { flagId: "ally", value: true }, narrationHint: "won over" },
      success: { setFlag: { flagId: "ally", value: true }, narrationHint: "they nod" },
      failure: NONE("they are unmoved"),
      crit_failure: NONE("you give offense"),
    },
  },
  {
    id: "brew_potion",
    category: "crafting",
    label: "Brew a potion",
    requiresSkill: "alchemy",
    dc: 12,
    costs: { items: [{ itemId: "herb", qty: 1 }] },
    effects: {
      crit_success: { grantItem: { itemId: "potion", qty: 2 }, narrationHint: "a potent brew" },
      success: { grantItem: { itemId: "potion", qty: 1 }, narrationHint: "it bubbles green" },
      failure: NONE("the mixture curdles"),
      crit_failure: NONE("a foul smoke"),
    },
  },
  {
    id: "search_room",
    category: "utility",
    label: "Search the room",
    dc: 10,
    effects: {
      crit_success: { grantItem: { itemId: "gold", qty: 5 }, narrationHint: "a hidden cache" },
      success: { grantItem: { itemId: "gold", qty: 1 }, narrationHint: "a few coins" },
      failure: NONE("nothing of use"),
      crit_failure: NONE("you knock something over"),
    },
  },
  {
    // Positive target delta scaled by an item prop (healing) — exercises the
    // additive branch of the resolver's item scaling.
    id: "mend_ally",
    category: "utility",
    label: "Mend an ally",
    requiresItemKind: "consumable",
    dc: 5,
    effects: {
      crit_success: { resourceDeltaTarget: { hp: 5 }, scaleByItemProp: "heal", narrationHint: "fully restored" },
      success: { resourceDeltaTarget: { hp: 3 }, scaleByItemProp: "heal", narrationHint: "wounds close" },
      failure: NONE("the salve does nothing"),
      crit_failure: NONE("you fumble the vial"),
    },
  },
  {
    // Requires a skill that is intentionally ABSENT from the skills table, so the
    // gate's "not learned" message falls back to the raw id.
    id: "phantom_rite",
    category: "utility",
    label: "Phantom rite",
    requiresSkill: "phantom",
    dc: 10,
    effects: {
      crit_success: NONE("the veil parts"),
      success: NONE("a cold breath"),
      failure: NONE("nothing answers"),
      crit_failure: NONE("something notices you"),
    },
  },
];

/** The canonical frozen fixture story. Runs through the real schema validator. */
export function makeStory(overrides: Partial<StorySchema> = {}): StorySchema {
  const story: StorySchema = {
    schemaVersion: 1,
    storyId: "story-fixture",
    title: "The Silent Vale",
    premise: "A test premise.",
    statMode: "full",
    resources: [
      { id: "hp", label: "Health", start: 20, max: 20, playerVisible: true, lethal: true },
      { id: "stamina", label: "Stamina", start: 10, max: 10, playerVisible: true },
    ],
    skills: [
      {
        id: "blade",
        name: "Blade",
        description: "Swordplay.",
        tier: "common",
        prerequisites: [],
        unlockPaths: [
          { method: "trainer", npcHint: "a swordmaster", cost: { items: [{ itemId: "gold", qty: 5 }] } },
        ],
        masteryAdvance: { successesPerRank: 3 },
      },
      {
        id: "lockpicking",
        name: "Lockpicking",
        description: "Open locks.",
        tier: "common",
        prerequisites: [],
        unlockPaths: [
          { method: "manual", itemId: "lockpick_manual" },
          // path index 1: learn from a trainer for a stamina (resource) fee.
          { method: "trainer", npcHint: "a fence", cost: { resources: { stamina: 4 } } },
        ],
        masteryAdvance: { successesPerRank: 2 },
      },
      {
        id: "silver_tongue",
        name: "Silver Tongue",
        description: "Persuasion.",
        tier: "common",
        prerequisites: [],
        unlockPaths: [{ method: "trial", flagId: "won_debate" }],
        masteryAdvance: { successesPerRank: 5 },
      },
      {
        id: "alchemy",
        name: "Alchemy",
        description: "Brewing.",
        tier: "common",
        prerequisites: [{ type: "skill", skillId: "lockpicking" }], // arbitrary prereq for tests
        unlockPaths: [
          { method: "trainer", npcHint: "an alchemist", cost: { items: [{ itemId: "gold", qty: 1 }] } },
        ],
        masteryAdvance: { successesPerRank: 3 },
      },
    ],
    items: [
      { id: "sword", name: "Iron Sword", description: "A blade.", kind: "weapon", tier: "common", props: { damage: 6 } },
      { id: "lockpick_manual", name: "Lockpicking Manual", description: "A how-to.", kind: "misc", tier: "common", props: {} },
      { id: "herb", name: "Herb", description: "For brewing.", kind: "misc", tier: "common", props: {} },
      { id: "potion", name: "Healing Potion", description: "Restores HP.", kind: "consumable", tier: "common", props: { heal: 10 } },
      { id: "gold", name: "Gold", description: "Currency.", kind: "misc", tier: "common", props: {} },
    ],
    tiers: [{ id: "common", label: "Common", minProgress: 0 }],
    actions,
    startingState: {
      resources: { hp: 20, stamina: 10 },
      skills: [{ skillId: "blade", rank: "novice" }],
      inventory: [{ itemId: "sword", qty: 1 }],
    },
    npcTemplates: [
      {
        templateId: "wight",
        name: "Grave-wight",
        resources: { hp: 12 },
        skills: [{ skillId: "blade", rank: "adept" }],
        inventory: [{ itemId: "sword", qty: 1 }],
      },
    ],
    locked: true,
    ...overrides,
  };
  return StorySchemaSchema.parse(story);
}

/** Build a player hard state, applying optional overrides. */
export function makePlayer(overrides: Partial<CharacterHardState> = {}): CharacterHardState {
  return {
    characterId: "kestrel",
    isPlayer: true,
    resources: { hp: { current: 20, max: 20 }, stamina: { current: 10, max: 10 } },
    skills: [{ skillId: "blade", rank: "novice", successCount: 0 }],
    inventory: [{ itemId: "sword", qty: 1 }],
    flags: {},
    alive: true,
    ...overrides,
  };
}

/** Build an NPC/enemy hard state (defaults to the grave-wight). */
export function makeEnemy(overrides: Partial<CharacterHardState> = {}): CharacterHardState {
  return {
    characterId: "wight",
    isPlayer: false,
    templateId: "wight",
    resources: { hp: { current: 12, max: 12 } },
    skills: [{ skillId: "blade", rank: "adept", successCount: 0 }],
    inventory: [{ itemId: "sword", qty: 1 }],
    flags: {},
    alive: true,
    ...overrides,
  };
}

/** Convenience: a learned-skill entry at a given rank. */
export function learned(skillId: string, rank: MasteryRank, successCount = 0) {
  return { skillId, rank, successCount };
}
