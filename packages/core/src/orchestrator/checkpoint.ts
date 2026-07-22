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
 * Runs inside its own transaction so a partial restore never lands. For use inside a caller's
 * existing transaction (atomic delete/rewind), call {@link applyRestore} directly.
 */
export async function restore(store: Store, record: CheckpointRecord): Promise<void> {
  await store.transaction(async () => {
    await applyRestore(store, record);
  });
}

/**
 * The transaction-free body of {@link restore}. Restores every character present in the snapshot,
 * restores (or clears) world soft, and — critically for exact pre-image fidelity (§6) — DELETES any
 * character created AFTER the checkpoint and CLEARS soft/world that didn't exist in the pre-image.
 * Must be called inside a `store.transaction`.
 */
export async function applyRestore(store: Store, record: CheckpointRecord): Promise<void> {
  const snap = decodeSnapshot(record);

  // Drop characters that did not exist at checkpoint time (their hard state has no pre-image to
  // roll back to). A character is "in the pre-image" iff it appears in the hard snapshot.
  const roster = await store.characters.listByStory(record.storyId);
  for (const c of roster) {
    if (!(c.id in snap.hard)) {
      await store.characters.delete(c.id);
    }
  }

  for (const [id, hard] of Object.entries(snap.hard)) {
    const existing = await store.characters.get(id);
    if (existing) await store.characters.updateHard(id, hard);
  }
  await restoreSoftForSnapshot(store, snap);

  // World: restore the pre-image, or clear it if the checkpoint had no world doc (a world created
  // after the checkpoint must not survive the rollback).
  if (snap.world) await store.worldSoft.set(record.storyId, snap.world);
  else await store.worldSoft.clear(record.storyId);
}

/** Restore each character's soft state from a snapshot; clear soft that wasn't in the pre-image. */
async function restoreSoftForSnapshot(store: Store, snap: CheckpointSnapshot): Promise<void> {
  for (const id of Object.keys(snap.hard)) {
    const existing = await store.characters.get(id);
    if (!existing) continue;
    const soft = snap.soft[id];
    if (soft) await store.characters.updateSoft(id, soft, soft.tier);
    else await store.characters.clearSoft(id);
  }
}

/**
 * Snapshot the story's CURRENT soft + world state (no hard) into a checkpoint record shape — used by
 * swipe to record the post-analyzer soft/world that matches a freshly-regenerated variant (§6 step
 * 5). Hard blobs are retained so restore knows which characters existed; swipe never mutates hard.
 */
export async function snapshotSoftWorld(
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

/**
 * Restore ONLY soft + world state from a snapshot (leaving hard + rulings untouched) — swipe's
 * undo of a variant's analyzer patch (§6 step 2/5). Runs inside its own transaction.
 */
export async function restoreSoftWorld(store: Store, record: CheckpointRecord): Promise<void> {
  const snap = decodeSnapshot(record);
  await store.transaction(async () => {
    await restoreSoftForSnapshot(store, snap);
    if (snap.world) await store.worldSoft.set(record.storyId, snap.world);
    else await store.worldSoft.clear(record.storyId);
  });
}
