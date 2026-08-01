/**
 * Characters repository (table `characters`, low-level-plan §3).
 *
 * Each row carries the authoritative `hard_json` (engine-owned) and a durable
 * `soft_json` narrative envelope plus its `soft_tier`. Legacy/checkpoint rows may still
 * temporarily contain NULL and are repaired before analysis. Hard and
 * soft state stay in separate columns so their distinct writers never contend on one blob.
 */
import type { Db } from "../db.js";
import {
  CharacterHardStateSchema,
  CharacterSoftStateSchema,
  createCharacterSoftState,
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
  present: boolean;
  hard: CharacterHardState;
  soft?: CharacterSoftState;
  softTier?: SoftTier;
}

export type CharacterInsert = Omit<CharacterRecord, "present"> & { present?: boolean };

interface Row {
  id: string;
  story_id: string;
  name: string;
  is_player: number;
  present: number;
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
    present: toBool(row.present),
    hard: decodeJson(CharacterHardStateSchema, row.hard_json) as CharacterHardState,
  };
  if (row.soft_json !== null) record.soft = decodeJson(CharacterSoftStateSchema, row.soft_json);
  if (row.soft_tier !== null) record.softTier = SoftTierSchema.parse(row.soft_tier);
  return record;
}

export interface CharacterRepo {
  insert(record: CharacterInsert): Promise<void>;
  get(id: string): Promise<CharacterRecord | undefined>;
  listByStory(storyId: string): Promise<CharacterRecord[]>;
  /** List only characters currently present in the active scene. */
  listPresentByStory(storyId: string): Promise<CharacterRecord[]>;
  /** Change scene presence without removing the character from the registry. */
  setPresent(id: string, present: boolean): Promise<void>;
  /** Replace a provisional display name when narration establishes the character's identity. */
  updateName(id: string, name: string): Promise<void>;
  /** Overwrite the engine-owned hard state for one character. */
  updateHard(id: string, hard: CharacterHardState): Promise<void>;
  /** Overwrite the analyzer-owned soft state (and tier) for one character. */
  updateSoft(id: string, soft: CharacterSoftState, tier: SoftTier): Promise<void>;
  /** Null out a character's soft state + tier (checkpoint rollback when the pre-image had none). §6. */
  clearSoft(id: string): Promise<void>;
  delete(id: string): Promise<void>;
}

export function makeCharacterRepo(db: Db): CharacterRepo {
  return {
    async insert(record) {
      CharacterHardStateSchema.parse(record.hard);
      const tier =
        record.softTier ?? record.soft?.tier ?? (record.isPlayer ? "primary" : "secondary");
      const soft = record.soft ?? createCharacterSoftState(record.id, record.name, tier);
      await db.run(
        `INSERT INTO characters (
           id, story_id, name, is_player, present, hard_json, soft_json, soft_tier
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        record.id,
        record.storyId,
        record.name,
        toInt(record.isPlayer),
        toInt(record.present ?? true),
        encodeJson(CharacterHardStateSchema, record.hard),
        encodeJson(CharacterSoftStateSchema, soft),
        SoftTierSchema.parse(tier)
      );
    },

    async get(id) {
      const row = await db.get<Row>("SELECT * FROM characters WHERE id = ?", id);
      return row ? toRecord(row) : undefined;
    },

    async listByStory(storyId) {
      const rows = await db.all<Row>(
        "SELECT * FROM characters WHERE story_id = ? ORDER BY is_player DESC, name",
        storyId
      );
      return rows.map(toRecord);
    },

    async listPresentByStory(storyId) {
      const rows = await db.all<Row>(
        `SELECT * FROM characters
          WHERE story_id = ? AND present = 1
          ORDER BY is_player DESC, name`,
        storyId
      );
      return rows.map(toRecord);
    },

    async setPresent(id, present) {
      const info = await db.run(
        "UPDATE characters SET present = ? WHERE id = ?",
        toInt(present),
        id
      );
      if (info.changes === 0) throw new Error(`No character with id "${id}" to update.`);
    },

    async updateName(id, name) {
      const normalized = name.trim();
      if (!normalized) throw new Error("Character name cannot be empty.");
      const info = await db.run("UPDATE characters SET name = ? WHERE id = ?", normalized, id);
      if (info.changes === 0) throw new Error(`No character with id "${id}" to update.`);
    },

    async updateHard(id, hard) {
      const info = await db.run(
        "UPDATE characters SET hard_json = ? WHERE id = ?",
        encodeJson(CharacterHardStateSchema, hard),
        id
      );
      if (info.changes === 0) throw new Error(`No character with id "${id}" to update.`);
    },

    async updateSoft(id, soft, tier) {
      const info = await db.run(
        "UPDATE characters SET soft_json = ?, soft_tier = ? WHERE id = ?",
        encodeJson(CharacterSoftStateSchema, soft),
        SoftTierSchema.parse(tier),
        id
      );
      if (info.changes === 0) throw new Error(`No character with id "${id}" to update.`);
    },

    async clearSoft(id) {
      const info = await db.run(
        "UPDATE characters SET soft_json = NULL, soft_tier = NULL WHERE id = ?",
        id
      );
      if (info.changes === 0) throw new Error(`No character with id "${id}" to update.`);
    },

    async delete(id) {
      await db.run("DELETE FROM characters WHERE id = ?", id);
    },
  };
}
