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
  insert(record: PersonaRecord): Promise<void>;
  get(id: string): Promise<PersonaRecord | undefined>;
  list(): Promise<PersonaRecord[]>;
  /** The default persona, if one is set. */
  getDefault(): Promise<PersonaRecord | undefined>;
  update(record: PersonaRecord): Promise<void>;
  /** Make `id` the sole default, clearing the flag on every other persona. */
  setDefault(id: string): Promise<void>;
  delete(id: string): Promise<void>;
}

export function makePersonaRepo(db: Db): PersonaRepo {
  return {
    async insert(record) {
      PersonaRecordSchema.parse(record);
      await db.run(
        "INSERT INTO personas (id, name, description, is_default) VALUES (?, ?, ?, ?)",
        record.id,
        record.name,
        record.description,
        toInt(record.isDefault)
      );
    },

    async get(id) {
      const row = await db.get<Row>("SELECT * FROM personas WHERE id = ?", id);
      return row ? toRecord(row) : undefined;
    },

    async list() {
      const rows = await db.all<Row>("SELECT * FROM personas ORDER BY name");
      return rows.map(toRecord);
    },

    async getDefault() {
      const row = await db.get<Row>("SELECT * FROM personas WHERE is_default = 1");
      return row ? toRecord(row) : undefined;
    },

    async update(record) {
      PersonaRecordSchema.parse(record);
      const info = await db.run(
        "UPDATE personas SET name = ?, description = ?, is_default = ? WHERE id = ?",
        record.name,
        record.description,
        toInt(record.isDefault),
        record.id
      );
      if (info.changes === 0) throw new Error(`No persona with id "${record.id}" to update.`);
    },

    async setDefault(id) {
      await db.transaction(async () => {
        const info = await db.run("UPDATE personas SET is_default = 1 WHERE id = ?", id);
        if (info.changes === 0) throw new Error(`No persona with id "${id}" to set as default.`);
        await db.run("UPDATE personas SET is_default = 0 WHERE id != ?", id);
      });
    },

    async delete(id) {
      await db.run("DELETE FROM personas WHERE id = ?", id);
    },
  };
}
