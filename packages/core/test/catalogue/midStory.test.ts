import { beforeEach, describe, expect, it } from "vitest";
import {
  ANALYZER_ENABLEMENTS_PER_CHAPTER,
  d20Sequence,
  deleteLastTurn,
  enablePoolEntry,
  LEARNING_CUE,
  midStoryCandidates,
  proposeMidStoryEnablements,
  submitTurn,
  summarizeStoryEvent,
  UNIVERSAL_ARCHETYPES,
  UNIVERSAL_POOL,
  type ChatResponse,
  type ClassifiedTurn,
  type ResourceDef,
  type Role,
  type RoleBinding,
  type RolePrompt,
  type Router,
  type StorySchema,
  type StreamHandler,
} from "../../src/index.js";
import { openStore, type Store } from "../../src/store/index.js";
import { makePlayer, makeStory } from "../fixtures.js";

const pool = (overrides: Partial<ResourceDef> & Pick<ResourceDef, "id">): ResourceDef => ({
  label: overrides.id,
  start: 10,
  max: 10,
  playerVisible: true,
  ...overrides,
});
const story: StorySchema = makeStory({
  premise: "A young knight in a fading kingdom seeks out an old wizard.",
  schemaVersion: 3,
  attributes: [
    { id: "str", name: "Strength", abbrev: "STR", description: "Force.", defaultScore: 10 },
    { id: "dex", name: "Dexterity", abbrev: "DEX", description: "Agility.", defaultScore: 10 },
    { id: "arc", name: "Arcana", abbrev: "ARC", description: "Magic.", defaultScore: 10 },
  ],
  resources: [
    pool({ id: "hp", label: "Health", start: 20, max: 20, lethal: true, role: "health" }),
    pool({ id: "stamina", label: "Stamina", role: "stamina" }),
    pool({ id: "mana", label: "Mana", role: "mana" }),
  ],
  tiers: [
    { id: "common", label: "Common", minProgress: 0 },
    { id: "uncommon", label: "Uncommon", minProgress: 10 },
    { id: "rare", label: "Rare", minProgress: 20 },
  ],
});
const FIRE = "uni.magic.fire_magic.fire_magic";
const FIRE_BOLT = "uni.magic.fire_magic.fire_bolt";
const TEACH = { playerText: "Will you teach me?", narratorText: "The wizard agrees to train you." };

/** Answers CATALOGUE GROWTH with `enable` (or throws), and counts how often it was asked. */
function proposer(enable: string[] | Error): Router & { asked: number } {
  const router = {
    asked: 0,
    bindingFor(_role: Role): RoleBinding {
      return { provider: "openrouter", model: "test", source: "recommended", samplersDirty: false };
    },
    async complete(_role: Role, prompt: RolePrompt): Promise<ChatResponse> {
      if (prompt.system.includes("CATALOGUE GROWTH")) {
        router.asked++;
        if (enable instanceof Error) throw enable;
        return { content: JSON.stringify({ enable }) };
      }
      return { content: "{}" };
    },
    async stream(): Promise<ChatResponse> {
      return { content: "" };
    },
  };
  return router as Router & { asked: number };
}

describe("mid-story candidates", () => {
  it("are skill-gated only, tier-gated by completed chapters, and fit the setting", () => {
    const ids = (chapters: number, schema = story) => midStoryCandidates(schema, chapters).map((entry) => entry.id);
    const now = ids(0);
    expect(now).toContain(FIRE);
    expect(now).toContain(FIRE_BOLT);
    expect(now).not.toContain("uni.social.persuasion.persuade");
    expect(now).not.toContain("uni.magic.fire_magic.fire_mastery");
    expect(now).not.toContain("uni.tech.technology.electronics");
    expect(ids(1)).toContain("uni.magic.fire_magic.fire_mastery");
    expect(ids(1)).not.toContain("uni.magic.fire_magic.fire_storm");
    expect(ids(3)).toContain("uni.magic.fire_magic.fire_storm");
    const withFire = { ...story, skills: [...story.skills, { ...story.skills[0]!, id: FIRE }] };
    expect(ids(0, withFire)).not.toContain(FIRE);
  });

  it("are only sought when the turn talks about teaching or training", () => {
    expect(LEARNING_CUE.test("The old wizard offers to teach you.")).toBe(true);
    expect(LEARNING_CUE.test("I want to learn to fight with a spear.")).toBe(true);
    expect(LEARNING_CUE.test("She becomes my apprentice.")).toBe(true);
    expect(LEARNING_CUE.test("I study the chamber.")).toBe(false);
    expect(LEARNING_CUE.test("I learn that the guard is lying.")).toBe(false);
  });
});

describe("the analyzer's mid-story proposal", () => {
  let store: Store;
  const storyId = "midstory";
  const propose = (router: Router, turnIdx = 3, text = TEACH) =>
    proposeMidStoryEnablements(router, store, { storyId, turnIdx, ...text });

  beforeEach(async () => {
    store = await openStore(":memory:");
    await store.stories.insert({ id: storyId, title: "Mid", createdAt: 0, schema: { ...story, storyId }, locked: true });
  });

  it("enables what the story reached for, as the analyzer, scoped to the turn", async () => {
    const router = proposer([FIRE]);
    expect(await propose(router)).toEqual([FIRE]);
    const [record] = await store.poolEnablements.list(storyId);
    expect(record).toMatchObject({ entryId: FIRE, source: "analyzer", turnIndex: 3 });
    const [event] = (await store.events.listByStory(storyId)).filter((candidate) => candidate.kind === "pool_enabled");
    expect(summarizeStoryEvent(event!)).toBe("Enabled Fire Magic (skill) - by the story");
  });

  it("does not ask without a cue, and asks nothing once the chapter's budget is spent", async () => {
    const quiet = proposer([FIRE]);
    expect(await propose(quiet, 3, { playerText: "I walk on.", narratorText: "Rain falls." })).toEqual([]);
    expect(quiet.asked).toBe(0);

    const router = proposer([FIRE_BOLT]);
    expect(await propose(router)).toEqual([FIRE_BOLT, FIRE]);
    expect(ANALYZER_ENABLEMENTS_PER_CHAPTER).toBe(2);
    const again = proposer(["uni.magic.healing_magic.healing_magic"]);
    expect(await propose(again, 5)).toEqual([]);
    expect(again.asked).toBe(0);

    // A new chapter refills the budget; enablements before it no longer count.
    await store.chapters.insert({ id: "c1", storyId, idx: 0, msgFrom: 0, msgTo: 5, title: "One", summary: "x" });
    expect(await propose(again, 7)).toEqual(["uni.magic.healing_magic.healing_magic"]);
  });

  it("never lets one proposal exceed what is left of the budget", async () => {
    await enablePoolEntry(store, storyId, "uni.magic.healing_magic.healing_magic", { source: "analyzer", turnIndex: 1 });
    // One slot left; Fire Bolt would bring Fire Magic with it (two entries), so it is skipped.
    expect(await propose(proposer([FIRE_BOLT, FIRE]))).toEqual([FIRE]);
  });

  it("swallows every failure and refuses ids outside the sealed candidates", async () => {
    expect(await propose(proposer(new Error("down")))).toEqual([]);
    expect(await propose(proposer(["uni.social.persuasion.persuade"]))).toEqual([]);
    expect(await store.poolEnablements.list(storyId)).toEqual([]);
    await store.stories.update({ ...(await store.stories.get(storyId))!, schema: { ...story, storyId, statMode: "none" } });
    expect(await propose(proposer([FIRE]))).toEqual([]);
    expect(await proposeMidStoryEnablements(proposer([FIRE]), store, { storyId: "missing", turnIdx: 1, ...TEACH })).toEqual([]);
  });

  it("offers nothing, and asks nothing, when no candidate remains", async () => {
    const router = proposer([FIRE]);
    const empty = { archetypes: UNIVERSAL_ARCHETYPES, pool: { ...UNIVERSAL_POOL, entries: [] } };
    expect(await proposeMidStoryEnablements(router, store, { storyId, turnIdx: 3, ...TEACH, catalogue: empty })).toEqual([]);
    expect(router.asked).toBe(0);
  });
});

class TeachingRouter implements Router {
  constructor(private readonly classified: ClassifiedTurn) {}
  bindingFor(_role: Role): RoleBinding {
    return { provider: "openrouter", model: "test", source: "recommended", samplersDirty: false };
  }
  async complete(role: Role, prompt: RolePrompt): Promise<ChatResponse> {
    if (prompt.system.includes("CATALOGUE GROWTH")) return { content: JSON.stringify({ enable: [FIRE] }) };
    if (role === "classifier" && prompt.system.includes("NPC action planner")) return { content: JSON.stringify({ actions: [] }) };
    if (role === "classifier" && prompt.system.includes("strict consistency auditor")) {
      return { content: JSON.stringify({ obeysRulings: true, contradictions: [] }) };
    }
    if (role === "classifier" && prompt.system.includes("DM loot adjudicator")) {
      return { content: JSON.stringify({ award: false, reason: "None." }) };
    }
    if (role === "classifier" && prompt.system.includes("registrar")) return { content: JSON.stringify({ transitions: [] }) };
    if (role === "classifier") return { content: JSON.stringify(this.classified) };
    if (role === "analyzer") return { content: JSON.stringify({ characterOps: [], worldOps: [] }) };
    return { content: JSON.stringify({ actions: [] }) };
  }
  async stream(_role: Role, _prompt: RolePrompt, onDelta: StreamHandler): Promise<ChatResponse> {
    const content = "The wizard smiles and agrees to teach you the school of fire.";
    onDelta(content);
    return { content };
  }
}

describe("mid-story enablement across a real turn", () => {
  it("lands after the turn, and rewinding the turn removes it", async () => {
    const store = await openStore(":memory:");
    const storyId = "teaching";
    await store.stories.insert({ id: storyId, title: "Teaching", createdAt: 0, schema: { ...story, storyId }, locked: true });
    await store.characters.insert({ id: "kestrel", storyId, name: "Kestrel", isPlayer: true, hard: makePlayer() });
    const router = new TeachingRouter({ playerIntents: [], npcIntents: [], freeText: "" });
    const turn = await submitTurn(router, store, storyId, "Will you teach me fire magic?", { rng: d20Sequence([10]) });
    await turn.background;
    expect(await store.poolEnablements.list(storyId)).toEqual([
      expect.objectContaining({ entryId: FIRE, source: "analyzer", turnIndex: turn.narratorIdx }),
    ]);
    await deleteLastTurn(store, storyId);
    expect(await store.poolEnablements.list(storyId)).toEqual([]);
    await store.close();
  });
});
