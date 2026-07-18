/**
 * Memory analyzer (low-level-plan §M7.1, §8.3).
 *
 * After each narrator reply the orchestrator fires this — async, non-blocking — to fold the
 * latest exchange into soft state. It makes one structured `analyzer`-role call for a
 * `SoftStatePatch`, then hands the patch to `applySoftPatch`.
 *
 * Because it runs off the turn's critical path, `runAnalyzer` never throws: a model or parse
 * failure here must not corrupt or interrupt play. Callers get a boolean (applied / skipped)
 * for logging, and a thrown analyzer error is swallowed after being surfaced via `onError`.
 */
import { callStructured, type Router } from "../router/index.js";
import type { Store } from "../store/index.js";
import { SoftStatePatchSchema, type CharacterSoftState } from "../types/index.js";
import { ANALYZER_SYSTEM, buildAnalyzerUser } from "./prompt.js";
import { applySoftPatch } from "./softStore.js";

export interface RunAnalyzerArgs {
  storyId: string;
  /** Turn index to stamp observations with (the narrator message's idx). */
  turnIdx: number;
  playerText: string;
  narratorText: string;
  /** Soft snapshots of characters present this turn (for prompt context). */
  presentSoft: CharacterSoftState[];
  /** Resolve a display name for an analyzer-introduced characterId. */
  nameFor?: (characterId: string) => string | undefined;
  maxRepairs?: number;
  signal?: AbortSignal;
  /** Non-throwing error sink (the analyzer never propagates failures to the turn). */
  onError?: (err: unknown) => void;
}

/**
 * Run the analyzer for one exchange and persist the resulting patch. Returns true if a
 * patch was applied, false if it was skipped or failed. Never throws.
 */
export async function runAnalyzer(router: Router, store: Store, args: RunAnalyzerArgs): Promise<boolean> {
  try {
    const patch = await callStructured(
      router,
      "analyzer",
      {
        system: ANALYZER_SYSTEM,
        user: buildAnalyzerUser({
          playerText: args.playerText,
          narratorText: args.narratorText,
          presentSoft: args.presentSoft,
        }),
      },
      SoftStatePatchSchema,
      { maxRepairs: args.maxRepairs ?? 2, signal: args.signal }
    );

    if (patch.characterOps.length === 0 && patch.worldOps.length === 0) return false;

    applySoftPatch(store, args.storyId, patch, args.turnIdx, args.nameFor);
    return true;
  } catch (err) {
    args.onError?.(err);
    return false;
  }
}
