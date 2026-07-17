/**
 * Unlock suite — tryUnlock across the three unlock paths (trainer/manual/trial),
 * prerequisite and cost enforcement, and the guard cases (unfrozen, dead, unknown
 * skill, already learned, bad path index).
 */
import { describe, it, expect } from "vitest";
import { tryUnlock } from "../src/index.js";
import { makeStory, makePlayer, learned } from "./fixtures.js";

describe("tryUnlock — guards", () => {
  it("fails on an unfrozen schema", () => {
    const r = tryUnlock(makeStory({ locked: false }), makePlayer(), "lockpicking", 0);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not frozen/i);
  });

  it("fails for a dead actor", () => {
    const r = tryUnlock(makeStory(), makePlayer({ alive: false }), "lockpicking", 0);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not alive/i);
  });

  it("fails for an unknown skill", () => {
    const r = tryUnlock(makeStory(), makePlayer(), "necromancy", 0);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/unknown skill/i);
  });

  it("fails when the skill is already learned", () => {
    const r = tryUnlock(makeStory(), makePlayer(), "blade", 0); // player starts with blade
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/already learned/i);
  });

  it("fails for an out-of-range path index", () => {
    const r = tryUnlock(makeStory(), makePlayer(), "lockpicking", 9);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/no such unlock path/i);
  });
});

describe("tryUnlock — trainer path", () => {
  it("learns when the trainer cost is affordable, staging cost + novice grant", () => {
    // blade trainer costs 5 gold; give the player gold and remove starting blade.
    const p = makePlayer({ skills: [], inventory: [{ itemId: "gold", qty: 5 }] });
    const r = tryUnlock(makeStory(), p, "blade", 0);
    expect(r.ok).toBe(true);
    expect(r.mutations).toContainEqual({
      kind: "removeItem",
      characterId: "kestrel",
      itemId: "gold",
      qty: 5,
    });
    expect(r.mutations).toContainEqual({
      kind: "setSkill",
      characterId: "kestrel",
      skillId: "blade",
      rank: "novice",
      successCount: 0,
    });
  });

  it("fails when the trainer cost is unaffordable", () => {
    const p = makePlayer({ skills: [], inventory: [{ itemId: "gold", qty: 1 }] });
    const r = tryUnlock(makeStory(), p, "blade", 0);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/cannot afford/i);
    expect(r.mutations).toHaveLength(0);
  });
});

describe("tryUnlock — manual path", () => {
  it("learns when the manual is held", () => {
    const p = makePlayer({ inventory: [{ itemId: "lockpick_manual", qty: 1 }] });
    const r = tryUnlock(makeStory(), p, "lockpicking", 0);
    expect(r.ok).toBe(true);
    expect(r.mutations).toContainEqual({
      kind: "setSkill",
      characterId: "kestrel",
      skillId: "lockpicking",
      rank: "novice",
      successCount: 0,
    });
  });

  it("fails when the manual is absent", () => {
    const r = tryUnlock(makeStory(), makePlayer({ inventory: [] }), "lockpicking", 0);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/unavailable/i);
  });

  it("stages a resource cost when learning via the trainer path (index 1)", () => {
    // lockpicking path 1: trainer for 4 stamina.
    const p = makePlayer({ inventory: [] });
    const r = tryUnlock(makeStory(), p, "lockpicking", 1);
    expect(r.ok).toBe(true);
    expect(r.mutations).toContainEqual({
      kind: "resourceDelta",
      characterId: "kestrel",
      resourceId: "stamina",
      delta: -4,
    });
  });
});

describe("tryUnlock — trial path", () => {
  it("learns when the trial flag is set", () => {
    const p = makePlayer({ flags: { won_debate: true } });
    const r = tryUnlock(makeStory(), p, "silver_tongue", 0);
    expect(r.ok).toBe(true);
  });

  it("fails when the trial flag is unset", () => {
    const r = tryUnlock(makeStory(), makePlayer(), "silver_tongue", 0);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/unavailable/i);
  });
});

describe("tryUnlock — prerequisites", () => {
  it("fails when a skill prerequisite is missing", () => {
    // alchemy requires lockpicking; give the trainer cost but not the prereq.
    const p = makePlayer({ inventory: [{ itemId: "gold", qty: 5 }] });
    const r = tryUnlock(makeStory(), p, "alchemy", 0);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/prerequisite/i);
  });

  it("learns when the prerequisite is met and cost affordable", () => {
    const p = makePlayer({
      skills: [learned("lockpicking", "novice")],
      inventory: [{ itemId: "gold", qty: 5 }],
    });
    const r = tryUnlock(makeStory(), p, "alchemy", 0);
    expect(r.ok).toBe(true);
    // alchemy trainer cost is 1 gold (items), staged as removeItem.
    expect(r.mutations).toContainEqual({
      kind: "removeItem",
      characterId: "kestrel",
      itemId: "gold",
      qty: 1,
    });
  });
});
