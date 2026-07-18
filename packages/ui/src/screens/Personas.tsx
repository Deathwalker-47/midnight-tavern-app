/**
 * Personas — manage the player personas the narrator addresses ("who am I").
 *
 * A master/detail surface: a gallery of persona cards (list) plus an editor form. CRUD runs
 * through the bridge (`listPersonas` / `savePersona` / `deletePersona`); there is no persona
 * store, so this screen owns its own load/edit state and talks to `getBridge()` directly (the
 * contract permits screens to call the bridge). Deleting goes through a ConfirmDialog.
 *
 * Register discipline: names/prose are STORY (serif, brass); the "used in / default" meta and
 * counters are UI/system. Colors come from tokens only. Honors reduced-motion (fade-in gated)
 * and the ~900px narrow layout (the editor stacks under the list). The shell owns the page title;
 * this screen renders its own sub-header so the prototype's subtitle + "New persona" copy survive.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { getBridge } from "../bridge/core";
import type { PersonaRecord } from "../bridge/core";
import { Button, ConfirmDialog, EmptyState, InlineNotice, useReducedMotion } from "../components";

type LoadStatus = "loading" | "ready" | "error";
/** The three error families from the states matrix; persona load/save failures are `network`. */
type ErrorKind = "provider-auth" | "model-output" | "network";

interface ScreenProps {
  storyId?: string;
}

const NARROW_QUERY = "(max-width: 900px)";

/** Local media-query hook (mirrors useReducedMotion) so the split can collapse when narrow. */
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
  return c?.randomUUID ? c.randomUUID() : `persona-${Math.random().toString(36).slice(2)}`;
}

/** Two-letter initials from a name, e.g. "Kestrel Vane" → "KV". */
function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const a = parts[0]![0] ?? "";
  const b = parts[1]?.[0] ?? parts[0]![1] ?? "";
  return (a + b).toUpperCase();
}

/** A blank draft for the "New persona" flow. */
function emptyDraft(isFirst: boolean): PersonaRecord {
  return { id: newId(), name: "", description: "", isDefault: isFirst };
}

export function Personas(_props: ScreenProps): JSX.Element {
  const reduced = useReducedMotion();
  const narrow = useMediaQuery(NARROW_QUERY);
  const [personas, setPersonas] = useState<PersonaRecord[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [errorKind, setErrorKind] = useState<ErrorKind>("network");
  const [draft, setDraft] = useState<PersonaRecord | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const list = await getBridge().listPersonas();
      setPersonas(list);
      setStatus("ready");
    } catch {
      setErrorKind("network");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startNew = useCallback(() => {
    setDraft(emptyDraft(personas.length === 0));
    setIsNew(true);
  }, [personas.length]);

  const startEdit = useCallback((p: PersonaRecord) => {
    setDraft({ ...p });
    setIsNew(false);
  }, []);

  const cancelEdit = useCallback(() => {
    setDraft(null);
    setIsNew(false);
    setConfirmDelete(false);
  }, []);

  const save = useCallback(async () => {
    if (!draft || !draft.name.trim()) return;
    setSaving(true);
    try {
      await getBridge().savePersona({ ...draft, name: draft.name.trim() });
      await load();
      setDraft(null);
      setIsNew(false);
    } catch {
      setErrorKind("network");
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }, [draft, load]);

  const doDelete = useCallback(async () => {
    if (!draft) return;
    setConfirmDelete(false);
    try {
      await getBridge().deletePersona(draft.id);
      await load();
      setDraft(null);
      setIsNew(false);
    } catch {
      setErrorKind("network");
      setStatus("error");
    }
  }, [draft, load]);

  const editing = draft !== null;
  const fadeIn: CSSProperties = reduced ? {} : { animation: "mt-fade var(--motion-med) both" };

  return (
    <div style={styles.screen} data-testid="personas-screen" data-status={status}>
      <div style={styles.subHeader}>
        <p style={styles.subtitle}>
          The selves you step into. Pick one when you start a story — the world builds your sheet
          around it.
        </p>
        <Button variant="primary" onClick={startNew} data-testid="new-persona">
          ＋ New persona
        </Button>
      </div>

      {status === "error" ? (
        <div style={styles.body}>
          <InlineNotice
            severity="error"
            title="Couldn't load your personas"
            detail={
              errorKind === "network"
                ? "The persona store didn't respond. Check your connection and try again."
                : "Something went wrong loading personas."
            }
          />
          <div style={{ marginTop: 12 }}>
            <Button variant="system" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        </div>
      ) : status === "loading" ? (
        <div style={styles.body} data-testid="personas-loading">
          <div style={styles.grid}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={styles.skeletonCard} aria-hidden="true" />
            ))}
          </div>
        </div>
      ) : personas.length === 0 && !editing ? (
        <div style={styles.body}>
          <EmptyState
            glyph="☙"
            title="No personas yet"
            body="A persona is the self you carry into a story — the voice the narrator writes “you” for. Create one to get started."
            action={
              <Button variant="primary" onClick={startNew}>
                ＋ Create a persona
              </Button>
            }
          />
        </div>
      ) : (
        <div
          style={{
            ...styles.body,
            ...styles.split,
            gridTemplateColumns: editing && !narrow ? "1fr 380px" : "1fr",
          }}
        >
          <div style={styles.listColumn}>
            <div style={styles.grid}>
              {personas.map((p) => {
                const selected = draft?.id === p.id && !isNew;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => startEdit(p)}
                    data-testid="persona-card"
                    data-selected={selected || undefined}
                    style={{
                      ...styles.card,
                      borderColor: selected
                        ? "var(--brass)"
                        : p.isDefault
                          ? "color-mix(in srgb, var(--brass) 22%, transparent)"
                          : "var(--hairline)",
                    }}
                  >
                    <div style={styles.cardTop}>
                      <span aria-hidden="true" style={styles.avatar}>
                        {initialsFor(p.name || "?")}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={styles.cardNameRow}>
                          <span style={styles.cardName}>{p.name || "Unnamed"}</span>
                          {p.isDefault ? <span style={styles.defaultBadge}>DEFAULT</span> : null}
                        </div>
                      </div>
                    </div>
                    <div style={styles.cardBlurb}>{p.description || "No description yet."}</div>
                  </button>
                );
              })}

              <button type="button" onClick={startNew} style={styles.newTile} data-testid="new-tile">
                <span style={{ fontSize: 30 }} aria-hidden="true">
                  ＋
                </span>
                <span style={{ fontSize: 13 }}>Create a persona</span>
              </button>
            </div>
          </div>

          {editing ? (
            <div style={{ ...styles.editor, ...fadeIn }} data-testid="persona-editor">
              <div style={styles.editorLabel}>{isNew ? "NEW PERSONA" : "EDITING PERSONA"}</div>

              <div style={styles.avatarPreviewRow}>
                <span aria-hidden="true" style={styles.avatarLarge}>
                  {initialsFor(draft!.name || "?")}
                </span>
              </div>

              <label style={styles.fieldLabel} htmlFor="persona-name">
                Name
              </label>
              <input
                id="persona-name"
                value={draft!.name}
                onChange={(e) => setDraft({ ...draft!, name: e.target.value })}
                placeholder="Kestrel Vane"
                style={styles.nameInput}
              />

              <label style={styles.fieldLabel} htmlFor="persona-desc">
                Who are they?
              </label>
              <textarea
                id="persona-desc"
                value={draft!.description}
                onChange={(e) => setDraft({ ...draft!, description: e.target.value })}
                placeholder="A courier who takes the roads no one else will. Loyal to the contract — and, lately, to more than that."
                style={styles.descInput}
              />
              <div style={styles.helpText}>This voice guides how the storyteller writes “you.”</div>

              <div style={styles.toggleRow}>
                <div>
                  <div style={styles.toggleTitle}>Default persona</div>
                  <div style={styles.toggleHint}>Offered first when you begin a new story.</div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={draft!.isDefault}
                  aria-label="Default persona"
                  onClick={() => setDraft({ ...draft!, isDefault: !draft!.isDefault })}
                  data-testid="default-toggle"
                  style={{
                    ...styles.toggle,
                    background: draft!.isDefault ? "var(--brass)" : "var(--hairline)",
                    justifyContent: draft!.isDefault ? "flex-end" : "flex-start",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      ...styles.toggleKnob,
                      background: draft!.isDefault ? "var(--bg1-panel)" : "var(--muted)",
                    }}
                  />
                </button>
              </div>

              <div style={styles.editorActions}>
                {!isNew ? (
                  <Button
                    variant="ghost"
                    onClick={() => setConfirmDelete(true)}
                    data-testid="delete-persona"
                    style={{ color: "var(--failure)", borderColor: "color-mix(in srgb, var(--failure) 30%, transparent)" }}
                  >
                    Delete persona
                  </Button>
                ) : (
                  <span />
                )}
                <div style={{ display: "flex", gap: 9 }}>
                  <Button variant="ghost" onClick={cancelEdit}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={() => void save()} disabled={saving || !draft!.name.trim()}>
                    Save persona
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        tone="danger"
        title="Delete this persona?"
        body={
          draft ? (
            <>
              <b style={{ color: "var(--prose)" }}>{draft.name || "This persona"}</b> will be
              removed. Stories already begun with it keep their sheets.
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
    padding: "20px 40px 16px",
    borderBottom: "1px solid var(--hairline)",
  },
  subtitle: { margin: 0, fontSize: 13, color: "var(--secondary)", maxWidth: "60ch", lineHeight: 1.5 },
  body: { flex: 1, minHeight: 0, overflowY: "auto", padding: "28px 40px 60px" },
  split: { display: "grid", gap: 24, alignItems: "start" },
  listColumn: { minWidth: 0 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 },
  card: {
    display: "block",
    textAlign: "left",
    cursor: "pointer",
    background: "linear-gradient(160deg, var(--bg2-card), var(--bg1-panel))",
    border: "1px solid var(--hairline)",
    borderRadius: 11,
    padding: "16px 17px",
    font: "inherit",
    color: "var(--prose)",
  },
  cardTop: { display: "flex", gap: 13, alignItems: "center" },
  avatar: {
    width: 44,
    height: 44,
    flex: "0 0 44px",
    borderRadius: 10,
    background: "var(--bg3-raised)",
    border: "1px solid color-mix(in srgb, var(--brass) 33%, transparent)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    fontSize: 18,
    color: "var(--brass)",
  },
  cardNameRow: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 },
  cardName: {
    fontFamily: "var(--font-display)",
    fontSize: 20,
    fontWeight: 600,
    color: "var(--prose)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  defaultBadge: {
    fontSize: 9,
    fontFamily: "var(--font-mono)",
    color: "var(--success)",
    border: "1px solid var(--success)",
    borderRadius: 3,
    padding: "1px 5px",
    flex: "0 0 auto",
  },
  cardBlurb: {
    fontSize: 12.5,
    color: "var(--secondary)",
    lineHeight: 1.55,
    marginTop: 12,
    minHeight: 36,
    display: "-webkit-box",
    WebkitLineClamp: 3,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  newTile: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    background: "transparent",
    border: "1px dashed var(--hairline)",
    borderRadius: 11,
    padding: 30,
    minHeight: 120,
    color: "var(--muted)",
    cursor: "pointer",
    font: "inherit",
  },
  editor: {
    background: "var(--bg1-panel)",
    border: "1px solid var(--hairline)",
    borderRadius: 12,
    padding: "22px 22px 20px",
    position: "sticky",
    top: 0,
  },
  editorLabel: {
    fontSize: 11,
    fontFamily: "var(--font-mono)",
    letterSpacing: "0.14em",
    color: "var(--teal)",
    marginBottom: 16,
  },
  avatarPreviewRow: { display: "flex", justifyContent: "center", marginBottom: 18 },
  avatarLarge: {
    width: 72,
    height: 72,
    borderRadius: 16,
    background: "var(--bg3-raised)",
    border: "1px solid color-mix(in srgb, var(--brass) 40%, transparent)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    fontSize: 32,
    color: "var(--brass)",
  },
  fieldLabel: { display: "block", fontSize: 12, color: "var(--secondary)", marginBottom: 6 },
  nameInput: {
    width: "100%",
    background: "var(--bg2-card)",
    border: "1px solid var(--hairline)",
    borderRadius: 8,
    padding: "11px 13px",
    color: "var(--prose)",
    fontFamily: "var(--font-display)",
    fontSize: 22,
    outline: "none",
    marginBottom: 16,
  },
  descInput: {
    width: "100%",
    height: 110,
    resize: "vertical",
    background: "var(--bg2-card)",
    border: "1px solid var(--hairline)",
    borderRadius: 8,
    padding: "12px 14px",
    color: "var(--prose)",
    fontFamily: "var(--font-prose)",
    fontSize: 15,
    lineHeight: 1.6,
    outline: "none",
    marginBottom: 6,
  },
  helpText: { fontSize: 11, color: "var(--muted)", marginBottom: 20 },
  toggleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "14px 16px",
    background: "var(--bg2-card)",
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
  editorActions: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 22, gap: 12 },
  skeletonCard: {
    height: 140,
    borderRadius: 11,
    background: "linear-gradient(160deg, var(--bg2-card), var(--bg1-panel))",
    border: "1px solid var(--hairline)",
    opacity: 0.6,
  },
};

export default Personas;
