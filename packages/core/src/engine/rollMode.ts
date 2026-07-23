import type {
  ActionDef,
  CharacterHardState,
  RollMode,
  StorySchema,
} from "../types/index.js";
import { conditionHolds } from "./conditions.js";

export interface RollModeResult {
  mode: RollMode;
  advantageSources: string[];
  disadvantageSources: string[];
}

/**
 * Evaluate one side's frozen roll conditions. Multiple sources never stack and
 * one or more sources on both sides cancel to a normal roll while preserving
 * the reasons for the ruling.
 *
 * @param _schema - Frozen story schema retained in the stable resolver API.
 * @param action - Frozen action whose advantage conditions are evaluated.
 * @param actor - Character state for the independently rolling side.
 * @returns Mode plus every matched player-facing source.
 *
 * @remarks Opposed contests call this function independently for each side.
 * @see {@link conditionHolds} for condition semantics.
 * @since 0.1.0
 */
export function computeRollMode(
  _schema: StorySchema,
  action: ActionDef,
  actor: CharacterHardState
): RollModeResult {
  const advantageSources = (action.advantageWhen ?? [])
    .filter(({ condition }) => conditionHolds(actor, condition))
    .map(({ reason }) => reason);
  const disadvantageSources = (action.disadvantageWhen ?? [])
    .filter(({ condition }) => conditionHolds(actor, condition))
    .map(({ reason }) => reason);

  let mode: RollMode = "normal";
  if (advantageSources.length > 0 && disadvantageSources.length === 0) {
    mode = "advantage";
  } else if (disadvantageSources.length > 0 && advantageSources.length === 0) {
    mode = "disadvantage";
  }
  return { mode, advantageSources, disadvantageSources };
}
