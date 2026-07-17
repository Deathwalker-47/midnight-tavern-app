/**
 * Lorebook repository (table `lorebook`, low-level-plan §3).
 *
 * Keyword-triggered lore entries injected into context when a key matches. `keys` is a
 * string[] stored as JSON; `enabled` toggles an entry without deleting it.
 */
import { z } from "zod";
import type { Db } from "../db.js";
import { LorebookEntrySchema, type LorebookEntry } from "../../types/index.js";
import { toBool, toInt } from "./codec.js";

const KeysSchema = z.array(z.string());

interface Row {
  id: string;
  story_id: string;
  keys: string;
  content: string;
  enabled: number;
}

function toRecord(row: Row): LorebookEntry {
  return LorebookEntrySchema.parse({
    id: row.id,
    storyId: row.story_id,
    keys: KeysSchema.parse(JSON.parse(row.keys)),
    content: row.content,
    enabled: toBool(row.enabled),
  });
}

export interface LorebookRepo {
  insert(entry: LorebookEntry): void;
  get(id: string): LorebookEntry | undefined;
  listByStory(storyId: string): LorebookEntry[];
  /** Only the enabled entries for a story (what context assembly considers). */
  listEnabled(storyId: string): LorebookEntry[];
  update(entry: LorebookEntry): void;
  delete(id: string): void;
}

export function makeLorebookRepo(db: Db): LorebookRepo {
  const sql = db.sqlite;
  return {
    insert(entry) {
      LorebookEntrySchema.parse(entry);
      sql
        .prepare("INSERT INTO lorebook (id, story_id, keys, content, enabled) VALUES (?, ?, ?, ?, ?)")
        .run(entry.id, entry.storyId, JSON.stringify(entry.keys), entry.content, toInt(entry.enabled));
    },

    get(id) {
      const row = sql.prepare("SELECT * FROM lorebook WHERE id = ?").get(id) as Row | undefined;
      return row ? toRecord(row) : undefined;
    },

    listByStory(storyId) {
      const rows = sql.prepare("SELECT * FROM lorebook WHERE story_id = ?").all(storyId) as Row[];
      return rows.map(toRecord);
    },

    listEnabled(storyId) {
      const rows = sql
        .prepare("SELECT * FROM lorebook WHERE story_id = ? AND enabled = 1")
        .all(storyId) as Row[];
      return rows.map(toRecord);
    },

    update(entry) {
      LorebookEntrySchema.parse(entry);
      const info = sql
        .prepare("UPDATE lorebook SET keys = ?, content = ?, enabled = ? WHERE id = ?")
        .run(JSON.stringify(entry.keys), entry.content, toInt(entry.enabled), entry.id);
      if (info.changes === 0) throw new Error(`No lorebook entry with id "${entry.id}" to update.`);
    },

    delete(id) {
      sql.prepare("DELETE FROM lorebook WHERE id = ?").run(id);
    },
  };
}
