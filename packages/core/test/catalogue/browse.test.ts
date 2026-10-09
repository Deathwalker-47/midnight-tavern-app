import { describe, expect, it } from "vitest";
import {
  browsePool,
  learnersBySkill,
  loadPoolBrowseContext,
  materializeEntry,
  MAX_POOL_PAGE,
  POOL_PAGE_SIZE,
  poolSections,
  tierLock,
  UNIVERSAL_ARCHETYPES,
  UNIVERSAL_POOL,
  enablePoolEntry,
  type PlannedEnablement,
  type PoolBrowseContext,
  type PoolCatalogue,
  type ResourceDef,
  type StorySchema,
} from "../../src/index.js";
import { openStore } from "../../src/store/index.js";
import { makePlayer, makeStory } from "../fixtures.js";

const pool = (overrides: Partial<ResourceDef> & Pick<ResourceDef, "id">): ResourceDef => ({
  label: overrides.id,
  start: 10,
  max: 10,
  playerVisible: true,
  ...overrides,
});
const story: StorySchema = makeStory({
  schemaVersion: 3,
  attributes: [
    { id: "str", name: "Strength", abbrev: "STR", description: "Force.", defaultScore: 10 },
    { id: "cha", name: "Charisma", abbrev: "CHA", description: "Presence.", defaultScore: 10 },
    { id: "wit", name: "Wits", abbrev: "WIT", description: "Cunning.", defaultScore: 10 },
  ],
  resources: [
    pool({ id: "hp", label: "Health", start: 20, max: 20, lethal: true, role: "health" }),
    pool({ id: "stamina", label: "Stamina", role: "stamina" }),
    pool({ id: "mana", label: "Mana", role: "mana" }),
  ],
});
/** An older rulebook with no mana pool, which spells cannot be expressed in. */
const mundane: StorySchema = makeStory({
  ...story,
  schemaVersion: 2,
  resources: story.resources.filter((resource) => resource.role !== "mana"),
});

/** Plan an enablement the way the forge would, for building contexts by hand. */
function planned(id: string, source: "forge" | "player" | "analyzer" = "player") {
  const result = materializeEntry(story, id);
  if (!result.ok) throw new Error(result.reason);
  return { entryId: id, kind: result.kind, definition: result.definition, source } as PlannedEnablement & {
    source: typeof source;
  };
}

const context = (overrides: Partial<PoolBrowseContext> = {}): PoolBrowseContext => ({
  frozen: story,
  enablements: [],
  learners: new Map(),
  completedChapters: 0,
  ...overrides,
});
const byId = (page: ReturnType<typeof browsePool>) => new Map(page.entries.map((entry) => [entry.entryId, entry]));

describe("the pool's section index", () => {
  it("lists every section in pool order with offered and enabled counts", () => {
    const sections = poolSections(context({ enablements: [planned("uni.social.persuasion.persuade")] }));
    expect(sections.map((section) => section.id)).toEqual(UNIVERSAL_POOL.sections.map((section) => section.id));
    const offered = UNIVERSAL_POOL.entries.filter((entry) => !entry.excluded).length;
    expect(sections.reduce((sum, section) => sum + section.offered, 0)).toBe(offered);
    expect(sections.find((section) => section.id === "persuasion")).toMatchObject({
      title: "Persuasion & Negotiation",
      offered: 7,
      enabled: 1,
    });
    // Excluded entries are never offered, so a section of them offers nothing.
    expect(sections.find((section) => section.id === "beyond")).toMatchObject({ offered: 0, enabled: 0 });
  });
});

describe("browsing the pool", () => {
  it("gives every entry exactly one honest state", () => {
    const enablements = [planned("uni.social.persuasion.persuade", "forge"), planned("uni.social.empathy.reassure", "analyzer")];
    const page = byId(browsePool(context({ enablements }), { search: "persuade" }));
    expect(page.get("uni.social.persuasion.persuade")).toMatchObject({
      state: "enabled",
      source: "forge",
      kind: "action",
      tier: "common",
      sectionId: "persuasion",
    });
    expect(page.get("uni.social.persuasion.persuade")!.reason).toBeUndefined();

    const leadership = byId(browsePool(context(), { sectionId: "leadership" }));
    expect(leadership.get("uni.social.leadership.command")).toMatchObject({
      state: "locked",
      reason: "Command is uncommon; uncommon entries unlock once the story completes its first chapter.",
    });
    const unlocked = byId(browsePool(context({ completedChapters: 1 }), { sectionId: "leadership" }));
    expect(unlocked.get("uni.social.leadership.rally_the_group")).toMatchObject({ state: "available", bringsWith: ["Command"] });
    expect(unlocked.get("uni.social.leadership.command")).toEqual(
      expect.not.objectContaining({ bringsWith: expect.anything() })
    );

    const magic = byId(browsePool(context({ frozen: mundane }), { sectionId: "fire_magic" }));
    expect(magic.get("uni.magic.fire_magic.fire_bolt")).toMatchObject({
      state: "unavailable",
      reason: "This story has no mana pool, which Fire Bolt needs.",
    });
    expect(magic.get("uni.magic.fire_magic.fire_magic")).toMatchObject({ state: "available" });

    const beyond = browsePool(context(), { sectionId: "beyond" });
    expect(beyond.entries.every((entry) => entry.state === "excluded" && entry.reason)).toBe(true);
  });

  it("names who learned an enabled skill, and what still needs it, as the reason it stays (D8)", () => {
    const enablements = [planned("uni.social.leadership.command"), planned("uni.social.leadership.rally_the_group")];
    const learners = learnersBySkill([
      { name: "Ari", skillIds: ["uni.social.leadership.command", "uni.social.leadership.command"] },
      { name: "Bo", skillIds: ["blade"] },
    ]);
    expect(learners.get("uni.social.leadership.command")).toEqual(["Ari"]);
    const page = byId(browsePool(context({ enablements, learners }), { sectionId: "leadership" }));
    expect(page.get("uni.social.leadership.command")).toMatchObject({
      state: "enabled",
      source: "player",
      reason: "Ari has learned this, so it stays.",
    });
    const unlearned = byId(browsePool(context({ enablements }), { sectionId: "leadership" }));
    expect(unlearned.get("uni.social.leadership.command")!.reason).toBe("Rally the Group still needs it; disable that first.");
    expect(unlearned.get("uni.social.leadership.rally_the_group")!.reason).toBeUndefined();
  });

  it("treats an entry sealed into the forged rulebook as enabled for good", () => {
    const persuade = planned("uni.social.persuasion.persuade").definition as StorySchema["actions"][number];
    const page = byId(browsePool(context({ frozen: { ...story, actions: [...story.actions, persuade] } }), { sectionId: "persuasion" }));
    const entry = page.get("uni.social.persuasion.persuade")!;
    expect(entry).toMatchObject({ state: "enabled", reason: "Part of this story's sealed rulebook, so it stays." });
    expect(entry.source).toBeUndefined();
  });

  it("searches every word across names, descriptions, aliases, tags and sections, name hits first", () => {
    const all = browsePool(context(), { search: "fire", limit: MAX_POOL_PAGE });
    expect(all.entries[0]!.name.toLowerCase()).toContain("fire");
    const firstNonName = all.entries.findIndex((entry) => !entry.name.toLowerCase().includes("fire"));
    if (firstNonName >= 0) {
      expect(all.entries.slice(firstNonName).every((entry) => !entry.name.toLowerCase().includes("fire"))).toBe(true);
    }
    expect(browsePool(context(), { search: "FIRE   bolt" }).entries.map((entry) => entry.entryId)).toEqual([
      "uni.magic.fire_magic.fire_bolt",
    ]);
    expect(browsePool(context(), { search: "negotiation" }).total).toBeGreaterThanOrEqual(7);
    expect(browsePool(context(), { search: "no such thing anywhere" })).toEqual({ entries: [], total: 0, offset: 0 });
    expect(browsePool(context(), { sectionId: "leadership", search: "delegate" }).total).toBe(1);
  });

  it("pages with clamped offsets and limits", () => {
    const total = UNIVERSAL_POOL.entries.length;
    const first = browsePool(context());
    expect(first).toMatchObject({ total, offset: 0 });
    expect(first.entries).toHaveLength(POOL_PAGE_SIZE);
    const second = browsePool(context(), { offset: POOL_PAGE_SIZE, limit: 5 });
    expect(second.entries.map((entry) => entry.entryId)).toEqual(
      UNIVERSAL_POOL.entries.slice(POOL_PAGE_SIZE, POOL_PAGE_SIZE + 5).map((entry) => entry.id)
    );
    expect(browsePool(context(), { limit: 10_000 }).entries).toHaveLength(Math.min(total, MAX_POOL_PAGE));
    expect(browsePool(context(), { offset: -4, limit: 0 })).toMatchObject({ offset: 0, entries: [expect.anything()] });
    expect(browsePool(context(), { offset: total }).entries).toEqual([]);
  });

  it("reports a missing archetype's tier as unknown rather than guessing", () => {
    const orphan: PoolCatalogue = {
      archetypes: UNIVERSAL_ARCHETYPES,
      pool: {
        ...UNIVERSAL_POOL,
        entries: [{ ...UNIVERSAL_POOL.entries[0]!, archetypeId: "arch.missing.shape" }],
      },
    };
    const [entry] = browsePool(context({ catalogue: orphan })).entries;
    expect(entry!.tier).toBeUndefined();
    expect(entry!.state).toBe("unavailable");
  });
});

describe("tier locks", () => {
  const retiered = (archetypeId: string, tier: "rare" | "mythical"): PoolCatalogue => ({
    pool: UNIVERSAL_POOL,
    archetypes: {
      ...UNIVERSAL_ARCHETYPES,
      archetypes: UNIVERSAL_ARCHETYPES.archetypes.map((archetype) =>
        archetype.id === archetypeId ? { ...archetype, tier } : archetype
      ),
    },
  });
  const magicStory = story;
  const fireMagic = UNIVERSAL_POOL.entries.find((entry) => entry.id === "uni.magic.fire_magic.fire_magic")!;

  it("lock an entry by anything it brings, and never unlock mythical", () => {
    const rareSkill = retiered(fireMagic.archetypeId, "rare");
    const page = byId(browsePool(context({ frozen: magicStory, completedChapters: 1, catalogue: rareSkill }), { sectionId: "fire_magic" }));
    expect(page.get("uni.magic.fire_magic.fire_bolt")).toMatchObject({
      state: "locked",
      reason: "Fire Magic is rare; rare entries unlock once the story completes 3 chapters.",
    });
    const mythical = retiered(fireMagic.archetypeId, "mythical");
    const fire = materializeEntry(magicStory, fireMagic.id, mythical);
    if (!fire.ok) throw new Error(fire.reason);
    const additions = [{ entryId: fire.entry.id, kind: fire.kind, definition: fire.definition }] as PlannedEnablement[];
    expect(tierLock(additions, 99, mythical)).toBe("Fire Magic is mythical; mythical entries never arrive during a story.");
    expect(tierLock(additions, 0)).toBeUndefined();
  });
});

describe("a stored story's browse context", () => {
  it("gathers the frozen rulebook, enablements, learners and completed chapters", async () => {
    const store = await openStore(":memory:");
    const storyId = "browse";
    await store.stories.insert({ id: storyId, title: "Browse", createdAt: 0, schema: { ...story, storyId }, locked: true });
    const player = makePlayer();
    await store.characters.insert({
      id: "ari",
      storyId,
      name: "Ari",
      isPlayer: true,
      hard: { ...player, skills: [{ skillId: "uni.social.leadership.command", rank: "novice", successCount: 0 }] },
    });
    await store.chapters.insert({ id: "c1", storyId, idx: 0, msgFrom: 0, msgTo: 5, title: "One", summary: "x" });
    await enablePoolEntry(store, storyId, "uni.social.leadership.command", { source: "player" });
    const loaded = await loadPoolBrowseContext(store, storyId);
    expect(loaded.completedChapters).toBe(1);
    expect(loaded.learners.get("uni.social.leadership.command")).toEqual(["Ari"]);
    expect(byId(browsePool(loaded, { sectionId: "leadership" })).get("uni.social.leadership.command")).toMatchObject({
      state: "enabled",
      reason: "Ari has learned this, so it stays.",
    });
    await expect(loadPoolBrowseContext(store, "missing")).rejects.toThrow('Unknown story "missing".');
    await store.close();
  });
});
