import { z } from "zod";
import universalActionsJson from "./universal-actions.json";
import progressionJson from "./progression.json";
import equipmentLootJson from "./equipment-loot.json";
import {
  ActionCategorySchema,
  ItemKindSchema,
  ItemTierSchema,
  MasteryRankSchema,
  EquipmentSlotSchema,
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

export const UNIVERSAL_ACTIONS_CONFIG = Object.freeze(
  UniversalActionConfigSchema.parse(universalActionsJson)
);
export const PROGRESSION_CONFIG = Object.freeze(ProgressionConfigSchema.parse(progressionJson));
export const EQUIPMENT_LOOT_CONFIG = Object.freeze(
  EquipmentLootConfigSchema.parse(equipmentLootJson)
);

// Versions snapshotted into a story rulebook for reproducible mechanics.
export const MECHANICS_CONFIG_VERSIONS = Object.freeze({
  universalActions: UNIVERSAL_ACTIONS_CONFIG.version,
  progression: PROGRESSION_CONFIG.version,
  equipmentLoot: EQUIPMENT_LOOT_CONFIG.version,
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
