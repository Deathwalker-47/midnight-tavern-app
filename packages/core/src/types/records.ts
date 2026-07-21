/**
 * Persistence record types (low-level-plan §3) — the row-shaped payloads the store
 * reads and writes. Every JSON column in the SQLite schema round-trips through one of
 * these Zod schemas, so a malformed payload can never enter or leave the database
 * silently.
 *
 * These are the "outer" rows (stories, messages, chapters, arcs, lorebook, personas,
 * settings). Character hard/soft state and the per-turn Ruling already have schemas in
 * their own files (hardState.ts, softState.ts, events.ts) and are re-exported by the
 * repositories that own their tables.
 */
import { z } from "zod";
import { StorySchemaSchema } from "./schema.js";
import { BlueprintSchema } from "./blueprint.js";

/** A message's author role in the transcript. */
export const MessageRoleSchema = z.enum(["player", "narrator", "system"]);
export type MessageRole = z.infer<typeof MessageRoleSchema>;

/**
 * A story row. `schema` is the frozen StorySchema (persisted as `stories.schema_json`);
 * `locked` mirrors the schema's own frozen flag for cheap querying without parsing JSON.
 */
export const StoryRecordSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.number().int(), // epoch ms
  schema: StorySchemaSchema,
  locked: z.boolean(),
  /**
   * Author-facing Story Blueprint (low-level-plan-v2 §3): identity/style/premise. Optional — legacy
   * and bootstrap-only stories omit it. Style-only; the mechanical `schema` above is the wall.
   */
  blueprint: BlueprintSchema.optional(),
});
export type StoryRecord = z.infer<typeof StoryRecordSchema>;

/**
 * A single transcript message. `idx` is a per-story monotonically increasing turn
 * index used for ordering and for chapter/arc range bookkeeping.
 */
export const MessageRecordSchema = z.object({
  id: z.string(),
  storyId: z.string(),
  idx: z.number().int().nonnegative(),
  role: MessageRoleSchema,
  content: z.string(),
  createdAt: z.number().int(), // epoch ms
  /**
   * Narrator prose variants from swipe/regenerate (low-level-plan-v2 §6). Absent on player messages
   * and on narrator messages never swiped. `content` always mirrors the active variant.
   */
  variants: z.array(z.string()).optional(),
  /** Index into `variants` of the currently-shown prose (defaults to 0, the original). */
  activeVariant: z.number().int().nonnegative().optional(),
});
export type MessageRecord = z.infer<typeof MessageRecordSchema>;

/**
 * A chapter: a summarized contiguous range of messages `[msgFrom, msgTo]`
 * (inclusive message indices).
 */
export const ChapterRecordSchema = z.object({
  id: z.string(),
  storyId: z.string(),
  idx: z.number().int().nonnegative(),
  msgFrom: z.number().int().nonnegative(),
  msgTo: z.number().int().nonnegative(),
  title: z.string(),
  summary: z.string(),
});
export type ChapterRecord = z.infer<typeof ChapterRecordSchema>;

/**
 * The structured Arc Document (low-level-plan M8.3, plan line 340). Produced by the
 * summarizer in M8; its *shape* is fixed here so the arcs table has a validated payload
 * type from the start. Every section is a free list the summarizer fills.
 */
export const ArcDocSchema = z.object({
  plotSummary: z.string(),
  characterDevelopment: z.array(z.string()),
  relationshipDynamics: z.array(z.string()),
  secretsRevealed: z.array(z.string()),
  keyDialogue: z.array(z.string()),
  promisesAndOaths: z.array(z.string()),
  antagonists: z.array(z.string()),
  worldLore: z.array(z.string()),
  unresolvedThreads: z.array(z.string()),
  stakes: z.array(z.string()),
  keyItems: z.array(z.string()),
  skillsAndPowers: z.array(z.string()),
  limitations: z.array(z.string()),
  timeline: z.array(z.string()),
});
export type ArcDoc = z.infer<typeof ArcDocSchema>;

/**
 * An arc: a summarized contiguous range of chapters `[chapterFrom, chapterTo]`
 * (inclusive chapter indices) with the structured `doc` extraction.
 */
export const ArcRecordSchema = z.object({
  id: z.string(),
  storyId: z.string(),
  idx: z.number().int().nonnegative(),
  chapterFrom: z.number().int().nonnegative(),
  chapterTo: z.number().int().nonnegative(),
  title: z.string(),
  doc: ArcDocSchema,
});
export type ArcRecord = z.infer<typeof ArcRecordSchema>;

/**
 * A lorebook — a first-class, story-independent collection of lore entries (low-level-plan-v2 §2).
 * Attached to zero or more stories via the `story_lorebooks` m2m link. `source` records provenance:
 * "user" (authored in the app), "imported_card" (from a Chara Card's `character_book`), or
 * "migrated" (legacy per-story lore, unused pre-release).
 */
export const LorebookSourceSchema = z.enum(["user", "imported_card", "migrated"]);
export type LorebookSource = z.infer<typeof LorebookSourceSchema>;

export const LorebookSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  createdAt: z.number().int().nonnegative(),
  source: LorebookSourceSchema,
});
export type Lorebook = z.infer<typeof LorebookSchema>;

/**
 * A lorebook entry: keyword-triggered lore injected into context. `keys` are the trigger phrases;
 * `content` is injected when a key matches. `enabled` toggles the entry without deleting it;
 * `alwaysOn` entries inject regardless of keyword match. `priority` then `insertionOrder` order
 * entries under the token budget (§7.3). Belongs to a `lorebook`, not a story (v2 §2).
 */
export const LorebookEntrySchema = z.object({
  id: z.string(),
  lorebookId: z.string(),
  keys: z.array(z.string()),
  content: z.string(),
  enabled: z.boolean(),
  alwaysOn: z.boolean(),
  priority: z.number().int(),
  insertionOrder: z.number().int(),
});
export type LorebookEntry = z.infer<typeof LorebookEntrySchema>;

/** A story↔lorebook attachment. `enabled` is the link-level toggle (distinct from entry-level). */
export const StoryLorebookLinkSchema = z.object({
  storyId: z.string(),
  lorebookId: z.string(),
  enabled: z.boolean(),
});
export type StoryLorebookLink = z.infer<typeof StoryLorebookLinkSchema>;

/** A user persona (an authored player identity), reusable across stories. */
export const PersonaRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  isDefault: z.boolean(),
});
export type PersonaRecord = z.infer<typeof PersonaRecordSchema>;
