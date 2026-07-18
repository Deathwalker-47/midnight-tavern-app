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
  get<T>(key: string, schema: ZodType<T>): Promise<T | undefined>;
  /** Validate and upsert the value for `key`. */
  set<T>(key: string, schema: ZodType<T>, value: T): Promise<void>;
  /** True if `key` has a stored value. */
  has(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

export function makeSettingsRepo(db: Db): SettingsRepo {
  return {
    async get(key, schema) {
      const row = await db.get<Row>("SELECT value FROM settings WHERE key = ?", key);
      return row ? decodeJson(schema, row.value) : undefined;
    },

    async set(key, schema, value) {
      await db.run(
        `INSERT INTO settings (key, value) VALUES (?, ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        key,
        encodeJson(schema, value)
      );
    },

    async has(key) {
      const row = await db.get<{ one: number }>("SELECT 1 AS one FROM settings WHERE key = ?", key);
      return row !== undefined;
    },

    async delete(key) {
      await db.run("DELETE FROM settings WHERE key = ?", key);
    },
  };
}
