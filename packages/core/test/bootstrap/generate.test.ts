/**
 * Bootstrap schema-validation fuzz (low-level-plan §10 "bootstrap", §M5.1–2).
 *
 * Two layers:
 *   1. `validateStorySchema` fuzz — build a genuinely bootstrap-valid schema, then mutate it
 *      in each way §M5.2 forbids (tiny catalog, empty category, out-of-range DC, dangling
 *      references, dead skill, wrong lethal-resource count, statMode="none" with resources).
 *      Each mutation must produce a precise error string; the unmutated schema is clean.
 *   2. `generateStorySchema` repair loop — a scripted "bootstrapper" router that dispatches
 *      on the phase system prompt and returns malformed outputs BEFORE valid ones, proving:
 *        • callStructured repairs Zod-invalid / non-JSON Phase A,
 *        • the cross-validation loop re-prompts Phase B when the assembled schema fails
 *          validateStorySchema, then succeeds,
 *        • exhausting the loop throws ModelOutputError naming the bootstrapper role.
 *
 * NOTE: the engine fixture (`makeStory`) deliberately violates §M5.2 (small catalog,
 * dangling `phantom` skill) to exercise gate fallbacks, so it is NOT usable here. We build a
 * catalog-complete schema locally instead.
 */
import { describe, it, expect } from "vitest";
import { generateStorySchema } from "../../src/bootstrap/generate.js";
import { validateStorySchema } from "../../src/bootstrap/validate.js";
import { ModelOutputError } from "../../src/router/index.js";
import type { Router, RolePrompt, ChatResponse } from "../../src/router/index.js";
import {
  StorySchemaSchema,
  type StorySchema,
  type ActionDef,
  type ActionCategory,
} from "../../src/index.js";

const CATEGORIES: ActionCategory[] = ["combat", "social", "exploration", "crafting", "utility"];

/** One skill per category so every skill is exercised; ids are `${category}_skill`. */
function skillFor(category: ActionCategory) {
  return {
    id: `${category}_skill`,
    name: `${category} skill`,
    description: `Skill for ${category}.`,
    tier: "common",
    prerequisites: [],
    unlockPaths: [{ method: "manual" as const, itemId: "manual" }],
    masteryAdvance: { successesPerRank: 3 },
  };
}

/** A full 4-outcome effects table (harmless narration). */
function effects(hint: string) {
  return {
    crit_success: { narrationHint: `${hint} (crit)` },
    success: { narrationHint: hint },
    failure: { narrationHint: `${hint} fails` },
    crit_failure: { narrationHint: `${hint} backfires` },
  };
}

/** Build a §M5.2-valid schema: 5 categories × 4 actions, one skill each, all refs resolve. */
function makeValidBootstrapSchema(overrides: Partial<StorySchema> = {}): StorySchema {
  const actions: ActionDef[] = [];
  for (const category of CATEGORIES) {
    for (let i = 0; i < 4; i++) {
      actions.push({
        id: `${category}_${i}`,
        category,
        label: `${category} ${i}`,
        requiresSkill: `${category}_skill`,
        dc: 10 + i, // 10–13, inside 5–25
        effects: effects(`a ${category} action`),
      });
    }
  }
  const story: StorySchema = {
    schemaVersion: 1,
    storyId: "story-boot",
    title: "Bootstrapped Tale",
    premise: "A valid bootstrap premise.",
    statMode: "full",
    resources: [
      { id: "hp", label: "Health", start: 20, max: 20, playerVisible: true, lethal: true },
      { id: "stamina", label: "Stamina", start: 10, max: 10, playerVisible: true },
    ],
    skills: CATEGORIES.map(skillFor),
    items: [
      { id: "manual", name: "Manual", description: "Teaches skills.", kind: "misc", tier: "common", props: {} },
      { id: "blade", name: "Blade", description: "A weapon.", kind: "weapon", tier: "common", props: { damage: 6 } },
    ],
    tiers: [{ id: "common", label: "Common", minProgress: 0 }],
    actions,
    startingState: {
      resources: { hp: 20, stamina: 10 },
      skills: [{ skillId: "combat_skill", rank: "novice" }],
      inventory: [{ itemId: "blade", qty: 1 }],
    },
    npcTemplates: [
      { templateId: "foe", name: "A Foe", resources: { hp: 10 }, skills: [{ skillId: "combat_skill", rank: "adept" }], inventory: [] },
    ],
    locked: false,
    ...overrides,
  };
  return StorySchemaSchema.parse(story);
}

const STORY = makeValidBootstrapSchema();
const PHASE_A = { statMode: STORY.statMode, resources: STORY.resources, tiers: STORY.tiers, skills: STORY.skills };
const PHASE_B = {
  items: STORY.items,
  actions: STORY.actions,
  startingState: STORY.startingState,
  npcTemplates: STORY.npcTemplates,
};

/**
 * A bootstrapper router that replays a per-phase script, choosing the phase by scanning the
 * system prompt for "PHASE A"/"PHASE B" and returning that phase's next scripted response
 * (repeating the last). Records per-phase call counts.
 */
function phasedRouter(scripts: { a: string[]; b: string[] }): { router: Router; counts: { a: number; b: number } } {
  const counts = { a: 0, b: 0 };
  const router: Router = {
    bindingFor: () => ({ provider: "openrouter", model: "test" }),
    async complete(_role, prompt: RolePrompt): Promise<ChatResponse> {
      const key = prompt.system.includes("PHASE A") ? "a" : "b";
      const seq = scripts[key];
      const content = seq[Math.min(counts[key], seq.length - 1)] ?? "";
      counts[key]++;
      return { content };
    },
    async stream() {
      throw new Error("bootstrapper never streams");
    },
  };
  return { router, counts };
}

const input = { storyId: "story-boot", title: "Bootstrapped Tale", premise: "A valid bootstrap premise." };
const J = (v: unknown) => JSON.stringify(v);

describe("validateStorySchema — fuzz against §M5.2 invariants", () => {
  it("passes the unmutated valid schema with zero errors", () => {
    expect(validateStorySchema(STORY)).toEqual([]);
  });

  it("flags a catalog with too few actions", () => {
    const errs = validateStorySchema({ ...STORY, actions: STORY.actions.slice(0, 3) });
    expect(errs.some((e) => /at least \d+ are required/.test(e))).toBe(true);
  });

  it("flags a category below the per-category minimum", () => {
    const errs = validateStorySchema({ ...STORY, actions: STORY.actions.filter((a) => a.category !== "social") });
    expect(errs.some((e) => /Category "social"/.test(e))).toBe(true);
  });

  it("flags a DC outside the 5–25 scale", () => {
    const [first, ...rest] = STORY.actions;
    const errs = validateStorySchema({ ...STORY, actions: [{ ...first!, dc: 99 }, ...rest] });
    expect(errs.some((e) => /has DC 99/.test(e))).toBe(true);
  });

  it("flags an action requiring an unknown skill", () => {
    const [first, ...rest] = STORY.actions;
    const errs = validateStorySchema({ ...STORY, actions: [{ ...first!, requiresSkill: "no_such" }, ...rest] });
    expect(errs.some((e) => /unknown skill "no_such"/.test(e))).toBe(true);
  });

  it("flags a dead skill exercised by no action", () => {
    const errs = validateStorySchema({ ...STORY, skills: [...STORY.skills, skillFor("combat" as ActionCategory), { ...skillFor("combat" as ActionCategory), id: "ghost_skill" }] });
    expect(errs.some((e) => /Skill "ghost_skill" is never used/.test(e))).toBe(true);
  });

  it("flags the wrong number of lethal resources when statMode != none", () => {
    const errs = validateStorySchema({ ...STORY, resources: STORY.resources.map((r) => ({ ...r, lethal: false })) });
    expect(errs.some((e) => /Exactly one resource must be marked lethal/.test(e))).toBe(true);
  });

  it('flags statMode "none" that still carries resources', () => {
    const errs = validateStorySchema({ ...STORY, statMode: "none" });
    expect(errs.some((e) => /must have no resources/.test(e))).toBe(true);
  });

  it("flags starting state granting an unknown item", () => {
    const errs = validateStorySchema({
      ...STORY,
      startingState: { ...STORY.startingState, inventory: [{ itemId: "phantom", qty: 1 }] },
    });
    expect(errs.some((e) => /unknown item "phantom"/.test(e))).toBe(true);
  });
});

describe("generateStorySchema — repair loop", () => {
  it("returns a cross-valid schema from all-valid first responses", async () => {
    const { router, counts } = phasedRouter({ a: [J(PHASE_A)], b: [J(PHASE_B)] });
    const out = await generateStorySchema(router, input);
    expect(validateStorySchema(out)).toEqual([]);
    expect(out.locked).toBe(false); // generate leaves it unlocked; freeze locks it
    expect(counts).toEqual({ a: 1, b: 1 });
  });

  it("repairs a Zod-invalid then non-JSON Phase A before succeeding", async () => {
    const { router, counts } = phasedRouter({
      a: ['{"statMode":"full"}', "I cannot comply.", J(PHASE_A)], // invalid, non-JSON, valid
      b: [J(PHASE_B)],
    });
    const out = await generateStorySchema(router, input);
    expect(validateStorySchema(out)).toEqual([]);
    expect(counts.a).toBe(3); // two repairs consumed
  });

  it("re-prompts Phase B when the assembled schema fails cross-validation, then succeeds", async () => {
    // First Phase B is Zod-valid but cross-invalid (a category stripped below the minimum).
    const crossInvalidB = { ...PHASE_B, actions: PHASE_B.actions.filter((a) => a.category !== "utility") };
    const { router, counts } = phasedRouter({ a: [J(PHASE_A)], b: [J(crossInvalidB), J(PHASE_B)] });
    const out = await generateStorySchema(router, input);
    expect(validateStorySchema(out)).toEqual([]);
    expect(counts.b).toBe(2); // one cross-validation repass
  });

  it("throws ModelOutputError naming the bootstrapper after exhausting schema repairs", async () => {
    const crossInvalidB = { ...PHASE_B, actions: PHASE_B.actions.filter((a) => a.category !== "utility") };
    const { router } = phasedRouter({ a: [J(PHASE_A)], b: [J(crossInvalidB)] }); // never fixes it
    await expect(generateStorySchema(router, input, { maxSchemaRepairs: 2 })).rejects.toMatchObject({
      name: "ModelOutputError",
      role: "bootstrapper",
    });
  });

  it("wraps the cross-validation errors into the thrown message", async () => {
    const crossInvalidB = { ...PHASE_B, actions: PHASE_B.actions.filter((a) => a.category !== "utility") };
    const { router } = phasedRouter({ a: [J(PHASE_A)], b: [J(crossInvalidB)] });
    const err = await generateStorySchema(router, input, { maxSchemaRepairs: 1 }).catch((e) => e as ModelOutputError);
    expect(err).toBeInstanceOf(ModelOutputError);
    expect((err as ModelOutputError).message).toMatch(/Category "utility"|cross-validation/i);
  });
});
