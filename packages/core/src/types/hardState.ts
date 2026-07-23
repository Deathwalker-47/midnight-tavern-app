/**
 * Hard state (low-level-plan §2.3) — the authoritative mechanical ledger.
 *
 * Sole writer: the mechanics engine (via `ledger.commit`). Persisted per character
 * as `characters.hard_json`. Contains no narrative fields.
 */
import { z } from "zod";
import { MasteryRankSchema } from "./schema.js";
import { EquipmentAssignmentSchema } from "./equipment.js";

/** A single tracked resource's current value and ceiling. */
export const ResourceStateSchema = z.object({
  current: z.number(),
  max: z.number(),
});
export type ResourceState = z.infer<typeof ResourceStateSchema>;

/** A learned skill with its rank and progress toward the next rank. */
export const LearnedSkillSchema = z.object({
  skillId: z.string(),
  rank: MasteryRankSchema,
  successCount: z.number().int().nonnegative(), // resets on rank-up
  /** Cumulative XP; absent on legacy hard-state rows and treated as zero. */
  xp: z.number().int().nonnegative().optional(),
});
export type LearnedSkill = z.infer<typeof LearnedSkillSchema>;

/** A stack of one item kind in inventory. */
export const InventoryEntrySchema = z.object({
  itemId: z.string(),
  /** Present for runtime loot instances; absent on legacy catalog stacks. */
  instanceId: z.string().optional(),
  qty: z.number().int().nonnegative(),
});
export type InventoryEntry = z.infer<typeof InventoryEntrySchema>;

/** A character's complete authoritative mechanical state. */
export const CharacterHardStateSchema = z.object({
  characterId: z.string(),
  isPlayer: z.boolean(),
  templateId: z.string().optional(), // for NPCs instantiated from an NpcTemplate
  attributes: z.record(z.string(), z.number().int().min(0)).default({}),
  resources: z.record(z.string(), ResourceStateSchema),
  skills: z.array(LearnedSkillSchema),
  inventory: z.array(InventoryEntrySchema),
  equipment: z.array(EquipmentAssignmentSchema).optional(),
  flags: z.record(z.string(), z.boolean()),
  alive: z.boolean(),
});
export type CharacterHardState = z.infer<typeof CharacterHardStateSchema>;
