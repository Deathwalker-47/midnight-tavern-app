/**
 * Gate suite — every branch of checkGate, in the order the plan specifies, plus the
 * pure helpers (canAfford, conditionHolds).
 */
import { describe, it, expect } from "vitest";
import { checkGate, canAfford, conditionHolds } from "../src/index.js";
import type {
  ActionDef,
  EquipmentRuntimeCatalog,
  MechanicalIntent,
} from "../src/index.js";
import { makeStory, makePlayer, learned } from "./fixtures.js";

const intent = (over: Partial<MechanicalIntent> = {}): MechanicalIntent => ({
  actorId: "kestrel",
  actionId: "attack_melee",
  confidence: 1,
  ...over,
});

describe("checkGate — ordered checks", () => {
  it("denies when the schema is not frozen", () => {
    const v = checkGate(makeStory({ locked: false }), makePlayer(), intent());
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/not frozen/i);
  });

  it("denies an unknown action", () => {
    const v = checkGate(makeStory(), makePlayer(), intent({ actionId: "teleport" }));
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/unknown action/i);
  });

  it("denies a dead actor", () => {
    const v = checkGate(makeStory(), makePlayer({ alive: false }), intent());
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/not alive/i);
  });

  it("denies when a required skill is not learned", () => {
    const v = checkGate(makeStory(), makePlayer({ skills: [] }), intent());
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/not learned/i);
  });

  it("falls back to the raw skill id when the required skill is absent from the schema", () => {
    // phantom_rite requires "phantom", which is not in the skills table.
    const v = checkGate(makeStory(), makePlayer({ skills: [] }), intent({ actionId: "phantom_rite" }));
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/phantom/);
  });

  it("denies when minRank is not met", () => {
    // master_strike needs blade at expert; player is novice.
    const v = checkGate(makeStory(), makePlayer(), intent({ actionId: "master_strike" }));
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/expert rank/i);
  });

  it("allows when minRank is met", () => {
    const p = makePlayer({ skills: [learned("blade", "master")] });
    const v = checkGate(makeStory(), p, intent({ actionId: "master_strike" }));
    expect(v.allowed).toBe(true);
  });

  it("denies when the required item kind is absent", () => {
    const v = checkGate(makeStory(), makePlayer({ inventory: [] }), intent());
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/requires a weapon/i);
  });

  it("denies when a zero-qty stack cannot satisfy an item-kind requirement", () => {
    const v = checkGate(makeStory(), makePlayer({ inventory: [{ itemId: "sword", qty: 0 }] }), intent());
    expect(v.allowed).toBe(false);
  });

  it("denies when the cost is unaffordable", () => {
    // attack_melee costs 2 stamina.
    const p = makePlayer({
      resources: { hp: { current: 20, max: 20 }, stamina: { current: 1, max: 10 } },
    });
    const v = checkGate(makeStory(), p, intent());
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/cannot afford/i);
  });

  it("denies when a skill prerequisite does not hold", () => {
    // brew_potion requires alchemy; alchemy has prereq skill lockpicking.
    const p = makePlayer({
      skills: [learned("alchemy", "novice")],
      inventory: [{ itemId: "herb", qty: 1 }],
    });
    const v = checkGate(makeStory(), p, intent({ actionId: "brew_potion" }));
    expect(v.allowed).toBe(false);
    expect(v.reason).toMatch(/prerequisite/i);
  });

  it("allows when the prerequisite skill is present", () => {
    const p = makePlayer({
      skills: [learned("alchemy", "novice"), learned("lockpicking", "novice")],
      inventory: [{ itemId: "herb", qty: 1 }],
    });
    const v = checkGate(makeStory(), p, intent({ actionId: "brew_potion" }));
    expect(v.allowed).toBe(true);
  });

  it("allows a skill-less action with no requirements", () => {
    const v = checkGate(makeStory(), makePlayer(), intent({ actionId: "search_room" }));
    expect(v.allowed).toBe(true);
  });

  it("allows a valid skill+item+cost action", () => {
    const v = checkGate(makeStory(), makePlayer(), intent());
    expect(v.allowed).toBe(true);
    expect(v.reason).toBeUndefined();
  });

  it("accepts equipment-provided skills and action enablers only while equipped", () => {
    const equipment: EquipmentRuntimeCatalog = {
      definitions: [
        {
          id: "focus-def",
          storyId: "story-fixture",
          name: "Ritual Focus",
          description: "A sealed focus.",
          kind: "tool",
          tier: "rare",
          slotCompatibility: ["utility"],
          handsRequired: 0,
          unique: true,
          effects: [
            { type: "skill_enable", skillId: "phantom", rank: "expert" },
            { type: "action_enable", actionId: "sealed_rite" },
          ],
          props: {},
          tags: [],
          createdAt: "2026-07-29T00:00:00.000Z",
          configVersion: 1,
        },
      ],
      instances: [
        {
          id: "focus-1",
          storyId: "story-fixture",
          definitionId: "focus-def",
          ownerCharacterId: "kestrel",
          quantity: 1,
          acquiredAt: "2026-07-29T00:00:00.000Z",
          provenance: {
            sourceType: "quest",
            sourceLabel: "Rite",
            rulingId: "r1",
            turnId: "t1",
            tierBudget: "rare",
            eligibilityReasons: [],
            policyVersion: 1,
            grantedAt: "2026-07-29T00:00:00.000Z",
          },
        },
      ],
    };
    const sealedRite: ActionDef = {
      id: "sealed_rite",
      category: "utility",
      label: "Sealed Rite",
      requiresSkill: "phantom",
      minRank: "adept",
      requiresEquipmentEnabler: true,
      dc: 10,
      effects: {
        crit_success: { narrationHint: "The seal answers." },
        success: { narrationHint: "The seal answers." },
        failure: { narrationHint: "The seal stays quiet." },
        crit_failure: { narrationHint: "The seal recoils." },
      },
    };
    const schema = makeStory({ actions: [...makeStory().actions, sealedRite] });
    const bare = makePlayer({ skills: [], equipment: [] });
    expect(
      checkGate(schema, bare, intent({ actionId: "sealed_rite" })).code
    ).toBe("item_required");
    expect(
      checkGate(schema, bare, intent({ actionId: "sealed_rite" }), { equipment }).code
    ).toBe("item_required");

    const equipped = makePlayer({
      skills: [],
      equipment: [
        { characterId: "kestrel", slot: "utility", itemInstanceId: "focus-1" },
      ],
    });
    expect(
      checkGate(schema, equipped, intent({ actionId: "sealed_rite" }), { equipment })
    ).toEqual({ allowed: true });
  });
});

describe("canAfford", () => {
  it("is true for no cost", () => {
    expect(canAfford(makePlayer(), undefined)).toBe(true);
  });
  it("checks resource sufficiency", () => {
    const p = makePlayer();
    expect(canAfford(p, { resources: { stamina: 10 } })).toBe(true);
    expect(canAfford(p, { resources: { stamina: 11 } })).toBe(false);
  });
  it("is false when the resource is absent", () => {
    expect(canAfford(makePlayer(), { resources: { mana: 1 } })).toBe(false);
  });
  it("checks item sufficiency", () => {
    const p = makePlayer({ inventory: [{ itemId: "gold", qty: 3 }] });
    expect(canAfford(p, { items: [{ itemId: "gold", qty: 3 }] })).toBe(true);
    expect(canAfford(p, { items: [{ itemId: "gold", qty: 4 }] })).toBe(false);
    expect(canAfford(p, { items: [{ itemId: "missing", qty: 1 }] })).toBe(false);
  });
});

describe("conditionHolds", () => {
  it("attribute uses the stored score and falls back to 10 when absent", () => {
    expect(conditionHolds(makePlayer({ attributes: { might: 14 } }), { type: "attribute", attributeId: "might", min: 14 })).toBe(true);
    expect(conditionHolds(makePlayer({ attributes: { might: 13 } }), { type: "attribute", attributeId: "might", min: 14 })).toBe(false);
    expect(conditionHolds(makePlayer({ attributes: {} }), { type: "attribute", attributeId: "might", min: 10 })).toBe(true);
  });

  it("skill without minRank", () => {
    expect(conditionHolds(makePlayer(), { type: "skill", skillId: "blade" })).toBe(true);
    expect(conditionHolds(makePlayer({ skills: [] }), { type: "skill", skillId: "blade" })).toBe(false);
  });
  it("skill with minRank", () => {
    const p = makePlayer({ skills: [learned("blade", "adept")] });
    expect(conditionHolds(p, { type: "skill", skillId: "blade", minRank: "adept" })).toBe(true);
    expect(conditionHolds(p, { type: "skill", skillId: "blade", minRank: "expert" })).toBe(false);
  });
  it("resource", () => {
    const p = makePlayer();
    expect(conditionHolds(p, { type: "resource", resourceId: "hp", min: 20 })).toBe(true);
    expect(conditionHolds(p, { type: "resource", resourceId: "hp", min: 21 })).toBe(false);
    expect(conditionHolds(p, { type: "resource", resourceId: "mana", min: 1 })).toBe(false);
  });
  it("item", () => {
    expect(conditionHolds(makePlayer(), { type: "item", itemId: "sword" })).toBe(true);
    expect(conditionHolds(makePlayer(), { type: "item", itemId: "shield" })).toBe(false);
  });
  it("flag", () => {
    const p = makePlayer({ flags: { cursed: true } });
    expect(conditionHolds(p, { type: "flag", flagId: "cursed", value: true })).toBe(true);
    expect(conditionHolds(p, { type: "flag", flagId: "cursed", value: false })).toBe(false);
    // absent flag defaults to false
    expect(conditionHolds(makePlayer(), { type: "flag", flagId: "cursed", value: false })).toBe(true);
  });
});
