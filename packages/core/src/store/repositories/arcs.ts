/**
 * Arcs repository (table `arcs`, low-level-plan §3).
 *
 * An arc folds a contiguous chapter range `[chapterFrom, chapterTo]` into the structured
 * `ArcDoc` (stored as `doc_json`). Written by the summarizer (M8); the latest arc doc is
 * the memory the storyteller re-reads before every turn (§7.3).
 */
import type { Db } from "../db.js";
import { ArcDocSchema, ArcRecordSchema, type ArcRecord } from "../../types/index.js";
import { decodeJson, encodeJson } from "./codec.js";

interface Row {
  id: string;
  story_id: string;
  idx: number;
  chapter_from: number;
  chapter_to: number;
  title: string;
  doc_json: string;
}

function toRecord(row: Row): ArcRecord {
  return ArcRecordSchema.parse({
    id: row.id,
    storyId: row.story_id,
    idx: row.idx,
    chapterFrom: row.chapter_from,
    chapterTo: row.chapter_to,
    title: row.title,
    doc: decodeJson(ArcDocSchema, row.doc_json),
  });
}

export interface ArcRepo {
  insert(record: ArcRecord): Promise<void>;
  get(id: string): Promise<ArcRecord | undefined>;
  listByStory(storyId: string): Promise<ArcRecord[]>;
  /** The most recent arc for a story (highest idx), if any. */
  latest(storyId: string): Promise<ArcRecord | undefined>;
  /**
   * Delete every arc that folds a chapter at or after `chapterIdx` (i.e. `chapter_to >= chapterIdx`)
   * — cascaded from chapter invalidation on delete/rewind so no arc references a removed chapter (§6).
   */
  deleteFromChapterIdx(storyId: string, chapterIdx: number): Promise<void>;
  nextIdx(storyId: string): Promise<number>;
}

export function makeArcRepo(db: Db): ArcRepo {
  return {
    async insert(record) {
      ArcRecordSchema.parse(record);
      await db.run(
        `INSERT INTO arcs (id, story_id, idx, chapter_from, chapter_to, title, doc_json)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        record.id,
        record.storyId,
        record.idx,
        record.chapterFrom,
        record.chapterTo,
        record.title,
        encodeJson(ArcDocSchema, record.doc)
      );
    },

    async get(id) {
      const row = await db.get<Row>("SELECT * FROM arcs WHERE id = ?", id);
      return row ? toRecord(row) : undefined;
    },

    async listByStory(storyId) {
      const rows = await db.all<Row>("SELECT * FROM arcs WHERE story_id = ? ORDER BY idx", storyId);
      return rows.map(toRecord);
    },

    async latest(storyId) {
      const row = await db.get<Row>(
        "SELECT * FROM arcs WHERE story_id = ? ORDER BY idx DESC LIMIT 1",
        storyId
      );
      return row ? toRecord(row) : undefined;
    },

    async nextIdx(storyId) {
      const row = await db.get<{ maxIdx: number | null }>(
        "SELECT MAX(idx) AS maxIdx FROM arcs WHERE story_id = ?",
        storyId
      );
      return !row || row.maxIdx === null ? 0 : row.maxIdx + 1;
    },

    async deleteFromChapterIdx(storyId, chapterIdx) {
      await db.run(
        "DELETE FROM arcs WHERE story_id = ? AND chapter_to >= ?",
        storyId,
        chapterIdx
      );
    },
  };
}
