import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { ScreenProps } from "./registry.js";
import { getBridge, formatEquipmentEffect } from "../bridge/core.js";
import type {
  Ruling,
  StoryEvent as StoredStoryEvent,
  StoryJournalPage,
} from "../bridge/core.js";
import { Button, EmptyState, InlineNotice } from "../components/index.js";

export type JournalKind =
  | "roll"
  | "denied"
  | "progression"
  | "item-equipment"
  | "milestone"
  | "boundary"
  | "interrupted";
interface JournalEvent {
  id: string;
  storyId: string;
  chapter?: number;
  turnIdx: number;
  actorId?: string;
  actorName?: string;
  kind: JournalKind;
  summary: string;
  createdAt: number;
  details: Array<{ label: string; value: string }>;
}
export const FILTERS: Array<{ key: "all" | JournalKind; label: string }> = [
  { key: "all", label: "All" },
  { key: "roll", label: "Rolls" },
  { key: "denied", label: "Denied" },
  { key: "interrupted", label: "Interrupted" },
  { key: "progression", label: "Progression" },
  { key: "item-equipment", label: "Items · Equipment" },
  { key: "milestone", label: "Milestones" },
  { key: "boundary", label: "Boundaries" },
];
const JOURNAL_PAGE_SIZE = 50;

export function Journal(props: ScreenProps): JSX.Element {
  const storyId = props.storyId;
  const [events, setEvents] = useState<JournalEvent[]>([]);
  const [phase, setPhase] = useState<"loading" | "ready" | "error" | "nostats">("loading");
  const [error, setError] = useState<string>();
  const [kind, setKind] = useState<"all" | JournalKind>("all");
  const [actor, setActor] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [exportOpen, setExportOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState<"idle" | "success" | "error">("idle");
  const [nameById, setNameById] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [nextCursor, setNextCursor] = useState<StoryJournalPage["nextCursor"]>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string>();

  useEffect(() => {
    if (!storyId) {
      setPhase("error");
      setError("Open a story to view its mechanical journal.");
      return;
    }
    let cancelled = false;
    setEvents([]);
    setNextCursor(undefined);
    setLoadMoreError(undefined);
    setPhase("loading");
    void (async () => {
      const bridge = getBridge();
      const story = await bridge.getStory(storyId);
      if (cancelled) return;
      if (story?.schema.statMode !== "full") {
        setPhase("nostats");
        return;
      }
      const [journalPage, cast] = await Promise.all([
        bridge.listStoryJournal(storyId, { limit: JOURNAL_PAGE_SIZE }),
        bridge.listPresentCast(storyId),
      ]);
      const names = new Map(cast.map((character) => [character.characterId, character.name]));
      const rows = journalPage.events.map((event) => toJournalEvent(event, names));
      if (!cancelled) {
        setNameById(names);
        setEvents(rows);
        setNextCursor(journalPage.nextCursor);
        setPhase("ready");
      }
    })().catch((reason) => {
      if (!cancelled) {
        setError(reason instanceof Error ? reason.message : "Couldn't load the mechanical journal.");
        setPhase("error");
      }
    });
    return () => { cancelled = true; };
  }, [storyId]);

  const actors = useMemo(() => {
    const map = new Map<string, string>();
    for (const event of events) if (event.actorId) map.set(event.actorId, event.actorName ?? event.actorId);
    return [...map.entries()];
  }, [events]);
  const filtered = useMemo(() => events.filter((event) => (kind === "all" || event.kind === kind) && (actor === "all" || event.actorId === actor)), [events, kind, actor]);
  const chapters = useMemo(() => {
    const map = new Map<number | undefined, JournalEvent[]>();
    for (const event of filtered) {
      const bucket = map.get(event.chapter);
      if (bucket) bucket.push(event); else map.set(event.chapter, [event]);
    }
    return [...map.entries()].sort(
      (a, b) =>
        (b[0] ?? Number.MAX_SAFE_INTEGER) - (a[0] ?? Number.MAX_SAFE_INTEGER)
    );
  }, [filtered]);

  const toggle = (id: string): void => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const loadMore = async (): Promise<void> => {
    if (!storyId || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(undefined);
    try {
      const journalPage = await getBridge().listStoryJournal(storyId, {
        limit: JOURNAL_PAGE_SIZE,
        before: nextCursor,
      });
      const olderRows = journalPage.events.map((event) => toJournalEvent(event, nameById));
      setEvents((current) => {
        const seen = new Set(current.map((event) => event.id));
        return [...olderRows.filter((event) => !seen.has(event.id)), ...current];
      });
      setNextCursor(journalPage.nextCursor);
    } catch (reason) {
      setLoadMoreError(
        reason instanceof Error ? reason.message : "Couldn't load older journal entries."
      );
    } finally {
      setLoadingMore(false);
    }
  };
  const exportFile = async (format: "md" | "csv"): Promise<void> => {
    try {
      if (!storyId) throw new Error("No story is open.");
      const contents = await getBridge().exportStoryJournal(
        storyId,
        format === "md" ? "markdown" : "csv"
      );
      const blob = new Blob([contents], { type: format === "md" ? "text/markdown;charset=utf-8" : "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `midnight-tavern-journal.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
      setExportOpen(false);
      setExportStatus("success");
    } catch {
      setExportStatus("error");
    }
  };

  if (phase === "loading") return <div style={center} aria-busy="true">Loading mechanical journal…</div>;
  if (phase === "nostats") return <div style={page}><EmptyState glyph="◇" title="No mechanical journal" body="This is a No Stats story. There are no rolls, XP, loot, equipment, or hard-state changes to record." /></div>;
  if (phase === "error") return <div style={page}><InlineNotice severity="error" title="Couldn't open the journal" detail={error ?? "Unknown error"} /></div>;

  return (
    <div style={page} data-screen="journal">
      <header style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={title}>Mechanical Journal</h1>
          <p style={lede}>An append-only account of what the rules changed. Rewinds remove their matching events, so no orphaned outcomes remain.</p>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ position: "relative" }}>
          <Button variant="system" onClick={() => setExportOpen((open) => !open)} aria-haspopup="menu">Export ▾</Button>
          {exportOpen ? <div role="menu" style={menu}>
            <button role="menuitem" type="button" style={menuButton} onClick={() => void exportFile("md")}>Markdown</button>
            <button role="menuitem" type="button" style={menuButton} onClick={() => void exportFile("csv")}>CSV</button>
          </div> : null}
        </div>
      </header>
      {exportStatus === "success" ? <div style={{ marginBottom: 12 }}><InlineNotice severity="success" title="Journal exported" detail="The file was saved through your browser's download location." /></div> : null}
      {exportStatus === "error" ? <div style={{ marginBottom: 12 }}><InlineNotice severity="error" title="Export failed" detail="The journal remains intact. Try the other format or retry." /></div> : null}

      <div style={filters}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="group" aria-label="Journal filters">
          {FILTERS.map((filter) => <button key={filter.key} type="button" aria-pressed={kind === filter.key} onClick={() => setKind(filter.key)} style={{ ...filterButton, ...(kind === filter.key ? filterActive : {}) }}>{filter.label}</button>)}
        </div>
        <select aria-label="Filter by actor" value={actor} onChange={(event) => setActor(event.target.value)} style={select}>
          <option value="all">All actors</option>
          {actors.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </div>

      {events.length === 0 ? <EmptyState glyph="◇" title="The journal is empty" body="The first roll, denial, XP award, item change, or milestone will appear here." /> :
        filtered.length === 0 ? <EmptyState glyph="⌁" title="No matching events" body="Clear a filter to see the rest of the journal." /> :
          <div style={{ display: "grid", gap: 24 }}>{chapters.map(([chapter, rows]) => (
            <section key={chapter ?? "unresolved"}>
              <div style={chapterHead}><span>{chapter === undefined ? "OPEN CHAPTER" : `CHAPTER ${chapter}`}</span><div style={{ flex: 1, height: 1, background: "var(--hairline)" }} /><span>{rows.length} events</span></div>
              <div style={{ display: "grid", gap: 7 }}>{rows.sort((a, b) => b.turnIdx - a.turnIdx).map((event) => {
                const open = expanded.has(event.id);
                return <article key={event.id} style={eventCard}>
                  <button type="button" onClick={() => toggle(event.id)} aria-expanded={open} style={eventButton}>
                    <span style={kindGlyph(event.kind)}>{glyphFor(event.kind)}</span>
                    <span style={{ minWidth: 76, color: "var(--teal)", fontFamily: "var(--font-mono)", fontSize: 10 }}>{event.chapter === undefined ? "OPEN" : `CH${event.chapter}`} · T{event.turnIdx}</span>
                    <span style={{ flex: 1, color: "var(--ui-text)", textAlign: "left" }}>{event.summary}</span>
                    <span style={{ color: "var(--muted)" }}>{open ? "▾" : "▸"}</span>
                  </button>
                  {open ? <dl style={details}>{event.details.map((detail) => <div key={`${detail.label}:${detail.value}`} style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 10 }}><dt>{detail.label}</dt><dd style={{ margin: 0, color: "var(--secondary)" }}>{detail.value}</dd></div>)}</dl> : null}
                </article>;
              })}</div>
            </section>
          ))}</div>}
      {loadMoreError ? <div style={{ marginTop: 14 }}><InlineNotice severity="error" title="Couldn't load older entries" detail={loadMoreError} /></div> : null}
      {nextCursor ? (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
          <Button
            variant="secondary"
            disabled={loadingMore}
            onClick={() => void loadMore()}
            data-testid="journal-load-more"
          >
            {loadingMore ? "Loading older entries…" : "Load older entries"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function glyphFor(kind: JournalKind): string {
  return kind === "roll" ? "◈" : kind === "denied" ? "⊘" : kind === "progression" ? "◆" : kind === "item-equipment" ? "❖" : kind === "milestone" ? "★" : "│";
}
function toJournalEvent(
  event: StoredStoryEvent,
  nameById: ReadonlyMap<string, string>
): JournalEvent {
  const rulingValue = event.payload["ruling"];
  const ruling =
    rulingValue && typeof rulingValue === "object" ? (rulingValue as Ruling) : undefined;
  const advancementValue = event.payload["decision"];
  const advancement =
    advancementValue && typeof advancementValue === "object"
      ? (advancementValue as Record<string, unknown>)
      : undefined;
  const proposalValue = advancement?.["proposal"];
  const proposal =
    proposalValue && typeof proposalValue === "object"
      ? (proposalValue as Record<string, unknown>)
      : undefined;
  const category: JournalKind =
    event.kind === "roll"
      ? "roll"
      : event.kind === "classifier_recovery"
        ? "interrupted" // an infrastructure interruption, never a world refusal (U-11)
        : event.kind === "denied" || event.kind === "action_budget_exceeded"
        ? "denied"
        : event.kind === "xp" ||
            event.kind === "rank_up" ||
            event.kind === "skill_unlocked" ||
            event.kind === "attribute_advanced" ||
            event.kind === "attribute_advancement_denied"
          ? "progression"
          : event.kind === "item_created" ||
              event.kind === "item_gained" ||
              event.kind === "item_lost" ||
              event.kind === "equipment_changed"
            ? "item-equipment"
            : event.kind === "chapter_started" ||
                event.kind === "arc_completed" ||
                event.kind === "rulebook_regenerated"
              ? "boundary"
              : "milestone";
  const roll = ruling?.roll;
  const action = ruling?.actionLabel ?? ruling?.actionId;
  const advancementActor =
    event.actorId === undefined
      ? "Character"
      : nameById.get(event.actorId) ?? event.actorId;
  const advancementAttribute =
    typeof proposal?.["attributeId"] === "string"
      ? humanize(proposal["attributeId"])
      : "Attribute";
  const summary = advancement
    ? event.kind === "attribute_advanced"
      ? `${advancementActor} - ${advancementAttribute} advanced: ${
          typeof advancement["scoreBefore"] === "number"
            ? advancement["scoreBefore"]
            : "?"
        } → ${
          typeof advancement["scoreAfter"] === "number"
            ? advancement["scoreAfter"]
            : "?"
        }`
      : `${advancementActor} - ${advancementAttribute} advancement denied`
    : ruling
    ? !ruling.gate.allowed
      ? `${nameById.get(ruling.actorId) ?? ruling.actorId} - ${action}: DENIED (${ruling.gate.reason ?? "not allowed"})`
      : roll
        ? `${nameById.get(ruling.actorId) ?? ruling.actorId} - ${action}: ${roll.total} vs ${
            roll.opposedTotal !== undefined
              ? `opposed ${roll.opposedTotal}`
              : `DC ${roll.dcEffective ?? roll.dc}`
          } - ${roll.outcome.toUpperCase()}`
        : `${nameById.get(ruling.actorId) ?? ruling.actorId} - ${action}`
    : `${humanize(event.kind)}${event.actorId ? ` - ${nameById.get(event.actorId) ?? event.actorId}` : ""}`;
  const details: Array<{ label: string; value: string }> = [];
  if (roll) {
    details.push(
      {
        label: "Dice",
        value: (roll.dice ?? [roll.d20])
          .map((die, index) =>
            (roll.dice?.length ?? 1) > 1 && index !== (roll.usedIndex ?? 0)
              ? `${die} (discarded)`
              : String(die)
          )
          .join(", "),
      },
      { label: "Roll mode", value: roll.rollMode ?? "normal" },
      { label: "Modifier", value: String(roll.modifier) },
      { label: "Total", value: String(roll.total) }
    );
    if (roll.opposedTotal === undefined) {
      details.push(
        { label: "Base DC", value: String(roll.dcBase ?? roll.dc) },
        { label: "Effective DC", value: String(roll.dcEffective ?? roll.dc) }
      );
    } else {
      details.push({ label: "Opposed total", value: String(roll.opposedTotal) });
    }
  }
  if (ruling?.difficulty) {
    details.push({ label: "Difficulty", value: ruling.difficulty.preset });
  }
  if (advancement) {
    if (typeof proposal?.["source"] === "string") {
      details.push({
        label: "Qualifying criteria",
        value: humanize(proposal["source"]),
      });
    }
    if (typeof proposal?.["rationale"] === "string") {
      details.push({ label: "DM rationale", value: proposal["rationale"] });
    }
    if (
      typeof advancement["roll"] === "number" &&
      typeof advancement["modifier"] === "number" &&
      typeof advancement["dc"] === "number"
    ) {
      details.push({
        label: "Advancement check",
        value: `${advancement["roll"]} ${advancement["modifier"] >= 0 ? "+" : "−"} ${Math.abs(advancement["modifier"])} vs DC ${advancement["dc"]}`,
      });
    }
    if (typeof advancement["band"] === "string") {
      details.push({ label: "Score band", value: humanize(advancement["band"]) });
    }
    if (Array.isArray(advancement["evidenceRefs"])) {
      details.push({
        label: "Scene evidence",
        value:
          advancement["evidenceRefs"]
            .filter((reference): reference is string => typeof reference === "string")
            .join(", ") || "None accepted",
      });
    }
    if (Array.isArray(advancement["denialReasons"])) {
      const reasons = advancement["denialReasons"].filter(
        (reason): reason is string => typeof reason === "string"
      );
      if (reasons.length) {
        details.push({ label: "Denial reasons", value: reasons.join(" ") });
      }
    }
    if (typeof advancement["policyVersion"] === "number") {
      details.push({
        label: "Policy",
        value: `Attribute advancement v${advancement["policyVersion"]}`,
      });
    }
  }
  if (ruling?.loot?.length) {
    for (const item of ruling.loot) {
      details.push({
        label: "Loot",
        value: `${item.name} · ${item.tier}${item.quantity > 1 ? ` ×${item.quantity}` : ""}`,
      });
      if (item.effects?.length) {
        details.push({
          label: "Effects",
          value: item.effects.map(formatEquipmentEffect).join(" · "),
        });
      }
    }
  }
  return {
    id: event.id,
    storyId: event.storyId,
    ...(event.chapterIndex === undefined ? {} : { chapter: event.chapterIndex + 1 }),
    turnIdx: event.turnIndex,
    ...(event.actorId ? { actorId: event.actorId } : {}),
    ...(event.actorId ? { actorName: nameById.get(event.actorId) ?? event.actorId } : {}),
    kind: category,
    summary,
    createdAt: event.createdAt,
    details,
  };
}
function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function kindGlyph(kind: JournalKind): CSSProperties {
  return { width: 18, color: kind === "denied" ? "var(--failure)" : kind === "progression" ? "var(--brass)" : "var(--teal)", fontSize: 14 };
}
const page: CSSProperties = { maxWidth: 980, margin: "0 auto", padding: "28px 36px 80px" };
const center: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", padding: 80, color: "var(--muted)" };
const title: CSSProperties = { margin: 0, color: "var(--prose)", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 32 };
const lede: CSSProperties = { margin: "5px 0 20px", color: "var(--secondary)", fontSize: 13.5, lineHeight: 1.6, maxWidth: 700 };
const filters: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 0 18px", borderTop: "1px solid var(--hairline)" };
const filterButton: CSSProperties = { padding: "6px 10px", color: "var(--secondary)", background: "transparent", border: "1px solid var(--hairline)", borderRadius: 6, cursor: "pointer", fontSize: 11.5 };
const filterActive: CSSProperties = { color: "var(--teal)", background: "var(--teal-tint)", borderColor: "var(--teal-dim)" };
const select: CSSProperties = { padding: "7px 9px", color: "var(--ui-text)", background: "var(--bg1-panel)", border: "1px solid var(--hairline)", borderRadius: 6 };
const chapterHead: CSSProperties = { display: "flex", alignItems: "center", gap: 9, color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".08em", marginBottom: 9 };
const eventCard: CSSProperties = { background: "var(--bg1-panel)", border: "1px solid var(--hairline)", borderRadius: 8, overflow: "hidden" };
const eventButton: CSSProperties = { display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "10px 12px", color: "var(--ui-text)", background: "transparent", border: 0, cursor: "pointer", fontFamily: "var(--font-ui)" };
const details: CSSProperties = { display: "grid", gap: 6, margin: 0, padding: "10px 48px 12px", borderTop: "1px solid var(--hairline)", color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 10.5, lineHeight: 1.5 };
const menu: CSSProperties = { position: "absolute", right: 0, top: "calc(100% + 5px)", zIndex: 10, minWidth: 140, padding: 5, background: "var(--bg3-raised)", border: "1px solid var(--teal-dim)", borderRadius: 7, boxShadow: "var(--elevation)" };
const menuButton: CSSProperties = { display: "block", width: "100%", padding: "8px 10px", color: "var(--ui-text)", background: "transparent", border: 0, textAlign: "left", cursor: "pointer" };

export default Journal;
