/**
 * Classifier barrel (low-level-plan §M4).
 */
export { classify } from "./classify.js";
export {
  buildClassifierSchema,
  buildClassifierUser,
  CLASSIFIER_SYSTEM,
  CONFIDENCE_THRESHOLD,
  type PresentCharacter,
  type ClassifyInput,
} from "./prompt.js";
