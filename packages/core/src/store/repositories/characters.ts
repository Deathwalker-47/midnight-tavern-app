/**
 * Characters repository (table `characters`, low-level-plan §3).
 *
 * Each row carries the authoritative `hard_json` (engine-owned) and the optional
 * `soft_json` (analyzer-owned, NULL until first analyzed) plus its `soft_tier`. Hard and
 * soft state stay in separate columns so their distinct writers never contend on one blob.
 */
import type { Db } from "../db.js";
import {
  CharacterHardStateSchema,
  CharacterSoftStateSchema,
  SoftTierSchema,
  type CharacterHardState,
  type CharacterSoftState,
  type SoftTier,
} from "../../types/index.js";
import { decodeJson, encodeJson, toBool, toInt } from "./codec.js";

/** A stored character: identity columns plus hard state and optional soft state. */
export interface CharacterRecord {
  id: string;
  storyId: string;
  name: string;
  isPlayer: boolean;
  hard: CharacterHardState;
  soft?: CharacterSoftState;
  softTier?: SoftTier;
}

interface Row {
  id: string;
  story_id: string;
  name: string;
  is_player: number;
  hard_json: string;
  soft_json: string | null;
  soft_tier: string | null;
}

function toRecord(row: Row): CharacterRecord {
  const record: CharacterRecord = {
    id: row.id,
    storyId: row.story_id,
    name: row.name,
    isPlayer: toBool(row.is_player),
    hard: decodeJson(CharacterHardStateSchema, row.hard_json),
  };
  if (row.soft_json !== null) record.soft = decodeJson(CharacterSoftStateSchema, row.soft_json);
  if (row.soft_tier !== null) record.softTier = SoftTierSchema.parse(row.soft_tier);
  return record;
}

export interface CharacterRepo {
  insert(record: CharacterRecord): void;
  get(id: string): CharacterRecord | undefined;
  listByStory(storyId: string): CharacterRecord[];
  /** Overwrite the engine-owned hard state for one character. */
  updateHard(id: string, hard: CharacterHardState): void;
  /** Overwrite the analyzer-owned soft state (and tier) for one character. */
  updateSoft(id: string, soft: CharacterSoftState, tier: SoftTier): void;
  delete(id: string): void;
}

export function makeCharacterRepo(db: Db): CharacterRepo {
  const sql = db.sqlite;
  return {
    insert(record) {
      CharacterHardStateSchema.parse(record.hard);
      sql
        .prepare(
          `INSERT INTO characters (id, story_id, name, is_player, hard_json, soft_json, soft_tier)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          record.id,
          record.storyId,
          record.name,
          toInt(record.isPlayer),
          encodeJson(CharacterHardStateSchema, record.hard),
          record.soft ? encodeJson(CharacterSoftStateSchema, record.soft) : null,
          record.softTier ?? null
        );
    },

    get(id) {
      const row = sql.prepare("SELECT * FROM characters WHERE id = ?").get(id) as Row | undefined;
      return row ? toRecord(row) : undefined;
    },

    listByStory(storyId) {
      const rows = sql
        .prepare("SELECT * FROM characters WHERE story_id = ? ORDER BY is_player DESC, name")
        .all(storyId) as Row[];
      return rows.map(toRecord);
    },

    updateHard(id, hard) {
      const info = sql
        .prepare("UPDATE characters SET hard_json = ? WHERE id = ?")
        .run(encodeJson(CharacterHardStateSchema, hard), id);
      if (info.changes === 0) throw new Error(`No character with id "${id}" to update.`);
    },

    updateSoft(id, soft, tier) {
      const info = sql
        .prepare("UPDATE characters SET soft_json = ?, soft_tier = ? WHERE id = ?")
        .run(encodeJson(CharacterSoftStateSchema, soft), SoftTierSchema.parse(tier), id);
      if (info.changes === 0) throw new Error(`No character with id "${id}" to update.`);
    },

    delete(id) {
      sql.prepare("DELETE FROM characters WHERE id = ?").run(id);
    },
  };
}
