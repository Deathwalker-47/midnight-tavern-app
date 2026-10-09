import { beforeEach, describe, expect, it } from "vitest";
import {
  ActionDefSchema,
  actionRequiresCharacterTarget,
  buildClassifierSchema,
  buildClassifierUser,
  d20Sequence,
  deleteLastTurn,
  expandTargets,
  MechanicalIntentSchema,
  renderRuling,
  resolveAgainstEach,
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
  type StreamHandler,
  type TargetCandidate,
} from "../src/index.js";
import { openStore, type Store } from "../src/store/index.js";
import { makeEnemy, makePlayer, makeStory } from "./fixtures.js";

const base = makeStory();
const wave: ActionDef = {
  id: "flame_wave",
  category: "combat",
  label: "Flame Wave",
  dc: 10,
  costs: { resources: { stamina: 3 } },
  cooldownTurns: 2,
  targeting: { scope: "all_enemies" },
  effects: {
    crit_success: { resourceDeltaTarget: { hp: -6 }, narrationHint: "an inferno" },
    success: {
      resourceDeltaTarget: { hp: -4 },
      resourceDeltaSelf: { hp: 1 },
      narrationHint: "flames wash over them",
    },
    failure: { narrationHint: "the flames gutter" },
    crit_failure: { resourceDeltaSelf: { hp: -2 }, narrationHint: "the flames turn back" },
  },
};
const rally: ActionDef = {
  ...wave,
  id: "rally",
  label: "Rally",
  category: "social",
  governingAttribute: "str",
  costs: undefined,
  cooldownTurns: undefined,
  targeting: { scope: "all_allies" },
  effects: {
    crit_success: { statusTarget: { id: "rallied", label: "Rallied", durationTurns: 2, checkBonus: 2 }, narrationHint: "spirits soar" },
    success: { statusTarget: { id: "rallied", label: "Rallied", durationTurns: 2, checkBonus: 1 }, narrationHint: "spirits lift" },
    failure: { narrationHint: "nobody listens" },
    crit_failure: { narrationHint: "a cracked voice" },
  },
};
const story = makeStory({ actions: [...base.actions, wave, rally] });
const candidate = (characterId: string, hostile = false, alive = true): TargetCandidate => ({
  characterId,
  alive,
  hostile,
});
const scene = [
  candidate("kestrel"),
  candidate("innkeeper"),
  candidate("wight", true),
  candidate("ghoul", true),
  candidate("corpse", true, false),
];
const scoped = (scope: NonNullable<ActionDef["targeting"]>["scope"], maxTargets?: number) => ({
  targeting: { scope, ...(maxTargets ? { maxTargets } : {}) },
});
const by = (actorId: string, extra: Partial<MechanicalIntent> = {}): MechanicalIntent => ({
  actorId,
  actionId: "flame_wave",
  confidence: 1,
  stakes: "danger",
  ...extra,
});

describe("targeting scopes (plan 08 §4)", () => {
  it("are part of an action, bounded", () => {
    expect(ActionDefSchema.parse(wave).targeting).toEqual({ scope: "all_enemies" });
    expect(ActionDefSchema.safeParse({ ...wave, targeting: { scope: "area", maxTargets: 9 } }).success).toBe(false);
    expect(ActionDefSchema.safeParse({ ...wave, targeting: { scope: "everyone" } }).success).toBe(false);
    expect(MechanicalIntentSchema.safeParse({ ...by("kestrel"), targetIds: Array(9).fill("x") }).success).toBe(false);
  });

  it("leave single-target actions alone", () => {
    expect(expandTargets({}, by("kestrel", { targetId: "wight" }), scene)).toBeUndefined();
    expect(expandTargets(scoped("single"), by("kestrel", { targetId: "wight" }), scene)).toBeUndefined();
  });

  it("reach the actor, named targets, a side, or everyone around", () => {
    expect(expandTargets(scoped("self"), by("kestrel", { targetId: "wight" }), scene)).toEqual(["kestrel"]);
    const named = by("kestrel", { targetId: "wight", targetIds: ["ghoul", "wight", "kestrel", "corpse", "ghost"] });
    expect(expandTargets(scoped("multiple"), named, scene)).toEqual(["wight", "ghoul"]);
    expect(expandTargets(scoped("multiple", 1), named, scene)).toEqual(["wight"]);
    expect(expandTargets(scoped("multiple"), by("kestrel", { targetId: "ghoul" }), scene)).toEqual(["ghoul"]);
    const crowd = [...scene, candidate("a"), candidate("b"), candidate("c")];
    expect(expandTargets(scoped("multiple"), by("kestrel", { targetIds: ["a", "b", "c", "innkeeper"] }), crowd))
      .toEqual(["innkeeper", "a", "b"]);
    expect(expandTargets(scoped("all_allies"), by("kestrel"), scene)).toEqual(["kestrel", "innkeeper"]);
    expect(expandTargets(scoped("all_enemies"), by("kestrel"), scene)).toEqual(["wight", "ghoul"]);
    expect(expandTargets(scoped("all_allies"), by("wight"), scene)).toEqual(["wight", "ghoul"]);
    expect(expandTargets(scoped("all_enemies"), by("wight"), scene)).toEqual(["kestrel", "innkeeper"]);
    expect(expandTargets(scoped("area"), by("kestrel"), scene)).toEqual(["innkeeper", "wight", "ghoul"]);
    expect(expandTargets(scoped("area", 2), by("kestrel"), scene)).toEqual(["innkeeper", "wight"]);
    // An actor missing from the roster sides with the unflagged.
    expect(expandTargets(scoped("all_enemies"), by("stranger"), scene)).toEqual(["wight", "ghoul"]);
    expect(expandTargets(scoped("all_enemies"), by("kestrel"), [candidate("kestrel")])).toEqual([]);
  });

  it("resolve one attempt per target: one cost, one cooldown, one roll, no repeated self effects", () => {
    const results = resolveAgainstEach(
      story,
      makePlayer(),
      [makeEnemy(), makeEnemy({ characterId: "ghoul" })],
      by("kestrel"),
      d20Sequence([15])
    );
    expect(results).toHaveLength(2);
    const [lead, other] = results.map((result) => result.ruling);
    expect(lead).toMatchObject({ targetId: "wight", costsPaid: { resources: { stamina: 3 } }, cooldownApplied: 2 });
    expect(lead!.targeting).toEqual({ scope: "all_enemies", index: 0, count: 2 });
    expect(other).toMatchObject({ targetId: "ghoul", roll: lead!.roll, targeting: { index: 1, count: 2 } });
    expect(other!.costsPaid).toBeUndefined();
    expect(other!.cooldownApplied).toBeUndefined();
    expect(other!.effectsApplied).toEqual({ resourceDeltaTarget: { hp: -4 }, narrationHint: "flames wash over them" });
    expect(other!.damageAdjustments).toHaveLength(1);
    const selfHeals = results.flatMap((result) => result.mutations).filter(
      (mutation) => mutation.kind === "resourceDelta" && mutation.characterId === "kestrel" && mutation.resourceId === "hp"
    );
    expect(selfHeals).toHaveLength(1);
  });

  it("scale every target's share by the same item and carry attribute changes", () => {
    const hex: ActionDef = {
      ...wave,
      id: "hex_bolts",
      costs: undefined,
      cooldownTurns: undefined,
      targeting: { scope: "multiple" },
      effects: {
        ...wave.effects,
        success: {
          resourceDeltaTarget: { hp: -2 },
          scaleByItemProp: "damage",
          attributeDeltaTarget: { str: -1 },
          narrationHint: "bolts strike home",
        },
      },
    };
    const schema = makeStory({ actions: [...base.actions, hex] });
    const intent = { ...by("kestrel"), actionId: "hex_bolts", itemId: "sword" };
    const [, second] = resolveAgainstEach(schema, makePlayer(), [makeEnemy(), makeEnemy({ characterId: "ghoul" })], intent, d20Sequence([15]));
    expect(second!.ruling.effectsApplied).toEqual(hex.effects.success);
    expect(second!.mutations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "resourceDelta", characterId: "ghoul", resourceId: "hp", delta: -8 }),
      { kind: "attributeDelta", characterId: "ghoul", attributeId: "str", delta: -1 },
    ]));
  });

  it("spread a buff by the same rules, with its governing attribute", () => {
    const rallyIntent = { ...by("kestrel"), actionId: "rally" };
    const results = resolveAgainstEach(story, makePlayer(), [makePlayer(), makeEnemy({ characterId: "innkeeper" })], rallyIntent, d20Sequence([15]));
    expect(results.map((result) => result.ruling.targetId)).toEqual(["kestrel", "innkeeper"]);
    expect(results[1]!.ruling.damageAdjustments).toBeUndefined();
    expect(results[1]!.mutations).toMatchObject([{ kind: "applyStatus", characterId: "innkeeper" }]);
    expect(results[0]!.ruling.roll!.attributeModifier).toBe(2);
  });

  it("refuse an attempt that reaches nobody, after the gate has had its say", () => {
    const [nobody] = resolveAgainstEach(story, makePlayer(), [], by("kestrel"), d20Sequence([15]));
    expect(nobody!.ruling.gate).toEqual({ allowed: false, reason: "No one is in reach of Flame Wave.", code: "no_target" });
    expect(nobody!.mutations).toEqual([]);
    const [dead] = resolveAgainstEach(story, makePlayer({ alive: false }), [], by("kestrel"), d20Sequence([15]));
    expect(dead!.ruling.gate.code).toBe("actor_dead");
    const [unknown] = resolveAgainstEach(story, makePlayer(), [], { ...by("kestrel"), actionId: "nope" }, d20Sequence([15]));
    expect(unknown!.ruling).toMatchObject({ actionLabel: "nope", gate: { code: "unknown_action" } });
  });

  it("stop at the lead when the gate refuses or no roll was needed", () => {
    const tired = makePlayer({ resources: { hp: { current: 20, max: 20 }, stamina: { current: 1, max: 10 } } });
    const refused = resolveAgainstEach(story, tired, [makeEnemy(), makeEnemy({ characterId: "ghoul" })], by("kestrel"), d20Sequence([15]));
    expect(refused).toHaveLength(1);
    expect(refused[0]!.ruling.targeting).toBeUndefined();
    const chat: ActionDef = {
      ...wave,
      id: "chat",
      category: "social",
      costs: undefined,
      cooldownTurns: undefined,
      targeting: { scope: "area" },
      effects: {
        crit_success: { narrationHint: "laughter" },
        success: { narrationHint: "nods" },
        failure: { narrationHint: "shrugs" },
        crit_failure: { narrationHint: "silence" },
      },
    };
    const schema = makeStory({ actions: [...base.actions, chat] });
    const quiet = resolveAgainstEach(schema, makePlayer(), [makeEnemy(), makeEnemy({ characterId: "ghoul" })], { ...by("kestrel"), actionId: "chat", stakes: "none" }, d20Sequence([15]));
    expect(quiet).toHaveLength(1);
    expect(quiet[0]!.ruling.targeting).toEqual({ scope: "area", index: 0, count: 1 });
    // Called for an unscoped action, the spread still reports a single-target scope.
    const plain = resolveAgainstEach(story, makePlayer(), [makeEnemy()], { ...by("kestrel"), actionId: "attack_wild" }, d20Sequence([15]));
    expect(plain[0]!.ruling.targeting).toEqual({ scope: "single", index: 0, count: 1 });
  });

  it("are validated, offered to the classifier, and told to the narrator", () => {
    const contest = { ...wave, id: "mass_stare", opposed: true };
    expect(validateStorySchema({ ...story, actions: [...story.actions, contest] })).toContain(
      'Action "mass_stare" is an opposed contest but reaches "all_enemies"; a contest needs one named defender.'
    );
    expect(validateStorySchema(story).filter((error) => /flame_wave|rally/.test(error))).toEqual([]);

    expect(actionRequiresCharacterTarget(wave)).toBe(false);
    expect(actionRequiresCharacterTarget({ ...wave, targeting: { scope: "multiple" } })).toBe(true);
    expect(actionRequiresCharacterTarget({ ...wave, targeting: { scope: "single" } })).toBe(true);

    const parse = (intent: Record<string, unknown>) =>
      buildClassifierSchema(story, ["kestrel", "wight", "ghoul"]).safeParse({
        playerIntents: [{ actorId: "kestrel", confidence: 1, ...intent }],
        npcIntents: [],
        freeText: "",
      });
    const many = parse({ actionId: "flame_wave", targetIds: ["wight", "ghoul"] });
    expect(many.success && many.data.playerIntents[0]!.targetIds).toEqual(["wight", "ghoul"]);
    const none = parse({ actionId: "flame_wave", targetIds: null });
    expect(none.success && none.data.playerIntents[0]!.targetIds).toBeUndefined();
    expect(parse({ actionId: "flame_wave", targetIds: ["stranger"] }).success).toBe(false);

    const multi = { ...wave, id: "twin_bolt", targeting: { scope: "multiple" as const } };
    const capped = { ...wave, id: "triple_bolt", targeting: { scope: "multiple" as const, maxTargets: 2 } };
    const user = buildClassifierUser(
      makeStory({ actions: [...story.actions, multi, capped] }),
      { playerMessage: "x", presentCharacters: [], recentNarration: [] }
    );
    expect(user).toMatch(/flame_wave .*targets:all_enemies \(engine picks them; no targetId needed\)/);
    expect(user).toMatch(/twin_bolt .*targets:up to 3 \(targetId \+ targetIds\)/);
    expect(user).toMatch(/triple_bolt .*targets:up to 2/);

    const [lead, other] = resolveAgainstEach(story, makePlayer(), [makeEnemy(), makeEnemy({ characterId: "ghoul" })], by("kestrel"), d20Sequence([15]));
    const actionsById = new Map(story.actions.map((action) => [action.id, action]));
    expect(renderRuling(other!.ruling, actionsById, (id) => id)).toContain(
      "One Flame Wave reached 2 targets with this single roll (target 2 of 2)."
    );
    expect(renderRuling({ ...lead!.ruling, targeting: { scope: "self", index: 0, count: 1 } }, actionsById, (id) => id))
      .not.toContain("reached");
  });
});

class WaveRouter implements Router {
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
    const content = "Fire rolls across the crypt.";
    onDelta(content);
    return { content };
  }
}

describe("a scoped action across a real turn", () => {
  let store: Store;
  const storyId = "fixture-story";
  const npc = (id: string, hostile: boolean): CharacterHardState =>
    makeEnemy({
      characterId: id,
      attributes: {},
      flags: hostile ? { npc_hostile_to_player: true } : {},
    });

  beforeEach(async () => {
    store = await openStore(":memory:");
    const schema = makeStory({ storyId, actions: story.actions });
    await store.stories.insert({ id: storyId, title: schema.title, createdAt: 0, schema, locked: true });
    await store.characters.insert({ id: "kestrel", storyId, name: "Kestrel", isPlayer: true, hard: makePlayer() });
    await store.characters.insert({ id: "wight", storyId, name: "Grave-wight", isPlayer: false, hard: npc("wight", true) });
    await store.characters.insert({ id: "ghoul", storyId, name: "Ghoul", isPlayer: false, hard: npc("ghoul", true) });
    await store.characters.insert({ id: "innkeeper", storyId, name: "Innkeeper", isPlayer: false, hard: npc("innkeeper", false) });
  });

  it("burns every enemy and spares the bystander, for one cost, and rewinds exactly", async () => {
    const router = new WaveRouter({ playerIntents: [by("kestrel")], npcIntents: [], freeText: "" });
    const turn = await submitTurn(router, store, storyId, "I unleash a wave of flame.", { rng: d20Sequence([15]) });
    await turn.background;

    const waves = turn.rulings.filter((ruling) => ruling.actionId === "flame_wave");
    expect(waves.map((ruling) => ruling.targetId).sort()).toEqual(["ghoul", "wight"]);
    expect(waves.every((ruling) => ruling.roll?.d20 === 15)).toBe(true);
    const hp = async (id: string) => (await store.characters.get(id))!.hard.resources.hp!.current;
    expect(await hp("wight")).toBe(8);
    expect(await hp("ghoul")).toBe(8);
    expect(await hp("innkeeper")).toBe(12);
    const kestrel = (await store.characters.get("kestrel"))!.hard;
    expect(kestrel.resources.stamina!.current).toBe(7);
    expect(kestrel.cooldowns).toEqual({ flame_wave: 2 });
    // Both struck enemies still answer the attack this turn.
    expect(turn.rulings.filter((ruling) => ruling.targetId === "kestrel" && ruling.npcReactionReason)).toHaveLength(2);

    await deleteLastTurn(store, storyId);
    expect(await hp("wight")).toBe(12);
    expect(await hp("ghoul")).toBe(12);
    expect((await store.characters.get("kestrel"))!.hard.resources.stamina!.current).toBe(10);
  });
});
