import { beforeEach, describe, expect, it } from "vitest";
import {
  buildClassifierSchema,
  buildClassifierUser,
  commit,
  d20Sequence,
  deleteLastTurn,
  passiveCheckBonus,
  planToggleUpkeep,
  resolveToggleSkill,
  SkillDefSchema,
  submitTurn,
  TOGGLE_SKILL_ACTION_ID,
  validateStorySchema,
  type ChatResponse,
  type ClassifiedTurn,
  type MechanicalIntent,
  type Role,
  type RoleBinding,
  type RolePrompt,
  type Router,
  type SkillDef,
  type StreamHandler,
} from "../src/index.js";
import { openStore, type Store } from "../src/store/index.js";
import { makePlayer, makeStory } from "./fixtures.js";

const trance: SkillDef = {
  id: "battle_trance",
  name: "Battle Trance",
  description: "A focused fury that costs stamina to hold.",
  tier: "common",
  prerequisites: [],
  unlockPaths: [{ method: "trial", flagId: "trance" }],
  masteryAdvance: { successesPerRank: 5 },
  skillType: "toggle",
  toggle: { upkeep: { stamina: 4 }, bonus: { checkBonus: { amount: 2, categories: ["combat"] } } },
};
const calm: SkillDef = {
  ...trance,
  id: "calm_mind",
  name: "Calm Mind",
  skillType: "passive",
  toggle: undefined,
  passive: { checkBonus: { amount: 1 } },
};
const story = makeStory({ skills: [...makeStory().skills, trance, calm] });
const wild = story.actions.find((action) => action.id === "attack_wild")!;
const flip = (skillId: string): MechanicalIntent => ({
  actorId: "kestrel",
  actionId: TOGGLE_SKILL_ACTION_ID,
  skillId,
  confidence: 1,
});
const holder = (overrides: Parameters<typeof makePlayer>[0] = {}) =>
  makePlayer({
    skills: [
      { skillId: "blade", rank: "novice", successCount: 0 },
      { skillId: "battle_trance", rank: "novice", successCount: 0 },
      { skillId: "calm_mind", rank: "novice", successCount: 0 },
    ],
    ...overrides,
  });

describe("toggle skills (plan 08 §4)", () => {
  it("accept a bounded upkeep and bonus", () => {
    expect(SkillDefSchema.parse(trance).toggle?.upkeep).toEqual({ stamina: 4 });
    expect(SkillDefSchema.safeParse({ ...trance, toggle: { upkeep: { stamina: 99 }, bonus: {} } }).success)
      .toBe(false);
  });

  it("switch on when one upkeep is affordable, and off again for free", () => {
    const actor = holder();
    const on = resolveToggleSkill(story, actor, flip("battle_trance"));
    expect(on.ruling).toMatchObject({ actionLabel: "Activate Battle Trance", gate: { allowed: true } });
    commit(story, on.mutations, new Map([["kestrel", actor]]));
    expect(actor.toggledOn).toEqual(["battle_trance"]);
    const off = resolveToggleSkill(story, actor, flip("battle_trance"));
    expect(off.ruling.actionLabel).toBe("Deactivate Battle Trance");
    commit(story, off.mutations, new Map([["kestrel", actor]]));
    expect(actor.toggledOn).toEqual([]);
  });

  it("grant their bonus only while on", () => {
    expect(passiveCheckBonus(story, holder(), wild)).toBe(1);
    expect(passiveCheckBonus(story, holder({ toggledOn: ["battle_trance"] }), wild)).toBe(3);
  });

  it("refuse what cannot be toggled", () => {
    const gate = (actor = holder(), skillId = "battle_trance", schema = story) =>
      resolveToggleSkill(schema, actor, flip(skillId)).ruling.gate;
    expect(gate(holder(), "calm_mind")).toMatchObject({ allowed: false, code: "not_invocable" });
    expect(gate(makePlayer())).toMatchObject({ allowed: false, code: "skill_required" });
    expect(gate(holder(), "necromancy").code).toBe("unknown_action");
    expect(gate(holder({ alive: false })).code).toBe("actor_dead");
    expect(gate(holder(), "battle_trance", makeStory({ locked: false, skills: story.skills })).code)
      .toBe("schema_unlocked");
    const tired = holder({ resources: { hp: { current: 20, max: 20 }, stamina: { current: 3, max: 10 } } });
    expect(gate(tired)).toMatchObject({ allowed: false, code: "cannot_afford" });
    const unnamed = { ...flip("battle_trance") };
    delete (unnamed as { skillId?: string }).skillId;
    expect(resolveToggleSkill(story, holder(), unnamed).ruling.gate.code).toBe("unknown_action");
  });

  it("pay upkeep each turn and lapse with a ruling when it cannot be paid", () => {
    const actor = holder({ toggledOn: ["battle_trance"] });
    const paid = planToggleUpkeep(story, actor);
    expect(paid.rulings).toEqual([]);
    commit(story, paid.mutations, new Map([["kestrel", actor]]));
    expect(actor.resources.stamina!.current).toBe(6);
    actor.resources.stamina!.current = 3;
    const lapse = planToggleUpkeep(story, actor);
    expect(lapse.rulings[0]).toMatchObject({
      actorId: "kestrel",
      actionId: TOGGLE_SKILL_ACTION_ID,
      actionLabel: "Battle Trance fades",
    });
    commit(story, lapse.mutations, new Map([["kestrel", actor]]));
    expect(actor.toggledOn).toEqual([]);
    expect(actor.resources.stamina!.current).toBe(3);
    expect(planToggleUpkeep(story, holder({ alive: false, toggledOn: ["battle_trance"] })))
      .toEqual({ rulings: [], mutations: [] });
    expect(planToggleUpkeep(story, holder())).toEqual({ rulings: [], mutations: [] });
    expect(planToggleUpkeep(story, holder({ toggledOn: ["no_longer_in_rulebook"] })).mutations)
      .toEqual([{ kind: "setToggle", characterId: "kestrel", skillId: "no_longer_in_rulebook", on: false }]);
  });

  it("must define their toggle", () => {
    const bare = { ...trance, toggle: undefined };
    expect(validateStorySchema({ ...story, skills: [...makeStory().skills, bare] })).toContain(
      'Toggle skill "battle_trance" defines no toggle.'
    );
    expect(validateStorySchema(story).filter((error) => /defines no toggle/.test(error))).toEqual([]);
  });

  it("is offered to the classifier only when the rulebook has toggle skills", () => {
    const ids = ["kestrel"];
    expect(buildClassifierSchema(story, ids).safeParse({
      playerIntents: [{ ...flip("battle_trance") }], npcIntents: [], freeText: "",
    }).success).toBe(true);
    expect(buildClassifierUser(story, { playerMessage: "x", presentCharacters: [], recentNarration: [] }))
      .toMatch(/toggle_skill/);
    expect(buildClassifierUser(makeStory(), { playerMessage: "x", presentCharacters: [], recentNarration: [] }))
      .not.toMatch(/toggle_skill/);
  });
});

class ToggleRouter implements Router {
  constructor(private classified: ClassifiedTurn) {}
  setClassified(next: ClassifiedTurn): void {
    this.classified = next;
  }
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
    const content = "Your breathing slows.";
    onDelta(content);
    return { content };
  }
}

describe("toggles across real turns", () => {
  let store: Store;
  const storyId = "fixture-story";

  beforeEach(async () => {
    store = await openStore(":memory:");
    const schema = makeStory({ storyId, skills: story.skills });
    await store.stories.insert({ id: storyId, title: schema.title, createdAt: 0, schema, locked: true });
    await store.characters.insert({ id: "kestrel", storyId, name: "Kestrel", isPlayer: true, hard: holder() });
  });

  it("drains each turn including the first, lapses when dry, and rewinds exactly", async () => {
    const router = new ToggleRouter({ playerIntents: [flip("battle_trance")], npcIntents: [], freeText: "" });
    const first = await submitTurn(router, store, storyId, "I sink into a battle trance.", { rng: d20Sequence([10]) });
    await first.background;
    let kestrel = (await store.characters.get("kestrel"))!.hard;
    expect(kestrel.toggledOn).toEqual(["battle_trance"]);
    expect(kestrel.resources.stamina!.current).toBe(6);

    router.setClassified({ playerIntents: [], npcIntents: [], freeText: "" });
    const second = await submitTurn(router, store, storyId, "I hold the trance.", { rng: d20Sequence([10]) });
    await second.background;
    expect((await store.characters.get("kestrel"))!.hard.resources.stamina!.current).toBe(2);

    const third = await submitTurn(router, store, storyId, "Still holding.", { rng: d20Sequence([10]) });
    await third.background;
    expect(third.rulings.some((ruling) => ruling.actionLabel === "Battle Trance fades")).toBe(true);
    kestrel = (await store.characters.get("kestrel"))!.hard;
    expect(kestrel.toggledOn).toEqual([]);
    expect(kestrel.resources.stamina!.current).toBe(2);

    await deleteLastTurn(store, storyId);
    kestrel = (await store.characters.get("kestrel"))!.hard;
    expect(kestrel.toggledOn).toEqual(["battle_trance"]);
    expect(kestrel.resources.stamina!.current).toBe(2);
  });
});
