import { describe, expect, it } from "vitest";
import {
  DIFFICULTY_PRESETS,
  d20Sequence,
  effectiveDc,
  normalizeDifficultyConfig,
  rollD20Mode,
  scaleDamageDelta,
} from "../src/index.js";
import { makeEnemy, makePlayer, makeStory } from "./fixtures.js";

describe("V7 d20 roll modes", () => {
  it("rolls normal, advantage, disadvantage, and deterministic ties", () => {
    expect(rollD20Mode("normal", d20Sequence([14]))).toEqual({
      dice: [14],
      usedIndex: 0,
      natural: 14,
    });
    expect(rollD20Mode("advantage", d20Sequence([6, 18]))).toEqual({
      dice: [6, 18],
      usedIndex: 1,
      natural: 18,
    });
    expect(rollD20Mode("disadvantage", d20Sequence([6, 18]))).toEqual({
      dice: [6, 18],
      usedIndex: 0,
      natural: 6,
    });
    expect(rollD20Mode("advantage", d20Sequence([12, 12])).usedIndex).toBe(0);
    expect(rollD20Mode("disadvantage", d20Sequence([12, 12])).usedIndex).toBe(0);
  });
});

describe("V7 difficulty", () => {
  it("uses approved presets and clamps custom values", () => {
    expect(DIFFICULTY_PRESETS.story).toEqual({
      dcOffset: -2,
      damageTakenMultiplier: 0.6,
      damageDealtMultiplier: 1.25,
    });
    expect(
      normalizeDifficultyConfig({
        preset: "custom",
        dcOffset: 20,
        damageTakenMultiplier: 0.01,
        damageDealtMultiplier: 20,
      })
    ).toEqual({
      preset: "custom",
      dcOffset: 4,
      damageTakenMultiplier: 0.25,
      damageDealtMultiplier: 2.5,
    });
  });

  it("offsets player flat checks only and clamps to the schema DC band", () => {
    const action = makeStory().actions[0]!;
    expect(
      effectiveDc(
        { ...action, dc: 24 },
        makePlayer(),
        { preset: "brutal", ...DIFFICULTY_PRESETS.brutal }
      )
    ).toBe(25);
    expect(
      effectiveDc(
        { ...action, dc: 6 },
        makePlayer(),
        { preset: "story", ...DIFFICULTY_PRESETS.story }
      )
    ).toBe(5);
    expect(
      effectiveDc(
        { ...action, dc: 12 },
        makeEnemy(),
        { preset: "hard", ...DIFFICULTY_PRESETS.hard }
      )
    ).toBe(12);
    expect(
      effectiveDc(
        { ...action, dc: 12, opposed: true },
        makePlayer(),
        { preset: "hard", ...DIFFICULTY_PRESETS.hard }
      )
    ).toBe(12);
  });

  it("scales damage only and locks in JavaScript rounding/minimum bite", () => {
    expect(scaleDamageDelta(-5, 1.3)).toBe(-6);
    expect(scaleDamageDelta(-1, 0.25)).toBe(-1);
    expect(scaleDamageDelta(5, 1.6)).toBe(5);
  });
});
