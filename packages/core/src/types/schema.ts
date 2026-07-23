/**
 * Frozen Story Schema (low-level-plan §2.1).
 *
 * A story's rule set: generated once at bootstrap, then frozen (`locked = true`)
 * and read-only during play. The mechanics engine enforces against this; nothing
 * — no model — writes it during play.
 *
 * Zod schemas are the single source of truth; the exported TS types are inferred
 * from them so a schema and its type can never drift apart.
 */
import { z } from "zod";
import { ActionDefSchema } from "./actions.js";
import { MasteryRankSchema, CostSpecSchema, ItemKindSchema, StatModeSchema } from "./primitives.js";

// Re-export the shared leaf primitives so `StorySchema`'s module stays the one-stop
// import for the frozen rule set (the actual definitions live in primitives.ts to
// break the schema↔actions cycle).
export * from "./primitives.js";

/** A prerequisite condition that must hold to learn a skill or take an action. */
export const ConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("skill"), skillId: z.string(), minRank: MasteryRankSchema.optional() }),
  z.object({ type: z.literal("resource"), resourceId: z.string(), min: z.number() }),
  z.object({ type: z.literal("item"), itemId: z.string() }),
  z.object({ type: z.literal("flag"), flagId: z.string(), value: z.boolean() }),
  z.object({ type: z.literal("attribute"), attributeId: z.string(), min: z.number() }),
]);
export type Condition = z.infer<typeof ConditionSchema>;

/** The only defined ways to acquire a skill. */
export const UnlockPathSchema = z.discriminatedUnion("method", [
  z.object({ method: z.literal("trainer"), npcHint: z.string(), cost: CostSpecSchema }),
  z.object({ method: z.literal("manual"), itemId: z.string() }),
  z.object({ method: z.literal("trial"), flagId: z.string() }),
]);
export type UnlockPath = z.infer<typeof UnlockPathSchema>;

/** How a learned skill's mastery rank increases (deterministic). */
export const MasteryAdvanceRuleSchema = z.object({
  // Rank up after N successful gated uses of the skill (e.g. 5 → novice→adept).
  successesPerRank: z.number().int().positive(),
});
export type MasteryAdvanceRule = z.infer<typeof MasteryAdvanceRuleSchema>;

/** A numeric bar the story uses (health, stamina, ...). */
export const ResourceDefSchema = z.object({
  id: z.string(),
  label: z.string(),
  start: z.number(),
  max: z.number(),
  playerVisible: z.boolean(),
  regenPerScene: z.number().optional(), // optional passive recovery
  // M2 step 4: exactly one resource is `lethal` (statMode !== "none"); reaching 0 kills.
  lethal: z.boolean().optional(),
});
export type ResourceDef = z.infer<typeof ResourceDefSchema>;

/** A genre-specific raw capability generated with a Full Stats rulebook. */
export const AttributeDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  abbrev: z.string(),
  description: z.string(),
  defaultScore: z.number().int().min(1).max(30),
});
export type AttributeDef = z.infer<typeof AttributeDefSchema>;

/** A learnable skill. Unlock is binary (the gate); a rank rides on top (D1). */
export const SkillDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  tier: z.string(),
  prerequisites: z.array(ConditionSchema),
  unlockPaths: z.array(UnlockPathSchema),
  masteryAdvance: MasteryAdvanceRuleSchema,
  advancedUses: z
    .array(z.object({ minRank: MasteryRankSchema, description: z.string() }))
    .optional(),
});
export type SkillDef = z.infer<typeof SkillDefSchema>;

/** An item in the complete item/equipment table (ItemKindSchema from primitives). */
export const ItemDefSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  kind: ItemKindSchema,
  tier: z.string(),
  requiresSkill: z.string().optional(),
  props: z.record(z.string(), z.number()), // e.g. { damage: 6, defense: 2, heal: 10 }
});
export type ItemDef = z.infer<typeof ItemDefSchema>;

/** Rarity/power tier and the earliest progress at which it may legitimately appear. */
export const TierDefSchema = z.object({
  id: z.string(),
  label: z.string(),
  minProgress: z.number(),
});
export type TierDef = z.infer<typeof TierDefSchema>;

/** What the player begins with. */
export const StartingStateSchema = z.object({
  attributes: z.record(z.string(), z.number().int().min(1).max(30)).default({}),
  resources: z.record(z.string(), z.number()),
  skills: z.array(z.object({ skillId: z.string(), rank: MasteryRankSchema })),
  inventory: z.array(z.object({ itemId: z.string(), qty: z.number().int() })),
});
export type StartingState = z.infer<typeof StartingStateSchema>;

/** A sheet the engine instantiates for a key NPC on first mechanical action. */
export const NpcTemplateSchema = z.object({
  templateId: z.string(),
  name: z.string(),
  attributes: z.record(z.string(), z.number().int().min(1).max(30)).default({}),
  resources: z.record(z.string(), z.number()), // e.g. { hp: 40 }
  skills: z.array(z.object({ skillId: z.string(), rank: MasteryRankSchema })),
  inventory: z.array(z.object({ itemId: z.string(), qty: z.number().int() })),
});
export type NpcTemplate = z.infer<typeof NpcTemplateSchema>;

/** The complete frozen story schema (persisted as `stories.schema_json`). */
const StorySchemaObjectSchema = z.object({
  schemaVersion: z.literal(1),
  storyId: z.string(),
  title: z.string(),
  premise: z.string(), // the user's input, preserved
  statMode: StatModeSchema,
  attributes: z.array(AttributeDefSchema).default([]), // [] for No Stats
  resources: z.array(ResourceDefSchema), // [] when statMode === "none"
  skills: z.array(SkillDefSchema),
  items: z.array(ItemDefSchema),
  tiers: z.array(TierDefSchema),
  actions: z.array(ActionDefSchema), // THE ACTION CATALOG (D3)
  startingState: StartingStateSchema,
  npcTemplates: z.array(NpcTemplateSchema),
  locked: z.boolean(), // set true at freeze; the gate refuses unlocked schemas
  /** Set only while a pre-v5 `light` story awaits the one-time destination choice. */
  legacyStatMode: z.literal("light").optional(),
  migrationPending: z.boolean().optional(),
});

function normalizeLegacyStorySchema(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const input = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {
    ...input,
    attributes: input.attributes ?? [],
  };
  if (input.statMode === "light") {
    normalized.statMode = "full";
    normalized.legacyStatMode = "light";
    normalized.migrationPending = true;
  }
  return normalized;
}

/** Final live schema, with a compatibility preprocessor for legacy `light` rows. */
export const StorySchemaSchema = z.preprocess(normalizeLegacyStorySchema, StorySchemaObjectSchema);
export type StorySchema = z.infer<typeof StorySchemaSchema>;
