/**
 * Messages repository (table `messages`, low-level-plan §3).
 *
 * The transcript. `idx` is a per-story monotonic turn index (UNIQUE per story), used for
 * ordering and for chapter/arc range bookkeeping. `nextIdx` computes the next index so
 * callers don't race on it inside a turn transaction.
 */
import type { Db } from "../db.js";
import { MessageRecordSchema, MessageRoleSchema, type MessageRecord } from "../../types/index.js";

interface Row {
  id: string;
  story_id: string;
  idx: number;
  role: string;
  content: string;
  created_at: number;
}

function toRecord(row: Row): MessageRecord {
  return MessageRecordSchema.parse({
    id: row.id,
    storyId: row.story_id,
    idx: row.idx,
    role: MessageRoleSchema.parse(row.role),
    content: row.content,
    createdAt: row.created_at,
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
}

export function makeMessageRepo(db: Db): MessageRepo {
  return {
    async insert(record) {
      MessageRecordSchema.parse(record);
      await db.run(
        "INSERT INTO messages (id, story_id, idx, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        record.id,
        record.storyId,
        record.idx,
        record.role,
        record.content,
        record.createdAt
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
  };
}
