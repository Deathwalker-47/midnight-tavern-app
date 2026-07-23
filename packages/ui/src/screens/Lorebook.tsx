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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { getBridge } from "../bridge/core";
import type { LorebookEntry, LorebookLibraryEntry } from "../bridge/core";
import { Button, Chip, ConfirmDialog, EmptyState, InlineNotice, LorebookLibraryCard, useReducedMotion } from "../components";
import type { LorebookSourceTag } from "../components";

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

function emptyEntry(): LorebookEntry {
  // lorebookId is assigned by the bridge (resolves the story's default lorebook) on save.
  return {
    id: newId(),
    lorebookId: "",
    keys: [],
    content: "",
    enabled: false,
    alwaysOn: false,
    priority: 0,
    insertionOrder: 0,
  };
}

interface ImportedLorebook {
  name: string;
  entries: LorebookEntry[];
}

function strings(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

/** Accepts SillyTavern World Info, character-book, and Midnight Tavern entry JSON. */
export function parseLorebookJson(text: string, fallbackName: string): ImportedLorebook {
  const raw = JSON.parse(text) as unknown;
  const parsed = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  const characterBook = parsed.character_book && typeof parsed.character_book === "object"
    ? parsed.character_book as Record<string, unknown>
    : undefined;
  const entrySource = Array.isArray(raw) ? raw : characterBook?.entries ?? parsed.entries;
  const rows = Array.isArray(entrySource)
    ? entrySource
    : entrySource && typeof entrySource === "object"
      ? Object.values(entrySource as Record<string, unknown>)
      : [];
  const entries = rows.flatMap((row, index): LorebookEntry[] => {
    if (!row || typeof row !== "object") return [];
    const source = row as Record<string, unknown>;
    const content = typeof source.content === "string" ? source.content.trim() : "";
    if (!content) return [];
    const keys = [...strings(source.keys ?? source.key), ...strings(source.secondary_keys ?? source.keysecondary)];
    const disabled = source.disable === true || source.enabled === false;
    const priority = typeof source.priority === "number"
      ? source.priority
      : typeof source.order === "number" ? source.order : 0;
    return [{
      id: newId(),
      lorebookId: "",
      keys: [...new Set(keys)],
      content,
      enabled: !disabled,
      alwaysOn: source.constant === true || source.alwaysOn === true || source.always_on === true,
      priority,
      insertionOrder: typeof source.insertionOrder === "number" ? source.insertionOrder : index,
    }];
  });
  if (entries.length === 0) throw new Error("This JSON does not contain any lorebook entries with content.");
  const rawName = characterBook?.name ?? parsed.name;
  const name = typeof rawName === "string" && rawName.trim() ? rawName.trim() : fallbackName;
  return { name, entries };
}

/**
 * Lore always opens on the lorebook shelf. Entries are intentionally fetched only after a user
 * selects one book, preserving the book → entries hierarchy for both story and global browsing.
 */
export function Lorebook(props: ScreenProps): JSX.Element {
  return <GlobalLorebookLibrary storyId={props.storyId} />;
}

/**
 * Retained entry editor for the story-default bridge contract. The routed screen now reaches entry
 * editing through BookEntryEditor, which is bound to the exact selected lorebook id.
 */
function StoryLorebookEntryEditor(props: ScreenProps): JSX.Element {
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
    const draftEntry = emptyEntry();
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
    if (!draft || !storyId) return;
    try {
      await getBridge().saveLorebookEntry(storyId, draft);
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

  // No open story → show the global lorebook library (v2 §2): every book across the app, with a
  // create affordance and a drill-in entry editor bound to that specific book.
  if (!storyId) {
    return <GlobalLorebookLibrary />;
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

/** Narrow a lorebook's free-string source to the LorebookLibraryCard tag union. */
function asSourceTag(source: string | undefined): LorebookSourceTag {
  return source === "imported_card" || source === "migrated" ? source : "user";
}

/**
 * GlobalLorebookLibrary — the top-level lorebook shelf shown when no story is open (v2 §2).
 * Lists every lorebook (LorebookLibraryCard: name, entry count, "used in N stories", source), with
 * a create affordance; drilling into a card opens a per-book entry editor bound to that lorebook via
 * the `*In` bridge methods (listLorebookEntries / saveLorebookEntryIn / deleteLorebookEntry).
 */
function GlobalLorebookLibrary(props: { storyId?: string }): JSX.Element {
  const { storyId } = props;
  const [books, setBooks] = useState<LorebookLibraryEntry[]>([]);
  const [attachedIds, setAttachedIds] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [openBook, setOpenBook] = useState<LorebookLibraryEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string>();
  const importInput = useRef<HTMLInputElement>(null);

  const loadBooks = useCallback(async () => {
    setStatus("loading");
    try {
      const bridge = getBridge();
      const [library, attached] = await Promise.all([
        bridge.listLorebooks(),
        storyId ? bridge.listAttachedLorebooks(storyId) : Promise.resolve([]),
      ]);
      setBooks(library);
      setAttachedIds(new Set(attached.map((book) => book.id)));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [storyId]);

  useEffect(() => {
    void loadBooks();
  }, [loadBooks]);

  async function onCreate(): Promise<void> {
    const name = newName.trim();
    if (!name) return;
    const bridge = getBridge();
    const book = await bridge.createLorebook(name);
    if (storyId) await bridge.attachLorebook(storyId, book.id);
    setNewName("");
    setCreating(false);
    await loadBooks();
  }

  async function onImport(file: File): Promise<void> {
    setImporting(true);
    setImportError(undefined);
    try {
      const fallbackName = file.name.replace(/\.json$/i, "") || "Imported lorebook";
      const imported = parseLorebookJson(await file.text(), fallbackName);
      const bridge = getBridge();
      const book = await bridge.createLorebook(imported.name, `Imported from ${file.name}`);
      await Promise.all(imported.entries.map((entry) =>
        bridge.saveLorebookEntryIn(book.id, { ...entry, lorebookId: book.id })
      ));
      if (storyId) await bridge.attachLorebook(storyId, book.id);
      await loadBooks();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Couldn't import that lorebook.");
    } finally {
      setImporting(false);
      if (importInput.current) importInput.current.value = "";
    }
  }

  if (openBook) {
    return (
      <BookEntryEditor
        book={openBook}
        onBack={() => {
          setOpenBook(null);
          void loadBooks();
        }}
      />
    );
  }

  return (
    <div
      style={styles.screen}
      data-testid="lorebook-screen"
      data-nostory={!storyId || undefined}
      data-story-scoped={Boolean(storyId) || undefined}
      data-status={status}
    >
      <input
        ref={importInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onImport(file);
        }}
      />
      <div style={styles.subHeader}>
        <p style={styles.subtitle}>
          {storyId
            ? "Choose a lorebook to browse its entries. Books marked Attached can feed this story; the rest remain in your reusable global library."
            : "Lorebooks are shared world-fact collections. Build them here, then attach them to any story from its Story Settings."}
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Button variant="secondary" onClick={() => importInput.current?.click()} disabled={importing} data-testid="import-lorebook">
            {importing ? "Importing…" : "⇧ Import JSON"}
          </Button>
        <Button variant="primary" onClick={() => setCreating(true)} data-testid="new-lorebook">
          ＋ New lorebook
        </Button>
        </div>
      </div>

      <div style={styles.body}>
        {importError ? (
          <div style={{ marginBottom: 16 }}>
            <InlineNotice severity="error" title="Couldn't import lorebook" detail={importError} />
          </div>
        ) : null}
        {creating ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20, maxWidth: 480 }}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onCreate();
                if (e.key === "Escape") setCreating(false);
              }}
              autoFocus
              placeholder="Lorebook name…"
              aria-label="New lorebook name"
              style={styles.searchInput}
            />
            <Button variant="primary" onClick={() => void onCreate()} disabled={!newName.trim()}>
              Create
            </Button>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
          </div>
        ) : null}

        {status === "error" ? (
          <InlineNotice severity="error" title="Couldn't load your lorebooks" detail="The lorebook store didn't respond." />
        ) : status === "loading" ? (
          <div>
            {[0, 1, 2].map((i) => (
              <div key={i} style={styles.skeletonRow} aria-hidden="true" />
            ))}
          </div>
        ) : books.length === 0 ? (
          <EmptyState
            glyph="❦"
            title="No lorebooks yet"
            body="Create a lorebook — a faction, a region, a mythology — then attach it to the stories that should draw on it."
            action={
              <Button variant="primary" onClick={() => setCreating(true)}>
                ＋ Create your first lorebook
              </Button>
            }
          />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
            {books.map((b) => (
              <LorebookLibraryCard
                key={b.id}
                name={b.name}
                source={asSourceTag(b.source)}
                entryCount={b.entryCount}
                attachmentCount={b.attachmentCount}
                contextLabel={storyId && attachedIds.has(b.id) ? "ATTACHED" : undefined}
                onOpen={() => setOpenBook(b)}
                style={storyId && attachedIds.has(b.id) ? { borderColor: "var(--brass-dim)" } : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Per-book entry editor for the global library — mirrors the story editor but targets one book. */
function BookEntryEditor(props: { book: LorebookLibraryEntry; onBack: () => void }): JSX.Element {
  const { book, onBack } = props;
  const [entries, setEntries] = useState<LorebookEntry[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [draft, setDraft] = useState<LorebookEntry | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [keywordInput, setKeywordInput] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      setEntries(await getBridge().listLorebookEntries(book.id));
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [book.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const startNew = (): void => {
    setDraft(emptyEntry());
    setIsNew(true);
    setKeywordInput("");
  };
  const save = async (): Promise<void> => {
    if (!draft) return;
    await getBridge().saveLorebookEntryIn(book.id, draft);
    await load();
    setDraft(null);
    setIsNew(false);
  };
  const doDelete = async (): Promise<void> => {
    if (!draft) return;
    setConfirmDelete(false);
    await getBridge().deleteLorebookEntry(draft.id);
    await load();
    setDraft(null);
    setIsNew(false);
  };
  const addKeyword = (): void => {
    const value = keywordInput.trim();
    if (!value || !draft) return;
    if (!draft.keys.some((k) => k.toLowerCase() === value.toLowerCase())) {
      setDraft({ ...draft, keys: [...draft.keys, value] });
    }
    setKeywordInput("");
  };

  const wc = draft ? wordCount(draft.content) : 0;
  const overLimit = wc > WORD_LIMIT;

  return (
    <div style={styles.screen} data-testid="lorebook-book-editor">
      <div style={styles.subHeader}>
        <div>
          <button type="button" onClick={onBack} style={{ background: "none", border: "none", color: "var(--secondary)", cursor: "pointer", fontSize: 12.5, marginBottom: 4, padding: 0 }}>
            ← All lorebooks
          </button>
          <p style={{ ...styles.subtitle, fontFamily: "var(--font-display)", fontSize: 20, color: "var(--prose)", margin: 0 }}>{book.name}</p>
        </div>
        <Button variant="primary" onClick={startNew}>
          ＋ New entry
        </Button>
      </div>

      <div style={styles.body}>
        {status === "error" ? (
          <InlineNotice severity="error" title="Couldn't load entries" detail="The lorebook store didn't respond." />
        ) : draft ? (
          <div style={{ maxWidth: 640 }}>
            <div style={styles.editorLabel}>{isNew ? "NEW ENTRY" : "EDITING ENTRY"}</div>
            <label style={styles.fieldLabel} htmlFor="book-content">Content</label>
            <textarea
              id="book-content"
              value={draft.content}
              onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              placeholder="A world fact, kept short."
              style={styles.contentInput}
            />
            <div style={styles.contentMeta}>
              <span>Keep it under ~{WORD_LIMIT} words.</span>
              <span style={{ fontFamily: "var(--font-mono)", color: overLimit ? "var(--failure)" : "var(--muted)" }}>{wc} words</span>
            </div>

            <label style={styles.fieldLabel} htmlFor="book-keyword">Trigger keywords</label>
            <div style={styles.chipField}>
              {draft.keys.map((k) => (
                <Chip key={k} tone="keyword" onClick={() => setDraft({ ...draft, keys: draft.keys.filter((x) => x !== k) })} title={`Remove “${k}”`}>
                  {k}
                  <span aria-hidden="true" style={{ marginLeft: 6, color: "var(--muted)" }}>×</span>
                </Chip>
              ))}
              <input
                id="book-keyword"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addKeyword();
                  }
                }}
                onBlur={addKeyword}
                placeholder="add keyword…"
                aria-label="Add trigger keyword"
                style={styles.chipInput}
              />
            </div>

            <div style={styles.toggleRow}>
              <div>
                <div style={styles.toggleTitle}>Always in context</div>
                <div style={styles.toggleHint}>Inject regardless of keywords (use sparingly).</div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={draft.alwaysOn}
                aria-label="Always in context"
                onClick={() => setDraft({ ...draft, alwaysOn: !draft.alwaysOn, enabled: true })}
                style={{ ...styles.toggle, background: draft.alwaysOn ? "var(--brass)" : "var(--hairline)", justifyContent: draft.alwaysOn ? "flex-end" : "flex-start" }}
              >
                <span aria-hidden="true" style={{ ...styles.toggleKnob, background: draft.alwaysOn ? "var(--bg1-panel)" : "var(--muted)" }} />
              </button>
            </div>

            <div style={styles.editorActions}>
              {!isNew ? (
                <Button variant="ghost" onClick={() => setConfirmDelete(true)} style={{ color: "var(--failure)", borderColor: "color-mix(in srgb, var(--failure) 30%, transparent)" }}>
                  Delete entry
                </Button>
              ) : (
                <span />
              )}
              <div style={{ display: "flex", gap: 9 }}>
                <Button variant="ghost" onClick={() => { setDraft(null); setIsNew(false); }}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => void save()}>
                  Save entry
                </Button>
              </div>
            </div>
          </div>
        ) : status === "loading" ? (
          <div>
            {[0, 1, 2].map((i) => (
              <div key={i} style={styles.skeletonRow} aria-hidden="true" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <EmptyState glyph="❦" title="No entries yet" body="Add a world fact and tag it with the keywords that should summon it." action={<Button variant="primary" onClick={startNew}>＋ Add entry</Button>} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 640 }}>
            {entries.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => { setDraft({ ...e, keys: [...e.keys] }); setIsNew(false); }}
                style={{ ...styles.row, borderLeftColor: "transparent", background: "var(--bg1-panel)", borderRadius: 8, border: "1px solid var(--hairline)" }}
              >
                <div style={styles.rowTop}>
                  <span style={styles.rowTitle}>{titleFor(e)}</span>
                  {e.alwaysOn ? <span aria-label="Always in context" title="Always in context" style={styles.alwaysDot} /> : null}
                </div>
                {e.keys.length > 0 ? (
                  <div style={styles.rowKeys}>
                    {e.keys.slice(0, 4).map((k, i) => (
                      <span key={i} style={styles.rowKey}>{k}</span>
                    ))}
                  </div>
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        tone="danger"
        title="Delete this entry?"
        body={draft ? <><b style={{ color: "var(--prose)" }}>{titleFor(draft)}</b> will be removed from this lorebook. This can’t be undone.</> : undefined}
        confirmLabel="Delete"
        cancelLabel="Keep"
        onConfirm={() => void doDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

export default Lorebook;
