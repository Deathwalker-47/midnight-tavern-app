import { describe, expect, it } from "vitest";
import {
  EQUIPMENT_SLOTS,
  equipItem,
  equippedEffects,
  finalizeLootProposal,
  validateLoadout,
  validateLootProposal,
  type EquipmentAssignment,
  type EquipmentRuntimeCatalog,
  type ItemDefinition,
  type ItemInstance,
  type ItemProposal,
  type LootEligibilityContext,
} from "../src/index.js";
import { makePlayer } from "./fixtures.js";

const provenance = {
  sourceType: "combat" as const,
  sourceLabel: "Fallen captain",
  rulingId: "ruling-1",
  turnId: "turn-1",
  tierBudget: "rare" as const,
  eligibilityReasons: ["Encounter cleared"],
  policyVersion: 1,
  grantedAt: "2026-07-23T00:00:00.000Z",
};

function definition(overrides: Partial<ItemDefinition> = {}): ItemDefinition {
  return {
    id: "greatsword-def",
    storyId: "story",
    name: "Warden Greatsword",
    description: "A balanced two-handed blade.",
    kind: "weapon",
    tier: "rare",
    slotCompatibility: ["primary", "secondary"],
    handsRequired: 2,
    unique: true,
    effects: [{ type: "skill_check", skillId: "blade", amount: 2 }],
    props: { damage: 8 },
    tags: [],
    createdAt: "2026-07-23T00:00:00.000Z",
    configVersion: 1,
    ...overrides,
  };
}

function instance(overrides: Partial<ItemInstance> = {}): ItemInstance {
  return {
    id: "greatsword-1",
    storyId: "story",
    definitionId: "greatsword-def",
    ownerCharacterId: "kestrel",
    quantity: 1,
    acquiredAt: "2026-07-23T00:00:00.000Z",
    provenance,
    ...overrides,
  };
}

function catalog(
  definitions: ItemDefinition[] = [definition()],
  instances: ItemInstance[] = [instance()]
): EquipmentRuntimeCatalog {
  return { definitions, instances };
}

describe("V7 equipment loadout", () => {
  it("has exactly the approved seven universal slots", () => {
    expect(EQUIPMENT_SLOTS).toEqual([
      "primary",
      "secondary",
      "head",
      "body",
      "utility",
      "accessory_1",
      "accessory_2",
    ]);
  });

  it("requires a two-handed item to occupy both hand slots", () => {
    const oneSlot: EquipmentAssignment[] = [
      { characterId: "kestrel", slot: "primary", itemInstanceId: "greatsword-1" },
    ];
    expect(validateLoadout("kestrel", oneSlot, catalog()).valid).toBe(false);
    const equipped = equipItem("kestrel", [], "greatsword-1", "primary", catalog());
    expect(equipped.valid).toBe(true);
    expect(equipped.assignments.map((assignment) => assignment.slot).sort()).toEqual([
      "primary",
      "secondary",
    ]);
  });

  it("applies a two-handed instance's effects once", () => {
    const player = makePlayer({
      equipment: [
        { characterId: "kestrel", slot: "primary", itemInstanceId: "greatsword-1" },
        { characterId: "kestrel", slot: "secondary", itemInstanceId: "greatsword-1" },
      ],
    });
    expect(equippedEffects(player, catalog())).toHaveLength(1);
  });

  it("rejects duplicate instances of the same equipment definition", () => {
    const accessory = definition({
      id: "signet-def",
      name: "Warden Signet",
      kind: "accessory",
      handsRequired: 0,
      slotCompatibility: ["accessory_1", "accessory_2"],
    });
    const first = instance({ id: "signet-1", definitionId: "signet-def" });
    const duplicate = instance({ id: "signet-2", definitionId: "signet-def" });
    const assignments: EquipmentAssignment[] = [
      { characterId: "kestrel", slot: "accessory_1", itemInstanceId: "signet-1" },
      { characterId: "kestrel", slot: "accessory_2", itemInstanceId: "signet-2" },
    ];
    expect(
      validateLoadout("kestrel", assignments, catalog([accessory], [first, duplicate])).valid
    ).toBe(false);
  });
});

describe("V7 loot validation", () => {
  const proposal: ItemProposal = {
    name: "Warden's Signet",
    description: "Opens Warden-sealed doors.",
    kind: "accessory",
    tier: "rare",
    slotCompatibility: ["accessory_1", "accessory_2"],
    handsRequired: 0,
    unique: true,
    effects: [{ type: "skill_check", skillId: "persuasion", amount: 1 }],
    props: {},
    tags: ["warden"],
  };
  const context: LootEligibilityContext = {
    storyId: "story",
    sourceType: "non_combat",
    sourceLabel: "Captain's strongbox",
    maximumTier: "rare",
    milestoneAuthorized: false,
    mythicalAuthorized: false,
    existingDefinitionIds: [],
  };

  it("accepts and materializes content within the frozen encounter budget", () => {
    expect(validateLootProposal(proposal, context)).toEqual({ valid: true, errors: [] });
    const finalized = finalizeLootProposal(proposal, context, {
      definitionId: "signet-def",
      createdAt: "2026-07-23T00:00:00.000Z",
    });
    expect(finalized.definition).toMatchObject({
      id: "signet-def",
      storyId: "story",
      tier: "rare",
      configVersion: 1,
    });
  });

  it("rejects undeserved attribute bonuses and mythical loot", () => {
    expect(
      validateLootProposal(
        {
          ...proposal,
          tier: "uncommon",
          effects: [{ type: "attribute_score", attributeId: "might", amount: 1 }],
        },
        { ...context, maximumTier: "uncommon" }
      ).valid
    ).toBe(false);
    expect(
      validateLootProposal(
        { ...proposal, tier: "mythical", effects: [] },
        { ...context, maximumTier: "mythical" }
      ).errors.join(" ")
    ).toContain("explicit");
  });

  it("allows Mythical only with explicit frozen-story and milestone authorization", () => {
    expect(
      validateLootProposal(
        { ...proposal, tier: "mythical", effects: [] },
        {
          ...context,
          sourceType: "quest",
          maximumTier: "mythical",
          milestoneAuthorized: true,
          mythicalAuthorized: true,
        }
      )
    ).toEqual({ valid: true, errors: [] });
  });
});
