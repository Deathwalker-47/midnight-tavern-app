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
  Lorebook,
  LorebookEntry,
  MessageRecord,
  PersonaRecord,
  Ruling,
  StoryRecord,
  WorldSoftState,
} from "../../src/types/index.js";
import { makeEnemy, makePlayer, makeStory } from "../fixtures.js";

/** A story record wrapping the shared StorySchema fixture. */
function storyRecord(id = "s1"): StoryRecord {
  return {
    id,
    title: "The Silent Vale",
    createdAt: 1000,
    schema: makeStory({ storyId: id, locked: true }),
    locked: true,
    difficulty: {
      preset: "standard",
      dcOffset: 0,
      damageTakenMultiplier: 1,
      damageDealtMultiplier: 1,
    },
    actionBudget: 2,
    rulebookVersion: 1,
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
beforeEach(async () => {
  store = await openStore(":memory:");
});

describe("stories", () => {
  it("round-trips a story record including its frozen schema", async () => {
    const rec = storyRecord();
    await store.stories.insert(rec);
    expect(await store.stories.get("s1")).toEqual(rec);
  });

  it("lists newest first and updates mutable fields", async () => {
    await store.stories.insert({ ...storyRecord("a"), createdAt: 1 });
    await store.stories.insert({ ...storyRecord("b"), createdAt: 2 });
    expect((await store.stories.list()).map((s) => s.id)).toEqual(["b", "a"]);

    await store.stories.update({ ...storyRecord("a"), createdAt: 1, title: "Renamed" });
    expect((await store.stories.get("a"))?.title).toBe("Renamed");
  });

  it("throws when updating a missing story", async () => {
    await expect(store.stories.update(storyRecord("ghost"))).rejects.toThrow(/No story/);
  });

  it("deletes a story", async () => {
    await store.stories.insert(storyRecord());
    await store.stories.delete("s1");
    expect(await store.stories.get("s1")).toBeUndefined();
  });

  it("rejects a corrupt schema_json on read", async () => {
    await store.stories.insert(storyRecord());
    await store.db.run("UPDATE stories SET schema_json = ? WHERE id = ?", "{}", "s1");
    await expect(store.stories.get("s1")).rejects.toThrow(z.ZodError);
  });
});

describe("characters", () => {
  beforeEach(async () => {
    await store.stories.insert(storyRecord());
  });

  it("creates a primary soft-state envelope for a player, then updates it", async () => {
    await store.characters.insert({
      id: "kestrel",
      storyId: "s1",
      name: "Kestrel",
      isPlayer: true,
      hard: makePlayer(),
    });
    const got = await store.characters.get("kestrel");
    expect(got?.hard).toEqual(makePlayer());
    expect(got?.soft).toMatchObject({
      characterId: "kestrel",
      name: "Kestrel",
      tier: "primary",
      current: {},
      observations: [],
    });
    expect(got?.softTier).toBe("primary");

    await store.characters.updateSoft("kestrel", softState("kestrel"), "primary");
    const withSoft = await store.characters.get("kestrel");
    expect(withSoft?.soft).toEqual(softState("kestrel"));
    expect(withSoft?.softTier).toBe("primary");
  });

  it("creates a secondary soft-state envelope for a registry NPC", async () => {
    await store.characters.insert({
      id: "wight",
      storyId: "s1",
      name: "Grave-wight",
      isPlayer: false,
      hard: makeEnemy({ characterId: "wight" }),
    });

    expect(await store.characters.get("wight")).toMatchObject({
      softTier: "secondary",
      soft: {
        characterId: "wight",
        name: "Grave-wight",
        tier: "secondary",
        current: {},
        observations: [],
      },
    });
  });

  it("updates hard state in place", async () => {
    await store.characters.insert({
      id: "kestrel",
      storyId: "s1",
      name: "Kestrel",
      isPlayer: true,
      hard: makePlayer(),
    });
    const hurt = makePlayer({ resources: { hp: { current: 3, max: 20 } } });
    await store.characters.updateHard("kestrel", hurt);
    expect((await store.characters.get("kestrel"))?.hard.resources.hp?.current).toBe(3);
  });

  it("throws when updating a missing character", async () => {
    await expect(store.characters.updateHard("ghost", makePlayer())).rejects.toThrow(/No character/);
    await expect(
      store.characters.updateSoft("ghost", softState("ghost"), "primary")
    ).rejects.toThrow(/No character/);
    await expect(store.characters.setPresent("ghost", false)).rejects.toThrow(/No character/);
  });

  it("lists a story's characters with players first", async () => {
    await store.characters.insert({
      id: "wight",
      storyId: "s1",
      name: "Wight",
      isPlayer: false,
      hard: makePlayer({ characterId: "wight", isPlayer: false }),
    });
    await store.characters.insert({
      id: "kestrel",
      storyId: "s1",
      name: "Kestrel",
      isPlayer: true,
      hard: makePlayer(),
    });
    expect((await store.characters.listByStory("s1")).map((c) => c.id)).toEqual(["kestrel", "wight"]);
  });

  it("keeps absent characters registered while filtering scene presence", async () => {
    await store.characters.insert({
      id: "wight",
      storyId: "s1",
      name: "Wight",
      isPlayer: false,
      present: false,
      hard: makePlayer({ characterId: "wight", isPlayer: false }),
    });

    expect((await store.characters.listByStory("s1")).map((character) => character.id)).toEqual([
      "wight",
    ]);
    expect(await store.characters.listPresentByStory("s1")).toEqual([]);

    await store.characters.setPresent("wight", true);

    expect((await store.characters.listPresentByStory("s1")).map((character) => character.id)).toEqual([
      "wight",
    ]);
    expect((await store.characters.get("wight"))?.present).toBe(true);
  });
});

describe("messages", () => {
  beforeEach(async () => {
    await store.stories.insert(storyRecord());
  });

  const msg = (idx: number, role: MessageRecord["role"] = "player"): MessageRecord => ({
    id: `m${idx}`,
    storyId: "s1",
    idx,
    role,
    content: `line ${idx}`,
    createdAt: idx,
  });

  it("assigns monotonic indices and reads them back in order", async () => {
    expect(await store.messages.nextIdx("s1")).toBe(0);
    await store.messages.insert(msg(0));
    await store.messages.insert(msg(1, "narrator"));
    expect(await store.messages.nextIdx("s1")).toBe(2);
    expect((await store.messages.listByStory("s1")).map((m) => m.idx)).toEqual([0, 1]);
    expect((await store.messages.get("m1"))?.role).toBe("narrator");
  });

  it("returns the most recent N in turn order", async () => {
    for (let i = 0; i < 5; i++) await store.messages.insert(msg(i));
    expect((await store.messages.recent("s1", 2)).map((m) => m.idx)).toEqual([3, 4]);
  });

  it("enforces the per-story unique index", async () => {
    await store.messages.insert(msg(0));
    await expect(store.messages.insert({ ...msg(0), id: "dupe" })).rejects.toThrow();
  });
});

describe("rulings", () => {
  beforeEach(async () => {
    await store.stories.insert(storyRecord());
    await store.messages.insert({
      id: "m0",
      storyId: "s1",
      idx: 0,
      role: "narrator",
      content: "You strike.",
      createdAt: 0,
    });
  });

  it("round-trips a ruling and finds it by message", async () => {
    await store.rulings.insert({ id: "r1", storyId: "s1", messageId: "m0", ruling: ruling() });
    expect((await store.rulings.get("r1"))?.ruling).toEqual(ruling());
    expect((await store.rulings.getByMessage("m0"))?.id).toBe("r1");
    expect(await store.rulings.listByStory("s1")).toHaveLength(1);
  });

  it("rejects a corrupt ruling_json on read", async () => {
    await store.rulings.insert({ id: "r1", storyId: "s1", messageId: "m0", ruling: ruling() });
    await store.db.run("UPDATE rulings SET ruling_json = ? WHERE id = ?", "{}", "r1");
    await expect(store.rulings.get("r1")).rejects.toThrow(z.ZodError);
  });
});

describe("chapters & arcs", () => {
  beforeEach(async () => {
    await store.stories.insert(storyRecord());
  });

  it("round-trips chapters and queries by idx range", async () => {
    for (let i = 0; i < 3; i++) {
      await store.chapters.insert({
        id: `c${i}`,
        storyId: "s1",
        idx: i,
        msgFrom: i * 10,
        msgTo: i * 10 + 9,
        title: `Chapter ${i}`,
        summary: `Summary ${i}`,
      });
    }
    expect(await store.chapters.nextIdx("s1")).toBe(3);
    expect((await store.chapters.listByIdxRange("s1", 1, 2)).map((c) => c.idx)).toEqual([1, 2]);
  });

  it("round-trips an arc doc and returns the latest arc", async () => {
    await store.arcs.insert({
      id: "a0",
      storyId: "s1",
      idx: 0,
      chapterFrom: 0,
      chapterTo: 4,
      title: "Arc I",
      doc: arcDoc(),
    });
    await store.arcs.insert({
      id: "a1",
      storyId: "s1",
      idx: 1,
      chapterFrom: 5,
      chapterTo: 9,
      title: "Arc II",
      doc: arcDoc(),
    });
    expect((await store.arcs.get("a0"))?.doc).toEqual(arcDoc());
    expect((await store.arcs.latest("s1"))?.id).toBe("a1");
    expect(await store.arcs.nextIdx("s1")).toBe(2);
  });

  it("rejects a corrupt doc_json on read", async () => {
    await store.arcs.insert({
      id: "a0",
      storyId: "s1",
      idx: 0,
      chapterFrom: 0,
      chapterTo: 4,
      title: "Arc I",
      doc: arcDoc(),
    });
    await store.db.run("UPDATE arcs SET doc_json = ? WHERE id = ?", "{}", "a0");
    await expect(store.arcs.get("a0")).rejects.toThrow(z.ZodError);
  });
});

describe("world_soft", () => {
  beforeEach(async () => {
    await store.stories.insert(storyRecord());
  });

  it("upserts a single world document per story", async () => {
    expect(await store.worldSoft.get("s1")).toBeUndefined();
    await store.worldSoft.set("s1", worldState());
    expect(await store.worldSoft.get("s1")).toEqual(worldState());

    const updated = { ...worldState(), overview: "Now cleansed." };
    await store.worldSoft.set("s1", updated);
    expect((await store.worldSoft.get("s1"))?.overview).toBe("Now cleansed.");
  });
});

describe("lorebook (v2: global books, m2m attach)", () => {
  beforeEach(async () => {
    await store.stories.insert(storyRecord());
  });

  const book = (id: string): Lorebook => ({
    id,
    name: `Book ${id}`,
    description: "A test lorebook.",
    createdAt: 1000,
    source: "user",
  });

  const entry = (
    id: string,
    lorebookId: string,
    enabled: boolean,
    over: Partial<LorebookEntry> = {}
  ): LorebookEntry => ({
    id,
    lorebookId,
    keys: ["wight", "grave"],
    content: "The wight guards the barrow.",
    enabled,
    alwaysOn: false,
    priority: 0,
    insertionOrder: 0,
    ...over,
  });

  it("round-trips lorebooks and their entries", async () => {
    await store.lorebook.createLorebook(book("b1"));
    await store.lorebook.insertEntry(entry("e1", "b1", true));
    await store.lorebook.insertEntry(entry("e2", "b1", false));
    expect(await store.lorebook.getLorebook("b1")).toEqual(book("b1"));
    expect(await store.lorebook.getEntry("e1")).toEqual(entry("e1", "b1", true));
    expect(await store.lorebook.listEntries("b1")).toHaveLength(2);
  });

  it("attaches to a story and lists active entries honoring both enabled flags", async () => {
    await store.lorebook.createLorebook(book("b1"));
    await store.lorebook.insertEntry(entry("e1", "b1", true));
    await store.lorebook.insertEntry(entry("e2", "b1", false)); // entry-disabled

    // Not attached yet → nothing active.
    expect(await store.lorebook.listActiveEntries("s1")).toHaveLength(0);

    await store.lorebook.attach("s1", "b1");
    expect((await store.lorebook.listActiveEntries("s1")).map((e) => e.id)).toEqual(["e1"]);
    const attached = await store.lorebook.listAttached("s1");
    expect(attached).toHaveLength(1);
    expect(attached[0]?.linkEnabled).toBe(true);

    // Disabling the link hides all its entries even though the entry itself is enabled.
    await store.lorebook.setAttachedEnabled("s1", "b1", false);
    expect(await store.lorebook.listActiveEntries("s1")).toHaveLength(0);
  });

  it("orders active entries by priority desc then insertion order", async () => {
    await store.lorebook.createLorebook(book("b1"));
    await store.lorebook.insertEntry(entry("lo", "b1", true, { priority: 1, insertionOrder: 0 }));
    await store.lorebook.insertEntry(entry("hi", "b1", true, { priority: 5, insertionOrder: 1 }));
    await store.lorebook.insertEntry(entry("mid", "b1", true, { priority: 1, insertionOrder: 2 }));
    await store.lorebook.attach("s1", "b1");
    expect((await store.lorebook.listActiveEntries("s1")).map((e) => e.id)).toEqual([
      "hi",
      "lo",
      "mid",
    ]);
  });

  it("updates and deletes entries", async () => {
    await store.lorebook.createLorebook(book("b1"));
    await store.lorebook.insertEntry(entry("e1", "b1", true));
    await store.lorebook.updateEntry({ ...entry("e1", "b1", false), content: "changed" });
    expect((await store.lorebook.getEntry("e1"))?.enabled).toBe(false);
    expect((await store.lorebook.getEntry("e1"))?.content).toBe("changed");
    await store.lorebook.deleteEntry("e1");
    expect(await store.lorebook.getEntry("e1")).toBeUndefined();
  });

  it("throws when updating a missing entry", async () => {
    await expect(store.lorebook.updateEntry(entry("ghost", "b1", true))).rejects.toThrow(
      /No lorebook/
    );
  });
});

describe("personas", () => {
  const persona = (id: string, isDefault = false): PersonaRecord => ({
    id,
    name: `Persona ${id}`,
    description: "A test persona.",
    isDefault,
  });

  it("round-trips and enforces a single default", async () => {
    await store.personas.insert(persona("p1", true));
    await store.personas.insert(persona("p2"));
    expect((await store.personas.getDefault())?.id).toBe("p1");

    await store.personas.setDefault("p2");
    expect((await store.personas.getDefault())?.id).toBe("p2");
    expect((await store.personas.get("p1"))?.isDefault).toBe(false);
  });

  it("throws when defaulting a missing persona", async () => {
    await expect(store.personas.setDefault("ghost")).rejects.toThrow(/No persona/);
  });
});

describe("settings", () => {
  const BudgetSchema = z.object({ maxTokens: z.number() });

  it("validates value against a per-key schema on set and get", async () => {
    expect(await store.settings.has("budget")).toBe(false);
    await store.settings.set("budget", BudgetSchema, { maxTokens: 8000 });
    expect(await store.settings.has("budget")).toBe(true);
    expect(await store.settings.get("budget", BudgetSchema)).toEqual({ maxTokens: 8000 });

    await store.settings.set("budget", BudgetSchema, { maxTokens: 16000 });
    expect((await store.settings.get("budget", BudgetSchema))?.maxTokens).toBe(16000);

    await store.settings.delete("budget");
    expect(await store.settings.get("budget", BudgetSchema)).toBeUndefined();
  });

  it("rejects a stored value that no longer matches the schema", async () => {
    await store.settings.set("budget", BudgetSchema, { maxTokens: 8000 });
    await store.db.run("UPDATE settings SET value = ? WHERE key = ?", '{"x":1}', "budget");
    await expect(store.settings.get("budget", BudgetSchema)).rejects.toThrow(z.ZodError);
  });
});

describe("transaction (§6 per-turn atomicity)", () => {
  beforeEach(async () => {
    await store.stories.insert(storyRecord());
  });

  it("commits message + ruling together", async () => {
    await store.transaction(async () => {
      await store.messages.insert({
        id: "m0",
        storyId: "s1",
        idx: 0,
        role: "narrator",
        content: "You strike true.",
        createdAt: 0,
      });
      await store.rulings.insert({ id: "r0", storyId: "s1", messageId: "m0", ruling: ruling() });
    });
    expect(await store.messages.get("m0")).toBeDefined();
    expect(await store.rulings.getByMessage("m0")).toBeDefined();
  });

  it("rolls back the whole turn if any write throws", async () => {
    await expect(
      store.transaction(async () => {
        await store.messages.insert({
          id: "m0",
          storyId: "s1",
          idx: 0,
          role: "narrator",
          content: "You strike true.",
          createdAt: 0,
        });
        // Second insert violates the FK (missing message) — must roll back the first.
        await store.rulings.insert({ id: "r0", storyId: "s1", messageId: "missing", ruling: ruling() });
      })
    ).rejects.toThrow();
    expect(await store.messages.get("m0")).toBeUndefined();
    expect(await store.rulings.get("r0")).toBeUndefined();
  });
});
