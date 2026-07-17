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
  insert(record: MessageRecord): void;
  get(id: string): MessageRecord | undefined;
  /** All messages for a story in turn order. */
  listByStory(storyId: string): MessageRecord[];
  /** The most recent `limit` messages for a story, returned in turn order. */
  recent(storyId: string, limit: number): MessageRecord[];
  /** The next unused per-story turn index (max(idx)+1, or 0 for a new story). */
  nextIdx(storyId: string): number;
}

export function makeMessageRepo(db: Db): MessageRepo {
  const sql = db.sqlite;
  return {
    insert(record) {
      MessageRecordSchema.parse(record);
      sql
        .prepare(
          "INSERT INTO messages (id, story_id, idx, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)"
        )
        .run(record.id, record.storyId, record.idx, record.role, record.content, record.createdAt);
    },

    get(id) {
      const row = sql.prepare("SELECT * FROM messages WHERE id = ?").get(id) as Row | undefined;
      return row ? toRecord(row) : undefined;
    },

    listByStory(storyId) {
      const rows = sql
        .prepare("SELECT * FROM messages WHERE story_id = ? ORDER BY idx")
        .all(storyId) as Row[];
      return rows.map(toRecord);
    },

    recent(storyId, limit) {
      const rows = sql
        .prepare("SELECT * FROM messages WHERE story_id = ? ORDER BY idx DESC LIMIT ?")
        .all(storyId, limit) as Row[];
      return rows.reverse().map(toRecord);
    },

    nextIdx(storyId) {
      const row = sql
        .prepare("SELECT MAX(idx) AS maxIdx FROM messages WHERE story_id = ?")
        .get(storyId) as { maxIdx: number | null };
      return row.maxIdx === null ? 0 : row.maxIdx + 1;
    },
  };
}
