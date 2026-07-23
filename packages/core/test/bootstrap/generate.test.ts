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
import { generateStorySchema, PhaseASchema, PhaseBSchema } from "../../src/bootstrap/generate.js";
import {
  PHASE_A_SYSTEM,
  PHASE_B_ACTION_BATCH_SYSTEM,
  PHASE_B_FOUNDATION_SYSTEM,
} from "../../src/bootstrap/prompts.js";
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
    attributes: [
      { id: "might", name: "Might", abbrev: "MGT", description: "Raw capability.", defaultScore: 10 },
    ],
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
      attributes: { might: 12 },
      resources: { hp: 20, stamina: 10 },
      skills: [{ skillId: "combat_skill", rank: "novice" }],
      inventory: [{ itemId: "blade", qty: 1 }],
    },
    npcTemplates: [
      { templateId: "foe", name: "A Foe", attributes: { might: 11 }, resources: { hp: 10 }, skills: [{ skillId: "combat_skill", rank: "adept" }], inventory: [] },
    ],
    locked: false,
    ...overrides,
  };
  return StorySchemaSchema.parse(story);
}

const STORY = makeValidBootstrapSchema();
const PHASE_A = { statMode: STORY.statMode, attributes: STORY.attributes, resources: STORY.resources, tiers: STORY.tiers, skills: STORY.skills };
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
function phasedRouter(scripts: { a: string[]; b: string[] }): {
  router: Router;
  counts: { a: number; b: number };
  budgets: { a: Array<number | undefined>; b: Array<number | undefined> };
} {
  const counts = { a: 0, b: 0 };
  const budgets: { a: Array<number | undefined>; b: Array<number | undefined> } = { a: [], b: [] };
  let phaseBPass = -1;
  let phaseBSource = "";
  const router: Router = {
    bindingFor: () => ({ provider: "openrouter", model: "test", source: "recommended", samplersDirty: false }),
    async complete(_role, prompt: RolePrompt, options): Promise<ChatResponse> {
      const key = prompt.system.includes("PHASE A") ? "a" : "b";
      budgets[key].push(options?.maxTokens);
      const seq = scripts[key];
      if (key === "a") {
        const content = seq[Math.min(counts.a, seq.length - 1)] ?? "";
        counts.a++;
        return { content };
      }

      if (prompt.system.includes("PHASE B FOUNDATION")) {
        phaseBPass++;
        phaseBSource = seq[Math.min(phaseBPass, seq.length - 1)] ?? "";
      }
      counts.b++;
      try {
        const parsed = JSON.parse(phaseBSource) as typeof PHASE_B;
        if (prompt.system.includes("PHASE B FOUNDATION")) {
          return {
            content: J({
              items: parsed.items,
              startingState: parsed.startingState,
              npcTemplates: parsed.npcTemplates,
            }),
          };
        }
        const requested = prompt.user
          .match(/REQUESTED CATEGORIES: ([^\n]+)/)?.[1]
          ?.split(",")
          .map((category) => category.trim()) ?? [];
        return { content: J({ actions: parsed.actions.filter((action) => requested.includes(action.category)) }) };
      } catch {
        return { content: phaseBSource };
      }
    },
    async stream() {
      throw new Error("bootstrapper never streams");
    },
  };
  return { router, counts, budgets };
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
  it("gives models an explicit trainer-cost object contract", () => {
    expect(PHASE_A_SYSTEM).toContain('"method":"trainer"');
    expect(PHASE_A_SYSTEM).toContain('"cost":{"resources":{"resource_id":2}}');
    expect(PHASE_A_SYSTEM).toMatch(/Never use a bare number or string for cost/i);
  });

  it("keeps the large Phase B catalog concise and gives it a larger output budget", async () => {
    expect(PHASE_B_ACTION_BATCH_SYSTEM).toMatch(/exactly 4 concise actions/i);
    expect(PHASE_B_ACTION_BATCH_SYSTEM).toMatch(/12 words or fewer/i);
    const { router, budgets } = phasedRouter({ a: [J(PHASE_A)], b: [J(PHASE_B)] });
    await generateStorySchema(router, input);
    expect(budgets).toEqual({ a: [5000], b: [4000, 5000, 5000] });
  });

  it("splits Phase B into a foundation and bounded action batches", () => {
    expect(PHASE_B_FOUNDATION_SYSTEM).toMatch(/do not output actions/i);
    expect(PHASE_B_ACTION_BATCH_SYSTEM).toMatch(/exactly 4 concise actions/i);
    expect(PHASE_B_ACTION_BATCH_SYSTEM).toMatch(/no other categories/i);
  });

  it("gives models explicit skill-rank and item-quantity contracts", () => {
    expect(PHASE_B_FOUNDATION_SYSTEM).toContain('{"skillId":"existing_skill_id","rank":"novice"}');
    expect(PHASE_B_FOUNDATION_SYSTEM).toContain('{"itemId":"existing_item_id","qty":1}');
    expect(PHASE_B_ACTION_BATCH_SYSTEM).toContain('{"itemId":"existing_item_id","qty":1}');
  });

  it("normalizes the provider's numeric trainer cost without another model request", () => {
    const phaseAWithNumericCost = {
      ...PHASE_A,
      resources: [
        ...PHASE_A.resources,
        { id: "credits", label: "Credits", start: 100, max: 999, playerVisible: true },
      ],
      skills: PHASE_A.skills.map((skill, index) =>
        index === 0
          ? {
              ...skill,
              unlockPaths: [{ method: "trainer", npcHint: "A veteran", cost: 25 }],
            }
          : skill
      ),
    };
    const parsed = PhaseASchema.parse(phaseAWithNumericCost);
    expect(parsed.skills[0]?.unlockPaths[0]).toEqual({
      method: "trainer",
      npcHint: "A veteran",
      cost: { resources: { credits: 25 } },
    });
  });

  it("turns an ambiguous numeric trainer cost into a valid no-cost object", () => {
    const phaseAWithNumericCost = {
      ...PHASE_A,
      skills: PHASE_A.skills.map((skill, index) =>
        index === 0
          ? {
              ...skill,
              unlockPaths: [{ method: "trainer", npcHint: "A veteran", cost: 25 }],
            }
          : skill
      ),
    };
    const parsed = PhaseASchema.parse(phaseAWithNumericCost);
    expect(parsed.skills[0]?.unlockPaths[0]).toEqual({
      method: "trainer",
      npcHint: "A veteran",
      cost: {},
    });
  });

  it("normalizes safe Phase B shorthand without another model request", async () => {
    const phaseBWithShorthand = {
      ...PHASE_B,
      items: PHASE_B.items.map((item, index) =>
        index === 0
          ? {
              id: item.id,
              name: item.name,
              description: item.description,
              kind: item.kind,
              tier: item.tier,
            }
          : item
      ),
      startingState: {
        resources: PHASE_B.startingState.resources,
        skills: ["combat_skill"],
        inventory: ["blade", { itemId: "manual" }],
      },
      npcTemplates: [
        {
          templateId: "foe",
          name: "A Foe",
          resources: { hp: 10 },
          skills: [{ skillId: "combat_skill" }],
          inventory: [{ itemId: "blade" }],
        },
        {
          templateId: "bystander",
          name: "A Bystander",
        },
      ],
    };

    const parsed = PhaseBSchema.parse(phaseBWithShorthand);
    expect(parsed.items[0]?.props).toEqual({});
    expect(parsed.startingState.skills).toEqual([{ skillId: "combat_skill", rank: "novice" }]);
    expect(parsed.startingState.inventory).toEqual([
      { itemId: "blade", qty: 1 },
      { itemId: "manual", qty: 1 },
    ]);
    expect(parsed.npcTemplates[0]?.skills).toEqual([{ skillId: "combat_skill", rank: "novice" }]);
    expect(parsed.npcTemplates[0]?.inventory).toEqual([{ itemId: "blade", qty: 1 }]);
    expect(parsed.npcTemplates[1]).toMatchObject({ resources: {}, skills: [], inventory: [] });

    const { router, counts } = phasedRouter({ a: [J(PHASE_A)], b: [J(phaseBWithShorthand)] });
    const out = await generateStorySchema(router, input);
    expect(validateStorySchema(out)).toEqual([]);
    expect(counts).toEqual({ a: 1, b: 3 });
  });

  it("returns a cross-valid schema from all-valid first responses", async () => {
    const { router, counts } = phasedRouter({ a: [J(PHASE_A)], b: [J(PHASE_B)] });
    const phases: string[] = [];
    const out = await generateStorySchema(router, input, { onProgress: (phase) => phases.push(phase) });
    expect(validateStorySchema(out)).toEqual([]);
    expect(out.locked).toBe(false); // generate leaves it unlocked; freeze locks it
    expect(counts).toEqual({ a: 1, b: 3 });
    expect(phases).toEqual(["phase-a", "phase-b", "validate"]);
  });

  it("assigns missing skill and trial coverage without another model repair", async () => {
    const requiredFlags = ["survived_stack_ambush", "entered_the_sump"];
    const phaseAWithTrials = {
      ...PHASE_A,
      skills: PHASE_A.skills.map((skill, index) =>
        index < requiredFlags.length
          ? { ...skill, unlockPaths: [{ method: "trial" as const, flagId: requiredFlags[index]! }] }
          : skill
      ),
    };
    const phaseBWithoutCoverage = {
      ...PHASE_B,
      actions: PHASE_B.actions.map(({ requiresSkill: _omitted, ...action }) => action),
    };
    const { router, counts } = phasedRouter({
      a: [J(phaseAWithTrials)],
      b: [J(phaseBWithoutCoverage)],
    });

    const out = await generateStorySchema(router, input);
    const usedSkills = new Set(out.actions.flatMap((action) => action.requiresSkill ?? []));
    const trueFlags = new Set(
      out.actions.flatMap((action) =>
        Object.values(action.effects).flatMap((effect) =>
          effect.setFlag?.value ? [effect.setFlag.flagId] : []
        )
      )
    );

    expect(phaseAWithTrials.skills.every((skill) => usedSkills.has(skill.id))).toBe(true);
    expect(requiredFlags.every((flagId) => trueFlags.has(flagId))).toBe(true);
    expect(validateStorySchema(out)).toEqual([]);
    expect(counts).toEqual({ a: 1, b: 3 });
  });

  it("repairs a Zod-invalid then non-JSON Phase A before succeeding", async () => {
    const { router, counts } = phasedRouter({
      a: ['{"statMode":"full"}', "I cannot comply.", J(PHASE_A)], // invalid, non-JSON, valid
      b: [J(PHASE_B)],
    });
    const phases: string[] = [];
    const out = await generateStorySchema(router, input, { onProgress: (phase) => phases.push(phase) });
    expect(validateStorySchema(out)).toEqual([]);
    expect(counts.a).toBe(3); // two repairs consumed
    expect(phases).toEqual(["phase-a", "repair", "repair", "phase-b", "validate"]);
  });

  it("re-prompts Phase B when the assembled schema fails cross-validation, then succeeds", async () => {
    const crossInvalidB = {
      ...PHASE_B,
      actions: PHASE_B.actions.map((action, index) =>
        index === 0 ? { ...action, requiresSkill: "no_such_skill" } : action
      ),
    };
    const { router, counts } = phasedRouter({ a: [J(PHASE_A)], b: [J(crossInvalidB), J(PHASE_B)] });
    const out = await generateStorySchema(router, input);
    expect(validateStorySchema(out)).toEqual([]);
    expect(counts.b).toBe(6); // three bounded calls per pass, one cross-validation repass
  });

  it("throws ModelOutputError naming the bootstrapper after exhausting schema repairs", async () => {
    const crossInvalidB = {
      ...PHASE_B,
      actions: PHASE_B.actions.map((action, index) =>
        index === 0 ? { ...action, requiresSkill: "no_such_skill" } : action
      ),
    };
    const { router } = phasedRouter({ a: [J(PHASE_A)], b: [J(crossInvalidB)] }); // never fixes it
    await expect(generateStorySchema(router, input, { maxSchemaRepairs: 2 })).rejects.toMatchObject({
      name: "ModelOutputError",
      role: "bootstrapper",
    });
  });

  it("wraps the cross-validation errors into the thrown message", async () => {
    const crossInvalidB = {
      ...PHASE_B,
      actions: PHASE_B.actions.map((action, index) =>
        index === 0 ? { ...action, requiresSkill: "no_such_skill" } : action
      ),
    };
    const { router } = phasedRouter({ a: [J(PHASE_A)], b: [J(crossInvalidB)] });
    const err = await generateStorySchema(router, input, { maxSchemaRepairs: 1 }).catch((e) => e as ModelOutputError);
    expect(err).toBeInstanceOf(ModelOutputError);
    expect((err as ModelOutputError).message).toMatch(/no_such_skill|cross-validation/i);
  });
});
