/**
 * App shell — ported from the prototype's rail + contextual header (Design/handoff §01, and the
 * chrome shared by every screens/*.dc.html). Three regions:
 *   • a fixed 72px left rail: brass "M" wordmark, five nav items (icon + 9px label), and a bottom
 *     cluster with the model-status chip + trial chip;
 *   • a contextual header: story title (display serif) + `CH n · NAME` (mono/teal) + message count
 *     (mono), and — when a story is open — the Play·Overview·Characters·Story Settings sub-tabs;
 *   • a <main> that renders the active screen from the registry inside <Suspense>.
 *
 * All colors/metrics come from tokens.css variables — never raw hex. Motion respects reduced-motion
 * via the store. Two registers held apart: names/titles use display serif + brass; the CH label,
 * counts, and rail meta use mono + teal/muted.
 */
import { Suspense, useEffect, type CSSProperties } from "react";
import {
  useRoute,
  bindHashHistory,
  STORY_ROUTES,
  type Route,
  type RouteParams,
} from "./router.js";
import { registry } from "../screens/registry.js";
import { useStoriesStore } from "../state/storiesStore.js";
import { useSettingsStore } from "../state/settingsStore.js";
import { useUiStore, bindReducedMotion } from "../state/uiStore.js";
import { getBridge } from "../bridge/core.js";

// ── Rail nav model ──────────────────────────────────────────────────────────────────────────
// "Story" is active for any of the four story surfaces; clicking it lands on the story default (Play).
interface NavItem {
  label: string;
  glyph: string;
  route: Route;
  /** Routes that light this item as active. */
  activeOn: readonly Route[];
}

const NAV: NavItem[] = [
  { label: "Library", glyph: "❏", route: "library", activeOn: ["library", "wizard"] },
  { label: "Story", glyph: "✎", route: "play", activeOn: STORY_ROUTES },
  { label: "Personas", glyph: "☙", route: "personas", activeOn: ["personas", "cardcreator"] },
  { label: "Lore", glyph: "❦", route: "lorebook", activeOn: ["lorebook"] },
  { label: "Settings", glyph: "⚙", route: "settings", activeOn: ["settings", "designsystem"] },
];

/** The story sub-tabs (only shown when a story is open). */
const SUB_TABS: { label: string; route: Route }[] = [
  { label: "Play", route: "play" },
  { label: "Overview", route: "overview" },
  { label: "Characters", route: "characters" },
  { label: "Story Settings", route: "storysettings" },
];

export function App() {
  const { route, params, navigate } = useRoute();
  const current = useStoriesStore((s) => s.current);
  const openStory = useStoriesStore((s) => s.openStory);
  const refresh = useStoriesStore((s) => s.refresh);
  const loadSettings = useSettingsStore((s) => s.load);
  const roleMap = useSettingsStore((s) => s.roleMap);
  const trial = useSettingsStore((s) => s.trial);
  const license = useSettingsStore((s) => s.license);

  // One-time app wiring: browser history ↔ router, reduced-motion, and initial data loads.
  useEffect(() => {
    const unbindHash = bindHashHistory();
    const unbindMotion = bindReducedMotion();
    void getBridge(); // ensure the (in-memory) bridge singleton exists before stores call it
    void refresh();
    void loadSettings();
    return () => {
      unbindHash();
      unbindMotion();
    };
  }, [refresh, loadSettings]);

  // Keep the open-story record in sync with the route's storyId (deeplinks, tab switches).
  useEffect(() => {
    if (STORY_ROUTES.includes(route) && params.storyId && current?.id !== params.storyId) {
      void openStory(params.storyId);
    }
  }, [route, params.storyId, current?.id, openStory]);

  const Screen = registry[route];
  const storyOpen = STORY_ROUTES.includes(route) && !!current;

  return (
    <div style={styles.app}>
      <Rail route={route} navigate={navigate} storyId={params.storyId} roleModel={roleMap?.narrator.model} trialDays={trial?.daysRemaining} licensed={license.status === "valid"} />
      <div style={styles.mainColumn}>
        <Header route={route} params={params} navigate={navigate} storyOpen={storyOpen} />
        <main style={styles.main}>
          <Suspense fallback={<ScreenFallback />}>
            <Screen storyId={params.storyId} />
          </Suspense>
        </main>
      </div>
      <ToastLayer />
    </div>
  );
}

// ── Left rail ─────────────────────────────────────────────────────────────────────────────────

function Rail(props: {
  route: Route;
  storyId?: string;
  navigate: (r: Route, p?: RouteParams) => void;
  roleModel?: string;
  trialDays?: number;
  licensed: boolean;
}) {
  const { route, navigate, storyId, roleModel, trialDays, licensed } = props;
  return (
    <nav style={styles.rail} aria-label="Primary">
      <div style={styles.wordmark} title="Midnight Tavern">
        M
      </div>
      {NAV.map((item) => {
        const active = item.activeOn.includes(route);
        // "Story" preserves the open storyId so the tab returns to the right story.
        const targetParams: RouteParams = item.route === "play" && storyId ? { storyId } : {};
        return (
          <button
            key={item.label}
            type="button"
            title={item.label}
            onClick={() => navigate(item.route, targetParams)}
            aria-current={active ? "page" : undefined}
            style={{ ...styles.navItem, ...(active ? styles.navItemActive : null) }}
          >
            <span style={{ ...styles.navGlyph, color: active ? "var(--brass)" : "var(--muted)" }}>
              {item.glyph}
            </span>
            <span style={styles.navLabel}>{item.label}</span>
          </button>
        );
      })}
      <div style={{ flex: 1 }} />
      <div style={styles.railFooter}>
        <div style={styles.modelChip} title={roleModel ? `Narrator model: ${roleModel}` : "No model configured"}>
          <span style={{ ...styles.modelDot, background: roleModel ? "var(--success)" : "var(--muted)" }} />
          <span style={styles.railMeta}>{shortModel(roleModel)}</span>
        </div>
        <div
          style={styles.trialChip}
          title={licensed ? "Licensed" : trialDays !== undefined ? `Trial · ${trialDays} days left` : "Trial"}
        >
          {licensed ? "Full" : `Trial\n${trialDays ?? "–"}d`}
        </div>
      </div>
    </nav>
  );
}

/** Trim a provider/model slug to a short rail label ("anthropic/claude-sonnet-4" → "claude-…"). */
function shortModel(model?: string): string {
  if (!model) return "—";
  const tail = model.includes("/") ? model.split("/")[1]! : model;
  return tail.length > 8 ? `${tail.slice(0, 7)}…` : tail;
}

// ── Contextual header ───────────────────────────────────────────────────────────────────────

function Header(props: {
  route: Route;
  params: RouteParams;
  navigate: (r: Route, p?: RouteParams) => void;
  storyOpen: boolean;
}) {
  const { route, params, navigate, storyOpen } = props;
  const current = useStoriesStore((s) => s.current);
  const messageCount = usePlayMessageCount();

  const title = storyOpen ? current!.title : screenTitle(route);
  const chapterLabel = storyOpen ? chapterLabelFor(messageCount) : undefined;

  return (
    <header style={styles.header}>
      <div style={styles.headerRow}>
        <span className="display" style={styles.storyTitle}>
          {title}
        </span>
        {chapterLabel && (
          <span className="mono" style={styles.chapterLabel}>
            {chapterLabel}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {storyOpen && (
          <span className="mono" style={styles.messageCount}>
            {messageCount} messages
          </span>
        )}
      </div>
      {storyOpen && (
        <div style={styles.subTabs} role="tablist">
          {SUB_TABS.map((tab) => {
            const active = route === tab.route;
            return (
              <button
                key={tab.route}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => navigate(tab.route, params.storyId ? { storyId: params.storyId } : {})}
                style={{ ...styles.subTab, ...(active ? styles.subTabActive : null) }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
}

/** Read the current transcript length off the play store without a hard import cycle. */
function usePlayMessageCount(): number {
  // Lazy require keeps App decoupled from playStore's shape churn; the store is a plain module.
  const { usePlayStore } = requirePlayStore();
  return usePlayStore((s) => s.messages.length);
}

// Small indirection so the store import stays a value import (tree-shaken) without a cycle risk.
import { usePlayStore } from "../state/playStore.js";
function requirePlayStore() {
  return { usePlayStore };
}

/** Fallback chapter label until real chapter data threads through (roughly ~20 msgs/chapter). */
function chapterLabelFor(messageCount: number): string {
  const chapter = Math.max(1, Math.floor(messageCount / 20) + 1);
  return `CH ${chapter}`;
}

/** Human title for a non-story screen (header when no story is open). */
function screenTitle(route: Route): string {
  const map: Record<Route, string> = {
    library: "Library",
    play: "Play",
    overview: "Overview",
    characters: "Characters",
    storysettings: "Story Settings",
    settings: "Settings",
    personas: "Personas",
    cardcreator: "Card Creator",
    lorebook: "Lorebook",
    wizard: "Setup",
    designsystem: "Design System",
  };
  return map[route];
}

// ── Suspense fallback + toasts ──────────────────────────────────────────────────────────────

function ScreenFallback() {
  return (
    <div style={styles.fallback} aria-busy="true">
      <span className="mono" style={styles.fallbackText}>
        Loading…
      </span>
    </div>
  );
}

function ToastLayer() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  if (toasts.length === 0) return null;
  return (
    <div style={styles.toastLayer} role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} style={{ ...styles.toast, ...toastAccent(t.kind) }}>
          <div style={styles.toastTitle}>{t.title}</div>
          {t.body && <div style={styles.toastBody}>{t.body}</div>}
          <button type="button" style={styles.toastClose} onClick={() => dismiss(t.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function toastAccent(kind: "info" | "warn" | "error"): CSSProperties {
  const color = kind === "error" ? "var(--failure)" : kind === "warn" ? "var(--crit-gold)" : "var(--teal)";
  return { borderLeft: `3px solid ${color}` };
}

// ── Styles (token variables only) ──────────────────────────────────────────────────────────

const styles: Record<string, CSSProperties> = {
  app: {
    display: "flex",
    height: "100%",
    background: "var(--bg0-ground)",
    color: "var(--prose)",
  },
  rail: {
    width: "var(--rail-width)",
    flex: "0 0 var(--rail-width)",
    background: "var(--bg1-panel)",
    borderRight: "1px solid var(--hairline)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "14px 0",
    gap: 4,
  },
  wordmark: {
    width: 40,
    height: 40,
    borderRadius: 9,
    background: "linear-gradient(145deg, var(--bg3-raised), var(--bg1-panel))",
    border: "1px solid var(--hairline-soft)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    fontSize: 24,
    color: "var(--brass)",
    marginBottom: 14,
  },
  navItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 3,
    width: 56,
    padding: "8px 0",
    borderRadius: 8,
    background: "transparent",
    border: "1px solid transparent",
    color: "var(--muted)",
    cursor: "pointer",
    fontFamily: "var(--font-ui)",
  },
  navItemActive: {
    background: "var(--bg3-raised)",
    border: "1px solid var(--hairline-soft)",
    color: "var(--prose)",
  },
  navGlyph: { fontSize: 18, lineHeight: 1 },
  navLabel: { fontSize: 9, letterSpacing: "0.02em" },
  railFooter: {
    width: 52,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 9,
    paddingTop: 8,
    borderTop: "1px solid var(--hairline)",
  },
  modelChip: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4 },
  modelDot: { width: 9, height: 9, borderRadius: "50%" },
  railMeta: {
    fontSize: 8,
    color: "var(--muted)",
    textAlign: "center",
    lineHeight: 1.2,
    fontFamily: "var(--font-mono)",
  },
  trialChip: {
    fontSize: 8,
    color: "var(--muted)",
    textAlign: "center",
    border: "1px solid var(--hairline)",
    borderRadius: 5,
    padding: "3px 4px",
    lineHeight: 1.15,
    whiteSpace: "pre-line",
    fontFamily: "var(--font-mono)",
  },
  mainColumn: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  header: {
    flex: "0 0 auto",
    background: "var(--bg1-panel)",
    borderBottom: "1px solid var(--hairline)",
    padding: "12px 22px 0 22px",
  },
  headerRow: { display: "flex", alignItems: "baseline", gap: 12 },
  storyTitle: { fontSize: 22, fontWeight: 600, color: "var(--prose)", letterSpacing: "0.01em" },
  chapterLabel: { fontSize: 11, color: "var(--teal)", letterSpacing: "0.04em" },
  messageCount: { fontSize: 11, color: "var(--muted)" },
  subTabs: { display: "flex", gap: 2, marginTop: 12 },
  subTab: {
    padding: "9px 15px",
    fontSize: 13,
    color: "var(--secondary)",
    background: "transparent",
    border: "none",
    borderBottom: "2px solid transparent",
    cursor: "pointer",
    fontFamily: "var(--font-ui)",
  },
  subTabActive: { color: "var(--prose)", fontWeight: 600, borderBottom: "2px solid var(--brass)" },
  main: { flex: 1, minHeight: 0, overflow: "auto" },
  fallback: { display: "flex", alignItems: "center", justifyContent: "center", height: "100%" },
  fallbackText: { color: "var(--muted)", fontSize: 12, letterSpacing: "0.08em" },
  toastLayer: {
    position: "fixed",
    right: 20,
    bottom: 20,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    zIndex: 50,
    maxWidth: 360,
  },
  toast: {
    position: "relative",
    background: "var(--bg2-card)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius-chip)",
    padding: "12px 32px 12px 14px",
    boxShadow: "var(--elevation)",
  },
  toastTitle: { fontFamily: "var(--font-ui)", fontWeight: 600, fontSize: 13, color: "var(--ui-text)" },
  toastBody: { fontSize: 12.5, color: "var(--secondary)", lineHeight: 1.5, marginTop: 4 },
  toastClose: {
    position: "absolute",
    top: 6,
    right: 8,
    background: "transparent",
    border: "none",
    color: "var(--muted)",
    fontSize: 16,
    cursor: "pointer",
    lineHeight: 1,
  },
};
