import { describe, expect, it } from "vitest";
import {
  EQUIPMENT_SLOTS,
  equipItem,
  equipmentAttributeBonus,
  equipmentCheckBonus,
  equipmentEnabledSkillRank,
  equipmentEnablesAction,
  equipmentResourceCapacityBonus,
  equippedEffects,
  equippedItemDefinition,
  equippedItemKind,
  finalizeLootProposal,
  validateLoadout,
  validateLootProposal,
  type EquipmentAssignment,
  type EquipmentSlot,
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

  it("reports invalid slots, ownership, quantities, definitions, and slot conflicts", () => {
    const oneHanded = definition({
      id: "blade-def",
      name: "Warden Blade",
      handsRequired: 1,
      slotCompatibility: ["primary", "secondary"],
    });
    const owned = instance({ id: "blade-1", definitionId: "blade-def" });
    const wrongOwner = instance({
      id: "blade-foe",
      definitionId: "blade-def",
      ownerCharacterId: "foe",
    });
    const empty = instance({ id: "blade-empty", definitionId: "blade-def", quantity: 0 });
    const missingDefinition = instance({ id: "missing-def-1", definitionId: "missing-def" });
    const runtime = catalog(
      [oneHanded],
      [owned, wrongOwner, empty, missingDefinition]
    );

    const invalid = validateLoadout(
      "kestrel",
      [
        { characterId: "other", slot: "primary", itemInstanceId: "blade-1" },
        {
          characterId: "kestrel",
          slot: "unknown" as EquipmentSlot,
          itemInstanceId: "blade-1",
        },
        { characterId: "kestrel", slot: "primary", itemInstanceId: "missing" },
        { characterId: "kestrel", slot: "secondary", itemInstanceId: "blade-foe" },
        { characterId: "kestrel", slot: "head", itemInstanceId: "blade-empty" },
        { characterId: "kestrel", slot: "body", itemInstanceId: "missing-def-1" },
      ],
      runtime
    );

    expect(invalid.assignments).toHaveLength(5);
    expect(invalid.errors.join(" ")).toContain("Unknown equipment slot");
    expect(invalid.errors.join(" ")).toContain("missing is not owned");
    expect(invalid.errors.join(" ")).toContain("blade-foe is not owned");
    expect(invalid.errors.join(" ")).toContain("blade-empty is not owned");
    expect(invalid.errors.join(" ")).toContain("Missing definition missing-def");
    expect(
      validateLoadout(
        "kestrel",
        [{ characterId: "kestrel", slot: "head", itemInstanceId: "blade-1" }],
        runtime
      ).errors.join(" ")
    ).toContain("cannot occupy head");

    const conflicts = validateLoadout(
      "kestrel",
      [
        { characterId: "kestrel", slot: "primary", itemInstanceId: "blade-1" },
        { characterId: "kestrel", slot: "primary", itemInstanceId: "blade-1" },
        { characterId: "kestrel", slot: "secondary", itemInstanceId: "blade-1" },
      ],
      runtime
    );
    expect(conflicts.errors.join(" ")).toContain("occupied more than once");
    expect(conflicts.errors.join(" ")).toContain("assigned to too many slots");

    const tooMany = Array.from({ length: 8 }, (_value, index) => ({
      characterId: "kestrel",
      slot: EQUIPMENT_SLOTS[index % EQUIPMENT_SLOTS.length]!,
      itemInstanceId: "missing",
    }));
    expect(validateLoadout("kestrel", tooMany, runtime).errors.join(" ")).toContain(
      "at most 7 slots"
    );
  });

  it("enforces stacking groups and both exact hand slots", () => {
    const charmA = definition({
      id: "charm-a-def",
      name: "Charm A",
      kind: "accessory",
      handsRequired: 0,
      slotCompatibility: ["accessory_1"],
      stackingKey: "ward",
    });
    const charmB = definition({
      id: "charm-b-def",
      name: "Charm B",
      kind: "accessory",
      handsRequired: 0,
      slotCompatibility: ["accessory_2"],
      stackingKey: "ward",
    });
    const greatsword = definition({
      slotCompatibility: ["primary", "secondary", "head"],
    });
    const runtime = catalog(
      [charmA, charmB, greatsword],
      [
        instance({ id: "charm-a", definitionId: "charm-a-def" }),
        instance({ id: "charm-b", definitionId: "charm-b-def" }),
        instance(),
      ]
    );
    expect(
      validateLoadout(
        "kestrel",
        [
          { characterId: "kestrel", slot: "accessory_1", itemInstanceId: "charm-a" },
          { characterId: "kestrel", slot: "accessory_2", itemInstanceId: "charm-b" },
        ],
        runtime
      ).errors.join(" ")
    ).toContain("Stacking group ward");

    expect(
      validateLoadout(
        "kestrel",
        [
          { characterId: "kestrel", slot: "secondary", itemInstanceId: "greatsword-1" },
          { characterId: "kestrel", slot: "head", itemInstanceId: "greatsword-1" },
        ],
        runtime
      ).errors.join(" ")
    ).toContain("must occupy Primary and Secondary");
    expect(
      validateLoadout(
        "kestrel",
        [
          { characterId: "kestrel", slot: "primary", itemInstanceId: "greatsword-1" },
          { characterId: "kestrel", slot: "head", itemInstanceId: "greatsword-1" },
        ],
        runtime
      ).errors.join(" ")
    ).toContain("must occupy Primary and Secondary");
  });

  it("rejects invalid equip requests and replaces occupied slots atomically", () => {
    const oneHanded = definition({
      id: "blade-def",
      name: "Warden Blade",
      handsRequired: 1,
      slotCompatibility: ["primary"],
    });
    const owned = instance({ id: "blade-1", definitionId: "blade-def" });
    const wrongOwner = instance({
      id: "foe-blade",
      definitionId: "blade-def",
      ownerCharacterId: "foe",
    });
    const missingDefinition = instance({ id: "orphan", definitionId: "orphan-def" });
    const utility = definition({
      id: "utility-def",
      name: "Utility Charm",
      kind: "tool",
      handsRequired: 0,
      slotCompatibility: ["utility"],
    });
    const utilityInstance = instance({ id: "utility-1", definitionId: "utility-def" });
    const runtime = catalog(
      [oneHanded, utility],
      [owned, wrongOwner, missingDefinition, utilityInstance]
    );

    expect(equipItem("kestrel", [], "missing", "primary", runtime).valid).toBe(false);
    expect(equipItem("kestrel", [], "orphan", "primary", runtime).valid).toBe(false);
    expect(equipItem("kestrel", [], "foe-blade", "primary", runtime).valid).toBe(false);
    expect(equipItem("kestrel", [], "blade-1", "secondary", runtime).errors.join(" ")).toContain(
      "not compatible"
    );

    const equipped = equipItem(
      "kestrel",
      [
        { characterId: "kestrel", slot: "primary", itemInstanceId: "old-blade" },
        { characterId: "kestrel", slot: "utility", itemInstanceId: "utility-1" },
        { characterId: "other", slot: "primary", itemInstanceId: "other-blade" },
      ],
      "blade-1",
      "primary",
      runtime
    );
    expect(equipped.valid).toBe(true);
    expect(equipped.assignments).toEqual([
      { characterId: "kestrel", slot: "utility", itemInstanceId: "utility-1" },
      { characterId: "kestrel", slot: "primary", itemInstanceId: "blade-1" },
    ]);
  });

  it("derives every equipped capability once and ignores invalid or unmet effects", () => {
    const capabilities = definition({
      id: "capabilities-def",
      name: "Sevenfold Charm",
      kind: "accessory",
      handsRequired: 0,
      slotCompatibility: ["accessory_1"],
      effects: [
        {
          type: "attribute_score",
          attributeId: "might",
          amount: 2,
          condition: { type: "flag", flagId: "blessed", value: true },
        },
        {
          type: "attribute_score",
          attributeId: "agility",
          amount: 9,
          condition: { type: "flag", flagId: "missing", value: true },
        },
        { type: "skill_check", skillId: "blade", amount: 1 },
        { type: "action_check", actionId: "attack_melee", amount: 2 },
        { type: "resource_capacity", resourceId: "hp", amount: 5 },
        { type: "action_enable", actionId: "ward_break" },
        { type: "skill_enable", skillId: "runes", rank: "novice" },
        {
          type: "lifestyle",
          capabilityId: "warmth",
          description: "Keeps its bearer warm.",
        },
      ],
    });
    const mastery = definition({
      id: "mastery-def",
      name: "Runesage Loop",
      kind: "accessory",
      handsRequired: 0,
      slotCompatibility: ["accessory_2"],
      effects: [{ type: "skill_enable", skillId: "runes", rank: "expert" }],
    });
    const runtime = catalog(
      [capabilities, mastery],
      [
        instance({ id: "capabilities-1", definitionId: "capabilities-def" }),
        instance({ id: "mastery-1", definitionId: "mastery-def" }),
        instance({ id: "wrong-owner", definitionId: "capabilities-def", ownerCharacterId: "foe" }),
        instance({ id: "missing-definition", definitionId: "missing" }),
      ]
    );
    const actor = makePlayer({
      flags: { blessed: true },
      equipment: [
        { characterId: "kestrel", slot: "accessory_1", itemInstanceId: "capabilities-1" },
        { characterId: "kestrel", slot: "accessory_1", itemInstanceId: "capabilities-1" },
        { characterId: "kestrel", slot: "accessory_2", itemInstanceId: "mastery-1" },
        { characterId: "kestrel", slot: "head", itemInstanceId: "wrong-owner" },
        { characterId: "kestrel", slot: "body", itemInstanceId: "missing-definition" },
        { characterId: "kestrel", slot: "utility", itemInstanceId: "absent" },
      ],
    });

    expect(equippedEffects(actor, runtime)).toHaveLength(8);
    expect(equipmentAttributeBonus(actor, "might", runtime)).toBe(2);
    expect(equipmentAttributeBonus(actor, "agility", runtime)).toBe(0);
    expect(equipmentCheckBonus(actor, "attack_melee", "blade", runtime)).toBe(3);
    expect(equipmentCheckBonus(actor, "other", undefined, runtime)).toBe(0);
    expect(equipmentEnabledSkillRank(actor, "runes", runtime)).toBe("expert");
    expect(equipmentEnabledSkillRank(actor, "unknown", runtime)).toBeUndefined();
    expect(equipmentEnablesAction(actor, "ward_break", runtime)).toBe(true);
    expect(equipmentEnablesAction(actor, "other", runtime)).toBe(false);
    expect(equipmentResourceCapacityBonus(actor, "hp", runtime)).toBe(5);
    expect(equipmentResourceCapacityBonus(actor, "stamina", runtime)).toBe(0);
    expect(equippedItemKind(actor, "accessory", runtime)).toBe(true);
    expect(equippedItemKind(actor, "weapon", runtime)).toBe(false);
    expect(equippedItemDefinition(actor, runtime, "accessory")?.id).toBe("capabilities-def");
    expect(equippedItemDefinition(actor, runtime, undefined, "capabilities-1")?.id).toBe(
      "capabilities-def"
    );
    expect(equippedItemDefinition(actor, runtime, undefined, "mastery-def")?.id).toBe(
      "mastery-def"
    );
    expect(equippedItemDefinition(actor, runtime, "weapon")).toBeUndefined();
    expect(equippedItemDefinition(actor, runtime, undefined, "unknown")).toBeUndefined();

    const noLoadout = makePlayer({ equipment: undefined });
    expect(equippedEffects(noLoadout, runtime)).toEqual([]);
    expect(equippedItemKind(noLoadout, "accessory", runtime)).toBe(false);
    expect(equippedItemDefinition(noLoadout, runtime)).toBeUndefined();
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

  it("reports every frozen loot-policy violation and refuses materialization", () => {
    const invalid: ItemProposal = {
      ...proposal,
      kind: "accessory",
      tier: "legendary",
      handsRequired: 1,
      slotCompatibility: ["primary"],
      effects: [
        { type: "skill_check", skillId: "persuasion", amount: 4 },
        { type: "action_check", actionId: "persuade", amount: -4 },
        { type: "attribute_score", attributeId: "might", amount: 3 },
        { type: "action_enable", actionId: "persuade" },
      ],
    };
    const invalidContext: LootEligibilityContext = {
      ...context,
      sourceType: "combat",
      maximumTier: "uncommon",
    };
    const result = validateLootProposal(invalid, invalidContext);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("frozen encounter budget");
    expect(result.errors.join(" ")).toContain("source ceiling");
    expect(result.errors.join(" ")).toContain("story milestone");
    expect(result.errors.join(" ")).toContain("at most 3");
    expect(result.errors.join(" ")).toContain("check bonuses");
    expect(result.errors.join(" ")).toContain("attribute bonuses");
    expect(result.errors.join(" ")).toContain("Only weapons and tools");
    expect(
      finalizeLootProposal(invalid, invalidContext, {
        definitionId: "forbidden",
        createdAt: "2026-07-23T00:00:00.000Z",
      })
    ).toEqual(result);
  });

  it("requires both hand compatibilities for two-handed proposals", () => {
    expect(
      validateLootProposal(
        {
          ...proposal,
          kind: "weapon",
          handsRequired: 2,
          slotCompatibility: ["primary"],
        },
        context
      ).errors.join(" ")
    ).toContain("Primary and Secondary");
    expect(
      validateLootProposal(
        {
          ...proposal,
          kind: "tool",
          handsRequired: 2,
          slotCompatibility: ["secondary"],
        },
        context
      ).errors.join(" ")
    ).toContain("Primary and Secondary");
  });
});
