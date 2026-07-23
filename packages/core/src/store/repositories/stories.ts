/**
 * Stories repository (table `stories`, low-level-plan §3).
 *
 * Typed CRUD over story rows. The frozen StorySchema is stored as `schema_json` and
 * round-trips through its Zod schema; `locked` mirrors `schema.locked` for cheap
 * querying without parsing the JSON.
 */
import type { Db } from "../db.js";
import {
  StoryRecordSchema,
  StorySchemaSchema,
  BlueprintSchema,
  PersistedDifficultySchema,
  STANDARD_DIFFICULTY,
  type StoryRecord,
} from "../../types/index.js";
import { decodeJson, encodeJson, toBool, toInt } from "./codec.js";

/** The raw `stories` row as SQLite returns it. `blueprint_json` is nullable (migration 002). */
interface Row {
  id: string;
  title: string;
  created_at: number;
  schema_json: string;
  locked: number;
  blueprint_json: string | null;
  difficulty_json: string | null;
  action_budget: number;
  rulebook_version: number;
  config_snapshot_json: string | null;
}

/** Map a raw row to a validated domain record. */
function toRecord(row: Row): StoryRecord {
  return StoryRecordSchema.parse({
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    schema: decodeJson(StorySchemaSchema, row.schema_json),
    locked: toBool(row.locked),
    ...(row.blueprint_json != null
      ? { blueprint: decodeJson(BlueprintSchema, row.blueprint_json) }
      : {}),
    difficulty:
      row.difficulty_json != null
        ? decodeJson(PersistedDifficultySchema, row.difficulty_json)
        : STANDARD_DIFFICULTY,
    actionBudget: row.action_budget || 2,
    rulebookVersion: row.rulebook_version || 1,
    ...(row.config_snapshot_json != null
      ? { configSnapshot: JSON.parse(row.config_snapshot_json) as unknown }
      : {}),
  });
}

export interface StoryRepo {
  insert(record: StoryRecord): Promise<void>;
  get(id: string): Promise<StoryRecord | undefined>;
  list(): Promise<StoryRecord[]>;
  /** Replace an existing story's mutable fields (title, schema, locked, blueprint). */
  update(record: StoryRecord): Promise<void>;
  /**
   * Update only the Story Blueprint (§3). Editing style/identity never touches the frozen
   * mechanical schema (consistent with M5.4). Pass `undefined` to clear it.
   */
  setBlueprint(id: string, blueprint: StoryRecord["blueprint"]): Promise<void>;
  /** Update V7 runtime settings without replacing the frozen schema. */
  setRuntimeConfig(
    id: string,
    config: Pick<StoryRecord, "difficulty" | "actionBudget" | "rulebookVersion" | "configSnapshot">
  ): Promise<void>;
  delete(id: string): Promise<void>;
}

export function makeStoryRepo(db: Db): StoryRepo {
  return {
    async insert(record) {
      StoryRecordSchema.parse(record);
      await db.run(
        `INSERT INTO stories
          (id, title, created_at, schema_json, locked, blueprint_json, difficulty_json,
           action_budget, rulebook_version, config_snapshot_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        record.id,
        record.title,
        record.createdAt,
        encodeJson(StorySchemaSchema, record.schema),
        toInt(record.locked),
        record.blueprint ? encodeJson(BlueprintSchema, record.blueprint) : null,
        encodeJson(PersistedDifficultySchema, record.difficulty ?? STANDARD_DIFFICULTY),
        record.actionBudget ?? 2,
        record.rulebookVersion ?? 1,
        record.configSnapshot ? JSON.stringify(record.configSnapshot) : null
      );
    },

    async get(id) {
      const row = await db.get<Row>("SELECT * FROM stories WHERE id = ?", id);
      return row ? toRecord(row) : undefined;
    },

    async list() {
      const rows = await db.all<Row>("SELECT * FROM stories ORDER BY created_at DESC");
      return rows.map(toRecord);
    },

    async update(record) {
      StoryRecordSchema.parse(record);
      const info = await db.run(
        `UPDATE stories SET title = ?, schema_json = ?, locked = ?, blueprint_json = ?,
           difficulty_json = ?, action_budget = ?, rulebook_version = ?, config_snapshot_json = ?
         WHERE id = ?`,
        record.title,
        encodeJson(StorySchemaSchema, record.schema),
        toInt(record.locked),
        record.blueprint ? encodeJson(BlueprintSchema, record.blueprint) : null,
        encodeJson(PersistedDifficultySchema, record.difficulty ?? STANDARD_DIFFICULTY),
        record.actionBudget ?? 2,
        record.rulebookVersion ?? 1,
        record.configSnapshot ? JSON.stringify(record.configSnapshot) : null,
        record.id
      );
      if (info.changes === 0) throw new Error(`No story with id "${record.id}" to update.`);
    },

    async setBlueprint(id, blueprint) {
      const parsed = blueprint ? BlueprintSchema.parse(blueprint) : null;
      const info = await db.run(
        "UPDATE stories SET blueprint_json = ? WHERE id = ?",
        parsed ? encodeJson(BlueprintSchema, parsed) : null,
        id
      );
      if (info.changes === 0) throw new Error(`No story with id "${id}" to update.`);
    },

    async setRuntimeConfig(id, config) {
      const difficulty = PersistedDifficultySchema.parse(
        config.difficulty ?? STANDARD_DIFFICULTY
      );
      const actionBudget = Math.max(1, Math.min(5, config.actionBudget ?? 2));
      const rulebookVersion = Math.max(1, config.rulebookVersion ?? 1);
      const info = await db.run(
        `UPDATE stories SET difficulty_json = ?, action_budget = ?, rulebook_version = ?,
           config_snapshot_json = ? WHERE id = ?`,
        encodeJson(PersistedDifficultySchema, difficulty),
        actionBudget,
        rulebookVersion,
        config.configSnapshot ? JSON.stringify(config.configSnapshot) : null,
        id
      );
      if (info.changes === 0) throw new Error(`No story with id "${id}" to update.`);
    },

    async delete(id) {
      await db.run("DELETE FROM stories WHERE id = ?", id);
    },
  };
}
