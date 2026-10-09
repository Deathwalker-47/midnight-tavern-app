/**
 * The universal pool (plan 09 §4, §4b) — every action and skill the product knows about, as shipped,
 * versioned config. Two files:
 *
 *   - `universal-archetypes.json` owns the MECHANICS. An archetype is story-agnostic: it names
 *     attributes and pools by role, and expresses harm and healing as multiples of the story's
 *     baseline hit, so one archetype fits every story's numbers.
 *   - `universal-pool.json` owns the FLAVOUR. An entry is a name, a description, aliases and tags
 *     pointing at one archetype. It carries no mechanics of its own — not even a tier — so entries
 *     that share an archetype are mechanically identical by construction (plan 09 §4.5 symmetry).
 *
 * Entries are materialized into a story's rulebook only when the story enables them (plan 09 §3);
 * the pool itself is never sent to a model at runtime. Ids are permanent: an id persisted in an
 * enablement set or a frozen rulebook may never be reused or repurposed.
 *
 * This module only parses and indexes; `poolRules.ts` holds the balance rules (§4.5).
 */
import { z } from "zod";
import archetypesJson from "./universal-archetypes.json";
import poolJson from "./universal-pool.json";
import {
  ActionCategorySchema,
  ActionTargetingSchema,
  ItemKindSchema,
  ItemTierSchema,
} from "../types/index.js";

const SNAKE = /^[a-z0-9_]+$/;

/**
 * What an attribute is FOR, so a story-agnostic archetype can name "the story's charm stat" and the
 * enablement step can resolve it to a real attribute (e.g. presence → "Charisma", "Allure", "Will").
 */
export const AttributeRoleSchema = z.enum([
  "might",
  "agility",
  "endurance",
  "intellect",
  "insight",
  "presence",
  "magic",
]);
export type AttributeRole = z.infer<typeof AttributeRoleSchema>;

/** The difficulty word an archetype claims; its DC must sit in the word's band. */
export const DifficultyWordSchema = z.enum(["trivial", "standard", "hard", "extreme"]);
export type DifficultyWord = z.infer<typeof DifficultyWordSchema>;

/** Which story settings an entry plausibly belongs to; drives forge-time relevance filtering. */
export const SettingFitSchema = z.enum([
  "any",
  "fantasy",
  "historical",
  "modern",
  "scifi",
  "horror",
  "post_apocalyptic",
]);
export type SettingFit = z.infer<typeof SettingFitSchema>;

/** Pools other than health, by role, as small flat amounts. */
const PoolAmountsSchema = z
  .object({
    mana: z.number().int().min(-20).max(20).optional(),
    stamina: z.number().int().min(-20).max(20).optional(),
  })
  .strict();

/** A timed status in role terms; resolved to the story's attribute and pool ids on enablement. */
export const PoolStatusSchema = z
  .object({
    id: z.string().regex(SNAKE),
    label: z.string().min(1).max(40),
    durationTurns: z.number().int().min(1).max(10),
    checkBonus: z.number().int().min(-5).max(5).optional(),
    attributeBonus: z.record(AttributeRoleSchema, z.number().int().min(-5).max(5)).optional(),
    resourcePerTurn: z
      .record(z.enum(["health", "mana", "stamina"]), z.number().int().min(-20).max(20))
      .optional(),
  })
  .strict();
export type PoolStatus = z.infer<typeof PoolStatusSchema>;

/**
 * One outcome of an action archetype. Health changes are multiples of the story's baseline hit
 * (negative harms, positive heals); other pools change by small flat amounts.
 */
export const ArchetypeEffectSchema = z
  .object({
    narrationHint: z.string().min(1).max(80),
    targetHealth: z.number().min(-4).max(4).optional(),
    selfHealth: z.number().min(-4).max(4).optional(),
    targetPools: PoolAmountsSchema.optional(),
    selfPools: PoolAmountsSchema.optional(),
    statusSelf: PoolStatusSchema.optional(),
    statusTarget: PoolStatusSchema.optional(),
  })
  .strict();
export type ArchetypeEffect = z.infer<typeof ArchetypeEffectSchema>;

const ArchetypeParamSchema = z
  .object({ name: z.string().regex(SNAKE), description: z.string().min(1) })
  .strict();

const ArchetypeIdSchema = z.string().regex(/^arch\.[a-z0-9_]+\.[a-z0-9_]+$/);

/** The mechanical shape of a family of actions. */
export const ActionArchetypeSchema = z
  .object({
    id: ArchetypeIdSchema,
    kind: z.literal("action"),
    /** What this shape is, for the humans who audit the pool. */
    description: z.string().min(1),
    category: ActionCategorySchema,
    /** The universal action family materialized actions specialize (`universal-actions.json`). */
    universalFamily: z.string().regex(SNAKE),
    /** Attribute roles tried in order; the first the story has governs. Empty = a flat roll. */
    governingRoles: z.array(AttributeRoleSchema).max(3),
    difficulty: DifficultyWordSchema,
    dc: z.number().int(),
    tier: ItemTierSchema,
    /** Whom the target-side effects are meant for; decides which way "better" points. */
    targetStance: z.enum(["foe", "ally", "none"]),
    opposed: z.boolean().optional(),
    /** Attempt costs by core role. */
    costs: z
      .object({
        health: z.number().int().min(1).optional(),
        mana: z.number().int().min(1).optional(),
        stamina: z.number().int().min(1).optional(),
      })
      .strict()
      .optional(),
    cooldownTurns: z.number().int().min(0).max(20).optional(),
    targeting: ActionTargetingSchema.optional(),
    requiresItemKind: ItemKindSchema.optional(),
    params: z.array(ArchetypeParamSchema).optional(),
    effects: z
      .object({
        crit_success: ArchetypeEffectSchema,
        success: ArchetypeEffectSchema,
        failure: ArchetypeEffectSchema,
        crit_failure: ArchetypeEffectSchema,
      })
      .strict(),
  })
  .strict();
export type ActionArchetype = z.infer<typeof ActionArchetypeSchema>;

const PoolSkillBonusSchema = z
  .object({
    checkBonus: z
      .object({
        amount: z.number().int().min(-5).max(5),
        categories: z.array(ActionCategorySchema).optional(),
      })
      .strict()
      .optional(),
    attributeBonus: z.record(AttributeRoleSchema, z.number().int().min(-5).max(5)).optional(),
  })
  .strict();

/** The mechanical shape of a family of skills. */
export const SkillArchetypeSchema = z
  .object({
    id: ArchetypeIdSchema,
    kind: z.literal("skill"),
    description: z.string().min(1),
    tier: ItemTierSchema,
    /** Reaction skills pair with an action and arrive with the combat archetypes (S12). */
    skillType: z.enum(["active", "passive", "toggle"]),
    passive: PoolSkillBonusSchema.optional(),
    toggle: z
      .object({
        upkeep: z
          .object({
            mana: z.number().int().min(1).max(20).optional(),
            stamina: z.number().int().min(1).max(20).optional(),
          })
          .strict(),
        bonus: PoolSkillBonusSchema,
      })
      .strict()
      .optional(),
    params: z.array(ArchetypeParamSchema).optional(),
  })
  .strict()
  .superRefine((archetype, context) => {
    if ((archetype.skillType === "passive") !== Boolean(archetype.passive)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["passive"],
        message: "A passive skill archetype needs a passive bonus, and only a passive one may have it.",
      });
    }
    if ((archetype.skillType === "toggle") !== Boolean(archetype.toggle)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["toggle"],
        message: "A toggle skill archetype needs a toggle block, and only a toggle one may have it.",
      });
    }
  });
export type SkillArchetype = z.infer<typeof SkillArchetypeSchema>;

export const ArchetypeSchema = z.union([ActionArchetypeSchema, SkillArchetypeSchema]);
export type Archetype = z.infer<typeof ArchetypeSchema>;

export const UniversalArchetypesSchema = z
  .object({
    version: z.number().int().positive(),
    archetypes: z.array(ArchetypeSchema),
  })
  .strict();
export type UniversalArchetypes = z.infer<typeof UniversalArchetypesSchema>;

/** A browsable group of entries, the pool browser's unit (plan 09 §7). */
export const PoolSectionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_-]+$/),
    title: z.string().min(1),
    description: z.string().min(1),
  })
  .strict();
export type PoolSection = z.infer<typeof PoolSectionSchema>;

/** `uni.<domain>.<group>.<name>` — permanent once shipped. */
export const PoolEntryIdSchema = z.string().regex(/^uni\.[a-z0-9_]+\.[a-z0-9_]+\.[a-z0-9_]+$/);

/** One named action or skill: flavour plus a pointer at its archetype, and nothing mechanical. */
export const PoolEntrySchema = z
  .object({
    id: PoolEntryIdSchema,
    name: z.string().min(1).max(60),
    kind: z.enum(["action", "skill"]),
    archetypeId: ArchetypeIdSchema,
    params: z.record(z.string().regex(SNAKE), z.string().min(1)).optional(),
    section: z.string(),
    tags: z.array(z.string().regex(SNAKE)).min(1),
    settingFit: z.array(SettingFitSchema).min(1),
    description: z.string().min(1).max(160),
    /** Natural-language spellings the classifier can match (actions need at least one). */
    aliases: z.array(z.string().min(1)).optional(),
    /** A skill entry (same domain) that gates this action. */
    requiresSkill: PoolEntryIdSchema.optional(),
    /** Kept in the file but never offered (plan 09 §4b.2); the reason makes the call reviewable. */
    excluded: z.boolean().optional(),
    exclusionReason: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.excluded && !entry.exclusionReason) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["exclusionReason"],
        message: "An excluded entry must say why.",
      });
    }
  });
export type PoolEntry = z.infer<typeof PoolEntrySchema>;

export const UniversalPoolSchema = z
  .object({
    version: z.number().int().positive(),
    sections: z.array(PoolSectionSchema),
    entries: z.array(PoolEntrySchema),
  })
  .strict();
export type UniversalPool = z.infer<typeof UniversalPoolSchema>;

export const UNIVERSAL_ARCHETYPES: Readonly<UniversalArchetypes> = Object.freeze(
  UniversalArchetypesSchema.parse(archetypesJson)
);
export const UNIVERSAL_POOL: Readonly<UniversalPool> = Object.freeze(
  UniversalPoolSchema.parse(poolJson)
);

/** The domain of a pool entry id: `uni.<domain>.<group>.<name>` → `<domain>`. */
export function poolDomain(entryId: string): string {
  return entryId.split(".")[1]!;
}
