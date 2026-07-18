/**
 * StorySettings — per-story settings: rename, story-scoped model overrides (baseline from the
 * global role map), the read-only rulebook (frozen story schema), and a danger-zone delete.
 * Ported from Design/handoff/screens/StorySettings.dc.html (the "Demo" chip row is dropped).
 *
 * As a story sub-tab it receives `props.storyId`; with none it renders a "no story open" empty
 * state. State matrix (§02): no-story · loading · error · default (rulebook, regeneration locked).
 * The locked banner IS the post-play state; the rulebook is read-only once frozen. The screen
 * scrolls; §-section nav collapses in the narrow (~900px) layout via wrapping.
 *
 * BRIDGE / STORE NOTE: there is no per-story role-override persistence in the CoreBridge yet — the
 * SCREEN_CONTRACT's `setRoleMap` is GLOBAL. The story-scoped model picker below is therefore
 * LOCAL-ONLY state seeded from `useSettingsStore().roleMap`; it surfaces the intended control and
 * is wired to the global role map as the baseline. When a `bridge.setStoryRoleOverride(storyId,…)`
 * method exists, point the picker's onChange at it. Rename → `useStoriesStore.rename`; delete →
 * `useStoriesStore.remove`.
 */
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useStoriesStore } from "../state/storiesStore";
import { useSettingsStore } from "../state/settingsStore";
import { useRoute } from "../state/uiStore";
import { Button, EmptyState, InlineNotice, ConfirmDialog, RoleMatrixRow } from "../components";
import type { RoleModelOption } from "../components";
import type { ScreenProps } from "./registry";

export function StorySettings(props: ScreenProps): JSX.Element {
  const storyId = props.storyId;
  const current = useStoriesStore((s) => s.current);
  const currentStatus = useStoriesStore((s) => s.currentStatus);
  const openStory = useStoriesStore((s) => s.openStory);
  const rename = useStoriesStore((s) => s.rename);
  const remove = useStoriesStore((s) => s.remove);

  const roleMap = useSettingsStore((s) => s.roleMap);
  const knownModels = useSettingsStore((s) => s.knownModels);
  const { navigate } = useRoute();

  const loaded = current?.id === storyId && currentStatus === "ready";

  const [title, setTitle] = useState<string | undefined>(undefined);
  const [narratorModel, setNarratorModel] = useState<string | undefined>(undefined);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Sync the local title once the story record loads (deeplink / tab-switch).
  const effectiveTitle = title ?? current?.title ?? "";
  const effectiveNarrator = narratorModel ?? roleMap?.narrator.model ?? "";

  // ── No story open ────────────────────────────────────────────────────────
  if (!storyId) {
    return (
      <div style={styles.screen}>
        <EmptyState
          glyph="⚙"
          title="No story open"
          body="Open a story from the shelf to adjust its rulebook and settings."
        />
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────
  if (currentStatus === "error") {
    return (
      <div style={styles.screen}>
        <div style={styles.centered} data-testid="storysettings-error">
          <InlineNotice
            severity="error"
            title="Couldn’t open this story’s settings"
            detail="The story record didn’t load. It may be on a disconnected drive."
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

  // ── Loading ────────────────────────────────────────────────────────────
  if (!loaded || !current || current.id !== storyId) {
    // Kick off the load if the store hasn't got this story yet.
    if (current?.id !== storyId && currentStatus !== "loading") void openStory(storyId);
    return (
      <div style={styles.screen}>
        <div style={styles.centered} aria-busy="true" data-testid="storysettings-loading">
          <span className="mono" style={styles.loadingText}>
            Loading story settings…
          </span>
        </div>
      </div>
    );
  }

  const story = current;
  const schema = story.schema;
  const messageCount = 0; // transcript length isn't on the record; the locked banner keys off `locked`.
  const modelOptions: RoleModelOption[] = knownModels.map((m) => ({ value: m.model, label: m.label }));
  const narratorFit = knownModels.find((m) => m.model === effectiveNarrator)?.tier ?? "advanced";

  const commitRename = async (): Promise<void> => {
    const next = effectiveTitle.trim();
    if (next && next !== current.title) await rename(storyId, next);
  };
  const confirmDelete = async (): Promise<void> => {
    setConfirmingDelete(false);
    await remove(storyId);
    navigate("library");
  };

  return (
    <div style={styles.screen}>
      <div style={styles.body}>
        {/* Locked banner — the rulebook is sealed once a story is frozen (§ post-play state). */}
        {current.locked ? (
          <div style={styles.lockedBanner} data-testid="storysettings-locked">
            <span style={styles.lockGlyph} aria-hidden="true">
              🔒
            </span>
            <div style={{ flex: 1 }}>
              <div style={styles.lockedTitle}>The rulebook is sealed</div>
              <div style={styles.lockedBody}>
                Regenerating would orphan learned skills and inventory, so it&rsquo;s locked for this story. You can
                still rename the story and change its model below.
              </div>
            </div>
            <Button variant="disabled" disabled title="Locked once a story is forged">
              ↻ Regenerate (locked)
            </Button>
          </div>
        ) : null}

        {/* TITLE / RENAME */}
        <Section kicker="§ STORY" heading="Title">
          <div style={styles.renameRow}>
            <input
              value={effectiveTitle}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Story title"
              style={styles.titleInput}
            />
            <Button
              variant="secondary"
              onClick={() => void commitRename()}
              disabled={!effectiveTitle.trim() || effectiveTitle.trim() === current.title}
            >
              Rename
            </Button>
          </div>
        </Section>

        {/* MODEL OVERRIDE (baseline from the global role map — see file header note). */}
        <Section kicker="§ MODEL" heading="Storyteller model">
          <div style={styles.sectionNote}>
            This story uses your global role map by default. Override the narrator model just for
            &ldquo;{current.title}&rdquo; below.
          </div>
          <RoleMatrixRow
            role="narrator"
            description="Writes the prose for this story. Wants your strongest model."
            options={modelOptions.length > 0 ? modelOptions : [{ value: effectiveNarrator, label: effectiveNarrator || "—" }]}
            value={effectiveNarrator}
            onChange={setNarratorModel}
            fit={narratorFit}
          />
        </Section>

        {/* CORE — read-only frozen rulebook facts. */}
        <Section kicker="§ CORE" heading="System of play">
          <div style={styles.factGrid}>
            <Fact k="STAT MODE" v={statModeLabel(schema.statMode)} note="How checks resolve" />
            <Fact k="DICE" v="d20" note="Roll + modifier vs DC" />
            <Fact k="DC RANGE" v="5 – 25" note="Trivial to near-impossible" />
            <Fact k="MASTERY" v="4 ranks" note="novice → adept → expert → master" />
          </div>
        </Section>

        {/* SKILLS — read-only catalog from the frozen schema. */}
        <Section kicker="§ SKILLS" heading="Skill catalog" aside={`${schema.skills.length} skills`}>
          {schema.skills.length === 0 ? (
            <div style={styles.sectionNote}>This story defines no learnable skills.</div>
          ) : (
            <div style={styles.list}>
              {schema.skills.map((sk) => (
                <div key={sk.id} style={styles.listRow}>
                  <div style={{ flex: "0 0 160px" }}>
                    <div style={styles.rowName}>{sk.name}</div>
                    <div className="mono" style={styles.rowMeta}>
                      {sk.tier}
                    </div>
                  </div>
                  <div style={styles.rowDesc}>{sk.description}</div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* ACTIONS — read-only catalog; DC values shown (editable once the override API lands). */}
        <Section kicker="§ ACTIONS" heading="Action catalog" aside={`${schema.actions.length} actions`}>
          {schema.actions.length === 0 ? (
            <div style={styles.sectionNote}>This story defines no catalog actions.</div>
          ) : (
            <div style={styles.list}>
              {schema.actions.map((a) => (
                <div key={a.id} style={styles.actionRow}>
                  <div style={styles.rowName}>{a.label}</div>
                  <div style={styles.rowCat}>{a.category}</div>
                  <div className="mono" style={styles.rowDc}>
                    DC {a.dc}
                  </div>
                  <div style={styles.rowReq}>{a.requiresSkill ? `requires: ${a.requiresSkill}` : "—"}</div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* DANGER ZONE */}
        <Section kicker="§ DANGER" heading="Danger zone" danger>
          <div style={styles.dangerRow}>
            <div>
              <div style={styles.dangerTitle}>Delete this story</div>
              <div style={styles.sectionNote}>
                Removes &ldquo;{current.title}&rdquo; and its whole transcript for good. This can&rsquo;t be undone.
              </div>
            </div>
            <Button variant="secondary" style={styles.dangerBtn} onClick={() => setConfirmingDelete(true)}>
              Delete story
            </Button>
          </div>
        </Section>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        tone="danger"
        title="Delete this story?"
        body={`“${current.title}” and its transcript will be removed for good. This can’t be undone.`}
        confirmLabel="Delete story"
        cancelLabel="Keep it"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirmingDelete(false)}
      />

      {/* messageCount reserved for a future "N messages exist" refinement of the locked copy. */}
      <span hidden>{messageCount}</span>
    </div>
  );
}

function statModeLabel(mode: string): string {
  switch (mode) {
    case "full":
      return "Full";
    case "light":
      return "Light";
    case "none":
      return "None";
    default:
      return mode;
  }
}

function Section(props: {
  kicker: string;
  heading: string;
  aside?: string;
  danger?: boolean;
  children: ReactNode;
}): JSX.Element {
  const { kicker, heading, aside, danger, children } = props;
  return (
    <section style={styles.section}>
      <div style={styles.sectionHead}>
        <span className="mono" style={styles.sectionKicker}>
          {kicker}
        </span>
        <h2 style={{ ...styles.sectionHeading, ...(danger ? { color: "var(--failure)" } : null) }}>{heading}</h2>
        <div style={styles.sectionRule} />
        {aside ? (
          <span className="mono" style={styles.sectionAside}>
            {aside}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Fact(props: { k: string; v: string; note: string }): JSX.Element {
  return (
    <div style={styles.fact}>
      <div className="mono" style={styles.factKey}>
        {props.k}
      </div>
      <div className="mono" style={styles.factValue}>
        {props.v}
      </div>
      <div style={styles.factNote}>{props.note}</div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  screen: { overflowY: "auto", padding: "24px 34px 70px" },
  body: { maxWidth: 820, margin: "0 auto" },
  centered: { maxWidth: 520, margin: "6vh auto 0", textAlign: "center" },
  loadingText: { color: "var(--muted)", fontSize: 12, letterSpacing: "0.08em" },
  lockedBanner: {
    display: "flex",
    gap: 13,
    alignItems: "flex-start",
    background: "var(--hairline-soft)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius-card)",
    padding: "15px 18px",
    marginBottom: 26,
  },
  lockGlyph: { fontSize: 18, color: "var(--dead)" },
  lockedTitle: { fontWeight: 600, fontSize: 14, color: "var(--ui-text)" },
  lockedBody: { fontSize: 13, color: "var(--secondary)", lineHeight: 1.6, marginTop: 3 },
  section: { marginBottom: 34 },
  sectionHead: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 },
  sectionKicker: { fontSize: 11, color: "var(--teal)" },
  sectionHeading: { fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 22, color: "var(--prose)", margin: 0 },
  sectionRule: { flex: 1, height: 1, background: "var(--hairline)" },
  sectionAside: { fontSize: 11, color: "var(--muted)" },
  sectionNote: { fontSize: 12.5, color: "var(--secondary)", lineHeight: 1.5, marginBottom: 12 },
  renameRow: { display: "flex", gap: 10, alignItems: "center" },
  titleInput: {
    flex: 1,
    fontFamily: "var(--font-display)",
    fontSize: 20,
    color: "var(--prose)",
    background: "var(--bg2-card)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius-chip)",
    padding: "10px 14px",
    outline: "none",
  },
  factGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 },
  fact: {
    background: "var(--bg1-panel)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius-chip)",
    padding: "12px 14px",
  },
  factKey: { fontSize: 10, letterSpacing: "0.08em", color: "var(--muted)" },
  factValue: { fontSize: 15, color: "var(--teal)", marginTop: 4 },
  factNote: { fontSize: 11, color: "var(--secondary)", marginTop: 3 },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  listRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    background: "var(--bg1-panel)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius-chip)",
    padding: "11px 15px",
  },
  actionRow: {
    display: "grid",
    gridTemplateColumns: "1.4fr 0.9fr 0.6fr 1.4fr",
    alignItems: "center",
    gap: 10,
    background: "var(--bg1-panel)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius-chip)",
    padding: "10px 15px",
  },
  rowName: { fontSize: 14, color: "var(--ui-text)" },
  rowMeta: { fontSize: 10, color: "var(--muted)" },
  rowDesc: { flex: 1, fontSize: 12.5, color: "var(--secondary)", lineHeight: 1.5 },
  rowCat: { fontSize: 12, color: "var(--secondary)" },
  rowDc: { fontSize: 12, color: "var(--teal)" },
  rowReq: { fontSize: 11.5, color: "var(--secondary)" },
  dangerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    background: "color-mix(in srgb, var(--crit-crimson) 6%, transparent)",
    border: "1px solid color-mix(in srgb, var(--crit-crimson) 30%, transparent)",
    borderRadius: "var(--radius-card)",
    padding: "16px 18px",
  },
  dangerTitle: { fontWeight: 600, fontSize: 14, color: "var(--ui-text)" },
  dangerBtn: { color: "var(--failure)", borderColor: "color-mix(in srgb, var(--failure) 50%, transparent)" },
};

export default StorySettings;
