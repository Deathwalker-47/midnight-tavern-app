/**
 * Finer item kinds and archetype-shaped loot (plan 09 §8.1). A broad requirement accepts every kind
 * in its family; a fine requirement accepts that kind or a generic item of its family, so items made
 * before the finer kinds keep working. Loot that names an archetype gets the archetype's mechanics.
 */
import { describe, expect, it } from "vitest";
import {
  attemptCost,
  baseItemKind,
  checkGate,
  d20Sequence,
  finalizeLootProposal,
  ItemDefinitionSchema,
  itemKindSatisfies,
  planSkillReactions,
  resolve,
  shapeByArchetype,
  UNIVERSAL_ITEMS,
  validateLootProposal,
  type ActionDef,
  type CharacterHardState,
  type EquipmentRuntimeCatalog,
  type ItemKind,
  type ItemProposal,
  type LootEligibilityContext,
  type MechanicalIntent,
  type Ruling,
  type UniversalItems,
} from "../src/index.js";
import { makeEnemy, makePlayer, makeStory } from "./fixtures.js";

function catalog(kind: ItemKind, props: Record<string, number> = {}, staminaCost?: number): EquipmentRuntimeCatalog {
  return {
    definitions: [
      ItemDefinitionSchema.parse({
        id: "held-def",
        storyId: "story-fixture",
        name: "Held thing",
        description: "Whatever is in hand.",
        kind,
        tier: "common",
        slotCompatibility: ["primary"],
        handsRequired: 1,
        props,
        ...(staminaCost === undefined ? {} : { staminaCost }),
        createdAt: "2026-10-09T00:00:00.000Z",
        configVersion: 1,
      }),
    ],
    instances: [
      {
        id: "held-1",
        storyId: "story-fixture",
        definitionId: "held-def",
        ownerCharacterId: "kestrel",
        quantity: 1,
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
      },
    ],
  };
}

const holding = (): CharacterHardState =>
  makePlayer({
    resources: { hp: { current: 20, max: 20 }, stamina: { current: 10, max: 10 } },
    equipment: [{ characterId: "kestrel", slot: "primary", itemInstanceId: "held-1" }],
  });

/** An attack that wants a particular kind of weapon, with no skill gate and no cost of its own. */
const shot = (requiresItemKind: ItemKind): ActionDef => ({
  id: "attack_shot",
  category: "combat",
  label: "Shoot",
  universalFamily: "attack_ranged",
  requiresItemKind,
  dc: 10,
  effects: {
    crit_success: { resourceDeltaTarget: { hp: -6 }, narrationHint: "a perfect shot" },
    success: { resourceDeltaTarget: { hp: -4 }, narrationHint: "a hit" },
    failure: { narrationHint: "a miss" },
    crit_failure: { narrationHint: "a fumble" },
  },
});
const intent: MechanicalIntent = { actorId: "kestrel", actionId: "attack_shot", targetId: "wight", confidence: 1 };
const storyWith = (action: ActionDef) => makeStory({ actions: [action] });

describe("item kind families", () => {
  it("name each kind's family and match requirements both ways", () => {
    expect(baseItemKind("ranged_weapon")).toBe("weapon");
    expect(baseItemKind("weapon")).toBe("weapon");
    expect(baseItemKind("potion")).toBe("consumable");
    expect(itemKindSatisfies("ranged_weapon", "ranged_weapon")).toBe(true);
    expect(itemKindSatisfies("ranged_weapon", "weapon")).toBe(true);
    expect(itemKindSatisfies("weapon", "ranged_weapon")).toBe(true);
    expect(itemKindSatisfies("melee_weapon", "ranged_weapon")).toBe(false);
    expect(itemKindSatisfies("potion", "weapon")).toBe(false);
    expect(itemKindSatisfies("armor", "ranged_weapon")).toBe(false);
  });

  it("gate an action on the kind it needs, accepting generic legacy weapons", () => {
    const gate = (held: ItemKind, needed: ItemKind) =>
      checkGate(storyWith(shot(needed)), holding(), intent, { equipment: catalog(held) });
    expect(gate("ranged_weapon", "ranged_weapon").allowed).toBe(true);
    expect(gate("weapon", "ranged_weapon").allowed).toBe(true);
    expect(gate("ranged_weapon", "weapon").allowed).toBe(true);
    expect(gate("melee_weapon", "ranged_weapon")).toMatchObject({
      allowed: false,
      code: "item_required",
      reason: "Requires an equipped ranged weapon.",
    });
  });

  it("gate legacy rulebook inventories the same way", () => {
    const story = makeStory({
      actions: [shot("ranged_weapon")],
      items: [
        { id: "bow", name: "Bow", description: "A bow.", kind: "ranged_weapon", tier: "common", props: {} },
        { id: "club", name: "Club", description: "A club.", kind: "melee_weapon", tier: "common", props: {} },
      ],
    });
    const carrying = (itemId: string) => makePlayer({ inventory: [{ itemId, qty: 1 }] });
    expect(checkGate(story, carrying("bow"), intent).allowed).toBe(true);
    expect(checkGate(story, carrying("club"), intent)).toMatchObject({ allowed: false, code: "item_required" });
  });

  it("charge the fine-kinded weapon's swing and add its damage to the hit", () => {
    const action = shot("ranged_weapon");
    expect(attemptCost(storyWith(action), holding(), action, intent, catalog("ranged_weapon", {}, 2))).toEqual({
      resources: { stamina: 2 },
    });
    const hit = (damage: number) =>
      resolve(storyWith(action), holding(), makeEnemy(), intent, d20Sequence([15]), {
        equipment: catalog("ranged_weapon", { damage }),
      }).mutations.find((mutation) => mutation.kind === "resourceDelta" && mutation.characterId === "wight");
    const delta = (damage: number) => (hit(damage) as { delta: number }).delta;
    expect(delta(0) - delta(3)).toBe(3);
  });

  it("let a reaction swing a fine-kinded weapon from a legacy inventory", () => {
    const counter: ActionDef = { ...shot("melee_weapon"), id: "counter", label: "Counter", requiresSkill: "parry" };
    const story = makeStory({
      actions: [...makeStory().actions, counter],
      skills: [
        ...makeStory().skills,
        {
          id: "parry",
          name: "Parry",
          description: "Answer a blow.",
          tier: "common",
          prerequisites: [],
          unlockPaths: [],
          masteryAdvance: { successesPerRank: 5 },
          skillType: "reaction",
          reaction: { trigger: "attacked", actionId: "counter" },
        },
      ],
      items: [{ id: "sabre", name: "Sabre", description: "A sabre.", kind: "melee_weapon", tier: "common", props: {} }],
    });
    const holder = makePlayer({
      skills: [{ skillId: "parry", rank: "novice", successCount: 0 }],
      inventory: [{ itemId: "sabre", qty: 1 }],
    });
    const enemy = makeEnemy();
    const attack: Ruling = {
      turnId: "t",
      actorId: enemy.characterId,
      actionId: "attack_wild",
      actionLabel: "Wild swing",
      targetId: holder.characterId,
      gate: { allowed: true },
    } as Ruling;
    const [planned] = planSkillReactions(story, [attack], new Map([[holder.characterId, holder], [enemy.characterId, enemy]]));
    expect(planned?.intent.itemId).toBe("sabre");
  });
});

const context: LootEligibilityContext = {
  storyId: "s",
  sourceType: "combat",
  sourceLabel: "A fight",
  maximumTier: "rare",
  milestoneAuthorized: false,
  mythicalAuthorized: false,
  existingDefinitionIds: [],
};
const proposal = (overrides: Partial<ItemProposal> = {}): ItemProposal => ({
  name: "Red Vial",
  description: "It glows.",
  kind: "weapon",
  tier: "rare",
  slotCompatibility: ["primary"],
  handsRequired: 1,
  unique: false,
  effects: [],
  props: { damage: 15 },
  staminaCost: 0,
  tags: ["found"],
  ...overrides,
});

describe("archetype-shaped loot", () => {
  it("takes every mechanic from the archetype at the item's tier, keeping only the flavour", () => {
    const shaped = shapeByArchetype(proposal({ archetypeId: "item.potion.healing" }));
    expect(shaped).toEqual({
      proposal: {
        name: "Red Vial",
        description: "It glows.",
        kind: "potion",
        tier: "rare",
        slotCompatibility: [],
        handsRequired: 0,
        unique: false,
        effects: [],
        props: {},
        restores: { health: 13 },
        archetypeId: "item.potion.healing",
        tags: ["potion", "healing", "found"],
      },
    });
    const blade = shapeByArchetype(proposal({ archetypeId: "item.melee.great_weapon", restores: { health: 9 } }));
    expect(blade).toMatchObject({
      proposal: { kind: "melee_weapon", handsRequired: 2, staminaCost: 3, props: { damage: 7 } },
    });
    expect("proposal" in blade && blade.proposal.restores).toBeUndefined();
  });

  it("leave a proposal without an archetype to the tier caps, and refuse an unknown one", () => {
    expect(shapeByArchetype(proposal())).toEqual({ proposal: proposal() });
    expect(finalizeLootProposal(proposal({ archetypeId: "item.nope.nope" }), context, { definitionId: "d", createdAt: "now" })).toEqual({
      valid: false,
      errors: ['Unknown item archetype "item.nope.nope".'],
    });
    const finalized = finalizeLootProposal(proposal({ archetypeId: "item.ranged.bow" }), context, {
      definitionId: "d",
      createdAt: "now",
    });
    expect(finalized.definition).toMatchObject({ id: "d", kind: "ranged_weapon", props: { damage: 4 }, archetypeId: "item.ranged.bow" });
  });

  it("drop restore amounts an archetype sets to nothing at a tier, and keep its stacking key", () => {
    const items: UniversalItems = {
      version: 1,
      archetypes: [
        {
          id: "item.food.snack",
          kind: "food",
          label: "Snack",
          description: "A bite.",
          slots: [],
          handsRequired: 0,
          restores: {
            stamina: { common: 2, uncommon: 3, rare: 4, legendary: 5, mythical: 6 },
            health: { common: 0, uncommon: 1, rare: 1, legendary: 2, mythical: 2 },
          },
          stackingKey: "snacks",
          tags: ["food"],
        },
      ],
    };
    const shaped = shapeByArchetype(proposal({ tier: "common", archetypeId: "item.food.snack" }), items);
    expect(shaped).toMatchObject({ proposal: { restores: { stamina: 2 }, stackingKey: "snacks" } });
    expect(UNIVERSAL_ITEMS.archetypes.length).toBeGreaterThan(0);
  });

  it("refuse restores on anything but a consumable, and hands on a shield", () => {
    expect(validateLootProposal(proposal({ restores: { health: 3 } }), context).errors).toContain(
      "Only consumables restore anything when used."
    );
    expect(validateLootProposal(proposal({ kind: "potion", handsRequired: 0, restores: { health: 3 } }), context).valid).toBe(true);
    expect(validateLootProposal(proposal({ kind: "shield", handsRequired: 1 }), context).errors).toContain(
      "Only weapons and tools may reserve hand slots."
    );
  });
});
