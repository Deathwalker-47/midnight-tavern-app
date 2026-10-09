import { beforeEach, describe, expect, it } from "vitest";
import {
  CharacterHardStateSchema,
  commit,
  d20Sequence,
  deleteLastTurn,
  EffectSpecSchema,
  planStatusTick,
  resolve,
  statusAttributeBonus,
  statusCheckBonus,
  submitTurn,
  type ActionDef,
  type ChatResponse,
  type ClassifiedTurn,
  type MechanicalIntent,
  type Role,
  type RoleBinding,
  type RolePrompt,
  type Router,
  type StatusEffectSpec,
  type StreamHandler,
} from "../src/index.js";
import { openStore, type Store } from "../src/store/index.js";
import { makeEnemy, makePlayer, makeStory } from "./fixtures.js";

const burning: StatusEffectSpec = {
  id: "burning",
  label: "Burning",
  durationTurns: 2,
  resourcePerTurn: { hp: -3 },
};
const inspired: StatusEffectSpec = {
  id: "inspired",
  label: "Inspired",
  durationTurns: 3,
  checkBonus: 2,
  attributeBonus: { str: 4 },
};
const wild = makeStory().actions.find((action) => action.id === "attack_wild")!;
const firebrand: ActionDef = {
  ...wild,
  id: "firebrand",
  label: "Firebrand",
  effects: {
    ...wild.effects,
    success: { ...wild.effects.success, statusTarget: burning },
    crit_success: { ...wild.effects.crit_success, statusTarget: burning },
  },
};
const rally: ActionDef = {
  ...wild,
  id: "rally",
  category: "social",
  label: "Rally",
  governingAttribute: "str",
  effects: {
    crit_success: { narrationHint: "You blaze with resolve.", statusSelf: inspired },
    success: { narrationHint: "You steady yourself.", statusSelf: inspired },
    failure: { narrationHint: "Doubt lingers." },
    crit_failure: { narrationHint: "Your voice cracks." },
  },
};
const story = makeStory({ actions: [...makeStory().actions, firebrand, rally] });
const intent = (actionId: string): MechanicalIntent => ({
  actorId: "kestrel",
  actionId,
  targetId: "wight",
  confidence: 1,
});

describe("status effect definitions", () => {
  it("accepts bounded statuses on either side of an outcome", () => {
    expect(EffectSpecSchema.parse({ narrationHint: "x", statusTarget: burning }).statusTarget)
      .toEqual(burning);
    expect(EffectSpecSchema.safeParse({ narrationHint: "x", statusSelf: { ...inspired, durationTurns: 0 } }).success)
      .toBe(false);
    expect(EffectSpecSchema.safeParse({ narrationHint: "x", statusSelf: { ...inspired, durationTurns: 11 } }).success)
      .toBe(false);
    expect(EffectSpecSchema.safeParse({ narrationHint: "x", statusSelf: { ...inspired, checkBonus: 9 } }).success)
      .toBe(false);
  });

  it("still decodes hard state persisted before statuses existed", () => {
    const legacy = { ...makePlayer() } as Record<string, unknown>;
    delete legacy.activeEffects;
    expect(CharacterHardStateSchema.parse(legacy).activeEffects).toBeUndefined();
  });
});

describe("applying and refreshing statuses", () => {
  it("applies a status to the target on success and records its source", () => {
    const actor = makePlayer();
    const target = makeEnemy();
    const result = resolve(story, actor, target, intent("firebrand"), d20Sequence([18]));
    expect(result.ruling.roll?.outcome).toBe("success");
    commit(story, result.mutations, new Map([["kestrel", actor], ["wight", target]]));
    expect(target.activeEffects).toEqual([
      {
        id: "burning",
        label: "Burning",
        remainingTurns: 2,
        resourcePerTurn: { hp: -3 },
        sourceActorId: "kestrel",
        sourceActionId: "firebrand",
      },
    ]);
  });

  it("does not apply on failure", () => {
    const target = makeEnemy();
    const result = resolve(story, makePlayer(), target, intent("firebrand"), d20Sequence([2]));
    commit(story, result.mutations, new Map([["wight", target]]));
    expect(target.activeEffects ?? []).toEqual([]);
  });

  it("refreshes rather than stacks the same status", () => {
    const target = makeEnemy({
      activeEffects: [
        { id: "burning", label: "Burning", remainingTurns: 1, resourcePerTurn: { hp: -3 }, sourceActorId: "x", sourceActionId: "y" },
      ],
    });
    const result = resolve(story, makePlayer(), target, intent("firebrand"), d20Sequence([18]));
    commit(story, result.mutations, new Map([["wight", target]]));
    expect(target.activeEffects).toHaveLength(1);
    expect(target.activeEffects![0]!.remainingTurns).toBe(2);
  });
});

describe("statuses modify checks", () => {
  const inspiredActor = () =>
    makePlayer({
      activeEffects: [
        { ...inspired, remainingTurns: 3, sourceActorId: "kestrel", sourceActionId: "rally" },
      ],
    });

  it("sums check and attribute bonuses from active statuses", () => {
    expect(statusCheckBonus(inspiredActor())).toBe(2);
    expect(statusAttributeBonus(inspiredActor(), "str")).toBe(4);
    expect(statusAttributeBonus(inspiredActor(), "dex")).toBe(0);
    expect(statusCheckBonus(makePlayer())).toBe(0);
  });

  it("adds them to the roll and records the status modifier", () => {
    // rally is governed by STR: 14 → +2 base; Inspired adds +4 STR (18 → +4) and +2 to the check.
    const plain = resolve(story, makePlayer(), makeEnemy(), intent("rally"), d20Sequence([10]));
    const boosted = resolve(story, inspiredActor(), makeEnemy(), intent("rally"), d20Sequence([10]));
    expect(plain.ruling.roll?.attributeModifier).toBe(2);
    expect(boosted.ruling.roll?.attributeModifier).toBe(4);
    expect(boosted.ruling.roll?.statusModifier).toBe(2);
    expect(boosted.ruling.roll!.total - plain.ruling.roll!.total).toBe(4);
  });
});

describe("per-turn status ticks", () => {
  it("applies the per-turn change as a ruling the narrator sees, then counts down", () => {
    const wight = makeEnemy({
      activeEffects: [
        { id: "burning", label: "Burning", remainingTurns: 2, resourcePerTurn: { hp: -3 }, sourceActorId: "kestrel", sourceActionId: "firebrand" },
      ],
    });
    const tick = planStatusTick(story, wight, ["burning"]);
    expect(tick.rulings).toHaveLength(1);
    expect(tick.rulings[0]).toMatchObject({
      actorId: "wight",
      actionId: "status_burning",
      actionLabel: "Burning",
      gate: { allowed: true },
      effectsApplied: { resourceDeltaSelf: { hp: -3 } },
    });
    commit(story, tick.mutations, new Map([["wight", wight]]));
    expect(wight.resources.hp!.current).toBe(9);
    expect(wight.activeEffects![0]!.remainingTurns).toBe(1);
    commit(story, planStatusTick(story, wight, ["burning"]).mutations, new Map([["wight", wight]]));
    expect(wight.resources.hp!.current).toBe(6);
    expect(wight.activeEffects).toEqual([]);
  });

  it("emits no ruling for a pure bonus status, only the countdown", () => {
    const actor = makePlayer({
      activeEffects: [{ ...inspired, remainingTurns: 1, sourceActorId: "kestrel", sourceActionId: "rally" }],
    });
    const tick = planStatusTick(story, actor, ["inspired"]);
    expect(tick.rulings).toEqual([]);
    commit(story, tick.mutations, new Map([["kestrel", actor]]));
    expect(actor.activeEffects).toEqual([]);
  });

  it("ignores statuses not in the start-of-turn snapshot", () => {
    const actor = makePlayer({
      activeEffects: [{ ...inspired, remainingTurns: 3, sourceActorId: "kestrel", sourceActionId: "rally" }],
    });
    const tick = planStatusTick(story, actor, ["something_else"]);
    commit(story, tick.mutations, new Map([["kestrel", actor]]));
    expect(actor.activeEffects![0]!.remainingTurns).toBe(3);
  });

  it("does nothing for a bearer without statuses", () => {
    expect(planStatusTick(story, makePlayer(), ["burning"])).toEqual({ rulings: [], mutations: [] });
  });

  it("skips zero changes, pools the bearer lacks, and roles the story cannot map", () => {
    // makeStory has hp + stamina but no mana pool; gold is neither a pool nor a role.
    const bearer = makePlayer({
      activeEffects: [
        { id: "odd", label: "Odd", remainingTurns: 2, resourcePerTurn: { hp: 0, mana: -2, gold: 3 }, sourceActorId: "x", sourceActionId: "y" },
      ],
    });
    const tick = planStatusTick(story, bearer, ["odd"]);
    expect(tick.rulings).toEqual([]);
    expect(tick.mutations).toEqual([{ kind: "tickStatuses", characterId: "kestrel", statusIds: ["odd"] }]);
  });

  it("leaves unlisted statuses untouched when the ledger counts down", () => {
    const actor = makePlayer({
      activeEffects: [
        { ...inspired, remainingTurns: 3, sourceActorId: "kestrel", sourceActionId: "rally" },
        { id: "burning", label: "Burning", remainingTurns: 2, resourcePerTurn: { hp: -1 }, sourceActorId: "x", sourceActionId: "y" },
      ],
    });
    const bare = makePlayer();
    commit(
      story,
      [
        { kind: "tickStatuses", characterId: "kestrel", statusIds: ["burning"] },
        { kind: "tickStatuses", characterId: "bare", statusIds: ["burning"] },
      ],
      new Map([["kestrel", actor], ["bare", bare]])
    );
    expect(actor.activeEffects!.map((status) => [status.id, status.remainingTurns])).toEqual([
      ["inspired", 3],
      ["burning", 1],
    ]);
    expect(bare.activeEffects).toEqual([]);
  });

  it("maps a role key to the story's own pool", () => {
    const themed = makeStory({
      resources: [
        { id: "vigor", label: "Vigor", start: 20, max: 20, playerVisible: true, lethal: true },
      ],
    });
    const bearer = makePlayer({
      resources: { vigor: { current: 10, max: 20 } },
      activeEffects: [
        { id: "regen", label: "Regeneration", remainingTurns: 1, resourcePerTurn: { health: 4 }, sourceActorId: "kestrel", sourceActionId: "x" },
      ],
    });
    const tick = planStatusTick(themed, bearer, ["regen"]);
    expect(tick.rulings[0]!.effectsApplied?.resourceDeltaSelf).toEqual({ vigor: 4 });
    commit(themed, tick.mutations, new Map([["kestrel", bearer]]));
    expect(bearer.resources.vigor!.current).toBe(14);
  });

  it("never heals the dead and lets poison kill through the ledger", () => {
    const dying = makeEnemy({
      resources: { hp: { current: 2, max: 12 } },
      activeEffects: [
        { id: "burning", label: "Burning", remainingTurns: 2, resourcePerTurn: { hp: -3 }, sourceActorId: "kestrel", sourceActionId: "firebrand" },
      ],
    });
    const died = commit(story, planStatusTick(story, dying, ["burning"]).mutations, new Map([["wight", dying]]));
    expect(died).toEqual(["wight"]);
    const corpse = makeEnemy({
      alive: false,
      resources: { hp: { current: 0, max: 12 } },
      activeEffects: [
        { id: "regen", label: "Regeneration", remainingTurns: 2, resourcePerTurn: { hp: 5 }, sourceActorId: "x", sourceActionId: "y" },
      ],
    });
    const tick = planStatusTick(story, corpse, ["regen"]);
    expect(tick.rulings).toEqual([]);
    commit(story, tick.mutations, new Map([["wight", corpse]]));
    expect(corpse.resources.hp!.current).toBe(0);
  });
});

class StatusRouter implements Router {
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
    const content = "Flames lick at the wight.";
    onDelta(content);
    return { content };
  }
}

describe("statuses across real turns", () => {
  let store: Store;
  const storyId = "fixture-story";

  beforeEach(async () => {
    store = await openStore(":memory:");
    const schema = makeStory({ storyId, actions: [...makeStory().actions, firebrand] });
    await store.stories.insert({ id: storyId, title: schema.title, createdAt: 0, schema, locked: true });
    await store.characters.insert({ id: "kestrel", storyId, name: "Kestrel", isPlayer: true, hard: makePlayer() });
    await store.characters.insert({
      id: "wight",
      storyId,
      name: "Wight",
      isPlayer: false,
      hard: makeEnemy({ resources: { hp: { current: 60, max: 60 } }, skills: [] }),
    });
  });

  it("burns for exactly the next two turns, reported as rulings, and rewinds exactly", async () => {
    const router = new StatusRouter({ playerIntents: [intent("firebrand")], npcIntents: [], freeText: "" });
    const first = await submitTurn(router, store, storyId, "I set the wight alight.", { rng: d20Sequence([18, 2, 2, 2]) });
    await first.background;
    const afterFirst = (await store.characters.get("wight"))!.hard;
    expect(afterFirst.activeEffects?.map((effect) => effect.remainingTurns)).toEqual([2]);
    const hpAfterFirst = afterFirst.resources.hp!.current;

    router.setClassified({ playerIntents: [], npcIntents: [], freeText: "" });
    const second = await submitTurn(router, store, storyId, "I watch it burn.", { rng: d20Sequence([2, 2, 2]) });
    await second.background;
    expect(second.rulings.some((ruling) => ruling.actionId === "status_burning")).toBe(true);
    expect((await store.characters.get("wight"))!.hard.resources.hp!.current).toBe(hpAfterFirst - 3);

    await deleteLastTurn(store, storyId);
    const restored = (await store.characters.get("wight"))!.hard;
    expect(restored.resources.hp!.current).toBe(hpAfterFirst);
    expect(restored.activeEffects?.map((effect) => effect.remainingTurns)).toEqual([2]);

    for (const text of ["It burns.", "It still burns.", "Embers now."]) {
      const result = await submitTurn(router, store, storyId, text, { rng: d20Sequence([2, 2, 2]) });
      await result.background;
    }
    const final = (await store.characters.get("wight"))!.hard;
    expect(final.resources.hp!.current).toBe(hpAfterFirst - 6);
    expect(final.activeEffects ?? []).toEqual([]);
  });
});
