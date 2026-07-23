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
import {
  generateStorySchema,
  BootstrapMacroEvaluationError,
  PhaseASchema,
  PhaseBSchema,
  type BootstrapProgressEvent,
  type BootstrapResumeState,
} from "../../src/bootstrap/generate.js";
import { parseCardObject } from "../../src/importer/index.js";
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

function universalFamily(category: ActionCategory): string {
  return {
    combat: "attack_melee",
    social: "influence",
    exploration: "search",
    crafting: "interact",
    utility: "wait",
  }[category];
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
        description: `A precise ${category} action.`,
        aliases: [`${category} option ${i}`],
        universalFamily: universalFamily(category),
        requiresSkill: `${category}_skill`,
        dc: 10 + i, // 10–13, inside 5–25
        ...(i === 0
          ? {
              advantageWhen: [
                {
                  condition: {
                    type: "resource" as const,
                    resourceId: "stamina",
                    min: 1,
                  },
                  reason: "Stamina remains",
                },
              ],
            }
          : {}),
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
      { id: "finesse", name: "Finesse", abbrev: "FIN", description: "Precision and speed.", defaultScore: 10 },
      { id: "insight", name: "Insight", abbrev: "INS", description: "Awareness and judgment.", defaultScore: 10 },
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
  prompts: RolePrompt[];
} {
  const counts = { a: 0, b: 0 };
  const budgets: { a: Array<number | undefined>; b: Array<number | undefined> } = { a: [], b: [] };
  let phaseBPass = -1;
  let phaseBSource = "";
  const prompts: RolePrompt[] = [];
  const router: Router = {
    bindingFor: () => ({ provider: "openrouter", model: "test", source: "recommended", samplersDirty: false }),
    async complete(_role, prompt: RolePrompt, options): Promise<ChatResponse> {
      prompts.push(prompt);
      const key = prompt.system.includes("PHASE A") ? "a" : "b";
      budgets[key].push(options?.maxTokens);
      const seq = scripts[key];
      if (key === "a") {
        const content = seq[Math.min(counts.a, seq.length - 1)] ?? "";
        counts.a++;
        return { content };
      }

      const foundationRequest = prompt.system.includes("PHASE B FOUNDATION");
      const requested = foundationRequest
        ? []
        : prompt.user
            .match(/REQUESTED CATEGORIES: ([^\n]+)/)?.[1]
            ?.split(",")
            .map((category) => category.trim()) ?? [];
      if (foundationRequest && phaseBPass < 0) {
        phaseBSource = seq[0] ?? "";
      } else if (requested.includes("combat")) {
        phaseBPass++;
        phaseBSource = seq[Math.min(phaseBPass, seq.length - 1)] ?? "";
      }
      counts.b++;
      try {
        const parsed = JSON.parse(phaseBSource) as typeof PHASE_B;
        if (foundationRequest) {
          return {
            content: J({
              items: parsed.items,
              startingState: parsed.startingState,
              npcTemplates: parsed.npcTemplates,
            }),
          };
        }
        return { content: J({ actions: parsed.actions.filter((action) => requested.includes(action.category)) }) };
      } catch {
        return { content: phaseBSource };
      }
    },
    async stream() {
      throw new Error("bootstrapper never streams");
    },
  };
  return { router, counts, budgets, prompts };
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

  it("treats 25% condition coverage as guidance while enforcing the 33% cap", () => {
    const withoutConditions = STORY.actions.map((action) => ({
      ...action,
      advantageWhen: undefined,
      disadvantageWhen: undefined,
    }));
    expect(validateStorySchema({ ...STORY, actions: withoutConditions })).toEqual([]);

    const overConditioned = STORY.actions.map((action, index) => ({
      ...action,
      advantageWhen:
        index < 7
          ? [
              {
                condition: {
                  type: "resource" as const,
                  resourceId: "stamina",
                  min: 1,
                },
                reason: "Stamina remains",
              },
            ]
          : undefined,
    }));
    expect(
      validateStorySchema({ ...STORY, actions: overConditioned }).some(
        (error) => /Conditional action coverage.*at most 6 actions/i.test(error)
      )
    ).toBe(true);
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

  it("validates every advantage/disadvantage condition reference", () => {
    const [first, ...rest] = STORY.actions;
    const errs = validateStorySchema({
      ...STORY,
      actions: [{
        ...first!,
        advantageWhen: [
          {
            condition: { type: "skill", skillId: "unknown_skill" },
            reason: "Special training",
          },
          {
            condition: { type: "flag", flagId: "never_caused", value: true },
            reason: "Hidden",
          },
        ],
        disadvantageWhen: [
          {
            condition: { type: "resource", resourceId: "unknown_resource", min: 1 },
            reason: "Well supplied",
          },
          {
            condition: { type: "attribute", attributeId: "unknown_attribute", min: 12 },
            reason: "Naturally capable",
          },
        ],
      }, ...rest],
    });

    expect(errs).toEqual(expect.arrayContaining([
      expect.stringMatching(/advantageWhen\[0\].*unknown skill "unknown_skill"/),
      expect.stringMatching(/advantageWhen\[1\].*dead flag "never_caused"/),
      expect.stringMatching(/disadvantageWhen\[0\].*unknown resource "unknown_resource"/),
      expect.stringMatching(/disadvantageWhen\[1\].*unknown attribute "unknown_attribute"/),
    ]));
  });

  it("enforces condition-list and player-facing reason bounds at freeze validation", () => {
    const [first, ...rest] = STORY.actions;
    const repeated = {
      condition: { type: "skill" as const, skillId: "combat_skill" },
      reason: "A".repeat(41),
    };
    const errs = validateStorySchema({
      ...STORY,
      actions: [{
        ...first!,
        advantageWhen: [repeated, repeated, repeated],
        disadvantageWhen: [{
          condition: { type: "resource", resourceId: "hp", min: 1 },
          reason: "   ",
        }],
      }, ...rest],
    });

    expect(errs).toEqual(expect.arrayContaining([
      expect.stringMatching(/advantageWhen has 3 entries; at most 2/i),
      expect.stringMatching(/reason exceeds 40 characters/i),
      expect.stringMatching(/reason must be a non-empty/i),
    ]));
  });

  it("accepts causable flags and rejects forge-time ids for on-demand V7 equipment", () => {
    const [conditioned, setter, ...rest] = STORY.actions;
    const causableActions: ActionDef[] = [
      {
        ...conditioned!,
        advantageWhen: [{
          condition: { type: "flag", flagId: "hidden", value: true },
          reason: "Hidden",
        }],
      },
      {
        ...setter!,
        effects: {
          ...setter!.effects,
          success: {
            ...setter!.effects.success,
            setFlag: { flagId: "hidden", value: true },
          },
        },
      },
      ...rest,
    ];
    expect(
      validateStorySchema({ ...STORY, actions: causableActions })
        .filter((error) => /advantageWhen|hidden/.test(error))
    ).toEqual([]);

    const runtimeItemErrors = validateStorySchema({
      ...STORY,
      schemaVersion: 2,
      items: [],
      actions: causableActions.map((action, index) =>
        index === 0
          ? {
              ...action,
              advantageWhen: [{
                condition: { type: "item" as const, itemId: "future_blade" },
                reason: "Armed",
              }],
            }
          : action
      ),
    });
    expect(runtimeItemErrors).toEqual(expect.arrayContaining([
      expect.stringMatching(/item "future_blade".*created on demand.*requiresItemKind/i),
    ]));
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
    const { router, budgets, prompts } = phasedRouter({
      a: [J(PHASE_A)],
      b: [J(PHASE_B)],
    });
    await generateStorySchema(router, input);
    expect(budgets).toEqual({ a: [5000], b: [3000, 5000, 5000] });
    const actionPrompts = prompts.filter((prompt) =>
      prompt.system.includes("PHASE B ACTION BATCH")
    );
    expect(actionPrompts).toHaveLength(2);
    expect(actionPrompts.map((prompt) =>
      prompt.user.match(/CONDITIONAL ACTION TARGET: exactly (\d+)/)?.[1]
    )).toEqual(["2", "3"]);
    expect(
      actionPrompts.every((prompt) =>
        prompt.user.includes("MUST be set by an action effect in this same batch")
      )
    ).toBe(true);
  });

  it("splits Phase B into a foundation and bounded action batches", () => {
    expect(PHASE_B_FOUNDATION_SYSTEM).toMatch(/do not output actions/i);
    expect(PHASE_B_ACTION_BATCH_SYSTEM).toMatch(/exactly 4 concise actions/i);
    expect(PHASE_B_ACTION_BATCH_SYSTEM).toMatch(/no other categories/i);
  });

  it("runs the independent foundation and action batches in one concurrent Phase B stage", async () => {
    let activePhaseBCalls = 0;
    let maximumConcurrentPhaseBCalls = 0;
    let releasePhaseB!: () => void;
    const phaseBGate = new Promise<void>((resolve) => {
      releasePhaseB = resolve;
    });
    const fallbackRelease = setTimeout(releasePhaseB, 250);
    const router: Router = {
      bindingFor: () => ({
        provider: "openrouter",
        model: "test",
        source: "recommended",
        samplersDirty: false,
      }),
      async complete(_role, prompt): Promise<ChatResponse> {
        if (prompt.system.includes("PHASE A")) return { content: J(PHASE_A) };
        const foundationRequest = prompt.system.includes("PHASE B FOUNDATION");
        const requested =
          foundationRequest
            ? []
            : prompt.user
                .match(/REQUESTED CATEGORIES: ([^\n]+)/)?.[1]
                ?.split(",")
                .map((category) => category.trim()) ?? [];
        activePhaseBCalls++;
        maximumConcurrentPhaseBCalls = Math.max(
          maximumConcurrentPhaseBCalls,
          activePhaseBCalls
        );
        if (activePhaseBCalls === 3) releasePhaseB();
        await phaseBGate;
        activePhaseBCalls--;
        if (foundationRequest) {
          return {
            content: J({
              startingState: PHASE_B.startingState,
              npcTemplates: PHASE_B.npcTemplates,
            }),
          };
        }
        return {
          content: J({
            actions: PHASE_B.actions.filter((action) =>
              requested.includes(action.category)
            ),
          }),
        };
      },
      async stream() {
        throw new Error("bootstrapper never streams");
      },
    };

    const out = await generateStorySchema(router, input);
    clearTimeout(fallbackRelease);

    expect(validateStorySchema(out)).toEqual([]);
    expect(maximumConcurrentPhaseBCalls).toBe(3);
  });

  it("gives models explicit skill-rank and on-demand-loot contracts", () => {
    expect(PHASE_B_FOUNDATION_SYSTEM).toContain('{"skillId":"existing_skill_id","rank":"novice"}');
    expect(PHASE_B_FOUNDATION_SYSTEM).toMatch(/inventory MUST be empty arrays/i);
    expect(PHASE_B_FOUNDATION_SYSTEM).toMatch(/never generated during story creation/i);
    expect(PHASE_B_ACTION_BATCH_SYSTEM).toMatch(/Do not grant or consume item ids/i);
    expect(PHASE_B_ACTION_BATCH_SYSTEM).toMatch(/roughly 25-33%/i);
    expect(PHASE_B_ACTION_BATCH_SYSTEM).toMatch(/at most 2/i);
    expect(PHASE_B_ACTION_BATCH_SYSTEM).toMatch(/40 characters or fewer/i);
    expect(PHASE_B_ACTION_BATCH_SYSTEM).toMatch(/never invent an unreachable flag/i);
    expect(PHASE_B_ACTION_BATCH_SYSTEM).toMatch(
      /Do not emit item-id conditions.*generated on demand/is
    );
    expect(PHASE_A_SYSTEM).toContain('{"type":"flag","flagId":"flag_id","value":true}');
    expect(PHASE_B_ACTION_BATCH_SYSTEM).toContain(
      '{"type":"resource","resourceId":"resource_id","min":1}'
    );
    expect(PHASE_B_ACTION_BATCH_SYSTEM).toMatch(
      /Never omit flag value or resource\/attribute min/i
    );
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

  it("normalizes missing deterministic prerequisite fields and drops ambiguous predicates", () => {
    const parsed = PhaseASchema.parse({
      ...PHASE_A,
      skills: PHASE_A.skills.map((skill, index) =>
        index === 0
          ? {
              ...skill,
              prerequisites: [
                { type: "flag", flagId: "training_complete" },
                { type: "resource", resourceId: "stamina" },
                { type: "attribute", attributeId: "might" },
                { type: "resource" },
              ],
            }
          : skill
      ),
    });

    expect(parsed.skills[0]?.prerequisites).toEqual([
      { type: "flag", flagId: "training_complete", value: true },
      { type: "resource", resourceId: "stamina", min: 1 },
      { type: "attribute", attributeId: "might", min: 10 },
    ]);
  });

  it("accepts missing prerequisite thresholds on the first Phase A response", async () => {
    const nearValidPhaseA = {
      ...PHASE_A,
      skills: PHASE_A.skills.map((skill, index) =>
        index === 0
          ? {
              ...skill,
              prerequisites: [
                { type: "resource", resourceId: "stamina" },
                { type: "attribute", attributeId: "might" },
              ],
            }
          : skill
      ),
    };
    const { router, counts } = phasedRouter({
      a: [J(nearValidPhaseA)],
      b: [J(PHASE_B)],
    });

    const out = await generateStorySchema(router, input);

    expect(validateStorySchema(out)).toEqual([]);
    expect(counts).toEqual({ a: 1, b: 3 });
    expect(out.skills[0]?.prerequisites).toEqual([
      { type: "resource", resourceId: "stamina", min: 1 },
      { type: "attribute", attributeId: "might", min: 10 },
    ]);
  });

  it("normalizes the exact missing condition fields seen in forge diagnostics", () => {
    const malformed = JSON.parse(J(PHASE_B)) as typeof PHASE_B;
    malformed.actions[1]!.advantageWhen = [{
      condition: { type: "flag", flagId: "prepared" } as never,
      reason: "Prepared",
    }];
    malformed.actions[4]!.advantageWhen = [{
      condition: { type: "flag", flagId: "prepared" } as never,
      reason: "Prepared",
    }];
    malformed.actions[6]!.disadvantageWhen = [{
      condition: { type: "resource", resourceId: "stamina" } as never,
      reason: "Low stamina",
    }];
    malformed.actions[9]!.advantageWhen = [{
      condition: { type: "flag", flagId: "prepared" } as never,
      reason: "Prepared",
    }];
    malformed.actions[10]!.advantageWhen = [{
      condition: { type: "flag", flagId: "prepared" } as never,
      reason: "Prepared",
    }];

    const parsed = PhaseBSchema.parse(malformed);

    expect(parsed.actions[1]?.advantageWhen?.[0]?.condition).toEqual({
      type: "flag",
      flagId: "prepared",
      value: true,
    });
    expect(parsed.actions[6]?.disadvantageWhen?.[0]?.condition).toEqual({
      type: "resource",
      resourceId: "stamina",
      min: 1,
    });
    expect(parsed.actions[10]?.advantageWhen?.[0]?.condition).toMatchObject({
      value: true,
    });
  });

  it("accepts a near-valid condition response on the first request without model repair", async () => {
    const nearValid = JSON.parse(J(PHASE_B)) as typeof PHASE_B;
    nearValid.actions[0]!.advantageWhen = [{
      condition: { type: "flag", flagId: "prepared" } as never,
      reason: "Prepared",
    }];
    nearValid.actions[0]!.disadvantageWhen = [{
      condition: { type: "resource", resourceId: "stamina" } as never,
      reason: "Low stamina",
    }];
    nearValid.actions[1]!.effects.success = {
      ...nearValid.actions[1]!.effects.success,
      setFlag: { flagId: "prepared", value: true },
    };
    const { router, counts } = phasedRouter({
      a: [J(PHASE_A)],
      b: [J(nearValid)],
    });

    const out = await generateStorySchema(router, input);

    expect(validateStorySchema(out)).toEqual([]);
    expect(counts).toEqual({ a: 1, b: 3 });
    expect(out.actions[0]?.advantageWhen?.[0]?.condition).toMatchObject({
      type: "flag",
      value: true,
    });
    expect(out.actions[0]?.disadvantageWhen?.[0]?.condition).toMatchObject({
      type: "resource",
      min: 1,
    });
  });

  it("stabilizes the exact initial-forge coverage and dead-flag failure without repair", async () => {
    const screenshotFailure = JSON.parse(J(PHASE_B)) as typeof PHASE_B;
    const deadConditions = [
      {
        index: 9,
        id: "exploration_survey_enemy_lines",
        flagId: "terrain_scouted",
      },
      {
        index: 13,
        id: "crafting_repair_gear",
        flagId: "blade_forged",
      },
      {
        index: 17,
        id: "utility_rally_squad",
        flagId: "position_fortified",
      },
      {
        index: 18,
        id: "utility_direct_maneuver",
        flagId: "enemy_weakness_found",
      },
    ];
    for (const { index, id, flagId } of deadConditions) {
      const action = screenshotFailure.actions[index]!;
      action.id = id;
      action.advantageWhen = [{
        condition: { type: "flag", flagId, value: true },
        reason: "Tactical setup",
      }];
      action.disadvantageWhen = [{
        condition: { type: "resource", resourceId: "stamina", min: 1 },
        reason: "Low stamina",
      }];
    }
    const { router, counts } = phasedRouter({
      a: [J(PHASE_A)],
      b: [J(screenshotFailure)],
    });

    const out = await generateStorySchema(router, input);
    const conditioned = out.actions.filter((action) =>
      (action.advantageWhen?.length ?? 0) > 0 ||
      (action.disadvantageWhen?.length ?? 0) > 0
    );
    const referencedFlags = new Set(
      out.actions.flatMap((action) =>
        [...(action.advantageWhen ?? []), ...(action.disadvantageWhen ?? [])]
          .flatMap((entry) =>
            entry.condition.type === "flag" ? [entry.condition.flagId] : []
          )
      )
    );

    expect(conditioned).toHaveLength(6);
    expect(
      deadConditions.every(({ flagId }) => !referencedFlags.has(flagId))
    ).toBe(true);
    expect(validateStorySchema(out)).toEqual([]);
    expect(counts).toEqual({ a: 1, b: 3 });
  });

  it("stabilizes the exact regeneration failure while retaining minimum valid coverage", async () => {
    const screenshotFailure = JSON.parse(J(PHASE_B)) as typeof PHASE_B;
    const deadConditions = [
      {
        index: 8,
        id: "exploration_sense_aura_flow",
        flagId: "terrain_mapped",
      },
      {
        index: 9,
        id: "exploration_track_quarry",
        flagId: "aura_detected",
      },
      {
        index: 17,
        id: "utility_read_opponent",
        flagId: "aura_detected",
      },
      {
        index: 18,
        id: "utility_channel_ren_intimidate",
        flagId: "ren_refined",
      },
    ];
    for (const { index, id, flagId } of deadConditions) {
      const action = screenshotFailure.actions[index]!;
      action.id = id;
      action.advantageWhen = [{
        condition: { type: "flag", flagId, value: true },
        reason: "Prepared state",
      }];
      action.disadvantageWhen =
        index === 8
          ? [{
              condition: {
                type: "resource",
                resourceId: "stamina",
                min: 1,
              },
              reason: "Low stamina",
            }]
          : undefined;
    }
    const effectsBefore = screenshotFailure.actions.map((action) => action.effects);
    const { router, counts } = phasedRouter({
      a: [J(PHASE_A)],
      b: [J(screenshotFailure)],
    });

    const out = await generateStorySchema(router, input);
    const conditioned = out.actions.filter((action) =>
      (action.advantageWhen?.length ?? 0) > 0 ||
      (action.disadvantageWhen?.length ?? 0) > 0
    );
    const terrainCondition = out.actions
      .find((action) => action.id === "exploration_sense_aura_flow")
      ?.advantageWhen?.[0]?.condition;
    const setFlags = new Set(
      out.actions.flatMap((action) =>
        Object.values(action.effects).flatMap((effect) =>
          effect.setFlag?.value ? [effect.setFlag.flagId] : []
        )
      )
    );
    const remainingDeadFlags = out.actions.flatMap((action) =>
      [...(action.advantageWhen ?? []), ...(action.disadvantageWhen ?? [])]
        .flatMap((entry) =>
          entry.condition.type === "flag" &&
          !setFlags.has(entry.condition.flagId)
            ? [entry.condition.flagId]
            : []
        )
    );

    expect(conditioned).toHaveLength(5);
    expect(terrainCondition).toBeUndefined();
    expect(setFlags.has("terrain_mapped")).toBe(false);
    expect(remainingDeadFlags).toEqual([]);
    expect(out.actions.map((action) => action.effects)).toEqual(effectsBefore);
    expect(validateStorySchema(out)).toEqual([]);
    expect(counts).toEqual({ a: 1, b: 3 });
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
    expect(parsed.items).toEqual([]);
    expect(parsed.startingState.skills).toEqual([{ skillId: "combat_skill", rank: "novice" }]);
    expect(parsed.startingState.inventory).toEqual([]);
    expect(parsed.npcTemplates[0]?.skills).toEqual([{ skillId: "combat_skill", rank: "novice" }]);
    expect(parsed.npcTemplates[0]?.inventory).toEqual([]);
    expect(parsed.npcTemplates[1]).toMatchObject({ resources: {}, skills: [], inventory: [] });

    const { router, counts } = phasedRouter({ a: [J(PHASE_A)], b: [J(phaseBWithShorthand)] });
    const out = await generateStorySchema(router, input);
    expect(validateStorySchema(out)).toEqual([]);
    expect(counts).toEqual({ a: 1, b: 3 });
  });

  it("returns a cross-valid schema from all-valid first responses", async () => {
    const { router, counts } = phasedRouter({ a: [J(PHASE_A)], b: [J(PHASE_B)] });
    const phases: string[] = [];
    const details: BootstrapProgressEvent[] = [];
    const out = await generateStorySchema(router, input, {
      onProgress: (phase) => phases.push(phase),
      onProgressDetail: (event) => details.push(event),
    });
    expect(validateStorySchema(out)).toEqual([]);
    expect(out.locked).toBe(false); // generate leaves it unlocked; freeze locks it
    expect(counts).toEqual({ a: 1, b: 3 });
    expect(phases).toEqual(["phase-a", "phase-b", "validate"]);
    const completedModelFragments = details.filter((event) =>
      event.status === "completed" &&
      [
        "mechanics-core",
        "actor-foundation",
        "actions-combat-social",
        "actions-exploration-crafting-utility",
      ].includes(event.fragment)
    );
    expect(completedModelFragments).toHaveLength(4);
    expect(
      completedModelFragments
        .every((event) => typeof event.durationMs === "number" && event.durationMs >= 0)
    ).toBe(true);
  });

  it("emits a V2 rulebook with no pregenerated items or starting gear", async () => {
    const { router } = phasedRouter({ a: [J(PHASE_A)], b: [J(PHASE_B)] });
    const out = await generateStorySchema(router, input);
    expect(out.schemaVersion).toBe(2);
    expect(out.items).toEqual([]);
    expect(out.startingState.inventory).toEqual([]);
    expect(out.npcTemplates.every((template) => template.inventory.length === 0)).toBe(true);
    expect(out.actionBudget).toBe(2);
    expect(out.mechanicsConfigVersions).toEqual({
      universalActions: 1,
      progression: 1,
      equipmentLoot: 1,
    });
  });

  it("uses the attached persona and deterministically preserves accepted card attributes", async () => {
    const { router, prompts } = phasedRouter({ a: [J(PHASE_A)], b: [J(PHASE_B)] });
    const out = await generateStorySchema(router, {
      ...input,
      persona: {
        id: "persona-ari",
        name: "Ari",
        description: "A careful infiltrator with a strong moral code.",
      },
      acceptImportedMechanics: true,
      importedMechanics: {
        version: 1,
        accepted: false,
        reviewRequired: true,
        attributes: [{
          id: "might",
          name: "Might",
          abbrev: "PWR",
          score: 18,
          description: "Card-authored physical power.",
          locked: false,
          superhuman: false,
          provenance: {
            kind: "card-extension",
            path: "data.extensions.midnight_tavern.mechanics.attributes[0]",
            cardSpec: "chara_card_v2",
            cardSpecVersion: "2.0",
          },
        }],
        skills: [],
        actions: [],
        warnings: [],
      },
    });
    expect(out.attributes.find((attribute) => attribute.id === "might")).toMatchObject({
      name: "Might",
      abbrev: "PWR",
      defaultScore: 18,
      provenance: "imported",
    });
    expect(out.startingState.attributes.might).toBe(18);
    expect(prompts.some((prompt) => prompt.user.includes("persona-ari"))).toBe(true);
    expect(prompts.some((prompt) => prompt.user.includes("USER-REVIEWED IMPORTED MECHANICS"))).toBe(true);
  });

  it("reevaluates preserved card macros immediately before prompt assembly", async () => {
    const sourceCard = parseCardObject({
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: "Mara",
        description: "{{char}} trusts {{user}}.",
        personality: "Watchful",
        scenario: "{{user}} arrives at midnight.",
        extensions: {
          midnight_tavern: {
            mechanics: {
              attributes: [
                { id: "might", name: "Might", score: 18 },
              ],
            },
          },
        },
      },
    });
    const { router, prompts } = phasedRouter({
      a: [J(PHASE_A)],
      b: [J(PHASE_B)],
    });

    const out = await generateStorySchema(router, {
      ...input,
      premise: "Stale import preview that must not reach a model.",
      persona: {
        id: "persona-ari",
        name: "Ari",
        description: "A patient investigator.",
      },
      sourceCard,
      acceptImportedMechanics: true,
    });

    expect(out.premise).toContain("Mara trusts Ari.");
    expect(out.premise).toContain("Ari arrives at midnight.");
    expect(out.attributes.find((attribute) => attribute.id === "might")).toMatchObject({
      defaultScore: 18,
      provenance: "imported",
    });
    expect(prompts.every((prompt) => !prompt.user.includes("Stale import preview"))).toBe(true);
    expect(sourceCard.data.description).toBe("{{char}} trusts {{user}}.");
  });

  it("preserves unknown macros in optional source-card fields without blocking", async () => {
    const sourceCard = parseCardObject({
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: "Mara",
        scenario: "{{unknownExtensionMacro::x}}",
      },
    });
    const { router, counts } = phasedRouter({
      a: [J(PHASE_A)],
      b: [J(PHASE_B)],
    });

    const out = await generateStorySchema(router, { ...input, sourceCard });
    expect(out.premise).toContain("{{unknownExtensionMacro::x}}");
    expect(counts).toEqual({ a: 1, b: 3 });
  });

  it("blocks macro failures in a required source-card field before model calls", async () => {
    const sourceCard = parseCardObject({
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: "{{unknownCharacterName::x}}",
        scenario: "A valid optional scenario.",
      },
    });
    const { router, counts } = phasedRouter({
      a: [J(PHASE_A)],
      b: [J(PHASE_B)],
    });

    await expect(
      generateStorySchema(router, { ...input, sourceCard })
    ).rejects.toBeInstanceOf(BootstrapMacroEvaluationError);
    expect(counts).toEqual({ a: 0, b: 0 });
  });

  it("checkpoints validated fragments and resumes without repeating model calls", async () => {
    const first = phasedRouter({ a: [J(PHASE_A)], b: [J(PHASE_B)] });
    let checkpoint: BootstrapResumeState | undefined;
    const detail: string[] = [];
    const original = await generateStorySchema(first.router, input, {
      onCheckpoint: (value) => {
        checkpoint = value;
      },
      onProgressDetail: (event) => detail.push(`${event.fragment}:${event.status}`),
    });
    expect(detail).toEqual(expect.arrayContaining([
      "mechanics-core:running",
      "mechanics-core:completed",
      "actor-foundation:completed",
      "actions-combat-social:completed",
      "actions-exploration-crafting-utility:completed",
      "cross-validation:completed",
    ]));
    expect(checkpoint?.phaseA).toBeTruthy();
    expect(checkpoint?.foundation).toBeTruthy();
    expect(checkpoint?.actionBatches).toBeTruthy();
    expect(checkpoint?.sourceFingerprint).toMatch(/^bootstrap-v1-/);

    const resumed = phasedRouter({ a: [], b: [] });
    const replay = await generateStorySchema(resumed.router, input, {
      resume: checkpoint!,
    });
    expect(resumed.counts).toEqual({ a: 0, b: 0 });
    expect(replay).toEqual(original);

    const duplicateResume = phasedRouter({ a: [], b: [] });
    const duplicateReplay = await generateStorySchema(
      duplicateResume.router,
      { ...input, storyId: "regenerated-copy-id" },
      { resume: checkpoint! }
    );
    expect(duplicateResume.counts).toEqual({ a: 0, b: 0 });
    expect(duplicateReplay.storyId).toBe("regenerated-copy-id");
  });

  it("discards a valid-shaped checkpoint when its creation source changed", async () => {
    const first = phasedRouter({ a: [J(PHASE_A)], b: [J(PHASE_B)] });
    let checkpoint: BootstrapResumeState | undefined;
    await generateStorySchema(first.router, input, {
      onCheckpoint: (value) => {
        checkpoint = value;
      },
    });

    const changed = phasedRouter({ a: [J(PHASE_A)], b: [J(PHASE_B)] });
    const out = await generateStorySchema(
      changed.router,
      { ...input, premise: "A materially different premise." },
      { resume: checkpoint! }
    );

    expect(out.premise).toBe("A materially different premise.");
    expect(changed.counts).toEqual({ a: 1, b: 3 });
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
    const details: BootstrapProgressEvent[] = [];
    const out = await generateStorySchema(router, input, {
      onProgress: (phase) => phases.push(phase),
      onProgressDetail: (event) => details.push(event),
    });
    expect(validateStorySchema(out)).toEqual([]);
    expect(counts.a).toBe(3); // two repairs consumed
    expect(phases).toEqual(["phase-a", "repair", "repair", "phase-b", "validate"]);
    const repairDetails = details.filter((event) => event.status === "retrying");
    expect(repairDetails).toHaveLength(2);
    expect(
      repairDetails
        .every((event) =>
          Boolean(event.validationSummary) &&
          event.validationSummary!.length <= 600 &&
          event.message.includes(event.validationSummary!)
        )
    ).toBe(true);
  });

  it("re-prompts Phase B when the assembled schema fails cross-validation, then succeeds", async () => {
    const crossInvalidB = {
      ...PHASE_B,
      actions: PHASE_B.actions.map((action, index) =>
        index === 0 ? { ...action, governingAttribute: "no_such_attribute" } : action
      ),
    };
    const { router, counts } = phasedRouter({ a: [J(PHASE_A)], b: [J(crossInvalidB), J(PHASE_B)] });
    const out = await generateStorySchema(router, input);
    expect(validateStorySchema(out)).toEqual([]);
    expect(counts.b).toBe(4); // foundation + two initial batches + only the affected batch
  });

  it("throws ModelOutputError naming the bootstrapper after exhausting schema repairs", async () => {
    const crossInvalidB = {
      ...PHASE_B,
      actions: PHASE_B.actions.map((action, index) =>
        index === 0 ? { ...action, governingAttribute: "no_such_attribute" } : action
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
        index === 0 ? { ...action, governingAttribute: "no_such_attribute" } : action
      ),
    };
    const { router } = phasedRouter({ a: [J(PHASE_A)], b: [J(crossInvalidB)] });
    const err = await generateStorySchema(router, input, { maxSchemaRepairs: 1 }).catch((e) => e as ModelOutputError);
    expect(err).toBeInstanceOf(ModelOutputError);
    expect((err as ModelOutputError).message).toMatch(/no_such_attribute|cross-validation/i);
  });
});
