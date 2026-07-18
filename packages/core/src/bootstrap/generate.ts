/**
 * Two-phase story bootstrapping (low-level-plan §M5.1, §8.5).
 *
 * A premise becomes a complete frozen StorySchema in two structured calls, kept small so
 * models stay accurate:
 *   • Phase A → { statMode, resources, tiers, skills }  (the world's shape)
 *   • Phase B → { items, actions, startingState, npcTemplates }  (what you do with it)
 *
 * Each phase has its own Zod schema and its own repair budget inside `callStructured`.
 * After assembly the whole thing goes through `validateStorySchema` (the cross-cutting
 * invariants Zod can't see); any errors drive one more repair pass on Phase B with the
 * exact messages, up to `maxSchemaRepairs`. On exhaustion we throw so the UI surfaces the
 * honest "try a recommended model" path — never a silently-broken story.
 */
import { z } from "zod";
import { callStructured, ModelOutputError, type Router } from "../router/index.js";
import {
  ActionDefSchema,
  ResourceDefSchema,
  SkillDefSchema,
  ItemDefSchema,
  TierDefSchema,
  StartingStateSchema,
  NpcTemplateSchema,
  StatModeSchema,
  StorySchemaSchema,
  type StorySchema,
} from "../types/index.js";
import { validateStorySchema } from "./validate.js";
import { PHASE_A_SYSTEM, PHASE_B_SYSTEM, buildPhaseAUser, buildPhaseBUser } from "./prompts.js";

/** Phase A output: the world's numeric + skill shape. */
export const PhaseASchema = z.object({
  statMode: StatModeSchema,
  resources: z.array(ResourceDefSchema),
  tiers: z.array(TierDefSchema),
  skills: z.array(SkillDefSchema),
});
export type PhaseA = z.infer<typeof PhaseASchema>;

/** Phase B output: the interactive layer built on Phase A. */
export const PhaseBSchema = z.object({
  items: z.array(ItemDefSchema),
  actions: z.array(ActionDefSchema),
  startingState: StartingStateSchema,
  npcTemplates: z.array(NpcTemplateSchema),
});
export type PhaseB = z.infer<typeof PhaseBSchema>;

export interface BootstrapInput {
  storyId: string;
  title: string;
  premise: string;
}

export interface BootstrapOptions {
  /** Per-phase JSON repair budget passed to callStructured (default 3). */
  maxRepairs?: number;
  /** Whole-schema cross-validation repair passes on Phase B (default 3). */
  maxSchemaRepairs?: number;
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

  // Phase A — the world shape.
  const phaseA = await callStructured(
    router,
    "bootstrapper",
    { system: PHASE_A_SYSTEM, user: buildPhaseAUser(input.premise) },
    PhaseASchema,
    { maxRepairs, signal: options.signal }
  );

  // Phase B — with a schema-level repair loop layered over callStructured's JSON repairs.
  let phaseBFeedback = "";
  let lastErrors: string[] = [];
  for (let pass = 0; pass <= maxSchemaRepairs; pass++) {
    const phaseB = await callStructured(
      router,
      "bootstrapper",
      { system: PHASE_B_SYSTEM, user: buildPhaseBUser(input.premise, phaseA, phaseBFeedback) },
      PhaseBSchema,
      { maxRepairs, signal: options.signal }
    );

    const candidate = assemble(input, phaseA, phaseB);

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
