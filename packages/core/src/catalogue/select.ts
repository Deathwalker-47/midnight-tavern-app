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
 * The plan's two-stage funnel (§5.3) runs only above `SECTION_STAGE_THRESHOLD` candidates — a pool
 * grown by the user's own config (§4c) — first choosing up to `SECTION_PICKS` sections, then entries
 * within them; below it, one call over the whole index is cheaper.
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

/** Above this many candidates, pick sections first (plan 09 §5.3); also the most entries one call lists. */
export const SECTION_STAGE_THRESHOLD = 300;
/** How many sections the first stage keeps. */
export const SECTION_PICKS = 15;

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

export const POOL_SECTION_SYSTEM = [
  "You are the story bootstrapper for a d20 roleplay engine. This is POOL SECTION SELECTION.",
  "The universal pool is too large to list whole. From the SECTIONS, choose the ones this premise will",
  `genuinely use in play — up to ${SECTION_PICKS}, varied, skipping any the premise would never call for.`,
  'Return {"sections":[ids]} with ids copied exactly from the list.',
].join("\n");

/** The section index for the first stage: one line per section that has candidates. */
export function buildSectionSelectionUser(
  premise: string,
  sections: readonly { id: string; title: string; description: string; count: number }[]
): string {
  return [
    "PREMISE:",
    premise,
    "",
    "SECTIONS:",
    ...sections.map((section) => `- ${section.id} · ${section.title} · ${section.description} (${section.count})`),
  ].join("\n");
}

/**
 * Stage one of the funnel: keep the candidates in the sections the model picks (or, if it cannot,
 * the sections holding the most relevant candidates), at most `SECTION_STAGE_THRESHOLD` of them.
 * Below the threshold the ranking passes through untouched.
 */
async function narrowBySection(
  router: Router,
  premise: string,
  ranked: readonly PoolEntry[],
  catalogue: PoolCatalogue,
  signal: AbortSignal
): Promise<PoolEntry[]> {
  if (ranked.length <= SECTION_STAGE_THRESHOLD) return [...ranked];
  const counts = new Map<string, number>();
  for (const entry of ranked) counts.set(entry.section, (counts.get(entry.section) ?? 0) + 1);
  // Sections in the order their most relevant candidate appears: the deterministic choice.
  const firstSeen = [...new Set(ranked.map((entry) => entry.section))];
  const sections = firstSeen.flatMap((id) => {
    const section = catalogue.pool.sections.find((candidate) => candidate.id === id);
    return section ? [{ ...section, count: counts.get(id)! }] : [];
  });
  let chosen = sections.slice(0, SECTION_PICKS).map((section) => section.id);
  try {
    const ids = sections.map((section) => section.id) as [string, ...string[]];
    const answer = await callStructured(
      router,
      "bootstrapper",
      { system: POOL_SECTION_SYSTEM, user: buildSectionSelectionUser(premise, sections) },
      z.object({ sections: z.array(z.enum(ids)).max(SECTION_PICKS * 2) }),
      { maxRepairs: 1, maxTokens: 600, signal }
    );
    const picked = [...new Set(answer.sections)].slice(0, SECTION_PICKS);
    if (picked.length > 0) chosen = picked;
  } catch {
    // The deterministic sections stand; a deadline or abort is honoured by the next stage.
  }
  const kept = new Set(chosen);
  return ranked.filter((entry) => kept.has(entry.section)).slice(0, SECTION_STAGE_THRESHOLD);
}

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

  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort);
  const timer = setTimeout(abort, options.deadlineMs ?? 60_000);
  try {
    const listed = await narrowBySection(router, schema.premise, ranked, catalogue, controller.signal);
    const idsOf = (kind: PoolEntry["kind"]) => {
      const ids = listed.filter((entry) => entry.kind === kind).map((entry) => entry.id);
      return ids.length > 0 ? z.array(z.enum(ids as [string, ...string[]])) : z.array(z.never());
    };
    const answerSchema = z.object({
      actions: idsOf("action").max(POOL_SELECTION_TARGET.actions.max * 2),
      skills: idsOf("skill").max(POOL_SELECTION_TARGET.skills.max * 2),
    });
    const answer = await callStructured(
      router,
      "bootstrapper",
      { system: POOL_SELECTION_SYSTEM, user: buildPoolSelectionUser(schema.premise, listed) },
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
