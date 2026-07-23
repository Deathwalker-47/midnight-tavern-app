/**
 * Messages repository (table `messages`, low-level-plan §3).
 *
 * The transcript. `idx` is a per-story monotonic turn index (UNIQUE per story), used for
 * ordering and for chapter/arc range bookkeeping. `nextIdx` computes the next index so
 * callers don't race on it inside a turn transaction.
 */
import { z } from "zod";
import type { Db } from "../db.js";
import {
  MessageRecordSchema,
  MessageRoleSchema,
  StoredNarratorVariantSchema,
  variantProse,
  type MessageRecord,
  type StoredNarratorVariant,
} from "../../types/index.js";

interface Row {
  id: string;
  story_id: string;
  idx: number;
  role: string;
  content: string;
  created_at: number;
  variants_json: string | null;
  active_variant: number | null;
  variant_states_json: string | null;
}

const VariantsSchema = z.array(StoredNarratorVariantSchema);

function toRecord(row: Row): MessageRecord {
  return MessageRecordSchema.parse({
    id: row.id,
    storyId: row.story_id,
    idx: row.idx,
    role: MessageRoleSchema.parse(row.role),
    content: row.content,
    createdAt: row.created_at,
    ...(row.variants_json != null ? { variants: VariantsSchema.parse(JSON.parse(row.variants_json)) } : {}),
    ...(row.active_variant != null ? { activeVariant: row.active_variant } : {}),
  });
}

export interface MessageRepo {
  insert(record: MessageRecord): Promise<void>;
  get(id: string): Promise<MessageRecord | undefined>;
  /** All messages for a story in turn order. */
  listByStory(storyId: string): Promise<MessageRecord[]>;
  /** The most recent `limit` messages for a story, returned in turn order. */
  recent(storyId: string, limit: number): Promise<MessageRecord[]>;
  /** The next unused per-story turn index (max(idx)+1, or 0 for a new story). */
  nextIdx(storyId: string): Promise<number>;
  /** The single message at a given turn index in a story, if any. */
  getByIndex(storyId: string, idx: number): Promise<MessageRecord | undefined>;
  /**
   * Replace a narrator message's prose variants + active pointer (swipe, §6). `content` mirrors the
   * active variant so existing readers that ignore variants still render the shown prose.
   */
  setVariants(
    id: string,
    variants: StoredNarratorVariant[],
    activeVariant: number
  ): Promise<void>;
  /**
   * Per-variant soft/world snapshot storage (swipe §6 step 5). Opaque JSON parallel to `variants` —
   * element K is the post-analyzer soft+world state matching variant K, so cycling ‹ › restores the
   * right memory with no model call. Kept off {@link MessageRecord} (UI-facing) as raw JSON.
   */
  getVariantStatesJson(id: string): Promise<string | null>;
  setVariantStatesJson(id: string, json: string): Promise<void>;
  /** Delete a single message by id. */
  delete(id: string): Promise<void>;
  /** Delete every message at or after a turn index (rewind/truncate, §6). */
  deleteFrom(storyId: string, idx: number): Promise<void>;
}

export function makeMessageRepo(db: Db): MessageRepo {
  return {
    async insert(record) {
      MessageRecordSchema.parse(record);
      await db.run(
        `INSERT INTO messages (id, story_id, idx, role, content, created_at, variants_json, active_variant)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        record.id,
        record.storyId,
        record.idx,
        record.role,
        record.content,
        record.createdAt,
        record.variants ? JSON.stringify(record.variants) : null,
        record.activeVariant ?? 0
      );
    },

    async get(id) {
      const row = await db.get<Row>("SELECT * FROM messages WHERE id = ?", id);
      return row ? toRecord(row) : undefined;
    },

    async listByStory(storyId) {
      const rows = await db.all<Row>("SELECT * FROM messages WHERE story_id = ? ORDER BY idx", storyId);
      return rows.map(toRecord);
    },

    async recent(storyId, limit) {
      const rows = await db.all<Row>(
        "SELECT * FROM messages WHERE story_id = ? ORDER BY idx DESC LIMIT ?",
        storyId,
        limit
      );
      return rows.reverse().map(toRecord);
    },

    async nextIdx(storyId) {
      const row = await db.get<{ maxIdx: number | null }>(
        "SELECT MAX(idx) AS maxIdx FROM messages WHERE story_id = ?",
        storyId
      );
      return !row || row.maxIdx === null ? 0 : row.maxIdx + 1;
    },

    async getByIndex(storyId, idx) {
      const row = await db.get<Row>(
        "SELECT * FROM messages WHERE story_id = ? AND idx = ?",
        storyId,
        idx
      );
      return row ? toRecord(row) : undefined;
    },

    async setVariants(id, variants, activeVariant) {
      const selected = variants[activeVariant] ?? variants[variants.length - 1] ?? "";
      const shown = variantProse(selected);
      const info = await db.run(
        "UPDATE messages SET variants_json = ?, active_variant = ?, content = ? WHERE id = ?",
        JSON.stringify(variants),
        activeVariant,
        shown,
        id
      );
      if (info.changes === 0) throw new Error(`No message with id "${id}" to set variants.`);
    },

    async getVariantStatesJson(id) {
      const row = await db.get<{ variant_states_json: string | null }>(
        "SELECT variant_states_json FROM messages WHERE id = ?",
        id
      );
      return row?.variant_states_json ?? null;
    },

    async setVariantStatesJson(id, json) {
      const info = await db.run(
        "UPDATE messages SET variant_states_json = ? WHERE id = ?",
        json,
        id
      );
      if (info.changes === 0) throw new Error(`No message with id "${id}" to set variant states.`);
    },

    async delete(id) {
      await db.run("DELETE FROM messages WHERE id = ?", id);
    },

    async deleteFrom(storyId, idx) {
      await db.run("DELETE FROM messages WHERE story_id = ? AND idx >= ?", storyId, idx);
    },
  };
}
