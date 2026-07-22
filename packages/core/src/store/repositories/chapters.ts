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
  insert(record: ChapterRecord): Promise<void>;
  get(id: string): Promise<ChapterRecord | undefined>;
  listByStory(storyId: string): Promise<ChapterRecord[]>;
  /** Chapters with idx in `[fromIdx, toIdx]` inclusive, in order (for arc assembly). */
  listByIdxRange(storyId: string, fromIdx: number, toIdx: number): Promise<ChapterRecord[]>;
  /**
   * Delete every chapter that summarizes a message at or after `msgIdx` (i.e. `msg_to >= msgIdx`) —
   * used by delete/rewind so summaries built from removed messages are invalidated and the
   * summarizer rebuilds at the next threshold (§6). Returns the lowest chapter `idx` deleted, or
   * null when none matched (so the caller can cascade arc invalidation from that chapter).
   */
  deleteFromMsgIdx(storyId: string, msgIdx: number): Promise<number | null>;
  nextIdx(storyId: string): Promise<number>;
}

export function makeChapterRepo(db: Db): ChapterRepo {
  return {
    async insert(record) {
      ChapterRecordSchema.parse(record);
      await db.run(
        `INSERT INTO chapters (id, story_id, idx, msg_from, msg_to, title, summary)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        record.id,
        record.storyId,
        record.idx,
        record.msgFrom,
        record.msgTo,
        record.title,
        record.summary
      );
    },

    async get(id) {
      const row = await db.get<Row>("SELECT * FROM chapters WHERE id = ?", id);
      return row ? toRecord(row) : undefined;
    },

    async listByStory(storyId) {
      const rows = await db.all<Row>(
        "SELECT * FROM chapters WHERE story_id = ? ORDER BY idx",
        storyId
      );
      return rows.map(toRecord);
    },

    async listByIdxRange(storyId, fromIdx, toIdx) {
      const rows = await db.all<Row>(
        "SELECT * FROM chapters WHERE story_id = ? AND idx BETWEEN ? AND ? ORDER BY idx",
        storyId,
        fromIdx,
        toIdx
      );
      return rows.map(toRecord);
    },

    async nextIdx(storyId) {
      const row = await db.get<{ maxIdx: number | null }>(
        "SELECT MAX(idx) AS maxIdx FROM chapters WHERE story_id = ?",
        storyId
      );
      return !row || row.maxIdx === null ? 0 : row.maxIdx + 1;
    },

    async deleteFromMsgIdx(storyId, msgIdx) {
      const row = await db.get<{ minIdx: number | null }>(
        "SELECT MIN(idx) AS minIdx FROM chapters WHERE story_id = ? AND msg_to >= ?",
        storyId,
        msgIdx
      );
      const minIdx = row?.minIdx ?? null;
      if (minIdx === null) return null;
      await db.run("DELETE FROM chapters WHERE story_id = ? AND msg_to >= ?", storyId, msgIdx);
      return minIdx;
    },
  };
}
