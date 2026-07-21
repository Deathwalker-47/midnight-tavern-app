/**
 * Memory barrel (low-level-plan §M7).
 *
 * The soft-state layer: the analyzer (narrative extraction), the patch-merge store that is
 * "the wall" against mechanical writes, and the read-only living-card projection the UI
 * renders.
 */
export { runAnalyzer, type RunAnalyzerArgs } from "./analyzer.js";
export { ANALYZER_SYSTEM, buildAnalyzerUser, type AnalyzerInput } from "./prompt.js";
export {
  applySoftPatch,
  applyCharacterOp,
  applyWorldOp,
  newSoftState,
  newWorldSoftState,
  OBSERVATION_CAP,
} from "./softStore.js";
export {
  getLivingCard,
  type LivingCardView,
  type ResourceBar,
  type InventoryLine,
  type SkillLine,
} from "./cardView.js";
export {
  getCharacterDossier,
  type Dossier,
  type DossierOutgoingEdge,
  type DossierIncomingEdge,
  type DossierSkill,
} from "./dossier.js";
