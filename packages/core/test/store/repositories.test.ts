/**
 * Repository tests (store/repositories/*).
 *
 * Every repo: insert → read-back round-trip (record identical), JSON columns validated
 * through Zod, and the store-wide transaction commits/rolls back atomically. This is the
 * M1 acceptance surface: nothing above the store ever sees an unvalidated row.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { openStore, type Store } from "../../src/store/index.js";
import type {
  CharacterSoftState,
  LorebookEntry,
  MessageRecord,
  PersonaRecord,
  Ruling,
  StoryRecord,
  WorldSoftState,
} from "../../src/types/index.js";
import { makePlayer, makeStory } from "../fixtures.js";

/** A story record wrapping the shared StorySchema fixture. */
function storyRecord(id = "s1"): StoryRecord {
  return {
    id,
    title: "The Silent Vale",
    createdAt: 1000,
    schema: makeStory({ storyId: id, locked: true }),
    locked: true,
  };
}

const softState = (characterId: string): CharacterSoftState => ({
  characterId,
  name: "Kestrel",
  tier: "primary",
  identity: {
    traits: ["stoic"],
    likes: ["quiet"],
    dislikes: ["ghosts"],
    appearance: "weathered",
    speechStyle: "clipped",
  },
  behavioralSignatures: [],
  current: { mood: "wary", location: "the vale", goal: "survive" },
  relationships: [],
  observations: [],
});

const worldState = (): WorldSoftState => ({
  overview: "A haunted valley.",
  locations: [{ name: "The Vale", description: "Mist-choked." }],
  arcs: [],
  unresolvedThreads: [{ title: "The wight", note: "Still stirs.", resolved: false }],
});

const ruling = (): Ruling => ({
  turnId: "t1",
  actorId: "kestrel",
  actionId: "strike",
  gate: { allowed: true },
  roll: { d20: 15, modifier: 2, total: 17, dc: 12, outcome: "success" },
  effectsApplied: null,
});

const arcDoc = () => ({
  plotSummary: "They fought the wight.",
  characterDevelopment: ["Kestrel hardened."],
  relationshipDynamics: [],
  secretsRevealed: [],
  keyDialogue: [],
  promisesAndOaths: [],
  antagonists: ["The wight"],
  worldLore: [],
  unresolvedThreads: [],
  stakes: [],
  keyItems: [],
  skillsAndPowers: [],
  limitations: [],
  timeline: ["Day 1: arrival."],
});

let store: Store;
beforeEach(() => {
  store = openStore(":memory:");
});

describe("stories", () => {
  it("round-trips a story record including its frozen schema", () => {
    const rec = storyRecord();
    store.stories.insert(rec);
    expect(store.stories.get("s1")).toEqual(rec);
  });

  it("lists newest first and updates mutable fields", () => {
    store.stories.insert({ ...storyRecord("a"), createdAt: 1 });
    store.stories.insert({ ...storyRecord("b"), createdAt: 2 });
    expect(store.stories.list().map((s) => s.id)).toEqual(["b", "a"]);

    store.stories.update({ ...storyRecord("a"), createdAt: 1, title: "Renamed" });
    expect(store.stories.get("a")?.title).toBe("Renamed");
  });

  it("throws when updating a missing story", () => {
    expect(() => store.stories.update(storyRecord("ghost"))).toThrow(/No story/);
  });

  it("deletes a story", () => {
    store.stories.insert(storyRecord());
    store.stories.delete("s1");
    expect(store.stories.get("s1")).toBeUndefined();
  });

  it("rejects a corrupt schema_json on read", () => {
    store.stories.insert(storyRecord());
    store.db.sqlite.prepare("UPDATE stories SET schema_json = ? WHERE id = ?").run("{}", "s1");
    expect(() => store.stories.get("s1")).toThrow(z.ZodError);
  });
});

describe("characters", () => {
  beforeEach(() => store.stories.insert(storyRecord()));

  it("round-trips hard state, then attaches soft state", () => {
    store.characters.insert({
      id: "kestrel",
      storyId: "s1",
      name: "Kestrel",
      isPlayer: true,
      hard: makePlayer(),
    });
    const got = store.characters.get("kestrel");
    expect(got?.hard).toEqual(makePlayer());
    expect(got?.soft).toBeUndefined();

    store.characters.updateSoft("kestrel", softState("kestrel"), "primary");
    const withSoft = store.characters.get("kestrel");
    expect(withSoft?.soft).toEqual(softState("kestrel"));
    expect(withSoft?.softTier).toBe("primary");
  });

  it("updates hard state in place", () => {
    store.characters.insert({
      id: "kestrel",
      storyId: "s1",
      name: "Kestrel",
      isPlayer: true,
      hard: makePlayer(),
    });
    const hurt = makePlayer({ resources: { hp: { current: 3, max: 20 } } });
    store.characters.updateHard("kestrel", hurt);
    expect(store.characters.get("kestrel")?.hard.resources.hp?.current).toBe(3);
  });

  it("throws when updating a missing character", () => {
    expect(() => store.characters.updateHard("ghost", makePlayer())).toThrow(/No character/);
    expect(() => store.characters.updateSoft("ghost", softState("ghost"), "primary")).toThrow(
      /No character/
    );
  });

  it("lists a story's characters with players first", () => {
    store.characters.insert({
      id: "wight",
      storyId: "s1",
      name: "Wight",
      isPlayer: false,
      hard: makePlayer({ characterId: "wight", isPlayer: false }),
    });
    store.characters.insert({
      id: "kestrel",
      storyId: "s1",
      name: "Kestrel",
      isPlayer: true,
      hard: makePlayer(),
    });
    expect(store.characters.listByStory("s1").map((c) => c.id)).toEqual(["kestrel", "wight"]);
  });
});

describe("messages", () => {
  beforeEach(() => store.stories.insert(storyRecord()));

  const msg = (idx: number, role: MessageRecord["role"] = "player"): MessageRecord => ({
    id: `m${idx}`,
    storyId: "s1",
    idx,
    role,
    content: `line ${idx}`,
    createdAt: idx,
  });

  it("assigns monotonic indices and reads them back in order", () => {
    expect(store.messages.nextIdx("s1")).toBe(0);
    store.messages.insert(msg(0));
    store.messages.insert(msg(1, "narrator"));
    expect(store.messages.nextIdx("s1")).toBe(2);
    expect(store.messages.listByStory("s1").map((m) => m.idx)).toEqual([0, 1]);
    expect(store.messages.get("m1")?.role).toBe("narrator");
  });

  it("returns the most recent N in turn order", () => {
    for (let i = 0; i < 5; i++) store.messages.insert(msg(i));
    expect(store.messages.recent("s1", 2).map((m) => m.idx)).toEqual([3, 4]);
  });

  it("enforces the per-story unique index", () => {
    store.messages.insert(msg(0));
    expect(() => store.messages.insert({ ...msg(0), id: "dupe" })).toThrow();
  });
});

describe("rulings", () => {
  beforeEach(() => {
    store.stories.insert(storyRecord());
    store.messages.insert({
      id: "m0",
      storyId: "s1",
      idx: 0,
      role: "narrator",
      content: "You strike.",
      createdAt: 0,
    });
  });

  it("round-trips a ruling and finds it by message", () => {
    store.rulings.insert({ id: "r1", storyId: "s1", messageId: "m0", ruling: ruling() });
    expect(store.rulings.get("r1")?.ruling).toEqual(ruling());
    expect(store.rulings.getByMessage("m0")?.id).toBe("r1");
    expect(store.rulings.listByStory("s1")).toHaveLength(1);
  });

  it("rejects a corrupt ruling_json on read", () => {
    store.rulings.insert({ id: "r1", storyId: "s1", messageId: "m0", ruling: ruling() });
    store.db.sqlite.prepare("UPDATE rulings SET ruling_json = ? WHERE id = ?").run("{}", "r1");
    expect(() => store.rulings.get("r1")).toThrow(z.ZodError);
  });
});

describe("chapters & arcs", () => {
  beforeEach(() => store.stories.insert(storyRecord()));

  it("round-trips chapters and queries by idx range", () => {
    for (let i = 0; i < 3; i++) {
      store.chapters.insert({
        id: `c${i}`,
        storyId: "s1",
        idx: i,
        msgFrom: i * 10,
        msgTo: i * 10 + 9,
        title: `Chapter ${i}`,
        summary: `Summary ${i}`,
      });
    }
    expect(store.chapters.nextIdx("s1")).toBe(3);
    expect(store.chapters.listByIdxRange("s1", 1, 2).map((c) => c.idx)).toEqual([1, 2]);
  });

  it("round-trips an arc doc and returns the latest arc", () => {
    store.arcs.insert({
      id: "a0",
      storyId: "s1",
      idx: 0,
      chapterFrom: 0,
      chapterTo: 4,
      title: "Arc I",
      doc: arcDoc(),
    });
    store.arcs.insert({
      id: "a1",
      storyId: "s1",
      idx: 1,
      chapterFrom: 5,
      chapterTo: 9,
      title: "Arc II",
      doc: arcDoc(),
    });
    expect(store.arcs.get("a0")?.doc).toEqual(arcDoc());
    expect(store.arcs.latest("s1")?.id).toBe("a1");
    expect(store.arcs.nextIdx("s1")).toBe(2);
  });

  it("rejects a corrupt doc_json on read", () => {
    store.arcs.insert({
      id: "a0",
      storyId: "s1",
      idx: 0,
      chapterFrom: 0,
      chapterTo: 4,
      title: "Arc I",
      doc: arcDoc(),
    });
    store.db.sqlite.prepare("UPDATE arcs SET doc_json = ? WHERE id = ?").run("{}", "a0");
    expect(() => store.arcs.get("a0")).toThrow(z.ZodError);
  });
});

describe("world_soft", () => {
  beforeEach(() => store.stories.insert(storyRecord()));

  it("upserts a single world document per story", () => {
    expect(store.worldSoft.get("s1")).toBeUndefined();
    store.worldSoft.set("s1", worldState());
    expect(store.worldSoft.get("s1")).toEqual(worldState());

    const updated = { ...worldState(), overview: "Now cleansed." };
    store.worldSoft.set("s1", updated);
    expect(store.worldSoft.get("s1")?.overview).toBe("Now cleansed.");
  });
});

describe("lorebook", () => {
  beforeEach(() => store.stories.insert(storyRecord()));

  const entry = (id: string, enabled: boolean): LorebookEntry => ({
    id,
    storyId: "s1",
    keys: ["wight", "grave"],
    content: "The wight guards the barrow.",
    enabled,
  });

  it("round-trips entries and filters enabled ones", () => {
    store.lorebook.insert(entry("l1", true));
    store.lorebook.insert(entry("l2", false));
    expect(store.lorebook.get("l1")).toEqual(entry("l1", true));
    expect(store.lorebook.listByStory("s1")).toHaveLength(2);
    expect(store.lorebook.listEnabled("s1").map((e) => e.id)).toEqual(["l1"]);
  });

  it("updates and deletes", () => {
    store.lorebook.insert(entry("l1", true));
    store.lorebook.update({ ...entry("l1", false), content: "changed" });
    expect(store.lorebook.get("l1")?.enabled).toBe(false);
    expect(store.lorebook.get("l1")?.content).toBe("changed");
    store.lorebook.delete("l1");
    expect(store.lorebook.get("l1")).toBeUndefined();
  });

  it("throws when updating a missing entry", () => {
    expect(() => store.lorebook.update(entry("ghost", true))).toThrow(/No lorebook/);
  });
});

describe("personas", () => {
  const persona = (id: string, isDefault = false): PersonaRecord => ({
    id,
    name: `Persona ${id}`,
    description: "A test persona.",
    isDefault,
  });

  it("round-trips and enforces a single default", () => {
    store.personas.insert(persona("p1", true));
    store.personas.insert(persona("p2"));
    expect(store.personas.getDefault()?.id).toBe("p1");

    store.personas.setDefault("p2");
    expect(store.personas.getDefault()?.id).toBe("p2");
    expect(store.personas.get("p1")?.isDefault).toBe(false);
  });

  it("throws when defaulting a missing persona", () => {
    expect(() => store.personas.setDefault("ghost")).toThrow(/No persona/);
  });
});

describe("settings", () => {
  const BudgetSchema = z.object({ maxTokens: z.number() });

  it("validates value against a per-key schema on set and get", () => {
    expect(store.settings.has("budget")).toBe(false);
    store.settings.set("budget", BudgetSchema, { maxTokens: 8000 });
    expect(store.settings.has("budget")).toBe(true);
    expect(store.settings.get("budget", BudgetSchema)).toEqual({ maxTokens: 8000 });

    store.settings.set("budget", BudgetSchema, { maxTokens: 16000 });
    expect(store.settings.get("budget", BudgetSchema)?.maxTokens).toBe(16000);

    store.settings.delete("budget");
    expect(store.settings.get("budget", BudgetSchema)).toBeUndefined();
  });

  it("rejects a stored value that no longer matches the schema", () => {
    store.settings.set("budget", BudgetSchema, { maxTokens: 8000 });
    store.db.sqlite.prepare("UPDATE settings SET value = ? WHERE key = ?").run('{"x":1}', "budget");
    expect(() => store.settings.get("budget", BudgetSchema)).toThrow(z.ZodError);
  });
});

describe("transaction (§6 per-turn atomicity)", () => {
  beforeEach(() => store.stories.insert(storyRecord()));

  it("commits message + ruling together", () => {
    store.transaction(() => {
      store.messages.insert({
        id: "m0",
        storyId: "s1",
        idx: 0,
        role: "narrator",
        content: "You strike true.",
        createdAt: 0,
      });
      store.rulings.insert({ id: "r0", storyId: "s1", messageId: "m0", ruling: ruling() });
    });
    expect(store.messages.get("m0")).toBeDefined();
    expect(store.rulings.getByMessage("m0")).toBeDefined();
  });

  it("rolls back the whole turn if any write throws", () => {
    expect(() =>
      store.transaction(() => {
        store.messages.insert({
          id: "m0",
          storyId: "s1",
          idx: 0,
          role: "narrator",
          content: "You strike true.",
          createdAt: 0,
        });
        // Second insert violates the FK (missing message) — must roll back the first.
        store.rulings.insert({ id: "r0", storyId: "s1", messageId: "missing", ruling: ruling() });
      })
    ).toThrow();
    expect(store.messages.get("m0")).toBeUndefined();
    expect(store.rulings.get("r0")).toBeUndefined();
  });
});
