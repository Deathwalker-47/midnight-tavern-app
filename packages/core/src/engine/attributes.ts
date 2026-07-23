import type { AttributeDef, CharacterHardState, StorySchema } from "../types/index.js";

export const ATTRIBUTE_MIN = 1;
export const ATTRIBUTE_MAX = 20;
export const DEFAULT_ATTRIBUTE_SCORE = 10;

/** Sole score-to-modifier derivation used by the engine and UI. */
export function scoreToMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** Read a score without materializing defaults on generic characters. */
export function attrScore(
  actor: CharacterHardState,
  attributeId: string | undefined,
  schema?: StorySchema
): number {
  if (!attributeId) return DEFAULT_ATTRIBUTE_SCORE;
  return (
    actor.attributes[attributeId] ??
    schema?.attributes.find((attribute) => attribute.id === attributeId)?.defaultScore ??
    DEFAULT_ATTRIBUTE_SCORE
  );
}

export function maximumAttributeScore(definition?: AttributeDef): number {
  if (definition?.lockedAtZero) return 0;
  if (definition?.superhuman) {
    return Math.max(21, definition.maximumScore ?? definition.defaultScore);
  }
  return ATTRIBUTE_MAX;
}

export function clampAttribute(score: number, definition?: AttributeDef): number {
  if (definition?.lockedAtZero) return 0;
  return Math.max(
    ATTRIBUTE_MIN,
    Math.min(maximumAttributeScore(definition), Math.round(score))
  );
}
