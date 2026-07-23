/**
 * Two-phase story bootstrapping (low-level-plan §M5.1, §8.5).
 *
 * A premise becomes a complete frozen StorySchema in two logical phases. Phase A defines
 * the world shape. Phase B uses one foundation call followed by concurrent, bounded action
 * batches so large catalogs remain below provider output ceilings without paying their
 * model latency serially.
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
import {
  MECHANICS_CONFIG_VERSIONS,
  UNIVERSAL_ACTIONS_CONFIG,
} from "../config/index.js";
import {
  mapCardToImportWithOptions,
  type CharacterCard,
  type ImportedMechanics,
} from "../importer/index.js";
import type {
  MacroContext,
  MacroRegistry,
  MacroWarning,
} from "../macros/index.js";
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

/**
 * Assign coverage requirements to independent action batches before model calls begin.
 *
 * Round-robin partitioning is stable for the same Phase A output and keeps the two batch
 * validators independent, which allows the calls to run concurrently and checkpoints to
 * be resumed in either completion order.
 */
function partitionRequirements(
  values: readonly string[],
  partitionCount: number
): string[][] {
  const partitions = Array.from({ length: partitionCount }, () => [] as string[]);
  for (const [index, value] of values.entries()) {
    partitions[index % partitionCount]!.push(value);
  }
  return partitions;
}

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
      if (record(path) && path.method === "manual") {
        changed = true;
        return { method: "trainer", npcHint: "A suitable mentor", cost: {} };
      }
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
    // V7 loot is created on demand during play, never as forge-time starting gear.
    inventory: [],
  };
}

function normalizeAction(value: unknown): unknown {
  if (!record(value)) return value;
  const costs = record(value.costs) ? { ...value.costs, items: [] } : value.costs;
  const effects = record(value.effects)
    ? Object.fromEntries(
        Object.entries(value.effects).map(([outcome, effect]) => [
          outcome,
          record(effect)
            ? Object.fromEntries(
                Object.entries(effect).filter(([key]) => key !== "grantItem")
              )
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
    items: [],
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

function abbreviation(name: string): string {
  const words = name.match(/[\p{L}\p{N}]+/gu) ?? [];
  const joined = words.length > 1
    ? words.map((word) => word[0] ?? "").join("")
    : (words[0] ?? name).slice(0, 3);
  return joined.toUpperCase().slice(0, 4) || "ATR";
}

/**
 * Overlay user-reviewed card mechanics after model generation so explicit card attributes
 * and skills cannot be silently renamed or discarded by the bootstrapper.
 */
function applyImportedMechanics(phaseA: PhaseA, imported?: ImportedMechanics): PhaseA {
  if (!imported) return phaseA;

  const importedAttributeIds = new Set(imported.attributes.map((attribute) => attribute.id));
  const generatedAttributes = phaseA.attributes.filter(
    (attribute) => !importedAttributeIds.has(attribute.id)
  );
  const generatedById = new Map(phaseA.attributes.map((attribute) => [attribute.id, attribute]));
  const importedAttributes = imported.attributes.map((attribute) => {
    const generated = generatedById.get(attribute.id);
    return AttributeDefSchema.parse({
      id: attribute.id,
      name: attribute.name,
      abbrev: attribute.abbrev ?? generated?.abbrev ?? abbreviation(attribute.name),
      description:
        attribute.description ?? generated?.description ?? `${attribute.name} from the imported card.`,
      defaultScore: attribute.score,
      ...(attribute.locked ? { lockedAtZero: true } : {}),
      ...(attribute.superhuman
        ? { superhuman: true, maximumScore: Math.max(21, attribute.score) }
        : {}),
      provenance: "imported",
    });
  });
  const maximumGenerated = Math.max(0, 6 - importedAttributes.length);
  const attributes = [...importedAttributes, ...generatedAttributes.slice(0, maximumGenerated)];

  const importedSkillIds = new Set(imported.skills.map((skill) => skill.id));
  const generatedSkills = phaseA.skills.filter((skill) => !importedSkillIds.has(skill.id));
  const generatedSkillById = new Map(phaseA.skills.map((skill) => [skill.id, skill]));
  const defaultTier = phaseA.tiers[0]?.id ?? "common";
  const importedSkills = imported.skills.map((skill) => {
    const generated = generatedSkillById.get(skill.id);
    return SkillDefSchema.parse({
      id: skill.id,
      name: skill.name,
      description:
        skill.description ?? generated?.description ?? `${skill.name} from the imported card.`,
      tier: generated?.tier ?? defaultTier,
      prerequisites: generated?.prerequisites ?? [],
      unlockPaths:
        generated?.unlockPaths?.filter((path) => path.method !== "manual") ?? [
          { method: "trainer", npcHint: "A suitable mentor", cost: {} },
        ],
      masteryAdvance: generated?.masteryAdvance ?? { successesPerRank: 1 },
      ...(generated?.advancedUses ? { advancedUses: generated.advancedUses } : {}),
    });
  });

  return PhaseASchema.parse({
    ...phaseA,
    attributes,
    skills: [...importedSkills, ...generatedSkills],
  });
}

const PhaseBObjectSchema = z.object({
  items: z.array(ItemDefSchema).default([]),
  actions: z.array(ActionDefSchema),
  startingState: StartingStateSchema,
  npcTemplates: z.array(NpcTemplateSchema),
});
export type PhaseB = z.infer<typeof PhaseBObjectSchema>;

/** Phase B output with deterministic normalization for common model shorthand. */
export const PhaseBSchema = z.preprocess(normalizePhaseB, PhaseBObjectSchema);

const PhaseBFoundationObjectSchema = z.object({
  startingState: StartingStateSchema,
  npcTemplates: z.array(NpcTemplateSchema),
});
export type PhaseBFoundation = z.infer<typeof PhaseBFoundationObjectSchema>;
const PhaseBFoundationSchema = z.preprocess(normalizePhaseB, PhaseBFoundationObjectSchema);

/**
 * @internal
 * Adds missing skill gates and trial-flag setters to an action batch.
 * The model still owns the action content; this repair only guarantees the
 * cross-catalog references that can be assigned without regenerating prose.
 *
 * @param actions - Structurally valid actions returned for the current batch.
 * @param requiredSkillIds - Skills deterministically assigned to this action batch.
 * @param requiredTrialFlags - Trial flags deterministically assigned to this action batch.
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
        const universalIds = new Set(
          UNIVERSAL_ACTIONS_CONFIG.actions.map((action) => action.id)
        );
        for (const [index, action] of actions.entries()) {
          if (!action.description?.trim()) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["actions", index, "description"],
              message: "Every action requires an exact player/classifier-facing description.",
            });
          }
          if (!action.aliases?.some((alias) => alias.trim().length > 0)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["actions", index, "aliases"],
              message: "Every action requires at least one natural-language alias.",
            });
          }
          if (!action.universalFamily || !universalIds.has(action.universalFamily)) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["actions", index, "universalFamily"],
              message: "Every action must reference an existing universal action family.",
            });
          }
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
  /** Persona selected before forging; its identity shapes the player starting sheet. */
  persona?: { id?: string; name: string; description: string };
  /** Typed card mechanics projected by the importer. Ignored until explicitly accepted. */
  importedMechanics?: ImportedMechanics;
  acceptImportedMechanics?: boolean;
  /**
   * Preserved semantic card source with unexpanded macros. When present it is reevaluated
   * immediately before prompt assembly; its resolved premise is authoritative for this forge.
   */
  sourceCard?: CharacterCard;
  /** Sealed player-action budget. Defaults to two consequential actions per turn. */
  actionBudget?: number;
}

/** Coarse milestones exposed to the desktop forging UI. */
export type BootstrapPhase = "phase-a" | "phase-b" | "repair" | "validate" | "freeze" | "install";

export type BootstrapFragment =
  | "mechanics-core"
  | "actor-foundation"
  | "actions-combat-social"
  | "actions-exploration-crafting-utility"
  | "cross-validation"
  | "freeze"
  | "install";

export interface BootstrapProgressEvent {
  phase: BootstrapPhase;
  fragment: BootstrapFragment;
  status: "running" | "retrying" | "completed" | "resumed" | "failed" | "cancelled";
  attempt: number;
  maxAttempts: number;
  elapsedMs: number;
  message: string;
  latestCompletedFragment?: BootstrapFragment;
}

export interface BootstrapResumeState {
  startedAt: number;
  /**
   * Binds cached fragments to the exact effective premise, persona, accepted mechanics,
   * source card, and creation settings. Missing/mismatched fingerprints are regenerated.
   */
  sourceFingerprint?: string;
  phaseA?: PhaseA;
  foundation?: PhaseBFoundation;
  actionBatches?: Partial<Record<BootstrapFragment, ActionDef[]>>;
  latestCompletedFragment?: BootstrapFragment;
}

export interface BootstrapOptions {
  /** Per-phase JSON repair budget passed to callStructured (default 3). */
  maxRepairs?: number;
  /** Whole-schema cross-validation repair passes on Phase B (default 3). */
  maxSchemaRepairs?: number;
  /** Called immediately before each material generation, validation, and installation stage. */
  onProgress?: (phase: BootstrapPhase) => void;
  /** Truthful substep/retry/elapsed metadata for the V7 forging interstitial. */
  onProgressDetail?: (event: BootstrapProgressEvent) => void;
  /** Receives resumable, validated fragment checkpoints after each completed model call. */
  onCheckpoint?: (checkpoint: BootstrapResumeState) => void;
  /** Previously validated checkpoint. Invalid fragments are ignored and regenerated. */
  resume?: BootstrapResumeState;
  /** Transient values for reevaluating source-card macros at prompt assembly. */
  macroContext?: Omit<MacroContext, "user" | "char" | "card">;
  /** Optional extension macro registry; built-ins are used by default. */
  macroRegistry?: MacroRegistry;
  signal?: AbortSignal;
}

export type BootstrapMacroWarning = MacroWarning & { field: string };

/** Raised before any model call when a preserved card source cannot be expanded safely. */
export class BootstrapMacroEvaluationError extends Error {
  constructor(readonly warnings: readonly BootstrapMacroWarning[]) {
    super(
      `Card macro evaluation blocked story creation: ${warnings
        .map((warning) => `${warning.field}: ${warning.message}`)
        .join("; ")}`
    );
    this.name = "BootstrapMacroEvaluationError";
  }
}

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableJsonValue(entry)])
    );
  }
  return value;
}

function fingerprintCreationSource(value: unknown): string {
  const text = JSON.stringify(stableJsonValue(value));
  let first = 2166136261;
  let second = 2246822519;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }
  return `bootstrap-v1-${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0)
    .toString(16)
    .padStart(8, "0")}`;
}

export function resolveBootstrapCreationInput(
  input: BootstrapInput,
  options: BootstrapOptions
): BootstrapInput {
  if (!input.sourceCard) return input;
  const mapped = mapCardToImportWithOptions(input.sourceCard, {
    macroContext: {
      ...(options.macroContext ?? {}),
      ...(input.persona ? { user: input.persona } : {}),
    },
    ...(options.macroRegistry ? { macroRegistry: options.macroRegistry } : {}),
  });
  if (mapped.macroDiagnostics?.blocked) {
    throw new BootstrapMacroEvaluationError(mapped.macroDiagnostics.warnings);
  }
  return {
    ...input,
    premise: mapped.premise,
    ...(input.importedMechanics
      ? {}
      : mapped.importedMechanics
        ? { importedMechanics: mapped.importedMechanics }
        : {}),
  };
}

/** Assemble a candidate StorySchema from the two phase outputs (unlocked). */
function assemble(input: BootstrapInput, a: PhaseA, b: PhaseB): StorySchema {
  return {
    schemaVersion: 2,
    storyId: input.storyId,
    title: input.title,
    premise: input.premise,
    statMode: a.statMode,
    attributes: a.attributes,
    resources: a.resources,
    skills: a.skills,
    items: [],
    tiers: a.tiers,
    actions: b.actions,
    startingState: b.startingState,
    npcTemplates: b.npcTemplates,
    actionBudget: Math.max(1, Math.min(5, Math.round(input.actionBudget ?? 2))),
    mechanicsConfigVersions: MECHANICS_CONFIG_VERSIONS,
    locked: false,
  };
}

function applyImportedStartingState(
  foundation: PhaseBFoundation,
  imported?: ImportedMechanics
): PhaseBFoundation {
  if (!imported) return foundation;
  const skills = new Map(
    foundation.startingState.skills.map((skill) => [skill.skillId, skill])
  );
  for (const skill of imported.skills) {
    skills.set(skill.id, { skillId: skill.id, rank: skill.rank ?? "novice" });
  }
  return PhaseBFoundationSchema.parse({
    ...foundation,
    startingState: {
      ...foundation.startingState,
      attributes: {
        ...foundation.startingState.attributes,
        ...Object.fromEntries(
          imported.attributes.map((attribute) => [attribute.id, attribute.score])
        ),
      },
      skills: [...skills.values()],
      inventory: [],
    },
    npcTemplates: foundation.npcTemplates.map((template) => ({
      ...template,
      inventory: [],
    })),
  });
}

function batchFragment(categories: readonly ActionCategory[]): BootstrapFragment {
  return categories.includes("combat")
    ? "actions-combat-social"
    : "actions-exploration-crafting-utility";
}

function applyImportedActionDetails(
  actions: readonly ActionDef[],
  imported?: ImportedMechanics
): ActionDef[] {
  if (!imported) return [...actions];
  const definitions = new Map(imported.actions.map((action) => [action.id, action]));
  return actions.map((action) => {
    const definition = definitions.get(action.id);
    if (!definition) return action;
    return {
      ...action,
      label: definition.label,
      description: definition.definition ?? action.description,
      ...(definition.governingAttribute
        ? { governingAttribute: definition.governingAttribute }
        : {}),
      ...(definition.requiresSkill ? { requiresSkill: definition.requiresSkill } : {}),
    };
  });
}

function fragmentsForValidationErrors(
  errors: readonly string[],
  actions: readonly ActionDef[]
): Set<BootstrapFragment> {
  const fragments = new Set<BootstrapFragment>();
  const byId = new Map(actions.map((action) => [action.id, action]));
  for (const error of errors) {
    const actionId = error.match(/Action "([^"]+)"/)?.[1];
    const category = error.match(/Category "([^"]+)"/)?.[1] as ActionCategory | undefined;
    const action = actionId ? byId.get(actionId) : undefined;
    if (action) fragments.add(batchFragment([action.category]));
    if (category) fragments.add(batchFragment([category]));
    if (/Skill "|trial flag|Imported action/i.test(error)) {
      fragments.add("actions-exploration-crafting-utility");
    }
  }
  if (
    fragments.size === 0 &&
    errors.some((error) => /action|catalog|skill/i.test(error))
  ) {
    fragments.add("actions-combat-social");
    fragments.add("actions-exploration-crafting-utility");
  }
  return fragments;
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
  const resolvedInput = resolveBootstrapCreationInput(input, options);
  const imported = resolvedInput.acceptImportedMechanics
    ? resolvedInput.importedMechanics
    : undefined;
  const sourceFingerprint = fingerprintCreationSource({
    version: 1,
    title: resolvedInput.title,
    premise: resolvedInput.premise,
    statMode: resolvedInput.statMode,
    persona: resolvedInput.persona,
    importedMechanics: imported,
    actionBudget: resolvedInput.actionBudget ?? 2,
    sourceCard: resolvedInput.sourceCard,
    mechanicsConfigVersions: MECHANICS_CONFIG_VERSIONS,
  });
  const resume =
    options.resume?.sourceFingerprint === sourceFingerprint
      ? options.resume
      : undefined;
  const startedAt = resume?.startedAt ?? Date.now();
  let latestCompletedFragment = resume?.latestCompletedFragment;
  let checkpoint: BootstrapResumeState = {
    startedAt,
    sourceFingerprint,
    ...(resume?.phaseA ? { phaseA: resume.phaseA } : {}),
    ...(resume?.foundation ? { foundation: resume.foundation } : {}),
    ...(resume?.actionBatches
      ? { actionBatches: { ...resume.actionBatches } }
      : {}),
    ...(latestCompletedFragment ? { latestCompletedFragment } : {}),
  };
  const promptContext = {
    ...(resolvedInput.persona ? { persona: resolvedInput.persona } : {}),
    ...(imported ? { importedMechanics: imported } : {}),
  };
  const emit = (
    phase: BootstrapPhase,
    fragment: BootstrapFragment,
    status: BootstrapProgressEvent["status"],
    attempt: number,
    maxAttempts: number,
    message: string
  ): void => {
    options.onProgressDetail?.({
      phase,
      fragment,
      status,
      attempt,
      maxAttempts,
      elapsedMs: Math.max(0, Date.now() - startedAt),
      message,
      ...(latestCompletedFragment ? { latestCompletedFragment } : {}),
    });
  };
  const complete = (
    phase: BootstrapPhase,
    fragment: BootstrapFragment,
    message: string
  ): void => {
    latestCompletedFragment = fragment;
    checkpoint = { ...checkpoint, latestCompletedFragment };
    emit(phase, fragment, "completed", 1, 1, message);
    options.onCheckpoint?.(checkpoint);
  };
  const assertNotAborted = (phase: BootstrapPhase, fragment: BootstrapFragment): void => {
    if (!options.signal?.aborted) return;
    emit(phase, fragment, "cancelled", 1, 1, "Story forging was cancelled.");
    options.signal.throwIfAborted();
  };
  const repairReporter = (fragment: BootstrapFragment) =>
    (attempt: number, total: number, error: string): void => {
      options.onProgress?.("repair");
      emit(
        "repair",
        fragment,
        "retrying",
        attempt + 1,
        total + 1,
        `Retry ${attempt}/${total}: ${error}`
      );
    };
  const runFragment = async <T>(
    phase: BootstrapPhase,
    fragment: BootstrapFragment,
    work: () => Promise<T>
  ): Promise<T> => {
    try {
      return await work();
    } catch (error) {
      emit(
        phase,
        fragment,
        options.signal?.aborted ? "cancelled" : "failed",
        1,
        1,
        options.signal?.aborted
          ? "Story forging was cancelled."
          : `Fragment failed: ${(error as Error).message}`
      );
      throw error;
    }
  };

  let phaseA: PhaseA | undefined;
  if (resume?.phaseA) {
    const resumed = PhaseASchema.safeParse(resume.phaseA);
    if (resumed.success) {
      phaseA = applyImportedMechanics(resumed.data, imported);
      emit("phase-a", "mechanics-core", "resumed", 1, 1, "Resumed validated mechanics core.");
    }
  }

  // Phase A — the world shape.
  if (!phaseA) {
    assertNotAborted("phase-a", "mechanics-core");
    options.onProgress?.("phase-a");
    emit(
      "phase-a",
      "mechanics-core",
      "running",
      1,
      maxRepairs + 1,
      "Designing attributes, resources, and skills."
    );
    const generatedPhaseA = await runFragment("phase-a", "mechanics-core", () =>
      callStructured(
    router,
    "bootstrapper",
    {
      system: PHASE_A_SYSTEM,
      user: buildPhaseAUser(
        resolvedInput.premise,
        resolvedInput.statMode,
        promptContext
      ),
    },
    PhaseASchema,
    {
      maxRepairs,
      maxTokens: 5_000,
      maxRepairTokens: 8_000,
      signal: options.signal,
      onRepair: repairReporter("mechanics-core"),
      }
    ));
    const selected = resolvedInput.statMode
      ? PhaseASchema.parse({ ...generatedPhaseA, statMode: resolvedInput.statMode })
      : generatedPhaseA;
    phaseA = applyImportedMechanics(selected, imported);
    checkpoint = { ...checkpoint, phaseA };
    complete("phase-a", "mechanics-core", "Mechanics core validated.");
  }
  const mechanicsCore = phaseA;

  const generateFoundation = async (
    feedback: string,
    attempt: number
  ): Promise<PhaseBFoundation> => {
    assertNotAborted("phase-b", "actor-foundation");
    emit(
      "phase-b",
      "actor-foundation",
      attempt > 1 ? "retrying" : "running",
      attempt,
      maxSchemaRepairs + 1,
      attempt > 1
        ? "Repairing the player/NPC foundation."
        : "Creating the persona-aware player and NPC foundation."
    );
    const value = await runFragment("phase-b", "actor-foundation", () =>
      callStructured(
      router,
      "bootstrapper",
      {
        system: PHASE_B_FOUNDATION_SYSTEM,
        user: buildPhaseBFoundationUser(
          resolvedInput.premise,
          mechanicsCore,
          feedback,
          promptContext
        ),
      },
      PhaseBFoundationSchema,
      {
        maxRepairs,
        maxTokens: 3_000,
        maxRepairTokens: 5_000,
        signal: options.signal,
        onRepair: repairReporter("actor-foundation"),
        }
      )
    );
    const result = applyImportedStartingState(value, imported);
    checkpoint = { ...checkpoint, foundation: result };
    complete("phase-b", "actor-foundation", "Player and NPC foundation validated.");
    return result;
  };

  options.onProgress?.("phase-b");
  let foundation: PhaseBFoundation | undefined;
  if (resume?.foundation) {
    const resumed = PhaseBFoundationSchema.safeParse(resume.foundation);
    if (resumed.success) {
      foundation = applyImportedStartingState(resumed.data, imported);
      emit(
        "phase-b",
        "actor-foundation",
        "resumed",
        1,
        1,
        "Resumed validated actor foundation."
      );
    }
  }
  foundation ??= await generateFoundation("", 1);

  let phaseBFeedback = "";
  let lastErrors: string[] = [];
  let retryFragments = new Set<BootstrapFragment>();
  for (let pass = 0; pass <= maxSchemaRepairs; pass++) {
    const skillPartitions = partitionRequirements(
      mechanicsCore.skills.map((skill) => skill.id),
      ACTION_BATCHES.length
    );
    const trialFlagPartitions = partitionRequirements(
      [...new Set(trialFlagIds(mechanicsCore))],
      ACTION_BATCHES.length
    );
    const batchPromises = ACTION_BATCHES.map(async (categories, batchIndex) => {
      const fragment = batchFragment(categories);
      const requiredSkillIds = skillPartitions[batchIndex]!;
      const requiredTrialFlags = trialFlagPartitions[batchIndex]!;
      const batchSchema = phaseBActionBatchSchema(
        categories,
        requiredSkillIds,
        requiredTrialFlags
      );
      let batch: { actions: ActionDef[] } | undefined;
      const cachedActions = !retryFragments.has(fragment)
        ? checkpoint.actionBatches?.[fragment]
        : undefined;
      if (cachedActions) {
        const resumed = batchSchema.safeParse({ actions: cachedActions });
        if (resumed.success) {
          batch = resumed.data;
          emit(
            "phase-b",
            fragment,
            "resumed",
            1,
            1,
            `Resumed ${categories.join("/")} actions.`
          );
        }
      }
      if (!batch) {
        assertNotAborted("phase-b", fragment);
        emit(
          "phase-b",
          fragment,
          pass > 0 ? "retrying" : "running",
          pass + 1,
          maxSchemaRepairs + 1,
          `${pass > 0 ? "Repairing" : "Creating"} ${categories.join("/")} actions.`
        );
        batch = await runFragment("phase-b", fragment, () =>
          callStructured(
          router,
          "bootstrapper",
          {
            system: PHASE_B_ACTION_BATCH_SYSTEM,
            user: buildPhaseBActionBatchUser(
              resolvedInput.premise,
              mechanicsCore,
              foundation,
              categories,
              requiredSkillIds,
              requiredTrialFlags,
              phaseBFeedback,
              promptContext
            ),
          },
          batchSchema,
          {
            maxRepairs,
            maxTokens: 5_000,
            maxRepairTokens: 6_500,
            signal: options.signal,
            onRepair: repairReporter(fragment),
            }
          )
        );
        checkpoint = {
          ...checkpoint,
          actionBatches: {
            ...(checkpoint.actionBatches ?? {}),
            [fragment]: batch.actions,
          },
        };
        complete("phase-b", fragment, `${categories.join("/")} actions validated.`);
      }
      return batch.actions;
    });

    // allSettled prevents a rejected batch from returning control while its sibling is
    // still writing truthful progress/checkpoint events in the background.
    const settledBatches = await Promise.allSettled(batchPromises);
    const rejectedBatch = settledBatches.find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    if (rejectedBatch) throw rejectedBatch.reason;
    const actions: PhaseB["actions"] = settledBatches.flatMap((result) =>
      result.status === "fulfilled" ? result.value : []
    );

    const phaseB = PhaseBSchema.parse({
      ...foundation,
      items: [],
      actions: applyImportedActionDetails(actions, imported),
    });

    const candidate = assemble(resolvedInput, mechanicsCore, phaseB);
    options.onProgress?.("validate");
    emit(
      "validate",
      "cross-validation",
      "running",
      pass + 1,
      maxSchemaRepairs + 1,
      "Cross-validating the complete rulebook."
    );

    // Structural (Zod) — should already hold, but keep the guarantee explicit before
    // handing anything downstream.
    const shape = StorySchemaSchema.safeParse(candidate);
    if (!shape.success) {
      lastErrors = shape.error.issues.map(
        (i) => `${i.path.join(".") || "(root)"}: ${i.message}`
      );
    } else {
      lastErrors = validateStorySchema(candidate);
      for (const action of imported?.actions ?? []) {
        if (!candidate.actions.some((candidateAction) => candidateAction.id === action.id)) {
          lastErrors.push(
            `Imported action "${action.id}" was omitted; preserve this reviewed card action id.`
          );
        }
      }
      if (lastErrors.length === 0) {
        complete("validate", "cross-validation", "Rulebook cross-validation completed.");
        return candidate;
      }
    }

    phaseBFeedback =
      "The previous generated fragment failed cross-validation. Fix ALL of these issues:\n" +
      lastErrors.map((e) => `- ${e}`).join("\n");
    const foundationFailed = lastErrors.some((error) =>
      /Starting state|NPC template/i.test(error)
    );
    retryFragments = fragmentsForValidationErrors(lastErrors, phaseB.actions);
    if (foundationFailed && pass < maxSchemaRepairs) {
      foundation = await generateFoundation(phaseBFeedback, pass + 2);
    }
  }

  throw new ModelOutputError(
    "bootstrapper",
    maxSchemaRepairs + 1,
    `Schema cross-validation failed: ${lastErrors.join("; ")}`,
    ""
  );
}
