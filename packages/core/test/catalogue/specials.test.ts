/**
 * Weapon specials (plan 09 §8.2): equipment-enabled pool actions, offered to loot from a sealed list,
 * attached only to a weapon that suits them, enabled with the loot that grants them, usable only while
 * the weapon is equipped, cooled down like any action, and kept while anyone holds the weapon (D8).
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  attachWeaponSpecial,
  browsePool,
  d20Sequence,
  deleteLastTurn,
  disablePoolEntry,
  formatEquipmentEffect,
  ItemDefinitionSchema,
  loadEffectiveSchema,
  loadPoolBrowseContext,
  materializeEntry,
  mayDisablePoolEntry,
  poolCandidates,
  poolViolations,
  submitTurn,
  UNIVERSAL_ARCHETYPES,
  UNIVERSAL_POOL,
  weaponSpecialOptions,
  type ActionArchetype,
  type ChatResponse,
  type ClassifiedTurn,
  type ItemDefinition,
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

const FLAME = "uni.combat.specials.flame_strike";
const VOLLEY = "uni.combat.specials.volley";
const pool = (overrides: Partial<ResourceDef> & Pick<ResourceDef, "id">): ResourceDef => ({
  label: overrides.id,
  start: 10,
  max: 10,
  playerVisible: true,
  ...overrides,
});
const base = makeStory();
const story: StorySchema = makeStory({
  premise: "A sellsword in a fantasy realm of dragons and wizards.",
  schemaVersion: 3,
  attributes: [...base.attributes, { id: "wit", name: "Wits", abbrev: "WIT", description: "Cunning.", defaultScore: 10 }],
  resources: [
    pool({ id: "hp", label: "Health", start: 20, max: 20, lethal: true, role: "health" }),
    pool({ id: "stamina", label: "Stamina", start: 20, max: 20, role: "stamina" }),
    pool({ id: "mana", label: "Mana", role: "mana" }),
  ],
});
const ids = (chapters: number, schema = story) =>
  weaponSpecialOptions(schema, schema, chapters).map((option) => option.entryId);

describe("weapon special content", () => {
  it("materializes as equipment-enabled actions with cooldowns and no skill gate", () => {
    const flame = materializeEntry(story, FLAME);
    if (!flame.ok || flame.kind !== "action") throw new Error("Flame Strike should materialize as an action");
    expect(flame.definition).toMatchObject({
      requiresEquipmentEnabler: true,
      requiresItemKind: "melee_weapon",
      cooldownTurns: 2,
    });
    expect(flame.definition.requiresSkill).toBeUndefined();
    expect(flame.definition.effects.success.narrationHint).toBe("a blow wreathed in flame");
  });

  it("are never chosen at creation", () => {
    expect(poolCandidates(story, ["any", "fantasy"]).some((entry) => entry.id.startsWith("uni.combat.specials."))).toBe(false);
  });

  it("are held to their own balance rules", () => {
    const flame = UNIVERSAL_ARCHETYPES.archetypes.find((archetype) => archetype.id === "arch.special.elemental_strike") as ActionArchetype;
    const broken = {
      ...UNIVERSAL_ARCHETYPES,
      archetypes: UNIVERSAL_ARCHETYPES.archetypes.map((archetype) =>
        archetype.id === flame.id ? { ...flame, requiresItemKind: undefined, cooldownTurns: 0 } : archetype
      ),
    };
    const gated = {
      ...UNIVERSAL_POOL,
      entries: UNIVERSAL_POOL.entries.map((entry) =>
        entry.id === FLAME ? { ...entry, requiresSkill: "uni.combat.melee.weapon_mastery" } : entry
      ),
    };
    const messages = (archetypes = UNIVERSAL_ARCHETYPES, entries = UNIVERSAL_POOL) =>
      poolViolations(archetypes, entries).map((violation) => violation.message);
    expect(messages(broken)).toEqual(
      expect.arrayContaining([
        "A weapon special must need the kind of weapon that grants it.",
        "A weapon special must cool down between uses.",
      ])
    );
    expect(messages(UNIVERSAL_ARCHETYPES, gated)).toContain(
      "A weapon special is granted by gear, never learned, so it needs no skill."
    );
  });
});

describe("the specials loot may grant", () => {
  it("unlock by tier, fit the setting, and always include ones already enabled", () => {
    expect(ids(0)).toEqual([]);
    expect(ids(1)).toContain(FLAME);
    expect(ids(1)).not.toContain(VOLLEY);
    expect(ids(3)).toContain(VOLLEY);
    const modern = { ...story, premise: "A detective in a modern city of neon and rain." };
    expect(ids(3, modern)).not.toContain(FLAME);
    expect(ids(3, modern)).toContain(VOLLEY);
    const flame = materializeEntry(story, FLAME);
    if (!flame.ok || flame.kind !== "action") throw new Error("unreachable");
    const withFlame = { ...story, actions: [...story.actions, flame.definition] };
    expect(weaponSpecialOptions(story, withFlame, 0)).toEqual([
      expect.objectContaining({ entryId: FLAME, enabled: true, tier: "uncommon", requiresItemKind: "melee_weapon" }),
    ]);
  });

  it("attach only to a weapon that suits them, at their tier or above, with an effect slot free", () => {
    const [flame] = weaponSpecialOptions(story, story, 1).filter((option) => option.entryId === FLAME);
    const weapon = (overrides: Partial<ItemDefinition> = {}) =>
      ItemDefinitionSchema.parse({
        id: "d",
        storyId: "s",
        name: "Flamebrand",
        description: "Hot.",
        kind: "melee_weapon",
        tier: "uncommon",
        createdAt: "now",
        configVersion: 1,
        ...overrides,
      });
    const sword = weapon();
    expect(attachWeaponSpecial(sword, flame)).toBe(flame);
    expect(sword.effects).toEqual([{ type: "action_enable", actionId: FLAME }]);
    expect(formatEquipmentEffect(sword.effects[0]!)).toBe("Enables Flame Strike");
    expect(attachWeaponSpecial(weapon({ kind: "ranged_weapon" }), flame)).toBeUndefined();
    expect(attachWeaponSpecial(weapon({ tier: "common" }), flame)).toBeUndefined();
    const full = weapon({ effects: [{ type: "skill_check", skillId: "blade", amount: 1 }] });
    expect(attachWeaponSpecial(full, flame)).toBeUndefined();
    expect(full.effects).toHaveLength(1);
    expect(attachWeaponSpecial(weapon(), undefined)).toBeUndefined();
  });
});

/** Answers the loot adjudicator with `loot`, and the classifier with whatever intent is set. */
class LootRouter implements Router {
  readonly lootPrompts: string[] = [];
  constructor(
    public classified: ClassifiedTurn,
    public loot: unknown
  ) {}
  bindingFor(_role: Role): RoleBinding {
    return { provider: "openrouter", model: "test", source: "recommended", samplersDirty: false };
  }
  async complete(role: Role, prompt: RolePrompt): Promise<ChatResponse> {
    if (role === "classifier" && prompt.system.includes("NPC action planner")) return { content: JSON.stringify({ actions: [] }) };
    if (role === "classifier" && prompt.system.includes("strict consistency auditor")) {
      return { content: JSON.stringify({ obeysRulings: true, contradictions: [] }) };
    }
    if (role === "classifier" && prompt.system.includes("DM loot adjudicator")) {
      this.lootPrompts.push(prompt.user);
      return { content: JSON.stringify(this.loot) };
    }
    if (role === "classifier" && prompt.system.includes("registrar")) return { content: JSON.stringify({ transitions: [] }) };
    if (role === "classifier" && prompt.system.includes("attribute")) return { content: JSON.stringify({ decisions: [] }) };
    if (role === "classifier") return { content: JSON.stringify(this.classified) };
    if (role === "analyzer") return { content: JSON.stringify({ characterOps: [], worldOps: [] }) };
    return { content: JSON.stringify({ actions: [] }) };
  }
  async stream(_role: Role, _prompt: RolePrompt, onDelta: StreamHandler): Promise<ChatResponse> {
    const content = "Steel rings.";
    onDelta(content);
    return { content };
  }
}

const NO_LOOT = { award: false, reason: "None." };
const flamebrand = (extra: Record<string, unknown> = {}) => ({
  award: true,
  sourceType: "combat",
  sourceLabel: "The wight falls",
  recipientCharacterId: "kestrel",
  reason: "A hard-won blade.",
  proposal: {
    name: "Flamebrand",
    description: "A sword that remembers the forge.",
    kind: "weapon",
    tier: "uncommon",
    slotCompatibility: ["primary"],
    handsRequired: 1,
    unique: false,
    effects: [],
    props: {},
    tags: ["fire"],
    archetypeId: "item.melee.light_weapon",
    specialId: FLAME,
    ...extra,
  },
});

describe("weapon specials across real turns", () => {
  let store: Store;
  const storyId = "specials";
  const attack = { actorId: "kestrel", actionId: "attack_wild", targetId: "wight", stakes: "danger" as const, confidence: 1 };
  const turn = async (router: Router, text: string) => {
    const result = await submitTurn(router, store, storyId, text, { rng: d20Sequence([20, 20, 20]) });
    await result.background;
    return result;
  };
  const effective = async () => loadEffectiveSchema(store, (await store.stories.get(storyId))!);

  beforeEach(async () => {
    store = await openStore(":memory:");
    await store.stories.insert({ id: storyId, title: "Specials", createdAt: 0, schema: { ...story, storyId }, locked: true });
    await store.characters.insert({
      id: "kestrel",
      storyId,
      name: "Kestrel",
      isPlayer: true,
      hard: makePlayer({ resources: { hp: { current: 20, max: 20 }, stamina: { current: 20, max: 20 }, mana: { current: 10, max: 10 } } }),
    });
    await store.characters.insert({
      id: "wight",
      storyId,
      name: "Grave-wight",
      isPlayer: false,
      hard: makeEnemy({ attributes: {}, resources: { hp: { current: 60, max: 60 } } }),
    });
    await store.chapters.insert({ id: "c1", storyId, idx: 0, msgFrom: 0, msgTo: 0, title: "One", summary: "x" });
  });

  it("arrive with their weapon, work only while it is equipped, cool down, and leave with a rewind", async () => {
    const router = new LootRouter({ playerIntents: [attack], npcIntents: [], freeText: "" }, flamebrand());
    const won = await turn(router, "I cut the wight down.");
    expect(router.lootPrompts[0]).toMatch(/WEAPON SPECIALS:\n- uni\.combat\.specials\.flame_strike · Flame Strike · uncommon · needs a melee weapon/);
    const [blade] = await store.runtimeItems.listDefinitions(storyId);
    expect(blade).toMatchObject({ name: "Flamebrand", effects: [{ type: "action_enable", actionId: FLAME }] });
    expect(won.rulings[0]!.loot?.[0]?.effects).toEqual([{ type: "action_enable", actionId: FLAME }]);
    expect((await store.poolEnablements.list(storyId)).map((row) => [row.entryId, row.source, row.turnIndex])).toEqual([
      [FLAME, "analyzer", won.narratorIdx],
    ]);
    expect((await effective()).actions.some((action) => action.id === FLAME)).toBe(true);

    // D8: the entry stays while anyone holds the weapon that grants it.
    const kept = { allowed: false, reason: "Kestrel's Flamebrand grants this, so it stays." };
    expect(await mayDisablePoolEntry(store, storyId, FLAME)).toEqual(kept);
    const browsed = browsePool(await loadPoolBrowseContext(store, storyId), { sectionId: "specials" });
    expect(browsed.entries.find((entry) => entry.entryId === FLAME)).toMatchObject({ state: "enabled", reason: kept.reason });

    const strike = { actorId: "kestrel", actionId: FLAME, targetId: "wight", stakes: "danger" as const, confidence: 1 };
    router.loot = NO_LOOT;
    router.classified = { playerIntents: [strike], npcIntents: [], freeText: "" };
    const unarmed = await turn(router, "Flame strike!");
    expect(unarmed.rulings[0]!.gate).toMatchObject({ allowed: false, code: "item_required" });

    const [instance] = await store.runtimeItems.listInventory("kestrel");
    await store.runtimeItems.setSlot({ characterId: "kestrel", slot: "primary", itemInstanceId: instance!.id });
    const armed = await turn(router, "Flame strike!");
    expect(armed.rulings[0]).toMatchObject({ gate: { allowed: true }, cooldownApplied: 2 });
    const again = await turn(router, "Flame strike again!");
    expect(again.rulings[0]!.gate).toMatchObject({ allowed: false, code: "on_cooldown" });

    await deleteLastTurn(store, storyId);
    await deleteLastTurn(store, storyId);
    await deleteLastTurn(store, storyId);
    await deleteLastTurn(store, storyId);
    expect(await store.poolEnablements.list(storyId)).toEqual([]);
    expect(await store.runtimeItems.listDefinitions(storyId)).toEqual([]);
  });

  it("are refused on a weapon that does not suit them, and loot cannot grant actions or skills directly", async () => {
    const bow = new LootRouter(
      { playerIntents: [attack], npcIntents: [], freeText: "" },
      flamebrand({ name: "Ember Bow", archetypeId: "item.ranged.bow" })
    );
    await turn(bow, "I take the wight's bow.");
    const [definition] = await store.runtimeItems.listDefinitions(storyId);
    expect(definition).toMatchObject({ name: "Ember Bow", effects: [] });
    expect(await store.poolEnablements.list(storyId)).toEqual([]);

    const direct = new LootRouter(
      { playerIntents: [attack], npcIntents: [], freeText: "" },
      flamebrand({ name: "Cheat Blade", specialId: undefined, effects: [{ type: "skill_enable", skillId: "blade", rank: "master" }] })
    );
    await turn(direct, "I take the wight's other blade.");
    expect((await store.runtimeItems.listDefinitions(storyId)).map((item) => item.name)).toEqual(["Ember Bow"]);
  });

  it("can be disabled once nobody holds the weapon", async () => {
    await turn(new LootRouter({ playerIntents: [attack], npcIntents: [], freeText: "" }, flamebrand()), "I cut it down.");
    const [instance] = await store.runtimeItems.listInventory("kestrel");
    await store.runtimeItems.setInstanceQuantity(instance!.id, 0);
    expect(await disablePoolEntry(store, storyId, FLAME)).toEqual({ allowed: true });
  });
});
