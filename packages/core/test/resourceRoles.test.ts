import { describe, expect, it } from "vitest";
import {
  instantiateGeneric,
  inferResourceRole,
  resourceIdForRole,
  resourceRoles,
  StorySchemaSchema,
  type ResourceDef,
  type StorySchema,
} from "../src/index.js";
import { makeStory } from "./fixtures.js";

const resource = (overrides: Partial<ResourceDef> & Pick<ResourceDef, "id">): ResourceDef => ({
  label: overrides.id,
  start: 10,
  max: 10,
  playerVisible: true,
  ...overrides,
});

/** A Full Stats v3 rulebook: roles are explicit and health/mana/stamina are mandatory. */
function v3Story(overrides: Partial<StorySchema> = {}): StorySchema {
  return makeStory({
    schemaVersion: 3,
    attributes: [
      { id: "str", name: "Strength", abbrev: "STR", description: "Raw force.", defaultScore: 10 },
      { id: "dex", name: "Dexterity", abbrev: "DEX", description: "Agility.", defaultScore: 10 },
      { id: "wit", name: "Wits", abbrev: "WIT", description: "Cunning.", defaultScore: 10 },
    ],
    resources: [
      resource({ id: "hp", label: "Health", start: 30, max: 30, lethal: true, role: "health" }),
      resource({ id: "aether", label: "Aether", start: 12, max: 12, role: "mana" }),
      resource({ id: "grit", label: "Grit", start: 8, max: 8, role: "stamina" }),
      resource({ id: "coin", label: "Coin", start: 5, max: 999, role: "currency" }),
    ],
    startingState: {
      attributes: {},
      resources: { hp: 30, aether: 12, grit: 8, coin: 5 },
      skills: [],
      inventory: [],
    },
    ...overrides,
  });
}

describe("resource roles (plan 08 §2, finding 22)", () => {
  it("prefers an explicit role over any inference", () => {
    expect(inferResourceRole(resource({ id: "fatigue", role: "stamina" }))).toBe("stamina");
  });

  it("infers legacy roles from lethality and conventional names", () => {
    expect(inferResourceRole(resource({ id: "hp", lethal: true }))).toBe("health");
    expect(inferResourceRole(resource({ id: "mana" }))).toBe("mana");
    expect(inferResourceRole(resource({ id: "res_2", label: "Aether" }))).toBe("mana");
    expect(inferResourceRole(resource({ id: "stamina" }))).toBe("stamina");
    expect(inferResourceRole(resource({ id: "grit" }))).toBe("stamina");
    expect(inferResourceRole(resource({ id: "wealth_silver" }))).toBe("currency");
    expect(inferResourceRole(resource({ id: "coins" }))).toBe("currency");
    expect(inferResourceRole(resource({ id: "xp" }))).toBe("experience");
    expect(inferResourceRole(resource({ id: "sanity" }))).toBe("other");
  });

  it("leaves an inverted fatigue bar as 'other' rather than silently inverting a live economy", () => {
    expect(inferResourceRole(resource({ id: "fatigue", label: "Fatigue" }))).toBe("other");
  });

  it("assigns each core role at most once across a rulebook", () => {
    const schema = makeStory({
      resources: [
        resource({ id: "hp", lethal: true }),
        resource({ id: "mana" }),
        resource({ id: "essence" }),
        resource({ id: "stamina" }),
      ],
    });
    expect(Object.fromEntries(resourceRoles(schema))).toEqual({
      hp: "health",
      mana: "mana",
      essence: "other",
      stamina: "stamina",
    });
    expect(resourceIdForRole(schema, "mana")).toBe("mana");
    expect(resourceIdForRole(schema, "experience")).toBeUndefined();
  });

  it("takes explicit roles verbatim and lets them outrank a same-role inference", () => {
    expect(Object.fromEntries(resourceRoles(v3Story()))).toEqual({
      hp: "health",
      aether: "mana",
      grit: "stamina",
      coin: "currency",
    });
    const mixed = makeStory({
      resources: [
        resource({ id: "hp", lethal: true }),
        resource({ id: "mana" }),
        resource({ id: "focus", role: "mana" }),
      ],
    });
    expect(resourceIdForRole(mixed, "mana")).toBe("focus");
    expect(resourceRoles(mixed).get("mana")).toBe("other");
  });

  it("matches the two live saves' legacy resources", () => {
    const soloLeveling = makeStory({
      resources: ["health", "mana", "fatigue", "coins", "xp"].map((id) =>
        resource({ id, ...(id === "health" ? { lethal: true } : {}) })
      ),
    });
    expect(Object.fromEntries(resourceRoles(soloLeveling))).toEqual({
      health: "health",
      mana: "mana",
      fatigue: "other",
      coins: "currency",
      xp: "experience",
    });
    const cyraeth = makeStory({
      resources: ["health", "mana", "stamina", "wealth_silver"].map((id) =>
        resource({ id, ...(id === "health" ? { lethal: true } : {}) })
      ),
    });
    expect(resourceIdForRole(cyraeth, "stamina")).toBe("stamina");
    expect(resourceIdForRole(cyraeth, "currency")).toBe("wealth_silver");
  });
});

describe("schema v3 resource contract", () => {
  it("accepts a Full Stats v3 rulebook with explicit health, mana and stamina roles", () => {
    expect(StorySchemaSchema.safeParse(v3Story()).success).toBe(true);
  });

  it("rejects a Full Stats v3 rulebook missing a core role", () => {
    const story = v3Story();
    story.resources = story.resources.filter((entry) => entry.role !== "stamina");
    const parsed = StorySchemaSchema.safeParse(story);
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toMatch(/stamina/);
  });

  it("rejects a v3 rulebook whose health resource is not the lethal one", () => {
    const story = v3Story();
    story.resources = story.resources.map((entry) =>
      entry.id === "hp" ? { ...entry, lethal: false } : entry.id === "grit" ? { ...entry, lethal: true } : entry
    );
    expect(StorySchemaSchema.safeParse(story).success).toBe(false);
  });

  it("keeps v1/v2 rulebooks valid without any roles", () => {
    expect(StorySchemaSchema.safeParse(makeStory()).success).toBe(true);
  });
});

describe("generic NPCs carry the three core pools on v3 rulebooks", () => {
  it("grants health, mana and stamina so an NPC can pay costs", () => {
    const hard = instantiateGeneric(v3Story(), "npc");
    expect(Object.keys(hard.resources).sort()).toEqual(["aether", "grit", "hp"]);
    expect(hard.resources.aether).toEqual({ current: 12, max: 12 });
    expect(hard.resources.grit).toEqual({ current: 8, max: 8 });
  });

  it("leaves legacy rulebooks unchanged: only the lethal resource", () => {
    expect(Object.keys(instantiateGeneric(makeStory(), "npc").resources)).toEqual(["hp"]);
  });
});
