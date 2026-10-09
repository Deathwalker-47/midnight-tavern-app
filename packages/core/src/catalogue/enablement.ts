/**
 * Story enablement (plan 09 §3, §6, §7.2) — which universal-pool entries exist in one story.
 *
 * Enabling an entry adds it to the story's catalogue; it NEVER gives any character the skill
 * (§3.1 — only the ledger teaches). The forge, the player (by hand) and, from S13, the analyzer
 * (guarded) may enable. Each enablement snapshots the entry materialized against the story's frozen
 * rulebook, so the effective rulebook is simply the frozen one plus those snapshots — no pool lookup
 * at runtime, and a later app update that retunes the pool never changes a running story.
 *
 * Timeline: an enablement a turn made carries that turn's index and is removed when the turn is
 * rewound or deleted, with the turn's other events. Forge and player choices are settings, not
 * timeline state, and survive rewinds.
 *
 * Disabling is refused while any character has learned the entry (owner decision D8) or while an
 * enabled action still needs it; the reason names who or what, so the player knows what to do.
 */
import { randomUUID } from "../util/uuid.js";
import type { PoolEnablement, PoolEnablementSource, Store } from "../store/index.js";
import type { StoryRecord, StorySchema } from "../types/index.js";
import { applyUniversalActionDefaults } from "../config/index.js";
import type { PoolCatalogue } from "./materialize.js";
import { disableRefusal, grantorsByEntry, planEnablement, tierLock } from "./plan.js";
import { learnersBySkill, type PoolBrowseContext } from "./browse.js";
import { catalogueOf, configForStory, enablementsForPlay } from "./storyConfig.js";

/** The frozen rulebook plus every enabled entry. Frozen definitions win any id collision. */
export function effectiveSchema(
  schema: StorySchema,
  enablements: readonly PoolEnablement[]
): StorySchema {
  if (enablements.length === 0) return schema;
  const actionIds = new Set(schema.actions.map((action) => action.id));
  const skillIds = new Set(schema.skills.map((skill) => skill.id));
  const actions = [...schema.actions];
  const skills = [...schema.skills];
  for (const enablement of enablements) {
    if (enablement.kind === "action" && !actionIds.has(enablement.entryId)) {
      actions.push(enablement.definition);
    } else if (enablement.kind === "skill" && !skillIds.has(enablement.entryId)) {
      skills.push(enablement.definition);
    }
  }
  return { ...schema, actions, skills };
}

/** The rulebook a story actually plays by now: frozen, universal defaults applied, plus its pool. */
export async function loadEffectiveSchema(store: Store, story: StoryRecord): Promise<StorySchema> {
  const frozen = applyUniversalActionDefaults(story.schema);
  return effectiveSchema(frozen, enablementsForPlay(story, await store.poolEnablements.list(story.id)));
}

export interface EnableOptions {
  source: PoolEnablementSource;
  /** Only for enablements a turn makes: the turn's index, so rewinding it removes them. */
  turnIndex?: number;
  now?: () => number;
  catalogue?: PoolCatalogue;
}

export type EnableResult =
  | { ok: true; enabled: string[] }
  | { ok: false; reason: string };

/** An enablement checked and ready to write: the rows and the journal turn they belong to. */
export interface StagedEnablement {
  storyId: string;
  rulebookVersion: number;
  turnIndex: number;
  additions: PoolEnablement[];
}

/**
 * Check an enablement without writing anything: the entry plus any skill entry it needs that the
 * story does not already have, all-or-nothing. Outside the forge, every part must have unlocked by
 * tier (`tierLock`). Already enabled (or forged into the rulebook) stages nothing.
 */
export async function stagePoolEnablement(
  store: Store,
  storyId: string,
  entryId: string,
  options: EnableOptions
): Promise<{ ok: true; staged: StagedEnablement } | { ok: false; reason: string }> {
  const story = await store.stories.get(storyId);
  if (!story) return { ok: false, reason: `Unknown story "${storyId}".` };
  const frozen = applyUniversalActionDefaults(story.schema);
  const existing = await store.poolEnablements.list(storyId);
  const present = new Set([
    ...existing.map((enablement) => enablement.entryId),
    ...frozen.actions.map((action) => action.id),
    ...frozen.skills.map((skill) => skill.id),
  ]);
  const now = options.now ?? Date.now;
  const catalogue = options.catalogue ?? catalogueOf(configForStory(story));
  const plan = planEnablement(frozen, present, entryId, catalogue);
  if (!plan.ok) return plan;
  if (options.source !== "forge") {
    const locked = tierLock(plan.additions, (await store.chapters.listByStory(storyId)).length, catalogue);
    if (locked) return { ok: false, reason: locked };
  }
  const additions = plan.additions.map(
    (planned): PoolEnablement => ({
      ...planned,
      storyId,
      source: options.source,
      enabledAt: now(),
      ...(options.turnIndex !== undefined ? { turnIndex: options.turnIndex } : {}),
    })
  );
  const turnIndex = options.turnIndex ?? (additions.length > 0 ? await store.messages.nextIdx(storyId) : 0);
  return { ok: true, staged: { storyId, rulebookVersion: story.rulebookVersion ?? 1, turnIndex, additions } };
}

/**
 * Write a staged enablement and journal each entry (`pool_enabled`). Opens no transaction of its own,
 * so a caller already inside one (a turn's commit) can include it; everyone else uses
 * {@link enablePoolEntry}.
 */
export async function writeStagedEnablement(store: Store, staged: StagedEnablement): Promise<string[]> {
  for (const [index, enablement] of staged.additions.entries()) {
    await store.poolEnablements.upsert(enablement);
    await store.events.insert({
      id: randomUUID(),
      storyId: staged.storyId,
      turnIndex: staged.turnIndex,
      kind: "pool_enabled",
      payload: {
        entryId: enablement.entryId,
        kind: enablement.kind,
        name: enablement.kind === "action" ? enablement.definition.label : enablement.definition.name,
        source: enablement.source,
      },
      rulebookVersion: staged.rulebookVersion,
      // Distinct timestamps keep the journal in enable order (same-instant rows tie-break by id).
      createdAt: enablement.enabledAt + index,
    });
  }
  return staged.additions.map((enablement) => enablement.entryId);
}

/**
 * Enable a pool entry, plus any skill entry it needs that the story does not already have. Already
 * enabled (or forged into the rulebook) is a no-op success. All-or-nothing, journalled per entry, in
 * its own transaction. Outside the forge, every part must have unlocked by tier (`tierLock`).
 */
export async function enablePoolEntry(
  store: Store,
  storyId: string,
  entryId: string,
  options: EnableOptions
): Promise<EnableResult> {
  const staged = await stagePoolEnablement(store, storyId, entryId, options);
  if (!staged.ok) return staged;
  if (staged.staged.additions.length === 0) return { ok: true, enabled: [] };
  const enabled = await store.transaction(() => writeStagedEnablement(store, staged.staged));
  return { ok: true, enabled };
}

export type DisableCheck = { allowed: true } | { allowed: false; reason: string };

/** Entry id → the held items that grant it, named by holder, across a stored story's cast. */
async function loadGrantors(store: Store, storyId: string): Promise<Map<string, string[]>> {
  const definitions = new Map((await store.runtimeItems.listDefinitions(storyId)).map((item) => [item.id, item]));
  const holders = [];
  for (const character of await store.characters.listByStory(storyId)) {
    const items = (await store.runtimeItems.listInventory(character.id)).flatMap((instance) => {
      const definition = definitions.get(instance.definitionId);
      return definition ? [definition] : [];
    });
    holders.push({ name: character.name, items });
  }
  return grantorsByEntry(holders);
}

/** Whether an enabled entry may be disabled now (D8), with the honest reason when not. */
export async function mayDisablePoolEntry(
  store: Store,
  storyId: string,
  entryId: string
): Promise<DisableCheck> {
  const enablements = await store.poolEnablements.list(storyId);
  const learners = (await store.characters.listByStory(storyId))
    .filter((character) => character.hard.skills.some((skill) => skill.skillId === entryId))
    .map((character) => character.name);
  const grantors = (await loadGrantors(store, storyId)).get(entryId) ?? [];
  const reason = disableRefusal(enablements, learners, entryId, grantors);
  return reason ? { allowed: false, reason } : { allowed: true };
}

/** Disable an enabled entry if D8 allows it; journalled. */
export async function disablePoolEntry(
  store: Store,
  storyId: string,
  entryId: string,
  options: { now?: () => number } = {}
): Promise<DisableCheck> {
  const check = await mayDisablePoolEntry(store, storyId, entryId);
  if (!check.allowed) return check;
  const story = (await store.stories.get(storyId))!;
  const turnIndex = await store.messages.nextIdx(storyId);
  await store.transaction(async () => {
    await store.poolEnablements.delete(storyId, entryId);
    await store.events.insert({
      id: randomUUID(),
      storyId,
      turnIndex,
      kind: "pool_disabled",
      payload: { entryId },
      rulebookVersion: story.rulebookVersion ?? 1,
      createdAt: (options.now ?? Date.now)(),
    });
  });
  return check;
}

/** Gather what the pool browser needs about one stored story (`browse.ts`). */
export async function loadPoolBrowseContext(store: Store, storyId: string): Promise<PoolBrowseContext> {
  const story = await store.stories.get(storyId);
  if (!story) throw new Error(`Unknown story "${storyId}".`);
  const characters = await store.characters.listByStory(storyId);
  return {
    frozen: applyUniversalActionDefaults(story.schema),
    enablements: await store.poolEnablements.list(storyId),
    learners: learnersBySkill(
      characters.map((character) => ({
        name: character.name,
        skillIds: character.hard.skills.map((skill) => skill.skillId),
      }))
    ),
    grantors: await loadGrantors(store, storyId),
    completedChapters: (await store.chapters.listByStory(storyId)).length,
    catalogue: catalogueOf(configForStory(story)),
  };
}
