/**
 * Overview — a story's arc / chapter overview. A left chapter-timeline (ChapterCard nodes:
 * summarized = green, in-progress = brass/pulsing) beside the long-form ArcDoc reader. Ported
 * from Design/handoff/screens/Overview.dc.html (the "Demo" chip row is dropped).
 *
 * As a story sub-tab it receives `props.storyId`; with none it renders a "no story open" empty
 * state. State matrix (§02): no-story · loading · error · arc-document · need-2-more (summarize
 * precondition) · summarizing (skeleton) · no-arc-yet (empty). The narrow (~900px) layout drops
 * the timeline to a stacked column; skeleton motion collapses under reduced-motion.
 *
 * DATA: reads PERSISTED summaries via `bridge.listChapters` / `bridge.listArcs` (audit #6). When the
 * summarizer has written chapters/arcs, the timeline + ArcDoc reader render those real records. Only
 * the still-open (unsummarized) tail chapter is derived from the transcript length — it has no
 * persisted row yet by definition. In the in-memory dev backend both lists are empty, so the screen
 * shows the pre-summary states exactly as before.
 */
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useStoriesStore } from "../state/storiesStore";
import { useUiStore } from "../state/uiStore";
import { getBridge } from "../bridge/core";
import { ChapterCard, ArcDoc, EmptyState, InlineNotice, Button } from "../components";
import type { ArcDocSection, ChapterStatus } from "../components";
import type { MessageRecord, ChapterRecord, ArcRecord } from "../bridge/core";
import type { ScreenProps } from "./registry";

const MSGS_PER_CHAPTER = 20;
/** A chapter can only be summarized once it holds a couple of turns beyond its start. */
const MIN_MSGS_TO_SUMMARIZE = 2;

interface DerivedChapter {
  index: number;
  title: string;
  status: ChapterStatus;
  range: string;
  summary?: string;
}

/**
 * Build the timeline from PERSISTED chapters plus the still-open tail (audit #6). Each persisted
 * chapter is "summarized"; the open tail (messages after the last chapter's `msgTo`) is derived and
 * shown "in-progress". With no persisted chapters this reduces to the old transcript-length stub.
 */
function buildChapters(chapters: ChapterRecord[], messageCount: number): DerivedChapter[] {
  const out: DerivedChapter[] = chapters.map((ch) => ({
    index: ch.idx + 1,
    title: ch.title,
    status: "summarized" as ChapterStatus,
    range: `msgs ${ch.msgFrom + 1}–${ch.msgTo + 1}`,
    summary: ch.summary,
  }));
  const lastSummarizedMsg = chapters.length ? chapters[chapters.length - 1]!.msgTo + 1 : 0;
  if (messageCount > lastSummarizedMsg) {
    out.push({
      index: out.length + 1,
      title: "The unfolding chapter",
      status: "in-progress",
      range: `msgs ${lastSummarizedMsg + 1}–${messageCount}`,
    });
  } else if (out.length === 0) {
    // No messages and no chapters: show a single empty in-progress chapter for structure.
    out.push({ index: 1, title: "The unfolding chapter", status: "in-progress", range: "msgs 1–1" });
  }
  return out;
}

/** Messages elapsed in the current (last, in-progress) chapter, measured past the last summary. */
function messagesInCurrentChapter(chapters: ChapterRecord[], messageCount: number): number {
  const lastSummarizedMsg = chapters.length ? chapters[chapters.length - 1]!.msgTo + 1 : 0;
  return Math.max(0, messageCount - lastSummarizedMsg);
}

/** Render the persisted ArcDoc into reader sections, showing only the parts that carry content. */
function arcDocToSections(arc: ArcRecord): ArcDocSection[] {
  const doc = arc.doc;
  const sections: ArcDocSection[] = [];
  if (doc.plotSummary.trim()) sections.push({ heading: "Plot so far", body: doc.plotSummary });
  const lists: [string, string[]][] = [
    ["Character development", doc.characterDevelopment],
    ["Relationships", doc.relationshipDynamics],
    ["Secrets revealed", doc.secretsRevealed],
    ["Promises & oaths", doc.promisesAndOaths],
    ["Antagonists", doc.antagonists],
    ["World & lore", doc.worldLore],
    ["Unresolved threads", doc.unresolvedThreads],
    ["Stakes", doc.stakes],
    ["Key items", doc.keyItems],
    ["Skills & powers", doc.skillsAndPowers],
    ["Limitations", doc.limitations],
    ["Timeline", doc.timeline],
  ];
  for (const [heading, items] of lists) {
    const kept = items.filter((s) => s.trim());
    if (kept.length) sections.push({ heading, body: kept.map((s) => `• ${s}`).join("\n") });
  }
  return sections;
}

export function Overview(props: ScreenProps): JSX.Element {
  const storyId = props.storyId;
  const current = useStoriesStore((s) => s.current);
  const currentStatus = useStoriesStore((s) => s.currentStatus);
  const openStory = useStoriesStore((s) => s.openStory);
  const reduced = useUiStore((s) => s.reducedMotion);

  const [messages, setMessages] = useState<MessageRecord[] | undefined>(undefined);
  const [chapters, setChapters] = useState<ChapterRecord[]>([]);
  const [arcs, setArcs] = useState<ArcRecord[]>([]);
  const [loadError, setLoadError] = useState(false);

  // Ensure the open-story record is loaded (deeplink / direct tab), then read the transcript
  // length so the timeline can derive chapters. Talks only through the store + bridge.
  useEffect(() => {
    if (!storyId) return;
    // Load only when we don't already have this story and aren't mid-load or already errored
    // (guarding the error case avoids a retry-loop; the explicit "Try again" button re-fetches).
    if (current?.id !== storyId && currentStatus !== "loading" && currentStatus !== "error") {
      void openStory(storyId);
    }
  }, [storyId, current?.id, currentStatus, openStory]);

  useEffect(() => {
    if (!storyId) return;
    let cancelled = false;
    setLoadError(false);
    setMessages(undefined);
    const bridge = getBridge();
    Promise.all([
      bridge.listMessages(storyId),
      bridge.listChapters(storyId),
      bridge.listArcs(storyId),
    ])
      .then(([m, ch, ar]) => {
        if (cancelled) return;
        setMessages(m);
        setChapters(ch);
        setArcs(ar);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [storyId]);

  // ── No story open ────────────────────────────────────────────────────────
  if (!storyId) {
    return (
      <div style={styles.screen}>
        <EmptyState
          glyph="❧"
          title="No story open"
          body="Open a story from the shelf to read its chapters and arc record."
        />
      </div>
    );
  }

  // ── Error (story or transcript unreadable) ───────────────────────────────
  if (currentStatus === "error" || loadError) {
    return (
      <div style={styles.screen}>
        <div style={styles.centered} data-testid="overview-error">
          <InlineNotice
            severity="error"
            title="Couldn’t open this story’s record"
            detail="The chapter and arc data didn’t load. The story file may be on a disconnected drive."
          />
          <div style={{ marginTop: 16 }}>
            <Button variant="secondary" onClick={() => void openStory(storyId)}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (currentStatus === "loading" || messages === undefined || (current?.id !== storyId)) {
    return (
      <div style={styles.screen}>
        <div style={styles.grid}>
          <div />
          <div
            className={reduced ? undefined : "mt-pulse"}
            style={styles.skeletonDoc}
            aria-busy="true"
            data-testid="overview-loading"
          >
            <div className="mono" style={styles.skeletonLabel}>
              READING THE ARC RECORD …
            </div>
            <div style={{ ...styles.skelBar, width: "80%", marginTop: 14 }} />
            <div style={{ ...styles.skelBar, width: "95%", marginTop: 8 }} />
            <div style={{ ...styles.skelBar, width: "60%", marginTop: 8 }} />
          </div>
        </div>
      </div>
    );
  }

  const messageCount = messages.length;
  const timelineChapters = buildChapters(chapters, messageCount);
  const currentChapterMsgs = messagesInCurrentChapter(chapters, messageCount);
  const hasClosedChapter = chapters.length > 0;
  const latestArc = arcs.length ? arcs[arcs.length - 1] : undefined;
  const needMore = !hasClosedChapter && currentChapterMsgs < MIN_MSGS_TO_SUMMARIZE;
  const remaining = Math.max(0, MIN_MSGS_TO_SUMMARIZE - currentChapterMsgs);

  // Arc reader: prefer the persisted ArcDoc; fall back to the premise blurb before any arc exists.
  const arcSections: ArcDocSection[] = latestArc
    ? arcDocToSections(latestArc)
    : current
      ? [
          { heading: "Premise", body: current.schema.premise || "The storyteller has not recorded a premise yet." },
          {
            heading: "How this record works",
            body: "The storyteller writes an arc document when a chapter closes — a living record it reads before every turn. Closed chapters fold into it; the current chapter stays open below.",
          },
        ]
      : [];

  return (
    <div style={styles.screen}>
      <div style={styles.grid}>
        {/* LEFT: chapter timeline */}
        <aside style={styles.timeline}>
          <div className="mono" style={styles.railLabel}>
            CHAPTERS
          </div>
          <div>
            {timelineChapters.map((ch) => (
              <ChapterCard
                key={ch.index}
                index={ch.index}
                title={ch.title}
                status={ch.status}
                range={ch.range}
                summary={ch.summary}
              />
            ))}
          </div>
        </aside>

        {/* RIGHT: arc document / preconditions */}
        <div style={{ minWidth: 0 }}>
          {needMore ? (
            <div style={styles.needMore} data-testid="overview-need-more">
              <span style={styles.needMoreGlyph} aria-hidden="true">
                ◷
              </span>
              <div style={styles.needMoreText}>
                The current chapter is still unfolding.{" "}
                <b style={styles.needMoreEmph}>
                  Need {remaining} more {remaining === 1 ? "message" : "messages"}
                </b>{" "}
                before it can be summarized into the arc.
              </div>
            </div>
          ) : null}

          {hasClosedChapter ? (
            <ArcDoc
              title={latestArc?.title ?? current?.title ?? "This story"}
              index={(latestArc?.idx ?? 0) + 1}
              range={
                latestArc
                  ? `Chapters ${latestArc.chapterFrom + 1}–${latestArc.chapterTo + 1}`
                  : `Chapters 1–${Math.max(1, chapters.length)}`
              }
              sections={arcSections}
            />
          ) : (
            <EmptyState
              glyph="❧"
              title="No arc summary yet"
              body="The storyteller writes an arc document when a chapter closes. Finish this chapter and its record will appear here."
            />
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  screen: { maxWidth: 920, margin: "0 auto", padding: "30px 40px 60px" },
  grid: { display: "grid", gridTemplateColumns: "minmax(180px, 230px) 1fr", gap: 34, alignItems: "start" },
  timeline: { position: "sticky", top: 0 },
  railLabel: { fontSize: 11, letterSpacing: "0.14em", color: "var(--teal)", marginBottom: 14 },
  centered: { maxWidth: 520, margin: "6vh auto 0" },
  needMore: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "var(--hairline-soft)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius-card)",
    padding: "14px 18px",
    marginBottom: 20,
  },
  needMoreGlyph: { color: "var(--brass)", fontSize: 16 },
  needMoreText: { fontSize: 13, color: "var(--secondary)", lineHeight: 1.5 },
  needMoreEmph: { color: "var(--ui-text)" },
  skeletonDoc: {
    background: "var(--bg1-panel)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius-card)",
    padding: 20,
  },
  skeletonLabel: { fontSize: 11, letterSpacing: "0.1em", color: "var(--teal)" },
  skelBar: { height: 12, background: "var(--bg2-card)", borderRadius: 4 },
};

export default Overview;
