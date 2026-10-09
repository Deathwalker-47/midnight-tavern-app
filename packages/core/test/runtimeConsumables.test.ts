/**
 * Runtime consumables (plan 09 §8.1, S15b). New stories forge no rulebook items, so the only things a
 * player can drink are looted runtime items. `consume_item` uses one up: the restore goes through the
 * ledger, the quantity (which lives outside hard state) is written when the turn commits, and every
 * rewind puts it back.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildClassifierSchema,
  buildClassifierUser,
  CONSUME_ITEM_ACTION_ID,
  d20Sequence,
  deleteFromExchange,
  deleteLastTurn,
  ItemDefinitionSchema,
  resolveConsumeItem,
  rewindTo,
  submitTurn,
  type ChatResponse,
  type ClassifiedTurn,
  type EquipmentRuntimeCatalog,
  type ItemDefinition,
  type ItemInstance,
  type MechanicalIntent,
  type ResourceDef,
  type Role,
  type RoleBinding,
  type RolePrompt,
  type Router,
  type StorySchema,
  type StreamHandler,
} from "../src/index.js";
import { openStore, type Store } from "../src/store/index.js";
import { makePlayer, makeStory } from "./fixtures.js";

const pool = (overrides: Partial<ResourceDef> & Pick<ResourceDef, "id">): ResourceDef => ({
  label: overrides.id,
  start: 10,
  max: 10,
  playerVisible: true,
  ...overrides,
});
const base = makeStory();
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
  items: [],
});
const hurt = () =>
  makePlayer({
    resources: { hp: { current: 5, max: 20 }, stamina: { current: 10, max: 10 }, aether: { current: 10, max: 10 } },
    inventory: [],
  });

function definition(id: string, restores?: ItemDefinition["restores"]): ItemDefinition {
  return ItemDefinitionSchema.parse({
    id,
    storyId: "fixture-story",
    name: id === "draught-def" ? "Red Draught" : "Odd Stone",
    description: "Found.",
    kind: restores ? "potion" : "misc",
    tier: "common",
    ...(restores ? { restores } : {}),
    archetypeId: restores ? "item.potion.healing" : "item.misc.curio",
    createdAt: "2026-10-09T00:00:00.000Z",
    configVersion: 1,
  });
}
function instance(id: string, definitionId: string, quantity = 1, owner = "kestrel"): ItemInstance {
  return {
    id,
    storyId: "fixture-story",
    definitionId,
    ownerCharacterId: owner,
    quantity,
    acquiredAt: "2026-10-09T00:00:00.000Z",
    provenance: {
      sourceType: "combat",
      sourceLabel: "Found",
      rulingId: "r",
      turnId: "t",
      tierBudget: "common",
      eligibilityReasons: [],
      policyVersion: 1,
      grantedAt: "2026-10-09T00:00:00.000Z",
    },
  };
}
const drink = (itemId: string): MechanicalIntent => ({
  actorId: "kestrel",
  actionId: CONSUME_ITEM_ACTION_ID,
  confidence: 1,
  itemId,
});

describe("using up a runtime item", () => {
  const catalog: EquipmentRuntimeCatalog = {
    definitions: [definition("draught-def", { health: 6 }), definition("stone-def")],
    instances: [
      instance("spent", "draught-def", 0),
      instance("draught", "draught-def", 2),
      instance("stone", "stone-def"),
      instance("theirs", "draught-def", 1, "someone-else"),
      instance("orphan", "missing-def"),
    ],
  };
  const use = (itemId: string) => resolveConsumeItem(story, hurt(), drink(itemId), undefined, catalog);

  it("restores through the ledger and reports the item instead of touching hard inventory", () => {
    const used = use("draught");
    expect(used.ruling).toMatchObject({
      actionLabel: "Use Red Draught",
      gate: { allowed: true },
      effectsApplied: { resourceDeltaSelf: { hp: 6 } },
      itemConsumed: { itemInstanceId: "draught", itemDefinitionId: "draught-def", name: "Red Draught", quantityBefore: 2 },
    });
    expect(used.ruling.costsPaid).toBeUndefined();
    expect(used.mutations).toEqual([{ kind: "resourceDelta", characterId: "kestrel", resourceId: "hp", delta: 6 }]);
  });

  it("picks an instance with some left when named by its definition", () => {
    expect(use("draught-def").ruling.itemConsumed?.itemInstanceId).toBe("draught");
  });

  it("refuses what is used up, restores nothing, belongs to someone else or has no definition", () => {
    expect(use("spent").ruling.gate).toMatchObject({ code: "item_required", reason: "No Red Draught left to use." });
    expect(use("stone").ruling.gate).toMatchObject({ code: "not_invocable", reason: "Odd Stone restores nothing when used." });
    expect(use("theirs").ruling.gate).toMatchObject({ code: "item_required", reason: 'Unknown item "theirs".' });
    expect(use("orphan").ruling.gate).toMatchObject({ code: "item_required", reason: 'Unknown item "orphan".' });
  });
});

describe("the classifier", () => {
  const input = (usableItems?: { id: string; name: string }[]) => ({
    playerMessage: "I drink the red draught.",
    presentCharacters: [{ id: "kestrel", name: "Kestrel", isPlayer: true }],
    recentNarration: [],
    ...(usableItems ? { usableItems } : {}),
  });

  it("is offered consume_item, naming the item, only when the player holds a restoring item", () => {
    expect(buildClassifierUser(story, input())).not.toMatch(/consume_item/);
    expect(buildClassifierUser(story, input([{ id: "draught", name: "Red Draught" }]))).toMatch(
      /consume_item \[utility\].*itemId: draught = Red Draught/
    );
    const intent = { actorId: "kestrel", actionId: CONSUME_ITEM_ACTION_ID, itemId: "draught", confidence: 1, stakes: "none" };
    const turn = { playerIntents: [intent], npcIntents: [], freeText: "" };
    expect(buildClassifierSchema(story, ["kestrel"]).safeParse(turn).success).toBe(false);
    expect(buildClassifierSchema(story, ["kestrel"], [{ id: "draught", name: "Red Draught" }]).safeParse(turn).success).toBe(true);
  });
});

class DrinkingRouter implements Router {
  readonly classifierPrompts: string[] = [];
  constructor(private readonly classified: ClassifiedTurn) {}
  bindingFor(_role: Role): RoleBinding {
    return { provider: "openrouter", model: "test", source: "recommended", samplersDirty: false };
  }
  async complete(role: Role, prompt: RolePrompt): Promise<ChatResponse> {
    if (role === "classifier" && prompt.system.includes("NPC action planner")) return { content: JSON.stringify({ actions: [] }) };
    if (role === "classifier" && prompt.system.includes("strict consistency auditor")) {
      return { content: JSON.stringify({ obeysRulings: true, contradictions: [] }) };
    }
    if (role === "classifier" && prompt.system.includes("DM loot adjudicator")) {
      return { content: JSON.stringify({ award: false, reason: "None." }) };
    }
    if (role === "classifier" && prompt.system.includes("registrar")) return { content: JSON.stringify({ transitions: [] }) };
    if (role === "classifier") {
      this.classifierPrompts.push(prompt.user);
      return { content: JSON.stringify(this.classified) };
    }
    if (role === "analyzer") return { content: JSON.stringify({ characterOps: [], worldOps: [] }) };
    return { content: JSON.stringify({ actions: [] }) };
  }
  async stream(_role: Role, _prompt: RolePrompt, onDelta: StreamHandler): Promise<ChatResponse> {
    const content = "You drink deep.";
    onDelta(content);
    return { content };
  }
}

describe("drinking looted potions across real turns", () => {
  let store: Store;
  const storyId = "fixture-story";
  const turn = async (router: Router, text: string) => {
    const result = await submitTurn(router, store, storyId, text, { rng: d20Sequence([15]) });
    await result.background;
    return result;
  };
  const held = async () => (await store.runtimeItems.listInventory("kestrel")).map((item) => [item.id, item.quantity]);
  const health = async () => (await store.characters.get("kestrel"))!.hard.resources["hp"]!.current;

  beforeEach(async () => {
    store = await openStore(":memory:");
    await store.stories.insert({ id: storyId, title: "Drinks", createdAt: 0, schema: { ...story, storyId }, locked: true });
    await store.characters.insert({ id: "kestrel", storyId, name: "Kestrel", isPlayer: true, hard: hurt() });
    await store.runtimeItems.insertDefinition(definition("draught-def", { health: 6 }));
    await store.runtimeItems.insertInstance(instance("draught", "draught-def", 2));
  });

  it("uses one per drink, hides the empty bottle, and every rewind puts them back", async () => {
    const router = new DrinkingRouter({ playerIntents: [drink("draught")], npcIntents: [], freeText: "" });
    await turn(router, "I drink the red draught.");
    expect(router.classifierPrompts[0]).toMatch(/itemId: draught = Red Draught/);
    expect(await held()).toEqual([["draught", 1]]);
    expect(await health()).toBe(12);

    // Two in one turn: the second sees one fewer, and the bottle is empty after.
    const twice = new DrinkingRouter({ playerIntents: [drink("draught"), drink("draught")], npcIntents: [], freeText: "" });
    const drained = await turn(twice, "I drink the last of it, twice over.");
    expect(drained.rulings.map((ruling) => ruling.gate.allowed)).toEqual([true, false]);
    expect(await held()).toEqual([]);
    expect((await store.runtimeItems.getInstance("draught"))?.quantity).toBe(0);

    await deleteLastTurn(store, storyId);
    expect(await held()).toEqual([["draught", 1]]);
    await turn(twice, "I drink twice.");
    expect(await held()).toEqual([]);

    // Rewinding to the first exchange keeps it and undoes only the later drink.
    await rewindTo(store, storyId, 1);
    expect(await held()).toEqual([["draught", 1]]);
    await turn(twice, "I drink twice.");

    // Deleting both exchanges puts back the quantity from before the earlier one.
    await deleteFromExchange(store, storyId, 0);
    expect(await held()).toEqual([["draught", 2]]);
    expect(await health()).toBe(5);
  });
});
