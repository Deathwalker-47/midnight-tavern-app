/**
 * Turn checkpoint capture + restore (low-level-plan-v2 §6).
 *
 * Soft state is model-derived and cannot be replayed deterministically, and hard-state deltas are
 * committed destructively. So swipe / delete / rewind rely on a pre-image snapshot taken BEFORE a
 * turn mutates anything: every character's hard + soft state, plus the world soft doc. `capture`
 * serializes that snapshot for `turn_checkpoints`; `restore` writes it back verbatim.
 *
 * The snapshot is a plain JSON map keyed by characterId — opaque to the checkpoint repo, owned here.
 */
import { randomUUID } from "../util/uuid.js";
import type { Store, CheckpointRecord } from "../store/index.js";
import {
  CharacterHardStateSchema,
  CharacterSoftStateSchema,
  WorldSoftStateSchema,
  type CharacterHardState,
  type CharacterSoftState,
  type WorldSoftState,
} from "../types/index.js";

/** The deserialized shape of a checkpoint's pre-image blobs. */
export interface CheckpointSnapshot {
  hard: Record<string, CharacterHardState>;
  soft: Record<string, CharacterSoftState>;
  world?: WorldSoftState;
}

/**
 * Build (but do not persist) a checkpoint for the story's CURRENT state. Call this inside the turn
 * transaction BEFORE any hard-state commit or soft-state patch. `messageId`/`turnIndex` bind it to
 * the narrator message the turn produces.
 */
export async function capture(
  store: Store,
  storyId: string,
  messageId: string,
  turnIndex: number
): Promise<CheckpointRecord> {
  const roster = await store.characters.listByStory(storyId);
  const hard: Record<string, CharacterHardState> = {};
  const soft: Record<string, CharacterSoftState> = {};
  for (const c of roster) {
    hard[c.id] = c.hard;
    if (c.soft) soft[c.id] = c.soft;
  }
  const world = await store.worldSoft.get(storyId);
  return {
    id: randomUUID(),
    storyId,
    messageId,
    turnIndex,
    hardPreJson: JSON.stringify(hard),
    softPreJson: JSON.stringify(soft),
    worldPreJson: world ? JSON.stringify(world) : null,
    createdAt: Date.now(),
  };
}

/** Parse a stored checkpoint's blobs back into typed snapshot state. */
export function decodeSnapshot(record: CheckpointRecord): CheckpointSnapshot {
  const hardRaw = JSON.parse(record.hardPreJson) as Record<string, unknown>;
  const softRaw = JSON.parse(record.softPreJson) as Record<string, unknown>;
  const hard: Record<string, CharacterHardState> = {};
  for (const [id, v] of Object.entries(hardRaw)) hard[id] = CharacterHardStateSchema.parse(v);
  const soft: Record<string, CharacterSoftState> = {};
  for (const [id, v] of Object.entries(softRaw)) soft[id] = CharacterSoftStateSchema.parse(v);
  const snapshot: CheckpointSnapshot = { hard, soft };
  if (record.worldPreJson) snapshot.world = WorldSoftStateSchema.parse(JSON.parse(record.worldPreJson));
  return snapshot;
}

/**
 * Restore a story's hard + soft + world state to a checkpoint's pre-image (low-level-plan-v2 §6).
 * Writes only characters present in the snapshot; a character created AFTER the checkpoint keeps
 * its row (the caller truncates messages/checkpoints separately — this only rolls back state).
 * Runs inside its own transaction so a partial restore never lands.
 */
export async function restore(store: Store, record: CheckpointRecord): Promise<void> {
  const snap = decodeSnapshot(record);
  await store.transaction(async () => {
    for (const [id, hard] of Object.entries(snap.hard)) {
      const existing = await store.characters.get(id);
      if (existing) await store.characters.updateHard(id, hard);
    }
    for (const [id, soft] of Object.entries(snap.soft)) {
      const existing = await store.characters.get(id);
      if (existing) await store.characters.updateSoft(id, soft, soft.tier);
    }
    if (snap.world) await store.worldSoft.set(record.storyId, snap.world);
  });
}
