/**
 * Leaf primitives shared by both the frozen schema (schema.ts) and the action
 * catalog (actions.ts). Kept in their own module to break the schema↔actions import
 * cycle: both depend on these, neither depends on the other for them.
 */
import { z } from "zod";

/** The two final v5 stat systems. `light` is accepted only by legacy migration code. */
export const StatModeSchema = z.enum(["none", "full"]);
export type StatMode = z.infer<typeof StatModeSchema>;

/** Pre-v5 persisted value. Never use this for a live story. */
export const LegacyStatModeSchema = z.literal("light");
export type LegacyStatMode = z.infer<typeof LegacyStatModeSchema>;

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

/**
 * The seven broad item kinds every rulebook and save has used since v1. They stay valid kinds of
 * their own — a generic "weapon" — and are also the families the finer kinds below belong to.
 */
export const BASE_ITEM_KINDS = ["weapon", "armor", "accessory", "consumable", "tool", "key", "misc"] as const;
export type BaseItemKind = (typeof BASE_ITEM_KINDS)[number];

/**
 * Finer item kinds (plan 09 §8.1), each in one broad family. Engineering-authored: the owner's
 * category list was lost (action plan, correction 6).
 */
export const FINE_ITEM_KIND_BASE = {
  melee_weapon: "weapon",
  ranged_weapon: "weapon",
  shield: "armor",
  clothing: "armor",
  jewelry: "accessory",
  focus: "accessory",
  potion: "consumable",
  food: "consumable",
  medicine: "consumable",
  scroll: "consumable",
  ammunition: "consumable",
  kit: "tool",
  instrument: "tool",
  device: "tool",
  document: "key",
  material: "misc",
  treasure: "misc",
} as const satisfies Record<string, BaseItemKind>;

/** Item / equipment kind: a broad family, or a finer kind within one. */
export const ItemKindSchema = z.enum([
  ...BASE_ITEM_KINDS,
  ...(Object.keys(FINE_ITEM_KIND_BASE) as (keyof typeof FINE_ITEM_KIND_BASE)[]),
]);
export type ItemKind = z.infer<typeof ItemKindSchema>;

/** The broad family an item kind belongs to ("melee_weapon" → "weapon"; "weapon" → itself). */
export function baseItemKind(kind: ItemKind): BaseItemKind {
  return kind in FINE_ITEM_KIND_BASE ? FINE_ITEM_KIND_BASE[kind as keyof typeof FINE_ITEM_KIND_BASE] : (kind as BaseItemKind);
}

/**
 * Whether an item of kind `held` meets a requirement for kind `required`. A broad requirement
 * ("weapon") accepts every kind in its family; a fine requirement ("ranged_weapon") accepts that
 * kind, or a generic item of its family — so items written before the finer kinds keep working.
 */
export function itemKindSatisfies(held: ItemKind, required: ItemKind): boolean {
  if (held === required) return true;
  const family = baseItemKind(required);
  return required === family ? baseItemKind(held) === family : held === family;
}

/**
 * What consuming one of an item restores, by core resource role (plan 08 §5). Only items carrying
 * it can be used by the engine's `consume_item` action; amounts are clamped at use.
 */
export const ItemRestoresSchema = z
  .object({
    health: z.number().int().min(1).optional(),
    stamina: z.number().int().min(1).optional(),
    mana: z.number().int().min(1).optional(),
  });
export type ItemRestores = z.infer<typeof ItemRestoresSchema>;

/** What an attempt costs (paid on attempt, win or lose). */
export const CostSpecSchema = z.object({
  resources: z.record(z.string(), z.number()).optional(),
  items: z.array(z.object({ itemId: z.string(), qty: z.number().int() })).optional(),
});
export type CostSpec = z.infer<typeof CostSpecSchema>;
