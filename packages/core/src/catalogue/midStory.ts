/**
 * Mid-story enablement (plan 09 §6, owner decision D9) — the analyzer may add a pool entry when the
 * story itself calls for it. It runs after a committed turn, off the critical path, and every guard is
 * engine-owned:
 *
 *   - Sealed source: the model answers with ids from a Zod enum of eligible candidates.
 *   - Skill-gated only (action-plan decision): skills, and actions that need a skill. Enabling such an
 *     entry gives nobody any power — a character must still learn the skill through the ledger — so a
 *     model can never hand out an at-will ability.
 *   - Tier gate: an entry's tier — and that of anything it brings — unlocks only after enough
 *     completed chapters (`TIER_UNLOCK_CHAPTERS`, shared with the player's own toggles); a legendary
 *     skill cannot appear in chapter one, and mythical ones never arrive this way.
 *   - Rate limit: at most `ANALYZER_ENABLEMENTS_PER_CHAPTER` entries per chapter, counting every entry
 *     a proposal brings with it (an action's skill, a reaction's pair).
 *   - Cost: the model is only asked when the turn shows a learning cue (someone teaches, trains, a new
 *     discipline appears) and budget remains — not every turn.
 *   - Enable ≠ learn, own transaction per enablement, journalled (`pool_enabled`, source "analyzer"),
 *     turn-scoped so rewinding the turn removes it. Any failure is swallowed: it never fails a turn.
 */
import { z } from "zod";
import { callStructured, type Router } from "../router/index.js";
import type { Store } from "../store/index.js";
import type { StorySchema } from "../types/index.js";
import type { PoolEntry } from "../config/index.js";
import { enablePoolEntry, loadEffectiveSchema } from "./enablement.js";
import { SHIPPED_CATALOGUE, type PoolCatalogue } from "./materialize.js";
import { planEnablement, tierLock } from "./plan.js";
import { inferSettingFits } from "./select.js";

export const ANALYZER_ENABLEMENTS_PER_CHAPTER = 2;

/**
 * Words that suggest the story is reaching for a new discipline. Deliberately narrow: "study" and
 * "examine" mean looking closely far more often than training, and every match costs a model call.
 */
export const LEARNING_CUE =
  /\b(teach(es|ing)?|taught|train(s|ed|ing)?|learn(s|ed|t|ing)? (to|how|the art|magic|a skill|a technique)|apprentice\w*|mentor\w*|tutor\w*|lessons?|school of|discipline|technique|initiat(e|ed|ion))\b/i;

/** Skill-gated pool entries this story could gain now, given its setting and progress. */
export function midStoryCandidates(
  schema: StorySchema,
  completedChapters: number,
  catalogue: PoolCatalogue = SHIPPED_CATALOGUE
): PoolEntry[] {
  const fits = new Set(inferSettingFits(schema.premise));
  const present = new Set([...schema.actions.map((action) => action.id), ...schema.skills.map((skill) => skill.id)]);
  return catalogue.pool.entries.filter((entry) => {
    if (entry.excluded || present.has(entry.id)) return false;
    if (entry.kind === "action" && !entry.requiresSkill) return false;
    if (!entry.settingFit.some((fit) => fits.has(fit))) return false;
    const plan = planEnablement(schema, present, entry.id, catalogue);
    return plan.ok && !tierLock(plan.additions, completedChapters, catalogue);
  });
}

export const MID_STORY_ENABLEMENT_SYSTEM = [
  "You are the story analyzer for a d20 roleplay engine. This is CATALOGUE GROWTH.",
  "The latest exchange may show the world reaching for a discipline its rulebook lacks — a teacher",
  "offering a new art, a school of magic, a technique someone could now learn. Only if it clearly",
  "does, choose matching entries from the CANDIDATES. Most turns warrant none: return an empty list.",
  "Choosing an entry only makes it exist in this world; it teaches nobody anything.",
  'Return {"enable":[ids]} using ids copied exactly from the CANDIDATES.',
].join("\n");

export interface MidStoryArgs {
  storyId: string;
  /** The turn's index; enablements carry it so rewinding the turn removes them. */
  turnIdx: number;
  playerText: string;
  narratorText: string;
  catalogue?: PoolCatalogue;
  now?: () => number;
}

/**
 * Let the analyzer propose catalogue growth for one committed turn, under every guard above.
 * Returns the ids actually enabled (possibly empty). Never throws.
 */
export async function proposeMidStoryEnablements(
  router: Router,
  store: Store,
  args: MidStoryArgs
): Promise<string[]> {
  try {
    if (!LEARNING_CUE.test(`${args.playerText}\n${args.narratorText}`)) return [];
    const story = await store.stories.get(args.storyId);
    if (!story || story.schema.statMode !== "full") return [];
    const catalogue = args.catalogue ?? SHIPPED_CATALOGUE;
    const chapters = await store.chapters.listByStory(args.storyId);
    const chapterStart = chapters.length > 0 ? Math.max(...chapters.map((chapter) => chapter.msgTo)) + 1 : 0;
    const enablements = await store.poolEnablements.list(args.storyId);
    const used = enablements.filter(
      (enablement) => enablement.source === "analyzer" && (enablement.turnIndex ?? -1) >= chapterStart
    ).length;
    let remaining = ANALYZER_ENABLEMENTS_PER_CHAPTER - used;
    if (remaining <= 0) return [];

    const effective = await loadEffectiveSchema(store, story);
    const candidates = midStoryCandidates(effective, chapters.length, catalogue);
    if (candidates.length === 0) return [];
    const ids = candidates.map((entry) => entry.id) as [string, ...string[]];
    const answer = await callStructured(
      router,
      "analyzer",
      {
        system: MID_STORY_ENABLEMENT_SYSTEM,
        user: [
          "PLAYER:",
          args.playerText,
          "",
          "NARRATION:",
          args.narratorText,
          "",
          `CANDIDATES (choose at most ${remaining}):`,
          ...candidates.map((entry) => `- ${entry.id} · ${entry.name} · ${entry.description}`),
        ].join("\n"),
      },
      z.object({ enable: z.array(z.enum(ids)).max(ANALYZER_ENABLEMENTS_PER_CHAPTER * 2) }),
      { maxRepairs: 1, maxTokens: 400 }
    );

    const enabled: string[] = [];
    const present = new Set([
      ...effective.actions.map((action) => action.id),
      ...effective.skills.map((skill) => skill.id),
    ]);
    for (const entryId of new Set(answer.enable)) {
      // Everything a proposal brings with it counts against the chapter's budget.
      const plan = planEnablement(effective, present, entryId, catalogue);
      if (!plan.ok || plan.additions.length === 0 || plan.additions.length > remaining) continue;
      const result = await enablePoolEntry(store, args.storyId, entryId, {
        source: "analyzer",
        turnIndex: args.turnIdx,
        catalogue,
        ...(args.now ? { now: args.now } : {}),
      });
      if (!result.ok) continue;
      result.enabled.forEach((id) => present.add(id));
      enabled.push(...result.enabled);
      remaining -= result.enabled.length;
    }
    return enabled;
  } catch {
    return [];
  }
}
