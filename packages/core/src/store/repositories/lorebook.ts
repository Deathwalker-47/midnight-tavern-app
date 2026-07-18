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
  insert(entry: LorebookEntry): Promise<void>;
  get(id: string): Promise<LorebookEntry | undefined>;
  listByStory(storyId: string): Promise<LorebookEntry[]>;
  /** Only the enabled entries for a story (what context assembly considers). */
  listEnabled(storyId: string): Promise<LorebookEntry[]>;
  update(entry: LorebookEntry): Promise<void>;
  delete(id: string): Promise<void>;
}

export function makeLorebookRepo(db: Db): LorebookRepo {
  return {
    async insert(entry) {
      LorebookEntrySchema.parse(entry);
      await db.run(
        "INSERT INTO lorebook (id, story_id, keys, content, enabled) VALUES (?, ?, ?, ?, ?)",
        entry.id,
        entry.storyId,
        JSON.stringify(entry.keys),
        entry.content,
        toInt(entry.enabled)
      );
    },

    async get(id) {
      const row = await db.get<Row>("SELECT * FROM lorebook WHERE id = ?", id);
      return row ? toRecord(row) : undefined;
    },

    async listByStory(storyId) {
      const rows = await db.all<Row>("SELECT * FROM lorebook WHERE story_id = ?", storyId);
      return rows.map(toRecord);
    },

    async listEnabled(storyId) {
      const rows = await db.all<Row>(
        "SELECT * FROM lorebook WHERE story_id = ? AND enabled = 1",
        storyId
      );
      return rows.map(toRecord);
    },

    async update(entry) {
      LorebookEntrySchema.parse(entry);
      const info = await db.run(
        "UPDATE lorebook SET keys = ?, content = ?, enabled = ? WHERE id = ?",
        JSON.stringify(entry.keys),
        entry.content,
        toInt(entry.enabled),
        entry.id
      );
      if (info.changes === 0) throw new Error(`No lorebook entry with id "${entry.id}" to update.`);
    },

    async delete(id) {
      await db.run("DELETE FROM lorebook WHERE id = ?", id);
    },
  };
}
