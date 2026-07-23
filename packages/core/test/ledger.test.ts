/**
 * Ledger suite — the sole mutator of hard state. Covers clamping at both bounds,
 * inventory add/remove/stack-drop, flags, skill upsert, death derivation from a
 * lethal resource, and the "died this commit" return.
 */
import { describe, it, expect } from "vitest";
import { commit } from "../src/index.js";
import type { StagedMutation, CharacterHardState } from "../src/index.js";
import { makeStory, makePlayer, makeEnemy } from "./fixtures.js";

/** Wrap one or more characters into the id-keyed map commit expects. */
function mapOf(...chars: CharacterHardState[]): Map<string, CharacterHardState> {
  return new Map(chars.map((c) => [c.characterId, c]));
}

describe("commit — resources", () => {
  it("clamps a resource at its max", () => {
    const p = makePlayer({
      resources: { hp: { current: 18, max: 20 }, stamina: { current: 10, max: 10 } },
    });
    const muts: StagedMutation[] = [
      { kind: "resourceDelta", characterId: "kestrel", resourceId: "hp", delta: 10 },
    ];
    commit(makeStory(), muts, mapOf(p));
    expect(p.resources.hp!.current).toBe(20);
  });

  it("clamps a resource at zero (never negative)", () => {
    const p = makePlayer();
    const muts: StagedMutation[] = [
      { kind: "resourceDelta", characterId: "kestrel", resourceId: "stamina", delta: -999 },
    ];
    commit(makeStory(), muts, mapOf(p));
    expect(p.resources.stamina!.current).toBe(0);
  });

  it("ignores a delta to an unknown resource", () => {
    const p = makePlayer();
    const muts: StagedMutation[] = [
      { kind: "resourceDelta", characterId: "kestrel", resourceId: "mana", delta: 5 },
    ];
    expect(() => commit(makeStory(), muts, mapOf(p))).not.toThrow();
    expect(p.resources.mana).toBeUndefined();
  });
});

describe("commit — attributes", () => {
  it("uses schema defaults and clamps attribute deltas to the supported range", () => {
    const story = makeStory();
    story.attributes = [
      { id: "might", name: "Might", abbrev: "MIG", description: "Physical power", defaultScore: 10 },
    ];
    const p = makePlayer({ attributes: {} });

    commit(
      story,
      [{ kind: "attributeDelta", characterId: "kestrel", attributeId: "might", delta: 50 }],
      mapOf(p)
    );
    expect(p.attributes.might).toBe(20);

    commit(
      story,
      [{ kind: "attributeDelta", characterId: "kestrel", attributeId: "might", delta: -100 }],
      mapOf(p)
    );
    expect(p.attributes.might).toBe(1);
  });

  it("permits a declared superhuman ceiling above 20", () => {
    const story = makeStory();
    story.attributes = [
      {
        id: "might",
        name: "Might",
        abbrev: "MIG",
        description: "Superhuman power",
        defaultScore: 21,
        superhuman: true,
        maximumScore: 30,
      },
    ];
    const p = makePlayer({ attributes: { might: 21 } });
    commit(
      story,
      [{ kind: "attributeDelta", characterId: "kestrel", attributeId: "might", delta: 50 }],
      mapOf(p)
    );
    expect(p.attributes.might).toBe(30);
  });
});

describe("commit — inventory", () => {
  it("grants a new item stack", () => {
    const p = makePlayer({ inventory: [] });
    commit(makeStory(), [{ kind: "grantItem", characterId: "kestrel", itemId: "gold", qty: 3 }], mapOf(p));
    expect(p.inventory).toContainEqual({ itemId: "gold", qty: 3 });
  });

  it("adds to an existing stack", () => {
    const p = makePlayer({ inventory: [{ itemId: "gold", qty: 2 }] });
    commit(makeStory(), [{ kind: "grantItem", characterId: "kestrel", itemId: "gold", qty: 3 }], mapOf(p));
    expect(p.inventory).toContainEqual({ itemId: "gold", qty: 5 });
  });

  it("removes from a stack", () => {
    const p = makePlayer({ inventory: [{ itemId: "gold", qty: 5 }] });
    commit(makeStory(), [{ kind: "removeItem", characterId: "kestrel", itemId: "gold", qty: 2 }], mapOf(p));
    expect(p.inventory).toContainEqual({ itemId: "gold", qty: 3 });
  });

  it("drops a stack that hits zero", () => {
    const p = makePlayer({ inventory: [{ itemId: "gold", qty: 2 }] });
    commit(makeStory(), [{ kind: "removeItem", characterId: "kestrel", itemId: "gold", qty: 2 }], mapOf(p));
    expect(p.inventory.find((e) => e.itemId === "gold")).toBeUndefined();
  });

  it("clamps over-removal to a dropped stack (never negative qty)", () => {
    const p = makePlayer({ inventory: [{ itemId: "gold", qty: 1 }] });
    commit(makeStory(), [{ kind: "removeItem", characterId: "kestrel", itemId: "gold", qty: 5 }], mapOf(p));
    expect(p.inventory.find((e) => e.itemId === "gold")).toBeUndefined();
  });

  it("removing an absent item is a no-op", () => {
    const p = makePlayer({ inventory: [] });
    expect(() =>
      commit(makeStory(), [{ kind: "removeItem", characterId: "kestrel", itemId: "gold", qty: 1 }], mapOf(p))
    ).not.toThrow();
    expect(p.inventory).toHaveLength(0);
  });
});

describe("commit — flags & skills", () => {
  it("sets a flag", () => {
    const p = makePlayer();
    commit(makeStory(), [{ kind: "setFlag", characterId: "kestrel", flagId: "door_open", value: true }], mapOf(p));
    expect(p.flags.door_open).toBe(true);
  });

  it("updates an existing learned skill", () => {
    const p = makePlayer();
    commit(
      makeStory(),
      [{ kind: "setSkill", characterId: "kestrel", skillId: "blade", rank: "adept", successCount: 0 }],
      mapOf(p)
    );
    expect(p.skills.find((s) => s.skillId === "blade")).toMatchObject({ rank: "adept", successCount: 0 });
  });

  it("adds a newly learned skill", () => {
    const p = makePlayer();
    commit(
      makeStory(),
      [{ kind: "setSkill", characterId: "kestrel", skillId: "lockpicking", rank: "novice", successCount: 0 }],
      mapOf(p)
    );
    expect(p.skills.find((s) => s.skillId === "lockpicking")).toMatchObject({ rank: "novice" });
  });
});

describe("commit — death derivation", () => {
  it("marks a character dead when a lethal resource reaches zero and returns its id", () => {
    const enemy = makeEnemy(); // hp 12, lethal
    const died = commit(
      makeStory(),
      [{ kind: "resourceDelta", characterId: "wight", resourceId: "hp", delta: -12 }],
      mapOf(enemy)
    );
    expect(enemy.alive).toBe(false);
    expect(died).toEqual(["wight"]);
  });

  it("does not kill when a non-lethal resource hits zero", () => {
    const p = makePlayer();
    const died = commit(
      makeStory(),
      [{ kind: "resourceDelta", characterId: "kestrel", resourceId: "stamina", delta: -10 }],
      mapOf(p)
    );
    expect(p.alive).toBe(true);
    expect(died).toEqual([]);
  });

  it("does not re-report an already-dead character", () => {
    const enemy = makeEnemy({ alive: false, resources: { hp: { current: 0, max: 12 } } });
    const died = commit(
      makeStory(),
      [{ kind: "resourceDelta", characterId: "wight", resourceId: "hp", delta: -1 }],
      mapOf(enemy)
    );
    expect(died).toEqual([]);
  });

  it("skips mutations for characters absent from the map", () => {
    const p = makePlayer();
    expect(() =>
      commit(makeStory(), [{ kind: "resourceDelta", characterId: "ghost", resourceId: "hp", delta: -5 }], mapOf(p))
    ).not.toThrow();
    expect(p.resources.hp!.current).toBe(20);
  });
});
