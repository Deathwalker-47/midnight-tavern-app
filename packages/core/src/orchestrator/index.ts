/**
 * Orchestrator barrel (low-level-plan §M6, §7).
 *
 * The per-turn pipeline (`submitTurn`) and its context assembler. This is the seam the app
 * layer drives: give it a story id and the player's text, get back prose + rulings.
 */
export {
  submitTurn,
  ensureHardState,
  type SubmitTurnOptions,
  type SubmitTurnResult,
} from "./turn.js";
export {
  assembleContext,
  renderRuling,
  approxTokens,
  buildNarratorSystem,
  NARRATOR_PREAMBLE,
  AUTHORITY_CLAUSE,
  NARRATOR_SYSTEM,
  DEFAULT_CONTEXT_BUDGET,
  LOREBOOK_BUDGET,
  type AssembleContextArgs,
  type AssembledContext,
} from "./context.js";
export {
  swipeLastTurn,
  selectVariant,
  deleteLastTurn,
  deleteFromExchange,
  rewindTo,
  type SwipeOptions,
  type SwipeResult,
} from "./history.js";
export {
  capture,
  restore,
  decodeSnapshot,
  type CheckpointSnapshot,
} from "./checkpoint.js";
