import { describe, expect, it } from "vitest";
import {
  attemptCost,
  checkGate,
  commit,
  d20Sequence,
  ItemDefinitionSchema,
  ItemProposalSchema,
  MAX_WEAPON_STAMINA_COST,
  resolve,
  type CharacterHardState,
  type EquipmentRuntimeCatalog,
  type ItemDefinition,
  type MechanicalIntent,
} from "../src/index.js";
import { makeEnemy, makePlayer, makeStory } from "./fixtures.js";

function weapon(staminaCost?: number): ItemDefinition {
  return ItemDefinitionSchema.parse({
    id: "greatsword-def",
    storyId: "story-fixture",
    name: "Greatsword",
    description: "Heavy, slow, devastating.",
    kind: "weapon",
    tier: "common",
    slotCompatibility: ["primary"],
    handsRequired: 1,
    props: { damage: 2 },
    ...(staminaCost === undefined ? {} : { staminaCost }),
    createdAt: "2026-10-09T00:00:00.000Z",
    configVersion: 1,
  });
}

function catalog(staminaCost?: number): EquipmentRuntimeCatalog {
  return {
    definitions: [weapon(staminaCost)],
    instances: [
      {
        id: "greatsword-1",
        storyId: "story-fixture",
        definitionId: "greatsword-def",
        ownerCharacterId: "kestrel",
        quantity: 1,
        acquiredAt: "2026-10-09T00:00:00.000Z",
        provenance: {
          sourceType: "combat",
          sourceLabel: "Armoury",
          rulingId: "r",
          turnId: "t",
          tierBudget: "common",
          eligibilityReasons: [],
          policyVersion: 1,
          grantedAt: "2026-10-09T00:00:00.000Z",
        },
      },
    ],
  };
}

function armed(stamina: number): CharacterHardState {
  return makePlayer({
    resources: { hp: { current: 20, max: 20 }, stamina: { current: stamina, max: 10 } },
    equipment: [{ characterId: "kestrel", slot: "primary", itemInstanceId: "greatsword-1" }],
  });
}

// attack_melee (fixture) needs the blade skill, an equipped weapon, and 2 stamina per attempt.
const strike: MechanicalIntent = {
  actorId: "kestrel",
  actionId: "attack_melee",
  targetId: "wight",
  confidence: 1,
};
const story = makeStory();
const attack = story.actions.find((action) => action.id === "attack_melee")!;

describe("weapon stamina cost (plan 08 §3, finding 21)", () => {
  it("adds the equipped weapon's stamina cost to the action's attempt cost", () => {
    expect(attemptCost(story, armed(10), attack, strike, catalog(3))).toEqual({
      resources: { stamina: 5 },
    });
  });

  it("refuses before the roll with a distinct code when the swing is unaffordable", () => {
    // 4 stamina covers the action's own 2 but not the extra 3 the greatsword demands.
    const verdict = checkGate(story, armed(4), strike, { equipment: catalog(3) });
    expect(verdict).toMatchObject({ allowed: false, code: "insufficient_resource" });
    expect(verdict.reason).toMatch(/Greatsword/);
    expect(verdict.reason).toMatch(/Stamina/);
    expect(verdict.reason).toMatch(/5/);
  });

  it("names an empty pool when the actor carries no stamina at all", () => {
    const freeSwing = { ...attack, costs: undefined };
    const bare = makeStory({ actions: [freeSwing] });
    const actor = { ...armed(0), resources: { hp: { current: 20, max: 20 } } };
    const verdict = checkGate(bare, actor, strike, { equipment: catalog(3) });
    expect(verdict.code).toBe("insufficient_resource");
    expect(verdict.reason).toMatch(/needs 3, has 0/);
  });

  it("keeps the existing code when the action's own cost is unaffordable", () => {
    expect(checkGate(story, armed(1), strike, { equipment: catalog(3) }).code).toBe(
      "cannot_afford"
    );
  });

  it("pays action and weapon cost together on the attempt, win or lose, and records it", () => {
    const actor = armed(10);
    const result = resolve(story, actor, makeEnemy(), strike, d20Sequence([2]), {
      equipment: catalog(3),
    });
    expect(result.ruling.roll?.outcome).toBe("failure");
    expect(result.ruling.costsPaid).toEqual({ resources: { stamina: 5 } });
    commit(story, result.mutations, new Map([["kestrel", actor]]));
    expect(actor.resources.stamina!.current).toBe(5);
  });

  it("agrees with the gate: an affordable swing resolves and an unaffordable one never rolls", () => {
    const denied = resolve(story, armed(4), makeEnemy(), strike, d20Sequence([15]), {
      equipment: catalog(3),
    });
    expect(denied.ruling.roll).toBeUndefined();
    expect(denied.ruling.gate.code).toBe("insufficient_resource");
    expect(denied.mutations).toEqual([]);
  });

  it("charges nothing extra when the weapon carries no stamina cost", () => {
    expect(attemptCost(story, armed(10), attack, strike, catalog())).toEqual(attack.costs);
  });

  it("charges nothing extra when the rulebook has no stamina pool", () => {
    const noStamina = makeStory({
      resources: [{ id: "hp", label: "Health", start: 20, max: 20, playerVisible: true, lethal: true }],
      actions: [{ ...attack, costs: undefined }],
    });
    expect(attemptCost(noStamina, armed(10), { ...attack, costs: undefined }, strike, catalog(3)))
      .toBeUndefined();
  });

  it("clamps an absurd generated stamina cost", () => {
    expect(
      attemptCost(story, armed(10), attack, strike, catalog(50_000))?.resources?.stamina
    ).toBe(2 + MAX_WEAPON_STAMINA_COST);
  });

  it("charges a legacy catalogue weapon used without runtime equipment", () => {
    const legacy = makeStory({
      items: [
        { id: "maul", name: "Maul", description: "Heavy.", kind: "weapon", tier: "common", props: {}, staminaCost: 4 },
      ],
    });
    const intent = { ...strike, itemId: "maul" };
    const action = legacy.actions.find((entry) => entry.id === "attack_melee")!;
    expect(attemptCost(legacy, makePlayer(), action, intent)).toEqual({
      resources: { stamina: 6 },
    });
  });

  it("only applies to actions that need a weapon", () => {
    const wild = story.actions.find((action) => action.id === "attack_wild")!;
    expect(attemptCost(story, armed(10), wild, { ...strike, actionId: "attack_wild" }, catalog(3)))
      .toBeUndefined();
  });

  it("defaults a v3 weapon without a declared cost to 1, or 2 when two-handed", () => {
    const v3 = makeStory({
      schemaVersion: 3,
      attributes: [
        ...makeStory().attributes,
        { id: "wit", name: "Wits", abbrev: "WIT", description: "Cunning.", defaultScore: 10 },
      ],
      resources: [
        { id: "hp", label: "Health", start: 20, max: 20, playerVisible: true, lethal: true, role: "health" },
        { id: "mana", label: "Mana", start: 5, max: 5, playerVisible: true, role: "mana" },
        { id: "stamina", label: "Stamina", start: 10, max: 10, playerVisible: true, role: "stamina" },
      ],
    });
    const v3Attack = v3.actions.find((action) => action.id === "attack_melee")!;
    expect(attemptCost(v3, armed(10), v3Attack, strike, catalog())?.resources?.stamina).toBe(3);
    const twoHanded = catalog();
    twoHanded.definitions = [{ ...weapon(), handsRequired: 2, slotCompatibility: ["primary", "secondary"] }];
    expect(attemptCost(v3, armed(10), v3Attack, strike, twoHanded)?.resources?.stamina).toBe(4);
    expect(attemptCost(v3, armed(10), v3Attack, strike, catalog(0))?.resources?.stamina).toBe(2);
  });

  it("lets a loot proposal carry a typed stamina cost", () => {
    const proposal = ItemProposalSchema.parse({
      name: "Warhammer",
      description: "Crushing.",
      kind: "weapon",
      tier: "common",
      staminaCost: 2,
    });
    expect(proposal.staminaCost).toBe(2);
    expect(ItemProposalSchema.safeParse({ ...proposal, staminaCost: -1 }).success).toBe(false);
  });
});
