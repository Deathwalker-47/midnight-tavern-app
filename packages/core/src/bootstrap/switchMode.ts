import type { Router } from "../router/index.js";
import type { Store } from "../store/index.js";
import type { StatMode, StoryRecord, StorySchema } from "../types/index.js";
import { randomUUID } from "../util/uuid.js";
import { freezeSchema } from "./freeze.js";
import { generateStorySchema, type BootstrapOptions } from "./generate.js";
import { instantiateFromTemplate, instantiateGeneric, instantiatePlayer } from "./instantiate.js";

export interface ChangeStatModeOptions extends BootstrapOptions {}

function settledSchema(schema: StorySchema, mode: StatMode): StorySchema {
  const next = { ...schema, statMode: mode } as StorySchema & {
    legacyStatMode?: "light";
    migrationPending?: boolean;
  };
  delete next.legacyStatMode;
  delete next.migrationPending;
  return next;
}

async function installModeBoundary(store: Store, storyId: string, mode: StatMode): Promise<void> {
  const idx = await store.messages.nextIdx(storyId);
  await store.messages.insert({
    id: randomUUID(),
    storyId,
    idx,
    role: "system",
    content: mode === "none"
      ? "Stat system changed to No Stats. Mechanics are paused; earlier exchanges and mechanical state are preserved."
      : "Stat system changed to Full Stats. Mechanics begin from this boundary; earlier exchanges are unchanged.",
    createdAt: Date.now(),
  });
}

async function enableGeneratedMechanics(
  router: Router,
  store: Store,
  story: StoryRecord,
  options: ChangeStatModeOptions
): Promise<StoryRecord> {
  const generated = freezeSchema(await generateStorySchema(router, {
    storyId: story.id,
    title: story.title,
    premise: story.schema.premise,
    statMode: "full",
  }, options));
  const schema = settledSchema(generated, "full");
  const roster = await store.characters.listByStory(story.id);
  const record: StoryRecord = { ...story, schema, locked: true };

  await store.transaction(async () => {
    await store.stories.update(record);
    for (const character of roster) {
      if (character.isPlayer) {
        await store.characters.updateHard(character.id, instantiatePlayer(schema, character.id));
        continue;
      }
      const template = schema.npcTemplates.find((candidate) => candidate.templateId === character.hard.templateId);
      const hard = template
        ? instantiateFromTemplate(schema, character.id, template)
        : instantiateGeneric(schema, character.id);
      await store.characters.updateHard(character.id, hard);
    }
    await installModeBoundary(store, story.id, "full");
  });
  return record;
}

/**
 * Changes only future behavior. Full → No Stats preserves the sealed catalog and hard state.
 * No Stats → Full resumes a preserved catalog, or for a native No Stats story forges one before
 * committing anything. A failed forge therefore leaves the story unchanged.
 */
export async function changeStoryStatMode(
  router: Router,
  store: Store,
  storyId: string,
  target: StatMode,
  options: ChangeStatModeOptions = {}
): Promise<StoryRecord> {
  const story = await store.stories.get(storyId);
  if (!story) throw new Error(`Story "${storyId}" not found.`);

  if (story.schema.statMode === target) {
    if (!story.schema.migrationPending) return story;
    const record = { ...story, schema: settledSchema(story.schema, target) };
    await store.transaction(async () => {
      await store.stories.update(record);
      await installModeBoundary(store, storyId, target);
    });
    return record;
  }

  if (target === "none") {
    const record = { ...story, schema: settledSchema(story.schema, "none") };
    await store.transaction(async () => {
      await store.stories.update(record);
      await installModeBoundary(store, storyId, "none");
    });
    return record;
  }

  const hasSealedMechanics = story.schema.actions.length > 0 && story.schema.resources.length > 0;
  if (!hasSealedMechanics) return enableGeneratedMechanics(router, store, story, options);

  const record = { ...story, schema: settledSchema(story.schema, "full") };
  await store.transaction(async () => {
    await store.stories.update(record);
    await installModeBoundary(store, storyId, "full");
  });
  return record;
}
