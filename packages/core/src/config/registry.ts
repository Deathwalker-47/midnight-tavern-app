import { z } from "zod";
import universalActionsJson from "./universal-actions.json";
import progressionJson from "./progression.json";
import equipmentLootJson from "./equipment-loot.json";
import attributeAdvancementJson from "./attribute-advancement.json";
import {
  ActionCategorySchema,
  AttributeAdvancementBandSchema,
  AttributeAdvancementSourceSchema,
  ItemKindSchema,
  ItemTierSchema,
  MasteryRankSchema,
  EquipmentSlotSchema,
  type ActionDef,
  type StorySchema,
} from "../types/index.js";

const UniversalActionConfigSchema = z.object({
  version: z.number().int().positive(),
  actions: z.array(
    z.object({
      id: z.string(),
      category: ActionCategorySchema,
      label: z.string(),
      description: z.string(),
      aliases: z.array(z.string()),
      defaultRequiresItemKind: ItemKindSchema.optional(),
      /** Whether deterministic classifier recovery must resolve a present character target. */
      requiresCharacterTarget: z.boolean(),
      /** Program-owned fallback damage when a generated attack omitted lethal-resource effects. */
      defaultTargetDamage: z
        .object({
          success: z.number().int().positive(),
          crit_success: z.number().int().positive(),
        })
        .optional(),
    })
  ),
}).superRefine((config, ctx) => {
  const ids = new Set<string>();
  config.actions.forEach((action, index) => {
    if (ids.has(action.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actions", index, "id"],
        message: `Duplicate universal action id ${action.id}.`,
      });
    }
    ids.add(action.id);
  });
  for (const category of ActionCategorySchema.options) {
    const count = config.actions.filter((action) => action.category === category).length;
    if (count < 6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["actions"],
        message: `Universal action category ${category} must define at least 6 families.`,
      });
    }
  }
});
export type UniversalActionConfig = z.infer<typeof UniversalActionConfigSchema>;

const ProgressionConfigSchema = z.object({
  version: z.number().int().positive(),
  ranks: z.array(
    z.object({
      rank: MasteryRankSchema,
      minimumXp: z.number().int().nonnegative(),
      modifier: z.number().int(),
    })
  ),
  outcomeBaseXp: z.object({
    crit_failure: z.number().int().nonnegative(),
    failure: z.number().int().nonnegative(),
    success: z.number().int().nonnegative(),
    crit_success: z.number().int().nonnegative(),
  }),
  challengeBands: z.array(
    z.object({
      maximumDc: z.number().int(),
      multiplier: z.number().positive(),
    })
  ),
  repetitionWindowTurns: z.number().int().positive(),
  repetitionMultipliers: z.array(z.number().min(0).max(1)).min(1),
  maximumAward: z.number().int().positive(),
}).superRefine((config, ctx) => {
  const expected = ["novice", "adept", "expert", "master"] as const;
  expected.forEach((rank, index) => {
    if (config.ranks[index]?.rank !== rank) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ranks", index],
        message: `Progression rank ${index} must be ${rank}.`,
      });
    }
    if (index > 0 && config.ranks[index]!.minimumXp <= config.ranks[index - 1]!.minimumXp) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ranks", index, "minimumXp"],
        message: "XP thresholds must increase strictly.",
      });
    }
  });
});
export type ProgressionConfig = z.infer<typeof ProgressionConfigSchema>;

const TierPolicySchema = z.object({
  maximumEffects: z.number().int().nonnegative(),
  maximumCheckBonus: z.number().int().nonnegative(),
  maximumAttributeBonus: z.number().int().nonnegative(),
  requiresMilestone: z.boolean(),
});

const EquipmentLootConfigSchema = z.object({
  version: z.number().int().positive(),
  slots: z.array(EquipmentSlotSchema).length(7),
  tiers: z.object({
    common: TierPolicySchema,
    uncommon: TierPolicySchema,
    rare: TierPolicySchema,
    legendary: TierPolicySchema,
    mythical: TierPolicySchema,
  }),
  loot: z.object({
    maximumItemsPerEncounter: z.number().int().min(1).max(5),
    routineMaximumTier: z.object({
      combat: ItemTierSchema,
      non_combat: ItemTierSchema,
      milestone: ItemTierSchema,
      quest: ItemTierSchema,
    }),
    mythicalRequiresExplicitAuthorization: z.boolean(),
  }),
}).superRefine((config, ctx) => {
  if (new Set(config.slots).size !== 7) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["slots"],
      message: "The universal loadout must contain seven unique slots.",
    });
  }
});
export type EquipmentLootConfig = z.infer<typeof EquipmentLootConfigSchema>;

const AdvancementTriggerPolicySchema = z.object({
  minimumEvidence: z.number().int().positive(),
  minimumDistinctTurns: z.number().int().positive(),
  minimumTurnSpan: z.number().int().nonnegative(),
  minimumHighStakesEvidence: z.number().int().nonnegative(),
  checkBonus: z.number().int().nonnegative(),
});

const AttributeAdvancementConfigSchema = z
  .object({
    version: z.number().int().positive(),
    bands: z.array(
      z.object({
        id: AttributeAdvancementBandSchema,
        minimumScore: z.number().int().min(1).max(19),
        maximumScore: z.number().int().min(1).max(19),
        dc: z.number().int().min(1).max(30),
        cooldownTurns: z.number().int().nonnegative(),
      })
    ),
    triggers: z.record(
      AttributeAdvancementSourceSchema,
      AdvancementTriggerPolicySchema
    ),
    highStakesMinimumDc: z.number().int().positive(),
    exceptionalActionMinimumDc: z.number().int().positive(),
    exceptionalResourceDeltaMinimum: z.number().positive(),
    recentEvidenceTurns: z.number().int().positive(),
    maximumEvidenceRefs: z.number().int().positive(),
    maximumApprovalsPerCharacterWindow: z.number().int().positive(),
    approvalWindowTurns: z.number().int().positive(),
    maximumApprovalsPerTurn: z.number().int().positive(),
    maximumEvidenceBonus: z.number().int().nonnegative(),
  })
  .superRefine((config, ctx) => {
    const expected = [
      { id: "easy", minimumScore: 1, maximumScore: 5 },
      { id: "normal", minimumScore: 6, maximumScore: 9 },
      { id: "moderate", minimumScore: 10, maximumScore: 13 },
      { id: "hard", minimumScore: 14, maximumScore: 17 },
      { id: "near_impossible", minimumScore: 18, maximumScore: 19 },
    ] as const;
    expected.forEach((band, index) => {
      const actual = config.bands[index];
      if (
        !actual ||
        actual.id !== band.id ||
        actual.minimumScore !== band.minimumScore ||
        actual.maximumScore !== band.maximumScore
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["bands", index],
          message: `Attribute advancement band ${index} must be ${band.id} (${band.minimumScore}-${band.maximumScore}).`,
        });
      }
      if (index > 0 && actual && actual.dc <= config.bands[index - 1]!.dc) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["bands", index, "dc"],
          message: "Attribute advancement DCs must increase with score.",
        });
      }
    });
  });
export type AttributeAdvancementConfig = z.infer<
  typeof AttributeAdvancementConfigSchema
>;

export const UNIVERSAL_ACTIONS_CONFIG = Object.freeze(
  UniversalActionConfigSchema.parse(universalActionsJson)
);
export const PROGRESSION_CONFIG = Object.freeze(ProgressionConfigSchema.parse(progressionJson));
export const EQUIPMENT_LOOT_CONFIG = Object.freeze(
  EquipmentLootConfigSchema.parse(equipmentLootJson)
);
export const ATTRIBUTE_ADVANCEMENT_CONFIG = Object.freeze(
  AttributeAdvancementConfigSchema.parse(attributeAdvancementJson)
);

// Versions snapshotted into a story rulebook for reproducible mechanics.
export const MECHANICS_CONFIG_VERSIONS = Object.freeze({
  universalActions: UNIVERSAL_ACTIONS_CONFIG.version,
  progression: PROGRESSION_CONFIG.version,
  equipmentLoot: EQUIPMENT_LOOT_CONFIG.version,
  attributeAdvancement: ATTRIBUTE_ADVANCEMENT_CONFIG.version,
});

function normalizePhrase(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function findUniversalAction(id: string) {
  return UNIVERSAL_ACTIONS_CONFIG.actions.find((action) => action.id === id);
}

/**
 * Install program-owned minimum damage for generated attack families that omitted it.
 * Explicit negative lethal-resource effects always win; this only repairs a mechanically empty
 * attack so old frozen stories and newly generated rulebooks share the same death contract.
 */
export function applyUniversalActionDefaults(schema: StorySchema): StorySchema {
  if (schema.statMode !== "full") return schema;
  const lethalId = schema.resources.find((resource) => resource.lethal)?.id;
  if (!lethalId) return schema;

  const hasGateLegalNaturalAttack = schema.actions.some(
    (action) =>
      action.universalFamily === "attack_natural" &&
      !action.requiresSkill &&
      !action.requiresItemKind &&
      !action.requiresEquipmentEnabler &&
      !action.costs
  );
  const naturalAttack: ActionDef = {
    id: "universal_natural_attack",
    category: "combat",
    label: "Natural attack",
    description: "Strike a nearby character with the actor's body or innate natural weapon.",
    aliases: ["punch", "kick", "bite", "claw", "gore", "slam"],
    universalFamily: "attack_natural",
    dc: 10,
    effects: {
      crit_success: { narrationHint: "The natural attack lands with devastating force." },
      success: { narrationHint: "The natural attack lands cleanly." },
      failure: { narrationHint: "The natural attack misses its target." },
      crit_failure: { narrationHint: "The attacker overextends and loses position." },
    },
  };
  let changed = !hasGateLegalNaturalAttack;
  const sourceActions = hasGateLegalNaturalAttack
    ? schema.actions
    : [...schema.actions, naturalAttack];
  const actions = sourceActions.map((action) => {
    const family = action.universalFamily
      ? findUniversalAction(action.universalFamily)
      : undefined;
    if (!family?.defaultTargetDamage) return action;

    const effects = { ...action.effects };
    let actionChanged = false;
    for (const outcome of ["success", "crit_success"] as const) {
      const current = effects[outcome];
      const existingDamage = current.resourceDeltaTarget?.[lethalId];
      if (typeof existingDamage === "number" && existingDamage < 0) continue;
      effects[outcome] = {
        ...current,
        resourceDeltaTarget: {
          ...(current.resourceDeltaTarget ?? {}),
          [lethalId]: -family.defaultTargetDamage[outcome],
        },
      };
      changed = true;
      actionChanged = true;
    }
    return actionChanged ? { ...action, effects } : action;
  });

  if (!changed) return schema;
  return {
    ...schema,
    actions,
    mechanicsConfigVersions: {
      ...(schema.mechanicsConfigVersions ?? MECHANICS_CONFIG_VERSIONS),
      universalActions: UNIVERSAL_ACTIONS_CONFIG.version,
    },
  };
}

/**
 * Matches natural action wording against the versioned universal-action aliases.
 *
 * @param phrase - Player phrase or normalized action label.
 * @returns The first deterministic universal-action match, or undefined.
 *
 * @remarks The registry has no fixed action-count limit; aliases are data upgrades.
 * @see {@link findUniversalAction} for exact ID lookup.
 * @since 0.1.0
 */
export function matchUniversalAction(phrase: string) {
  const normalized = normalizePhrase(phrase);
  if (!normalized) return undefined;
  const padded = ` ${normalized} `;
  return UNIVERSAL_ACTIONS_CONFIG.actions.find((action) => {
    if (normalizePhrase(action.id) === normalized || normalizePhrase(action.label) === normalized) {
      return true;
    }
    return action.aliases.some((alias) => {
      const candidate = normalizePhrase(alias);
      return normalized === candidate || padded.includes(` ${candidate} `);
    });
  });
}
