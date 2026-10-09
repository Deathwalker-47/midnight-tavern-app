import { beforeEach, describe, expect, it } from "vitest";
import {
  buildClassifierUser,
  combatParticipants,
  CONSUME_ITEM_ACTION_ID,
  d20Sequence,
  deleteLastTurn,
  ECONOMY_CONFIG,
  hasRecoveryEconomy,
  planRecovery,
  resolveConsumeItem,
  resolveRest,
  REST_ACTION_ID,
  submitTurn,
  validateStorySchema,
  type CharacterHardState,
  type ChatResponse,
  type ClassifiedTurn,
  type EconomyConfig,
  type MechanicalIntent,
  type ResourceDef,
  type Role,
  type RoleBinding,
  type RolePrompt,
  type Router,
  type Ruling,
  type StorySchema,
  type StreamHandler,
} from "../src/index.js";
import { openStore, type Store } from "../src/store/index.js";
import { makeEnemy, makePlayer, makeStory } from "./fixtures.js";

const pool = (overrides: Partial<ResourceDef> & Pick<ResourceDef, "id">): ResourceDef => ({
  label: overrides.id,
  start: 10,
  max: 10,
  playerVisible: true,
  ...overrides,
});
const base = makeStory();
/** A Full Stats v3 rulebook: health `hp` (20), stamina `stamina` (10), mana `aether` (10). */
const story: StorySchema = makeStory({
  schemaVersion: 3,
  attributes: [
    ...base.attributes,
    { id: "wit", name: "Wits", abbrev: "WIT", description: "Cunning.", defaultScore: 10 },
  ],
  resources: [
    pool({ id: "hp", label: "Health", start: 20, max: 20, lethal: true, role: "health" }),
    pool({ id: "stamina", label: "Stamina", role: "stamina" }),
    pool({ id: "aether", label: "Aether", role: "mana" }),
  ],
  items: [
    ...base.items,
    { id: "tonic", name: "Tonic", description: "Restorative.", kind: "consumable", tier: "common", props: {}, restores: { health: 6, mana: 4 } },
    { id: "elixir", name: "Elixir", description: "Too strong.", kind: "consumable", tier: "common", props: {}, restores: { stamina: 99 } },
  ],
});
const worn = (overrides: Partial<CharacterHardState> = {}) =>
  makePlayer({
    resources: {
      hp: { current: 10, max: 20 },
      stamina: { current: 2, max: 10 },
      aether: { current: 1, max: 10 },
    },
    inventory: [{ itemId: "tonic", qty: 2 }, { itemId: "elixir", qty: 1 }],
    ...overrides,
  });
const rest: MechanicalIntent = { actorId: "kestrel", actionId: REST_ACTION_ID, confidence: 1 };
const consume = (itemId?: string): MechanicalIntent => ({
  actorId: "kestrel",
  actionId: CONSUME_ITEM_ACTION_ID,
  confidence: 1,
  ...(itemId ? { itemId } : {}),
});

describe("recovery economy (plan 08 §5)", () => {
  it("is config-driven and versioned into the rulebook", () => {
    expect(ECONOMY_CONFIG.version).toBe(1);
    expect(ECONOMY_CONFIG.regenPerTurn.stamina).toEqual({ outOfCombat: 0.25, inCombat: 0 });
    expect(hasRecoveryEconomy(story)).toBe(true);
    expect(hasRecoveryEconomy(base)).toBe(false);
  });

  it("counts as in combat whoever acted in or was hit by a combat or wounding ruling", () => {
    const ruling = (actionId: string, extra: Partial<Ruling> = {}): Ruling => ({
      turnId: `a:${actionId}`,
      actorId: "kestrel",
      actionId,
      targetId: "wight",
      gate: { allowed: true },
      effectsApplied: { narrationHint: "x" },
      ...extra,
    });
    expect([...combatParticipants(story, [ruling("attack_wild")])]).toEqual(["kestrel", "wight"]);
    expect([...combatParticipants(story, [ruling("attack_wild", { gate: { allowed: false } })])]).toEqual([]);
    expect([...combatParticipants(story, [ruling("search_room")])]).toEqual([]);
    const hex = ruling("hex", { effectsApplied: { resourceDeltaTarget: { hp: -1 }, narrationHint: "x" } });
    expect([...combatParticipants(story, [hex])]).toEqual(["kestrel", "wight"]);
    expect([...combatParticipants(story, [ruling("attack_wild", { targetId: undefined })])]).toEqual(["kestrel"]);
  });

  it("regenerates a share of each pool at the end of a turn", () => {
    // Out of combat: health 5% of 20 = 1, stamina 25% of 10 = 3 (2.5 rounds up), mana 10% of 10 = 1.
    expect(planRecovery(story, worn(), false).gains).toEqual({ hp: 1, stamina: 3, aether: 1 });
    // In combat only the mana trickle runs (5% of 10 rounds to 1, and never below the minimum).
    expect(planRecovery(story, worn(), true)).toEqual({
      gains: { aether: 1 },
      mutations: [{ kind: "resourceDelta", characterId: "kestrel", resourceId: "aether", delta: 1 }],
    });
  });

  it("never revives, never overfills, and leaves legacy rulebooks alone", () => {
    expect(planRecovery(story, worn({ alive: false }), false)).toEqual({ gains: {}, mutations: [] });
    expect(planRecovery(base, worn(), false)).toEqual({ gains: {}, mutations: [] });
    const nearlyFull = worn({
      resources: { hp: { current: 20, max: 20 }, stamina: { current: 9, max: 10 }, aether: { current: 10, max: 10 } },
    });
    expect(planRecovery(story, nearlyFull, false).gains).toEqual({ stamina: 1 });
    // A character without a pool, or a rulebook without a role, simply skips it.
    expect(planRecovery(story, makePlayer({ resources: { hp: { current: 1, max: 20 } } }), false).gains)
      .toEqual({ hp: 1 });
    const noMana = { schemaVersion: 3 as const, resources: story.resources.filter((def) => def.role !== "mana") };
    expect(planRecovery(noMana, worn(), false).gains).toEqual({ hp: 1, stamina: 3 });
  });

  it("lets a character rest out of danger, then cool down", () => {
    const rested = resolveRest(story, worn(), rest, { threatened: false });
    expect(rested.ruling).toMatchObject({
      actionLabel: "Rest",
      gate: { allowed: true },
      effectsApplied: { resourceDeltaSelf: { hp: 10, stamina: 8, aether: 5 } },
      cooldownApplied: 3,
    });
    expect(rested.mutations.at(-1)).toEqual({
      kind: "setCooldown",
      characterId: "kestrel",
      actionId: REST_ACTION_ID,
      turns: 3,
    });
    const noCooldown: EconomyConfig = { ...ECONOMY_CONFIG, rest: { ...ECONOMY_CONFIG.rest, cooldownTurns: 0 } };
    const free = resolveRest(story, worn(), rest, { threatened: false }, noCooldown);
    expect(free.ruling.cooldownApplied).toBeUndefined();
    expect(free.mutations.some((mutation) => mutation.kind === "setCooldown")).toBe(false);
  });

  it("refuse a rest that is unsafe, too soon, or impossible", () => {
    const code = (actor = worn(), schema = story, threatened = false) =>
      resolveRest(schema, actor, rest, { threatened }).ruling.gate;
    expect(code(worn(), story, true)).toMatchObject({ allowed: false, code: "in_combat" });
    expect(code(worn({ cooldowns: { [REST_ACTION_ID]: 2 } }))).toMatchObject({
      code: "on_cooldown",
      reason: "Too soon to rest again — wait 2 more turn(s).",
    });
    expect(code(worn({ alive: false })).code).toBe("actor_dead");
    expect(code(worn(), base).code).toBe("not_invocable");
    expect(code(worn(), { ...story, locked: false }).code).toBe("schema_unlocked");
  });

  it("uses up a restoring item, clamped to the pool and the economy's ceiling", () => {
    const used = resolveConsumeItem(story, worn(), consume("tonic"));
    expect(used.ruling).toMatchObject({
      actionLabel: "Use Tonic",
      gate: { allowed: true },
      effectsApplied: { resourceDeltaSelf: { hp: 6, aether: 4 } },
      costsPaid: { items: [{ itemId: "tonic", qty: 1 }] },
    });
    expect(used.mutations.at(-1)).toEqual({ kind: "removeItem", characterId: "kestrel", itemId: "tonic", qty: 1 });
    expect(resolveConsumeItem(story, worn(), consume("elixir")).ruling.effectsApplied?.resourceDeltaSelf)
      .toEqual({ stamina: 8 });
    const stingy: EconomyConfig = { ...ECONOMY_CONFIG, maximumConsumableRestore: 2 };
    expect(resolveConsumeItem(story, worn(), consume("tonic"), stingy).ruling.effectsApplied?.resourceDeltaSelf)
      .toEqual({ hp: 2, aether: 2 });
    // Consuming works in any rulebook whose item declares what it restores.
    const legacy = makeStory({ items: story.items });
    expect(resolveConsumeItem(legacy, worn({ resources: { hp: { current: 1, max: 20 } } }), consume("tonic")).ruling
      .effectsApplied?.resourceDeltaSelf).toEqual({ hp: 6 });
  });

  it("refuse to use what is not there or restores nothing", () => {
    const gate = (intent: MechanicalIntent, actor = worn(), schema = story) =>
      resolveConsumeItem(schema, actor, intent).ruling.gate;
    expect(gate(consume("potion"))).toMatchObject({ code: "not_invocable", reason: "Healing Potion restores nothing when used." });
    expect(gate(consume("ghost_item"))).toMatchObject({ code: "item_required", reason: 'Unknown item "ghost_item".' });
    expect(gate(consume())).toMatchObject({ code: "item_required", reason: "No item was named to use." });
    expect(gate(consume("tonic"), worn({ inventory: [] }))).toMatchObject({ code: "item_required" });
    expect(gate(consume("tonic"), worn({ alive: false })).code).toBe("actor_dead");
    expect(gate(consume("tonic"), worn(), { ...story, locked: false }).code).toBe("schema_unlocked");
    expect(resolveConsumeItem(story, worn(), consume()).ruling.actionLabel).toBe("Use an item");
  });

  it("reserves the engine's action ids and offers them to the classifier only when they apply", () => {
    const clash = { ...base.actions[0]!, id: REST_ACTION_ID };
    expect(validateStorySchema({ ...story, actions: [...story.actions, clash] })).toContain(
      `Action id "${REST_ACTION_ID}" is reserved for an engine-owned action.`
    );
    const prompt = (schema: StorySchema) =>
      buildClassifierUser(schema, { playerMessage: "x", presentCharacters: [], recentNarration: [] });
    expect(prompt(story)).toMatch(/take_rest \[utility\]/);
    expect(prompt(story)).toMatch(/consume_item \[utility\].*itemId: tonic, elixir/);
    expect(prompt(base)).not.toMatch(/take_rest|consume_item/);
  });
});

class QuietRouter implements Router {
  constructor(private classified: ClassifiedTurn) {}
  setClassified(next: ClassifiedTurn): void {
    this.classified = next;
  }
  bindingFor(_role: Role): RoleBinding {
    return { provider: "openrouter", model: "test", source: "recommended", samplersDirty: false };
  }
  async complete(role: Role, prompt: RolePrompt): Promise<ChatResponse> {
    if (role === "classifier" && prompt.system.includes("NPC action planner")) {
      return { content: JSON.stringify({ actions: [] }) };
    }
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
    const content = "The fire crackles.";
    onDelta(content);
    return { content };
  }
}

describe("recovery across real turns", () => {
  let store: Store;
  const storyId = "fixture-story";
  const turn = async (router: QuietRouter, text: string) => {
    const result = await submitTurn(router, store, storyId, text, { rng: d20Sequence([15]) });
    await result.background;
    return result;
  };
  const pools = async () => (await store.characters.get("kestrel"))!.hard.resources;

  beforeEach(async () => {
    store = await openStore(":memory:");
    const schema = { ...story, storyId };
    await store.stories.insert({ id: storyId, title: schema.title, createdAt: 0, schema, locked: true });
    await store.characters.insert({ id: "kestrel", storyId, name: "Kestrel", isPlayer: true, hard: worn() });
  });

  it("regenerate on a quiet turn, journal it, and rewind it exactly", async () => {
    const router = new QuietRouter({ playerIntents: [], npcIntents: [], freeText: "" });
    await turn(router, "I sit by the fire.");
    expect(await pools()).toEqual({
      hp: { current: 11, max: 20 },
      stamina: { current: 5, max: 10 },
      aether: { current: 2, max: 10 },
    });
    const journal = (await store.events.listByStory(storyId)).filter((event) => event.kind === "recovery");
    expect(journal.map((event) => event.payload)).toEqual([
      { characterId: "kestrel", gains: { hp: 1, stamina: 3, aether: 1 } },
    ]);

    await deleteLastTurn(store, storyId);
    expect((await pools()).stamina).toEqual({ current: 2, max: 10 });
    expect((await store.events.listByStory(storyId)).some((event) => event.kind === "recovery")).toBe(false);
  });

  it("rest restores and cools down, a tonic is used up, and fighting stops regeneration", async () => {
    const router = new QuietRouter({ playerIntents: [rest], npcIntents: [], freeText: "" });
    const rested = await turn(router, "I make camp and sleep.");
    expect(rested.rulings[0]).toMatchObject({ actionId: REST_ACTION_ID, gate: { allowed: true } });
    // Rest (hp +10, stamina +8, aether +5) then the quiet-turn trickle tops up what is left.
    expect(await pools()).toEqual({
      hp: { current: 20, max: 20 },
      stamina: { current: 10, max: 10 },
      aether: { current: 7, max: 10 },
    });
    expect((await store.characters.get("kestrel"))!.hard.cooldowns).toEqual({ [REST_ACTION_ID]: 3 });

    router.setClassified({ playerIntents: [consume("tonic")], npcIntents: [], freeText: "" });
    await turn(router, "I drink a tonic.");
    const kestrel = (await store.characters.get("kestrel"))!.hard;
    expect(kestrel.inventory.find((entry) => entry.itemId === "tonic")!.qty).toBe(1);
    expect(kestrel.resources.aether!.current).toBe(10);

    await store.characters.insert({
      id: "wight",
      storyId,
      name: "Grave-wight",
      isPlayer: false,
      hard: makeEnemy({ attributes: {}, resources: { hp: { current: 20, max: 20 } } }),
    });
    await store.characters.updateHard("kestrel", { ...kestrel, resources: { ...kestrel.resources, stamina: { current: 2, max: 10 } } });
    router.setClassified({
      playerIntents: [{ actorId: "kestrel", actionId: "attack_wild", targetId: "wight", stakes: "danger", confidence: 1 }],
      npcIntents: [],
      freeText: "",
    });
    await turn(router, "I swing at the wight.");
    expect((await pools()).stamina!.current).toBe(2);
  });

  it("refuses a rest with an enemy in the room", async () => {
    await store.characters.insert({
      id: "wight",
      storyId,
      name: "Grave-wight",
      isPlayer: false,
      hard: makeEnemy({ attributes: {}, flags: { npc_hostile_to_player: true } }),
    });
    const router = new QuietRouter({ playerIntents: [rest], npcIntents: [], freeText: "" });
    const refused = await turn(router, "I lie down to rest.");
    expect(refused.rulings[0]!.gate).toMatchObject({ allowed: false, code: "in_combat" });
  });
});
