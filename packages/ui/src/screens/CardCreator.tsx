/**
 * CardCreator — import a character card (Chara Card V2/V3) into the app. This is where
 * character-card ingestion surfaces to the user: import from a file's bytes
 * (`importCardFromBytes`) or from a URL (`importCardFromUrl`), then show the mapped card plus any
 * importer warnings. Importer failures map onto the three error families (bad format →
 * model-output-style "unreadable" copy; network → "couldn't reach"; anything else → generic).
 *
 * The result preview mirrors the prototype's LIVE PREVIEW panel: avatar initials, name, tagline
 * (first trait), the premise blurb, trait chips, and any seeded lorebook rows. Confirming would
 * seed a new story (the Library flow owns that); here we surface the mapped card and let the user
 * accept or discard. Register discipline: name/premise are STORY (serif); the "Card format V2/V3"
 * provenance and counts are SYSTEM (mono). Tokens only; honors reduced-motion and narrow layout.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent } from "react";
import { getBridge } from "../bridge/core";
import type { CardImportResult } from "../bridge/core";
import { Button, Chip, EmptyState, InlineNotice, useReducedMotion } from "../components";

/** Import lifecycle: idle → validating → preview | error. */
type Phase = "idle" | "validating" | "preview" | "error";
type ErrorKind = "provider-auth" | "model-output" | "network";
/** Which affordance is being used, so the error copy can name the source. */
type Source = "file" | "url";

interface ScreenProps {
  storyId?: string;
}

const NARROW_QUERY = "(max-width: 900px)";

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

/** Two-letter initials from a name. */
function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const a = parts[0]![0] ?? "";
  const b = parts[1]?.[0] ?? parts[0]![1] ?? "";
  return (a + b).toUpperCase();
}

/**
 * Classify an importer failure into one of the three error families. A card-parse failure (bad
 * format / unrecognized card) reads like a "model-output" family error (the payload was garbage);
 * a fetch/timeout is "network"; the in-memory stub's "unavailable" throw is treated as network
 * (the backend didn't answer).
 */
function classifyError(err: unknown): { kind: ErrorKind; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();
  if (
    lower.includes("format") ||
    lower.includes("unrecognized") ||
    lower.includes("not a json") ||
    lower.includes("parse") ||
    lower.includes("card payload")
  ) {
    return { kind: "model-output", message: raw };
  }
  if (lower.includes("network") || lower.includes("fetch") || lower.includes("timeout") || lower.includes("reach")) {
    return { kind: "network", message: raw };
  }
  return { kind: "network", message: raw };
}

export function CardCreator(_props: ScreenProps): JSX.Element {
  const reduced = useReducedMotion();
  const narrow = useMediaQuery(NARROW_QUERY);
  const [phase, setPhase] = useState<Phase>("idle");
  const [source, setSource] = useState<Source>("file");
  const [result, setResult] = useState<CardImportResult | null>(null);
  const [errorKind, setErrorKind] = useState<ErrorKind>("network");
  const [errorMessage, setErrorMessage] = useState("");
  const [url, setUrl] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const runImport = useCallback(async (src: Source, run: () => Promise<CardImportResult>) => {
    setSource(src);
    setPhase("validating");
    setResult(null);
    try {
      const imported = await run();
      setResult(imported);
      setPhase("preview");
    } catch (err) {
      const { kind, message } = classifyError(err);
      setErrorKind(kind);
      setErrorMessage(message);
      setPhase("error");
    }
  }, []);

  const importFromFile = useCallback(
    async (file: File) => {
      await runImport("file", async () => {
        const buffer = await file.arrayBuffer();
        return getBridge().importCardFromBytes(new Uint8Array(buffer));
      });
    },
    [runImport]
  );

  const importFromUrl = useCallback(async () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    await runImport("url", () => getBridge().importCardFromUrl(trimmed, controller.signal));
  }, [url, runImport]);

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void importFromFile(file);
      // Reset so re-selecting the same file re-fires change.
      e.target.value = "";
    },
    [importFromFile]
  );

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void importFromFile(file);
    },
    [importFromFile]
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setPhase("idle");
    setResult(null);
    setErrorMessage("");
  }, []);

  const mapped = result?.mapped;
  const traits = mapped?.identity.traits ?? [];
  const tagline = traits[0] ?? "Imported character";
  const displayName = mapped?.name?.trim() || "Imported Character";
  // A short premise blurb for the preview (the full premise can be long).
  const blurb = useMemo(() => {
    const premise = mapped?.premise?.trim();
    if (!premise) return "No description was found on this card.";
    return premise.length > 320 ? `${premise.slice(0, 319)}…` : premise;
  }, [mapped]);
  const fadeIn: CSSProperties = reduced ? {} : { animation: "mt-fade var(--motion-med) both" };

  return (
    <div style={styles.screen} data-testid="cardcreator-screen" data-phase={phase}>
      <div style={styles.subHeader}>
        <p style={styles.subtitle}>
          Bring a character card into the tavern. Import a Character Card (V2/V3) from a file or a
          URL — we map its story, personality, and lore; the world decides the rest.
        </p>
      </div>

      <div
        style={{
          ...styles.body,
          gridTemplateColumns: narrow || phase !== "preview" ? "1fr" : "1fr 360px",
        }}
      >
        <div style={styles.importColumn}>
          {/* ── File / drag-drop ── */}
          <section style={styles.panel} aria-label="Import from file">
            <div style={styles.panelLabel}>FROM A FILE</div>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={onDrop}
              style={{
                ...styles.dropZone,
                borderColor: dragActive ? "var(--brass)" : "var(--hairline)",
                background: dragActive ? "color-mix(in srgb, var(--brass) 8%, transparent)" : "transparent",
              }}
              data-testid="drop-zone"
              data-active={dragActive || undefined}
            >
              <span style={{ fontSize: 26 }} aria-hidden="true">
                ⇪
              </span>
              <div style={styles.dropText}>Drop a character card here</div>
              <div style={styles.dropHint}>PNG with embedded data, or a .json card</div>
              <Button variant="secondary" onClick={() => fileInputRef.current?.click()} data-testid="choose-file">
                Choose a file
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.json,image/png,application/json"
                onChange={onFileChange}
                style={{ display: "none" }}
                data-testid="file-input"
                aria-label="Character card file"
              />
            </div>
          </section>

          {/* ── URL ── */}
          <section style={styles.panel} aria-label="Import from URL">
            <div style={styles.panelLabel}>FROM A URL</div>
            <div style={styles.urlRow}>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void importFromUrl();
                  }
                }}
                placeholder="https://example.com/character.json"
                aria-label="Character card URL"
                style={styles.urlInput}
                data-testid="url-input"
              />
              <Button
                variant="primary"
                onClick={() => void importFromUrl()}
                disabled={!url.trim() || phase === "validating"}
                data-testid="import-url"
              >
                Import
              </Button>
            </div>
          </section>

          {/* ── Status: validating / error ── */}
          {phase === "validating" ? (
            <div style={styles.statusRow} data-testid="import-validating" role="status">
              <span
                aria-hidden="true"
                className={reduced ? undefined : "mt-sweep"}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  border: "2px solid var(--hairline)",
                  borderTopColor: "var(--brass)",
                  ...(reduced ? {} : { animationDuration: "0.8s" }),
                }}
              />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--brass)" }}>
                Reading the {source === "url" ? "URL" : "card"}…
              </span>
            </div>
          ) : null}

          {phase === "error" ? (
            <div data-testid="import-error">
              <InlineNotice
                severity="error"
                title={
                  errorKind === "model-output"
                    ? "That file isn't a character card we recognize"
                    : source === "url"
                      ? "Couldn't reach that URL"
                      : "Couldn't read that card"
                }
                detail={
                  errorKind === "model-output"
                    ? "Import expects a Character Card V2 or V3 (a PNG with embedded card data, or a JSON card). Double-check the file and try again."
                    : source === "url"
                      ? "The card couldn't be fetched — the link may be down, blocked, or not a card. Check the URL and try again."
                      : "The card couldn't be read. It may be corrupt or an unsupported format."
                }
              />
              <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
                {errorMessage}
              </div>
              <div style={{ marginTop: 12 }}>
                <Button variant="system" onClick={reset} data-testid="import-retry">
                  Try another card
                </Button>
              </div>
            </div>
          ) : null}

          {phase === "idle" ? (
            <div style={styles.idleHint}>
              <EmptyState
                glyph="✦"
                title="Import a character"
                body="Choose a file or paste a URL above. We’ll show you the mapped card before anything is saved."
              />
            </div>
          ) : null}
        </div>

        {/* ── Live preview of the mapped card ── */}
        {phase === "preview" && mapped ? (
          <aside style={{ ...styles.previewColumn, ...fadeIn }} data-testid="card-preview">
            <div style={styles.panelLabel}>MAPPED CARD</div>
            <div style={styles.previewCard}>
              <span aria-hidden="true" style={styles.previewAccent} />
              <div style={styles.previewTop}>
                <span aria-hidden="true" style={styles.previewAvatar}>
                  {initialsFor(displayName)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.previewName}>{displayName}</div>
                  <div style={styles.previewTagline}>{tagline}</div>
                </div>
              </div>
              <div style={styles.previewBlurb}>{blurb}</div>

              {traits.length > 0 ? (
                <div style={{ marginTop: 14 }}>
                  <div style={styles.previewSectionLabel}>TRAITS</div>
                  <div style={styles.chipWrap}>
                    {traits.slice(0, 8).map((t, i) => (
                      <Chip key={i} tone="keyword">
                        {t}
                      </Chip>
                    ))}
                  </div>
                </div>
              ) : null}

              {mapped.lorebook.length > 0 ? (
                <div style={{ marginTop: 14 }}>
                  <div style={styles.previewSectionLabel}>LOREBOOK · {mapped.lorebook.length} ENTRIES</div>
                  <div style={styles.chipWrap}>
                    {mapped.lorebook.slice(0, 6).flatMap((seed, si) =>
                      seed.keys.slice(0, 2).map((k, ki) => (
                        <Chip key={`${si}-${ki}`} tone="keyword">
                          {k}
                        </Chip>
                      ))
                    )}
                  </div>
                </div>
              ) : null}

              {mapped.openings.length > 0 ? (
                <div style={{ marginTop: 14 }}>
                  <div style={styles.previewSectionLabel}>OPENINGS · {mapped.openings.length}</div>
                </div>
              ) : null}
            </div>

            <div style={styles.provenance} data-testid="card-provenance">
              Card format {result?.spec ?? "V2/V3"}
            </div>

            {/* Importer warnings surface here: nothing usable mapped from the card. */}
            {mapped.openings.length === 0 && mapped.lorebook.length === 0 ? (
              <div style={{ marginTop: 12 }} data-testid="import-warnings">
                <InlineNotice
                  severity="warn"
                  title="Sparse card"
                  detail="This card had no opening scenes or lorebook entries — the storyteller will build more of the world itself."
                />
              </div>
            ) : null}

            <div style={styles.previewActions}>
              <Button variant="ghost" onClick={reset}>
                Discard
              </Button>
              <Button variant="primary" data-testid="use-card">
                Use this card
              </Button>
            </div>
            <div style={styles.previewFootnote}>
              This is how the card maps in. Confirming seeds a new story — the world fills in HP,
              stamina, and gear from its own rules.
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  screen: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0, fontFamily: "var(--font-ui)" },
  subHeader: {
    padding: "20px 40px 16px",
    borderBottom: "1px solid var(--hairline)",
  },
  subtitle: { margin: 0, fontSize: 13, color: "var(--secondary)", maxWidth: "70ch", lineHeight: 1.5 },
  body: {
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    display: "grid",
    gap: 24,
    alignItems: "start",
    padding: "28px 40px 60px",
  },
  importColumn: { display: "flex", flexDirection: "column", gap: 20, maxWidth: 620 },
  panel: {
    background: "var(--bg1-panel)",
    border: "1px solid var(--hairline)",
    borderRadius: 12,
    padding: 18,
  },
  panelLabel: {
    fontSize: 11,
    fontFamily: "var(--font-mono)",
    letterSpacing: "0.14em",
    color: "var(--teal)",
    marginBottom: 14,
  },
  dropZone: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 10,
    border: "1px dashed var(--hairline)",
    borderRadius: 10,
    padding: "28px 20px",
    color: "var(--secondary)",
    transition: "border-color var(--motion-fast) ease, background var(--motion-fast) ease",
  },
  dropText: { fontSize: 14, color: "var(--ui-text)" },
  dropHint: { fontSize: 12, color: "var(--muted)", marginBottom: 4 },
  urlRow: { display: "flex", gap: 9, alignItems: "center" },
  urlInput: {
    flex: 1,
    minWidth: 0,
    background: "var(--bg0-ground)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius-chip)",
    padding: "10px 12px",
    color: "var(--ui-text)",
    fontFamily: "var(--font-mono)",
    fontSize: 13,
    outline: "none",
  },
  statusRow: { display: "flex", alignItems: "center", gap: 10 },
  idleHint: { paddingTop: 8 },
  previewColumn: { display: "flex", flexDirection: "column", gap: 4 },
  previewCard: {
    position: "relative",
    background: "var(--bg2-card)",
    border: "1px solid color-mix(in srgb, var(--brass) 18%, transparent)",
    borderRadius: 12,
    padding: 18,
    overflow: "hidden",
  },
  previewAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    background: "linear-gradient(90deg, var(--brass), transparent)",
  },
  previewTop: { display: "flex", gap: 13, alignItems: "center" },
  previewAvatar: {
    width: 52,
    height: 52,
    flex: "0 0 52px",
    borderRadius: 12,
    background: "var(--bg3-raised)",
    border: "1px solid color-mix(in srgb, var(--brass) 40%, transparent)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    fontSize: 22,
    color: "var(--brass)",
  },
  previewName: {
    fontFamily: "var(--font-display)",
    fontWeight: 600,
    fontSize: 23,
    color: "var(--prose)",
    lineHeight: 1.1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  previewTagline: { fontSize: 12, color: "var(--secondary)" },
  previewBlurb: {
    fontFamily: "var(--font-prose)",
    fontSize: 14,
    color: "var(--ui-text)",
    lineHeight: 1.6,
    marginTop: 14,
  },
  previewSectionLabel: {
    fontSize: 10,
    fontFamily: "var(--font-mono)",
    letterSpacing: "0.1em",
    color: "var(--muted)",
    marginBottom: 7,
  },
  chipWrap: { display: "flex", flexWrap: "wrap", gap: 6 },
  provenance: {
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    color: "var(--teal)",
    marginTop: 10,
  },
  previewActions: { display: "flex", justifyContent: "flex-end", gap: 9, marginTop: 16 },
  previewFootnote: {
    fontSize: 11,
    color: "var(--muted)",
    lineHeight: 1.6,
    marginTop: 12,
    textAlign: "center",
  },
};

export default CardCreator;
