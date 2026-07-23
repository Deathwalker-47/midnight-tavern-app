/**
 * Bootstrap barrel (low-level-plan §M5).
 *
 * The single import surface for turning a premise into a frozen, installed story:
 * two-phase generation, cross-validation, deterministic + model repair, freeze, and the
 * pure hard-state instantiation helpers the orchestrator reuses for NPCs (§5).
 */
export {
  generateStorySchema,
  PhaseASchema,
  PhaseBSchema,
  type PhaseA,
  type PhaseB,
  type BootstrapInput,
  type BootstrapOptions,
  type BootstrapPhase,
} from "./generate.js";
export { validateStorySchema } from "./validate.js";
export { deterministicRepair, formatValidationFeedback } from "./repair.js";
export {
  freezeSchema,
  bootstrapStory,
  createNoStatsSchema,
  UnfreezableSchemaError,
  type BootstrapResult,
  type PlayerSeed,
} from "./freeze.js";
export {
  instantiatePlayer,
  instantiateFromTemplate,
  instantiateGeneric,
} from "./instantiate.js";
export { changeStoryStatMode, type ChangeStatModeOptions } from "./switchMode.js";
export {
  PHASE_A_SYSTEM,
  PHASE_B_ACTION_BATCH_SYSTEM,
  PHASE_B_FOUNDATION_SYSTEM,
  buildPhaseAUser,
  buildPhaseBActionBatchUser,
  buildPhaseBFoundationUser,
} from "./prompts.js";
