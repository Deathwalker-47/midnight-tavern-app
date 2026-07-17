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
  insert(record: StoryRecord): void;
  get(id: string): StoryRecord | undefined;
  list(): StoryRecord[];
  /** Replace an existing story's mutable fields (title, schema, locked). */
  update(record: StoryRecord): void;
  delete(id: string): void;
}

export function makeStoryRepo(db: Db): StoryRepo {
  const sql = db.sqlite;
  return {
    insert(record) {
      StoryRecordSchema.parse(record);
      sql
        .prepare(
          "INSERT INTO stories (id, title, created_at, schema_json, locked) VALUES (?, ?, ?, ?, ?)"
        )
        .run(
          record.id,
          record.title,
          record.createdAt,
          encodeJson(StorySchemaSchema, record.schema),
          toInt(record.locked)
        );
    },

    get(id) {
      const row = sql.prepare("SELECT * FROM stories WHERE id = ?").get(id) as Row | undefined;
      return row ? toRecord(row) : undefined;
    },

    list() {
      const rows = sql
        .prepare("SELECT * FROM stories ORDER BY created_at DESC")
        .all() as Row[];
      return rows.map(toRecord);
    },

    update(record) {
      StoryRecordSchema.parse(record);
      const info = sql
        .prepare("UPDATE stories SET title = ?, schema_json = ?, locked = ? WHERE id = ?")
        .run(
          record.title,
          encodeJson(StorySchemaSchema, record.schema),
          toInt(record.locked),
          record.id
        );
      if (info.changes === 0) throw new Error(`No story with id "${record.id}" to update.`);
    },

    delete(id) {
      sql.prepare("DELETE FROM stories WHERE id = ?").run(id);
    },
  };
}
