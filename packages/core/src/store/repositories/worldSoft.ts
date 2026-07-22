/**
 * World-soft repository (table `world_soft`, low-level-plan §3).
 *
 * Exactly one row per story (PK = story_id): the analyzer-owned `WorldSoftState`. `set`
 * upserts, since a story's world is a single evolving document, not a collection.
 */
import type { Db } from "../db.js";
import { WorldSoftStateSchema, type WorldSoftState } from "../../types/index.js";
import { decodeJson, encodeJson } from "./codec.js";

interface Row {
  story_id: string;
  soft_json: string;
}

export interface WorldSoftRepo {
  /** Insert or replace the world-soft document for a story. */
  set(storyId: string, soft: WorldSoftState): Promise<void>;
  get(storyId: string): Promise<WorldSoftState | undefined>;
  /** Delete a story's world-soft row (checkpoint rollback when the pre-image had no world). §6. */
  clear(storyId: string): Promise<void>;
}

export function makeWorldSoftRepo(db: Db): WorldSoftRepo {
  return {
    async set(storyId, soft) {
      await db.run(
        `INSERT INTO world_soft (story_id, soft_json) VALUES (?, ?)
           ON CONFLICT(story_id) DO UPDATE SET soft_json = excluded.soft_json`,
        storyId,
        encodeJson(WorldSoftStateSchema, soft)
      );
    },

    async get(storyId) {
      const row = await db.get<Row>("SELECT * FROM world_soft WHERE story_id = ?", storyId);
      return row ? decodeJson(WorldSoftStateSchema, row.soft_json) : undefined;
    },

    async clear(storyId) {
      await db.run("DELETE FROM world_soft WHERE story_id = ?", storyId);
    },
  };
}
