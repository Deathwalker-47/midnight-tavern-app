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
import { randomUUID } from "node:crypto";
import type { Router } from "../router/index.js";
import type { Store } from "../store/index.js";
import type { StorySchema, StoryRecord } from "../types/index.js";
import { validateStorySchema } from "./validate.js";
import { deterministicRepair } from "./repair.js";
import { instantiatePlayer } from "./instantiate.js";
import { generateStorySchema, type BootstrapInput, type BootstrapOptions } from "./generate.js";

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
  const generated = await generateStorySchema(router, input, options);
  const schema = freezeSchema(generated);

  const story: StoryRecord = {
    id: input.storyId,
    title: input.title,
    createdAt: Date.now(),
    schema,
    locked: true,
  };

  const playerCharacterId = player.characterId ?? randomUUID();
  const hard = instantiatePlayer(schema, playerCharacterId);

  await store.transaction(async () => {
    await store.stories.insert(story);
    await store.characters.insert({
      id: playerCharacterId,
      storyId: input.storyId,
      name: player.name,
      isPlayer: true,
      hard,
    });
  });

  return { story, playerCharacterId };
}
