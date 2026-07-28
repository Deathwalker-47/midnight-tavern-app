/**
 * Orchestrator barrel (low-level-plan §M6, §7).
 *
 * The per-turn pipeline (`submitTurn`) and its context assembler. This is the seam the app
 * layer drives: give it a story id and the player's text, get back prose + rulings.
 */
export {
  submitTurn,
  inspectTurnOperationRecovery,
  retryTurnOperation,
  TurnOperationRecoveryError,
  DEFAULT_TURN_OPERATION_STALE_MS,
  ensureHardState,
  type SubmitTurnOptions,
  type SubmitTurnResult,
  type InspectTurnOperationOptions,
  type RetryTurnOperationOptions,
  type TurnOperationRecoveryInspection,
  type TurnOperationRecoveryReason,
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
  FEEDBACK_PRESETS,
  type SwipeOptions,
  type SwipeResult,
} from "./history.js";
export {
  capture,
  restore,
  decodeSnapshot,
  type CheckpointSnapshot,
} from "./checkpoint.js";
export {
  generateGuardedNarration,
  type GuardedNarrationOptions,
  type GuardedNarrationResult,
} from "./authorityGuard.js";
export {
  determineLootAwards,
  type PendingLootAward,
} from "./loot.js";
export {
  determineAttributeAdvancements,
  recordAttributeAdvancementDecision,
  type AttributeAdvancementAdjudication,
  type DetermineAttributeAdvancementArgs,
} from "./attributeAdvancement.js";
export {
  planNpcTransitions,
  type NpcIntroductionProposal,
  type ApprovedNpcTransition,
  type NpcIntroductionInput,
} from "./npcIntroduction.js";
export {
  SuggestedActionSchema,
  suggestPlayerActions,
  type SuggestedAction,
} from "./suggestions.js";
export {
  getCharacterInventory,
  equipRuntimeItem,
  unequipRuntimeSlot,
  type CharacterInventoryView,
} from "./loadout.js";
export {
  listStoryJournal,
  listCompleteStoryJournal,
  summarizeStoryEvent,
  exportStoryJournal,
  exportStoryJournalMarkdown,
  exportStoryJournalCsv,
  type JournalExportFormat,
  type StoryJournalPage,
  type StoryJournalQuery,
} from "./journal.js";
export {
  regenerateRulebook,
  duplicateAndRegenerateRulebook,
  previewRulebookRegenerationImpact,
  setStoryDifficulty,
  type RulebookRegenerationImpact,
  type RegenerateRulebookOptions,
  type DuplicateAndRegenerateOptions,
} from "./rulebook.js";
