import { describe, expect, it } from "vitest";
import { bootstrapStory } from "../../src/bootstrap/index.js";
import {
  mapCardToImport,
  parseCardObject,
  type CharacterCard,
} from "../../src/importer/index.js";
import type {
  Role,
  RoleBinding,
  RolePrompt,
  Router,
} from "../../src/router/index.js";
import { openStore } from "../../src/store/index.js";
import type { ActionCategory, ActionDef } from "../../src/types/index.js";

const CATEGORIES: ActionCategory[] = [
  "combat",
  "social",
  "exploration",
  "crafting",
  "utility",
];

function universalFamily(category: ActionCategory): string {
  return {
    combat: "attack_melee",
    social: "influence",
    exploration: "search",
    crafting: "interact",
    utility: "wait",
  }[category];
}

const PHASE_A = {
  statMode: "full" as const,
  attributes: [
    {
      id: "might",
      name: "Might",
      abbrev: "MGT",
      description: "Physical force.",
      defaultScore: 10,
    },
    {
      id: "finesse",
      name: "Finesse",
      abbrev: "FIN",
      description: "Speed and precision.",
      defaultScore: 10,
    },
    {
      id: "insight",
      name: "Insight",
      abbrev: "INS",
      description: "Perception and judgment.",
      defaultScore: 10,
    },
  ],
  resources: [
    {
      id: "hp",
      label: "Health",
      start: 20,
      max: 20,
      playerVisible: true,
      lethal: true,
    },
  ],
  tiers: [{ id: "common", label: "Common", minProgress: 0 }],
  skills: CATEGORIES.map((category) => ({
    id: `${category}_skill`,
    name: `${category} skill`,
    description: `Capability used for ${category}.`,
    tier: "common",
    prerequisites: [],
    unlockPaths: [{ method: "trainer" as const, npcHint: "A suitable mentor", cost: {} }],
    masteryAdvance: { successesPerRank: 3 },
  })),
};

function effects(category: ActionCategory) {
  return {
    crit_success: { narrationHint: `Exceptional ${category} result.` },
    success: { narrationHint: `Successful ${category} result.` },
    failure: { narrationHint: `Failed ${category} result.` },
    crit_failure: { narrationHint: `Disastrous ${category} result.` },
  };
}

const ACTIONS: ActionDef[] = CATEGORIES.flatMap((category) =>
  Array.from({ length: 4 }, (_, index) => ({
    id: `${category}_${index}`,
    category,
    label: `${category} ${index}`,
    description: `A bounded ${category} action.`,
    aliases: [`${category} option ${index}`],
    universalFamily: universalFamily(category),
    requiresSkill: `${category}_skill`,
    dc: 10 + index,
    effects: effects(category),
  }))
);

const GENERATED_DECOY_GEAR = {
  name: "Museum Display Sword",
  description: "A sword displayed in the location, not carried by the player.",
  kind: "weapon" as const,
  tier: "common" as const,
  slotCompatibility: ["primary" as const],
  handsRequired: 1 as const,
  unique: false,
  effects: [],
  props: {},
  tags: ["starting_gear"],
  preferredSlot: "primary" as const,
};

function bootstrapRouter(prompts: RolePrompt[]): Router {
  const binding: RoleBinding = {
    provider: "openrouter",
    model: "test",
    source: "recommended",
    samplersDirty: false,
  };
  return {
    bindingFor(_role: Role) {
      return binding;
    },
    async complete(_role, prompt) {
      prompts.push(prompt);
      if (prompt.system.includes("PHASE A")) {
        return { content: JSON.stringify(PHASE_A) };
      }
      if (prompt.system.includes("PHASE B FOUNDATION")) {
        return {
          content: JSON.stringify({
            startingState: {
              attributes: { might: 10, finesse: 10, insight: 10 },
              resources: { hp: 20 },
              skills: [],
              inventory: [],
            },
            npcTemplates: [{
              templateId: "guide",
              name: "Guide",
              attributes: { might: 10, finesse: 10, insight: 10 },
              resources: { hp: 20 },
              skills: [],
              inventory: [],
            }],
            startingGear: [GENERATED_DECOY_GEAR],
          }),
        };
      }
      const requested = prompt.user
        .match(/REQUESTED CATEGORIES: ([^\n]+)/)?.[1]
        ?.split(",")
        .map((value) => value.trim()) ?? [];
      return {
        content: JSON.stringify({
          actions: ACTIONS.filter((action) => requested.includes(action.category)),
        }),
      };
    },
    async stream() {
      throw new Error("Bootstrapper does not stream.");
    },
  };
}

interface CardAcceptanceFixture {
  id: string;
  card: CharacterCard;
  persona: { id: string; name: string; description: string };
  attribute: { id: string; name: string };
  expectedPremise: string[];
  expectedGear: string[];
  excludedGear: string[];
}

const FIXTURES: CardAcceptanceFixture[] = [
  {
    id: "saint-orra",
    card: parseCardObject({
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: "Mara",
        description:
          "{{char}} guides {{user}}, who carries the Saint Orra compass. A sword rests in a museum display.",
        scenario: "{{user}} follows {{char}} into the drowned archive.",
        extensions: {
          midnight_tavern: {
            mechanics: {
              attributes: [{
                id: "echo_sense",
                name: "{{user}}'s Echo Sense",
                abbrev: "ECH",
                score: 17,
              }],
            },
          },
        },
      },
    }),
    persona: {
      id: "persona-ari",
      name: "Ari",
      description: "{{user}} is a careful wayfinder trusted by {{char}}.",
    },
    attribute: { id: "echo_sense", name: "Ari's Echo Sense" },
    expectedPremise: [
      "Mara guides Ari",
      "Ari follows Mara",
    ],
    expectedGear: ["Saint Orra Compass"],
    excludedGear: ["Sword", "Museum Display Sword"],
  },
  {
    id: "moon-eater",
    card: parseCardObject({
      spec: "chara_card_v3",
      spec_version: "3.0",
      data: {
        name: "Nyx",
        description: "{{char}} receives {{user}} at the obsidian court.",
        scenario: "A ceremonial axe hangs above the throne.",
        extensions: {
          midnight_tavern: {
            mechanics: {
              attributes: [{
                id: "gravity_thread",
                name: "Gravity Thread",
                abbrev: "GVT",
                score: 16,
              }],
            },
          },
        },
      },
    }),
    persona: {
      id: "persona-sol",
      name: "Sol",
      description:
        "{{user}} carries the Moon-Eater blade and wears the Ash-Warden's ring while meeting {{char}}.",
    },
    attribute: { id: "gravity_thread", name: "Gravity Thread" },
    expectedPremise: ["Nyx receives Sol"],
    expectedGear: ["Moon-Eater Blade", "Ash-Warden's Ring"],
    excludedGear: ["Ceremonial Axe", "Museum Display Sword"],
  },
  {
    id: "vesper-key",
    card: parseCardObject({
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: "Vey",
        description: "{{char}} awaits {{user}} beside a rack of rifles.",
        scenario: "{{user}} must decide whether {{char}} can be trusted.",
        extensions: {
          midnight_tavern: {
            mechanics: {
              attributes: [{
                id: "lantern_logic",
                name: "Lantern Logic",
                abbrev: "LNT",
                score: 18,
              }],
            },
          },
        },
      },
    }),
    persona: {
      id: "persona-ivo",
      name: "Ivo",
      description:
        "{{user}} keeps the Vesper Key dagger and wears the Blue Glass amulet when approaching {{char}}.",
    },
    attribute: { id: "lantern_logic", name: "Lantern Logic" },
    expectedPremise: [
      "Vey awaits Ivo",
      "Ivo must decide whether Vey",
    ],
    expectedGear: ["Vesper Key Dagger", "Blue Glass Amulet"],
    excludedGear: ["Rifle", "Museum Display Sword"],
  },
];

describe("literal cross-card acceptance", () => {
  for (const fixture of FIXTURES) {
    it(`preserves identity, attributes, and carried gear for ${fixture.id}`, async () => {
      const store = await openStore(":memory:");
      try {
        const preview = mapCardToImport(fixture.card);
        const prompts: RolePrompt[] = [];
        const created = await bootstrapStory(
          bootstrapRouter(prompts),
          store,
          {
            storyId: `cross-card-${fixture.id}`,
            title: fixture.id,
            premise: preview.premise,
            statMode: "full",
            sourceCard: fixture.card,
            persona: fixture.persona,
            importedMechanics: preview.importedMechanics,
            acceptImportedMechanics: true,
          },
          { name: fixture.persona.name }
        );

        for (const expected of fixture.expectedPremise) {
          expect(created.story.schema.premise).toContain(expected);
        }
        expect(prompts.length).toBeGreaterThan(0);
        expect(prompts.every((prompt) => !prompt.user.includes("{{user}}"))).toBe(true);
        expect(prompts.every((prompt) => !prompt.user.includes("{{char}}"))).toBe(true);
        expect(
          created.story.schema.attributes.find(
            (attribute) => attribute.id === fixture.attribute.id
          )?.name
        ).toBe(fixture.attribute.name);

        const names = (await store.runtimeItems.listDefinitions(created.story.id))
          .map((definition) => definition.name);
        expect(names).toEqual(expect.arrayContaining(fixture.expectedGear));
        for (const excluded of fixture.excludedGear) {
          expect(names).not.toContain(excluded);
        }
        expect(names).toHaveLength(fixture.expectedGear.length);

        expect(created.story.configSnapshot?.creationSource).toMatchObject({
          sourceCard: {
            data: {
              description: fixture.card.data.description,
            },
          },
          persona: {
            description: fixture.persona.description,
          },
        });
      } finally {
        await store.close();
      }
    });
  }
});
