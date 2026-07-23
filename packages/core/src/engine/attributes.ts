import type { CharacterHardState, StorySchema } from "../types/index.js";

export const ATTRIBUTE_MIN = 1;
export const ATTRIBUTE_MAX = 30;
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

export function clampAttribute(score: number): number {
  return Math.max(ATTRIBUTE_MIN, Math.min(ATTRIBUTE_MAX, Math.round(score)));
}
