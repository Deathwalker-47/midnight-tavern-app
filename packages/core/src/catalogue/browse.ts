/**
 * The pool browser's reads (plan 09 §7, design brief §5b) — what a story may do with each universal
 * pool entry, shared by both UI bridges so they cannot disagree. Pure.
 *
 * Built for a pool of thousands (plan 09 §7.1): the section index is one pass with no
 * materialization, and a page of entries — one section's, or one search's — materializes only the
 * entries on that page.
 *
 * An entry is in exactly one state:
 *   - enabled     — in this story; `reason` says why it may not be disabled now (D8 names who
 *                   learned it), and is absent when it may;
 *   - available   — may be enabled now; `bringsWith` names what would come with it;
 *   - locked      — fits the story but its tier has not unlocked yet (`tierLock`);
 *   - unavailable — the story cannot express it (a pool it lacks, a no-stats story);
 *   - excluded    — never offered by any story (plan 09 §4b.2), with the pool's own reason.
 */
import type { ItemTier, StorySchema } from "../types/index.js";
import type { PoolEnablementSource } from "../store/repositories/poolEnablements.js";
import type { PoolEntry } from "../config/index.js";
import { SHIPPED_CATALOGUE, type PoolCatalogue } from "./materialize.js";
import { disableRefusal, planEnablement, poolTier, tierLock, type PlannedEnablement } from "./plan.js";

export type PoolEntryState = "enabled" | "available" | "locked" | "unavailable" | "excluded";

/** One section of the pool with how much of it this story has enabled ("12 of 47"). */
export interface PoolSectionView {
  id: string;
  title: string;
  description: string;
  /** Entries any story may be offered (excluded ones are not counted). */
  offered: number;
  enabled: number;
}

export interface PoolBrowseEntry {
  entryId: string;
  name: string;
  kind: "action" | "skill";
  sectionId: string;
  description: string;
  /** The pool tier (common … mythical); absent only for an entry whose archetype is missing. */
  tier?: ItemTier;
  state: PoolEntryState;
  /** Who enabled it — enabled entries only, and never for one sealed into the forged rulebook. */
  source?: PoolEnablementSource;
  reason?: string;
  /** Available entries only: the names of what enabling it would also enable. */
  bringsWith?: string[];
}

/** One section's entries, or a search across the pool (both narrow when both are given). */
export interface PoolBrowseQuery {
  sectionId?: string;
  search?: string;
  offset?: number;
  limit?: number;
}

export interface PoolBrowsePage {
  entries: PoolBrowseEntry[];
  /** Matches before paging. */
  total: number;
  offset: number;
}

export const POOL_PAGE_SIZE = 40;
export const MAX_POOL_PAGE = 200;

/** Everything a browse needs about one story, gathered by whichever backend holds it. */
export interface PoolBrowseContext {
  /** The frozen rulebook the story was forged with (enablements not applied). */
  frozen: StorySchema;
  enablements: readonly (PlannedEnablement & { source: PoolEnablementSource })[];
  /** Skill id → the names of the characters who have learned it. */
  learners: ReadonlyMap<string, readonly string[]>;
  /** Entry id → the held items that grant it ("Ari's Flamebrand"), from `grantorsByEntry`. */
  grantors?: ReadonlyMap<string, readonly string[]>;
  completedChapters: number;
  catalogue?: PoolCatalogue;
}

/** Index who has learned what, from each character's learned skill ids. */
export function learnersBySkill(
  characters: readonly { name: string; skillIds: readonly string[] }[]
): Map<string, string[]> {
  const learners = new Map<string, string[]>();
  for (const character of characters) {
    for (const skillId of new Set(character.skillIds)) {
      learners.set(skillId, [...(learners.get(skillId) ?? []), character.name]);
    }
  }
  return learners;
}

function enabledIds(context: PoolBrowseContext): Set<string> {
  return new Set([
    ...context.enablements.map((enablement) => enablement.entryId),
    ...context.frozen.actions.map((action) => action.id),
    ...context.frozen.skills.map((skill) => skill.id),
  ]);
}

/** The pool's sections in order, each with its offered and enabled counts. */
export function poolSections(context: PoolBrowseContext): PoolSectionView[] {
  const catalogue = context.catalogue ?? SHIPPED_CATALOGUE;
  const enabled = enabledIds(context);
  const counts = new Map<string, { offered: number; enabled: number }>();
  for (const entry of catalogue.pool.entries) {
    if (entry.excluded) continue;
    const count = counts.get(entry.section) ?? { offered: 0, enabled: 0 };
    count.offered++;
    if (enabled.has(entry.id)) count.enabled++;
    counts.set(entry.section, count);
  }
  return catalogue.pool.sections.map((section) => ({
    id: section.id,
    title: section.title,
    description: section.description,
    offered: counts.get(section.id)?.offered ?? 0,
    enabled: counts.get(section.id)?.enabled ?? 0,
  }));
}

/** Every token must appear somewhere in the entry's words; name hits rank first. */
function searchRank(entry: PoolEntry, sectionTitle: string, tokens: readonly string[]): number | undefined {
  const name = entry.name.toLowerCase();
  const words = [
    name,
    entry.description,
    sectionTitle,
    entry.kind,
    ...(entry.aliases ?? []),
    ...entry.tags.map((tag) => tag.replace(/_/g, " ")),
  ]
    .join(" ")
    .toLowerCase();
  if (!tokens.every((token) => words.includes(token))) return undefined;
  return tokens.every((token) => name.includes(token)) ? 0 : 1;
}

/** One page of pool entries with what this story may do with each. */
export function browsePool(context: PoolBrowseContext, query: PoolBrowseQuery = {}): PoolBrowsePage {
  const catalogue = context.catalogue ?? SHIPPED_CATALOGUE;
  const titles = new Map(catalogue.pool.sections.map((section) => [section.id, section.title]));
  const tokens = (query.search ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const matches = catalogue.pool.entries
    .filter((entry) => query.sectionId === undefined || entry.section === query.sectionId)
    .map((entry, order) => ({ entry, order, rank: searchRank(entry, titles.get(entry.section) ?? "", tokens) }))
    .filter((match): match is typeof match & { rank: number } => match.rank !== undefined)
    .sort((left, right) => left.rank - right.rank || left.order - right.order);

  const offset = Math.max(0, Math.floor(query.offset ?? 0));
  const limit = Math.min(MAX_POOL_PAGE, Math.max(1, Math.floor(query.limit ?? POOL_PAGE_SIZE)));
  const enabledById = new Map(context.enablements.map((enablement) => [enablement.entryId, enablement]));
  const present = enabledIds(context);

  const entries = matches.slice(offset, offset + limit).map(({ entry }): PoolBrowseEntry => {
    const tier = poolTier(entry.id, catalogue);
    const base = {
      entryId: entry.id,
      name: entry.name,
      kind: entry.kind,
      sectionId: entry.section,
      description: entry.description,
      ...(tier ? { tier } : {}),
    };
    if (entry.excluded) {
      return { ...base, state: "excluded", ...(entry.exclusionReason ? { reason: entry.exclusionReason } : {}) };
    }
    const enablement = enabledById.get(entry.id);
    if (enablement) {
      const reason = disableRefusal(
        context.enablements,
        context.learners.get(entry.id) ?? [],
        entry.id,
        context.grantors?.get(entry.id) ?? []
      );
      return { ...base, state: "enabled", source: enablement.source, ...(reason ? { reason } : {}) };
    }
    if (present.has(entry.id)) {
      return { ...base, state: "enabled", reason: "Part of this story's sealed rulebook, so it stays." };
    }
    const plan = planEnablement(context.frozen, present, entry.id, catalogue);
    if (!plan.ok) return { ...base, state: "unavailable", reason: plan.reason };
    const locked = tierLock(plan.additions, context.completedChapters, catalogue);
    if (locked) return { ...base, state: "locked", reason: locked };
    const bringsWith = plan.additions
      .filter((addition) => addition.entryId !== entry.id)
      .map((addition) => (addition.kind === "action" ? addition.definition.label : addition.definition.name));
    return { ...base, state: "available", ...(bringsWith.length > 0 ? { bringsWith } : {}) };
  });
  return { entries, total: matches.length, offset };
}
