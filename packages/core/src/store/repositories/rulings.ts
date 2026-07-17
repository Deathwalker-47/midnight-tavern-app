/**
 * Rulings repository (table `rulings`, low-level-plan §3).
 *
 * One row per resolved turn: the engine's authoritative `Ruling` (stored as
 * `ruling_json`), linked to the narrator message it produced. Persisted together with
 * that message inside the per-turn transaction (§6).
 */
import type { Db } from "../db.js";
import { RulingSchema, type Ruling } from "../../types/index.js";
import { decodeJson, encodeJson } from "./codec.js";

/** A stored ruling: its id and links, plus the validated Ruling payload. */
export interface RulingRecord {
  id: string;
  storyId: string;
  messageId: string;
  ruling: Ruling;
}

interface Row {
  id: string;
  story_id: string;
  message_id: string;
  ruling_json: string;
}

function toRecord(row: Row): RulingRecord {
  return {
    id: row.id,
    storyId: row.story_id,
    messageId: row.message_id,
    ruling: decodeJson(RulingSchema, row.ruling_json),
  };
}

export interface RulingRepo {
  insert(record: RulingRecord): void;
  get(id: string): RulingRecord | undefined;
  /** The ruling attached to a given message, if any. */
  getByMessage(messageId: string): RulingRecord | undefined;
  listByStory(storyId: string): RulingRecord[];
}

export function makeRulingRepo(db: Db): RulingRepo {
  const sql = db.sqlite;
  return {
    insert(record) {
      RulingSchema.parse(record.ruling);
      sql
        .prepare("INSERT INTO rulings (id, story_id, message_id, ruling_json) VALUES (?, ?, ?, ?)")
        .run(record.id, record.storyId, record.messageId, encodeJson(RulingSchema, record.ruling));
    },

    get(id) {
      const row = sql.prepare("SELECT * FROM rulings WHERE id = ?").get(id) as Row | undefined;
      return row ? toRecord(row) : undefined;
    },

    getByMessage(messageId) {
      const row = sql
        .prepare("SELECT * FROM rulings WHERE message_id = ?")
        .get(messageId) as Row | undefined;
      return row ? toRecord(row) : undefined;
    },

    listByStory(storyId) {
      const rows = sql.prepare("SELECT * FROM rulings WHERE story_id = ?").all(storyId) as Row[];
      return rows.map(toRecord);
    },
  };
}
