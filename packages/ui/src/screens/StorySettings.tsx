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
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useStoriesStore } from "../state/storiesStore";
import { useSettingsStore } from "../state/settingsStore";
import { useRoute } from "../state/uiStore";
import { getBridge } from "../bridge/core";
import type {
  AttachedLorebook,
  BootstrapPhase,
  BootstrapResumeState,
  EquipmentLootConfig,
  LorebookLibraryEntry,
  PersonaRecord,
  RulebookRegenerationImpact,
  UniversalActionConfig,
} from "../bridge/core";
import {
  Button,
  EmptyState,
  InlineNotice,
  ConfirmDialog,
  AttachRow,
  PersonaPickerRow,
  DifficultyPicker,
  STANDARD_DIFFICULTY,
  ForgingInterstitial,
} from "../components";
import type { AttachSourceTag, DifficultyValue, ForgeOperationState, ForgeStep } from "../components";
import type { ScreenProps } from "./registry";

export function StorySettings(props: ScreenProps): JSX.Element {
  const storyId = props.storyId;
  const current = useStoriesStore((s) => s.current);
  const currentStatus = useStoriesStore((s) => s.currentStatus);
  const openStory = useStoriesStore((s) => s.openStory);
  const rename = useStoriesStore((s) => s.rename);
  const remove = useStoriesStore((s) => s.remove);

  const roleMap = useSettingsStore((s) => s.roleMap);
  const setupState = useSettingsStore((s) => s.setupState);
  const { navigate } = useRoute();

  const loaded = current?.id === storyId && currentStatus === "ready";

  const [title, setTitle] = useState<string | undefined>(undefined);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pendingMode, setPendingMode] = useState<"none" | "full">();
  const [switchingMode, setSwitchingMode] = useState(false);
  const [switchProgress, setSwitchProgress] = useState<string>();
  const [switchError, setSwitchError] = useState<string>();
  const [difficultyDraft, setDifficultyDraft] = useState<DifficultyValue>();
  const [difficultyConfirming, setDifficultyConfirming] = useState(false);
  const [difficultySaved, setDifficultySaved] = useState(false);
  const [regeneration, setRegeneration] = useState<"closed" | "choose" | "confirm-in-place" | "running" | "cancelled" | "success" | "failed">("closed");
  const [regenTyped, setRegenTyped] = useState("");
  const [regenMode, setRegenMode] = useState<"duplicate" | "in-place">("duplicate");
  const [regenError, setRegenError] = useState<string>();
  const [regenProgress, setRegenProgress] = useState<{ phase?: string; message?: string }>({});
  const [regenImpact, setRegenImpact] =
    useState<RulebookRegenerationImpact>();
  const regenAbort = useRef<AbortController>();
  const regenCheckpoint = useRef<BootstrapResumeState>();
  const [catalogSearch, setCatalogSearch] = useState("");
  const [universalActions, setUniversalActions] = useState<
    UniversalActionConfig["actions"]
  >([]);
  const [equipmentLoot, setEquipmentLoot] = useState<EquipmentLootConfig>();

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getBridge().universalActionsConfig(),
      getBridge().equipmentLootConfig(),
    ]).then(([actions, equipment]) => {
      if (!cancelled) {
        setUniversalActions(actions.actions);
        setEquipmentLoot(equipment);
      }
    }).catch(() => {
      if (!cancelled) {
        setUniversalActions([]);
        setEquipmentLoot(undefined);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () => () => {
      regenAbort.current?.abort();
    },
    []
  );

  // Sync the local title once the story record loads (deeplink / tab-switch).
  const effectiveTitle = title ?? current?.title ?? "";
  const effectiveNarrator = roleMap?.narrator.model ?? "Not configured";

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
  const extendedStory = story as typeof story & {
    difficulty?: DifficultyValue;
    actionBudget?: number;
    rulebookVersion?: number;
  };
  const extendedSchema = schema as typeof schema & {
    difficulty?: DifficultyValue;
    actionBudget?: number;
  };
  const currentDifficulty = difficultyDraft ?? extendedStory.difficulty ?? extendedSchema.difficulty ?? STANDARD_DIFFICULTY;
  const actionBudget = extendedStory.actionBudget ?? extendedSchema.actionBudget ?? 2;
  const resources = schema.resources ?? [];
  const visibleUniversalActions = universalActions.filter((action) => {
    const needle = catalogSearch.trim().toLowerCase();
    return !needle || `${action.label} ${action.description} ${action.aliases?.join(" ") ?? ""}`.toLowerCase().includes(needle);
  });
  const messageCount = 0; // transcript length isn't on the record; the locked banner keys off `locked`.

  const commitRename = async (): Promise<void> => {
    const next = effectiveTitle.trim();
    if (next && next !== current.title) await rename(storyId, next);
  };
  const confirmDelete = async (): Promise<void> => {
    setConfirmingDelete(false);
    await remove(storyId);
    navigate("library");
  };
  const commitModeChange = async (): Promise<void> => {
    const target = pendingMode;
    if (!target) return;
    if (target === "full" && !setupState.rolesConfirmed) {
      setPendingMode(undefined);
      navigate("setup", { returnTo: "storysettings", storyId, setupReason: "full-stats-upgrade" });
      return;
    }
    setPendingMode(undefined);
    setSwitchingMode(true);
    setSwitchError(undefined);
    try {
      await getBridge().changeStoryStatMode({
        storyId,
        target,
        onProgress: (phase) => setSwitchProgress(
          phase === "phase-a" ? "Drafting attributes, skills, and rules…"
            : phase === "phase-b" ? "Creating actions and starting state…"
              : phase === "validate" ? "Validating the upgraded rulebook…"
                : phase === "freeze" ? "Sealing the catalog…"
                  : "Installing the stat-system boundary…"
        ),
      });
      await openStory(storyId);
    } catch (err) {
      setSwitchError(err instanceof Error ? err.message : "Couldn't change the stat system.");
    } finally {
      setSwitchingMode(false);
      setSwitchProgress(undefined);
    }
  };
  const commitDifficulty = async (): Promise<void> => {
    setDifficultyConfirming(false);
    setDifficultySaved(false);
    try {
      await getBridge().setStoryDifficulty(storyId, currentDifficulty);
      setDifficultySaved(true);
      await openStory(storyId);
    } catch (err) {
      setSwitchError(err instanceof Error ? err.message : "Couldn't save difficulty.");
    }
  };
  const runRegeneration = async (mode: "duplicate" | "in-place"): Promise<void> => {
    regenAbort.current?.abort();
    const controller = new AbortController();
    regenAbort.current = controller;
    setRegenMode(mode);
    setRegeneration("running");
    setRegenError(undefined);
    setRegenProgress({ phase: "phase-a", message: "Regeneration request accepted; current rulebook retained" });
    try {
      const result = await getBridge().regenerateRulebook({
        storyId,
        mode,
        confirmMechanicalReset: true,
        signal: controller.signal,
        ...(regenCheckpoint.current
          ? { resume: regenCheckpoint.current }
          : {}),
        onCheckpoint: (checkpoint) => {
          regenCheckpoint.current = checkpoint;
        },
        onProgress: (phase) =>
          setRegenProgress({ phase, message: regenerationMessage(phase) }),
        onProgressDetail: (event) =>
          setRegenProgress({ phase: event.phase, message: event.message }),
      });
      regenCheckpoint.current = undefined;
      regenAbort.current = undefined;
      setRegeneration("success");
      if (mode === "duplicate") navigate("storysettings", { storyId: result.id });
      else await openStory(storyId);
    } catch (err) {
      regenAbort.current = undefined;
      const cancelled =
        controller.signal.aborted ||
        (err instanceof Error && /abort|cancel/i.test(`${err.name} ${err.message}`));
      setRegenError(
        cancelled
          ? "Regeneration cancelled safely. The current story was not changed; completed fragments were retained for resume."
          : err instanceof Error
            ? err.message
            : "The replacement rulebook failed validation."
      );
      setRegeneration(cancelled ? "cancelled" : "failed");
    }
  };
  const cancelRegeneration = (): void => {
    regenAbort.current?.abort();
  };
  const openRegeneration = async (): Promise<void> => {
    regenAbort.current?.abort();
    regenCheckpoint.current = undefined;
    setRegeneration("choose");
    setRegenImpact(undefined);
    setRegenError(undefined);
    try {
      setRegenImpact(
        await getBridge().previewRulebookRegenerationImpact(storyId)
      );
    } catch (reason) {
      setRegenError(
        reason instanceof Error
          ? reason.message
          : "Couldn't calculate the regeneration impact."
      );
    }
  };

  return (
    <div style={styles.screen}>
      <div style={styles.body}>
        {/* A sealed rulebook is immutable during play, but may be deliberately regenerated. */}
        {current.locked ? (
          <div style={styles.lockedBanner} data-testid="storysettings-locked">
            <span style={styles.lockGlyph} aria-hidden="true">
              🔒
            </span>
            <div style={{ flex: 1 }}>
              <div style={styles.lockedTitle}>The rulebook is sealed</div>
              <div style={styles.lockedBody}>
                Version {extendedStory.rulebookVersion ?? 1} is immutable during play. You may regenerate it with a full
                impact review; the existing rulebook remains available until the replacement validates atomically.
              </div>
            </div>
            <Button variant="secondary" onClick={() => void openRegeneration()}>
              ↻ Regenerate rulebook
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
            Every story uses the same global Narrator. This avoids a second, conflicting model
            assignment inside individual story settings.
          </div>
          <div style={{ ...styles.renameRow, marginTop: 12 }}>
            <div>
              <div style={styles.rowName}>Narrator</div>
              <div className="mono" style={styles.rowMeta}>{effectiveNarrator}</div>
            </div>
            <Button variant="secondary" onClick={() => navigate("rolematrix")}>Configure global Narrator →</Button>
          </div>
        </Section>

        {/* PERSONA (v2 §4) + LOREBOOKS (v2 §2) + BLUEPRINT (v2 §3) — story-scoped attachments. */}
        <StoryAttachments storyId={storyId} onEditBlueprint={() => navigate("blueprint", { storyId })} />

        <Section kicker="§ STAT SYSTEM" heading="Future play mode">
          {schema.migrationPending ? (
            <InlineNotice
              severity="warn"
              title="Choose a destination for this legacy Light Rules story"
              detail="Earlier exchanges will not change. Continue as No Stats to pause mechanics, or choose Full Stats to retain the sealed rulebook."
            />
          ) : null}
          <div style={{ ...styles.factGrid, marginTop: 12 }}>
            <button type="button" style={{ ...styles.modeChoice, ...(schema.statMode === "none" && !schema.migrationPending ? styles.modeChoiceActive : {}) }} onClick={() => setPendingMode("none")} disabled={switchingMode}>
              <strong>No Stats</strong>
              <span>Only the Narrator runs. Mechanical state is preserved but dormant.</span>
            </button>
            <button type="button" style={{ ...styles.modeChoice, ...(schema.statMode === "full" && !schema.migrationPending ? styles.modeChoiceActive : {}) }} onClick={() => setPendingMode("full")} disabled={switchingMode}>
              <strong>Full Stats</strong>
              <span>Attributes, skills, rulings, progression, and the full role pipeline.</span>
            </button>
          </div>
          {switchProgress ? <div style={{ marginTop: 12 }}><InlineNotice severity="info" title="Changing stat system" detail={switchProgress} /></div> : null}
          {switchError ? <div style={{ marginTop: 12 }}><InlineNotice severity="error" title="Couldn't change stat system" detail={switchError} /></div> : null}
        </Section>

        {schema.statMode === "full" ? (
          <>
            <Section kicker="§ DIFFICULTY" heading="Mechanical difficulty">
              <DifficultyPicker
                value={currentDifficulty}
                onChange={(next) => {
                  setDifficultyDraft(next);
                  setDifficultySaved(false);
                }}
                showEffectiveTiming
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                <Button variant="system" disabled={!difficultyDraft} onClick={() => setDifficultyConfirming(true)}>
                  Apply from next turn
                </Button>
              </div>
              {difficultySaved ? <div style={{ marginTop: 10 }}><InlineNotice severity="success" title="Difficulty updated" detail="The new values begin with the next player turn. Existing rulings remain unchanged." /></div> : null}
            </Section>

            <Section kicker="§ ACTION BUDGET" heading="Actions per player turn">
              <div style={styles.factGrid}>
                <Fact k="MAXIMUM" v={String(actionBudget)} note="Configured when this rulebook was forged" />
                <Fact k="OVERFLOW" v="Refused" note="No roll, XP, loot, cost, or consequence" />
              </div>
              <div style={{ ...styles.sectionNote, marginTop: 10 }}>
                Combat, movement, item use, and consequential dialogue attempts count. This value is read-only because changing it alters the rulebook contract; use regeneration instead.
              </div>
            </Section>
          </>
        ) : null}

        {/* CORE — read-only frozen rulebook facts. */}
        <Section kicker="§ CORE" heading="System of play">
          <div style={styles.factGrid}>
            <Fact k="STAT MODE" v={statModeLabel(schema.statMode)} note="How checks resolve" />
            <Fact k="DICE" v="d20" note="Roll + modifier vs DC" />
            <Fact k="ATTRIBUTES" v="1 – 20" note="Above 20 only with explicit superhuman provenance" />
            <Fact k="MASTERY" v="XP · 4 ranks" note="novice → adept → expert → master" />
          </div>
        </Section>

        {schema.statMode === "full" ? (
          <Section kicker="§ ATTRIBUTES" heading="Attribute catalog" aside={`${schema.attributes?.length ?? 0} attributes`}>
            {(schema.attributes?.length ?? 0) === 0 ? <div style={styles.sectionNote}>No attributes were generated.</div> : (
              <div style={styles.list}>
                {(schema.attributes ?? []).map((attribute) => (
                  <div key={attribute.id} style={styles.listRow}>
                    <div style={{ flex: "0 0 160px" }}>
                      <div style={styles.rowName}>{attribute.name} <span className="mono">({attribute.abbrev})</span></div>
                      <div className="mono" style={styles.rowMeta}>default {attribute.defaultScore}</div>
                    </div>
                    <div style={styles.rowDesc}>{attribute.description}</div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        ) : (
          <Section kicker="§ DORMANT" heading="Mechanics are paused">
            <div style={styles.sectionNote}>No checks, rulings, progression, analysis, or summaries run in this story. Any previously sealed catalog remains preserved for a future Full Stats resume.</div>
          </Section>
        )}

        {schema.statMode === "full" ? <>
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

        <Section kicker="§ UNIVERSAL ACTIONS" heading="Universal action reference" aside={`${universalActions.length} configured`}>
          <div style={styles.sectionNote}>
            Versioned, application-wide action families that story actions specialize. This list has no fixed size and is intentionally read-only here.
          </div>
          <input
            type="search"
            value={catalogSearch}
            onChange={(event) => setCatalogSearch(event.target.value)}
            placeholder="Search universal actions and aliases…"
            aria-label="Search universal actions"
            style={{ ...styles.titleInput, fontFamily: "var(--font-ui)", fontSize: 13, marginBottom: 10 }}
          />
          {visibleUniversalActions.length === 0 ? (
            <div style={styles.sectionNote}>{universalActions.length === 0 ? "No universal actions are installed in this rulebook version." : "No universal actions match this search."}</div>
          ) : (
            <div style={styles.list}>
              {visibleUniversalActions.map((action) => (
                <div key={action.id} style={styles.listRow}>
                  <div style={{ flex: "0 0 170px" }}>
                    <div style={styles.rowName}>{action.label}</div>
                    <div className="mono" style={styles.rowMeta}>{action.id}{action.category ? ` · ${action.category}` : ""}</div>
                  </div>
                  <div style={styles.rowDesc}>
                    {action.description}
                    {action.aliases?.length ? <div className="mono" style={{ ...styles.rowMeta, marginTop: 4 }}>ALIASES · {action.aliases.join(" · ")}</div> : null}
                  </div>
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
              {schema.actions.map((a) => {
                const attribute = a.governingAttribute
                  ? schema.attributes?.find((candidate) => candidate.id === a.governingAttribute)
                  : undefined;
                const terms = [
                  attribute ? `${attribute.abbrev} (${attribute.name})` : undefined,
                  a.requiresSkill ? `skill: ${a.requiresSkill}` : undefined,
                ].filter(Boolean);
                return (
                  <div key={a.id} style={styles.actionRow}>
                    <div>
                      <div style={styles.rowName}>{a.label}</div>
                      <div className="mono" style={styles.rowMeta}>
                        {(a as typeof a & { universalBase?: string; description?: string }).universalBase ? `BASE · ${(a as typeof a & { universalBase?: string }).universalBase}` : "STORY-SPECIFIC"}
                      </div>
                    </div>
                    <div style={styles.rowCat}>{a.category}</div>
                    <div className="mono" style={styles.rowDc}>{a.opposed ? "OPPOSED" : `DC ${a.dc}`}</div>
                    <div style={styles.rowReq}>
                      {terms.length ? terms.join(" · ") : "—"}
                      {(a as typeof a & { description?: string }).description ? <div style={{ marginTop: 3 }}>{(a as typeof a & { description?: string }).description}</div> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section kicker="§ RESOURCES" heading="Resource catalog" aside={`${resources.length} resources`}>
          {resources.length === 0 ? (
            <div style={styles.sectionNote}>This story defines no tracked resources.</div>
          ) : (
            <div style={styles.list}>
              {resources.map((resource) => (
                <div key={resource.id} style={styles.listRow}>
                  <div style={{ flex: "0 0 170px" }}>
                    <div style={styles.rowName}>{resource.label}</div>
                    <div className="mono" style={styles.rowMeta}>{resource.id}</div>
                  </div>
                  <div style={styles.rowDesc}>
                    Starts at {resource.start}; maximum {resource.max}.
                    {resource.regenPerScene
                      ? ` Recovers ${resource.regenPerScene} per scene.`
                      : " No passive scene recovery."}
                    {resource.lethal
                      ? " Reaching zero is lethal."
                      : " Reaching zero is not inherently lethal."}
                    {!resource.playerVisible ? " Hidden from the player." : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section
          kicker="§ EQUIPMENT"
          heading="Universal slots and tier policy"
          aside={equipmentLoot ? `${equipmentLoot.slots.length} slots · config v${equipmentLoot.version}` : "Loading policy"}
        >
          <div style={styles.sectionNote}>
            Items are not pregenerated with the rulebook. The DM Ruling creates deserved
            rewards on demand, and only equipped items grant their active effects.
          </div>
          {equipmentLoot ? (
            <>
              <div className="mono" style={{ ...styles.rowMeta, marginTop: 10 }}>
                SLOTS · {equipmentLoot.slots.map((slot) => slot.replaceAll("_", " ")).join(" · ")}
              </div>
              <div style={{ ...styles.list, marginTop: 10 }}>
                {Object.entries(equipmentLoot.tiers).map(([tier, policy]) => (
                  <div key={tier} style={styles.listRow}>
                    <div style={{ flex: "0 0 170px" }}>
                      <div style={styles.rowName}>{tier[0]!.toUpperCase() + tier.slice(1)}</div>
                      <div className="mono" style={styles.rowMeta}>
                        {policy.requiresMilestone ? "MILESTONE-GATED" : "ROUTINE-ELIGIBLE"}
                      </div>
                    </div>
                    <div style={styles.rowDesc}>
                      Up to {policy.maximumEffects} effect{policy.maximumEffects === 1 ? "" : "s"};
                      check bonus +{policy.maximumCheckBonus}; attribute bonus +{policy.maximumAttributeBonus}.
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ ...styles.sectionNote, marginTop: 10 }}>Loading the versioned equipment policy…</div>
          )}
        </Section>

        <Section kicker="§ LOOT POLICY" heading="On-demand reward eligibility">
          <div style={styles.factGrid}>
            <Fact k="SOURCE" v="DM Ruling" note="Combat and non-combat encounters" />
            <Fact k="GENERATION" v="On demand" note="No item catalog is created during forging" />
            <Fact k="VALIDATION" v="Engine-gated" note="Tier, effect budget, provenance, and requirements" />
            <Fact
              k="PLAYER CHOICE"
              v="Equip or store"
              note={`Up to ${equipmentLoot?.loot.maximumItemsPerEncounter ?? 3} deserved awards per encounter`}
            />
          </div>
          <div style={{ ...styles.sectionNote, marginTop: 10 }}>
            The Narrator cannot invent or grant equipment. An eligible reward is proposed only after a resolved encounter, validated by the rules engine, and committed with its ruling and journal event.
          </div>
        </Section>

        </> : null}

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
      <ConfirmDialog
        open={pendingMode !== undefined}
        title={pendingMode === "none" ? "Switch future play to No Stats?" : "Enable Full Stats for future play?"}
        body={pendingMode === "none"
          ? "Earlier exchanges and current mechanical state stay unchanged. Classifier, analyzer, summarizer, bootstrapper, checks, and rulings will become dormant after a permanent timeline boundary."
          : schema.actions.length > 0
            ? "The preserved sealed rulebook will resume after a permanent timeline boundary. Earlier exchanges will not be reinterpreted."
            : "A provider-backed forge will create and validate a sealed rulebook before Full Stats is enabled. If it fails or is cancelled, this story remains No Stats."}
        confirmLabel={pendingMode === "none" ? "Switch to No Stats" : "Enable Full Stats"}
        cancelLabel="Keep current mode"
        onConfirm={() => void commitModeChange()}
        onCancel={() => setPendingMode(undefined)}
      />
      <ConfirmDialog
        open={difficultyConfirming}
        title={`Apply ${currentDifficulty.preset} difficulty from the next turn?`}
        body="Committed rulings, XP, loot, equipment, journal events, and hard state stay unchanged. The player DC offset never changes opposed contests."
        confirmLabel="Apply difficulty"
        cancelLabel="Keep current difficulty"
        onConfirm={() => void commitDifficulty()}
        onCancel={() => setDifficultyConfirming(false)}
      />
      <RulebookRegenerationDialog
        phase={regeneration}
        typed={regenTyped}
        mode={regenMode}
        progress={regenProgress}
        impact={regenImpact}
        error={regenError}
        storyTitle={current.title}
        onTyped={setRegenTyped}
        onClose={() => {
          setRegeneration("closed");
          setRegenTyped("");
        }}
        onChooseDuplicate={() => void runRegeneration("duplicate")}
        onChooseInPlace={() => setRegeneration("confirm-in-place")}
        onConfirmInPlace={() => void runRegeneration("in-place")}
        onCancelRunning={cancelRegeneration}
        onResume={() => void runRegeneration(regenMode)}
        onRetry={() => void runRegeneration(regenMode)}
      />

      {/* messageCount reserved for a future "N messages exist" refinement of the locked copy. */}
      <span hidden>{messageCount}</span>
    </div>
  );
}

function RulebookRegenerationDialog(props: {
  phase: "closed" | "choose" | "confirm-in-place" | "running" | "cancelled" | "success" | "failed";
  typed: string;
  mode: "duplicate" | "in-place";
  progress: { phase?: string; message?: string };
  impact?: RulebookRegenerationImpact;
  error?: string;
  storyTitle: string;
  onTyped: (value: string) => void;
  onClose: () => void;
  onChooseDuplicate: () => void;
  onChooseInPlace: () => void;
  onConfirmInPlace: () => void;
  onCancelRunning: () => void;
  onResume: () => void;
  onRetry: () => void;
}): JSX.Element | null {
  if (props.phase === "closed") return null;
  const phrase = `REGENERATE ${props.storyTitle}`.toUpperCase();
  const steps: ForgeStep[] = [
    { label: "Read preserved card, persona, blueprint, and lore", status: props.progress.phase === "phase-a" ? "active" : "done" },
    { label: "Forge replacement mechanics without pregenerated items", status: props.progress.phase === "phase-b" ? "active" : props.progress.phase === "phase-a" ? "pending" : "done" },
    { label: "Validate references and on-demand loot policy", status: props.progress.phase === "validate" ? "active" : ["phase-a", "phase-b"].includes(props.progress.phase ?? "") ? "pending" : "done" },
    { label: "Create rollback snapshot and atomic version boundary", status: props.progress.phase === "freeze" || props.progress.phase === "install" ? "active" : "pending" },
  ];
  const operation: ForgeOperationState =
    props.phase === "failed"
      ? "failed"
      : props.phase === "cancelled"
        ? "resumable"
        : props.phase === "success"
          ? "completed"
          : "running";
  return (
    <div style={styles.modalBackdrop} role="presentation">
      <section role="dialog" aria-modal="true" aria-label="Regenerate rulebook" style={styles.regenDialog}>
        {props.phase === "running" || props.phase === "cancelled" || props.phase === "failed" || props.phase === "success" ? (
          <>
            <ForgingInterstitial
              title={props.mode === "duplicate" ? "Duplicating and regenerating" : "Regenerating this rulebook"}
              steps={steps}
              operationState={operation}
              regeneration
              lastEvent={props.progress.message}
              onCancel={props.phase === "running" ? props.onCancelRunning : undefined}
              onResume={props.phase === "cancelled" ? props.onResume : undefined}
              onRetry={props.phase === "failed" ? props.onRetry : undefined}
            />
            {props.error ? <InlineNotice severity="error" title="Replacement rolled back" detail={`${props.error} The existing rulebook and story remain unchanged.`} /> : null}
            {props.phase === "success" ? <InlineNotice severity="success" title="Rulebook replacement installed" detail="A version boundary and rollback snapshot were recorded." /> : null}
            {props.phase !== "running" ? <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}><Button variant="secondary" onClick={props.onClose}>Close</Button></div> : null}
          </>
        ) : props.phase === "confirm-in-place" ? (
          <>
            <h2 style={styles.sectionHeading}>Regenerate this story in place?</h2>
            <InlineNotice severity="error" title="This permanently resets mechanical history" detail="A rollback snapshot is retained, but the current story's mechanical timeline is replaced only after the new rulebook validates." />
            <ImpactSummary impact={props.impact} />
            <label style={{ display: "block", color: "var(--secondary)", fontSize: 12, marginTop: 14 }}>
              Type <strong style={{ color: "var(--failure)" }}>{phrase}</strong>
              <input value={props.typed} onChange={(event) => props.onTyped(event.target.value)} aria-label="Regeneration confirmation phrase" style={{ ...styles.titleInput, display: "block", width: "100%", boxSizing: "border-box", marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 12 }} />
            </label>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
              <Button variant="ghost" onClick={props.onClose}>Cancel</Button>
              <Button variant="secondary" disabled={props.typed.trim().toUpperCase() !== phrase} onClick={props.onConfirmInPlace} style={styles.dangerBtn}>Regenerate in place</Button>
            </div>
          </>
        ) : (
          <>
            <h2 style={styles.sectionHeading}>Regenerate the sealed rulebook</h2>
            <p style={styles.sectionNote}>Narrative continuity is preserved, while the replacement mechanics are built as a separate draft. Nothing changes if generation or validation fails.</p>
            {props.error ? <InlineNotice severity="error" title="Couldn't calculate exact impact" detail={props.error} /> : null}
            <ImpactSummary impact={props.impact} />
            <div style={{ display: "grid", gap: 9, marginTop: 14 }}>
              <button type="button" onClick={props.onChooseDuplicate} style={styles.regenChoice}>
                <strong>Duplicate & regenerate · recommended</strong>
                <span>The current story remains intact. A new story copy receives the regenerated rulebook.</span>
              </button>
              <button type="button" onClick={props.onChooseInPlace} style={{ ...styles.regenChoice, borderColor: "color-mix(in srgb, var(--failure) 45%, var(--hairline))" }}>
                <strong style={{ color: "var(--failure)" }}>Regenerate this story in place</strong>
                <span>Requires a typed confirmation and creates a retained rollback snapshot.</span>
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}><Button variant="ghost" onClick={props.onClose}>Cancel</Button></div>
          </>
        )}
      </section>
    </div>
  );
}

function ImpactSummary(props: {
  impact?: RulebookRegenerationImpact;
}): JSX.Element {
  const impact = props.impact;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginTop: 12 }}>
      <div style={{ padding: 11, background: "color-mix(in srgb, var(--failure) 6%, transparent)", border: "1px solid color-mix(in srgb, var(--failure) 30%, transparent)", borderRadius: 8 }}>
        <div className="mono" style={{ color: "var(--failure)", fontSize: 10 }}>RESET</div>
        <div style={{ color: "var(--secondary)", fontSize: 11.5, lineHeight: 1.55, marginTop: 4 }}>
          {impact
            ? `${impact.attributes} attributes · ${impact.skills} skills / ${impact.skillProgressions} character progress rows · ${impact.storyActions} story actions · ${impact.universalActions} universal-action references · ${impact.resources} resources · ${impact.flags} active flags · ${impact.runtimeItemDefinitions} runtime item definitions / ${impact.runtimeItemInstances} owned instances · ${impact.equippedSlots} equipped slots · budget ${impact.actionBudget} · ${impact.rulings} rulings · ${impact.journalEvents} journal events · ${impact.checkpoints} checkpoints · ${impact.characters} hard-state sheets`
            : "Calculating exact persisted counts…"}
        </div>
      </div>
      <div style={{ padding: 11, background: "var(--teal-tint)", border: "1px solid var(--teal-dim)", borderRadius: 8 }}>
        <div className="mono" style={{ color: "var(--teal)", fontSize: 10 }}>PRESERVED</div>
        <div style={{ color: "var(--secondary)", fontSize: 11.5, lineHeight: 1.55, marginTop: 4 }}>Narrative messages · imported card · persona · blueprint · lorebooks · authored identity · premise and opening · transcript text</div>
      </div>
    </div>
  );
}

// ── Story-scoped attachments: persona (v2 §4), lorebooks (v2 §2), blueprint link (v2 §3) ────────

const ATTACH_SECTION: CSSProperties = { marginBottom: 34 };

function StoryAttachments(props: { storyId: string; onEditBlueprint: () => void }): JSX.Element {
  const { storyId, onEditBlueprint } = props;
  const [attached, setAttached] = useState<AttachedLorebook[]>([]);
  const [allBooks, setAllBooks] = useState<LorebookLibraryEntry[]>([]);
  const [personas, setPersonas] = useState<PersonaRecord[]>([]);
  const [activePersona, setActivePersona] = useState<PersonaRecord | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [pickingPersona, setPickingPersona] = useState(false);

  async function refresh(): Promise<void> {
    const bridge = getBridge();
    const [att, all, ps, active] = await Promise.all([
      bridge.listAttachedLorebooks(storyId),
      bridge.listLorebooks(),
      bridge.listPersonas(),
      bridge.getActivePersona(storyId),
    ]);
    setAttached(att);
    setAllBooks(all);
    setPersonas(ps);
    setActivePersona(active);
  }

  useEffect(() => {
    let cancelled = false;
    setError(undefined);
    void (async () => {
      try {
        const bridge = getBridge();
        const [att, all, ps, active] = await Promise.all([
          bridge.listAttachedLorebooks(storyId),
          bridge.listLorebooks(),
          bridge.listPersonas(),
          bridge.getActivePersona(storyId),
        ]);
        if (cancelled) return;
        setAttached(att);
        setAllBooks(all);
        setPersonas(ps);
        setActivePersona(active);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load story attachments.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storyId]);

  const attachedIds = new Set(attached.map((b) => b.id));
  const detachedBooks = allBooks.filter((b) => !attachedIds.has(b.id));

  async function onToggle(lorebookId: string, enabled: boolean): Promise<void> {
    await getBridge().setLorebookAttachedEnabled(storyId, lorebookId, enabled);
    await refresh();
  }
  async function onDetach(lorebookId: string): Promise<void> {
    await getBridge().detachLorebook(storyId, lorebookId);
    await refresh();
  }
  async function onAttach(lorebookId: string): Promise<void> {
    if (!lorebookId) return;
    await getBridge().attachLorebook(storyId, lorebookId);
    await refresh();
  }
  async function onPickPersona(personaId: string): Promise<void> {
    await getBridge().setActivePersona(storyId, personaId === "" ? null : personaId);
    setPickingPersona(false);
    await refresh();
  }

  return (
    <>
      {/* PERSONA */}
      <Section kicker="§ PERSONA" heading="Your persona in this story">
        <div style={ATTACH_SECTION}>
          {pickingPersona ? (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <select
                defaultValue={activePersona?.id ?? ""}
                onChange={(e) => void onPickPersona(e.target.value)}
                aria-label="Choose persona"
                style={{
                  flex: 1,
                  fontFamily: "var(--font-ui)",
                  fontSize: 13,
                  color: "var(--ui-text)",
                  background: "var(--bg2-card)",
                  border: "1px solid var(--hairline)",
                  borderRadius: "var(--radius-chip)",
                  padding: "9px 11px",
                }}
              >
                <option value="">Default persona</option>
                {personas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.isDefault ? " (default)" : ""}
                  </option>
                ))}
              </select>
              <Button variant="ghost" onClick={() => setPickingPersona(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <PersonaPickerRow
              label="Play as"
              {...(activePersona ? { personaName: activePersona.name } : {})}
              onChange={() => setPickingPersona(true)}
            />
          )}
        </div>
      </Section>

      {/* LOREBOOKS */}
      <Section kicker="§ LORE" heading="Lorebooks in this story" aside={`${attached.length} attached`}>
        {error ? (
          <InlineNotice severity="error" title="Couldn't load attachments" detail={error} />
        ) : (
          <div style={ATTACH_SECTION}>
            <div style={{ fontSize: 12.5, color: "var(--secondary)", lineHeight: 1.5, marginBottom: 12 }}>
              Lorebooks are shared assets you attach — enable or detach them per story. Manage the full library from the Lore screen.
            </div>
            {attached.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>No lorebooks attached yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                {attached.map((b) => (
                  <AttachRow
                    key={b.id}
                    name={b.name}
                    {...(isAttachSource(b.source) ? { source: b.source } : {})}
                    enabled={b.linkEnabled}
                    onToggle={(en) => void onToggle(b.id, en)}
                    onDetach={() => void onDetach(b.id)}
                  />
                ))}
              </div>
            )}
            {detachedBooks.length > 0 ? (
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    void onAttach(e.target.value);
                    e.currentTarget.value = "";
                  }}
                  aria-label="Attach a lorebook"
                  style={{
                    flex: 1,
                    fontFamily: "var(--font-ui)",
                    fontSize: 13,
                    color: "var(--ui-text)",
                    background: "var(--bg2-card)",
                    border: "1px solid var(--hairline)",
                    borderRadius: "var(--radius-chip)",
                    padding: "9px 11px",
                  }}
                >
                  <option value="" disabled>
                    Attach a lorebook…
                  </option>
                  {detachedBooks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} · {b.entryCount} entries
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--muted)" }}>All lorebooks are attached.</div>
            )}
          </div>
        )}
      </Section>

      {/* BLUEPRINT */}
      <Section kicker="§ BLUEPRINT" heading="Story blueprint">
        <div style={{ ...ATTACH_SECTION, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div style={{ fontSize: 12.5, color: "var(--secondary)", lineHeight: 1.5 }}>
            Author the story's identity, opening, and narration voice. The world's rules and dice stay framework-owned.
          </div>
          <Button variant="secondary" onClick={onEditBlueprint} style={{ whiteSpace: "nowrap" }}>
            ✎ Edit blueprint
          </Button>
        </div>
      </Section>
    </>
  );
}

/** Narrow a lorebook's free-string source to the AttachRow tag union. */
function isAttachSource(source: string | undefined): source is AttachSourceTag {
  return source === "user" || source === "imported_card" || source === "migrated";
}

function regenerationMessage(phase: BootstrapPhase): string {
  switch (phase) {
    case "phase-a":
      return "Drafting attributes, skills, and rules.";
    case "phase-b":
      return "Creating actions and starting state without pregenerated items.";
    case "repair":
      return "Repairing model output against the rulebook contract.";
    case "validate":
      return "Cross-validating the replacement rulebook.";
    case "freeze":
      return "Sealing the validated replacement.";
    case "install":
      return "Installing the replacement atomically.";
  }
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
  modeChoice: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 6,
    padding: "13px 14px",
    color: "var(--secondary)",
    background: "var(--bg1-panel)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius-chip)",
    cursor: "pointer",
    textAlign: "left",
    fontFamily: "var(--font-ui)",
  },
  modeChoiceActive: { borderColor: "var(--teal)", background: "var(--teal-tint)", color: "var(--ui-text)" },
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
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 80,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    background: "rgba(0,0,0,.68)",
  },
  regenDialog: {
    width: 720,
    maxWidth: "100%",
    maxHeight: "88vh",
    overflowY: "auto",
    padding: "22px 24px",
    background: "var(--bg1-panel)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--elevation)",
  },
  regenChoice: {
    display: "flex",
    flexDirection: "column",
    gap: 5,
    padding: "13px 14px",
    color: "var(--ui-text)",
    background: "var(--bg2-card)",
    border: "1px solid var(--teal-dim)",
    borderRadius: 8,
    textAlign: "left",
    cursor: "pointer",
    fontFamily: "var(--font-ui)",
  },
};

export default StorySettings;
