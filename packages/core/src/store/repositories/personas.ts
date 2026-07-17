/**
 * Personas repository (table `personas`, low-level-plan §3).
 *
 * Authored player identities, reusable across stories (this table is NOT story-scoped).
 * At most one persona is the default; `setDefault` enforces that by clearing the flag on
 * all others in the same transaction.
 */
import type { Db } from "../db.js";
import { PersonaRecordSchema, type PersonaRecord } from "../../types/index.js";
import { toBool, toInt } from "./codec.js";

interface Row {
  id: string;
  name: string;
  description: string;
  is_default: number;
}

function toRecord(row: Row): PersonaRecord {
  return PersonaRecordSchema.parse({
    id: row.id,
    name: row.name,
    description: row.description,
    isDefault: toBool(row.is_default),
  });
}

export interface PersonaRepo {
  insert(record: PersonaRecord): void;
  get(id: string): PersonaRecord | undefined;
  list(): PersonaRecord[];
  /** The default persona, if one is set. */
  getDefault(): PersonaRecord | undefined;
  update(record: PersonaRecord): void;
  /** Make `id` the sole default, clearing the flag on every other persona. */
  setDefault(id: string): void;
  delete(id: string): void;
}

export function makePersonaRepo(db: Db): PersonaRepo {
  const sql = db.sqlite;
  return {
    insert(record) {
      PersonaRecordSchema.parse(record);
      sql
        .prepare("INSERT INTO personas (id, name, description, is_default) VALUES (?, ?, ?, ?)")
        .run(record.id, record.name, record.description, toInt(record.isDefault));
    },

    get(id) {
      const row = sql.prepare("SELECT * FROM personas WHERE id = ?").get(id) as Row | undefined;
      return row ? toRecord(row) : undefined;
    },

    list() {
      const rows = sql.prepare("SELECT * FROM personas ORDER BY name").all() as Row[];
      return rows.map(toRecord);
    },

    getDefault() {
      const row = sql.prepare("SELECT * FROM personas WHERE is_default = 1").get() as Row | undefined;
      return row ? toRecord(row) : undefined;
    },

    update(record) {
      PersonaRecordSchema.parse(record);
      const info = sql
        .prepare("UPDATE personas SET name = ?, description = ?, is_default = ? WHERE id = ?")
        .run(record.name, record.description, toInt(record.isDefault), record.id);
      if (info.changes === 0) throw new Error(`No persona with id "${record.id}" to update.`);
    },

    setDefault(id) {
      db.transaction(() => {
        const info = sql.prepare("UPDATE personas SET is_default = 1 WHERE id = ?").run(id);
        if (info.changes === 0) throw new Error(`No persona with id "${id}" to set as default.`);
        sql.prepare("UPDATE personas SET is_default = 0 WHERE id != ?").run(id);
      });
    },

    delete(id) {
      sql.prepare("DELETE FROM personas WHERE id = ?").run(id);
    },
  };
}
