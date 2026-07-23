import { z } from "zod";
import type { Db } from "../db.js";

export const RulebookSnapshotSchema = z.object({
  id: z.string().min(1),
  storyId: z.string().min(1),
  rulebookVersion: z.number().int().positive(),
  snapshot: z.record(z.string(), z.unknown()),
  createdAt: z.number().int().nonnegative(),
});
export type RulebookSnapshot = z.infer<typeof RulebookSnapshotSchema>;

interface SnapshotRow {
  id: string;
  story_id: string;
  rulebook_version: number;
  snapshot_json: string;
  created_at: number;
}

function fromRow(row: SnapshotRow): RulebookSnapshot {
  return RulebookSnapshotSchema.parse({
    id: row.id,
    storyId: row.story_id,
    rulebookVersion: row.rulebook_version,
    snapshot: JSON.parse(row.snapshot_json) as unknown,
    createdAt: row.created_at,
  });
}

export interface RulebookSnapshotRepo {
  insert(snapshot: RulebookSnapshot): Promise<void>;
  listByStory(storyId: string): Promise<RulebookSnapshot[]>;
  latest(storyId: string): Promise<RulebookSnapshot | undefined>;
}

export function makeRulebookSnapshotRepo(db: Db): RulebookSnapshotRepo {
  return {
    async insert(snapshot) {
      const parsed = RulebookSnapshotSchema.parse(snapshot);
      await db.run(
        `INSERT INTO rulebook_snapshots
          (id, story_id, rulebook_version, snapshot_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        parsed.id,
        parsed.storyId,
        parsed.rulebookVersion,
        JSON.stringify(parsed.snapshot),
        parsed.createdAt
      );
    },

    async listByStory(storyId) {
      const rows = await db.all<SnapshotRow>(
        `SELECT * FROM rulebook_snapshots
         WHERE story_id = ?
         ORDER BY rulebook_version, created_at`,
        storyId
      );
      return rows.map(fromRow);
    },

    async latest(storyId) {
      const row = await db.get<SnapshotRow>(
        `SELECT * FROM rulebook_snapshots
         WHERE story_id = ?
         ORDER BY rulebook_version DESC, created_at DESC
         LIMIT 1`,
        storyId
      );
      return row ? fromRow(row) : undefined;
    },
  };
}
