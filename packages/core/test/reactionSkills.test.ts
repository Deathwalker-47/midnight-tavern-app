import { beforeEach, describe, expect, it } from "vitest";
import {
  buildClassifierUser,
  checkGate,
  d20Sequence,
  deleteLastTurn,
  planSkillReactions,
  renderRuling,
  resolve,
  SkillDefSchema,
  submitTurn,
  validateStorySchema,
  type ActionDef,
  type CharacterHardState,
  type ChatResponse,
  type ClassifiedTurn,
  type MechanicalIntent,
  type Role,
  type RoleBinding,
  type RolePrompt,
  type Router,
  type Ruling,
  type SkillDef,
  type StreamHandler,
} from "../src/index.js";
import { openStore, type Store } from "../src/store/index.js";
import { makeEnemy, makePlayer, makeStory } from "./fixtures.js";

const base = makeStory();
const blade = base.skills.find((skill) => skill.id === "blade")!;
const riposteSkill: SkillDef = {
  ...blade,
  id: "riposte",
  name: "Riposte",
  description: "Strike back the moment you are attacked.",
  prerequisites: [],
  skillType: "reaction",
  reaction: { trigger: "attacked", actionId: "riposte_strike" },
};
const thornsSkill: SkillDef = {
  ...riposteSkill,
  id: "thorns",
  name: "Thorns",
  reaction: { trigger: "damaged", actionId: "thorn_lash" },
};
const counter = (id: string, label: string, requiresSkill: string): ActionDef => ({
  id,
  category: "combat",
  label,
  requiresSkill,
  dc: 10,
  effects: {
    crit_success: { resourceDeltaTarget: { hp: -4 }, narrationHint: "a perfect counter" },
    success: { resourceDeltaTarget: { hp: -2 }, narrationHint: "the counter lands" },
    failure: { narrationHint: "the counter is turned aside" },
    crit_failure: { narrationHint: "the counter goes wild" },
  },
});
const story = makeStory({
  skills: [...base.skills, riposteSkill, thornsSkill],
  actions: [
    ...base.actions,
    counter("riposte_strike", "Riposte", "riposte"),
    counter("thorn_lash", "Thorn lash", "thorns"),
  ],
});
const knows = (skillId: string) => ({ skillId, rank: "novice" as const, successCount: 0 });
const duelist = (overrides: Partial<CharacterHardState> = {}) =>
  makePlayer({ skills: [knows("blade"), knows("riposte")], ...overrides });
const thorny = (overrides: Partial<CharacterHardState> = {}) =>
  makeEnemy({ skills: [knows("blade"), knows("thorns")], ...overrides });

/** An allowed ruling of `actionId` by `actorId` against `targetId`, optionally dealing damage. */
const struck = (
  actorId: string,
  targetId: string | undefined,
  options: { actionId?: string; damage?: number; allowed?: boolean } = {}
): Ruling => ({
  turnId: `${actorId}:${options.actionId ?? "attack_wild"}`,
  actorId,
  actionId: options.actionId ?? "attack_wild",
  ...(targetId ? { targetId } : {}),
  gate: options.allowed === false ? { allowed: false, reason: "no", code: "skill_required" } : { allowed: true },
  effectsApplied: options.damage
    ? { resourceDeltaTarget: { hp: -options.damage }, narrationHint: "a hit" }
    : { narrationHint: "a miss" },
});
const working = (...characters: CharacterHardState[]) =>
  new Map(characters.map((character) => [character.characterId, character]));

describe("reaction skills (plan 08 §4)", () => {
  it("name a trigger and the action they fire", () => {
    expect(SkillDefSchema.parse(riposteSkill).reaction).toEqual({
      trigger: "attacked",
      actionId: "riposte_strike",
    });
    expect(
      SkillDefSchema.safeParse({ ...riposteSkill, reaction: { trigger: "bored", actionId: "x" } }).success
    ).toBe(false);
  });

  it("gate their action: never usable at will, always usable as the reaction", () => {
    const intent: MechanicalIntent = {
      actorId: "kestrel",
      actionId: "riposte_strike",
      targetId: "wight",
      confidence: 1,
    };
    expect(checkGate(story, duelist(), intent)).toMatchObject({ allowed: false, code: "not_invocable" });
    expect(checkGate(story, duelist(), intent, { asReaction: true })).toEqual({ allowed: true });
    const reflex = resolve(story, duelist(), makeEnemy(), intent, d20Sequence([15]), { asReaction: true });
    expect(reflex.ruling.gate.allowed).toBe(true);
  });

  it("fire once against whoever attacked the holder", () => {
    const planned = planSkillReactions(story, [struck("wight", "kestrel")], working(duelist(), makeEnemy()));
    expect(planned).toEqual([
      {
        intent: {
          actorId: "kestrel",
          actionId: "riposte_strike",
          targetId: "wight",
          stakes: "danger",
          confidence: 1,
        },
        skill: riposteSkill,
        trigger: "attacked",
        sourceActorId: "wight",
      },
    ]);
    // One reaction per character per turn, however often it is attacked.
    const twice = [struck("wight", "kestrel"), struck("wight", "kestrel", { damage: 3 })];
    expect(planSkillReactions(story, twice, working(duelist(), makeEnemy()))).toHaveLength(1);
  });

  it("fire a damage trigger only when the hit actually landed", () => {
    const people = working(makePlayer(), thorny());
    expect(planSkillReactions(story, [struck("kestrel", "wight")], people)).toEqual([]);
    expect(planSkillReactions(story, [struck("kestrel", "wight", { damage: 3 })], people)).toMatchObject([
      { intent: { actorId: "wight", actionId: "thorn_lash", targetId: "kestrel" }, trigger: "damaged" },
    ]);
  });

  it("hand a weapon-swinging reaction the holder's weapon", () => {
    const armed: SkillDef = { ...riposteSkill, reaction: { trigger: "attacked", actionId: "armed_riposte" } };
    const schema = makeStory({
      skills: [...base.skills, armed],
      actions: [...base.actions, { ...counter("armed_riposte", "Armed riposte", "riposte"), requiresItemKind: "weapon" }],
    });
    const [planned] = planSkillReactions(schema, [struck("wight", "kestrel")], working(duelist(), makeEnemy()));
    expect(planned!.intent.itemId).toBe("sword");
    const unarmed = duelist({ inventory: [{ itemId: "sword", qty: 0 }, { itemId: "herb", qty: 2 }] });
    const [bare] = planSkillReactions(schema, [struck("wight", "kestrel")], working(unarmed, makeEnemy()));
    expect(bare!.intent.itemId).toBeUndefined();
  });

  it("ignore what is not an attack on a living holder by a living attacker", () => {
    const people = working(duelist(), makeEnemy());
    const none = (rulings: Ruling[], who = people, schema = story) =>
      expect(planSkillReactions(schema, rulings, who)).toEqual([]);
    none([struck("wight", "kestrel", { allowed: false })]);
    none([struck("wight", undefined)]);
    none([struck("kestrel", "kestrel")]);
    none([struck("wight", "kestrel", { actionId: "search_room" })]);
    none([struck("wight", "kestrel", { actionId: "toggle_skill" })]);
    none([struck("wight", "kestrel")], working(duelist({ alive: false }), makeEnemy()));
    none([struck("wight", "kestrel")], working(duelist(), makeEnemy({ alive: false })));
    none([struck("wight", "kestrel")], working(duelist()));
    none([struck("wight", "kestrel")], working(makeEnemy()));
    none([struck("ghost", "kestrel")], working(duelist(), makeEnemy()));
    none([struck("wight", "kestrel")], working(makePlayer(), makeEnemy()));
    none([struck("wight", "kestrel")], people, base);
    const broken = { ...riposteSkill, reaction: { trigger: "attacked" as const, actionId: "nope" } };
    none([struck("wight", "kestrel")], people, { ...story, skills: [...base.skills, broken] });
    // A non-combat action that can wound still counts as an attack.
    const wounding: ActionDef = { ...counter("hex", "Hex", "blade"), category: "social" };
    const schema = { ...story, actions: [...story.actions, wounding] };
    expect(planSkillReactions(schema, [struck("wight", "kestrel", { actionId: "hex" })], people)).toHaveLength(1);
  });

  it("are validated: a reaction must fire a real action that only it gates", () => {
    const errors = (skills: SkillDef[], actions = story.actions) =>
      validateStorySchema({ ...story, skills: [...base.skills, ...skills], actions });
    const clean = errors([riposteSkill, thornsSkill]);
    expect(clean.filter((error) => /riposte|thorn/i.test(error))).toEqual([]);
    expect(errors([{ ...riposteSkill, reaction: undefined }, thornsSkill])).toContain(
      'Reaction skill "riposte" defines no reaction.'
    );
    expect(
      errors([{ ...riposteSkill, reaction: { trigger: "attacked", actionId: "nope" } }, thornsSkill])
    ).toContain('Reaction skill "riposte" fires unknown action "nope".');
    expect(
      errors([{ ...riposteSkill, reaction: { trigger: "attacked", actionId: "attack_wild" } }, thornsSkill])
    ).toContain(
      'Action "riposte_strike" requires reaction skill "riposte" but that reaction fires "attack_wild", so it can never be used.'
    );
    // A reaction that fires an ungated action is exercised through its trigger, not a gate.
    const freeSwing = { ...riposteSkill, reaction: { trigger: "attacked" as const, actionId: "attack_wild" } };
    expect(
      errors([freeSwing, thornsSkill], story.actions.filter((action) => action.id !== "riposte_strike"))
        .filter((error) => /riposte/.test(error))
    ).toEqual([]);
  });

  it("are left out of the classifier's catalogue", () => {
    const user = buildClassifierUser(story, { playerMessage: "x", presentCharacters: [], recentNarration: [] });
    expect(user).not.toMatch(/riposte_strike/);
    expect(user).toMatch(/attack_wild/);
  });
});

class ReactionRouter implements Router {
  constructor(private readonly classified: ClassifiedTurn) {}
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
    const content = "Steel answers steel.";
    onDelta(content);
    return { content };
  }
}

describe("reactions across a real turn", () => {
  let store: Store;
  const storyId = "fixture-story";
  const attack: MechanicalIntent = {
    actorId: "kestrel",
    actionId: "attack_wild",
    targetId: "wight",
    stakes: "danger",
    confidence: 1,
  };

  async function seed(options: { actions?: ActionDef[]; kestrel?: CharacterHardState } = {}) {
    const schema = makeStory({ storyId, skills: story.skills, actions: options.actions ?? story.actions });
    await store.stories.insert({ id: storyId, title: schema.title, createdAt: 0, schema, locked: true });
    const kestrel = options.kestrel ?? duelist();
    await store.characters.insert({ id: "kestrel", storyId, name: "Kestrel", isPlayer: true, hard: kestrel });
    await store.characters.insert({ id: "wight", storyId, name: "Grave-wight", isPlayer: false, hard: thorny({ attributes: {} }) });
  }

  /** Every roll is 15: wild swings and both counters hit. */
  async function swing() {
    const router = new ReactionRouter({ playerIntents: [attack], npcIntents: [], freeText: "" });
    const turn = await submitTurn(router, store, storyId, "I swing at the wight.", { rng: d20Sequence([15]) });
    await turn.background;
    return turn;
  }

  beforeEach(async () => {
    store = await openStore(":memory:");
  });

  it("answer each attack once, never chain, explain themselves, and rewind exactly", async () => {
    await seed();
    // The player's wild swing hits (-3) and the wight's counter hits (-3); then the wight's thorns
    // answer the player's hit (-2) and the player's riposte answers the counter (-2).
    const turn = await swing();

    const reactions = turn.rulings.filter((ruling) => ruling.reaction);
    expect(reactions.map((ruling) => [ruling.actorId, ruling.actionId, ruling.targetId])).toEqual([
      ["wight", "thorn_lash", "kestrel"],
      ["kestrel", "riposte_strike", "wight"],
    ]);
    expect(reactions[1]!.reaction).toEqual({
      skillId: "riposte",
      skillName: "Riposte",
      trigger: "attacked",
      sourceActorId: "wight",
    });
    const names = new Map([["kestrel", "Kestrel"], ["wight", "Grave-wight"]]);
    const actionsById = new Map(story.actions.map((action) => [action.id, action]));
    expect(renderRuling(reactions[1]!, actionsById, (id) => names.get(id) ?? id)).toContain(
      "This was Kestrel's Riposte reaction to Grave-wight's attack."
    );
    expect((await store.characters.get("kestrel"))!.hard.resources.hp!.current).toBe(20 - 3 - 2);
    expect((await store.characters.get("wight"))!.hard.resources.hp!.current).toBe(12 - 3 - 2);

    await deleteLastTurn(store, storyId);
    expect((await store.characters.get("kestrel"))!.hard.resources.hp!.current).toBe(20);
    expect((await store.characters.get("wight"))!.hard.resources.hp!.current).toBe(12);
  });

  it("silently skip a reaction the gate refuses", async () => {
    const costly = story.actions.map((action) =>
      action.id === "riposte_strike" ? { ...action, costs: { resources: { stamina: 50 } } } : action
    );
    await seed({ actions: costly });
    const turn = await swing();
    expect(turn.rulings.filter((ruling) => ruling.reaction).map((ruling) => ruling.actorId)).toEqual(["wight"]);
    expect(turn.rulings.some((ruling) => ruling.actionId === "riposte_strike")).toBe(false);
  });

  it("drop a reaction whose holder an earlier reaction has already put down", async () => {
    await seed({ kestrel: duelist({ resources: { hp: { current: 5, max: 20 }, stamina: { current: 10, max: 10 } } }) });
    // The wight's counter leaves Kestrel on 2 and its thorns finish Kestrel, so no riposte follows.
    const turn = await swing();
    const thorns = turn.rulings.find((ruling) => ruling.actionId === "thorn_lash")!;
    expect(thorns.causedDeathOf).toEqual(["kestrel"]);
    expect(turn.rulings.some((ruling) => ruling.actionId === "riposte_strike")).toBe(false);
  });

  it("drop a reaction aimed at someone an earlier reaction has already put down", async () => {
    // Thorns cost the wight its last 9 hp, so Kestrel's riposte has no one left to answer.
    const bloodPrice = story.actions.map((action) =>
      action.id === "thorn_lash" ? { ...action, costs: { resources: { hp: 9 } } } : action
    );
    await seed({ actions: bloodPrice });
    const turn = await swing();
    expect(turn.rulings.find((ruling) => ruling.actionId === "thorn_lash")!.causedDeathOf).toEqual(["wight"]);
    expect(turn.rulings.some((ruling) => ruling.actionId === "riposte_strike")).toBe(false);
  });
});
