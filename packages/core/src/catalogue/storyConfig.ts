/**
 * Which universal config a story plays by (plan 09 §4c.9–4c.10).
 *
 * The app resolves the user's override files once at start (and on reload) into the *active* config.
 * New stories are created from it and snapshot the override texts they were created with. From then
 * on a story is either:
 *   - **locked to creation** (the default): its config is its snapshot, re-resolved over the shipped
 *     files, so later edits to the user's files never reach it; or
 *   - **following edits**: it plays by the active config, and its enabled pool entries are
 *     re-materialized from it on every load.
 * Either way, enablements already snapshot their definitions and committed rulings are never
 * recomputed (§4c.12) — only future resolution can change.
 */
import {
  applyUniversalActionDefaults,
  configHash,
  ConfigOverrideTextsSchema,
  resolveConfig,
  SHIPPED_CONFIG,
  type ConfigOverrideTexts,
  type ResolvedConfig,
} from "../config/index.js";
import type { Store } from "../store/index.js";
import type { StoryRecord } from "../types/index.js";
import { materializeEntry, type PoolCatalogue } from "./materialize.js";
import type { PlannedEnablement } from "./plan.js";

export type RulebookConfigMode = "locked" | "follow";

let active: ResolvedConfig = SHIPPED_CONFIG;
const resolved = new Map<string, ResolvedConfig>();

function resolveCached(texts: ConfigOverrideTexts): ResolvedConfig {
  const hash = configHash(texts);
  const cached = resolved.get(hash);
  if (cached) return cached;
  const config = resolveConfig(texts);
  resolved.set(hash, config);
  return config;
}

/** The config new stories are created from and following stories play by. */
export function activeConfig(): ResolvedConfig {
  return active;
}

/** Install the user's override texts as the active config; returns it, issues included. */
export function installConfigOverrides(texts: ConfigOverrideTexts): ResolvedConfig {
  active = resolveCached(texts);
  return active;
}

/** The pool half of a resolved config, in the shape every catalogue function takes. */
export function catalogueOf(config: ResolvedConfig): PoolCatalogue {
  return { archetypes: config.archetypes, pool: config.pool };
}

export function rulebookConfigMode(story: Pick<StoryRecord, "configSnapshot">): RulebookConfigMode {
  return story.configSnapshot?.["rulebookConfig"] === "follow" ? "follow" : "locked";
}

/** The config this story plays by now. */
export function configForStory(story: Pick<StoryRecord, "configSnapshot">): ResolvedConfig {
  if (rulebookConfigMode(story) === "follow") return active;
  const texts = ConfigOverrideTextsSchema.safeParse(story.configSnapshot?.["configOverrides"] ?? {});
  return texts.success ? resolveCached(texts.data) : SHIPPED_CONFIG;
}

/**
 * A story's config snapshot recording the config it is (re)forged from: the override texts and their
 * hash, or neither for the shipped defaults. Everything else in the snapshot is kept.
 */
export function snapshotConfig(
  base: Record<string, unknown> | undefined,
  config: ResolvedConfig = active
): Record<string, unknown> {
  const { configOverrides: _texts, configHash: _hash, ...rest } = base ?? {};
  return { ...rest, ...(config.hash ? { configOverrides: { ...config.texts }, configHash: config.hash } : {}) };
}

/**
 * A following story's enablements, re-materialized from the active config; a locked story's as they
 * were snapshotted. An entry the active config can no longer express keeps its snapshot, so nothing a
 * character relies on disappears mid-story.
 */
export function enablementsForPlay<T extends PlannedEnablement>(
  story: Pick<StoryRecord, "configSnapshot" | "schema">,
  enablements: readonly T[]
): T[] {
  if (rulebookConfigMode(story) !== "follow") return [...enablements];
  const catalogue = catalogueOf(active);
  const frozen = applyUniversalActionDefaults(story.schema);
  return enablements.map((enablement) => {
    const current = materializeEntry(frozen, enablement.entryId, catalogue);
    return current.ok && current.kind === enablement.kind ? { ...enablement, definition: current.definition } : enablement;
  });
}

/**
 * Lock a story to the config it was created with, or let it follow the user's edits. Switching only
 * changes how future turns resolve; nothing already played is recomputed (§4c.12).
 */
export async function setRulebookConfigMode(store: Store, storyId: string, mode: RulebookConfigMode): Promise<StoryRecord> {
  const story = await store.stories.get(storyId);
  if (!story) throw new Error(`Unknown story "${storyId}".`);
  const configSnapshot = { ...(story.configSnapshot ?? {}), rulebookConfig: mode };
  await store.stories.setRuntimeConfig(storyId, { ...story, configSnapshot });
  return { ...story, configSnapshot };
}
