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
 * A lorebook entry: keyword-triggered lore injected into context. `keys` are the
 * trigger phrases; `content` is the text injected when a key matches; `enabled`
 * toggles the entry without deleting it.
 */
export const LorebookEntrySchema = z.object({
  id: z.string(),
  storyId: z.string(),
  keys: z.array(z.string()),
  content: z.string(),
  enabled: z.boolean(),
});
export type LorebookEntry = z.infer<typeof LorebookEntrySchema>;

/** A user persona (an authored player identity), reusable across stories. */
export const PersonaRecordSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  isDefault: z.boolean(),
});
export type PersonaRecord = z.infer<typeof PersonaRecordSchema>;
