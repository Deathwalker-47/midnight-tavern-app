/**
 * Turn-level event types (low-level-plan §2.5, §2.6).
 *
 * - MechanicalIntent — one attempted catalog action (classifier output element,
 *   engine input).
 * - ClassifiedTurn — the classifier's full output for a player message (D4).
 * - Ruling — the engine's authoritative resolution record, persisted per turn and
 *   fed to the narrator as fact.
 */
import { z } from "zod";
import { OutcomeSchema, EffectSpecSchema, RollModeSchema } from "./actions.js";
import { CostSpecSchema } from "./schema.js";
import { DifficultySnapshotSchema } from "./difficulty.js";
import { ItemTierSchema } from "./equipment.js";

/**
 * One attempted action mapped onto the catalog. `actionId` MUST be a catalog id
 * (the classifier builds a per-story Zod enum so it physically cannot emit an
 * unknown action — M4).
 */
export const MechanicalIntentSchema = z.object({
  actorId: z.string(),
  actionId: z.string(), // catalog id, or LEARN_SKILL_ACTION_ID
  targetId: z.string().optional(),
  itemId: z.string().optional(), // item used, if relevant
  skillId: z.string().optional(), // for learn_skill: which skill to unlock
  /**
   * Scene-grounded reason this attempt is uncertain. Older persisted/provider
   * payloads may omit it; the resolver treats omission conservatively as a roll.
   */
  stakes: z
    .enum(["none", "uncertain", "danger", "opposed", "time_pressure", "scarcity"])
    .optional(),
  stakesReason: z.string().optional(),
  confidence: z.number().min(0).max(1), // < 0.6 ⇒ treat as narration, note ambiguity
});
export type MechanicalIntent = z.infer<typeof MechanicalIntentSchema>;

/** The classifier's full output for one player message (D4). */
export const ClassifiedTurnSchema = z.object({
  playerIntents: z.array(MechanicalIntentSchema), // [] ⇒ narration_only
  npcIntents: z.array(MechanicalIntentSchema), // actions the fiction implies NPCs take (D7)
  freeText: z.string(), // residual narration content
});
export type ClassifiedTurn = z.infer<typeof ClassifiedTurnSchema>;

/** The dice component of a ruling (absent when the gate denies the action). */
export const RollRecordSchema = z.object({
  d20: z.number().int().min(1).max(20),
  dice: z.array(z.number().int().min(1).max(20)).min(1).max(2).optional(),
  usedIndex: z.number().int().min(0).max(1).optional(),
  natural: z.number().int().min(1).max(20).optional(),
  rollMode: RollModeSchema.optional(),
  advantageSources: z.array(z.string()).optional(),
  disadvantageSources: z.array(z.string()).optional(),
  modifier: z.number().int(),
  attributeId: z.string().optional(),
  attributeScore: z.number().int().optional(),
  attributeModifier: z.number().int().optional(),
  masterySkillId: z.string().optional(),
  masteryModifier: z.number().int().optional(),
  equipmentAttributeBonus: z.number().int().optional(),
  equipmentModifier: z.number().int().optional(),
  total: z.number().int(),
  dc: z.number().int(),
  dcBase: z.number().int().optional(),
  dcEffective: z.number().int().optional(),
  outcome: OutcomeSchema,
  // Populated for opposed contests: the defender's roll (§ resolver, D-opposed).
  opposedD20: z.number().int().min(1).max(20).optional(),
  opposedDice: z.array(z.number().int().min(1).max(20)).min(1).max(2).optional(),
  opposedUsedIndex: z.number().int().min(0).max(1).optional(),
  opposedNatural: z.number().int().min(1).max(20).optional(),
  opposedRollMode: RollModeSchema.optional(),
  opposedAdvantageSources: z.array(z.string()).optional(),
  opposedDisadvantageSources: z.array(z.string()).optional(),
  opposedModifier: z.number().int().optional(),
  opposedTotal: z.number().int().optional(),
  opposedAttributeScore: z.number().int().optional(),
  opposedAttributeModifier: z.number().int().optional(),
  opposedMasteryModifier: z.number().int().optional(),
  opposedEquipmentAttributeBonus: z.number().int().optional(),
  opposedEquipmentModifier: z.number().int().optional(),
});
export type RollRecord = z.infer<typeof RollRecordSchema>;

/** The gate verdict, computed BEFORE any roll. */
export const GateVerdictSchema = z.object({
  allowed: z.boolean(),
  reason: z.string().optional(), // present when denied
  code: z
    .enum([
      "schema_unlocked",
      "unknown_action",
      "actor_dead",
      "skill_required",
      "rank_required",
      "item_required",
      "cannot_afford",
      "prerequisite_failed",
      "action_budget_exceeded",
    ])
    .optional(),
});
export type GateVerdict = z.infer<typeof GateVerdictSchema>;

/** A mastery advancement that occurred as part of a ruling. */
export const MasteryAdvanceSchema = z.object({
  skillId: z.string(),
  fromRank: z.string(),
  toRank: z.string(),
});
export type MasteryAdvance = z.infer<typeof MasteryAdvanceSchema>;

export const XpAwardSchema = z.object({
  skillId: z.string(),
  amount: z.number().int().nonnegative(),
  previousXp: z.number().int().nonnegative(),
  newXp: z.number().int().nonnegative(),
  rankBefore: z.string(),
  rankAfter: z.string(),
  reason: z.string(),
});
export type XpAward = z.infer<typeof XpAwardSchema>;

export const DamageAdjustmentSchema = z.object({
  characterId: z.string(),
  resourceId: z.string(),
  baseDelta: z.number(),
  multiplier: z.number().positive(),
  scaledDelta: z.number(),
});
export type DamageAdjustment = z.infer<typeof DamageAdjustmentSchema>;

export const ActionBudgetRefusalSchema = z.object({
  actionIndex: z.number().int().nonnegative(),
  actionId: z.string().optional(),
  actionText: z.string().optional(),
  code: z.literal("action_budget_exceeded"),
  limit: z.number().int().min(1).max(5),
  reason: z.string(),
});
export type ActionBudgetRefusal = z.infer<typeof ActionBudgetRefusalSchema>;

export const LootRulingSchema = z.object({
  itemInstanceId: z.string(),
  itemDefinitionId: z.string(),
  ownerCharacterId: z.string(),
  name: z.string(),
  tier: ItemTierSchema,
  quantity: z.number().int().positive(),
  provenanceSummary: z.string(),
  description: z.string().optional(),
  effects: z.array(z.unknown()).optional(),
  eligibleSlots: z.array(z.string()).optional(),
  requirement: z.string().optional(),
});
export type LootRuling = z.infer<typeof LootRulingSchema>;

/**
 * The engine's authoritative resolution record (persisted as `rulings.ruling_json`).
 * `effectsApplied` is exactly what the ledger committed — never what prose says.
 */
export const RulingSchema = z.object({
  turnId: z.string(),
  /** Narrator message this ruling causally precedes; attached when the exchange commits. */
  messageId: z.string().optional(),
  actorId: z.string(),
  actionId: z.string(),
  actionLabel: z.string().optional(),
  targetId: z.string().optional(),
  gate: GateVerdictSchema, // gate verdict BEFORE any roll
  roll: RollRecordSchema.optional(), // absent when denied
  effectsApplied: EffectSpecSchema.nullable(), // exactly what the ledger committed
  costsPaid: CostSpecSchema.optional(),
  masteryAdvance: MasteryAdvanceSchema.optional(),
  xpAward: XpAwardSchema.optional(),
  difficulty: DifficultySnapshotSchema.optional(),
  damageAdjustments: z.array(DamageAdjustmentSchema).optional(),
  loot: z.array(LootRulingSchema).optional(),
  // True when a lethal resource hit 0 as a result of this ruling (target or self).
  causedDeathOf: z.array(z.string()).optional(),
});
export type Ruling = z.infer<typeof RulingSchema>;
