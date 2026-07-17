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
  set(storyId: string, soft: WorldSoftState): void;
  get(storyId: string): WorldSoftState | undefined;
}

export function makeWorldSoftRepo(db: Db): WorldSoftRepo {
  const sql = db.sqlite;
  return {
    set(storyId, soft) {
      sql
        .prepare(
          `INSERT INTO world_soft (story_id, soft_json) VALUES (?, ?)
           ON CONFLICT(story_id) DO UPDATE SET soft_json = excluded.soft_json`
        )
        .run(storyId, encodeJson(WorldSoftStateSchema, soft));
    },

    get(storyId) {
      const row = sql
        .prepare("SELECT * FROM world_soft WHERE story_id = ?")
        .get(storyId) as Row | undefined;
      return row ? decodeJson(WorldSoftStateSchema, row.soft_json) : undefined;
    },
  };
}
