/**
 * Leaf primitives shared by both the frozen schema (schema.ts) and the action
 * catalog (actions.ts). Kept in their own module to break the schema↔actions import
 * cycle: both depend on these, neither depends on the other for them.
 */
import { z } from "zod";

/** Whether a story uses no, light, or full mechanical stats. */
export const StatModeSchema = z.enum(["none", "light", "full"]);
export type StatMode = z.infer<typeof StatModeSchema>;

/**
 * A learned skill's mastery rank. The rank supplies the d20 modifier (D1) and
 * can gate advanced uses.
 */
export const MasteryRankSchema = z.enum(["novice", "adept", "expert", "master"]);
export type MasteryRank = z.infer<typeof MasteryRankSchema>;

/** d20 modifier supplied by each mastery rank (D1). */
export const MASTERY_MOD: Record<MasteryRank, number> = {
  novice: 1,
  adept: 3,
  expert: 5,
  master: 7,
};

/** Rank ordering, low → high, for `minRank` comparisons. */
export const MASTERY_ORDER: MasteryRank[] = ["novice", "adept", "expert", "master"];

/** True if `rank` is at least `min` in the mastery order. */
export function rankAtLeast(rank: MasteryRank, min: MasteryRank): boolean {
  return MASTERY_ORDER.indexOf(rank) >= MASTERY_ORDER.indexOf(min);
}

/** Item / equipment kind. */
export const ItemKindSchema = z.enum(["weapon", "armor", "consumable", "tool", "key", "misc"]);
export type ItemKind = z.infer<typeof ItemKindSchema>;

/** What an attempt costs (paid on attempt, win or lose). */
export const CostSpecSchema = z.object({
  resources: z.record(z.string(), z.number()).optional(),
  items: z.array(z.object({ itemId: z.string(), qty: z.number().int() })).optional(),
});
export type CostSpec = z.infer<typeof CostSpecSchema>;
