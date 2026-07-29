import { describe, expect, it } from "vitest";
import {
  DIFFICULTY_PRESETS,
  commit,
  computeRollMode,
  d20Sequence,
  resolve,
  type ActionDef,
  type EquipmentRuntimeCatalog,
} from "../src/index.js";
import { makeEnemy, makePlayer, makeStory } from "./fixtures.js";

function configuredAction(overrides: Partial<ActionDef> = {}): ActionDef {
  const base = makeStory().actions.find((action) => action.id === "attack_melee")!;
  return {
    ...base,
    requiresItemKind: undefined,
    dc: 15,
    advantageWhen: [
      { condition: { type: "flag", flagId: "hidden", value: true }, reason: "Hidden" },
    ],
    disadvantageWhen: [
      { condition: { type: "flag", flagId: "wounded", value: true }, reason: "Wounded" },
    ],
    ...overrides,
  };
}

const attackIntent = {
  actorId: "kestrel",
  actionId: "attack_melee",
  targetId: "wight",
  confidence: 1,
};

const runtimeEquipment: EquipmentRuntimeCatalog = {
  definitions: [
    {
      id: "runtime-blade-def",
      storyId: "story-fixture",
      name: "Balanced Blade",
      description: "A precise one-handed weapon.",
      kind: "weapon",
      tier: "uncommon",
      slotCompatibility: ["primary"],
      handsRequired: 1,
      unique: false,
      effects: [{ type: "skill_check", skillId: "blade", amount: 1 }],
      props: { damage: 2 },
      tags: [],
      createdAt: "2026-07-23T00:00:00.000Z",
      configVersion: 1,
    },
  ],
  instances: [
    {
      id: "runtime-blade-1",
      storyId: "story-fixture",
      definitionId: "runtime-blade-def",
      ownerCharacterId: "kestrel",
      quantity: 1,
      acquiredAt: "2026-07-23T00:00:00.000Z",
      provenance: {
        sourceType: "combat",
        sourceLabel: "Bandit captain",
        rulingId: "ruling-1",
        turnId: "turn-1",
        tierBudget: "uncommon",
        eligibilityReasons: [],
        policyVersion: 1,
        grantedAt: "2026-07-23T00:00:00.000Z",
      },
    },
  ],
};

describe("V7 resolver integration", () => {
  it("records every matching source without stacking beyond advantage", () => {
    const action: ActionDef = {
      ...configuredAction(),
      advantageWhen: [
        { condition: { type: "flag", flagId: "one", value: true }, reason: "One" },
        { condition: { type: "flag", flagId: "two", value: true }, reason: "Two" },
        { condition: { type: "flag", flagId: "three", value: true }, reason: "Three" },
      ],
      disadvantageWhen: [],
    };
    expect(
      computeRollMode(makeStory(), action, makePlayer({
        flags: { one: true, two: true, three: true },
      }))
    ).toEqual({
      mode: "advantage",
      advantageSources: ["One", "Two", "Three"],
      disadvantageSources: [],
    });
  });

  it("persists both dice and uses only the kept die for criticals", () => {
    const story = makeStory({ actions: [configuredAction()] });
    const result = resolve(
      story,
      makePlayer({ flags: { wounded: true } }),
      makeEnemy(),
      attackIntent,
      d20Sequence([20, 10])
    );
    expect(result.ruling.roll).toMatchObject({
      dice: [20, 10],
      usedIndex: 1,
      natural: 10,
      rollMode: "disadvantage",
    });
    expect(result.ruling.roll?.outcome).not.toBe("crit_success");
  });

  it("records cancellation sources and rolls normally", () => {
    const story = makeStory({ actions: [configuredAction()] });
    const result = resolve(
      story,
      makePlayer({ flags: { hidden: true, wounded: true } }),
      makeEnemy(),
      attackIntent,
      d20Sequence([15])
    );
    expect(result.ruling.roll).toMatchObject({
      dice: [15],
      rollMode: "normal",
      advantageSources: ["Hidden"],
      disadvantageSources: ["Wounded"],
    });
  });

  it("requires runtime gear to be equipped and applies equipped-only bonuses", () => {
    const action = configuredAction({ requiresItemKind: "weapon" });
    const story = makeStory({ actions: [action] });
    const unequipped = resolve(
      story,
      makePlayer({ inventory: [], equipment: [] }),
      makeEnemy(),
      attackIntent,
      d20Sequence([12]),
      { equipment: runtimeEquipment }
    );
    expect(unequipped.ruling.gate.allowed).toBe(false);

    const equipped = resolve(
      story,
      makePlayer({
        inventory: [],
        equipment: [
          {
            characterId: "kestrel",
            slot: "primary",
            itemInstanceId: "runtime-blade-1",
          },
        ],
      }),
      makeEnemy(),
      attackIntent,
      d20Sequence([18]),
      { equipment: runtimeEquipment }
    );
    expect(equipped.ruling.gate.allowed).toBe(true);
    expect(equipped.ruling.roll?.modifier).toBe(2);
    expect(
      equipped.mutations.find(
        (mutation) => mutation.kind === "resourceDelta" && mutation.characterId === "wight"
      )
    ).toMatchObject({ delta: -6 });
  });

  it("applies visible DC provenance and deterministic damage scaling", () => {
    const action = configuredAction({
      effects: {
        crit_success: { resourceDeltaTarget: { hp: -5 }, narrationHint: "hit" },
        success: { resourceDeltaTarget: { hp: -5 }, narrationHint: "hit" },
        failure: { narrationHint: "miss" },
        crit_failure: { narrationHint: "fumble" },
      },
    });
    const story = makeStory({ actions: [action] });
    const player = makePlayer();
    const enemy = makeEnemy();
    const result = resolve(
      story,
      player,
      enemy,
      attackIntent,
      d20Sequence([18]),
      { difficulty: { preset: "hard", ...DIFFICULTY_PRESETS.hard } }
    );
    expect(result.ruling.roll).toMatchObject({ dcBase: 15, dcEffective: 17, dc: 17 });
    expect(result.ruling.damageAdjustments?.[0]).toMatchObject({
      baseDelta: -5,
      multiplier: 0.9,
      scaledDelta: -4,
    });
    commit(
      story,
      result.mutations,
      new Map([
        [player.characterId, player],
        [enemy.characterId, enemy],
      ])
    );
    expect(enemy.resources.hp?.current).toBe(8);
  });

  it("computes opposed modes independently for both sides", () => {
    const story = makeStory({ actions: [configuredAction({ opposed: true })] });
    const result = resolve(
      story,
      makePlayer({ flags: { hidden: true } }),
      makeEnemy({ flags: { wounded: true } }),
      attackIntent,
      d20Sequence([5, 17, 15, 3])
    );
    expect(result.ruling.roll).toMatchObject({
      rollMode: "advantage",
      dice: [5, 17],
      natural: 17,
      opposedRollMode: "disadvantage",
      opposedDice: [15, 3],
      opposedNatural: 3,
    });
  });

  it("uses equipped attributes, checks, and skill enablement for both opposed actors", () => {
    const action = configuredAction({
      opposed: true,
      governingAttribute: "might",
    });
    const story = makeStory({
      attributes: [
        {
          id: "might",
          name: "Might",
          abbrev: "MIG",
          description: "Physical power.",
          defaultScore: 10,
        },
      ],
      actions: [action],
    });
    const equipment: EquipmentRuntimeCatalog = {
      definitions: [
        {
          id: "focus-def",
          storyId: story.storyId,
          name: "Duelist Focus",
          description: "Makes the bearer unnaturally precise.",
          kind: "accessory",
          tier: "rare",
          slotCompatibility: ["accessory_1"],
          handsRequired: 0,
          unique: false,
          effects: [
            { type: "attribute_score", attributeId: "might", amount: 2 },
            { type: "skill_enable", skillId: "blade", rank: "expert" },
            { type: "skill_check", skillId: "blade", amount: 1 },
          ],
          props: {},
          tags: [],
          createdAt: "2026-07-29T00:00:00.000Z",
          configVersion: 1,
        },
      ],
      instances: [
        {
          id: "hero-focus",
          storyId: story.storyId,
          definitionId: "focus-def",
          ownerCharacterId: "kestrel",
          quantity: 1,
          acquiredAt: "2026-07-29T00:00:00.000Z",
          provenance: {
            sourceType: "quest",
            sourceLabel: "Duel",
            rulingId: "r1",
            turnId: "t1",
            tierBudget: "rare",
            eligibilityReasons: [],
            policyVersion: 1,
            grantedAt: "2026-07-29T00:00:00.000Z",
          },
        },
        {
          id: "foe-focus",
          storyId: story.storyId,
          definitionId: "focus-def",
          ownerCharacterId: "wight",
          quantity: 1,
          acquiredAt: "2026-07-29T00:00:00.000Z",
          provenance: {
            sourceType: "quest",
            sourceLabel: "Duel",
            rulingId: "r2",
            turnId: "t1",
            tierBudget: "rare",
            eligibilityReasons: [],
            policyVersion: 1,
            grantedAt: "2026-07-29T00:00:00.000Z",
          },
        },
      ],
    };
    const actor = makePlayer({
      attributes: { might: 12 },
      skills: [],
      equipment: [
        { characterId: "kestrel", slot: "accessory_1", itemInstanceId: "hero-focus" },
      ],
    });
    const target = makeEnemy({
      attributes: { might: 8 },
      skills: [],
      equipment: [
        { characterId: "wight", slot: "accessory_1", itemInstanceId: "foe-focus" },
      ],
    });

    const result = resolve(
      story,
      actor,
      target,
      attackIntent,
      d20Sequence([10, 10]),
      { equipment }
    );

    expect(result.ruling.roll).toMatchObject({
      attributeScore: 14,
      attributeModifier: 2,
      equipmentAttributeBonus: 2,
      masteryModifier: 5,
      equipmentModifier: 1,
      modifier: 8,
      opposedAttributeScore: 10,
      opposedAttributeModifier: 0,
      opposedEquipmentAttributeBonus: 2,
      opposedMasteryModifier: 5,
      opposedEquipmentModifier: 1,
      opposedModifier: 6,
    });
  });

  it("applies every opposed natural-roll precedence branch", () => {
    const story = makeStory({ actions: [configuredAction({ opposed: true })] });
    expect(
      resolve(
        story,
        makePlayer(),
        makeEnemy(),
        attackIntent,
        d20Sequence([1, 10])
      ).ruling.roll?.outcome
    ).toBe("crit_failure");
    expect(
      resolve(
        story,
        makePlayer(),
        makeEnemy(),
        attackIntent,
        d20Sequence([10, 20])
      ).ruling.roll?.outcome
    ).toBe("failure");
    expect(
      resolve(
        story,
        makePlayer(),
        makeEnemy(),
        attackIntent,
        d20Sequence([2, 1])
      ).ruling.roll?.outcome
    ).toBe("success");
  });

  it("stages self and target attribute mutations from an authoritative effect", () => {
    const reshape: ActionDef = {
      id: "reshape",
      category: "utility",
      label: "Reshape",
      dc: 2,
      effects: {
        crit_success: {
          attributeDeltaSelf: { might: 1 },
          attributeDeltaTarget: { might: -1 },
          narrationHint: "Power shifts.",
        },
        success: {
          attributeDeltaSelf: { might: 1 },
          attributeDeltaTarget: { might: -1 },
          narrationHint: "Power shifts.",
        },
        failure: { narrationHint: "Nothing shifts." },
        crit_failure: { narrationHint: "The rite recoils." },
      },
    };
    const story = makeStory({ actions: [reshape] });
    const result = resolve(
      story,
      makePlayer(),
      makeEnemy(),
      {
        actorId: "kestrel",
        actionId: "reshape",
        targetId: "wight",
        confidence: 1,
      },
      d20Sequence([10])
    );
    expect(result.mutations).toEqual(
      expect.arrayContaining([
        {
          kind: "attributeDelta",
          characterId: "kestrel",
          attributeId: "might",
          delta: 1,
        },
        {
          kind: "attributeDelta",
          characterId: "wight",
          attributeId: "might",
          delta: -1,
        },
      ])
    );
  });

  it("keeps sealed deception uncertain even when classified as low stakes", () => {
    const deceive: ActionDef = {
      id: "deceive",
      category: "social",
      label: "Deceive",
      dc: 10,
      effects: {
        crit_success: { narrationHint: "The lie is flawless." },
        success: { narrationHint: "The lie holds." },
        failure: { narrationHint: "The lie is doubted." },
        crit_failure: { narrationHint: "The lie collapses." },
      },
    };
    const result = resolve(
      makeStory({ actions: [deceive] }),
      makePlayer(),
      makeEnemy(),
      {
        actorId: "kestrel",
        actionId: "deceive",
        targetId: "wight",
        confidence: 1,
        stakes: "none",
      },
      d20Sequence([10])
    );
    expect(result.ruling.roll).toBeDefined();
  });
});
