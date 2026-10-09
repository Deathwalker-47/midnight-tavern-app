import { beforeEach, describe, expect, it } from "vitest";
import {
  attributeIdForRole,
  baselineHit,
  d20Sequence,
  deleteLastTurn,
  disablePoolEntry,
  effectiveSchema,
  enablePoolEntry,
  inferAttributeRole,
  loadEffectiveSchema,
  materializeEntry,
  mayDisablePoolEntry,
  requirePlayableStory,
  submitTurn,
  UNIVERSAL_ARCHETYPES,
  validateStorySchema,
  UNIVERSAL_POOL,
  type ActionDef,
  type ChatResponse,
  type ClassifiedTurn,
  type PoolCatalogue,
  type ResourceDef,
  type Role,
  type RoleBinding,
  type RolePrompt,
  type Router,
  type StorySchema,
  type StreamHandler,
} from "../../src/index.js";
import { openStore, type Store } from "../../src/store/index.js";
import { makeEnemy, makePlayer, makeStory } from "../fixtures.js";

const pool = (overrides: Partial<ResourceDef> & Pick<ResourceDef, "id">): ResourceDef => ({
  label: overrides.id,
  start: 10,
  max: 10,
  playerVisible: true,
  ...overrides,
});
const base = makeStory();
/** A Full Stats v3 rulebook with themed names the pool must resolve by role. */
const story: StorySchema = makeStory({
  schemaVersion: 3,
  attributes: [
    { id: "str", name: "Strength", abbrev: "STR", description: "Raw force.", defaultScore: 10 },
    { id: "dex", name: "Dexterity", abbrev: "DEX", description: "Agility.", defaultScore: 10 },
    { id: "allure", name: "Allure", abbrev: "ALR", description: "Social pull.", defaultScore: 10 },
    { id: "grit", name: "Grit", abbrev: "GRT", description: "Toughness.", defaultScore: 10 },
  ],
  resources: [
    pool({ id: "hp", label: "Health", start: 20, max: 20, lethal: true, role: "health" }),
    pool({ id: "stamina", label: "Stamina", role: "stamina" }),
    pool({ id: "aether", label: "Aether", role: "mana" }),
  ],
  tiers: [
    { id: "rare_band", label: "Rare", minProgress: 20 },
    { id: "plain", label: "Common", minProgress: 0 },
    { id: "skilled", label: "Uncommon", minProgress: 10 },
  ],
});
const ok = (schema: StorySchema, id: string) => {
  const result = materializeEntry(schema, id);
  if (!result.ok) throw new Error(result.reason);
  return result;
};

describe("attribute roles", () => {
  it("are inferred from themed names, magic first", () => {
    const role = (name: string, abbrev = "X", id = "x") => inferAttributeRole({ id, name, abbrev });
    expect(role("Strength", "STR")).toBe("might");
    expect(role("Dexterity")).toBe("agility");
    expect(role("Grit")).toBe("endurance");
    expect(role("Wits")).toBe("intellect");
    expect(role("Perception")).toBe("insight");
    expect(role("Allure")).toBe("presence");
    expect(role("Psychic Power")).toBe("magic");
    expect(role("Shoe Size")).toBeUndefined();
    expect(role("x", "x", "keen_wits")).toBe("intellect");
    expect(attributeIdForRole(story, "presence")).toBe("allure");
    expect(attributeIdForRole(story, "magic")).toBeUndefined();
  });
});

describe("materializing pool entries", () => {
  it("scales health to the story's baseline natural attack", () => {
    expect(baselineHit(story)).toBe(4);
    const natural: ActionDef = {
      ...base.actions.find((action) => action.id === "attack_wild")!,
      id: "claw",
      universalFamily: "attack_natural",
      effects: {
        ...base.actions.find((action) => action.id === "attack_wild")!.effects,
        success: { resourceDeltaTarget: { hp: -6 }, narrationHint: "claws rake" },
      },
    };
    expect(baselineHit({ ...story, actions: [...story.actions, natural] })).toBe(6);
    expect(baselineHit({ ...story, resources: [] })).toBe(4);
  });

  it("turns an action entry into a story action: attribute, pools, statuses, aliases", () => {
    const persuade = ok(story, "uni.social.persuasion.persuade");
    expect(persuade.kind).toBe("action");
    expect(persuade.definition).toMatchObject({
      id: "uni.social.persuasion.persuade",
      label: "Persuade",
      category: "social",
      universalFamily: "influence",
      governingAttribute: "allure",
      dc: 12,
      aliases: ["persuade", "convince", "talk into"],
    });
    expect((persuade.definition as ActionDef).effects.crit_success.statusSelf).toEqual({
      id: "confident",
      label: "Confident",
      durationTurns: 1,
      checkBonus: 1,
    });
    const tend = ok(story, "uni.care.medicine.tend_wounds").definition as ActionDef;
    expect(tend).toMatchObject({ costs: { resources: { stamina: 1 } }, cooldownTurns: 2 });
    expect(tend.effects.crit_success.resourceDeltaTarget).toEqual({ hp: 4 });
    expect(tend.effects.success.resourceDeltaTarget).toEqual({ hp: 2 });
    expect(tend.effects.crit_failure.resourceDeltaTarget).toEqual({ hp: -1 });
    const rally = ok(story, "uni.social.leadership.rally_the_group");
    expect(rally.requires).toEqual(["uni.social.leadership.command"]);
    expect(rally.definition).toMatchObject({ targeting: { scope: "all_allies" }, requiresSkill: "uni.social.leadership.command" });
    const remedy = ok(story, "uni.care.medicine.treat_poison").definition as ActionDef;
    expect(remedy.effects.success.statusTarget?.resourcePerTurn).toEqual({ hp: 1 });
    const survive = ok(story, "uni.wild.survival.forage").definition as ActionDef;
    expect(survive.effects.crit_failure.resourceDeltaSelf).toEqual({ stamina: -1, hp: -1 });
    // No magic-role attribute here, so an archetype with only that role would roll flat.
    expect(ok(story, "uni.stealth.stealth.sneak").definition).toMatchObject({ governingAttribute: "dex" });
  });

  it("never rounds a real health change to nothing", () => {
    const weak = { ...story, actions: [...story.actions] };
    const natural: ActionDef = {
      ...base.actions.find((action) => action.id === "attack_wild")!,
      id: "nip",
      universalFamily: "attack_natural",
      effects: { ...base.actions.find((action) => action.id === "attack_wild")!.effects, success: { resourceDeltaTarget: { hp: -1 }, narrationHint: "a nip" } },
    };
    weak.actions.push(natural);
    const tend = ok(weak, "uni.care.medicine.tend_wounds").definition as ActionDef;
    expect(tend.effects.crit_failure.resourceDeltaTarget).toEqual({ hp: -1 });
    expect(tend.effects.success.resourceDeltaTarget).toEqual({ hp: 1 });
  });

  it("turns skill entries into story skills on the story's own tier ladder", () => {
    const hardy = ok(story, "uni.physical.athletics.hardy");
    expect(hardy.kind).toBe("skill");
    expect(hardy.definition).toMatchObject({
      id: "uni.physical.athletics.hardy",
      name: "Hardy",
      tier: "plain",
      skillType: "passive",
      passive: { attributeBonus: { grit: 1 } },
      unlockPaths: [{ method: "trainer", npcHint: "someone accomplished in Hardy", cost: {} }],
    });
    const command = ok(story, "uni.social.leadership.command").definition;
    expect(command).toMatchObject({ tier: "skilled" });
    expect("skillType" in command).toBe(false);
    expect(ok(story, "uni.knowledge.lore.deep_focus").definition).toMatchObject({
      skillType: "toggle",
      toggle: { upkeep: { stamina: 1 }, bonus: { checkBonus: { amount: 2, categories: ["exploration"] } } },
    });
    // A bonus to an attribute role the story lacks simply drops out.
    expect(ok({ ...story, attributes: story.attributes.filter((a) => a.id !== "grit") }, "uni.physical.athletics.hardy").definition)
      .toMatchObject({ passive: {} });
    const oneRung = { ...story, tiers: [{ id: "only", label: "Only", minProgress: 0 }] };
    expect(ok(oneRung, "uni.social.leadership.command").definition).toMatchObject({ tier: "only" });
  });

  it("refuses what cannot be expressed in this story, with the reason", () => {
    const reason = (schema: StorySchema, id: string, catalogue?: PoolCatalogue) => {
      const result = materializeEntry(schema, id, catalogue);
      return result.ok ? "ok" : result.reason;
    };
    expect(reason(story, "uni.nope.nope.nope")).toBe('Unknown pool entry "uni.nope.nope.nope".');
    expect(reason(story, "uni.social.pressure.compel_obedience")).toMatch(/^Compel Obedience is excluded from the pool: /);
    expect(reason({ ...story, statMode: "none" }, "uni.social.persuasion.persuade")).toBe(
      "A no-stats story has no action or skill catalogue."
    );
    expect(reason(base, "uni.care.medicine.tend_wounds")).toBe("ok");
    expect(reason({ ...base, resources: base.resources.filter((r) => r.id !== "stamina") }, "uni.care.medicine.tend_wounds"))
      .toBe("This story has no stamina pool, which Tend Wounds needs.");
    expect(reason({ ...story, tiers: [] }, "uni.physical.athletics.hardy")).toBe("This story defines no tiers to place the skill in.");
    const broken: PoolCatalogue = {
      archetypes: UNIVERSAL_ARCHETYPES,
      pool: {
        ...UNIVERSAL_POOL,
        entries: UNIVERSAL_POOL.entries.map((entry) =>
          entry.id === "uni.social.persuasion.persuade" ? { ...entry, archetypeId: "arch.skill.hardy" } : entry
        ),
      },
    };
    expect(reason(story, "uni.social.persuasion.persuade", broken)).toBe(
      'Persuade has no usable action archetype ("arch.skill.hardy").'
    );
  });

  it("fills archetype parameters into narration and status labels", () => {
    const bolt = {
      ...UNIVERSAL_ARCHETYPES.archetypes.find((archetype) => archetype.id === "arch.social.sway")!,
      id: "arch.test.bolt",
      params: [{ name: "element", description: "what the bolt is made of" }],
    };
    if (bolt.kind !== "action") throw new Error("expected an action archetype");
    bolt.effects = {
      ...bolt.effects,
      success: { narrationHint: "a {element} bolt strikes", statusSelf: { id: "charged", label: "{element} charged", durationTurns: 1, checkBonus: 1 } },
      failure: { narrationHint: "the {unknown} fizzles" },
    };
    const catalogue: PoolCatalogue = {
      archetypes: { ...UNIVERSAL_ARCHETYPES, archetypes: [...UNIVERSAL_ARCHETYPES.archetypes, bolt] },
      pool: {
        ...UNIVERSAL_POOL,
        entries: [
          ...UNIVERSAL_POOL.entries,
          { ...UNIVERSAL_POOL.entries.find((entry) => entry.id === "uni.social.persuasion.persuade")!, id: "uni.test.bolt.fire_bolt", name: "Fire Bolt", archetypeId: "arch.test.bolt", params: { element: "fire" } },
        ],
      },
    };
    const result = materializeEntry(story, "uni.test.bolt.fire_bolt", catalogue);
    if (!result.ok || result.kind !== "action") throw new Error("expected an action");
    expect(result.definition.effects.success).toMatchObject({ narrationHint: "a fire bolt strikes", statusSelf: { label: "fire charged" } });
    expect(result.definition.effects.failure.narrationHint).toBe("the {unknown} fizzles");
  });
});

describe("the effective rulebook", () => {
  it("is the frozen rulebook plus enabled entries, frozen winning any collision", () => {
    expect(effectiveSchema(story, [])).toBe(story);
    const persuade = ok(story, "uni.social.persuasion.persuade");
    const hardy = ok(story, "uni.physical.athletics.hardy");
    const stamp = { storyId: "s", source: "player" as const, enabledAt: 1 };
    const merged = effectiveSchema(story, [
      { ...stamp, entryId: persuade.entry.id, kind: "action", definition: persuade.definition as ActionDef },
      { ...stamp, entryId: hardy.entry.id, kind: "skill", definition: hardy.definition as never },
      { ...stamp, entryId: "attack_wild", kind: "action", definition: { ...(persuade.definition as ActionDef), id: "attack_wild" } },
      { ...stamp, entryId: "blade", kind: "skill", definition: { ...(hardy.definition as never as object), id: "blade" } as never },
    ]);
    expect(merged.actions.map((action) => action.id)).toEqual([...story.actions.map((action) => action.id), persuade.entry.id]);
    expect(merged.skills.map((skill) => skill.id)).toEqual([...story.skills.map((skill) => skill.id), hardy.entry.id]);
    expect(merged.actions.find((action) => action.id === "attack_wild")!.label).not.toBe("Persuade");
  });
});

class PoolRouter implements Router {
  lastClassifierUser = "";
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
    if (role === "classifier") {
      this.lastClassifierUser = prompt.user;
      return { content: JSON.stringify(this.classified) };
    }
    if (role === "analyzer") return { content: JSON.stringify({ characterOps: [], worldOps: [] }) };
    return { content: JSON.stringify({ actions: [] }) };
  }
  async stream(_role: Role, _prompt: RolePrompt, onDelta: StreamHandler): Promise<ChatResponse> {
    const content = "The words land.";
    onDelta(content);
    return { content };
  }
}

describe("enabling and disabling in a story", () => {
  let store: Store;
  const storyId = "pool-story";
  const events = async (kind: string) =>
    (await store.events.listByStory(storyId)).filter((event) => event.kind === kind);

  beforeEach(async () => {
    store = await openStore(":memory:");
    const schema = { ...story, storyId };
    await store.stories.insert({ id: storyId, title: "Pool", createdAt: 0, schema, locked: true });
    await store.characters.insert({ id: "kestrel", storyId, name: "Kestrel", isPlayer: true, hard: makePlayer() });
    await store.characters.insert({ id: "wight", storyId, name: "Grave-wight", isPlayer: false, hard: makeEnemy({ attributes: {} }) });
  });

  it("enable an entry with the skill it needs, journal both, and are idempotent", async () => {
    await store.chapters.insert({ id: "c1", storyId, idx: 0, msgFrom: 0, msgTo: 5, title: "One", summary: "x" });
    const result = await enablePoolEntry(store, storyId, "uni.social.leadership.rally_the_group", { source: "player", now: () => 50 });
    expect(result).toEqual({
      ok: true,
      enabled: ["uni.social.leadership.rally_the_group", "uni.social.leadership.command"],
    });
    const enabled = await store.poolEnablements.list(storyId);
    expect(enabled.map((record) => [record.entryId, record.kind, record.source, record.turnIndex])).toEqual([
      ["uni.social.leadership.command", "skill", "player", undefined],
      ["uni.social.leadership.rally_the_group", "action", "player", undefined],
    ]);
    expect((await events("pool_enabled")).map((event) => event.payload)).toEqual([
      { entryId: "uni.social.leadership.rally_the_group", kind: "action", name: "Rally the Group", source: "player" },
      { entryId: "uni.social.leadership.command", kind: "skill", name: "Command", source: "player" },
    ]);
    expect(await enablePoolEntry(store, storyId, "uni.social.leadership.command", { source: "player" })).toEqual({ ok: true, enabled: [] });
    expect(await enablePoolEntry(store, storyId, "attack_wild", { source: "player" })).toEqual({ ok: true, enabled: [] });
    const effective = await loadEffectiveSchema(store, (await store.stories.get(storyId))!);
    expect(effective.actions.some((action) => action.id === "uni.social.leadership.rally_the_group")).toBe(true);
  });

  it("enable nothing at all when any part cannot be materialized", async () => {
    expect(await enablePoolEntry(store, storyId, "uni.social.insight.read_minds", { source: "player" })).toMatchObject({ ok: false });
    expect(await enablePoolEntry(store, "missing-story", "uni.social.persuasion.persuade", { source: "player" })).toEqual({
      ok: false,
      reason: 'Unknown story "missing-story".',
    });
    expect(await store.poolEnablements.list(storyId)).toEqual([]);
    expect(await events("pool_enabled")).toEqual([]);
  });

  it("hold back tiers the story has not reached, except from the forge", async () => {
    const rally = "uni.social.leadership.rally_the_group";
    const refusal = {
      ok: false,
      reason: "Rally the Group is uncommon; uncommon entries unlock once the story completes its first chapter.",
    };
    expect(await enablePoolEntry(store, storyId, rally, { source: "player" })).toEqual(refusal);
    expect(await enablePoolEntry(store, storyId, rally, { source: "analyzer", turnIndex: 2 })).toEqual(refusal);
    expect(await store.poolEnablements.list(storyId)).toEqual([]);
    expect(await enablePoolEntry(store, storyId, rally, { source: "forge" })).toMatchObject({ ok: true });
  });

  it("refuse to disable what someone has learned or an enabled action still needs (D8)", async () => {
    await enablePoolEntry(store, storyId, "uni.social.leadership.rally_the_group", { source: "forge" });
    expect(await mayDisablePoolEntry(store, storyId, "uni.social.leadership.command")).toEqual({
      allowed: false,
      reason: "Rally the Group still needs it; disable that first.",
    });
    await enablePoolEntry(store, storyId, "uni.social.leadership.inspire_courage", { source: "forge" });
    expect(await mayDisablePoolEntry(store, storyId, "uni.social.leadership.command")).toEqual({
      allowed: false,
      reason: "Rally the Group, Inspire Courage still need it; disable those first.",
    });
    expect(await disablePoolEntry(store, storyId, "uni.social.leadership.rally_the_group", { now: () => 100 })).toEqual({ allowed: true });
    expect(await disablePoolEntry(store, storyId, "uni.social.leadership.inspire_courage", { now: () => 101 })).toEqual({ allowed: true });
    const learner = makePlayer({ skills: [{ skillId: "uni.social.leadership.command", rank: "novice", successCount: 0 }] });
    await store.characters.updateHard("kestrel", learner);
    await store.characters.updateHard("wight", { ...makeEnemy({ attributes: {} }), skills: learner.skills });
    expect(await disablePoolEntry(store, storyId, "uni.social.leadership.command")).toEqual({
      allowed: false,
      reason: "Kestrel, Grave-wight have learned this, so it stays.",
    });
    await store.characters.updateHard("wight", makeEnemy({ attributes: {} }));
    expect(await mayDisablePoolEntry(store, storyId, "uni.social.leadership.command")).toEqual({
      allowed: false,
      reason: "Kestrel has learned this, so it stays.",
    });
    expect(await mayDisablePoolEntry(store, storyId, "uni.social.persuasion.persuade")).toEqual({
      allowed: false,
      reason: "That entry is not enabled in this story.",
    });
    expect((await events("pool_disabled")).map((event) => event.payload)).toEqual([
      { entryId: "uni.social.leadership.rally_the_group" },
      { entryId: "uni.social.leadership.inspire_courage" },
    ]);
  });

  it("let a turn use an enabled entry, and rewind only what that turn enabled", async () => {
    await enablePoolEntry(store, storyId, "uni.social.persuasion.persuade", { source: "player" });
    const router = new PoolRouter({
      playerIntents: [
        { actorId: "kestrel", actionId: "uni.social.persuasion.persuade", targetId: "wight", stakes: "uncertain", confidence: 1 },
      ],
      npcIntents: [],
      freeText: "",
    });
    const turn = await submitTurn(router, store, storyId, "I try to persuade the wight.", { rng: d20Sequence([15]) });
    await turn.background;
    expect(router.lastClassifierUser).toMatch(/uni\.social\.persuasion\.persuade \[social\]/);
    expect(turn.rulings[0]).toMatchObject({ actionId: "uni.social.persuasion.persuade", gate: { allowed: true } });
    expect((await requirePlayableStory(store, storyId)).schema.actions.some((action) => action.id === "uni.social.persuasion.persuade"))
      .toBe(true);

    // As the analyzer will in S13: an enablement made by that turn carries its index.
    const messages = await store.messages.listByStory(storyId);
    const turnIndex = messages.at(-1)!.idx;
    await enablePoolEntry(store, storyId, "uni.social.empathy.reassure", { source: "analyzer", turnIndex });
    await deleteLastTurn(store, storyId);
    expect((await store.poolEnablements.list(storyId)).map((record) => record.entryId)).toEqual([
      "uni.social.persuasion.persuade",
    ]);
  });
});

describe("combat and magic entries (S12)", () => {
  it("pair a reaction skill with the action it fires, whichever half is enabled first", () => {
    const riposte = ok(story, "uni.combat.reflexes.riposte");
    expect(riposte.definition).toMatchObject({
      skillType: "reaction",
      reaction: { trigger: "attacked", actionId: "uni.combat.reflexes.riposte_strike" },
    });
    expect(riposte.requires).toEqual(["uni.combat.reflexes.riposte_strike"]);
    expect(ok(story, "uni.combat.reflexes.riposte_strike").requires).toEqual(["uni.combat.reflexes.riposte"]);
    const orphaned: PoolCatalogue = {
      archetypes: UNIVERSAL_ARCHETYPES,
      pool: {
        ...UNIVERSAL_POOL,
        entries: UNIVERSAL_POOL.entries.filter((entry) => entry.id !== "uni.combat.reflexes.riposte_strike"),
      },
    };
    const lonely = materializeEntry(story, "uni.combat.reflexes.riposte", orphaned);
    expect(lonely).toEqual({ ok: false, reason: "Riposte has no paired action to fire." });
  });

  it("enable a reaction pair into a rulebook the validator accepts", async () => {
    const store = await openStore(":memory:");
    await store.stories.insert({ id: "duel", title: "Duel", createdAt: 0, schema: { ...story, storyId: "duel" }, locked: true });
    expect(await enablePoolEntry(store, "duel", "uni.combat.reflexes.riposte", { source: "forge" })).toEqual({
      ok: true,
      enabled: ["uni.combat.reflexes.riposte", "uni.combat.reflexes.riposte_strike"],
    });
    const effective = await loadEffectiveSchema(store, (await store.stories.get("duel"))!);
    expect(validateStorySchema(effective).filter((error) => /riposte/i.test(error))).toEqual([]);
    await store.close();
  });

  it("fill a spell's element into its narration and fall back from magic to intellect", () => {
    const bolt = ok({ ...story, attributes: [...story.attributes, { id: "wit", name: "Wits", abbrev: "WIT", description: "x", defaultScore: 10 }] },
      "uni.magic.fire_magic.fire_bolt").definition as ActionDef;
    expect(bolt).toMatchObject({ costs: { resources: { aether: 2 } }, governingAttribute: "wit", requiresSkill: "uni.magic.fire_magic.fire_magic" });
    expect(bolt.effects.success.narrationHint).toBe("a bolt of flame strikes");
    expect(bolt.effects.success.resourceDeltaTarget).toEqual({ hp: -4 });
    const storm = ok(story, "uni.magic.storm_magic.tempest").definition as ActionDef;
    expect(storm).toMatchObject({ targeting: { scope: "area", maxTargets: 6 }, cooldownTurns: 4 });
  });
});
