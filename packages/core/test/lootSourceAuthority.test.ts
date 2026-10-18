/**
 * Authority gap A1 (plan 10 §1.2.1): the loot model must not be able to label its own award a quest.
 * A quest is an engine fact, and no quest system exists yet; while the label was model-facing, saying
 * "quest" with any successful ruling made the award milestone-authorized under the legendary quest
 * ceiling. A model-labelled quest award can no longer exceed the routine `rare` ceiling.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { determineLootAwards, type RolePrompt, type Router, type Ruling } from "../src/index.js";
import { openStore, type Store } from "../src/store/index.js";
import { makePlayer, makeStory } from "./fixtures.js";

const storyId = "loot-authority";

/** A legendary blade at the top of the legendary budget: +3 to checks and +2 to an attribute. */
const award = (sourceType: string, tier: "legendary" | "rare") => ({
  award: true,
  sourceType,
  sourceLabel: "The warden's oath",
  recipientCharacterId: "kestrel",
  reason: "The oath is fulfilled.",
  proposal: {
    name: "Oathblade",
    description: "A blade sworn to the warden.",
    kind: "weapon",
    tier,
    archetypeId: "item.melee.light_weapon",
    effects:
      tier === "legendary"
        ? [
            { type: "skill_check", skillId: "blade", amount: 3 },
            { type: "attribute_score", attributeId: "might", amount: 2 },
          ]
        : [],
    tags: [],
  },
});

/** Answers each loot call with the next scripted decision, repeating the last one. */
function adjudicator(...decisions: object[]): Router & { prompts: RolePrompt[] } {
  const prompts: RolePrompt[] = [];
  return {
    prompts,
    bindingFor: () => ({ provider: "openrouter", model: "test", source: "recommended", samplersDirty: false }),
    complete: async (_role, prompt) => {
      prompts.push(prompt);
      return { content: JSON.stringify(decisions[Math.min(prompts.length, decisions.length) - 1]) };
    },
    stream: async () => ({ content: "" }),
  };
}

const won = {
  turnId: "t",
  actorId: "kestrel",
  actionId: "attack_wild",
  gate: { allowed: true },
  roll: { d20: 15, attributeModifier: 0, skillModifier: 0, total: 15, dc: 10, outcome: "success" },
  effectsApplied: { narrationHint: "a hit" },
} as unknown as Ruling;

describe("a model-chosen quest label (A1)", () => {
  let store: Store;
  const record = async () => (await store.stories.get(storyId))!;
  const summary = (awards: Awaited<ReturnType<typeof determineLootAwards>>) =>
    awards.map((pending) => ({
      sourceType: pending.instance.provenance.sourceType,
      tier: pending.definition.tier,
      tierBudget: pending.instance.provenance.tierBudget,
    }));

  beforeEach(async () => {
    store = await openStore(":memory:");
    await store.stories.insert({ id: storyId, title: "Oath", createdAt: 0, schema: { ...makeStory(), storyId }, locked: true });
    await store.characters.insert({ id: "kestrel", storyId, name: "Kestrel", isPlayer: true, hard: makePlayer() });
  });

  it("does not unlock legendary loot", async () => {
    const router = adjudicator(award("quest", "legendary"));
    expect(summary(await determineLootAwards(router, store, await record(), "I keep my oath.", [won]))).toEqual([]);
  });

  it("is refused, and an award relabelled on repair is held to the routine rare ceiling", async () => {
    const router = adjudicator(award("quest", "legendary"), award("non_combat", "rare"));
    expect(summary(await determineLootAwards(router, store, await record(), "I keep my oath.", [won]))).toEqual([
      { sourceType: "non_combat", tier: "rare", tierBudget: "rare" },
    ]);
    expect(router.prompts).toHaveLength(2);
    expect(router.prompts[1]!.user).toContain("sourceType");
  });
});
