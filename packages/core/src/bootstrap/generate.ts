/**
 * Two-phase story bootstrapping (low-level-plan §M5.1, §8.5).
 *
 * A premise becomes a complete frozen StorySchema in two logical phases. Phase A defines
 * the world shape. Phase B uses one foundation call plus bounded action batches so large
 * catalogs remain below provider output ceilings.
 *
 * Each structured component has its own Zod schema and repair budget inside `callStructured`.
 * After assembly the whole thing goes through `validateStorySchema` (the cross-cutting
 * invariants Zod can't see); any errors drive one more repair pass on Phase B with the
 * exact messages, up to `maxSchemaRepairs`. On exhaustion we throw so the UI surfaces the
 * honest "try a recommended model" path — never a silently-broken story.
 */
import { z } from "zod";
import { callStructured, ModelOutputError, type Router } from "../router/index.js";
import {
  ActionDefSchema,
  AttributeDefSchema,
  ResourceDefSchema,
  SkillDefSchema,
  ItemDefSchema,
  TierDefSchema,
  StartingStateSchema,
  NpcTemplateSchema,
  StatModeSchema,
  StorySchemaSchema,
  CATALOG_MIN_ACTIONS,
  type ActionDef,
  type ActionCategory,
  type StorySchema,
  type StatMode,
} from "../types/index.js";
import { validateStorySchema } from "./validate.js";
import {
  PHASE_A_SYSTEM,
  PHASE_B_ACTION_BATCH_SYSTEM,
  PHASE_B_FOUNDATION_SYSTEM,
  buildPhaseAUser,
  buildPhaseBActionBatchUser,
  buildPhaseBFoundationUser,
} from "./prompts.js";

const MONEY_RESOURCE = /^(?:credits?|currency|coins?|gold|money|cash|funds?|wealth)$/i;
const ACTION_BATCHES: readonly (readonly ActionCategory[])[] = [
  ["combat", "social"],
  ["exploration", "crafting", "utility"],
];
const ACTIONS_PER_CATEGORY = CATALOG_MIN_ACTIONS / 5;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePhaseA(value: unknown): unknown {
  if (!record(value) || !Array.isArray(value.skills)) return value;
  const resources = Array.isArray(value.resources) ? value.resources : [];
  const currencyId = resources.find(
    (resource) => record(resource) && typeof resource.id === "string" && MONEY_RESOURCE.test(resource.id)
  );
  const usableCurrencyId = record(currencyId) && typeof currencyId.id === "string" ? currencyId.id : undefined;
  let changed = false;
  const skills = value.skills.map((skill) => {
    if (!record(skill) || !Array.isArray(skill.unlockPaths)) return skill;
    const unlockPaths = skill.unlockPaths.map((path) => {
      if (
        !record(path) ||
        path.method !== "trainer" ||
        typeof path.cost !== "number" ||
        !Number.isFinite(path.cost)
      ) {
        return path;
      }
      changed = true;
      const amount = Math.max(0, path.cost);
      return {
        ...path,
        cost: usableCurrencyId ? { resources: { [usableCurrencyId]: amount } } : {},
      };
    });
    return { ...skill, unlockPaths };
  });
  const normalized = { ...value, attributes: value.attributes ?? [], skills };
  return changed || value.attributes === undefined ? normalized : value;
}

function normalizeQuantityEntry(value: unknown): unknown {
  if (typeof value === "string") return { itemId: value, qty: 1 };
  if (!record(value) || typeof value.itemId !== "string" || value.qty !== undefined) return value;
  return { ...value, qty: 1 };
}

function normalizeQuantityList(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map(normalizeQuantityEntry);
}

function normalizeSkillGrant(value: unknown): unknown {
  if (typeof value === "string") return { skillId: value, rank: "novice" };
  if (!record(value) || typeof value.skillId !== "string" || value.rank !== undefined) return value;
  return { ...value, rank: "novice" };
}

function normalizeActorState(value: unknown): unknown {
  if (!record(value)) return value;
  return {
    ...value,
    attributes: value.attributes === undefined ? {} : value.attributes,
    resources: value.resources === undefined ? {} : value.resources,
    skills: value.skills === undefined
      ? []
      : Array.isArray(value.skills)
        ? value.skills.map(normalizeSkillGrant)
        : value.skills,
    inventory: value.inventory === undefined ? [] : normalizeQuantityList(value.inventory),
  };
}

function normalizeAction(value: unknown): unknown {
  if (!record(value)) return value;
  const costs = record(value.costs) && value.costs.items !== undefined
    ? { ...value.costs, items: normalizeQuantityList(value.costs.items) }
    : value.costs;
  const effects = record(value.effects)
    ? Object.fromEntries(
        Object.entries(value.effects).map(([outcome, effect]) => [
          outcome,
          record(effect) && effect.grantItem !== undefined
            ? { ...effect, grantItem: normalizeQuantityEntry(effect.grantItem) }
            : effect,
        ])
      )
    : value.effects;
  return { ...value, costs, effects };
}

function normalizePhaseB(value: unknown): unknown {
  if (!record(value)) return value;
  return {
    ...value,
    items: Array.isArray(value.items)
      ? value.items.map((item) =>
          record(item) && item.props === undefined ? { ...item, props: {} } : item
        )
      : value.items,
    actions: Array.isArray(value.actions) ? value.actions.map(normalizeAction) : value.actions,
    startingState: normalizeActorState(value.startingState),
    npcTemplates: Array.isArray(value.npcTemplates)
      ? value.npcTemplates.map(normalizeActorState)
      : value.npcTemplates,
  };
}

const PhaseAObjectSchema = z.object({
  statMode: StatModeSchema,
  attributes: z.array(AttributeDefSchema),
  resources: z.array(ResourceDefSchema),
  tiers: z.array(TierDefSchema),
  skills: z.array(SkillDefSchema),
});
export type PhaseA = z.infer<typeof PhaseAObjectSchema>;

/** Phase A output: the world's numeric + skill shape. */
export const PhaseASchema = z.preprocess(normalizePhaseA, PhaseAObjectSchema);

const PhaseBObjectSchema = z.object({
  items: z.array(ItemDefSchema),
  actions: z.array(ActionDefSchema),
  startingState: StartingStateSchema,
  npcTemplates: z.array(NpcTemplateSchema),
});
export type PhaseB = z.infer<typeof PhaseBObjectSchema>;

/** Phase B output with deterministic normalization for common model shorthand. */
export const PhaseBSchema = z.preprocess(normalizePhaseB, PhaseBObjectSchema);

const PhaseBFoundationObjectSchema = z.object({
  items: z.array(ItemDefSchema),
  startingState: StartingStateSchema,
  npcTemplates: z.array(NpcTemplateSchema),
});
const PhaseBFoundationSchema = z.preprocess(normalizePhaseB, PhaseBFoundationObjectSchema);

/**
 * @internal
 * Adds missing skill gates and trial-flag setters to an action batch.
 * The model still owns the action content; this repair only guarantees the
 * cross-catalog references that can be assigned without regenerating prose.
 *
 * @param actions - Structurally valid actions returned for the current batch.
 * @param requiredSkillIds - Skills not exercised by an earlier action batch.
 * @param requiredTrialFlags - Trial flags not set by an earlier action batch.
 * @returns A copied action list with all assignable coverage gaps filled.
 *
 * @remarks
 * Existing unique coverage is preserved. A later schema refinement still reports
 * impossible coverage, such as more required skills than available actions.
 */
function ensureActionCoverage(
  actions: ActionDef[],
  requiredSkillIds: readonly string[],
  requiredTrialFlags: readonly string[]
): ActionDef[] {
  const repaired = actions.map((action) => ({
    ...action,
    effects: {
      crit_success: { ...action.effects.crit_success },
      success: { ...action.effects.success },
      failure: { ...action.effects.failure },
      crit_failure: { ...action.effects.crit_failure },
    },
  }));

  const requiredSkills = new Set(requiredSkillIds);
  const skillCounts = new Map<string, number>();
  for (const action of repaired) {
    if (action.requiresSkill && requiredSkills.has(action.requiresSkill)) {
      skillCounts.set(action.requiresSkill, (skillCounts.get(action.requiresSkill) ?? 0) + 1);
    }
  }
  for (const skillId of requiredSkills) {
    if ((skillCounts.get(skillId) ?? 0) > 0) continue;
    const actionIndex = repaired.findIndex((action) => {
      const current = action.requiresSkill;
      return !current || !requiredSkills.has(current) || (skillCounts.get(current) ?? 0) > 1;
    });
    if (actionIndex < 0) break;
    const action = repaired[actionIndex]!;
    if (action.requiresSkill && requiredSkills.has(action.requiresSkill)) {
      skillCounts.set(action.requiresSkill, (skillCounts.get(action.requiresSkill) ?? 1) - 1);
    }
    repaired[actionIndex] = { ...action, requiresSkill: skillId };
    skillCounts.set(skillId, 1);
  }

  const requiredFlags = new Set(requiredTrialFlags);
  const trueFlagCounts = new Map<string, number>();
  for (const action of repaired) {
    for (const effect of Object.values(action.effects)) {
      if (effect.setFlag?.value && requiredFlags.has(effect.setFlag.flagId)) {
        trueFlagCounts.set(effect.setFlag.flagId, (trueFlagCounts.get(effect.setFlag.flagId) ?? 0) + 1);
      }
    }
  }
  const outcomes: Array<keyof ActionDef["effects"]> = [
    "success",
    "crit_success",
    "failure",
    "crit_failure",
  ];
  for (const flagId of requiredFlags) {
    if ((trueFlagCounts.get(flagId) ?? 0) > 0) continue;
    let assigned = false;
    for (const outcome of outcomes) {
      for (const action of repaired) {
        const current = action.effects[outcome].setFlag;
        const replaceable =
          !current ||
          !requiredFlags.has(current.flagId) ||
          !current.value ||
          (trueFlagCounts.get(current.flagId) ?? 0) > 1;
        if (!replaceable) continue;
        if (current?.value && requiredFlags.has(current.flagId)) {
          trueFlagCounts.set(current.flagId, (trueFlagCounts.get(current.flagId) ?? 1) - 1);
        }
        action.effects[outcome] = {
          ...action.effects[outcome],
          setFlag: { flagId, value: true },
        };
        trueFlagCounts.set(flagId, 1);
        assigned = true;
        break;
      }
      if (assigned) break;
    }
    if (!assigned) break;
  }

  return repaired;
}

function phaseBActionBatchSchema(
  categories: readonly ActionCategory[],
  requiredSkillIds: readonly string[],
  requiredTrialFlags: readonly string[]
) {
  const allowed = new Set<ActionCategory>(categories);
  return z.preprocess(
    normalizePhaseB,
    z
      .object({ actions: z.array(ActionDefSchema) })
      .transform(({ actions }) => ({
        actions: ensureActionCoverage(actions, requiredSkillIds, requiredTrialFlags),
      }))
      .superRefine(({ actions }, context) => {
        for (const category of categories) {
          const count = actions.filter((action) => action.category === category).length;
          if (count !== ACTIONS_PER_CATEGORY) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["actions"],
              message: `Category ${category} must contain exactly ${ACTIONS_PER_CATEGORY} actions; received ${count}.`,
            });
          }
        }
        const unexpected = actions.find((action) => !allowed.has(action.category));
        if (unexpected) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["actions"],
            message: `Unexpected category ${unexpected.category}; requested only ${categories.join(", ")}.`,
          });
        }
        for (const skillId of requiredSkillIds) {
          if (!actions.some((action) => action.requiresSkill === skillId)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["actions"],
              message: `Required skill ${skillId} must be used by at least one action in this batch.`,
            });
          }
        }
        for (const flagId of requiredTrialFlags) {
          const isSet = actions.some((action) =>
            Object.values(action.effects).some(
              (effect) => effect.setFlag?.flagId === flagId && effect.setFlag.value
            )
          );
          if (!isSet) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["actions"],
              message: `Required trial flag ${flagId} must be set by at least one action in this batch.`,
            });
          }
        }
      })
  );
}

function trialFlagIds(phaseA: PhaseA): string[] {
  return phaseA.skills.flatMap((skill) =>
    skill.unlockPaths.flatMap((path) => path.method === "trial" ? [path.flagId] : [])
  );
}

export interface BootstrapInput {
  storyId: string;
  title: string;
  premise: string;
  /** Final v5 destination chosen by the user. Defaults to the model output for legacy callers. */
  statMode?: StatMode;
}

/** Coarse milestones exposed to the desktop forging UI. */
export type BootstrapPhase = "phase-a" | "phase-b" | "repair" | "validate" | "freeze" | "install";

export interface BootstrapOptions {
  /** Per-phase JSON repair budget passed to callStructured (default 3). */
  maxRepairs?: number;
  /** Whole-schema cross-validation repair passes on Phase B (default 3). */
  maxSchemaRepairs?: number;
  /** Called immediately before each material generation, validation, and installation stage. */
  onProgress?: (phase: BootstrapPhase) => void;
  signal?: AbortSignal;
}

/** Assemble a candidate StorySchema from the two phase outputs (unlocked). */
function assemble(input: BootstrapInput, a: PhaseA, b: PhaseB): StorySchema {
  return {
    schemaVersion: 1,
    storyId: input.storyId,
    title: input.title,
    premise: input.premise,
    statMode: a.statMode,
    attributes: a.attributes,
    resources: a.resources,
    skills: a.skills,
    items: b.items,
    tiers: a.tiers,
    actions: b.actions,
    startingState: b.startingState,
    npcTemplates: b.npcTemplates,
    locked: false,
  };
}

/**
 * Generate an unlocked, fully cross-validated StorySchema from a premise. The caller
 * (`bootstrapStory`) freezes and persists it; this function's contract is only that what
 * it returns passes both Zod (StorySchemaSchema) and `validateStorySchema` with zero errors.
 */
export async function generateStorySchema(
  router: Router,
  input: BootstrapInput,
  options: BootstrapOptions = {}
): Promise<StorySchema> {
  const maxRepairs = options.maxRepairs ?? 3;
  const maxSchemaRepairs = options.maxSchemaRepairs ?? 3;

  options.onProgress?.("phase-a");

  // Phase A — the world shape.
  const generatedPhaseA = await callStructured(
    router,
    "bootstrapper",
    { system: PHASE_A_SYSTEM, user: buildPhaseAUser(input.premise, input.statMode) },
    PhaseASchema,
    {
      maxRepairs,
      maxTokens: 5_000,
      maxRepairTokens: 8_000,
      signal: options.signal,
      onRepair: () => options.onProgress?.("repair"),
    }
  );
  const phaseA = input.statMode
    ? PhaseASchema.parse({ ...generatedPhaseA, statMode: input.statMode })
    : generatedPhaseA;

  let phaseBFeedback = "";
  let lastErrors: string[] = [];
  for (let pass = 0; pass <= maxSchemaRepairs; pass++) {
    options.onProgress?.("phase-b");
    const foundation = await callStructured(
      router,
      "bootstrapper",
      {
        system: PHASE_B_FOUNDATION_SYSTEM,
        user: buildPhaseBFoundationUser(input.premise, phaseA, phaseBFeedback),
      },
      PhaseBFoundationSchema,
      {
        maxRepairs,
        maxTokens: 4_000,
        maxRepairTokens: 6_500,
        signal: options.signal,
        onRepair: () => options.onProgress?.("repair"),
      }
    );

    const remainingSkillIds = new Set(phaseA.skills.map((skill) => skill.id));
    const remainingTrialFlags = new Set(trialFlagIds(phaseA));
    const actions: PhaseB["actions"] = [];
    for (let batchIndex = 0; batchIndex < ACTION_BATCHES.length; batchIndex++) {
      const categories = ACTION_BATCHES[batchIndex]!;
      const finalBatch = batchIndex === ACTION_BATCHES.length - 1;
      const requiredSkillIds = finalBatch ? [...remainingSkillIds] : [];
      const requiredTrialFlags = finalBatch ? [...remainingTrialFlags] : [];
      const batch = await callStructured(
        router,
        "bootstrapper",
        {
          system: PHASE_B_ACTION_BATCH_SYSTEM,
          user: buildPhaseBActionBatchUser(
            input.premise,
            phaseA,
            foundation,
            categories,
            requiredSkillIds,
            requiredTrialFlags,
            phaseBFeedback
          ),
        },
        phaseBActionBatchSchema(categories, requiredSkillIds, requiredTrialFlags),
        {
          maxRepairs,
          maxTokens: 5_000,
          maxRepairTokens: 6_500,
          signal: options.signal,
          onRepair: () => options.onProgress?.("repair"),
        }
      );
      actions.push(...batch.actions);
      for (const action of batch.actions) {
        if (action.requiresSkill) remainingSkillIds.delete(action.requiresSkill);
        for (const effect of Object.values(action.effects)) {
          if (effect.setFlag) remainingTrialFlags.delete(effect.setFlag.flagId);
        }
      }
    }

    const phaseB = PhaseBSchema.parse({ ...foundation, actions });

    const candidate = assemble(input, phaseA, phaseB);
    options.onProgress?.("validate");

    // Structural (Zod) — should already hold, but keep the guarantee explicit before
    // handing anything downstream.
    const shape = StorySchemaSchema.safeParse(candidate);
    if (!shape.success) {
      lastErrors = shape.error.issues.map(
        (i) => `${i.path.join(".") || "(root)"}: ${i.message}`
      );
    } else {
      lastErrors = validateStorySchema(candidate);
      if (lastErrors.length === 0) return candidate;
    }

    phaseBFeedback =
      "The previous catalog/items/startingState failed validation. Fix ALL of these and regenerate Phase B:\n" +
      lastErrors.map((e) => `- ${e}`).join("\n");
  }

  throw new ModelOutputError(
    "bootstrapper",
    maxSchemaRepairs + 1,
    `Schema cross-validation failed: ${lastErrors.join("; ")}`,
    ""
  );
}
