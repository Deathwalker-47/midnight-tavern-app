/**
 * Action Catalog (low-level-plan §2.2, D2 + D3) — the heart of the gate.
 *
 * The frozen schema contains a maximal, all-predefined catalog covering combat,
 * social, exploration, crafting, and utility. Anything not in the catalog resolves
 * as pure narration (no roll, no state change). Every action carries its DC(s)
 * pre-assigned at bootstrap (D2); no model assigns difficulty at runtime.
 */
import { z } from "zod";
import { CostSpecSchema, ItemKindSchema, MasteryRankSchema } from "./primitives.js";
import { ConditionWithReasonSchema } from "./conditions.js";

export const ActionCategorySchema = z.enum([
  "combat",
  "social",
  "exploration",
  "crafting",
  "utility",
]);
export type ActionCategory = z.infer<typeof ActionCategorySchema>;

/** The four graded outcomes of a resolved action. */
export const OutcomeSchema = z.enum(["crit_success", "success", "failure", "crit_failure"]);
export type Outcome = z.infer<typeof OutcomeSchema>;

export const RollModeSchema = z.enum(["normal", "advantage", "disadvantage"]);
export type RollMode = z.infer<typeof RollModeSchema>;

/**
 * A timed status an outcome applies (plan 08 §4 durations): a named buff, debuff, poison or
 * regeneration lasting the next `durationTurns` turns. Bounded so generated content stays sane.
 * `resourcePerTurn` keys may be a resource id or a core role ("health").
 */
export const StatusEffectSpecSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/).max(40),
  label: z.string().trim().min(1).max(40),
  durationTurns: z.number().int().min(1).max(10),
  checkBonus: z.number().int().min(-5).max(5).optional(),
  attributeBonus: z.record(z.string(), z.number().int().min(-5).max(5)).optional(),
  resourcePerTurn: z.record(z.string(), z.number().int().min(-20).max(20)).optional(),
});
export type StatusEffectSpec = z.infer<typeof StatusEffectSpecSchema>;

/**
 * A deterministic outcome effect. The narrationHint guides the narrator but is
 * never itself truth — the ledger applies the mechanical fields.
 */
export const EffectSpecSchema = z.object({
  resourceDeltaSelf: z.record(z.string(), z.number()).optional(), // applied to actor
  resourceDeltaTarget: z.record(z.string(), z.number()).optional(), // applied to target
  attributeDeltaSelf: z.record(z.string(), z.number()).optional(),
  attributeDeltaTarget: z.record(z.string(), z.number()).optional(),
  scaleByItemProp: z.string().optional(), // e.g. "damage" — scale target delta by item prop
  grantItem: z.object({ itemId: z.string(), qty: z.number().int() }).optional(),
  setFlag: z.object({ flagId: z.string(), value: z.boolean() }).optional(),
  statusSelf: StatusEffectSpecSchema.optional(), // timed status on the actor
  statusTarget: StatusEffectSpecSchema.optional(), // timed status on the target
  narrationHint: z.string(), // guidance for the narrator, not truth
});
export type EffectSpec = z.infer<typeof EffectSpecSchema>;

/** A full outcome table: one EffectSpec per outcome. */
export const OutcomeEffectsSchema = z.object({
  crit_success: EffectSpecSchema,
  success: EffectSpecSchema,
  failure: EffectSpecSchema,
  crit_failure: EffectSpecSchema,
});
export type OutcomeEffects = z.infer<typeof OutcomeEffectsSchema>;

/** A single catalog action. */
export const ActionDefSchema = z.object({
  id: z.string(), // "attack_melee", "persuade", "pick_lock", "craft_item", ...
  category: ActionCategorySchema,
  label: z.string(),
  /** Player- and classifier-facing definition of the action's exact meaning. */
  description: z.string().optional(),
  /** Natural-language spellings which map to this frozen action. */
  aliases: z.array(z.string()).optional(),
  /** Stable universal family specialized by this story action. */
  universalFamily: z.string().optional(),
  governingAttribute: z.string().optional(),
  requiresSkill: z.string().optional(), // gate: must be learned
  minRank: MasteryRankSchema.optional(), // gate: advanced-use threshold
  requiresItemKind: ItemKindSchema.optional(), // e.g. attack_melee needs a weapon
  /** Action exists in the rulebook but remains gated until equipped gear enables it. */
  requiresEquipmentEnabler: z.boolean().optional(),
  dc: z.number().int(), // D2: pre-assigned difficulty (5–25 scale)
  opposed: z.boolean().optional(), // if true, contest vs target's roll instead of flat DC
  advantageWhen: z.array(ConditionWithReasonSchema).max(2).optional(),
  disadvantageWhen: z.array(ConditionWithReasonSchema).max(2).optional(),
  costs: CostSpecSchema.optional(), // paid on ATTEMPT (win or lose); keys may name a core role
  /**
   * Turns the actor must wait before using this action again (plan 08 §4). Starts on the attempt,
   * win or lose: 1 blocks the next turn, 2 the next two.
   */
  cooldownTurns: z.number().int().min(0).max(20).optional(),
  effects: OutcomeEffectsSchema, // deterministic outcome table
});
export type ActionDef = z.infer<typeof ActionDefSchema>;

/**
 * The special catalog action id the classifier emits when the player attempts to
 * learn a skill; the orchestrator routes it to `tryUnlock` rather than the resolver
 * (M2 step 5). Not a normal ActionDef — it has no DC or effects table.
 */
export const LEARN_SKILL_ACTION_ID = "learn_skill";

/** Catalog-shape invariants the bootstrapper must satisfy (§2.2). */
export const CATALOG_MIN_ACTIONS = 30;
export const CATALOG_MIN_PER_CATEGORY = 6;
export const DC_MIN = 5; // trivial
export const DC_MAX = 25; // near-impossible
