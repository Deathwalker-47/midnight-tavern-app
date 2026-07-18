/**
 * Library — the story shelf. A StoryCard grid (colored spines), a "New story" entry into the
 * Wizard (the premise → forge → enter flow), and per-story rename / delete. Ported from
 * Design/handoff/screens/Library.dc.html (the "Demo" chip row and the inline premise/forge
 * overlays are dropped — creation now lives in the Wizard screen).
 *
 * State matrix (§02): loading (skeleton cards) · empty (invite the first story) · error (library
 * folder unreadable) · shelf · trial-expired (upsell banner over a dimmed shelf). Overflow is
 * handled by StoryCard's own clamping; the auto-fill grid reflows for the narrow (~900px) layout;
 * skeleton motion collapses under reduced-motion.
 *
 * Wiring: `useStoriesStore` for the shelf + create/rename/remove, `useSettingsStore().entitlement`
 * for the creation gate. Talks to core only through the stores. Token variables only.
 */
import { useState } from "react";
import type { CSSProperties } from "react";
import { useStoriesStore } from "../state/storiesStore";
import { useSettingsStore } from "../state/settingsStore";
import { useUiStore, useRoute } from "../state/uiStore";
import { Button, StoryCard, EmptyState, InlineNotice, ConfirmDialog } from "../components";
import type { ScreenProps } from "./registry";

/** Deterministic spine color per story id (two registers stay apart — spines are decorative). */
const SPINES = ["var(--brass)", "var(--teal)", "var(--dead)", "var(--brass-bright)", "var(--success)"];
function spineFor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SPINES[h % SPINES.length]!;
}

/** Rough chapter count for the mono meta line until real chapter data threads through (~20/ch). */
function metaFor(messageCount: number): string {
  if (messageCount <= 0) return "New — no turns yet";
  const chapters = Math.max(1, Math.floor(messageCount / 20) + 1);
  return `${chapters} ch · ${messageCount} msgs`;
}

export function Library(_props: ScreenProps): JSX.Element {
  const stories = useStoriesStore((s) => s.stories);
  const status = useStoriesStore((s) => s.status);
  const error = useStoriesStore((s) => s.error);
  const refresh = useStoriesStore((s) => s.refresh);
  const openStory = useStoriesStore((s) => s.openStory);
  const rename = useStoriesStore((s) => s.rename);
  const remove = useStoriesStore((s) => s.remove);

  const entitlement = useSettingsStore((s) => s.entitlement);
  const pushToast = useUiStore((s) => s.pushToast);
  const { navigate } = useRoute();

  const [deleteId, setDeleteId] = useState<string | undefined>(undefined);
  const [renameId, setRenameId] = useState<string | undefined>(undefined);
  const [renameText, setRenameText] = useState("");

  // Default to allowing creation while entitlement is still loading; only an expired trial gates.
  const canCreate = entitlement ? entitlement.canCreateStory : true;
  const loading = status === "idle" || status === "loading";

  const startNewStory = (): void => {
    if (!canCreate) {
      pushToast({ kind: "warn", title: "Your trial has ended", body: "Enter a license to forge new stories." });
      return;
    }
    navigate("wizard");
  };

  const importCard = (): void => {
    // The in-memory stub can't read cards; the real importer arrives with the desktop sidecar.
    pushToast({
      kind: "info",
      title: "Character card import",
      body: "Card import runs through the local desktop build — .png or .json, Chara Card V2 / V3.",
    });
  };

  const openRename = (id: string, title: string): void => {
    setRenameId(id);
    setRenameText(title);
  };
  const commitRename = async (): Promise<void> => {
    const id = renameId;
    const title = renameText.trim();
    setRenameId(undefined);
    if (id && title) await rename(id, title);
  };
  const confirmDelete = async (): Promise<void> => {
    const id = deleteId;
    setDeleteId(undefined);
    if (id) await remove(id);
  };

  const deleting = stories.find((s) => s.id === deleteId);

  return (
    <div style={styles.screen}>
      {/* Screen toolbar — subtitle + primary actions (the shell renders the "Library" title). */}
      <div style={styles.toolbar}>
        <div style={styles.subtitle}>Every tale is kept on this machine. Nothing leaves without you.</div>
        <div style={styles.actions}>
          <Button variant="ghost" onClick={importCard}>
            ⇪ Import card
          </Button>
          <Button variant="primary" onClick={startNewStory} disabled={!canCreate} title={canCreate ? undefined : "Trial ended — a license is needed"}>
            ＋ New story
          </Button>
        </div>
      </div>

      {/* Trial-expired upsell banner (over a dimmed shelf below). */}
      {!canCreate ? (
        <div style={styles.trialBanner} data-testid="library-trial-banner">
          <span style={styles.trialGlyph} aria-hidden="true">
            ◷
          </span>
          <div>
            <div style={styles.trialTitle}>Your 14-day trial has ended</div>
            <div style={styles.trialBody}>
              Reading every story on your shelf stays open forever. Playing on — new turns and new stories — needs a license.
            </div>
            <div style={styles.trialActions}>
              <Button variant="primary" onClick={() => navigate("settings")}>
                Enter a license key
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Content by shelf status ─────────────────────────────────────────── */}
      {loading ? (
        <SkeletonShelf />
      ) : status === "error" ? (
        <div style={styles.centered} data-testid="library-error">
          <div style={styles.errorGlyph} aria-hidden="true">
            ⚡
          </div>
          <div style={styles.centeredTitle}>Couldn&rsquo;t read the library folder</div>
          <div style={styles.centeredBody}>
            Your stories live at <span className="mono" style={styles.path}>~/MidnightTavern/stories</span>. The folder
            didn&rsquo;t respond — it may be on a drive that&rsquo;s disconnected.
            {error ? <div style={styles.errorDetail}>{error}</div> : null}
          </div>
          <div style={{ marginTop: 18 }}>
            <Button variant="secondary" onClick={() => void refresh()}>
              Try again
            </Button>
          </div>
        </div>
      ) : stories.length === 0 ? (
        <EmptyState
          glyph="❏"
          title="The shelf is empty"
          body="Write a premise and the storyteller will forge a world with rules of its own — skills, hazards, and a rulebook that holds you to your word."
          action={
            <div style={styles.emptyActions}>
              <Button variant="primary" onClick={startNewStory} disabled={!canCreate}>
                Begin your first story
              </Button>
              <Button variant="ghost" onClick={importCard}>
                Import a character card
              </Button>
            </div>
          }
        />
      ) : (
        <div style={{ opacity: canCreate ? 1 : 0.9 }}>
          <div className="mono" style={styles.sectionLabel}>
            CONTINUE
          </div>
          <div style={styles.grid}>
            {stories.map((s) => (
              <div key={s.id} style={styles.cardWrap}>
                <StoryCard
                  title={s.title}
                  spineColor={spineFor(s.id)}
                  meta={metaFor(s.messageCount)}
                  onOpen={() => {
                    void openStory(s.id);
                    navigate("play", { storyId: s.id });
                  }}
                  style={{ height: "100%" }}
                />
                <div style={styles.cardActions} onClick={(e) => e.stopPropagation()}>
                  <button type="button" style={styles.iconBtn} title="Rename" aria-label={`Rename ${s.title}`} onClick={() => openRename(s.id, s.title)}>
                    ✎
                  </button>
                  <button type="button" style={styles.iconBtn} title="Delete" aria-label={`Delete ${s.title}`} onClick={() => setDeleteId(s.id)}>
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delete confirmation. */}
      <ConfirmDialog
        open={Boolean(deleteId)}
        tone="danger"
        title="Delete this story?"
        body={
          deleting
            ? `“${deleting.title}” and its transcript will be removed for good. This can’t be undone.`
            : undefined
        }
        confirmLabel="Delete story"
        cancelLabel="Keep it"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteId(undefined)}
      />

      {/* Rename modal (a small inline dialog — ConfirmDialog carries no text field). */}
      {renameId ? (
        <div style={styles.scrim} onClick={() => setRenameId(undefined)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Rename story"
            style={styles.renameDialog}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={styles.renameTitle}>Rename story</div>
            <input
              autoFocus
              value={renameText}
              onChange={(e) => setRenameText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void commitRename();
                if (e.key === "Escape") setRenameId(undefined);
              }}
              aria-label="Story title"
              style={styles.renameInput}
            />
            <div style={styles.renameActions}>
              <Button variant="ghost" onClick={() => setRenameId(undefined)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void commitRename()} disabled={!renameText.trim()}>
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Loading placeholder: skeleton cards with a soft opacity pulse (collapses under reduced-motion). */
function SkeletonShelf(): JSX.Element {
  const reduced = useUiStore((s) => s.reducedMotion);
  return (
    <div style={styles.grid} aria-busy="true" data-testid="library-loading">
      {[0, 1, 2].map((k) => (
        <div key={k} className={reduced ? undefined : "mt-pulse"} style={styles.skeleton}>
          <div style={{ ...styles.skelBar, width: "65%", height: 22 }} />
          <div style={{ ...styles.skelBar, width: "90%", marginTop: 14 }} />
          <div style={{ ...styles.skelBar, width: "70%", marginTop: 8 }} />
          <div style={{ ...styles.skelBar, width: "40%", marginTop: 22 }} />
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  screen: { padding: "28px 40px 48px", minHeight: "100%" },
  toolbar: { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 24 },
  subtitle: { fontSize: 13, color: "var(--secondary)" },
  actions: { display: "flex", gap: 9 },
  sectionLabel: { fontSize: 11, letterSpacing: "0.14em", color: "var(--teal)", marginBottom: 14 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 18 },
  cardWrap: { position: "relative" },
  cardActions: { position: "absolute", top: 10, right: 10, display: "flex", gap: 6 },
  iconBtn: {
    background: "var(--bg3-raised)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius-chip)",
    color: "var(--secondary)",
    cursor: "pointer",
    fontSize: 12,
    padding: "4px 7px",
    lineHeight: 1,
  },
  emptyActions: { display: "flex", gap: 10, justifyContent: "center" },
  centered: { maxWidth: 520, margin: "8vh auto 0", textAlign: "center" },
  centeredTitle: { fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 24, color: "var(--prose)", marginTop: 4 },
  centeredBody: { fontSize: 13.5, color: "var(--secondary)", lineHeight: 1.6, marginTop: 8 },
  errorGlyph: { fontSize: 40, color: "var(--failure)" },
  errorDetail: { fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", marginTop: 10 },
  path: { color: "var(--teal)" },
  trialBanner: {
    display: "flex",
    gap: 14,
    alignItems: "flex-start",
    maxWidth: 560,
    margin: "0 auto 22px",
    background: "color-mix(in srgb, var(--brass) 6%, transparent)",
    border: "1px solid color-mix(in srgb, var(--brass) 30%, transparent)",
    borderRadius: "var(--radius-card)",
    padding: "20px 22px",
  },
  trialGlyph: { fontSize: 22, color: "var(--brass)" },
  trialTitle: { fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 20, color: "var(--prose)" },
  trialBody: { fontSize: 13.5, color: "var(--secondary)", lineHeight: 1.6, marginTop: 5 },
  trialActions: { display: "flex", gap: 10, marginTop: 14 },
  skeleton: {
    background: "var(--bg1-panel)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius-card)",
    height: 150,
    padding: 20,
  },
  skelBar: { height: 12, background: "var(--bg2-card)", borderRadius: 4 },
  scrim: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  renameDialog: {
    background: "var(--bg2-card)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--elevation)",
    padding: "20px 22px",
    width: "90%",
    maxWidth: 420,
  },
  renameTitle: { fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 20, color: "var(--prose)", marginBottom: 12 },
  renameInput: {
    width: "100%",
    fontFamily: "var(--font-display)",
    fontSize: 18,
    color: "var(--prose)",
    background: "var(--bg0-ground)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius-chip)",
    padding: "10px 12px",
    outline: "none",
  },
  renameActions: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 },
};

export default Library;
