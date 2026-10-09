import { z } from "zod";
import { ActionDefSchema, SkillDefSchema, type ActionDef, type SkillDef } from "../../types/index.js";
import type { Db } from "../db.js";

/** Who enabled an entry: the forge at creation, the player by hand, or the analyzer mid-story. */
export const PoolEnablementSourceSchema = z.enum(["forge", "player", "analyzer"]);
export type PoolEnablementSource = z.infer<typeof PoolEnablementSourceSchema>;

/**
 * One universal-pool entry enabled in one story (plan 09 §3). Enabling only makes the entry exist in
 * this story's catalogue; it never gives anyone the skill. `definition` is the entry materialized
 * against the story's rulebook at enable time.
 */
export const PoolEnablementSchema = z
  .discriminatedUnion("kind", [
    z.object({ kind: z.literal("action"), definition: ActionDefSchema }),
    z.object({ kind: z.literal("skill"), definition: SkillDefSchema }),
  ])
  .and(
    z.object({
      storyId: z.string().min(1),
      entryId: z.string().min(1),
      source: PoolEnablementSourceSchema,
      enabledAt: z.number().int().nonnegative(),
      /** Set only when a turn enabled it, so rewinding that turn removes it. */
      turnIndex: z.number().int().nonnegative().optional(),
    })
  );
export type PoolEnablement = z.infer<typeof PoolEnablementSchema>;

export interface PoolEnablementRepo {
  /** Every enabled entry of a story, oldest first. */
  list(storyId: string): Promise<PoolEnablement[]>;
  upsert(enablement: PoolEnablement): Promise<void>;
  delete(storyId: string, entryId: string): Promise<void>;
  /** Remove what turns at or after `fromTurnIndex` enabled (rewind / delete / swipe-from). */
  deleteFromTurn(storyId: string, fromTurnIndex: number): Promise<void>;
  deleteAll(storyId: string): Promise<void>;
}

interface Row {
  story_id: string;
  entry_id: string;
  kind: string;
  definition_json: string;
  source: string;
  enabled_at: number;
  turn_index: number | null;
}

function toRecord(row: Row): PoolEnablement {
  return PoolEnablementSchema.parse({
    storyId: row.story_id,
    entryId: row.entry_id,
    kind: row.kind,
    definition: JSON.parse(row.definition_json) as ActionDef | SkillDef,
    source: row.source,
    enabledAt: row.enabled_at,
    ...(row.turn_index !== null ? { turnIndex: row.turn_index } : {}),
  });
}

export function makePoolEnablementRepo(db: Db): PoolEnablementRepo {
  return {
    async list(storyId) {
      const rows = await db.all<Row>(
        `SELECT * FROM story_pool_enablements WHERE story_id = ?
         ORDER BY enabled_at ASC, entry_id ASC`,
        storyId
      );
      return rows.map(toRecord);
    },

    async upsert(enablement) {
      const parsed = PoolEnablementSchema.parse(enablement);
      await db.run(
        `INSERT INTO story_pool_enablements
           (story_id, entry_id, kind, definition_json, source, enabled_at, turn_index)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (story_id, entry_id) DO UPDATE SET
           kind = excluded.kind,
           definition_json = excluded.definition_json,
           source = excluded.source,
           enabled_at = excluded.enabled_at,
           turn_index = excluded.turn_index`,
        parsed.storyId,
        parsed.entryId,
        parsed.kind,
        JSON.stringify(parsed.definition),
        parsed.source,
        parsed.enabledAt,
        parsed.turnIndex ?? null
      );
    },

    async delete(storyId, entryId) {
      await db.run(
        "DELETE FROM story_pool_enablements WHERE story_id = ? AND entry_id = ?",
        storyId,
        entryId
      );
    },

    async deleteFromTurn(storyId, fromTurnIndex) {
      await db.run(
        `DELETE FROM story_pool_enablements
         WHERE story_id = ? AND turn_index IS NOT NULL AND turn_index >= ?`,
        storyId,
        fromTurnIndex
      );
    },

    async deleteAll(storyId) {
      await db.run("DELETE FROM story_pool_enablements WHERE story_id = ?", storyId);
    },
  };
}
