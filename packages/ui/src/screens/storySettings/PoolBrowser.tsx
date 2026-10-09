/**
 * PoolBrowser — the universal pool, grouped by section, with enable / disable (plan 09 §7 surface 2,
 * design brief §5b). Built to stay usable at ~3,000 entries (§7.1):
 *
 *   - Section-first: every section starts collapsed, showing only "n of m enabled". Its entries are
 *     fetched from the bridge when it opens, one page at a time ("Show more"), so the DOM holds the
 *     section headers plus the pages actually opened. Core materializes only the requested page
 *     (measured: ~1 ms for the section index, ~8–11 ms per 40-entry page at 3,108 entries).
 *   - Search-first: a search across the whole pool replaces the sections with one paged list.
 *
 * Every row says plainly what the story may do with the entry and why: enabled (with who enabled
 * it, and — when it must stay — the D8 reason naming who learned it), available (with what it
 * would bring along), locked by tier (with when it unlocks), unavailable, or never offered. The
 * decisions all live in core; this screen only renders them and calls the bridge.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { getBridge } from "../../bridge/core";
import type { PoolBrowseEntry, PoolSectionView } from "../../bridge/core";
import { Button, InlineNotice } from "../../components";

export const POOL_BROWSER_PAGE = 40;
const SEARCH_DELAY_MS = 200;

const SOURCE_LABEL: Readonly<Record<NonNullable<PoolBrowseEntry["source"]>, string>> = {
  forge: "chosen at creation",
  player: "added by you",
  analyzer: "added by the story",
};

const STATE_LABEL: Readonly<Record<PoolBrowseEntry["state"], string>> = {
  enabled: "ENABLED",
  available: "AVAILABLE",
  locked: "LOCKED BY TIER",
  unavailable: "UNAVAILABLE",
  excluded: "NOT OFFERED",
};

interface Listing {
  entries: PoolBrowseEntry[];
  total: number;
  loading: boolean;
  error?: string;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function PoolBrowser(props: { storyId: string; onChanged?: () => void }): JSX.Element {
  const { storyId, onChanged } = props;
  const [sections, setSections] = useState<PoolSectionView[]>();
  const [sectionsError, setSectionsError] = useState<string>();
  const [open, setOpen] = useState<Record<string, Listing>>({});
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Listing>();
  const [busy, setBusy] = useState<string>();
  const [refusals, setRefusals] = useState<Record<string, string>>({});
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const loadSections = useCallback(async () => {
    try {
      const loaded = await getBridge().listPoolSections(storyId);
      if (live.current) {
        setSections(loaded);
        setSectionsError(undefined);
      }
    } catch (error) {
      if (live.current) setSectionsError(errorText(error));
    }
  }, [storyId]);

  useEffect(() => {
    void loadSections();
  }, [loadSections]);

  /**
   * Fetch one section's entries from `offset`, appending to (or, at 0, replacing) what is shown. A
   * refresh keeps the rows on screen until their replacements arrive, so nothing jumps.
   */
  const loadSection = useCallback(
    async (sectionId: string, offset: number, limit = POOL_BROWSER_PAGE, refresh = false) => {
      setOpen((current) => ({
        ...current,
        [sectionId]: {
          entries: offset === 0 && !refresh ? [] : current[sectionId]?.entries ?? [],
          total: current[sectionId]?.total ?? 0,
          loading: !refresh,
        },
      }));
      try {
        const page = await getBridge().browsePool(storyId, { sectionId, offset, limit });
        if (!live.current) return;
        setOpen((current) =>
          current[sectionId]
            ? {
                ...current,
                [sectionId]: {
                  entries: offset === 0 ? page.entries : [...current[sectionId]!.entries, ...page.entries],
                  total: page.total,
                  loading: false,
                },
              }
            : current
        );
      } catch (error) {
        if (!live.current) return;
        setOpen((current) =>
          current[sectionId]
            ? { ...current, [sectionId]: { ...current[sectionId]!, loading: false, error: errorText(error) } }
            : current
        );
      }
    },
    [storyId]
  );

  const runSearch = useCallback(
    async (text: string, offset: number, limit = POOL_BROWSER_PAGE, refresh = false) => {
      setResults((current) => ({
        entries: offset === 0 && !refresh ? [] : current?.entries ?? [],
        total: current?.total ?? 0,
        loading: !refresh,
      }));
      try {
        const page = await getBridge().browsePool(storyId, { search: text, offset, limit });
        if (!live.current) return;
        setResults((current) => ({
          entries: offset === 0 ? page.entries : [...(current?.entries ?? []), ...page.entries],
          total: page.total,
          loading: false,
        }));
      } catch (error) {
        if (live.current) setResults({ entries: [], total: 0, loading: false, error: errorText(error) });
      }
    },
    [storyId]
  );

  useEffect(() => {
    const text = query.trim();
    if (!text) {
      setResults(undefined);
      return;
    }
    const timer = setTimeout(() => void runSearch(text, 0), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, runSearch]);

  function toggleSection(sectionId: string): void {
    if (open[sectionId]) {
      setOpen(({ [sectionId]: _closed, ...rest }) => rest);
    } else {
      void loadSection(sectionId, 0);
    }
  }

  /** After a change, re-read the counts and every listing on screen, keeping how much was shown. */
  async function refreshShown(): Promise<void> {
    const keep = (listing: Listing | undefined) => Math.max(POOL_BROWSER_PAGE, listing?.entries.length ?? 0);
    await Promise.all([
      loadSections(),
      ...Object.entries(open).map(([sectionId, listing]) => loadSection(sectionId, 0, keep(listing), true)),
      ...(query.trim() ? [runSearch(query.trim(), 0, keep(results), true)] : []),
    ]);
  }

  async function change(entry: PoolBrowseEntry, enable: boolean): Promise<void> {
    setBusy(entry.entryId);
    setRefusals(({ [entry.entryId]: _cleared, ...rest }) => rest);
    try {
      const bridge = getBridge();
      const outcome = enable
        ? await bridge.enablePoolEntry(storyId, entry.entryId)
        : await bridge.disablePoolEntry(storyId, entry.entryId);
      const refusal = "ok" in outcome ? (outcome.ok ? undefined : outcome.reason) : outcome.allowed ? undefined : outcome.reason;
      if (refusal && live.current) setRefusals((current) => ({ ...current, [entry.entryId]: refusal }));
      await refreshShown();
      onChanged?.();
    } catch (error) {
      if (live.current) setRefusals((current) => ({ ...current, [entry.entryId]: errorText(error) }));
    } finally {
      if (live.current) setBusy(undefined);
    }
  }

  function rows(listing: Listing, more: () => void, showSection: boolean): JSX.Element {
    return (
      <div>
        {listing.error ? <InlineNotice severity="error" title="These entries could not be loaded." detail={listing.error} /> : null}
        <ul style={styles.list}>
          {listing.entries.map((entry) => (
            <PoolRow
              key={entry.entryId}
              entry={entry}
              sectionTitle={showSection ? sections?.find((section) => section.id === entry.sectionId)?.title : undefined}
              busy={busy === entry.entryId}
              refusal={refusals[entry.entryId]}
              onEnable={() => void change(entry, true)}
              onDisable={() => void change(entry, false)}
            />
          ))}
        </ul>
        {listing.loading ? (
          <div className="mono" style={styles.loading}>LOADING…</div>
        ) : listing.entries.length < listing.total ? (
          <Button variant="ghost" onClick={more} style={styles.more}>
            Show {Math.min(POOL_BROWSER_PAGE, listing.total - listing.entries.length)} more of {listing.total - listing.entries.length}
          </Button>
        ) : null}
      </div>
    );
  }

  if (sectionsError) {
    return (
      <InlineNotice
        severity="error"
        title="The universal pool could not be loaded."
        detail={sectionsError}
        style={{ marginBottom: 12 }}
      />
    );
  }
  if (!sections) return <div className="mono" style={styles.loading}>LOADING THE POOL…</div>;

  const offered = sections.reduce((sum, section) => sum + section.offered, 0);
  const enabled = sections.reduce((sum, section) => sum + section.enabled, 0);
  return (
    <div data-testid="pool-browser">
      <div style={styles.note}>
        {enabled} of {offered} pool entries are enabled in this story. Enabling an entry makes it exist in this world; it
        teaches nobody anything — characters still learn skills in play.
      </div>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search the whole pool…"
        aria-label="Search the universal pool"
        style={styles.search}
      />
      {query.trim() ? (
        results ? (
          <div data-testid="pool-search-results">
            {!results.loading && results.total === 0 && !results.error ? (
              <div style={styles.note}>Nothing in the pool matches “{query.trim()}”.</div>
            ) : (
              <div className="mono" style={styles.count}>{results.total} MATCH{results.total === 1 ? "" : "ES"}</div>
            )}
            {rows(results, () => void runSearch(query.trim(), results.entries.length), true)}
          </div>
        ) : (
          <div className="mono" style={styles.loading}>SEARCHING…</div>
        )
      ) : (
        <ul style={styles.sections}>
          {sections.map((section) => {
            const listing = open[section.id];
            return (
              <li key={section.id} style={styles.section}>
                <button
                  type="button"
                  aria-expanded={Boolean(listing)}
                  aria-controls={`pool-section-${section.id}`}
                  onClick={() => toggleSection(section.id)}
                  style={styles.sectionHead}
                >
                  <span aria-hidden="true" className="mono" style={styles.chevron}>{listing ? "▾" : "▸"}</span>
                  <span style={styles.sectionTitle}>{section.title}</span>
                  <span className="mono" style={section.enabled > 0 ? styles.countOn : styles.count}>
                    {section.offered === 0 ? "none offered" : `${section.enabled} of ${section.offered} enabled`}
                  </span>
                </button>
                {listing ? (
                  <div id={`pool-section-${section.id}`} style={styles.sectionBody}>
                    <div style={styles.sectionDesc}>{section.description}</div>
                    {rows(listing, () => void loadSection(section.id, listing.entries.length), false)}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PoolRow(props: {
  entry: PoolBrowseEntry;
  sectionTitle?: string;
  busy: boolean;
  refusal?: string;
  onEnable: () => void;
  onDisable: () => void;
}): JSX.Element {
  const { entry, sectionTitle, busy, refusal, onEnable, onDisable } = props;
  const provenance =
    entry.state === "enabled" ? (entry.source ? SOURCE_LABEL[entry.source] : "sealed in the rulebook") : undefined;
  // An enabled entry that must stay reads as kept on purpose — a label and its reason, not a dead button.
  const kept = entry.state === "enabled" && entry.reason !== undefined;
  const note =
    entry.state === "available"
      ? entry.bringsWith?.length
        ? `Also enables ${entry.bringsWith.join(", ")}.`
        : undefined
      : entry.reason;
  return (
    <li data-testid={`pool-entry-${entry.entryId}`} data-state={entry.state} style={entry.state === "excluded" ? styles.rowMuted : styles.row}>
      <div style={styles.rowMain}>
        <div style={styles.rowTop}>
          <span style={styles.name}>{entry.name}</span>
          <span className="mono" style={styles.tag}>{entry.kind}</span>
          {entry.tier ? <span className="mono" style={styles.tag}>{entry.tier}</span> : null}
          {sectionTitle ? <span className="mono" style={styles.tag}>{sectionTitle}</span> : null}
        </div>
        <div style={styles.desc}>{entry.description}</div>
        <div style={styles.status}>
          <span className="mono" style={entry.state === "enabled" ? styles.stateOn : styles.state}>
            {kept ? "KEPT" : STATE_LABEL[entry.state]}
            {provenance ? ` · ${provenance}` : ""}
          </span>
          {note ? <span style={styles.reason}>{note}</span> : null}
        </div>
        {refusal ? <div role="alert" style={styles.refusal}>{refusal}</div> : null}
      </div>
      <div style={styles.rowAction}>
        {entry.state === "available" ? (
          <Button variant="system" disabled={busy} onClick={onEnable} aria-label={`Enable ${entry.name}`}>
            {busy ? "Enabling…" : "Enable"}
          </Button>
        ) : entry.state === "enabled" && !kept ? (
          <Button variant="ghost" disabled={busy} onClick={onDisable} aria-label={`Disable ${entry.name}`}>
            {busy ? "Disabling…" : "Disable"}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

const styles: Record<string, CSSProperties> = {
  note: { fontSize: 12.5, color: "var(--secondary)", lineHeight: 1.5, marginBottom: 12 },
  search: {
    width: "100%",
    boxSizing: "border-box",
    fontFamily: "var(--font-ui)",
    fontSize: 13,
    color: "var(--prose)",
    background: "var(--bg2-card)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius-chip)",
    padding: "8px 12px",
    marginBottom: 12,
    outline: "none",
  },
  loading: { fontSize: 11, color: "var(--muted)", letterSpacing: "0.08em", padding: "8px 0" },
  sections: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 },
  section: { border: "1px solid var(--hairline)", borderRadius: "var(--radius-chip)", background: "var(--bg1-panel)" },
  sectionHead: {
    display: "flex",
    alignItems: "baseline",
    gap: 10,
    width: "100%",
    padding: "9px 14px",
    background: "transparent",
    border: 0,
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "var(--font-ui)",
  },
  chevron: { fontSize: 11, color: "var(--muted)", width: 10 },
  sectionTitle: { fontSize: 14, color: "var(--ui-text)" },
  count: { marginLeft: "auto", fontSize: 11, color: "var(--muted)" },
  countOn: { marginLeft: "auto", fontSize: 11, color: "var(--teal)" },
  sectionBody: { padding: "0 14px 12px 34px" },
  sectionDesc: { fontSize: 12, color: "var(--secondary)", marginBottom: 8 },
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 },
  row: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    background: "var(--bg2-card)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius-chip)",
    padding: "9px 12px",
  },
  rowMuted: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    background: "transparent",
    border: "1px dashed var(--hairline)",
    borderRadius: "var(--radius-chip)",
    padding: "9px 12px",
    opacity: 0.75,
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowTop: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 8 },
  name: { fontSize: 13.5, color: "var(--ui-text)" },
  tag: { fontSize: 10, color: "var(--muted)", letterSpacing: "0.06em" },
  desc: { fontSize: 12, color: "var(--secondary)", lineHeight: 1.45, marginTop: 2 },
  status: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline", marginTop: 4 },
  state: { fontSize: 10, color: "var(--muted)", letterSpacing: "0.06em" },
  stateOn: { fontSize: 10, color: "var(--teal)", letterSpacing: "0.06em" },
  reason: { fontSize: 11.5, color: "var(--secondary)" },
  refusal: { fontSize: 11.5, color: "var(--failure)", marginTop: 4 },
  rowAction: { flex: "0 0 auto" },
  more: { marginTop: 8 },
};
