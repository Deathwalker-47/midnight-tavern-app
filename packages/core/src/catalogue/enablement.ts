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
import { materializeEntry, SHIPPED_CATALOGUE, type PoolCatalogue } from "./materialize.js";

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
  return effectiveSchema(frozen, await store.poolEnablements.list(story.id));
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

/**
 * Enable a pool entry, plus any skill entry it needs that the story does not already have. Already
 * enabled (or forged into the rulebook) is a no-op success. All-or-nothing, journalled per entry.
 */
export async function enablePoolEntry(
  store: Store,
  storyId: string,
  entryId: string,
  options: EnableOptions
): Promise<EnableResult> {
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
  const catalogue = options.catalogue ?? SHIPPED_CATALOGUE;

  const additions: PoolEnablement[] = [];
  const queue = [entryId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (present.has(id)) continue;
    const materialized = materializeEntry(frozen, id, catalogue);
    if (!materialized.ok) return { ok: false, reason: materialized.reason };
    present.add(id);
    additions.push({
      storyId,
      entryId: id,
      kind: materialized.kind,
      definition: materialized.definition,
      source: options.source,
      enabledAt: now(),
      ...(options.turnIndex !== undefined ? { turnIndex: options.turnIndex } : {}),
    } as PoolEnablement);
    queue.push(...materialized.requires);
  }
  if (additions.length === 0) return { ok: true, enabled: [] };

  const turnIndex = options.turnIndex ?? (await store.messages.nextIdx(storyId));
  await store.transaction(async () => {
    for (const [index, enablement] of additions.entries()) {
      await store.poolEnablements.upsert(enablement);
      await store.events.insert({
        id: randomUUID(),
        storyId,
        turnIndex,
        kind: "pool_enabled",
        payload: {
          entryId: enablement.entryId,
          kind: enablement.kind,
          name: enablement.kind === "action" ? enablement.definition.label : enablement.definition.name,
          source: enablement.source,
        },
        rulebookVersion: story.rulebookVersion ?? 1,
        // Distinct timestamps keep the journal in enable order (same-instant rows tie-break by id).
        createdAt: enablement.enabledAt + index,
      });
    }
  });
  return { ok: true, enabled: additions.map((enablement) => enablement.entryId) };
}

export type DisableCheck = { allowed: true } | { allowed: false; reason: string };

/** Whether an enabled entry may be disabled now (D8), with the honest reason when not. */
export async function mayDisablePoolEntry(
  store: Store,
  storyId: string,
  entryId: string
): Promise<DisableCheck> {
  const enablements = await store.poolEnablements.list(storyId);
  const target = enablements.find((enablement) => enablement.entryId === entryId);
  if (!target) return { allowed: false, reason: "That entry is not enabled in this story." };
  const learners = (await store.characters.listByStory(storyId))
    .filter((character) => character.hard.skills.some((skill) => skill.skillId === entryId))
    .map((character) => character.name);
  if (learners.length > 0) {
    return {
      allowed: false,
      reason: `${learners.join(", ")} ${learners.length === 1 ? "has" : "have"} learned this, so it stays.`,
    };
  }
  const dependants = enablements
    .filter((enablement) => enablement.kind === "action" && enablement.definition.requiresSkill === entryId)
    .map((enablement) => (enablement.kind === "action" ? enablement.definition.label : ""));
  if (dependants.length > 0) {
    return { allowed: false, reason: `${dependants.join(", ")} still ${dependants.length === 1 ? "needs" : "need"} it; disable ${dependants.length === 1 ? "that" : "those"} first.` };
  }
  return { allowed: true };
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
