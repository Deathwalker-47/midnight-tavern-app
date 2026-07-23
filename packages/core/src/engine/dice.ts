/**
 * Dice (low-level-plan M2 step 1).
 *
 * A single d20 in v1. RNG is injectable so every engine test can seed deterministic
 * rolls; the default uses crypto for real play.
 */

import type { RollMode } from "../types/index.js";

/** A source of randomness: returns a float in [0, 1). */
export type Rng = () => number;

export interface DiceRoll {
  dice: number[];
  usedIndex: number;
  natural: number;
}

/** Default RNG backed by crypto.getRandomValues (uniform, not Math.random). */
export const cryptoRng: Rng = () => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  // Divide by 2^32 to land in [0, 1).
  return buf[0]! / 0x1_0000_0000;
};

/** Roll a d20 (1–20 inclusive) using the given RNG (defaults to crypto). */
export function rollD20(rng: Rng = cryptoRng): number {
  return Math.floor(rng() * 20) + 1;
}

export function rollD20Mode(mode: RollMode, rng: Rng = cryptoRng): DiceRoll {
  const first = rollD20(rng);
  if (mode === "normal") return { dice: [first], usedIndex: 0, natural: first };
  const second = rollD20(rng);
  const useSecond =
    mode === "advantage" ? second > first : second < first;
  const usedIndex = useSecond ? 1 : 0;
  const dice = [first, second];
  return { dice, usedIndex, natural: dice[usedIndex]! };
}

/**
 * A deterministic RNG for tests: yields the given sequence of floats, then repeats
 * the last value. Combine with `d20Sequence` for exact rolls.
 */
export function sequenceRng(values: number[]): Rng {
  let i = 0;
  return () => {
    const v = values[Math.min(i, values.length - 1)] ?? 0;
    i += 1;
    return v;
  };
}

/** Build an Rng that yields exactly the given d20 face values (1–20), in order. */
export function d20Sequence(faces: number[]): Rng {
  // rollD20 computes floor(rng()*20)+1, so face f needs rng() in [(f-1)/20, f/20).
  // Use the midpoint of each face's interval to avoid boundary rounding.
  return sequenceRng(faces.map((f) => (f - 0.5) / 20));
}
