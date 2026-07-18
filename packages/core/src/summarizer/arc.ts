/**
 * Arc summarizer (low-level-plan §M8.3, §8.4).
 *
 * An arc distills `chaptersPerArc` consecutive chapters (plus the prior arc doc, for
 * continuity) into the structured, Zod-typed Arc Document. `maybeSummarizeArc` is the
 * async, post-turn trigger: it fires one arc whenever enough chapters have accrued since the
 * last arc, tiling chapters by index the same way chapters tile messages.
 *
 * The Arc Document schema (`ArcDocSchema`) lives in types/records.ts so the arcs table has a
 * validated payload from the start; this module fills it.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { callStructured, type Router } from "../router/index.js";
import type { Store } from "../store/index.js";
import { ArcDocSchema, type ArcDoc, type ArcRecord, type ChapterRecord } from "../types/index.js";

/** Settings key for the arc threshold (editable in Advanced Settings). */
export const CHAPTERS_PER_ARC_KEY = "chaptersPerArc";
/** Plan default (§M8.1). */
export const DEFAULT_CHAPTERS_PER_ARC = 15;

export const ARC_SYSTEM = [
  "You distill several chapter summaries into a structured Arc Document (JSON only).",
  "Fill every section from the chapters and the prior arc document; leave a section as an",
  "empty array if the material genuinely offers nothing for it. Be faithful — record only",
  "what the summaries state (acquisitions and powers AS NARRATED). `plotSummary` is prose;",
  "every other field is a list of short, concrete entries.",
].join("\n");

/** Render the prior arc doc (if any) plus the chapter block for the prompt. */
export function buildArcUser(chapters: ChapterRecord[], priorArc: ArcDoc | undefined): string {
  const parts: string[] = [];
  if (priorArc) parts.push("PRIOR ARC DOCUMENT:", JSON.stringify(priorArc, null, 2), "");
  parts.push("CHAPTERS IN THIS ARC:");
  for (const c of chapters) parts.push(`## [${c.idx}] ${c.title}\n${c.summary}`);
  parts.push("", "Produce the Arc Document covering these chapters.");
  return parts.join("\n");
}

/** Read the effective arc threshold from settings, falling back to the default. */
export async function arcThreshold(store: Store): Promise<number> {
  return (
    (await store.settings.get(CHAPTERS_PER_ARC_KEY, z.number().int().positive())) ?? DEFAULT_CHAPTERS_PER_ARC
  );
}

/** The next chapter index not yet covered by an arc (one past the last arc's `chapterTo`). */
async function nextUncoveredChapterIdx(store: Store, storyId: string): Promise<number> {
  const latest = await store.arcs.latest(storyId);
  return latest ? latest.chapterTo + 1 : 0;
}

/**
 * If at least `threshold` chapters exist beyond the last arc, summarize the oldest such
 * chapter block into an Arc Document and persist it. Returns the new arc (or undefined if
 * the threshold isn't met). Never throws.
 */
export async function maybeSummarizeArc(
  router: Router,
  store: Store,
  storyId: string,
  opts: { signal?: AbortSignal; onError?: (err: unknown) => void } = {}
): Promise<ArcRecord | undefined> {
  try {
    const threshold = await arcThreshold(store);
    const from = await nextUncoveredChapterIdx(store, storyId);
    const block = (await store.chapters
      .listByStory(storyId))
      .filter((c) => c.idx >= from)
      .sort((a, b) => a.idx - b.idx)
      .slice(0, threshold);
    if (block.length < threshold) return undefined;

    const priorArc = (await store.arcs.latest(storyId))?.doc;
    const doc = await callStructured(
      router,
      "summarizer",
      { system: ARC_SYSTEM, user: buildArcUser(block, priorArc) },
      ArcDocSchema,
      { maxRepairs: 2, signal: opts.signal }
    );

    const record: ArcRecord = {
      id: randomUUID(),
      storyId,
      idx: await store.arcs.nextIdx(storyId),
      chapterFrom: block[0]!.idx,
      chapterTo: block[block.length - 1]!.idx,
      title: block[0]!.title,
      doc,
    };
    await store.arcs.insert(record);
    return record;
  } catch (err) {
    opts.onError?.(err);
    return undefined;
  }
}
