/**
 * Dice suite — seeded sequence RNG for determinism, plus the default crypto-backed
 * RNG's range and uniformity-of-bounds (a d20 stays within 1–20 across many rolls).
 */
import { describe, it, expect } from "vitest";
import { rollD20, cryptoRng, d20Sequence, sequenceRng } from "../src/index.js";

describe("d20Sequence", () => {
  it("returns each seeded face in order", () => {
    const rng = d20Sequence([1, 20, 7]);
    expect(rollD20(rng)).toBe(1);
    expect(rollD20(rng)).toBe(20);
    expect(rollD20(rng)).toBe(7);
  });
});

describe("sequenceRng", () => {
  it("repeats the last value once the sequence is exhausted", () => {
    const rng = d20Sequence([13]);
    expect(rollD20(rng)).toBe(13);
    expect(rollD20(rng)).toBe(13); // exhausted ⇒ repeats last face
  });

  it("falls back to 0 for an empty sequence", () => {
    const rng = sequenceRng([]);
    expect(rng()).toBe(0);
    expect(rollD20(rng)).toBe(1); // floor(0*20)+1
  });
});

describe("rollD20 with cryptoRng (default)", () => {
  it("always lands in 1..20 inclusive", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const n = rollD20(); // default cryptoRng
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(20);
      expect(Number.isInteger(n)).toBe(true);
      seen.add(n);
    }
    // Over 2000 rolls we expect broad coverage of the face range.
    expect(seen.size).toBeGreaterThan(15);
  });

  it("cryptoRng yields a float in [0, 1)", () => {
    for (let i = 0; i < 100; i++) {
      const x = cryptoRng();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});
