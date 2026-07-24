import {
  createNoStatsSchema,
  freezeSchema,
  generateStorySchema,
  instantiateGeneric,
  instantiatePlayer,
  persistStartingGear,
  resolveStartingGear,
  type BootstrapOptions,
  type BootstrapInput,
  type StartingGearSeed,
} from "../bootstrap/index.js";
import type { CharacterCard, ImportedMechanics } from "../importer/index.js";
import { MECHANICS_CONFIG_VERSIONS } from "../config/index.js";
import { UNIVERSAL_ACTIONS_CONFIG } from "../config/index.js";
import type { Router } from "../router/index.js";
import type { Store } from "../store/index.js";
import {
  normalizeDifficultyConfig,
  type DifficultyConfig,
  type StatMode,
  type StoryRecord,
} from "../types/index.js";
import { randomUUID } from "../util/uuid.js";
import { listCompleteStoryJournal } from "./journal.js";
import { requireStory } from "./turn.js";

export interface RegenerateRulebookOptions extends BootstrapOptions {
  /** Deliberate destructive boundary; callers must show and accept the reset warning first. */
  confirmMechanicalReset: true;
  statMode?: StatMode;
  actionBudget?: number;
  persona?: { id?: string; name: string; description: string };
  /** Optional replacement card source. Omit to reuse the original preserved, unexpanded card. */
  sourceCard?: CharacterCard;
  /** Optional reviewed card mechanics. Omit to reuse the accepted forge-time projection. */
  importedMechanics?: ImportedMechanics;
  acceptImportedMechanics?: boolean;
}

export interface DuplicateAndRegenerateOptions
  extends Omit<RegenerateRulebookOptions, "confirmMechanicalReset"> {
  title?: string;
}

interface PersistedCreationSource {
  sourceCard?: CharacterCard;
  importedMechanics?: ImportedMechanics;
  acceptImportedMechanics?: boolean;
  persona?: BootstrapInput["persona"];
}

export interface RulebookRegenerationImpact {
  attributes: number;
  skills: number;
  skillProgressions: number;
  storyActions: number;
  universalActions: number;
  resources: number;
  flags: number;
  characters: number;
  rulings: number;
  checkpoints: number;
  journalEvents: number;
  runtimeItemDefinitions: number;
  runtimeItemInstances: number;
  equippedSlots: number;
  actionBudget: number;
}

function persistedCreationSource(story: StoryRecord): PersistedCreationSource {
  const value = story.configSnapshot?.creationSource;
  return value && typeof value === "object"
    ? (structuredClone(value) as PersistedCreationSource)
    : {};
}

/** Read-only preflight used by the typed regeneration warning. */
export async function previewRulebookRegenerationImpact(
  store: Store,
  storyId: string
): Promise<RulebookRegenerationImpact> {
  const story = await requireStory(store, storyId);
  const [roster, rulings, checkpoints, events, definitions] = await Promise.all([
    store.characters.listByStory(storyId),
    store.rulings.listByStory(storyId),
    store.checkpoints.listByStory(storyId),
    listCompleteStoryJournal(store, storyId),
    store.runtimeItems.listDefinitions(storyId),
  ]);
  const [instances, loadouts] = await Promise.all([
    Promise.all(
      roster.map((character) => store.runtimeItems.listInventory(character.id))
    ),
    Promise.all(
      roster.map((character) => store.runtimeItems.listLoadout(character.id))
    ),
  ]);
  const flags = new Set(
    roster.flatMap((character) => Object.keys(character.hard.flags))
  );
  return {
    attributes: story.schema.attributes.length,
    skills: story.schema.skills.length,
    skillProgressions: roster.reduce(
      (total, character) => total + character.hard.skills.length,
      0
    ),
    storyActions: story.schema.actions.length,
    universalActions: UNIVERSAL_ACTIONS_CONFIG.actions.length,
    resources: story.schema.resources.length,
    flags: flags.size,
    characters: roster.length,
    rulings: rulings.length,
    checkpoints: checkpoints.length,
    journalEvents: events.length,
    runtimeItemDefinitions: definitions.length,
    runtimeItemInstances: instances.flat().length,
    equippedSlots: loadouts.flat().length,
    actionBudget: story.actionBudget ?? story.schema.actionBudget ?? 2,
  };
}

/**
 * Recommended regeneration path: clone every narrative asset into a new story, then replace only
 * the clone's rulebook. The source story is never mutated.
 */
export async function duplicateAndRegenerateRulebook(
  router: Router,
  store: Store,
  sourceStoryId: string,
  options: DuplicateAndRegenerateOptions = {}
): Promise<StoryRecord> {
  const source = await requireStory(store, sourceStoryId);
  const newStoryId = randomUUID();
  const roster = await store.characters.listByStory(sourceStoryId);
  const messages = await store.messages.listByStory(sourceStoryId);
  const [chapters, arcs, world, attachedLorebooks, activePersona] = await Promise.all([
    store.chapters.listByStory(sourceStoryId),
    store.arcs.listByStory(sourceStoryId),
    store.worldSoft.get(sourceStoryId),
    store.lorebook.listAttached(sourceStoryId),
    store.personas.getActivePersona(sourceStoryId),
  ]);
  const characterIdMap = new Map(
    roster.map((character) => [character.id, randomUUID()] as const)
  );
  const copiedStory: StoryRecord = {
    ...source,
    id: newStoryId,
    title: options.title?.trim() || `${source.title} - Regenerated Copy`,
    createdAt: Date.now(),
    schema: { ...source.schema, storyId: newStoryId },
    rulebookVersion: 1,
  };

  await store.transaction(async () => {
    await store.stories.insert(copiedStory);
    for (const character of roster) {
      const newCharacterId = characterIdMap.get(character.id)!;
      const hard = { ...structuredClone(character.hard), characterId: newCharacterId };
      const soft = character.soft
        ? {
            ...structuredClone(character.soft),
            characterId: newCharacterId,
            relationships: character.soft.relationships.map((relationship) => ({
              ...relationship,
              toCharacterId:
                characterIdMap.get(relationship.toCharacterId) ?? relationship.toCharacterId,
            })),
          }
        : undefined;
      await store.characters.insert({
        id: newCharacterId,
        storyId: newStoryId,
        name: character.name,
        isPlayer: character.isPlayer,
        hard,
        ...(soft ? { soft, softTier: soft.tier } : {}),
      });
    }
    for (const message of messages) {
      const id = randomUUID();
      await store.messages.insert({ ...message, id, storyId: newStoryId });
      const variantStates = await store.messages.getVariantStatesJson(message.id);
      if (variantStates) {
        await store.messages.setVariantStatesJson(id, variantStates);
      }
    }
    for (const chapter of chapters) {
      await store.chapters.insert({ ...chapter, id: randomUUID(), storyId: newStoryId });
    }
    for (const arc of arcs) {
      await store.arcs.insert({ ...arc, id: randomUUID(), storyId: newStoryId });
    }
    if (world) await store.worldSoft.set(newStoryId, world);
    for (const lorebook of attachedLorebooks) {
      await store.lorebook.attach(newStoryId, lorebook.id, lorebook.linkEnabled);
    }
    if (activePersona) {
      await store.personas.setActiveForStory(newStoryId, activePersona.id);
    }
  });

  try {
    return await regenerateRulebook(router, store, newStoryId, {
      ...options,
      confirmMechanicalReset: true,
      ...(options.persona
        ? { persona: options.persona }
        : activePersona
          ? {
              persona: {
                id: activePersona.id,
                name: activePersona.name,
                description: activePersona.description,
              },
            }
          : {}),
    });
  } catch (error) {
    // A duplicate is a private draft until its replacement rulebook validates. Cancellation or
    // provider failure must not leave a half-forged story on the user's shelf.
    await store.stories.delete(newStoryId);
    throw error;
  }
}

/**
 * Generate a replacement rulebook, then atomically install it and erase every old mechanical
 * derivative. Narrative transcript and soft character history remain; rulings, checkpoints,
 * runtime items, loadouts, XP, resources, skills, flags, and operation recovery state are reset.
 */
export async function regenerateRulebook(
  router: Router,
  store: Store,
  storyId: string,
  options: RegenerateRulebookOptions
): Promise<StoryRecord> {
  if (options.confirmMechanicalReset !== true) {
    throw new Error("Rulebook regeneration requires explicit mechanical-reset confirmation.");
  }
  const story = await requireStory(store, storyId);
  const storedCreation = persistedCreationSource(story);
  const statMode = options.statMode ?? story.schema.statMode;
  const actionBudget = Math.max(
    1,
    Math.min(5, Math.round(options.actionBudget ?? story.actionBudget ?? 2))
  );
  const input = {
    storyId,
    title: story.title,
    premise: story.schema.premise,
    statMode,
    actionBudget,
    ...(options.persona ?? storedCreation.persona
      ? { persona: options.persona ?? storedCreation.persona }
      : {}),
    ...(options.sourceCard ?? storedCreation.sourceCard
      ? { sourceCard: options.sourceCard ?? storedCreation.sourceCard }
      : {}),
    ...(options.importedMechanics ?? storedCreation.importedMechanics
      ? {
          importedMechanics:
            options.importedMechanics ?? storedCreation.importedMechanics,
        }
      : {}),
    ...(options.acceptImportedMechanics ?? storedCreation.acceptImportedMechanics
      ? { acceptImportedMechanics: true }
      : {}),
  } satisfies BootstrapInput;
  let generatedStartingGear: StartingGearSeed[] = [];
  const schema =
    statMode === "none"
      ? createNoStatsSchema(input)
      : freezeSchema(
          await generateStorySchema(
            router,
            { ...input, statMode: "full" },
            {
              ...options,
              onCheckpoint: (checkpoint) => {
                generatedStartingGear = checkpoint.foundation?.startingGear ?? generatedStartingGear;
                options.onCheckpoint?.(checkpoint);
              },
            }
          )
        );
  const startingGear = resolveStartingGear(input, generatedStartingGear);
  const next: StoryRecord = {
    ...story,
    schema,
    locked: true,
    actionBudget,
    rulebookVersion: (story.rulebookVersion ?? 1) + 1,
    configSnapshot: {
      ...(story.configSnapshot ?? {}),
      mechanics: schema.mechanicsConfigVersions ?? MECHANICS_CONFIG_VERSIONS,
      creationSource: {
        ...(input.sourceCard ? { sourceCard: structuredClone(input.sourceCard) } : {}),
        ...(input.acceptImportedMechanics && input.importedMechanics
          ? {
              importedMechanics: structuredClone(input.importedMechanics),
              acceptImportedMechanics: true,
            }
          : {}),
        ...(input.persona ? { persona: structuredClone(input.persona) } : {}),
      },
      regeneratedAt: new Date().toISOString(),
    },
  };
  const roster = await store.characters.listByStory(storyId);
  const turnIndex = await store.messages.nextIdx(storyId);
  const [
    priorRulings,
    priorCheckpoints,
    priorEvents,
    priorDefinitions,
    priorChapters,
    priorArcs,
  ] = await Promise.all([
    store.rulings.listByStory(storyId),
    store.checkpoints.listByStory(storyId),
    listCompleteStoryJournal(store, storyId),
    store.runtimeItems.listDefinitions(storyId),
    store.chapters.listByStory(storyId),
    store.arcs.listByStory(storyId),
  ]);
  const priorInstances = (
    await Promise.all(roster.map((character) => store.runtimeItems.listInventory(character.id)))
  ).flat();
  const priorLoadouts = (
    await Promise.all(roster.map((character) => store.runtimeItems.listLoadout(character.id)))
  ).flat();
  const snapshot = {
    story,
    characterHardStates: roster.map((character) => ({
      characterId: character.id,
      hard: character.hard,
    })),
    rulings: priorRulings,
    checkpoints: priorCheckpoints,
    events: priorEvents,
    itemDefinitions: priorDefinitions,
    itemInstances: priorInstances,
    equipmentAssignments: priorLoadouts,
    chapters: priorChapters,
    arcs: priorArcs,
  };
  const snapshotId = randomUUID();

  await store.transaction(async () => {
    await store.rulebookSnapshots.insert({
      id: snapshotId,
      storyId,
      rulebookVersion: story.rulebookVersion ?? 1,
      snapshot,
      createdAt: Date.now(),
    });
    await store.rulings.deleteFromIdx(storyId, 0);
    await store.checkpoints.deleteFrom(storyId, 0);
    await store.turnOperations.deleteByStory(storyId);
    await store.events.deleteMechanicalHistory(storyId);
    await store.runtimeItems.deleteStoryItems(storyId);
    await store.stories.update(next);
    for (const character of roster) {
      const hard = character.isPlayer
        ? instantiatePlayer(schema, character.id)
        : instantiateGeneric(schema, character.id);
      await store.characters.updateHard(character.id, hard);
      if (character.isPlayer) {
        const equipment = await persistStartingGear(
          store,
          storyId,
          character.id,
          startingGear
        );
        if (equipment.length > 0) {
          await store.characters.updateHard(character.id, {
            ...hard,
            equipment,
          });
        }
      }
    }
    await store.events.insert({
      id: randomUUID(),
      storyId,
      turnIndex,
      kind: "rulebook_regenerated",
      payload: {
        previousVersion: story.rulebookVersion ?? 1,
        newVersion: next.rulebookVersion ?? 1,
        statMode,
        actionBudget,
        snapshotId,
        impact: {
          characters: roster.length,
          rulings: priorRulings.length,
          checkpoints: priorCheckpoints.length,
          events: priorEvents.length,
          itemDefinitions: priorDefinitions.length,
          itemInstances: priorInstances.length,
          equippedSlots: priorLoadouts.length,
        },
      },
      rulebookVersion: next.rulebookVersion ?? 1,
      createdAt: Date.now(),
    });
  });
  return next;
}

/** Change difficulty for future rulings only; prior rulings retain their embedded snapshot. */
export async function setStoryDifficulty(
  store: Store,
  storyId: string,
  difficulty: Partial<DifficultyConfig>
): Promise<StoryRecord> {
  const story = await requireStory(store, storyId);
  const normalized = normalizeDifficultyConfig(difficulty);
  const next: StoryRecord = { ...story, difficulty: normalized };
  await store.transaction(async () => {
    await store.stories.update(next);
    await store.events.insert({
      id: randomUUID(),
      storyId,
      turnIndex: await store.messages.nextIdx(storyId),
      kind: "difficulty_changed",
      payload: { previous: story.difficulty, next: normalized },
      rulebookVersion: story.rulebookVersion ?? 1,
      createdAt: Date.now(),
    });
  });
  return next;
}
