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
  insert(record: ArcRecord): void;
  get(id: string): ArcRecord | undefined;
  listByStory(storyId: string): ArcRecord[];
  /** The most recent arc for a story (highest idx), if any. */
  latest(storyId: string): ArcRecord | undefined;
  nextIdx(storyId: string): number;
}

export function makeArcRepo(db: Db): ArcRepo {
  const sql = db.sqlite;
  return {
    insert(record) {
      ArcRecordSchema.parse(record);
      sql
        .prepare(
          `INSERT INTO arcs (id, story_id, idx, chapter_from, chapter_to, title, doc_json)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          record.id,
          record.storyId,
          record.idx,
          record.chapterFrom,
          record.chapterTo,
          record.title,
          encodeJson(ArcDocSchema, record.doc)
        );
    },

    get(id) {
      const row = sql.prepare("SELECT * FROM arcs WHERE id = ?").get(id) as Row | undefined;
      return row ? toRecord(row) : undefined;
    },

    listByStory(storyId) {
      const rows = sql
        .prepare("SELECT * FROM arcs WHERE story_id = ? ORDER BY idx")
        .all(storyId) as Row[];
      return rows.map(toRecord);
    },

    latest(storyId) {
      const row = sql
        .prepare("SELECT * FROM arcs WHERE story_id = ? ORDER BY idx DESC LIMIT 1")
        .get(storyId) as Row | undefined;
      return row ? toRecord(row) : undefined;
    },

    nextIdx(storyId) {
      const row = sql
        .prepare("SELECT MAX(idx) AS maxIdx FROM arcs WHERE story_id = ?")
        .get(storyId) as { maxIdx: number | null };
      return row.maxIdx === null ? 0 : row.maxIdx + 1;
    },
  };
}
