/**
 * Lorebook — per-story world facts / keyword-triggered entries the storyteller pulls in when a
 * keyword appears in recent play. A master/detail surface: a searchable list of entries (left)
 * plus an editor (right) with a title, trigger-keyword chips, a content body with a word-count
 * warning past ~80 words, and an "always in context" toggle.
 *
 * Keyed by `props.storyId`: with no open story there is nothing to scope entries to, so the
 * screen shows an empty/no-story state. CRUD runs through the bridge
 * (`listLorebook(storyId)` / `saveLorebookEntry` / `deleteLorebookEntry`). Keyword chips use the
 * Chip "keyword" tone. Register discipline: titles/content are STORY (serif); keywords, the
 * word-count, and section labels are SYSTEM (mono, teal). Tokens only; honors reduced-motion and
 * the ~900px narrow layout (list stacks above the editor).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { getBridge } from "../bridge/core";
import type { LorebookEntry } from "../bridge/core";
import { Button, Chip, ConfirmDialog, EmptyState, InlineNotice, useReducedMotion } from "../components";

type LoadStatus = "loading" | "ready" | "error";
type ErrorKind = "provider-auth" | "model-output" | "network";

interface ScreenProps {
  storyId?: string;
}

const NARROW_QUERY = "(max-width: 900px)";
const WORD_LIMIT = 80;

function useMediaQuery(query: string): boolean {
  const get = (): boolean =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false;
  const [matches, setMatches] = useState<boolean>(get);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const onChange = (): void => setMatches(mql.matches);
    onChange();
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, [query]);
  return matches;
}

function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `lore-${Math.random().toString(36).slice(2)}`;
}

/** Word count of a content body (whitespace-split, empty → 0). */
function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Derive a list-row title from an entry (first line, or first keyword, or "Untitled entry"). */
function titleFor(entry: LorebookEntry): string {
  const firstLine = entry.content.split("\n")[0]?.trim();
  if (firstLine) return firstLine.length > 42 ? `${firstLine.slice(0, 41)}…` : firstLine;
  if (entry.keys[0]) return entry.keys[0];
  return "Untitled entry";
}

function emptyEntry(storyId: string): LorebookEntry {
  return { id: newId(), storyId, keys: [], content: "", enabled: false };
}

export function Lorebook(props: ScreenProps): JSX.Element {
  const { storyId } = props;
  const reduced = useReducedMotion();
  const narrow = useMediaQuery(NARROW_QUERY);
  const [entries, setEntries] = useState<LorebookEntry[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorKind, setErrorKind] = useState<ErrorKind>("network");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LorebookEntry | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [keywordInput, setKeywordInput] = useState("");
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    if (!storyId) {
      setEntries([]);
      setStatus("ready");
      return;
    }
    setStatus("loading");
    try {
      const list = await getBridge().listLorebook(storyId);
      setEntries(list);
      setStatus("ready");
    } catch {
      setErrorKind("network");
      setStatus("error");
    }
  }, [storyId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the draft in sync when selection changes to an existing entry.
  const selectEntry = useCallback((entry: LorebookEntry) => {
    setSelectedId(entry.id);
    setDraft({ ...entry, keys: [...entry.keys] });
    setIsNew(false);
    setKeywordInput("");
  }, []);

  const startNew = useCallback(() => {
    if (!storyId) return;
    const draftEntry = emptyEntry(storyId);
    setSelectedId(draftEntry.id);
    setDraft(draftEntry);
    setIsNew(true);
    setKeywordInput("");
  }, [storyId]);

  const cancelEdit = useCallback(() => {
    setDraft(null);
    setSelectedId(null);
    setIsNew(false);
    setConfirmDelete(false);
    setKeywordInput("");
  }, []);

  const addKeyword = useCallback(() => {
    const value = keywordInput.trim();
    if (!value || !draft) return;
    if (draft.keys.some((k) => k.toLowerCase() === value.toLowerCase())) {
      setKeywordInput("");
      return;
    }
    setDraft({ ...draft, keys: [...draft.keys, value] });
    setKeywordInput("");
  }, [keywordInput, draft]);

  const removeKeyword = useCallback(
    (key: string) => {
      if (!draft) return;
      setDraft({ ...draft, keys: draft.keys.filter((k) => k !== key) });
    },
    [draft]
  );

  const onKeywordKey = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        addKeyword();
      } else if (e.key === "Backspace" && keywordInput === "" && draft && draft.keys.length > 0) {
        setDraft({ ...draft, keys: draft.keys.slice(0, -1) });
      }
    },
    [addKeyword, keywordInput, draft]
  );

  const save = useCallback(async () => {
    if (!draft) return;
    try {
      await getBridge().saveLorebookEntry(draft);
      await load();
      // Re-select the saved entry so its list row stays highlighted.
      setSelectedId(draft.id);
      setIsNew(false);
    } catch {
      setErrorKind("network");
      setStatus("error");
    }
  }, [draft, load]);

  const doDelete = useCallback(async () => {
    if (!draft) return;
    setConfirmDelete(false);
    try {
      await getBridge().deleteLorebookEntry(draft.id);
      await load();
      setDraft(null);
      setSelectedId(null);
      setIsNew(false);
    } catch {
      setErrorKind("network");
      setStatus("error");
    }
  }, [draft, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        titleFor(e).toLowerCase().includes(q) ||
        e.content.toLowerCase().includes(q) ||
        e.keys.some((k) => k.toLowerCase().includes(q))
    );
  }, [entries, search]);

  const wc = draft ? wordCount(draft.content) : 0;
  const overLimit = wc > WORD_LIMIT;
  const editing = draft !== null;
  const fadeIn: CSSProperties = reduced ? {} : { animation: "mt-fade var(--motion-med) both" };

  // No open story → nothing to scope entries to.
  if (!storyId) {
    return (
      <div style={styles.screen} data-testid="lorebook-screen" data-nostory="true">
        <div style={styles.body}>
          <EmptyState
            glyph="❦"
            title="Open a story to tend its lore"
            body="Lorebook entries are world facts scoped to one story — keyword-triggered notes the storyteller quietly pulls into context. Open a story from the Library to add them."
          />
        </div>
      </div>
    );
  }

  return (
    <div style={styles.screen} data-testid="lorebook-screen" data-status={status}>
      <div style={styles.subHeader}>
        <p style={styles.subtitle}>
          Facts the storyteller pulls in when a keyword appears. Keep them short — they’re injected
          verbatim.
        </p>
        <Button variant="primary" onClick={startNew} data-testid="new-entry">
          ＋ New entry
        </Button>
      </div>

      {status === "error" ? (
        <div style={styles.body}>
          <InlineNotice
            severity="error"
            title="Couldn't load this story's lorebook"
            detail={
              errorKind === "network"
                ? "The lorebook store didn't respond. Check your connection and try again."
                : "Something went wrong loading the lorebook."
            }
          />
          <div style={{ marginTop: 12 }}>
            <Button variant="system" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        </div>
      ) : status === "loading" ? (
        <div style={styles.body} data-testid="lorebook-loading">
          {[0, 1, 2].map((i) => (
            <div key={i} style={styles.skeletonRow} aria-hidden="true" />
          ))}
        </div>
      ) : entries.length === 0 && !editing ? (
        <div style={styles.body}>
          <EmptyState
            glyph="❦"
            title="No lore yet"
            body="Add a world fact — a faction, a place, a piece of history — and tag it with the keywords that should summon it. When any keyword appears in play, the entry joins the storyteller’s context."
            action={
              <Button variant="primary" onClick={startNew}>
                ＋ Add your first entry
              </Button>
            }
          />
        </div>
      ) : (
        <div
          style={{
            ...styles.split,
            gridTemplateColumns: narrow ? "1fr" : "300px 1fr",
            gridTemplateRows: narrow ? "auto auto" : "1fr",
          }}
        >
          <div style={styles.listColumn}>
            <div style={styles.searchRow}>
              <span aria-hidden="true" style={{ color: "var(--muted)", fontSize: 13 }}>
                ⌕
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search entries"
                aria-label="Search entries"
                style={styles.searchInput}
              />
            </div>
            {filtered.length === 0 ? (
              <div style={styles.noMatches}>No entries match “{search}”.</div>
            ) : (
              filtered.map((e) => {
                const selected = e.id === selectedId;
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => selectEntry(e)}
                    data-testid="lore-row"
                    data-selected={selected || undefined}
                    style={{
                      ...styles.row,
                      borderLeftColor: selected ? "var(--brass)" : "transparent",
                      background: selected ? "var(--bg2-card)" : "transparent",
                    }}
                  >
                    <div style={styles.rowTop}>
                      <span style={styles.rowTitle}>{titleFor(e)}</span>
                      {e.enabled ? (
                        <span aria-label="Always in context" title="Always in context" style={styles.alwaysDot} />
                      ) : null}
                    </div>
                    {e.keys.length > 0 ? (
                      <div style={styles.rowKeys}>
                        {e.keys.slice(0, 4).map((k, i) => (
                          <span key={i} style={styles.rowKey}>
                            {k}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>

          {editing ? (
            <div style={{ ...styles.editor, ...fadeIn }} data-testid="lore-editor">
              <div style={styles.editorLabel}>{isNew ? "NEW ENTRY" : "EDITING ENTRY"}</div>

              <label style={styles.fieldLabel} htmlFor="lore-content">
                Content
              </label>
              <textarea
                id="lore-content"
                value={draft!.content}
                onChange={(e) => setDraft({ ...draft!, content: e.target.value })}
                placeholder="A monastic order that kept the vale as a house of warmth. Their censers burn “cold-fire” — light without heat."
                style={styles.contentInput}
              />
              <div style={styles.contentMeta}>
                <span>Keep it under ~{WORD_LIMIT} words so it doesn’t crowd the prompt.</span>
                <span
                  data-testid="word-count"
                  data-over={overLimit || undefined}
                  style={{ fontFamily: "var(--font-mono)", color: overLimit ? "var(--failure)" : "var(--muted)" }}
                >
                  {wc} words
                </span>
              </div>

              <label style={styles.fieldLabel} htmlFor="lore-keyword">
                Trigger keywords
              </label>
              <div style={styles.chipField}>
                {draft!.keys.map((k) => (
                  <Chip key={k} tone="keyword" onClick={() => removeKeyword(k)} title={`Remove “${k}”`}>
                    {k}
                    <span aria-hidden="true" style={{ marginLeft: 6, color: "var(--muted)" }}>
                      ×
                    </span>
                  </Chip>
                ))}
                <input
                  id="lore-keyword"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={onKeywordKey}
                  onBlur={addKeyword}
                  placeholder="add keyword…"
                  aria-label="Add trigger keyword"
                  style={styles.chipInput}
                />
              </div>
              <div style={styles.helpText}>
                When any keyword appears in recent play, this entry is quietly added to the
                storyteller’s context.
              </div>

              <div style={styles.toggleRow}>
                <div>
                  <div style={styles.toggleTitle}>Always in context</div>
                  <div style={styles.toggleHint}>Inject regardless of keywords (use sparingly).</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={draft!.enabled}
                  aria-label="Always in context"
                  onClick={() => setDraft({ ...draft!, enabled: !draft!.enabled })}
                  data-testid="always-toggle"
                  style={{
                    ...styles.toggle,
                    background: draft!.enabled ? "var(--brass)" : "var(--hairline)",
                    justifyContent: draft!.enabled ? "flex-end" : "flex-start",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      ...styles.toggleKnob,
                      background: draft!.enabled ? "var(--bg1-panel)" : "var(--muted)",
                    }}
                  />
                </button>
              </div>

              <div style={styles.editorActions}>
                {!isNew ? (
                  <Button
                    variant="ghost"
                    onClick={() => setConfirmDelete(true)}
                    data-testid="delete-entry"
                    style={{ color: "var(--failure)", borderColor: "color-mix(in srgb, var(--failure) 30%, transparent)" }}
                  >
                    Delete entry
                  </Button>
                ) : (
                  <span />
                )}
                <div style={{ display: "flex", gap: 9 }}>
                  <Button variant="ghost" onClick={cancelEdit}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={() => void save()} data-testid="save-entry">
                    Save entry
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div style={styles.editorPlaceholder} data-testid="lore-editor-empty">
              <EmptyState
                glyph="❦"
                title="Select an entry"
                body="Pick a lore entry from the list to edit it, or add a new one."
              />
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        tone="danger"
        title="Delete this entry?"
        body={
          draft ? (
            <>
              <b style={{ color: "var(--prose)" }}>{titleFor(draft)}</b> will be removed from this
              story’s lorebook. This can’t be undone.
            </>
          ) : undefined
        }
        confirmLabel="Delete"
        cancelLabel="Keep"
        onConfirm={() => void doDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  screen: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0, fontFamily: "var(--font-ui)" },
  subHeader: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 20,
    padding: "20px 34px 16px",
    borderBottom: "1px solid var(--hairline)",
  },
  subtitle: { margin: 0, fontSize: 13, color: "var(--secondary)", maxWidth: "60ch", lineHeight: 1.5 },
  body: { flex: 1, overflowY: "auto", padding: "28px 34px 60px" },
  split: {
    flex: 1,
    minHeight: 0,
    display: "grid",
    gap: 0,
  },
  listColumn: {
    borderRight: "1px solid var(--hairline)",
    overflowY: "auto",
    background: "var(--bg1-panel)",
    minHeight: 0,
  },
  searchRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "14px 18px",
    borderBottom: "1px solid var(--hairline)",
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    background: "transparent",
    border: 0,
    outline: "none",
    color: "var(--prose)",
    fontFamily: "var(--font-ui)",
    fontSize: 13,
  },
  noMatches: { padding: "18px", fontSize: 13, color: "var(--muted)" },
  row: {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "13px 18px",
    cursor: "pointer",
    borderBottom: "1px solid color-mix(in srgb, var(--hairline) 70%, transparent)",
    borderLeft: "2px solid transparent",
    background: "transparent",
    font: "inherit",
  },
  rowTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  rowTitle: { fontSize: 14, color: "var(--ui-text)", fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  alwaysDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "var(--brass)",
    boxShadow: "0 0 6px var(--brass)",
    flex: "0 0 auto",
  },
  rowKeys: { display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 },
  rowKey: {
    fontFamily: "var(--font-mono)",
    fontSize: 10,
    color: "var(--teal)",
    background: "var(--teal-tint)",
    borderRadius: 3,
    padding: "1px 6px",
  },
  editor: { overflowY: "auto", padding: "28px 34px 60px", minHeight: 0 },
  editorPlaceholder: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: 0 },
  editorLabel: {
    fontSize: 11,
    fontFamily: "var(--font-mono)",
    letterSpacing: "0.14em",
    color: "var(--teal)",
    marginBottom: 14,
  },
  fieldLabel: { display: "block", fontSize: 12, color: "var(--secondary)", marginBottom: 6 },
  contentInput: {
    width: "100%",
    maxWidth: 620,
    height: 170,
    resize: "vertical",
    background: "var(--bg1-panel)",
    border: "1px solid var(--hairline)",
    borderRadius: 8,
    padding: "13px 15px",
    color: "var(--prose)",
    fontFamily: "var(--font-prose)",
    fontSize: 15,
    lineHeight: 1.65,
    outline: "none",
  },
  contentMeta: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    maxWidth: 620,
    fontSize: 11,
    color: "var(--muted)",
    margin: "6px 0 18px",
  },
  chipField: {
    display: "flex",
    flexWrap: "wrap",
    gap: 7,
    alignItems: "center",
    maxWidth: 620,
    background: "var(--bg1-panel)",
    border: "1px solid var(--hairline)",
    borderRadius: 8,
    padding: "10px 12px",
  },
  chipInput: {
    flex: 1,
    minWidth: 100,
    background: "transparent",
    border: 0,
    outline: "none",
    color: "var(--prose)",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
  },
  helpText: { fontSize: 11, color: "var(--muted)", margin: "6px 0 18px", maxWidth: 620 },
  toggleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    maxWidth: 620,
    padding: "14px 16px",
    background: "var(--bg1-panel)",
    border: "1px solid var(--hairline)",
    borderRadius: 9,
  },
  toggleTitle: { fontSize: 13, color: "var(--ui-text)" },
  toggleHint: { fontSize: 11, color: "var(--muted)", marginTop: 2 },
  toggle: {
    width: 40,
    height: 22,
    borderRadius: 12,
    padding: 2,
    cursor: "pointer",
    border: 0,
    display: "flex",
    alignItems: "center",
    flex: "0 0 auto",
  },
  toggleKnob: { width: 18, height: 18, borderRadius: "50%", display: "block" },
  editorActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    maxWidth: 620,
    marginTop: 22,
  },
  skeletonRow: {
    height: 56,
    borderRadius: 8,
    background: "var(--bg2-card)",
    border: "1px solid var(--hairline)",
    marginBottom: 10,
    opacity: 0.6,
  },
};

export default Lorebook;
