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
 * BRIDGE NOTE: the CoreBridge (SCREEN_CONTRACT) exposes no chapter/arc reads yet — no
 * `listChapters` / `listArcs`. Until those land, the timeline + arc are derived LOCALLY from the
 * open story (`useStoriesStore.current`) and its message count: chapters are inferred at ~20
 * msgs/chapter (the same heuristic the App header uses), the newest chapter is "in-progress", and
 * the ArcDoc is assembled from the frozen schema's premise + title. This is a documented stub;
 * when `bridge.listChapters(storyId)` / `bridge.listArcs(storyId)` exist, swap the derivation for
 * real reads.
 */
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useStoriesStore } from "../state/storiesStore";
import { useUiStore } from "../state/uiStore";
import { getBridge } from "../bridge/core";
import { ChapterCard, ArcDoc, EmptyState, InlineNotice, Button } from "../components";
import type { ArcDocSection, ChapterStatus } from "../components";
import type { MessageRecord } from "../bridge/core";
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

/** Infer the chapter timeline from the transcript length (documented stub — see file header). */
function deriveChapters(messageCount: number): DerivedChapter[] {
  const total = Math.max(1, Math.ceil(messageCount / MSGS_PER_CHAPTER));
  const chapters: DerivedChapter[] = [];
  for (let i = 0; i < total; i++) {
    const from = i * MSGS_PER_CHAPTER + 1;
    const to = Math.min((i + 1) * MSGS_PER_CHAPTER, Math.max(messageCount, from));
    const isLast = i === total - 1;
    chapters.push({
      index: i + 1,
      title: isLast ? "The unfolding chapter" : `Chapter ${i + 1}`,
      status: isLast ? "in-progress" : "summarized",
      range: `msgs ${from}–${to}`,
      summary: isLast
        ? undefined
        : "A closed chapter, summarized into the arc record the storyteller reads before every turn.",
    });
  }
  return chapters;
}

/** Messages elapsed in the current (last, in-progress) chapter. */
function messagesInCurrentChapter(messageCount: number): number {
  if (messageCount <= 0) return 0;
  return ((messageCount - 1) % MSGS_PER_CHAPTER) + 1;
}

export function Overview(props: ScreenProps): JSX.Element {
  const storyId = props.storyId;
  const current = useStoriesStore((s) => s.current);
  const currentStatus = useStoriesStore((s) => s.currentStatus);
  const openStory = useStoriesStore((s) => s.openStory);
  const reduced = useUiStore((s) => s.reducedMotion);

  const [messages, setMessages] = useState<MessageRecord[] | undefined>(undefined);
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
    getBridge()
      .listMessages(storyId)
      .then((m) => {
        if (!cancelled) setMessages(m);
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
  const chapters = deriveChapters(messageCount);
  const currentChapterMsgs = messagesInCurrentChapter(messageCount);
  const hasClosedChapter = chapters.some((c) => c.status === "summarized");
  const needMore = !hasClosedChapter && currentChapterMsgs < MIN_MSGS_TO_SUMMARIZE;
  const remaining = Math.max(0, MIN_MSGS_TO_SUMMARIZE - currentChapterMsgs);

  const arcSections: ArcDocSection[] = current
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
            {chapters.map((ch) => (
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
              title={current?.title ?? "This story"}
              index={1}
              range={`Chapters 1–${Math.max(1, chapters.length - 1)}`}
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
