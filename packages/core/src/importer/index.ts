/**
 * Card importer barrel (low-level-plan §M9).
 *
 * Parse V2/V3 character cards from PNG, raw JSON, or a URL, and map them onto the app's
 * import shapes (premise + soft identity + openings + lorebook). Mechanical content never
 * comes from a card — only through the bootstrapper, seeded by the mapped premise.
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
export { mapCardToImport, type MappedCard, type LorebookSeed } from "./mapToSchema.js";
