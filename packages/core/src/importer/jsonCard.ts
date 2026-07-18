/**
 * JSON card parser (low-level-plan §M9.2).
 *
 * Parses a raw JSON card file — the same V2/V3 payload a PNG carries in its `chara` chunk,
 * but as a standalone `.json`. Thin wrapper over `parseCardObject`: JSON.parse then validate,
 * turning a syntax error into a `CardParseError` so callers only handle one failure type.
 */
import { parseCardObject, CardParseError, type CharacterCard } from "./cardTypes.js";

/** Parse a JSON string into a validated character card. */
export function parseJsonCard(text: string): CharacterCard {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (err) {
    throw new CardParseError(`Card JSON is not valid: ${(err as Error).message}`);
  }
  return parseCardObject(value);
}

/** Parse card bytes (UTF-8 JSON) into a validated character card. */
export function parseJsonCardBytes(bytes: Uint8Array): CharacterCard {
  return parseJsonCard(new TextDecoder("utf-8").decode(bytes));
}
