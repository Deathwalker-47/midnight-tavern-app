/**
 * Chapter summarizer (low-level-plan §M8.1–2, §8.4).
 *
 * A chapter is a contiguous block of `messagesPerChapter` transcript messages, summarized
 * into `{title, summary ≤ 300 words}` by a structured `summarizer`-role call and persisted.
 * `maybeSummarizeChapter` is the async, post-turn trigger: it summarizes exactly one block
 * whenever enough unsummarized messages have accumulated, so a burst of turns produces one
 * chapter at a time in order rather than a backlog all at once.
 *
 * "Unsummarized" is derived from the last chapter's `msgTo`: chapters tile the transcript
 * by message index with no gaps, so the next block always starts at `msgTo + 1`.
 */
import { z } from "zod";
import { randomUUID } from "../util/uuid.js";
import { callStructured, type Router } from "../router/index.js";
import type { Store } from "../store/index.js";
import type { ChapterRecord, MessageRecord } from "../types/index.js";

/** Settings key for the chapter threshold (editable in Advanced Settings). */
export const MESSAGES_PER_CHAPTER_KEY = "messagesPerChapter";
/** Plan default (§M8.1). */
export const DEFAULT_MESSAGES_PER_CHAPTER = 20;

/** The summarizer's structured output for one chapter. */
export const ChapterSummarySchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
});
export type ChapterSummary = z.infer<typeof ChapterSummarySchema>;

export const CHAPTER_SYSTEM = [
  "You summarize a block of roleplay transcript into a chapter record (JSON only).",
  "Capture: key events, acquisitions AS NARRATED (do not invent mechanical rewards), time",
  "passed, and any shifts in relationships or goals. Be faithful to the text; add nothing.",
  "Return a short evocative `title` and a `summary` of AT MOST 300 words.",
].join("\n");

/** Render a message block as labelled transcript lines for the prompt. */
export function buildChapterUser(block: MessageRecord[]): string {
  const lines = block.map((m) => `[${m.idx}] ${m.role.toUpperCase()}: ${m.content}`);
  return `TRANSCRIPT BLOCK (messages ${block[0]!.idx}–${block[block.length - 1]!.idx}):\n${lines.join("\n")}`;
}

/** Read the effective chapter threshold from settings, falling back to the default. */
export async function chapterThreshold(store: Store): Promise<number> {
  return (
    (await store.settings.get(MESSAGES_PER_CHAPTER_KEY, z.number().int().positive())) ??
    DEFAULT_MESSAGES_PER_CHAPTER
  );
}

/** The next unsummarized message index for a story (one past the last chapter's `msgTo`). */
async function nextUnsummarizedIdx(store: Store, storyId: string): Promise<number> {
  const chapters = await store.chapters.listByStory(storyId);
  if (chapters.length === 0) return 0;
  return Math.max(...chapters.map((c) => c.msgTo)) + 1;
}

/**
 * If at least `threshold` unsummarized messages exist, summarize the oldest such block and
 * persist a chapter. Returns the new chapter (or undefined if the threshold isn't met).
 * Never throws — summarization is off the turn's critical path.
 */
export async function maybeSummarizeChapter(
  router: Router,
  store: Store,
  storyId: string,
  opts: { signal?: AbortSignal; onError?: (err: unknown) => void } = {}
): Promise<ChapterRecord | undefined> {
  try {
    const threshold = await chapterThreshold(store);
    const all = await store.messages.listByStory(storyId);
    const from = await nextUnsummarizedIdx(store, storyId);
    const block = all.filter((m) => m.idx >= from).slice(0, threshold);
    if (block.length < threshold) return undefined;

    const summary = await callStructured(
      router,
      "summarizer",
      { system: CHAPTER_SYSTEM, user: buildChapterUser(block) },
      ChapterSummarySchema,
      { maxRepairs: 2, signal: opts.signal }
    );

    const record: ChapterRecord = {
      id: randomUUID(),
      storyId,
      idx: await store.chapters.nextIdx(storyId),
      msgFrom: block[0]!.idx,
      msgTo: block[block.length - 1]!.idx,
      title: summary.title,
      summary: summary.summary,
    };
    await store.chapters.insert(record);
    return record;
  } catch (err) {
    opts.onError?.(err);
    return undefined;
  }
}
