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
import {
  blueprintToStyleInputs,
  type Ruling,
  type CharacterSoftState,
  type WorldSoftState,
} from "../types/index.js";
import { assembleContext } from "./context.js";
import { applyRestore, restoreSoftWorld } from "./checkpoint.js";
import { requireStory } from "./turn.js";
import { runAnalyzer } from "../memory/analyzer.js";

/** Per-variant soft/world snapshot: the post-analyzer state that matches one narrator variant (§6). */
interface VariantState {
  soft: Record<string, CharacterSoftState>;
  world?: WorldSoftState;
}

/** Serialize the story's CURRENT soft + world into a VariantState (post-analyzer, for one variant). */
async function captureVariantState(store: Store, storyId: string): Promise<VariantState> {
  const roster = await store.characters.listByStory(storyId);
  const soft: Record<string, CharacterSoftState> = {};
  for (const c of roster) if (c.soft) soft[c.id] = c.soft;
  const world = await store.worldSoft.get(storyId);
  return world ? { soft, world } : { soft };
}

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
 * Regenerate the last narrator turn's prose as a new variant (§6). The turn's committed rulings and
 * ALL hard state are re-used verbatim — the die already fell, so the mechanical outcome is identical
 * across swipes; only the telling changes. But soft state legitimately differs (the analyzer reads
 * prose), so each variant carries its OWN post-analyzer soft/world snapshot:
 *
 *   1. capture the CURRENT variant's soft/world (so cycling back to it later needs no model call);
 *   2. restore the turn's soft/world PRE-IMAGE (undo the current variant's analyzer patch) — hard
 *      state and rulings are untouched;
 *   3. re-run the narrator with the identical context + rulings → new prose;
 *   4. re-run the analyzer on the new prose → new soft/world;
 *   5. snapshot the new variant's soft/world and make it active.
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

  // The turn's checkpoint holds the soft/world PRE-IMAGE (before any analyzer patch this turn).
  const checkpoint = await store.checkpoints.getByMessage(narrator.id);

  // (1) Preserve the currently-shown variant's post-analyzer state before we overwrite soft/world.
  const priorVariants = narrator.variants ?? [narrator.content];
  const priorActive = narrator.activeVariant ?? 0;
  const states = await loadVariantStates(store, narrator.id);
  states[priorActive] = await captureVariantState(store, storyId);

  // (2) Roll soft/world back to the pre-image so the analyzer re-reads from the same start the
  //     original turn did. Hard state + rulings are deliberately NOT touched.
  if (checkpoint) await restoreSoftWorld(store, checkpoint);

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

  // (3) Regenerate prose.
  const response = await router.stream(
    "narrator",
    { system: context.system, user: context.user },
    opts.onDelta ?? (() => {}),
    { ...(opts.signal ? { signal: opts.signal } : {}) }
  );

  // (4) Re-run the analyzer on the NEW prose (it applies its own soft/world patch).
  const nameById = new Map(roster.map((c) => [c.id, c.name]));
  const presentSoft = roster
    .map((c) => c.soft)
    .filter((s): s is NonNullable<typeof s> => s !== undefined);
  await runAnalyzer(router, store, {
    storyId,
    turnIdx: narrator.idx,
    playerText,
    narratorText: response.content,
    presentSoft,
    nameFor: (id) => nameById.get(id),
    ...(opts.signal ? { signal: opts.signal } : {}),
  });

  // (5) Snapshot the new variant's post-analyzer state; make it active.
  const variants = [...priorVariants, response.content];
  const activeVariant = variants.length - 1;
  states[activeVariant] = await captureVariantState(store, storyId);
  await store.messages.setVariants(narrator.id, variants, activeVariant);
  await store.messages.setVariantStatesJson(narrator.id, JSON.stringify(states));
  return { variants, activeVariant };
}

/**
 * Switch which stored variant of a narrator message is shown (§6 step 5). No model call — the prose
 * and its matching soft/world snapshot already exist from a prior swipe. Restores that variant's
 * soft/world so the shown prose and the stored narrative memory always agree. Clamps out of range.
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

  const states = await loadVariantStates(store, msg.id);
  const target = states[clamped];
  if (target) await applyVariantState(store, storyId, target);
  await store.messages.setVariants(msg.id, variants, clamped);
  return { variants, activeVariant: clamped };
}

/** Load the parallel per-variant soft/world snapshots for a message (empty array if none stored). */
async function loadVariantStates(store: Store, messageId: string): Promise<VariantState[]> {
  const raw = await store.messages.getVariantStatesJson(messageId);
  if (!raw) return [];
  return JSON.parse(raw) as VariantState[];
}

/** Write a stored variant's soft/world back (mirrors checkpoint soft-restore: set present, clear rest). */
async function applyVariantState(store: Store, storyId: string, state: VariantState): Promise<void> {
  await store.transaction(async () => {
    const roster = await store.characters.listByStory(storyId);
    for (const c of roster) {
      const soft = state.soft[c.id];
      if (soft) await store.characters.updateSoft(c.id, soft, soft.tier);
      else await store.characters.clearSoft(c.id);
    }
    if (state.world) await store.worldSoft.set(storyId, state.world);
    else await store.worldSoft.clear(storyId);
  });
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

  // The player message that opened this turn (if any) is the first idx to drop.
  const player = await store.messages.getByIndex(storyId, lastIdx - 1);
  const fromIdx = player?.role === "player" ? lastIdx - 1 : lastIdx;

  // Restore + truncate + summary-invalidation in ONE transaction (§6): if any step throws, the whole
  // rollback aborts, so state and transcript can never disagree.
  await store.transaction(async () => {
    if (checkpoint) await applyRestore(store, checkpoint);
    await store.rulings.deleteFromIdx(storyId, fromIdx);
    await store.messages.deleteFrom(storyId, fromIdx);
    await store.checkpoints.deleteFrom(storyId, fromIdx);
    await invalidateSummariesFrom(store, storyId, fromIdx);
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
  await store.transaction(async () => {
    if (target) await applyRestore(store, target);
    await store.rulings.deleteFromIdx(storyId, fromIdx);
    await store.messages.deleteFrom(storyId, fromIdx);
    await store.checkpoints.deleteFrom(storyId, fromIdx);
    await invalidateSummariesFrom(store, storyId, fromIdx);
  });
}

/**
 * Delete chapters that summarize any message at or after `fromIdx`, then cascade to arcs that fold
 * any deleted chapter (§6 — "delete chapters/arcs built from truncated messages"). The summarizer
 * rebuilds both at the next threshold. Call inside the caller's transaction.
 */
async function invalidateSummariesFrom(store: Store, storyId: string, fromIdx: number): Promise<void> {
  const firstDeletedChapterIdx = await store.chapters.deleteFromMsgIdx(storyId, fromIdx);
  if (firstDeletedChapterIdx !== null) {
    await store.arcs.deleteFromChapterIdx(storyId, firstDeletedChapterIdx);
  }
}
