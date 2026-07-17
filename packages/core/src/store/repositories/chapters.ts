/**
 * Chapters repository (table `chapters`, low-level-plan §3).
 *
 * A chapter is a summarized, contiguous message range `[msgFrom, msgTo]`. Written by the
 * summarizer (M8); read for the memory block during context assembly (§7.3).
 */
import type { Db } from "../db.js";
import { ChapterRecordSchema, type ChapterRecord } from "../../types/index.js";

interface Row {
  id: string;
  story_id: string;
  idx: number;
  msg_from: number;
  msg_to: number;
  title: string;
  summary: string;
}

function toRecord(row: Row): ChapterRecord {
  return ChapterRecordSchema.parse({
    id: row.id,
    storyId: row.story_id,
    idx: row.idx,
    msgFrom: row.msg_from,
    msgTo: row.msg_to,
    title: row.title,
    summary: row.summary,
  });
}

export interface ChapterRepo {
  insert(record: ChapterRecord): void;
  get(id: string): ChapterRecord | undefined;
  listByStory(storyId: string): ChapterRecord[];
  /** Chapters with idx in `[fromIdx, toIdx]` inclusive, in order (for arc assembly). */
  listByIdxRange(storyId: string, fromIdx: number, toIdx: number): ChapterRecord[];
  nextIdx(storyId: string): number;
}

export function makeChapterRepo(db: Db): ChapterRepo {
  const sql = db.sqlite;
  return {
    insert(record) {
      ChapterRecordSchema.parse(record);
      sql
        .prepare(
          `INSERT INTO chapters (id, story_id, idx, msg_from, msg_to, title, summary)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          record.id,
          record.storyId,
          record.idx,
          record.msgFrom,
          record.msgTo,
          record.title,
          record.summary
        );
    },

    get(id) {
      const row = sql.prepare("SELECT * FROM chapters WHERE id = ?").get(id) as Row | undefined;
      return row ? toRecord(row) : undefined;
    },

    listByStory(storyId) {
      const rows = sql
        .prepare("SELECT * FROM chapters WHERE story_id = ? ORDER BY idx")
        .all(storyId) as Row[];
      return rows.map(toRecord);
    },

    listByIdxRange(storyId, fromIdx, toIdx) {
      const rows = sql
        .prepare("SELECT * FROM chapters WHERE story_id = ? AND idx BETWEEN ? AND ? ORDER BY idx")
        .all(storyId, fromIdx, toIdx) as Row[];
      return rows.map(toRecord);
    },

    nextIdx(storyId) {
      const row = sql
        .prepare("SELECT MAX(idx) AS maxIdx FROM chapters WHERE story_id = ?")
        .get(storyId) as { maxIdx: number | null };
      return row.maxIdx === null ? 0 : row.maxIdx + 1;
    },
  };
}
