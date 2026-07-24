import type {
  Store,
  StoryEvent,
  StoryEventCursor,
  StoryEventKind,
} from "../store/index.js";
import { RulingSchema, type ChapterRecord, type Ruling } from "../types/index.js";
import { requireStory } from "./turn.js";

export type JournalExportFormat = "markdown" | "csv";

export interface StoryJournalQuery {
  kinds?: readonly StoryEventKind[];
  actorId?: string;
  before?: StoryEventCursor;
  limit?: number;
}

export interface StoryJournalPage {
  /** Oldest-to-newest events within this page, with chapter membership resolved. */
  events: StoryEvent[];
  /** Pass this cursor back to read the next older page. */
  nextCursor?: StoryEventCursor;
}

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 200;

function humanize(kind: string): string {
  return kind.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function rulingFrom(event: StoryEvent): Ruling | undefined {
  const parsed = RulingSchema.safeParse(event.payload.ruling);
  return parsed.success ? parsed.data : undefined;
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function summarizeRuling(ruling: Ruling): string {
  const action = ruling.actionLabel ?? ruling.actionId;
  if (!ruling.gate.allowed) {
    return `${ruling.actorId} - ${action}: DENIED (${ruling.gate.reason ?? "not allowed"})`;
  }
  const roll = ruling.roll;
  if (!roll) return `${ruling.actorId} - ${action}: allowed`;
  const dice = roll.dice ?? [roll.d20];
  const usedIndex = roll.usedIndex ?? 0;
  const renderedDice = dice
    .map((die, index) => (index === usedIndex ? `[${die}]` : `(${die} discarded)`))
    .join(", ");
  const baseDc = roll.dcBase ?? roll.dc;
  const effectiveDc = roll.dcEffective ?? roll.dc;
  const dc =
    baseDc === effectiveDc
      ? `DC ${effectiveDc}`
      : `DC ${baseDc} -> ${effectiveDc} (${ruling.difficulty?.preset ?? "custom"})`;
  return `${ruling.actorId} - ${action}: d20 ${renderedDice} ${signed(roll.modifier)} = ${roll.total} vs ${dc} -> ${roll.outcome.toUpperCase()}`;
}

export function summarizeStoryEvent(event: StoryEvent): string {
  const ruling = rulingFrom(event);
  if (ruling) return summarizeRuling(ruling);
  if (
    event.kind === "attribute_advanced" ||
    event.kind === "attribute_advancement_denied"
  ) {
    const decisionValue = event.payload["decision"];
    const decision =
      decisionValue && typeof decisionValue === "object"
        ? (decisionValue as Record<string, unknown>)
        : undefined;
    const proposalValue = decision?.["proposal"];
    const proposal =
      proposalValue && typeof proposalValue === "object"
        ? (proposalValue as Record<string, unknown>)
        : undefined;
    const attribute =
      typeof proposal?.["attributeId"] === "string"
        ? humanize(proposal["attributeId"])
        : "Attribute";
    const actor = event.actorId ?? "Character";
    if (
      event.kind === "attribute_advanced" &&
      typeof decision?.["scoreBefore"] === "number" &&
      typeof decision["scoreAfter"] === "number"
    ) {
      return `${actor} - ${attribute} advanced ${decision["scoreBefore"]} -> ${decision["scoreAfter"]}`;
    }
    const reasons = Array.isArray(decision?.["denialReasons"])
      ? decision["denialReasons"].filter(
          (reason): reason is string => typeof reason === "string"
        )
      : [];
    return `${actor} - ${attribute} advancement denied${
      reasons.length ? ` (${reasons.join(" ")})` : ""
    }`;
  }
  const payload = Object.keys(event.payload).length ? ` - ${JSON.stringify(event.payload)}` : "";
  return `${humanize(event.kind)}${event.actorId ? ` - ${event.actorId}` : ""}${payload}`;
}

function compareEvents(left: StoryEvent, right: StoryEvent): number {
  return (
    left.turnIndex - right.turnIndex ||
    left.createdAt - right.createdAt ||
    left.id.localeCompare(right.id)
  );
}

function cursorFor(event: StoryEvent): StoryEventCursor {
  return {
    turnIndex: event.turnIndex,
    createdAt: event.createdAt,
    id: event.id,
  };
}

/**
 * Resolve chapter membership from the persisted chapter message ranges. Events in the currently
 * open, unsummarized tail belong to the chapter immediately after the latest closed chapter.
 */
function resolveChapterIndex(
  event: StoryEvent,
  chapters: readonly ChapterRecord[]
): number {
  if (event.chapterIndex !== undefined) return event.chapterIndex;
  let prior: ChapterRecord | undefined;
  for (const chapter of chapters) {
    if (event.turnIndex >= chapter.msgFrom && event.turnIndex <= chapter.msgTo) {
      return chapter.idx;
    }
    if (chapter.msgTo < event.turnIndex) {
      prior = chapter;
      continue;
    }
    if (event.turnIndex < chapter.msgFrom) break;
  }
  return prior ? prior.idx + 1 : 0;
}

export async function listStoryJournal(
  store: Store,
  storyId: string,
  query: StoryJournalQuery = {}
): Promise<StoryJournalPage> {
  await requireStory(store, storyId);
  const limit = Math.max(1, Math.min(MAX_PAGE_SIZE, Math.round(query.limit ?? DEFAULT_PAGE_SIZE)));
  const [rawEvents, chapters] = await Promise.all([
    store.events.listByStory(storyId, {
      ...(query.kinds ? { kinds: query.kinds } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.before ? { before: query.before } : {}),
      limit: limit + 1,
    }),
    store.chapters.listByStory(storyId),
  ]);
  const hasMore = rawEvents.length > limit;
  const selected = hasMore ? rawEvents.slice(1) : rawEvents;
  const events = selected.map((event) => ({
    ...event,
    chapterIndex: resolveChapterIndex(event, chapters),
  }));
  const oldest = events[0];
  return {
    events,
    ...(hasMore && oldest ? { nextCursor: cursorFor(oldest) } : {}),
  };
}

/** Read the complete resolved journal by walking stable pages until no older cursor remains. */
export async function listCompleteStoryJournal(
  store: Store,
  storyId: string
): Promise<StoryEvent[]> {
  const events: StoryEvent[] = [];
  const seenCursors = new Set<string>();
  let before: StoryEventCursor | undefined;
  do {
    const page = await listStoryJournal(store, storyId, {
      limit: MAX_PAGE_SIZE,
      ...(before ? { before } : {}),
    });
    events.push(...page.events);
    before = page.nextCursor;
    if (before) {
      const key = `${before.turnIndex}:${before.createdAt}:${before.id}`;
      if (seenCursors.has(key)) {
        throw new Error("Mechanical Journal pagination did not advance.");
      }
      seenCursors.add(key);
    }
  } while (before);
  return events.sort(compareEvents);
}

export async function exportStoryJournalMarkdown(
  store: Store,
  storyId: string
): Promise<string> {
  const story = await requireStory(store, storyId);
  const events = await listCompleteStoryJournal(store, storyId);
  const lines = [
    `# ${story.title} - Mechanical Journal`,
    "",
    `Rulebook version: ${story.rulebookVersion ?? 1}`,
    "",
  ];
  if (events.length === 0) {
    lines.push("_No mechanical events have been recorded yet._", "");
    return lines.join("\n");
  }
  let currentChapter: number | undefined;
  let currentTurn = -1;
  for (const event of events) {
    if (event.chapterIndex !== undefined && event.chapterIndex !== currentChapter) {
      currentChapter = event.chapterIndex;
      currentTurn = -1;
      lines.push(`## Chapter ${event.chapterIndex + 1}`, "");
    }
    if (event.turnIndex !== currentTurn) {
      currentTurn = event.turnIndex;
      lines.push(`### Turn ${currentTurn}`, "");
    }
    lines.push(`- ${summarizeStoryEvent(event)}`);
  }
  lines.push("");
  return lines.join("\n");
}

function csvCell(value: unknown): string {
  const text = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function exportStoryJournalCsv(store: Store, storyId: string): Promise<string> {
  await requireStory(store, storyId);
  const events = await listCompleteStoryJournal(store, storyId);
  const rows: unknown[][] = [
    [
      "turn_index",
      "chapter",
      "kind",
      "actor",
      "action",
      "dice",
      "mode",
      "modifier",
      "dc_base",
      "dc_effective",
      "total",
      "outcome",
      "effects",
      "difficulty_preset",
      "summary",
    ],
  ];
  for (const event of events) {
    const ruling = rulingFrom(event);
    const roll = ruling?.roll;
    rows.push([
      event.turnIndex,
      event.chapterIndex == null ? "" : event.chapterIndex + 1,
      event.kind,
      event.actorId ?? ruling?.actorId ?? "",
      ruling?.actionLabel ?? ruling?.actionId ?? "",
      roll?.dice ?? (roll ? [roll.d20] : ""),
      roll?.rollMode ?? "",
      roll?.modifier ?? "",
      roll?.dcBase ?? roll?.dc ?? "",
      roll?.dcEffective ?? roll?.dc ?? "",
      roll?.total ?? "",
      roll?.outcome ?? "",
      ruling?.effectsApplied ?? event.payload,
      ruling?.difficulty?.preset ?? "",
      summarizeStoryEvent(event),
    ]);
  }
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

export async function exportStoryJournal(
  store: Store,
  storyId: string,
  format: JournalExportFormat
): Promise<string> {
  return format === "csv"
    ? exportStoryJournalCsv(store, storyId)
    : exportStoryJournalMarkdown(store, storyId);
}
