/**
 * Turn-checkpoint repository (table `turn_checkpoints`, low-level-plan-v2 §6).
 *
 * A checkpoint is the pre-image of ALL characters' hard + soft state and the world soft state
 * BEFORE a turn's commits. Because soft state is model-derived and cannot be replayed, swipe/delete/
 * rewind restore these snapshots rather than trying to invert deltas. Written at commit time inside
 * the same per-turn transaction as the narrator message + rulings (turn.ts step 6).
 *
 * The pre-images are opaque JSON blobs here — the orchestrator owns their shape (maps of
 * characterId → hard/soft state, and the world soft doc). This repo only persists and returns them.
 */
import type { Db } from "../db.js";

/** A stored turn checkpoint. Pre-image blobs are JSON strings the orchestrator (de)serializes. */
export interface CheckpointRecord {
  id: string;
  storyId: string;
  /** The narrator message that closes the turn this checkpoint precedes. */
  messageId: string;
  turnIndex: number;
  /** JSON: { [characterId]: CharacterHardState } for every character before this turn's commits. */
  hardPreJson: string;
  /** JSON: { [characterId]: CharacterSoftState } for every character before this turn's patch. */
  softPreJson: string;
  /** JSON: { [characterId]: boolean } for every registry character before this turn. */
  presencePreJson: string;
  /** JSON: { [characterId]: displayName } before identity enrichment in this turn. */
  identityPreJson?: string;
  /** JSON: WorldSoftState before this turn, or null when the story had none yet. */
  worldPreJson: string | null;
  createdAt: number;
}

interface Row {
  id: string;
  story_id: string;
  message_id: string;
  turn_index: number;
  hard_pre_json: string;
  soft_pre_json: string;
  presence_pre_json: string;
  identity_pre_json: string;
  world_pre_json: string | null;
  created_at: number;
}

function toRecord(row: Row): CheckpointRecord {
  return {
    id: row.id,
    storyId: row.story_id,
    messageId: row.message_id,
    turnIndex: row.turn_index,
    hardPreJson: row.hard_pre_json,
    softPreJson: row.soft_pre_json,
    presencePreJson: row.presence_pre_json,
    identityPreJson: row.identity_pre_json,
    worldPreJson: row.world_pre_json,
    createdAt: row.created_at,
  };
}

export interface CheckpointRepo {
  insert(record: CheckpointRecord): Promise<void>;
  /** The checkpoint that precedes a given narrator message (the turn it closes), if any. */
  getByMessage(messageId: string): Promise<CheckpointRecord | undefined>;
  /** The checkpoint for a given turn index in a story, if any. */
  getByTurnIndex(storyId: string, turnIndex: number): Promise<CheckpointRecord | undefined>;
  /** All checkpoints for a story in turn order. */
  listByStory(storyId: string): Promise<CheckpointRecord[]>;
  delete(id: string): Promise<void>;
  /** Delete every checkpoint at or after a turn index (used by rewind/truncate). */
  deleteFrom(storyId: string, turnIndex: number): Promise<void>;
}

export function makeCheckpointRepo(db: Db): CheckpointRepo {
  return {
    async insert(record) {
      await db.run(
        `INSERT INTO turn_checkpoints
           (id, story_id, message_id, turn_index, hard_pre_json, soft_pre_json,
            presence_pre_json, identity_pre_json, world_pre_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        record.id,
        record.storyId,
        record.messageId,
        record.turnIndex,
        record.hardPreJson,
        record.softPreJson,
        record.presencePreJson,
        record.identityPreJson ?? "{}",
        record.worldPreJson,
        record.createdAt
      );
    },

    async getByMessage(messageId) {
      const row = await db.get<Row>(
        "SELECT * FROM turn_checkpoints WHERE message_id = ?",
        messageId
      );
      return row ? toRecord(row) : undefined;
    },

    async getByTurnIndex(storyId, turnIndex) {
      const row = await db.get<Row>(
        "SELECT * FROM turn_checkpoints WHERE story_id = ? AND turn_index = ?",
        storyId,
        turnIndex
      );
      return row ? toRecord(row) : undefined;
    },

    async listByStory(storyId) {
      const rows = await db.all<Row>(
        "SELECT * FROM turn_checkpoints WHERE story_id = ? ORDER BY turn_index",
        storyId
      );
      return rows.map(toRecord);
    },

    async delete(id) {
      await db.run("DELETE FROM turn_checkpoints WHERE id = ?", id);
    },

    async deleteFrom(storyId, turnIndex) {
      await db.run(
        "DELETE FROM turn_checkpoints WHERE story_id = ? AND turn_index >= ?",
        storyId,
        turnIndex
      );
    },
  };
}
