import { beforeEach, describe, expect, it } from "vitest";
import {
  ActionDefSchema,
  CharacterHardStateSchema,
  checkGate,
  commit,
  d20Sequence,
  deleteLastTurn,
  normalizeCost,
  resolve,
  submitTurn,
  validateStorySchema,
  type ActionDef,
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

const base = makeStory().actions.find((action) => action.id === "attack_wild")!;
const powerStrike: ActionDef = {
  ...base,
  id: "power_strike",
  label: "Power Strike",
  cooldownTurns: 2,
};
const story = makeStory({ actions: [...makeStory().actions, powerStrike] });
const intent: MechanicalIntent = {
  actorId: "kestrel",
  actionId: "power_strike",
  targetId: "wight",
  confidence: 1,
};

describe("action cooldowns (plan 08 §4, finding 23)", () => {
  it("accepts a bounded cooldown on an action definition", () => {
    expect(ActionDefSchema.parse(powerStrike).cooldownTurns).toBe(2);
    expect(ActionDefSchema.safeParse({ ...powerStrike, cooldownTurns: -1 }).success).toBe(false);
  });

  it("refuses an action that is still recovering, naming the wait", () => {
    const actor = makePlayer({ cooldowns: { power_strike: 2 } });
    const verdict = checkGate(story, actor, intent);
    expect(verdict).toMatchObject({ allowed: false, code: "on_cooldown" });
    expect(verdict.reason).toMatch(/Power Strike/);
    expect(verdict.reason).toMatch(/2 turns/);
    expect(checkGate(story, makePlayer({ cooldowns: { power_strike: 1 } }), intent).reason)
      .toMatch(/next turn/);
  });

  it("starts the cooldown on the attempt, win or lose, and records it on the ruling", () => {
    for (const roll of [20, 1]) {
      const actor = makePlayer();
      const result = resolve(story, actor, makeEnemy(), intent, d20Sequence([roll]));
      expect(result.ruling.cooldownApplied).toBe(2);
      commit(story, result.mutations, new Map([["kestrel", actor]]));
      expect(actor.cooldowns).toEqual({ power_strike: 2 });
    }
  });

  it("starts nothing when the gate refuses", () => {
    const actor = makePlayer({ alive: false });
    const result = resolve(story, actor, makeEnemy(), intent, d20Sequence([15]));
    expect(result.ruling.cooldownApplied).toBeUndefined();
    expect(result.mutations).toEqual([]);
  });

  it("ticks only the cooldowns that existed before this turn, and clears them at zero", () => {
    const actor = makePlayer({ cooldowns: { power_strike: 1, shield_wall: 3 } });
    commit(
      story,
      [
        { kind: "setCooldown", characterId: "kestrel", actionId: "fresh_move", turns: 2 },
        { kind: "tickCooldowns", characterId: "kestrel", actionIds: ["power_strike", "shield_wall"] },
      ],
      new Map([["kestrel", actor]])
    );
    expect(actor.cooldowns).toEqual({ shield_wall: 2, fresh_move: 2 });
  });

  it("ignores a tick for an action with no cooldown entry", () => {
    const actor = makePlayer();
    commit(
      story,
      [{ kind: "tickCooldowns", characterId: "kestrel", actionIds: ["power_strike"] }],
      new Map([["kestrel", actor]])
    );
    expect(actor.cooldowns ?? {}).toEqual({});
  });

  it("still decodes hard state persisted before cooldowns existed (rewind safety)", () => {
    const legacy = { ...makePlayer() } as Record<string, unknown>;
    delete legacy.cooldowns;
    expect(CharacterHardStateSchema.parse(legacy).cooldowns).toBeUndefined();
  });
});

describe("role-denominated costs", () => {
  const themed = makeStory({
    resources: [
      { id: "hp", label: "Health", start: 20, max: 20, playerVisible: true, lethal: true },
      { id: "aether", label: "Aether", start: 10, max: 10, playerVisible: true, role: "mana" },
    ],
  });

  it("maps a core role key to the story's own pool and leaves real ids alone", () => {
    expect(normalizeCost(themed, { resources: { mana: 4, hp: 1 } })).toEqual({
      resources: { aether: 4, hp: 1 },
    });
    expect(normalizeCost(themed, { resources: { stamina: 2 } })).toEqual({
      resources: { stamina: 2 },
    });
    expect(normalizeCost(themed, undefined)).toBeUndefined();
    expect(normalizeCost(themed, { items: [{ itemId: "gem", qty: 1 }] })).toEqual({
      items: [{ itemId: "gem", qty: 1 }],
    });
  });

  it("gates and pays a role-denominated cost from the themed pool", () => {
    const spell: ActionDef = { ...base, id: "bolt", costs: { resources: { mana: 4 } } };
    const schema = { ...themed, actions: [...themed.actions, spell] };
    const caster = makePlayer({
      resources: { hp: { current: 20, max: 20 }, aether: { current: 3, max: 10 } },
    });
    const bolt = { ...intent, actionId: "bolt" };
    expect(checkGate(schema, caster, bolt).code).toBe("cannot_afford");
    caster.resources.aether!.current = 10;
    const result = resolve(schema, caster, makeEnemy(), bolt, d20Sequence([15]));
    expect(result.ruling.costsPaid).toEqual({ resources: { aether: 4 } });
    commit(schema, result.mutations, new Map([["kestrel", caster]]));
    expect(caster.resources.aether!.current).toBe(6);
  });

  it("lets the forge validator accept a role key that maps to a pool", () => {
    const spell: ActionDef = { ...base, id: "bolt", costs: { resources: { mana: 4 } } };
    const errors = validateStorySchema({ ...themed, actions: [...themed.actions, spell] });
    expect(errors.filter((error) => /bolt/.test(error) && /resource/.test(error))).toEqual([]);
    const broken: ActionDef = { ...spell, costs: { resources: { stamina: 4 } } };
    expect(
      validateStorySchema({ ...themed, actions: [...themed.actions, broken] }).some((error) =>
        /cost uses unknown resource "stamina"/.test(error)
      )
    ).toBe(true);
  });
});

class CooldownRouter implements Router {
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
    const content = "Steel rings in the vale.";
    onDelta(content);
    return { content };
  }
}

describe("cooldowns across real turns", () => {
  let store: Store;
  const storyId = "fixture-story";

  beforeEach(async () => {
    store = await openStore(":memory:");
    const schema = makeStory({ storyId, actions: [...makeStory().actions, { ...powerStrike, cooldownTurns: 1 }] });
    await store.stories.insert({ id: storyId, title: schema.title, createdAt: 0, schema, locked: true });
    await store.characters.insert({ id: "kestrel", storyId, name: "Kestrel", isPlayer: true, hard: makePlayer() });
    await store.characters.insert({
      id: "wight",
      storyId,
      name: "Wight",
      isPlayer: false,
      hard: makeEnemy({ resources: { hp: { current: 200, max: 200 } } }),
    });
  });

  const turn = (text: string) =>
    submitTurn(
      new CooldownRouter({ playerIntents: [intent], npcIntents: [], freeText: "" }),
      store,
      storyId,
      text,
      { rng: d20Sequence([15, 15, 15, 15]) }
    );

  it("blocks exactly the next turn for a one-turn cooldown, and rewind restores it", async () => {
    const first = await turn("I put my weight behind a power strike.");
    await first.background;
    expect(first.rulings[0]!.gate.allowed).toBe(true);
    expect((await store.characters.get("kestrel"))!.hard.cooldowns).toEqual({ power_strike: 1 });

    const second = await turn("Again — power strike!");
    await second.background;
    expect(second.rulings[0]!.gate).toMatchObject({ allowed: false, code: "on_cooldown" });
    expect((await store.characters.get("kestrel"))!.hard.cooldowns ?? {}).toEqual({});

    await deleteLastTurn(store, storyId);
    expect((await store.characters.get("kestrel"))!.hard.cooldowns).toEqual({ power_strike: 1 });

    const third = await turn("Again — power strike!");
    await third.background;
    expect(third.rulings[0]!.gate.code).toBe("on_cooldown");
    const fourth = await turn("Now the power strike.");
    await fourth.background;
    expect(fourth.rulings[0]!.gate.allowed).toBe(true);
  });
});
