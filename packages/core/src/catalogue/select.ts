/**
 * Forge-time pool selection (plan 09 §5). After the rulebook is sealed, the forge picks universal-pool
 * entries to enable on top of the actions and skills it authored itself (the forge stays hybrid until
 * the pool can carry a story alone).
 *
 *   1. Deterministic candidates: entries that fit the premise's setting (`settingFit`, inferred from
 *      the premise) and that this rulebook can actually express (`materializeEntry` succeeds).
 *   2. One bounded model call picks ids from a compact index of those candidates; its answer is a
 *      sealed enum, so it cannot name anything outside the pool.
 *   3. A short or failed answer is topped up — or replaced — by a deterministic premise-relevance
 *      ranking, so selection can never fail story creation.
 *
 * The plan's two-stage funnel (sections first, then entries) only pays off once the candidate index
 * is far larger than one prompt; with today's pool a single call is cheaper. `SECTION_STAGE_THRESHOLD`
 * marks where that changes.
 */
import { z } from "zod";
import { callStructured, type Router } from "../router/index.js";
import type { StorySchema } from "../types/index.js";
import type { PoolEntry, SettingFit } from "../config/index.js";
import { isWeaponSpecial, materializeEntry, SHIPPED_CATALOGUE, type PoolCatalogue } from "./materialize.js";

/** How many pool entries a forged story gains, on top of what it authored. */
export const POOL_SELECTION_TARGET = {
  actions: { min: 12, max: 24 },
  skills: { min: 2, max: 6 },
} as const;

/** Above this many candidates, pick sections first (plan 09 §5.3) — not needed yet. */
export const SECTION_STAGE_THRESHOLD = 300;

const SETTING_CUES: ReadonlyArray<readonly [SettingFit, RegExp]> = [
  ["fantasy", /\b(magic|wizard|witch|dragon|elf|elves|dwarf|orc|kingdom|castle|knight|sorcer\w*|spell|enchant\w*|sword|guild|tavern|realm|necromancer|paladin|mage)\b/i],
  ["scifi", /\b(space|starship|spaceship|galaxy|planet|android|robot|cyber\w*|laser|alien|colony|orbital|hacker|mech|ai)\b/i],
  ["modern", /\b(phone|smartphone|car|police|detective|city|internet|computer|apartment|office|school|college|gun|pistol|corporate|hospital)\b/i],
  ["historical", /\b(century|roman|victorian|medieval|empire|samurai|pharaoh|viking|feudal|renaissance|regency)\b/i],
  ["horror", /\b(horror|haunted|ghost|zombie|undead|curse[ds]?|demon|nightmare|eldritch|vampire|terror)\b/i],
  ["post_apocalyptic", /\b(wasteland|apocalypse|post-apocalyptic|fallout|ruins|survivors?|scavengers?|collapse)\b/i],
];

/** Settings the premise points at; always includes "any". */
export function inferSettingFits(premise: string): SettingFit[] {
  return ["any", ...SETTING_CUES.filter(([, cue]) => cue.test(premise)).map(([setting]) => setting)];
}

/** Entries that fit the setting and that this rulebook can express, in pool order. */
export function poolCandidates(
  schema: StorySchema,
  settings: readonly SettingFit[],
  catalogue: PoolCatalogue = SHIPPED_CATALOGUE
): PoolEntry[] {
  const fits = new Set(settings);
  const present = new Set([...schema.actions.map((action) => action.id), ...schema.skills.map((skill) => skill.id)]);
  // Weapon specials arrive with the gear that grants them (loot), never at creation.
  return catalogue.pool.entries.filter(
    (entry) =>
      !entry.excluded &&
      !present.has(entry.id) &&
      !isWeaponSpecial(entry, catalogue) &&
      entry.settingFit.some((fit) => fits.has(fit)) &&
      materializeEntry(schema, entry.id, catalogue).ok
  );
}

const WORD = /[a-z]{4,}/g;

/** How many premise words an entry mentions in its name, description, aliases or tags. */
function relevance(entry: PoolEntry, premiseWords: ReadonlySet<string>): number {
  const text = [entry.name, entry.description, ...(entry.aliases ?? []), ...entry.tags].join(" ");
  const words = new Set(text.toLowerCase().match(WORD) ?? []);
  return [...words].filter((word) => premiseWords.has(word)).length;
}

/** Candidates ranked by premise relevance, ties in pool order — the deterministic fallback order. */
export function rankCandidates(candidates: readonly PoolEntry[], premise: string): PoolEntry[] {
  const premiseWords = new Set(premise.toLowerCase().match(WORD) ?? []);
  return candidates
    .map((entry, index) => ({ entry, index, score: relevance(entry, premiseWords) }))
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ entry }) => entry);
}

export const POOL_SELECTION_SYSTEM = [
  "You are the story bootstrapper for a d20 roleplay engine. This is POOL SELECTION.",
  "The story's rulebook is already written. From the UNIVERSAL POOL INDEX, choose extra actions and",
  "skills that this premise will genuinely use in play — everyday social, exploration, craft and care",
  "moves the authored catalogue may lack. Prefer variety across sections; skip anything the premise",
  "would never call for. Choosing an entry only makes it exist in this world; it teaches nobody anything.",
  `Return {"actions":[ids],"skills":[ids]} with ${POOL_SELECTION_TARGET.actions.min}-${POOL_SELECTION_TARGET.actions.max} action ids and ${POOL_SELECTION_TARGET.skills.min}-${POOL_SELECTION_TARGET.skills.max} skill ids, copied exactly from the index.`,
].join("\n");

/** The compact index the model chooses from: one line per candidate. */
export function buildPoolSelectionUser(premise: string, candidates: readonly PoolEntry[]): string {
  const line = (entry: PoolEntry) => `- ${entry.id} · ${entry.name} · ${entry.description}`;
  return [
    "PREMISE:",
    premise,
    "",
    "UNIVERSAL POOL INDEX — ACTIONS:",
    ...candidates.filter((entry) => entry.kind === "action").map(line),
    "",
    "UNIVERSAL POOL INDEX — SKILLS:",
    ...candidates.filter((entry) => entry.kind === "skill").map(line),
  ].join("\n");
}

export interface PoolSelection {
  ids: string[];
  /** "model" when the model's picks were used (possibly topped up), else "fallback". */
  via: "model" | "fallback";
  settings: SettingFit[];
}

export interface SelectPoolOptions {
  catalogue?: PoolCatalogue;
  signal?: AbortSignal;
  /** Deadline for the model call; on expiry the deterministic ranking is used. */
  deadlineMs?: number;
}

/** Fill each kind up to its minimum (and trim to its maximum) from the deterministic ranking. */
function complete(picks: readonly string[], ranked: readonly PoolEntry[]): string[] {
  const kindOf = new Map(ranked.map((entry) => [entry.id, entry.kind]));
  const chosen: string[] = [];
  const count = (kind: PoolEntry["kind"]) => chosen.filter((id) => kindOf.get(id) === kind).length;
  const cap = (kind: PoolEntry["kind"]) => POOL_SELECTION_TARGET[kind === "action" ? "actions" : "skills"];
  for (const id of picks) {
    const kind = kindOf.get(id);
    if (kind && !chosen.includes(id) && count(kind) < cap(kind).max) chosen.push(id);
  }
  for (const entry of ranked) {
    if (!chosen.includes(entry.id) && count(entry.kind) < cap(entry.kind).min) chosen.push(entry.id);
  }
  return chosen;
}

/** Pick pool entries for a freshly sealed rulebook. Never throws, except when the caller aborts. */
export async function selectPoolEntries(
  router: Router,
  schema: StorySchema,
  options: SelectPoolOptions = {}
): Promise<PoolSelection> {
  const catalogue = options.catalogue ?? SHIPPED_CATALOGUE;
  const settings = inferSettingFits(schema.premise);
  const ranked = rankCandidates(poolCandidates(schema, settings, catalogue), schema.premise);
  if (ranked.length === 0) return { ids: [], via: "fallback", settings };
  const actionIds = ranked.filter((entry) => entry.kind === "action").map((entry) => entry.id);
  const skillIds = ranked.filter((entry) => entry.kind === "skill").map((entry) => entry.id);
  const idsOf = (ids: string[]) =>
    ids.length > 0 ? z.array(z.enum(ids as [string, ...string[]])) : z.array(z.never());
  const answerSchema = z.object({
    actions: idsOf(actionIds).max(POOL_SELECTION_TARGET.actions.max * 2),
    skills: idsOf(skillIds).max(POOL_SELECTION_TARGET.skills.max * 2),
  });

  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort);
  const timer = setTimeout(abort, options.deadlineMs ?? 60_000);
  try {
    const answer = await callStructured(
      router,
      "bootstrapper",
      { system: POOL_SELECTION_SYSTEM, user: buildPoolSelectionUser(schema.premise, ranked) },
      answerSchema,
      { maxRepairs: 1, maxTokens: 1_500, signal: controller.signal }
    );
    return { ids: complete([...answer.actions, ...answer.skills], ranked), via: "model", settings };
  } catch {
    options.signal?.throwIfAborted();
    return { ids: complete([], ranked), via: "fallback", settings };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
