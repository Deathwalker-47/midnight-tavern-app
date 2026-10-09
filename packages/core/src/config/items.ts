/**
 * Universal item archetypes (plan 09 §8.1) — engine-owned mechanical shapes for runtime loot.
 *
 * Loot is proposed by a model, so its numbers are untrusted. An archetype fixes everything
 * mechanical about an item of its shape — kind, slots, hands, swing stamina, weapon damage and what a
 * consumable restores — with numeric props given per tier. The model picks an archetype and writes
 * the flavour (name, description) plus any bonus effects, which the tier caps in
 * `equipment-loot.json` still bound. `finalizeLootProposal` applies the archetype; a finalized
 * definition snapshots the numbers, so retuning this file never changes an item already found.
 *
 * Runtime only: this does NOT revive the legacy forge-time `StorySchema.items` catalogue.
 */
import { z } from "zod";
import itemsJson from "./universal-items.json";
import { EquipmentSlotSchema, ItemKindSchema } from "../types/index.js";

/** One number per tier, common → mythical. */
export const TierLadderSchema = z
  .object({
    common: z.number().int().min(0),
    uncommon: z.number().int().min(0),
    rare: z.number().int().min(0),
    legendary: z.number().int().min(0),
    mythical: z.number().int().min(0),
  })
  .strict();
export type TierLadder = z.infer<typeof TierLadderSchema>;

export const ItemArchetypeSchema = z
  .object({
    id: z.string().regex(/^item\.[a-z0-9_]+\.[a-z0-9_]+$/),
    kind: ItemKindSchema,
    /** A generic label for the shape ("Heavy weapon"), shown to the model and auditors. */
    label: z.string().min(1).max(40),
    /** What fits the shape, for the model choosing one. */
    description: z.string().min(1).max(160),
    slots: z.array(EquipmentSlotSchema).max(7),
    handsRequired: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    /** Stamina per swing for weapons (plan 08 §3). */
    staminaCost: z.number().int().min(0).max(10).optional(),
    /** Numeric props by tier — `damage` is the bonus a weapon adds to a hit. */
    props: z.record(z.string().regex(/^[a-z_]+$/), TierLadderSchema).optional(),
    /** What one use restores, by core pool role and tier (consumables only). */
    restores: z
      .object({
        health: TierLadderSchema.optional(),
        stamina: TierLadderSchema.optional(),
        mana: TierLadderSchema.optional(),
      })
      .strict()
      .optional(),
    stackingKey: z.string().regex(/^[a-z0-9_]+$/).optional(),
    tags: z.array(z.string().regex(/^[a-z0-9_]+$/)).min(1),
  })
  .strict();
export type ItemArchetype = z.infer<typeof ItemArchetypeSchema>;

export const UniversalItemsSchema = z
  .object({
    version: z.number().int().positive(),
    archetypes: z.array(ItemArchetypeSchema).min(1),
  })
  .strict();
export type UniversalItems = z.infer<typeof UniversalItemsSchema>;

export const UNIVERSAL_ITEMS: Readonly<UniversalItems> = Object.freeze(UniversalItemsSchema.parse(itemsJson));
