import { beforeEach, describe, expect, it } from "vitest";
import {
  commit,
  d20Sequence,
  LEARN_SKILL_ACTION_ID,
  resolveLearnSkill,
  submitTurn,
  type ChatResponse,
  type ClassifiedTurn,
  type MechanicalIntent,
  type Role,
  type RoleBinding,
  type RolePrompt,
  type Router,
  type StreamHandler,
} from "../src/index.js";
import { openStore, type Store } from "../src/store/index.js";
import { makeEnemy, makePlayer, makeStory } from "./fixtures.js";

const story = makeStory();
const learn = (skillId: string): MechanicalIntent => ({
  actorId: "kestrel",
  actionId: LEARN_SKILL_ACTION_ID,
  skillId,
  confidence: 1,
});

describe("learning a skill in play (plan 09 §3.2 path)", () => {
  it("learns through the first path the actor can actually use, paying its cost", () => {
    // Lockpicking: path 0 needs the manual (not held); path 1 is a trainer for 4 stamina.
    const actor = makePlayer();
    const result = resolveLearnSkill(story, actor, learn("lockpicking"), { trainerPresent: true });
    expect(result.ruling).toMatchObject({
      actionId: LEARN_SKILL_ACTION_ID,
      actionLabel: "Learn Lockpicking",
      gate: { allowed: true },
      costsPaid: { resources: { stamina: 4 } },
      masteryAdvance: { skillId: "lockpicking", fromRank: "untrained", toRank: "novice" },
    });
    commit(story, result.mutations, new Map([["kestrel", actor]]));
    expect(actor.skills.map((skill) => skill.skillId)).toContain("lockpicking");
    expect(actor.resources.stamina!.current).toBe(6);
  });

  it("prefers a satisfied free path (the manual) over a paid trainer", () => {
    const actor = makePlayer({ inventory: [{ itemId: "lockpick_manual", qty: 1 }] });
    const result = resolveLearnSkill(story, actor, learn("lockpicking"), { trainerPresent: true });
    expect(result.ruling.gate.allowed).toBe(true);
    expect(result.ruling.costsPaid).toBeUndefined();
  });

  it("needs someone present to teach a trainer path", () => {
    const result = resolveLearnSkill(story, makePlayer(), learn("lockpicking"), { trainerPresent: false });
    expect(result.ruling.gate).toMatchObject({ allowed: false, code: "prerequisite_failed" });
    expect(result.ruling.gate.reason).toMatch(/no one here can teach/i);
    expect(result.mutations).toEqual([]);
  });

  it("refuses an unaffordable trainer with the cost code", () => {
    const poor = makePlayer({ resources: { hp: { current: 20, max: 20 }, stamina: { current: 1, max: 10 } } });
    const result = resolveLearnSkill(story, poor, learn("lockpicking"), { trainerPresent: true });
    expect(result.ruling.gate).toMatchObject({ allowed: false, code: "cannot_afford" });
  });

  it("refuses an already-learned, unknown or missing skill, and a dead learner", () => {
    expect(resolveLearnSkill(story, makePlayer(), learn("blade"), { trainerPresent: true }).ruling.gate.reason)
      .toMatch(/already learned/i);
    expect(resolveLearnSkill(story, makePlayer(), learn("necromancy"), { trainerPresent: true }).ruling.gate.code)
      .toBe("unknown_action");
    const noSkill = { ...learn("blade") };
    delete (noSkill as { skillId?: string }).skillId;
    expect(resolveLearnSkill(story, makePlayer(), noSkill, { trainerPresent: true }).ruling.gate.code)
      .toBe("unknown_action");
    expect(resolveLearnSkill(story, makePlayer({ alive: false }), learn("lockpicking"), { trainerPresent: true }).ruling.gate.code)
      .toBe("actor_dead");
  });

  it("enforces the skill's prerequisites", () => {
    const gated = makeStory({
      skills: story.skills.map((skill) =>
        skill.id === "lockpicking"
          ? { ...skill, prerequisites: [{ type: "flag", flagId: "guild_member", value: true }] }
          : skill
      ),
    });
    const result = resolveLearnSkill(gated, makePlayer(), learn("lockpicking"), { trainerPresent: true });
    expect(result.ruling.gate).toMatchObject({ allowed: false, code: "prerequisite_failed" });
    expect(result.ruling.gate.reason).toMatch(/prerequisite/i);
  });

  it("explains when no path is open at all (no manual held, trial not completed)", () => {
    const trialOnly = makeStory({
      skills: story.skills.map((skill) =>
        skill.id === "lockpicking"
          ? { ...skill, unlockPaths: [{ method: "trial", flagId: "passed_the_guild_trial" }] }
          : skill
      ),
    });
    const result = resolveLearnSkill(trialOnly, makePlayer(), learn("lockpicking"), { trainerPresent: true });
    expect(result.ruling.gate).toMatchObject({ allowed: false, code: "prerequisite_failed" });
    expect(result.ruling.gate.reason).toMatch(/no way to learn lockpicking/i);
  });

  it("refuses on an unfrozen rulebook", () => {
    const result = resolveLearnSkill(makeStory({ locked: false }), makePlayer(), learn("lockpicking"), { trainerPresent: true });
    expect(result.ruling.gate.code).toBe("schema_unlocked");
  });
});

class LearnRouter implements Router {
  constructor(private readonly classified: ClassifiedTurn) {}
  bindingFor(_role: Role): RoleBinding {
    return { provider: "openrouter", model: "test", source: "recommended", samplersDirty: false };
  }
  async complete(role: Role, prompt: RolePrompt): Promise<ChatResponse> {
    if (role === "classifier" && prompt.system.includes("strict consistency auditor")) {
      return { content: JSON.stringify({ obeysRulings: true, contradictions: [] }) };
    }
    if (role === "classifier" && prompt.system.includes("DM loot adjudicator")) {
      return { content: JSON.stringify({ award: false, reason: "None." }) };
    }
    if (role === "classifier" && prompt.system.includes("registrar")) {
      return { content: JSON.stringify({ transitions: [] }) };
    }
    if (role === "classifier") return { content: JSON.stringify(this.classified) };
    if (role === "analyzer") return { content: JSON.stringify({ characterOps: [], worldOps: [] }) };
    return { content: JSON.stringify({ actions: [] }) };
  }
  async stream(_role: Role, _prompt: RolePrompt, onDelta: StreamHandler): Promise<ChatResponse> {
    const content = "The old fence shows you how the pins sit.";
    onDelta(content);
    return { content };
  }
}

describe("learn_skill through a real turn", () => {
  let store: Store;
  const storyId = "fixture-story";

  beforeEach(async () => {
    store = await openStore(":memory:");
    const schema = makeStory({ storyId });
    await store.stories.insert({ id: storyId, title: schema.title, createdAt: 0, schema, locked: true });
    await store.characters.insert({ id: "kestrel", storyId, name: "Kestrel", isPlayer: true, hard: makePlayer() });
  });

  it("is refused when nobody is present to teach, and learned once a teacher is", async () => {
    const router = new LearnRouter({ playerIntents: [learn("lockpicking")], npcIntents: [], freeText: "" });
    const alone = await submitTurn(router, store, storyId, "I try to teach myself lockpicking.", { rng: d20Sequence([10]) });
    await alone.background;
    expect(alone.rulings[0]!.gate).toMatchObject({ allowed: false, code: "prerequisite_failed" });

    await store.characters.insert({
      id: "fence",
      storyId,
      name: "Old Fence",
      isPlayer: false,
      hard: makeEnemy({ characterId: "fence", skills: [] }),
    });
    const taught = await submitTurn(router, store, storyId, "I ask the old fence to teach me lockpicking.", { rng: d20Sequence([10]) });
    await taught.background;
    expect(taught.rulings[0]!.gate.allowed).toBe(true);
    const kestrel = (await store.characters.get("kestrel"))!.hard;
    expect(kestrel.skills.map((skill) => skill.skillId)).toContain("lockpicking");
    expect(kestrel.resources.stamina!.current).toBe(6);
    const events = await store.events.listByStory(storyId);
    expect(events.some((event) => event.kind === "skill_unlocked")).toBe(true);
  });
});
