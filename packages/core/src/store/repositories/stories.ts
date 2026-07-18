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
  type StoryRecord,
} from "../../types/index.js";
import { decodeJson, encodeJson, toBool, toInt } from "./codec.js";

/** The raw `stories` row as SQLite returns it. */
interface Row {
  id: string;
  title: string;
  created_at: number;
  schema_json: string;
  locked: number;
}

/** Map a raw row to a validated domain record. */
function toRecord(row: Row): StoryRecord {
  return StoryRecordSchema.parse({
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    schema: decodeJson(StorySchemaSchema, row.schema_json),
    locked: toBool(row.locked),
  });
}

export interface StoryRepo {
  insert(record: StoryRecord): Promise<void>;
  get(id: string): Promise<StoryRecord | undefined>;
  list(): Promise<StoryRecord[]>;
  /** Replace an existing story's mutable fields (title, schema, locked). */
  update(record: StoryRecord): Promise<void>;
  delete(id: string): Promise<void>;
}

export function makeStoryRepo(db: Db): StoryRepo {
  return {
    async insert(record) {
      StoryRecordSchema.parse(record);
      await db.run(
        "INSERT INTO stories (id, title, created_at, schema_json, locked) VALUES (?, ?, ?, ?, ?)",
        record.id,
        record.title,
        record.createdAt,
        encodeJson(StorySchemaSchema, record.schema),
        toInt(record.locked)
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
        "UPDATE stories SET title = ?, schema_json = ?, locked = ? WHERE id = ?",
        record.title,
        encodeJson(StorySchemaSchema, record.schema),
        toInt(record.locked),
        record.id
      );
      if (info.changes === 0) throw new Error(`No story with id "${record.id}" to update.`);
    },

    async delete(id) {
      await db.run("DELETE FROM stories WHERE id = ?", id);
    },
  };
}
