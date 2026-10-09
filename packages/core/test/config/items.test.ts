/**
 * Universal item archetypes (plan 09 §8.1) — the balance rules every archetype obeys, and proof that
 * every archetype at every tier shapes into an item the loot policy accepts.
 */
import { describe, expect, it } from "vitest";
import {
  baseItemKind,
  ECONOMY_CONFIG,
  FINE_ITEM_KIND_BASE,
  ItemTierSchema,
  MAX_ITEM_DAMAGE_BONUS,
  shapeByArchetype,
  UNIVERSAL_ITEMS,
  validateLootProposal,
  type TierLadder,
} from "../../src/index.js";

const archetypes = UNIVERSAL_ITEMS.archetypes;
const tiers = ItemTierSchema.options;
const ladders = (archetype: (typeof archetypes)[number]): [string, TierLadder][] => [
  ...Object.entries(archetype.props ?? {}).map(([name, ladder]) => [`props.${name}`, ladder] as [string, TierLadder]),
  ...Object.entries(archetype.restores ?? {}).map(([role, ladder]) => [`restores.${role}`, ladder] as [string, TierLadder]),
];

describe("universal item archetypes", () => {
  it("have unique ids and cover every finer item kind", () => {
    expect(new Set(archetypes.map((archetype) => archetype.id)).size).toBe(archetypes.length);
    const kinds = new Set(archetypes.map((archetype) => archetype.kind));
    for (const kind of Object.keys(FINE_ITEM_KIND_BASE)) expect(kinds, kind).toContain(kind);
  });

  it("never weaken as the tier rises", () => {
    for (const archetype of archetypes) {
      for (const [name, ladder] of ladders(archetype)) {
        const values = tiers.map((tier) => ladder[tier]);
        expect(values, `${archetype.id} ${name}`).toEqual([...values].sort((left, right) => left - right));
      }
    }
  });

  it("reserve hands only for weapons and tools, and both hand slots for two-handed ones", () => {
    for (const archetype of archetypes) {
      if (archetype.handsRequired > 0) expect(["weapon", "tool"], archetype.id).toContain(baseItemKind(archetype.kind));
      if (archetype.handsRequired === 2) expect(archetype.slots, archetype.id).toEqual(expect.arrayContaining(["primary", "secondary"]));
    }
  });

  it("give every weapon a swing cost and bounded damage, and nothing else either", () => {
    for (const archetype of archetypes) {
      const weapon = baseItemKind(archetype.kind) === "weapon";
      expect(archetype.staminaCost !== undefined, archetype.id).toBe(weapon);
      expect(archetype.props?.["damage"] !== undefined, archetype.id).toBe(weapon);
      if (archetype.props?.["damage"]) expect(archetype.props["damage"].mythical).toBeLessThanOrEqual(MAX_ITEM_DAMAGE_BONUS);
    }
  });

  it("let only slotless consumables restore, within the economy's ceiling", () => {
    for (const archetype of archetypes) {
      if (!archetype.restores) continue;
      expect(baseItemKind(archetype.kind), archetype.id).toBe("consumable");
      expect(archetype.slots, archetype.id).toEqual([]);
      for (const ladder of Object.values(archetype.restores)) {
        expect(ladder!.common, archetype.id).toBeGreaterThan(0);
        expect(ladder!.mythical, archetype.id).toBeLessThanOrEqual(ECONOMY_CONFIG.maximumConsumableRestore);
      }
    }
  });

  it("shape, at every tier, into an item the loot policy accepts", () => {
    for (const archetype of archetypes) {
      for (const tier of tiers) {
        const shaped = shapeByArchetype({
          name: "Test item",
          description: "For the balance test.",
          kind: "misc",
          tier,
          slotCompatibility: [],
          handsRequired: 0,
          unique: false,
          effects: [],
          props: {},
          tags: [],
          archetypeId: archetype.id,
        });
        if ("error" in shaped) throw new Error(shaped.error);
        const verdict = validateLootProposal(shaped.proposal, {
          storyId: "s",
          sourceType: "quest",
          sourceLabel: "Balance",
          maximumTier: "mythical",
          milestoneAuthorized: true,
          mythicalAuthorized: true,
          existingDefinitionIds: [],
        });
        expect(verdict, `${archetype.id} @ ${tier}`).toEqual({ valid: true, errors: [] });
      }
    }
  });
});
