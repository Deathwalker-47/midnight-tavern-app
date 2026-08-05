/**
 * Soft-state patch-merge tests (low-level-plan §M7.4, §10 "memory").
 *
 * Two layers:
 *   1. Pure merge semantics on `applyCharacterOp` / `applyWorldOp` — set/append-dedupe/
 *      observe-FIFO-cap/relationship-clamp, and the world ops — proving each rule in
 *      isolation with no store.
 *   2. `applySoftPatch` against a real in-memory store: rejection of analyzer-invented
 *      characterIds, and preservation of an existing character's hard state.
 *
 * Plus THE WALL (§10, D5): a patch that tries to smuggle a mechanical field
 * (hp/skills/items/inventory) must fail `SoftStatePatchSchema` validation. This is the
 * structural guarantee that the analyzer can never touch hard state.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { openStore, type Store } from "../../src/store/index.js";
import {
  applyCharacterOp,
  applyWorldOp,
  applySoftPatch,
  newSoftState,
  newWorldSoftState,
  OBSERVATION_CAP,
} from "../../src/memory/softStore.js";
import { SoftStatePatchSchema, WorldSoftStateSchema, type CharacterSoftState } from "../../src/types/index.js";
import { makeStory } from "../fixtures.js";

const base = (): CharacterSoftState => newSoftState("npc-1", "Mara");

describe("applyCharacterOp — merge rules", () => {
  it("set overwrites a current scalar (mood/location/goal)", () => {
    const s1 = applyCharacterOp(base(), { op: "set", path: "mood", value: "wary" }, 0);
    const s2 = applyCharacterOp(s1, { op: "set", path: "mood", value: "furious" }, 1);
    expect(s2.current.mood).toBe("furious");
  });

  it("set routes appearance/speechStyle onto identity", () => {
    const s = applyCharacterOp(base(), { op: "set", path: "appearance", value: "scarred" }, 0);
    expect(s.identity.appearance).toBe("scarred");
    expect(s.current.mood).toBeUndefined();
  });

  it("append adds to a string list and dedupes case-insensitively", () => {
    let s = applyCharacterOp(base(), { op: "append", path: "traits", value: "Brave" }, 0);
    s = applyCharacterOp(s, { op: "append", path: "traits", value: "brave" }, 1); // dup (CI)
    s = applyCharacterOp(s, { op: "append", path: "traits", value: "loyal" }, 2);
    expect(s.identity.traits).toEqual(["Brave", "loyal"]);
  });

  it("observe appends with the turn index", () => {
    let s = applyCharacterOp(base(), { op: "observe", text: "drew a dagger" }, 7);
    s = applyCharacterOp(s, { op: "observe", text: "fled north" }, 9);
    expect(s.observations).toEqual([
      { turnIdx: 7, text: "drew a dagger" },
      { turnIdx: 9, text: "fled north" },
    ]);
  });

  it("observe is FIFO-capped at OBSERVATION_CAP, keeping the most recent", () => {
    let s = base();
    for (let i = 0; i < OBSERVATION_CAP + 5; i++) {
      s = applyCharacterOp(s, { op: "observe", text: `obs ${i}` }, i);
    }
    expect(s.observations).toHaveLength(OBSERVATION_CAP);
    expect(s.observations[0]!.text).toBe("obs 5"); // first 5 dropped
    expect(s.observations[OBSERVATION_CAP - 1]!.text).toBe(`obs ${OBSERVATION_CAP + 4}`);
  });

  it("adjust_relationship creates then accumulates with asymptotic attenuation near the ceiling/floor", () => {
    let s = applyCharacterOp(
      base(),
      { op: "adjust_relationship", toCharacterId: "kestrel", trustDelta: 0.7, powerDelta: -0.4, feeling: "ally" },
      0
    );
    expect(s.relationships).toHaveLength(1);
    // A second large delta toward the same boundary is attenuated by proximity, not linear.
    s = applyCharacterOp(
      s,
      { op: "adjust_relationship", toCharacterId: "kestrel", trustDelta: 0.9, powerDelta: -0.9 },
      1
    );
    const rel = s.relationships[0]!;
    expect(rel.trust).toBeCloseTo(0.97, 2); // 0.7 + 0.9*(1-0.7) = 0.97, not clamped to 1
    expect(rel.power).toBeCloseTo(-0.94, 2); // -0.4 + -0.9*(1-0.4) = -0.94, not clamped to -1
    expect(rel.feeling).toBe("ally"); // preserved when a later op omits it
  });

  it("large delta does not pin trust at 1 — a subsequent negative delta still moves it", () => {
    let s = applyCharacterOp(
      base(),
      { op: "adjust_relationship", toCharacterId: "k", trustDelta: 0.95, powerDelta: 0 },
      0
    );
    expect(s.relationships[0]!.trust).toBeLessThan(1);
    const before = s.relationships[0]!.trust;
    s = applyCharacterOp(
      s,
      { op: "adjust_relationship", toCharacterId: "k", trustDelta: -0.3, powerDelta: 0 },
      1
    );
    expect(s.relationships[0]!.trust).toBeLessThan(before);
  });

  it("does not mutate the input state (pure)", () => {
    const input = base();
    applyCharacterOp(input, { op: "append", path: "traits", value: "x" }, 0);
    expect(input.identity.traits).toEqual([]);
  });
});

describe("applyWorldOp — merge rules", () => {
  it("set_overview_hint overwrites the overview", () => {
    const w = applyWorldOp(newWorldSoftState(), { op: "set_overview_hint", text: "war looms" });
    expect(w.overview).toBe("war looms");
  });

  it("add_location dedupes by name (case-insensitive)", () => {
    let w = applyWorldOp(newWorldSoftState(), { op: "add_location", name: "Vale", description: "misty" });
    w = applyWorldOp(w, { op: "add_location", name: "vale", description: "again" });
    expect(w.locations).toHaveLength(1);
  });

  it("add_thread then resolve_thread flips resolved", () => {
    let w = applyWorldOp(newWorldSoftState(), { op: "add_thread", title: "The debt", note: "owed to a fence" });
    expect(w.unresolvedThreads[0]!.resolved).toBe(false);
    w = applyWorldOp(w, { op: "resolve_thread", title: "the debt" }); // CI match
    expect(w.unresolvedThreads[0]!.resolved).toBe(true);
  });

  it("add_thread assigns a stable id", () => {
    const w = applyWorldOp(newWorldSoftState(), { op: "add_thread", title: "The debt", note: "owed to a fence" });
    expect(typeof w.unresolvedThreads[0]!.id).toBe("string");
    expect(w.unresolvedThreads[0]!.id.length).toBeGreaterThan(0);
  });

  it("legacy thread without id gets a backfilled id on parse", () => {
    const raw = {
      unresolvedThreads: [{ title: "Old", note: "", resolved: false }],
      locations: [],
      arcs: [],
      overview: "",
    };
    const parsed = WorldSoftStateSchema.parse(raw);
    expect(parsed.unresolvedThreads[0]!.id).toBeDefined();
  });
});

describe("applySoftPatch — store integration", () => {
  let store: Store;
  beforeEach(async () => {
    store = await openStore(":memory:");
    // Characters/worldSoft rows FK to a story; seed one with id "story-1".
    const schema = makeStory({ storyId: "story-1" });
    await store.stories.insert({ id: "story-1", title: schema.title, createdAt: 0, schema, locked: true });
  });

  it("does not create a registry character from an analyzer-invented characterId", async () => {
    await applySoftPatch(
      store,
      "story-1",
      { characterOps: [{ characterId: "ghost", ops: [{ op: "observe", text: "wailed" }] }], worldOps: [] },
      3,
      (id) => (id === "ghost" ? "The Ghost" : undefined)
    );
    expect(await store.characters.get("ghost")).toBeUndefined();
  });

  it("updates an existing character's soft column without touching hard state", async () => {
    await store.characters.insert({
      id: "kestrel",
      storyId: "story-1",
      name: "Kestrel",
      isPlayer: true,
      hard: {
        characterId: "kestrel",
        isPlayer: true,
        attributes: {},
        resources: { hp: { current: 20, max: 20 } },
        skills: [{ skillId: "blade", rank: "novice", successCount: 0 }],
        inventory: [{ itemId: "sword", qty: 1 }],
        flags: {},
        alive: true,
      },
    });
    await applySoftPatch(
      store,
      "story-1",
      { characterOps: [{ characterId: "kestrel", ops: [{ op: "set", path: "goal", value: "avenge the vale" }] }], worldOps: [] },
      5
    );
    const row = (await store.characters.get("kestrel"))!;
    expect(row.soft!.current.goal).toBe("avenge the vale");
    // Hard state untouched by the analyzer path.
    expect(row.hard.resources.hp!.current).toBe(20);
    expect(row.hard.inventory).toEqual([{ itemId: "sword", qty: 1 }]);
  });

  it("applies world ops to the story's world soft state", async () => {
    await applySoftPatch(
      store,
      "story-1",
      { characterOps: [], worldOps: [{ op: "set_overview_hint", text: "the vale is cursed" }] },
      1
    );
    expect((await store.worldSoft.get("story-1"))!.overview).toBe("the vale is cursed");
  });
});

describe("the wall — SoftStatePatchSchema rejects mechanical fields", () => {
  it("rejects a set op targeting a mechanical path (hp)", () => {
    const patch = {
      characterOps: [{ characterId: "kestrel", ops: [{ op: "set", path: "hp", value: "0" }] }],
      worldOps: [],
    };
    expect(SoftStatePatchSchema.safeParse(patch).success).toBe(false);
  });

  it("rejects an unknown op that smuggles skills/items", () => {
    const patch = {
      characterOps: [{ characterId: "kestrel", ops: [{ op: "grant_item", itemId: "sword" }] }],
      worldOps: [],
    };
    expect(SoftStatePatchSchema.safeParse(patch).success).toBe(false);
  });

  it("rejects extra mechanical keys on a character op entry (.strict)", () => {
    const patch = {
      characterOps: [{ characterId: "kestrel", ops: [], inventory: [{ itemId: "sword", qty: 1 }] }],
      worldOps: [],
    };
    expect(SoftStatePatchSchema.safeParse(patch).success).toBe(false);
  });

  it("rejects extra top-level keys (.strict)", () => {
    const patch = { characterOps: [], worldOps: [], resources: { hp: -5 } };
    expect(SoftStatePatchSchema.safeParse(patch).success).toBe(false);
  });

  it("accepts a well-formed narrative-only patch", () => {
    const patch = {
      characterOps: [{ characterId: "mara", ops: [{ op: "append", path: "traits", value: "cunning" }] }],
      worldOps: [{ op: "add_thread", title: "the heist", note: "planned for dusk" }],
    };
    expect(SoftStatePatchSchema.safeParse(patch).success).toBe(true);
  });
});
