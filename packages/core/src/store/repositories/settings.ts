/**
 * Settings repository (table `settings`, low-level-plan §3).
 *
 * A typed key→value store for install-global config: providers, role→model map, budgets,
 * license. Values are heterogeneous, so each accessor takes the Zod schema for that key's
 * value and validates on the way in and out — the store never hands back an unvalidated
 * setting.
 */
import type { ZodType } from "zod";
import type { Db } from "../db.js";
import { decodeJson, encodeJson } from "./codec.js";

interface Row {
  key: string;
  value: string;
}

export interface SettingsRepo {
  /** Read and validate the value for `key`, or `undefined` if unset. */
  get<T>(key: string, schema: ZodType<T>): T | undefined;
  /** Validate and upsert the value for `key`. */
  set<T>(key: string, schema: ZodType<T>, value: T): void;
  /** True if `key` has a stored value. */
  has(key: string): boolean;
  delete(key: string): void;
}

export function makeSettingsRepo(db: Db): SettingsRepo {
  const sql = db.sqlite;
  return {
    get(key, schema) {
      const row = sql.prepare("SELECT value FROM settings WHERE key = ?").get(key) as Row | undefined;
      return row ? decodeJson(schema, row.value) : undefined;
    },

    set(key, schema, value) {
      sql
        .prepare(
          `INSERT INTO settings (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`
        )
        .run(key, encodeJson(schema, value));
    },

    has(key) {
      const row = sql.prepare("SELECT 1 AS one FROM settings WHERE key = ?").get(key);
      return row !== undefined;
    },

    delete(key) {
      sql.prepare("DELETE FROM settings WHERE key = ?").run(key);
    },
  };
}
