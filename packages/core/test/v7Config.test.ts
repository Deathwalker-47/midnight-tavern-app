import { describe, expect, it } from "vitest";
import {
  EQUIPMENT_LOOT_CONFIG,
  ATTRIBUTE_ADVANCEMENT_CONFIG,
  MECHANICS_CONFIG_VERSIONS,
  PROGRESSION_CONFIG,
  UNIVERSAL_ACTIONS_CONFIG,
  findUniversalAction,
  matchUniversalAction,
  applyUniversalActionDefaults,
  AttributeDefSchema,
  StorySchemaSchema,
} from "../src/index.js";
import { makeStory } from "./fixtures.js";

describe("V7 mechanics configuration registry", () => {
  it("loads versioned action, progression, and equipment assets", () => {
    expect(MECHANICS_CONFIG_VERSIONS).toEqual({
      universalActions: 4,
      progression: 1,
      equipmentLoot: 1,
      attributeAdvancement: 1,
    });
    expect(UNIVERSAL_ACTIONS_CONFIG.actions.length).toBeGreaterThanOrEqual(30);
    for (const category of ["combat", "social", "exploration", "crafting", "utility"] as const) {
      expect(
        UNIVERSAL_ACTIONS_CONFIG.actions.filter((action) => action.category === category).length,
        `${category} universal family count`
      ).toBeGreaterThanOrEqual(6);
    }
    expect(PROGRESSION_CONFIG.ranks.map((entry) => entry.minimumXp)).toEqual([
      0, 100, 300, 700,
    ]);
    expect(EQUIPMENT_LOOT_CONFIG.slots).toHaveLength(7);
    expect(new Set(EQUIPMENT_LOOT_CONFIG.slots).size).toBe(7);
    expect(
      ATTRIBUTE_ADVANCEMENT_CONFIG.bands.map((band) => [
        band.minimumScore,
        band.maximumScore,
      ])
    ).toEqual([
      [1, 5],
      [6, 9],
      [10, 13],
      [14, 17],
      [18, 19],
    ]);
    expect(
      StorySchemaSchema.parse({
        ...makeStory(),
        mechanicsConfigVersions: MECHANICS_CONFIG_VERSIONS,
      }).mechanicsConfigVersions
    ).toEqual(MECHANICS_CONFIG_VERSIONS);
  });

  it("maps natural phrasing to an upgradeable universal family", () => {
    expect(matchUniversalAction("I lunge with my knife")?.id).toBe("attack_melee");
    expect(matchUniversalAction("search")?.id).toBe("search");
    expect(findUniversalAction("wait")?.description).toContain("scene");
  });

  it("gives generated attack families deterministic lethal-resource damage", () => {
    const story = makeStory();
    story.actions[0] = {
      ...story.actions[0]!,
      universalFamily: "attack_melee",
      effects: {
        crit_success: { narrationHint: "A devastating blow lands." },
        success: { setFlag: { flagId: "awakened", value: true }, narrationHint: "A clean hit." },
        failure: { narrationHint: "The strike misses." },
        crit_failure: { narrationHint: "The attacker overextends." },
      },
    };

    const normalized = applyUniversalActionDefaults(story);
    expect(normalized.actions[0]!.effects.success.resourceDeltaTarget).toEqual({ hp: -4 });
    expect(normalized.actions[0]!.effects.crit_success.resourceDeltaTarget).toEqual({ hp: -8 });
    expect(story.actions[0]!.effects.success.resourceDeltaTarget).toBeUndefined();
  });

  it("installs a gate-legal natural attack into an older full-stat catalogue", () => {
    const story = makeStory();
    story.actions = story.actions.filter((action) => action.id !== "attack_wild");

    const normalized = applyUniversalActionDefaults(story);
    const naturalAttack = normalized.actions.find(
      (action) => action.universalFamily === "attack_natural"
    );

    expect(naturalAttack).toMatchObject({
      id: "universal_natural_attack",
      category: "combat",
      universalFamily: "attack_natural",
      effects: {
        success: { resourceDeltaTarget: { hp: -4 } },
        crit_success: { resourceDeltaTarget: { hp: -8 } },
      },
    });
    expect(naturalAttack?.requiresSkill).toBeUndefined();
    expect(naturalAttack?.requiresItemKind).toBeUndefined();
    expect(naturalAttack?.costs).toBeUndefined();
    expect(story.actions.some((action) => action.id === "universal_natural_attack")).toBe(false);
  });
});

describe("V7 attribute contract", () => {
  const ordinary = {
    id: "might",
    name: "Might",
    abbrev: "MIG",
    description: "Physical power.",
  };

  it("requires explicit provenance for zero and superhuman scores", () => {
    expect(AttributeDefSchema.safeParse({ ...ordinary, defaultScore: 21 }).success).toBe(false);
    expect(
      AttributeDefSchema.safeParse({
        ...ordinary,
        defaultScore: 45,
        superhuman: true,
        maximumScore: 50,
      }).success
    ).toBe(true);
    expect(AttributeDefSchema.safeParse({ ...ordinary, defaultScore: 0 }).success).toBe(false);
    expect(
      AttributeDefSchema.safeParse({
        ...ordinary,
        defaultScore: 0,
        lockedAtZero: true,
      }).success
    ).toBe(true);
  });

  it("enforces 3–6 attributes and ordinary starting scores on V2 only", () => {
    const v2 = {
      ...makeStory(),
      schemaVersion: 2,
      attributes: [
        { ...ordinary, defaultScore: 10 },
        { ...ordinary, id: "finesse", name: "Finesse", abbrev: "FIN", defaultScore: 10 },
        { ...ordinary, id: "resolve", name: "Resolve", abbrev: "RES", defaultScore: 10 },
      ],
      startingState: {
        ...makeStory().startingState,
        attributes: { might: 14, finesse: 12, resolve: 11 },
      },
    };
    expect(StorySchemaSchema.safeParse(v2).success).toBe(true);
    expect(
      StorySchemaSchema.safeParse({
        ...v2,
        startingState: { ...v2.startingState, attributes: { ...v2.startingState.attributes, might: 21 } },
      }).success
    ).toBe(false);
  });

  it("keeps legacy V1 stories with old 21–30 scores readable", () => {
    const legacy = makeStory();
    legacy.attributes[0] = { ...legacy.attributes[0]!, defaultScore: 24 };
    const parsed = StorySchemaSchema.parse(legacy);
    expect(parsed.attributes[0]).toMatchObject({
      defaultScore: 24,
      superhuman: true,
      maximumScore: 24,
      provenance: "rulebook",
    });
  });
});
