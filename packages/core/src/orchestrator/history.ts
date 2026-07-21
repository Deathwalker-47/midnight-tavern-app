/**
 * Turn history operations: swipe, delete, rewind (low-level-plan-v2 §6).
 *
 * These sit alongside `submitTurn` and mutate the transcript AFTER a turn has committed. The hard
 * problem they solve: hard-state deltas are destructive and soft state is model-derived, so we can't
 * "undo" by inverting them. Instead every turn writes a pre-image checkpoint (see checkpoint.ts);
 * these operations restore that snapshot and truncate the transcript around it.
 *
 *   • swipe    — regenerate the LAST narrator message's prose as a new variant. The turn's dice
 *                rulings are already decided and stay fixed; only prose changes. State is untouched.
 *   • deleteLastTurn — remove the last narrator turn (and its player message), rolling hard/soft/
 *                world state back to the turn's checkpoint.
 *   • rewindTo — roll back to just before turn N: restore N's checkpoint, then truncate every
 *                message, ruling, and checkpoint at idx ≥ N.
 *
 * All three run inside store transactions so a partial edit never lands.
 */
import type { Router } from "../router/index.js";
import type { Store } from "../store/index.js";
import { blueprintToStyleInputs, type Ruling } from "../types/index.js";
import { assembleContext } from "./context.js";
import { restore } from "./checkpoint.js";
import { requireStory } from "./turn.js";

/** Options shared by regenerating operations. */
export interface SwipeOptions {
  /** Live narrator deltas for the regenerated prose. */
  onDelta?: (delta: string) => void;
  personaBlock?: string;
  signal?: AbortSignal;
}

export interface SwipeResult {
  /** The full variant list after the operation. */
  variants: string[];
  /** Index of the active variant. */
  activeVariant: number;
}

/**
 * Regenerate the last narrator turn's prose as a new variant (§6). The turn's committed rulings are
 * re-used verbatim as authoritative facts, so the mechanical outcome is stable across swipes — only
 * the prose voice changes. Appends the new prose to the message's variants and makes it active.
 */
export async function swipeLastTurn(
  router: Router,
  store: Store,
  storyId: string,
  opts: SwipeOptions = {}
): Promise<SwipeResult> {
  const story = await requireStory(store, storyId);
  const schema = story.schema;

  const lastIdx = (await store.messages.nextIdx(storyId)) - 1;
  const narrator = await store.messages.getByIndex(storyId, lastIdx);
  if (!narrator || narrator.role !== "narrator") {
    throw new Error("swipeLastTurn: last message is not a narrator turn.");
  }
  // The player message that opened this turn (idx-1), used to rebuild context.
  const player = await store.messages.getByIndex(storyId, lastIdx - 1);
  const playerText = player?.role === "player" ? player.content : "";

  // Rebuild the SAME context the turn used: committed rulings inline as authoritative facts.
  const rulingRecords = await store.rulings.listByMessage(narrator.id);
  const rulings: Ruling[] = rulingRecords.map((r) => r.ruling);
  const roster = await store.characters.listByStory(storyId);
  const presentIds = roster.map((c) => c.id);
  const styleInputs = blueprintToStyleInputs(story.blueprint);
  const context = await assembleContext(store, {
    storyId,
    schema,
    rulings,
    presentIds,
    playerText,
    styleInputs,
    ...(opts.personaBlock ? { personaBlock: opts.personaBlock } : {}),
  });

  const response = await router.stream(
    "narrator",
    { system: context.system, user: context.user },
    opts.onDelta ?? (() => {}),
    { ...(opts.signal ? { signal: opts.signal } : {}) }
  );

  const variants = [...(narrator.variants ?? [narrator.content]), response.content];
  const activeVariant = variants.length - 1;
  await store.messages.setVariants(narrator.id, variants, activeVariant);
  return { variants, activeVariant };
}

/**
 * Switch which stored variant of a narrator message is shown (§6). No model call — the variants
 * already exist from prior swipes. Clamps out-of-range indices.
 */
export async function selectVariant(
  store: Store,
  storyId: string,
  messageIdx: number,
  variantIndex: number
): Promise<SwipeResult> {
  const msg = await store.messages.getByIndex(storyId, messageIdx);
  if (!msg || msg.role !== "narrator") throw new Error("selectVariant: not a narrator message.");
  const variants = msg.variants ?? [msg.content];
  const clamped = Math.max(0, Math.min(variantIndex, variants.length - 1));
  await store.messages.setVariants(msg.id, variants, clamped);
  return { variants, activeVariant: clamped };
}

/**
 * Delete the last narrator turn and its player message, rolling state back to the turn's checkpoint
 * (§6). After this the story is exactly as it was before the deleted turn was submitted.
 */
export async function deleteLastTurn(store: Store, storyId: string): Promise<void> {
  const lastIdx = (await store.messages.nextIdx(storyId)) - 1;
  if (lastIdx < 0) return;
  const narrator = await store.messages.getByIndex(storyId, lastIdx);
  if (!narrator || narrator.role !== "narrator") {
    throw new Error("deleteLastTurn: last message is not a narrator turn.");
  }
  const checkpoint = await store.checkpoints.getByMessage(narrator.id);
  if (checkpoint) await restore(store, checkpoint);

  // The player message that opened this turn (if any) is the first idx to drop.
  const player = await store.messages.getByIndex(storyId, lastIdx - 1);
  const fromIdx = player?.role === "player" ? lastIdx - 1 : lastIdx;
  await store.transaction(async () => {
    await store.rulings.deleteFromIdx(storyId, fromIdx);
    await store.messages.deleteFrom(storyId, fromIdx);
    await store.checkpoints.deleteFrom(storyId, fromIdx);
  });
}

/**
 * Rewind to `fromIdx`: restore state to just before the first turn at or after `fromIdx`, then
 * truncate every message, ruling, and checkpoint at idx ≥ `fromIdx` (§6). `fromIdx` is the message
 * index of the earliest message to discard — pass a turn's player idx to drop the whole exchange, or
 * its narrator idx to keep the player line.
 *
 * Checkpoints are keyed by their turn's narrator idx, so the pre-image we want is the EARLIEST
 * checkpoint whose turnIndex ≥ fromIdx (its snapshot predates that turn's commits). If none exists
 * at or after fromIdx, there is nothing to roll back — only truncation runs.
 */
export async function rewindTo(store: Store, storyId: string, fromIdx: number): Promise<void> {
  const checkpoints = await store.checkpoints.listByStory(storyId); // ordered by turnIndex
  const target = checkpoints.find((c) => c.turnIndex >= fromIdx);
  if (target) await restore(store, target);
  await store.transaction(async () => {
    await store.rulings.deleteFromIdx(storyId, fromIdx);
    await store.messages.deleteFrom(storyId, fromIdx);
    await store.checkpoints.deleteFrom(storyId, fromIdx);
  });
}
