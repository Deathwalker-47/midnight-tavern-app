/**
 * Freeze & install (low-level-plan §M5.3–5).
 *
 * `freezeSchema` is the pure step: it runs the deterministic repair, asserts the schema is
 * cross-valid, and returns a copy with `locked=true`. Nothing may be frozen while it still
 * produces validation errors — the frozen flag is the contract the gate relies on, so a
 * broken schema must never carry it.
 *
 * `bootstrapStory` is the full install used by the "create story" flow (§M5.5): generate →
 * freeze → persist the story row and the player's instantiated hard state together in one
 * transaction, so a story never exists on disk without its protagonist.
 */
import { randomUUID } from "../util/uuid.js";
import {
  MODEL_RECOMMENDATION_CONFIG_VERSION,
  type Router,
} from "../router/index.js";
import type { Store } from "../store/index.js";
import {
  STANDARD_DIFFICULTY,
  type StorySchema,
  type StoryRecord,
} from "../types/index.js";
import { validateStorySchema } from "./validate.js";
import { deterministicRepair } from "./repair.js";
import { instantiatePlayer } from "./instantiate.js";
import {
  persistStartingGear,
  resolveStartingGear,
  type StartingGearSeed,
} from "./startingGear.js";
import {
  generateStorySchema,
  resolveBootstrapCreationInput,
  type BootstrapInput,
  type BootstrapOptions,
  type BootstrapResumeState,
} from "./generate.js";
import { MECHANICS_CONFIG_VERSIONS } from "../config/index.js";

/** Raised when a caller tries to freeze a schema that still fails cross-validation. */
export class UnfreezableSchemaError extends Error {
  constructor(readonly errors: string[]) {
    super(`Cannot freeze story schema; ${errors.length} validation error(s): ${errors.join("; ")}`);
    this.name = "UnfreezableSchemaError";
  }
}

/**
 * Return a frozen (`locked=true`) copy of `schema` after deterministic repair and
 * cross-validation. Throws `UnfreezableSchemaError` if any invariant is still violated.
 */
export function freezeSchema(schema: StorySchema): StorySchema {
  const repaired = deterministicRepair(schema);
  const errors = validateStorySchema(repaired);
  if (errors.length > 0) throw new UnfreezableSchemaError(errors);
  return { ...repaired, locked: true };
}

export interface BootstrapResult {
  story: StoryRecord;
  playerCharacterId: string;
}

export interface PlayerSeed {
  /** Display name for the protagonist row. */
  name: string;
  /** Optional explicit character id (defaults to a fresh uuid). */
  characterId?: string;
}

/**
 * Preserve the semantic inputs that must survive the initial forge. Source-card macros are
 * intentionally stored unexpanded so a future rulebook regeneration can evaluate them against
 * the then-current persona and runtime context instead of baking in stale substitutions.
 */
function creationSourceSnapshot(input: BootstrapInput): Record<string, unknown> | undefined {
  const snapshot = {
    ...(input.sourceCard ? { sourceCard: structuredClone(input.sourceCard) } : {}),
    ...(input.acceptImportedMechanics && input.importedMechanics
      ? {
          importedMechanics: structuredClone(input.importedMechanics),
          acceptImportedMechanics: true,
        }
      : {}),
    ...(input.persona ? { persona: structuredClone(input.persona) } : {}),
  };
  return Object.keys(snapshot).length > 0 ? snapshot : undefined;
}

/** Build a sealed, entirely local No Stats rulebook. No model role participates. */
export function createNoStatsSchema(input: BootstrapInput): StorySchema {
  return {
    schemaVersion: 2,
    storyId: input.storyId,
    title: input.title,
    premise: input.premise,
    statMode: "none",
    attributes: [],
    resources: [],
    skills: [],
    items: [],
    tiers: [],
    actions: [],
    startingState: { attributes: {}, resources: {}, skills: [], inventory: [] },
    npcTemplates: [],
    actionBudget: Math.max(1, Math.min(5, Math.round(input.actionBudget ?? 2))),
    mechanicsConfigVersions: MECHANICS_CONFIG_VERSIONS,
    locked: true,
  };
}

/**
 * Full "create story" flow: generate a schema from the premise, freeze it, and persist the
 * story plus the player's hard state atomically. Returns the stored records' ids.
 */
export async function bootstrapStory(
  router: Router,
  store: Store,
  input: BootstrapInput,
  player: PlayerSeed,
  options: BootstrapOptions = {}
): Promise<BootstrapResult> {
  const operationStartedAt = Date.now();
  let latestCheckpoint: BootstrapResumeState | undefined;
  const generationOptions: BootstrapOptions = {
    ...options,
    onCheckpoint: (checkpoint) => {
      latestCheckpoint = checkpoint;
      options.onCheckpoint?.(checkpoint);
    },
  };
  let generatedSchema: StorySchema | undefined;
  let noStatsInput: BootstrapInput | undefined;
  if (input.statMode === "none") {
    noStatsInput = resolveBootstrapCreationInput(input, generationOptions);
  } else {
    generatedSchema = await generateStorySchema(
      router,
      { ...input, statMode: "full" },
      generationOptions
    );
  }
  const progressStartedAt = latestCheckpoint?.startedAt ?? operationStartedAt;
  options.onProgress?.("freeze");
  options.onProgressDetail?.({
    phase: "freeze",
    fragment: "freeze",
    status: "running",
    attempt: 1,
    maxAttempts: 1,
    elapsedMs: Math.max(0, Date.now() - progressStartedAt),
    message: "Sealing the validated rulebook.",
    ...(input.statMode === "none"
      ? {}
      : { latestCompletedFragment: "cross-validation" as const }),
  });
  const installedSchema = noStatsInput
    ? createNoStatsSchema(noStatsInput)
    : freezeSchema(generatedSchema!);
  options.onProgressDetail?.({
    phase: "freeze",
    fragment: "freeze",
    status: "completed",
    attempt: 1,
    maxAttempts: 1,
    elapsedMs: Math.max(0, Date.now() - progressStartedAt),
    message: "Rulebook sealed.",
    latestCompletedFragment: "freeze",
  });

  const story: StoryRecord = {
    id: input.storyId,
    title: input.title,
    createdAt: Date.now(),
    schema: installedSchema,
    locked: true,
    difficulty: STANDARD_DIFFICULTY,
    actionBudget: installedSchema.actionBudget ?? 2,
    rulebookVersion: 1,
    configSnapshot: {
      mechanics: installedSchema.mechanicsConfigVersions ?? MECHANICS_CONFIG_VERSIONS,
      modelRecommendations: MODEL_RECOMMENDATION_CONFIG_VERSION,
      ...(creationSourceSnapshot(input)
        ? { creationSource: creationSourceSnapshot(input) }
        : {}),
    },
  };

  const playerCharacterId = player.characterId ?? randomUUID();
  const hard = instantiatePlayer(installedSchema, playerCharacterId);
  const generatedStartingGear: StartingGearSeed[] =
    latestCheckpoint?.foundation?.startingGear ?? [];
  const resolvedInstallationInput =
    noStatsInput ?? resolveBootstrapCreationInput(input, generationOptions);
  const startingGear = resolveStartingGear(
    resolvedInstallationInput,
    generatedStartingGear
  );

  options.onProgress?.("install");
  options.onProgressDetail?.({
    phase: "install",
    fragment: "install",
    status: "running",
    attempt: 1,
    maxAttempts: 1,
    elapsedMs: Math.max(0, Date.now() - progressStartedAt),
    message: "Installing the sealed story and player state.",
    latestCompletedFragment: "freeze",
  });
  await store.transaction(async () => {
    await store.stories.insert(story);
    await store.characters.insert({
      id: playerCharacterId,
      storyId: input.storyId,
      name: player.name,
      isPlayer: true,
      hard,
    });
    const equipment = await persistStartingGear(
      store,
      input.storyId,
      playerCharacterId,
      startingGear
    );
    if (equipment.length > 0) {
      await store.characters.updateHard(playerCharacterId, {
        ...hard,
        equipment,
      });
    }
  });
  options.onProgressDetail?.({
    phase: "install",
    fragment: "install",
    status: "completed",
    attempt: 1,
    maxAttempts: 1,
    elapsedMs: Math.max(0, Date.now() - progressStartedAt),
    message: "Story installed.",
    latestCompletedFragment: "install",
  });

  return { story, playerCharacterId };
}
