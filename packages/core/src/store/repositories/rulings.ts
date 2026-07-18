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
  insert(record: RulingRecord): Promise<void>;
  get(id: string): Promise<RulingRecord | undefined>;
  /** The ruling attached to a given message, if any. */
  getByMessage(messageId: string): Promise<RulingRecord | undefined>;
  listByStory(storyId: string): Promise<RulingRecord[]>;
}

export function makeRulingRepo(db: Db): RulingRepo {
  return {
    async insert(record) {
      RulingSchema.parse(record.ruling);
      await db.run(
        "INSERT INTO rulings (id, story_id, message_id, ruling_json) VALUES (?, ?, ?, ?)",
        record.id,
        record.storyId,
        record.messageId,
        encodeJson(RulingSchema, record.ruling)
      );
    },

    async get(id) {
      const row = await db.get<Row>("SELECT * FROM rulings WHERE id = ?", id);
      return row ? toRecord(row) : undefined;
    },

    async getByMessage(messageId) {
      const row = await db.get<Row>("SELECT * FROM rulings WHERE message_id = ?", messageId);
      return row ? toRecord(row) : undefined;
    },

    async listByStory(storyId) {
      const rows = await db.all<Row>("SELECT * FROM rulings WHERE story_id = ?", storyId);
      return rows.map(toRecord);
    },
  };
}
