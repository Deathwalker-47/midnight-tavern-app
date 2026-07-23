/**
 * Character-card import surface.
 *
 * Parses V2/V3 cards from PNG, JSON, or URL and maps narrative fields, lorebook
 * seeds, reviewed typed mechanics, and the preserved raw semantic source.
 */
export {
  parseCardObject,
  CardParseError,
  CardDataSchema,
  CardSpecSchema,
  type CharacterCard,
  type CardData,
  type CardSpec,
  type CardBookEntry,
} from "./cardTypes.js";
export { parsePngCard, isPng } from "./pngCard.js";
export { parseJsonCard, parseJsonCardBytes } from "./jsonCard.js";
export { importCardFromUrl, MAX_CARD_BYTES, type UrlImportOptions } from "./urlImport.js";
export {
  mapCardToImport,
  mapCardToImportWithOptions,
  type MappedCard,
  type LorebookSeed,
  type MapCardOptions,
} from "./mapToSchema.js";
export {
  extractImportedMechanics,
  type ImportedMechanics,
  type ImportedMechanicsProvenance,
  type ImportedAttributeMechanic,
  type ImportedSkillMechanic,
  type ImportedActionMechanic,
} from "./mechanics.js";
