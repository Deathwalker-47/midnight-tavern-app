import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { ScreenProps } from "./registry.js";
import { getBridge } from "../bridge/core.js";
import { forgeCreateRequest } from "../bridge/core.js";
import type {
  Blueprint,
  BootstrapProgressEvent,
  BootstrapResumeState,
  ForgeOperationRecord,
  PersonaRecord,
} from "../bridge/core.js";
import { useRoute } from "../app/router.js";
import { EMPTY_STORY_DRAFT, useStoriesStore } from "../state/storiesStore.js";
import { setupSupportsStatMode, useSettingsStore } from "../state/settingsStore.js";
import { Button, BlueprintForm, InlineNotice, Toast } from "../components/index.js";
import { diagnosticsLogger } from "../observability/logger.js";

type LoadState = { phase: "loading" } | { phase: "error"; message: string } | { phase: "ready" };

export function StoryBlueprint(props: ScreenProps): JSX.Element {
  const { params, navigate } = useRoute();
  const storyId = props.storyId ?? params.storyId;
  const creating = !storyId;
  const storedDraft = useStoriesStore((state) => state.draft);
  const setDraft = useStoriesStore((state) => state.setDraft);
  const clearDraft = useStoriesStore((state) => state.clearDraft);
  const createStory = useStoriesStore((state) => state.create);
  const setupState = useSettingsStore((state) => state.setupState);
  const entitlement = useSettingsStore((state) => state.entitlement);
  const [state, setState] = useState<LoadState>({ phase: creating ? "ready" : "loading" });
  const [title, setTitle] = useState(storedDraft?.title ?? "");
  // Player name is derived from the chosen persona (no separate field); the draft value is only a
  // fallback for a story forged without a persona.
  const playerName = storedDraft?.playerName ?? "";
  const [premise, setPremise] = useState(storedDraft?.premise ?? "");
  const [statMode, setStatMode] = useState<"none" | "full" | undefined>(storedDraft?.statMode);
  const [blueprint, setBlueprint] = useState<Blueprint>(storedDraft?.blueprint ?? {});
  const [selectedOpening, setSelectedOpening] = useState(storedDraft?.selectedOpening ?? "");
  const [personas, setPersonas] = useState<PersonaRecord[]>([]);
  const [personaId, setPersonaId] = useState(storedDraft?.personaId ?? "");
  const [continueWithoutPersona, setContinueWithoutPersona] = useState(
    storedDraft?.continueWithoutPersona ?? false
  );
  const [personaLoadState, setPersonaLoadState] = useState<"loading" | "ready" | "error">(
    creating ? "loading" : "ready"
  );
  const [dirty, setDirty] = useState(creating);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [progress, setProgress] = useState<string>();
  const [progressPhase, setProgressPhase] = useState<keyof typeof PHASE_LABEL>();
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [retainedForge, setRetainedForge] = useState<ForgeOperationRecord>();
  const retainedForgeRef = useRef<ForgeOperationRecord>();
  const forgeWriteQueue = useRef<Promise<void>>(Promise.resolve());
  const forgeController = useRef<AbortController>();
  const forgeStartedAt = useRef<number>();

  useEffect(() => () => forgeController.current?.abort(), []);

  useEffect(() => {
    if (!creating) return;
    let cancelled = false;
    void getBridge()
      .getForgeOperation()
      .then(async (operation) => {
        if (cancelled || operation?.kind !== "story-create") return;
        if (await getBridge().getStory(operation.storyId)) {
          await getBridge().clearForgeOperation(operation.operationId).catch(() => undefined);
          return;
        }
        if (cancelled) return;
        retainedForgeRef.current = operation;
        setRetainedForge(operation);
        setTitle(operation.request.title);
        setPremise(operation.request.premise);
        setStatMode(operation.request.statMode ?? "full");
        setBlueprint(operation.request.blueprint ?? {});
        setSelectedOpening(operation.request.openingMessage ?? "");
        setPersonaId(operation.request.persona?.id ?? "");
        setContinueWithoutPersona(!operation.request.persona);
        setProgressPhase(operation.phase);
        setProgress(operation.detail ?? "Validated Forge fragments retained.");
        setElapsedSeconds(Math.floor(operation.elapsedMs / 1000));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [creating]);

  useEffect(() => {
    if (!creating || !saving) return;
    const update = (): void => setElapsedSeconds(Math.floor((Date.now() - (forgeStartedAt.current ?? Date.now())) / 1000));
    update();
    const timer = globalThis.setInterval(update, 1000);
    return () => globalThis.clearInterval(timer);
  }, [creating, saving]);

  useEffect(() => {
    if (!creating || storedDraft) return;
    setDraft({ ...EMPTY_STORY_DRAFT });
  }, [creating, storedDraft, setDraft]);

  useEffect(() => {
    if (!creating) return;
    let cancelled = false;
    void getBridge()
      .listPersonas()
      .then((available) => {
        if (cancelled) return;
        setPersonas(available);
        setPersonaId((current) => {
          if (current && available.some((persona) => persona.id === current)) return current;
          const sensibleDefault =
            available.find((persona) => persona.isDefault) ??
            (available.length === 1 ? available[0] : undefined);
          return sensibleDefault?.id ?? "";
        });
        setPersonaLoadState("ready");
      })
      .catch(() => {
        if (!cancelled) setPersonaLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [creating]);

  useEffect(() => {
    if (!storyId) return;
    let cancelled = false;
    setState({ phase: "loading" });
    void getBridge()
      .getBlueprint(storyId)
      .then((value) => {
        if (cancelled) return;
        setBlueprint(value ?? {});
        setDirty(false);
        setState({ phase: "ready" });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ phase: "error", message: err instanceof Error ? err.message : "Couldn't load the blueprint." });
      });
    return () => {
      cancelled = true;
    };
  }, [storyId]);

  useEffect(() => {
    if (!creating) return;
    setDraft({
      title,
      playerName,
      premise,
      ...(statMode ? { statMode } : {}),
      ...(personaId ? { personaId } : {}),
      ...(continueWithoutPersona ? { continueWithoutPersona: true } : {}),
      blueprint,
      ...(selectedOpening ? { selectedOpening } : {}),
      ...(storedDraft?.importedCard ? { importedCard: storedDraft.importedCard } : {}),
    });
  }, [
    blueprint,
    continueWithoutPersona,
    creating,
    personaId,
    playerName,
    premise,
    selectedOpening,
    setDraft,
    statMode,
    storedDraft?.importedCard,
    title,
  ]);

  const openings = useMemo(
    () => [blueprint.firstMessage, ...(blueprint.alternateGreetings ?? [])].filter((value): value is string => Boolean(value?.trim())),
    [blueprint.firstMessage, blueprint.alternateGreetings]
  );
  const selectedPersona = personas.find((persona) => persona.id === personaId);

  async function saveExisting(): Promise<void> {
    if (!storyId) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      await getBridge().saveBlueprint(storyId, blueprint);
      setDirty(false);
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save the blueprint.");
    } finally {
      setSaving(false);
    }
  }

  async function forgeStory(): Promise<void> {
    if (!setupSupportsStatMode(setupState, statMode)) {
      navigate("setup", { returnTo: "blueprint", setupReason: "new-story" });
      return;
    }
    if (entitlement && !entitlement.canCreateStory) {
      setSaveError("Your trial has ended. Add a license in Settings to create another story.");
      return;
    }
    const finalTitle = title.trim() || blueprint.name?.trim() || "Untitled story";
    // Name comes from the persona first; fall back to any draft value, then a neutral default so a
    // no-persona story still has a player name.
    const finalPlayer = selectedPersona?.name.trim() || playerName.trim() || "You";
    const finalPremise = premise.trim() || blueprint.scenario?.trim() || blueprint.description?.trim() || "";
    if (!finalPremise || !statMode) {
      setSaveError("Add a premise and choose No Stats or Full Stats before creating the story.");
      return;
    }
    if (!selectedPersona && !continueWithoutPersona) {
      setSaveError(
        "Select and review the correct persona, or explicitly acknowledge continuing without one."
      );
      return;
    }
    setSaving(true);
    forgeStartedAt.current = Date.now();
    setElapsedSeconds(0);
    setSaveError(undefined);
    const controller = new AbortController();
    forgeController.current = controller;
    try {
      const retained = retainedForgeRef.current;
      const request = retained?.request ?? forgeCreateRequest({
        storyId: globalThis.crypto?.randomUUID?.() ?? `story-${Date.now()}`,
        title: finalTitle,
        playerName: finalPlayer,
        premise: finalPremise,
        statMode,
        ...(selectedPersona ? { persona: selectedPersona } : {}),
        blueprint,
        openingMessage: selectedOpening || blueprint.firstMessage,
        lorebookSeeds: storedDraft?.importedCard?.lorebook,
        sourceCard: storedDraft?.importedCard?.sourceCard,
        importedMechanics: storedDraft?.importedCard?.importedMechanics,
        acceptImportedMechanics: Boolean(storedDraft?.importedCard?.importedMechanics),
      });
      const operationId = retained?.operationId ?? request.storyId!;
      const startedAt = retained?.startedAt ?? Date.now();
      const initialOperation: ForgeOperationRecord = {
        version: 1,
        operationId,
        kind: "story-create",
        storyId: request.storyId ?? operationId,
        status: "running",
        phase: retained?.phase ?? "phase-a",
        attempt: retained?.attempt ?? 1,
        elapsedMs: retained?.elapsedMs ?? 0,
        detail: retained?.detail ?? "Forge request accepted.",
        startedAt,
        updatedAt: Date.now(),
        ...(retained?.checkpoint ? { checkpoint: retained.checkpoint } : {}),
        request,
      };
      retainedForgeRef.current = initialOperation;
      setRetainedForge(initialOperation);
      forgeWriteQueue.current = getBridge().saveForgeOperation(initialOperation);
      await forgeWriteQueue.current;
      const persistPatch = (patch: Partial<ForgeOperationRecord>): void => {
        const current = retainedForgeRef.current;
        if (!current) return;
        const next = { ...current, ...patch, updatedAt: Date.now() };
        retainedForgeRef.current = next;
        setRetainedForge(next);
        forgeWriteQueue.current = forgeWriteQueue.current
          .catch(() => undefined)
          .then(() => getBridge().saveForgeOperation(next));
      };
      const result = await createStory({
        ...request,
        resume: retained?.checkpoint,
        onCheckpoint: (checkpoint: BootstrapResumeState) => {
          persistPatch({ checkpoint, detail: "Validated fragment retained." });
        },
        onProgress: (phase) => {
          setProgressPhase(phase);
          setProgress(PHASE_LABEL[phase]);
          persistPatch({
            phase,
            status: phase === "repair" ? "degraded" : "running",
            detail: PHASE_LABEL[phase],
            elapsedMs: Date.now() - startedAt,
          });
        },
        onProgressDetail: (event: BootstrapProgressEvent) => {
          setProgressPhase(event.phase);
          setProgress(event.message);
          setElapsedSeconds(Math.floor(event.elapsedMs / 1000));
          persistPatch({
            phase: event.phase,
            status:
              event.status === "retrying"
                ? "degraded"
                : event.status === "cancelled"
                  ? "cancelled"
                  : event.status === "failed"
                    ? "failed"
                    : "running",
            attempt: event.attempt,
            elapsedMs: event.elapsedMs,
            detail: event.message,
          });
        },
        signal: controller.signal,
      });
      await forgeWriteQueue.current.catch(() => undefined);
      await getBridge().clearForgeOperation(operationId).catch(() => undefined);
      retainedForgeRef.current = undefined;
      setRetainedForge(undefined);
      clearDraft();
      navigate("play", { storyId: result.story.id });
    } catch (err) {
      const current = retainedForgeRef.current;
      if (current) {
        const failed = {
          ...current,
          status: controller.signal.aborted
            ? ("cancelled" as const)
            : String(err).toLowerCase().includes("timeout")
              ? ("timed-out" as const)
              : ("failed" as const),
          detail: controller.signal.aborted
            ? "Cancellation acknowledged; completed fragments retained."
            : err instanceof Error
              ? err.message
              : String(err),
          elapsedMs: Date.now() - current.startedAt,
          updatedAt: Date.now(),
        };
        retainedForgeRef.current = failed;
        setRetainedForge(failed);
        await forgeWriteQueue.current.catch(() => undefined);
        forgeWriteQueue.current = getBridge().saveForgeOperation(failed);
        await forgeWriteQueue.current;
      }
      setSaveError(
        controller.signal.aborted
          ? "Forging was cancelled. Your blueprint is still here and ready to retry."
          : err instanceof Error
            ? err.message
            : "Couldn't forge this story."
      );
    } finally {
      if (forgeController.current === controller) forgeController.current = undefined;
      setSaving(false);
      setProgress(undefined);
      setProgressPhase(undefined);
    }
  }

  function cancelForge(): void {
    if (!forgeController.current) return;
    diagnosticsLogger.info("story.forge.cancel.requested");
    setProgress("Cancelling the provider request…");
    forgeController.current.abort();
  }

  if (state.phase === "loading") {
    return <div data-testid="blueprint-loading" aria-label="Loading blueprint" style={CENTERED}>Loading blueprint…</div>;
  }
  if (state.phase === "error") {
    return <div style={{ padding: "34px 42px", maxWidth: 760 }}><InlineNotice severity="error" title="Couldn't load the blueprint" detail={state.message} /></div>;
  }

  return (
    <div style={{ padding: "34px 42px 90px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={HEADER_ROW}>
          <div>
            <div style={KICKER}>{creating ? "NEW STORY · BLUEPRINT" : "STORY BLUEPRINT"}</div>
            <h1 style={H1}>{creating ? "Begin your story" : "Story blueprint"}</h1>
          </div>
          <button
            type="button"
            onClick={() => navigate(storyId ? "play" : "library", storyId ? { storyId } : {})}
            style={BACK}
          >
            ← {storyId ? "Back to story" : "Back to library"}
          </button>
        </div>
        <p style={LEAD}>
          Configure identity, scenario, greetings, example dialogue, system prompt, post-history
          instructions, prose style, and metadata before the Story AI creates mechanics.
        </p>

        {creating ? (
          <section style={PANEL}>
            <div style={SECTION_HEAD}>FOUNDATION</div>
            <label style={LABEL}>Story title<input aria-label="Story title" value={title} onChange={(event) => setTitle(event.target.value)} style={INPUT} /></label>
            {/* No separate "your name" field — the player's name comes from the chosen persona below. */}
            <div style={{ marginBottom: 14 }}>
              <label style={LABEL}>
                Persona for story creation
                {personas.length > 0 ? (
                  <select
                    aria-label="Persona for story creation"
                    value={personaId}
                    onChange={(event) => {
                      setPersonaId(event.target.value);
                      if (event.target.value) setContinueWithoutPersona(false);
                    }}
                    style={INPUT}
                  >
                    <option value="">No persona selected</option>
                    {personas.map((persona) => (
                      <option key={persona.id} value={persona.id}>
                        {persona.name}{persona.isDefault ? " (default)" : ""}
                      </option>
                    ))}
                  </select>
                ) : null}
              </label>
              {selectedPersona ? (
                <InlineNotice
                  severity="success"
                  title={`${selectedPersona.name} is attached`}
                  detail={`${selectedPersona.description} Review this carefully: the exact persona shapes the player's identity, attributes, learned skills, and available abilities.`}
                />
              ) : personaLoadState === "loading" ? (
                <InlineNotice
                  severity="info"
                  title="Loading personas"
                  detail="Story creation will wait until the persona choice can be reviewed."
                />
              ) : (
                <>
                  <InlineNotice
                    severity="warn"
                    title={personaLoadState === "error" ? "Personas could not be loaded" : "No persona is attached"}
                    detail="The player character depends heavily on this choice. Select the correct persona before forging, or explicitly accept the reduced context."
                  />
                  <label style={{ ...LABEL, display: "flex", flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 9 }}>
                    <input
                      type="checkbox"
                      checked={continueWithoutPersona}
                      onChange={(event) => setContinueWithoutPersona(event.target.checked)}
                    />
                    I understand and want to continue without a persona.
                  </label>
                </>
              )}
              <Button variant="ghost" onClick={() => navigate("personas")}>
                {personas.length > 0 ? "Manage personas" : "Create a persona"}
              </Button>
            </div>
            <label style={LABEL}>
              Premise
              <textarea aria-label="Premise" value={premise} onChange={(event) => setPremise(event.target.value)} style={{ ...INPUT, minHeight: 120, resize: "vertical" }} />
            </label>
            <fieldset style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
              <legend style={LABEL}>Stat system</legend>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                <button
                  type="button"
                  aria-pressed={statMode === "none"}
                  onClick={() => setStatMode("none")}
                  style={{ ...MODE_CARD, ...(statMode === "none" ? MODE_CARD_ACTIVE : {}) }}
                >
                  <strong>No Stats</strong>
                  <span style={MODE_COPY}>Pure prose. Only the Narrator runs; no rolls, rulings, skills, or attributes.</span>
                </button>
                <button
                  type="button"
                  aria-pressed={statMode === "full"}
                  onClick={() => setStatMode("full")}
                  style={{ ...MODE_CARD, ...(statMode === "full" ? MODE_CARD_ACTIVE : {}) }}
                >
                  <strong>Full Stats</strong>
                  <span style={MODE_COPY}>Attributes, skills, deterministic checks, progression, inventory, and rulings.</span>
                </button>
              </div>
            </fieldset>
            {storedDraft?.importedCard ? (
              <InlineNotice
                severity="info"
                title={`Imported ${storedDraft.importedCard.name}`}
                detail={`${storedDraft.importedCard.openings.length} openings and ${storedDraft.importedCard.lorebook.length} lore entries are ready to install.`}
              />
            ) : null}
          </section>
        ) : null}

        <BlueprintForm
          value={blueprint}
          onChange={(next) => {
            setBlueprint(next);
            setDirty(true);
            setSaved(false);
          }}
        />

        {creating && openings.length > 0 ? (
          <section style={PANEL}>
            <div style={SECTION_HEAD}>CHOOSE THE OPENING</div>
            <select
              aria-label="Opening message"
              value={selectedOpening || openings[0]}
              onChange={(event) => setSelectedOpening(event.target.value)}
              style={INPUT}
            >
              {openings.map((opening, index) => (
                <option key={`${index}-${opening.slice(0, 20)}`} value={opening}>
                  {index === 0 ? "Primary" : `Alternate ${index}`} · {opening.slice(0, 90)}
                </option>
              ))}
            </select>
          </section>
        ) : null}

        {saveError ? <div style={{ marginTop: 18 }}><InlineNotice severity="error" title={creating ? "Couldn't forge story" : "Couldn't save"} detail={saveError} /></div> : null}
        {creating && retainedForge && !saving ? (
          <div style={{ marginTop: 18 }}>
            <InlineNotice
              severity={retainedForge.status === "failed" || retainedForge.status === "timed-out" ? "warn" : "info"}
              title="A retained Forge can resume"
              detail={retainedForge.detail ?? "Validated fragments were kept safely."}
            />
            <Button
              variant="ghost"
              onClick={() => {
                const operationId = retainedForgeRef.current?.operationId;
                retainedForgeRef.current = undefined;
                setRetainedForge(undefined);
                setProgress(undefined);
                setProgressPhase(undefined);
                if (operationId) void getBridge().clearForgeOperation(operationId);
              }}
            >
              Discard retained forge
            </Button>
          </div>
        ) : null}
        {progress ? (
          <div style={{ ...FORGE_PROGRESS, marginTop: 18 }} aria-busy="true" aria-live="polite" data-testid="forge-progress">
            <div style={FORGE_PROGRESS_HEAD}>
              <span style={FORGE_SPINNER} aria-hidden="true">◌</span>
              <div>
                <strong style={{ color: "var(--teal)" }}>Forging your world</strong>
                <div style={{ color: "var(--secondary)", marginTop: 3 }}>{progress}</div>
              </div>
              <span className="mono" style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 11 }}>{elapsedSeconds}s elapsed</span>
            </div>
            <div style={{ color: "var(--muted)", fontSize: 11.5, marginTop: 10 }}>
              The provider is still working. Detailed worlds can take a few minutes; you can safely cancel and retry.
            </div>
            <div style={FORGE_STAGES}>
              {(statMode === "none" ? ["validate", "freeze", "install"] : ["phase-a", "phase-b", "validate", "freeze", "install"]).map((phase) => {
                const phases = statMode === "none" ? ["validate", "freeze", "install"] : ["phase-a", "phase-b", "validate", "freeze", "install"];
                const currentIndex = progressPhase ? phases.indexOf(progressPhase) : 0;
                const index = phases.indexOf(phase);
                return <span key={phase} style={{ color: index < currentIndex ? "var(--success)" : index === currentIndex ? "var(--teal)" : "var(--muted)" }}>{index < currentIndex ? "✓" : index === currentIndex ? "●" : "○"}</span>;
              })}
            </div>
          </div>
        ) : null}

        <div style={ACTIONS}>
          <Button
            variant="primary"
            disabled={
              saving ||
              (!creating && !dirty) ||
              (creating && !selectedPersona && !continueWithoutPersona)
            }
            title={
              creating && !selectedPersona && !continueWithoutPersona
                ? "Select a persona or acknowledge continuing without one"
                : undefined
            }
            onClick={() => void (creating ? forgeStory() : saveExisting())}
          >
            {saving
              ? (progress ?? "Saving…")
              : creating
                ? retainedForge
                  ? "Resume retained forge"
                  : "Forge this world →"
                : "Save blueprint"}
          </Button>
          {creating && saving ? <Button variant="ghost" onClick={cancelForge}>Cancel forge</Button> : null}
          {!creating && dirty ? <span style={DIRTY}>Unsaved changes</span> : null}
        </div>
      </div>
      {saved ? <Toast severity="info" title="Blueprint saved" onDismiss={() => setSaved(false)} /> : null}
    </div>
  );
}

const PHASE_LABEL = {
  "phase-a": "Drafting the rules and world schema…",
  "phase-b": "Creating the cast and starting state…",
  repair: "Correcting the model's structured response…",
  validate: "Checking the world for contradictions…",
  freeze: "Locking the mechanical rules…",
  install: "Installing the opening scene…",
} as const;

const CENTERED: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", padding: 80, color: "var(--muted)" };
const HEADER_ROW: CSSProperties = { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 4 };
const KICKER: CSSProperties = { color: "var(--teal)", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", marginBottom: 7 };
const H1: CSSProperties = { fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 30, color: "var(--prose)", margin: 0 };
const LEAD: CSSProperties = { fontFamily: "var(--font-ui)", fontSize: 13.5, color: "var(--secondary)", lineHeight: 1.6, margin: "0 0 22px", maxWidth: 720 };
const BACK: CSSProperties = { background: "none", border: 0, color: "var(--secondary)", cursor: "pointer", fontSize: 12.5 };
const PANEL: CSSProperties = { background: "var(--bg1-panel)", border: "1px solid var(--hairline)", borderRadius: "var(--radius-card)", padding: "15px 16px", marginBottom: 14 };
const SECTION_HEAD: CSSProperties = { color: "var(--teal)", fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.13em", marginBottom: 12 };
const LABEL: CSSProperties = { display: "block", color: "var(--secondary)", fontFamily: "var(--font-ui)", fontSize: 12, marginBottom: 12 };
const INPUT: CSSProperties = { display: "block", width: "100%", boxSizing: "border-box", marginTop: 5, padding: "9px 10px", color: "var(--ui-text)", background: "var(--bg3-raised)", border: "1px solid var(--hairline)", borderRadius: "var(--radius-chip)", fontFamily: "var(--font-ui)" };
const ACTIONS: CSSProperties = { display: "flex", alignItems: "center", gap: 12, marginTop: 22 };
const DIRTY: CSSProperties = { fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--muted)" };
const MODE_CARD: CSSProperties = { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, padding: 13, color: "var(--secondary)", background: "var(--bg3-raised)", border: "1px solid var(--hairline)", borderRadius: "var(--radius-chip)", cursor: "pointer", textAlign: "left", fontFamily: "var(--font-ui)" };
const MODE_CARD_ACTIVE: CSSProperties = { color: "var(--ui-text)", borderColor: "var(--teal)", background: "var(--teal-tint)" };
const MODE_COPY: CSSProperties = { fontSize: 11.5, lineHeight: 1.45, color: "var(--secondary)" };
const FORGE_PROGRESS: CSSProperties = { padding: 16, borderRadius: "var(--radius-card)", border: "1px solid var(--teal)", background: "var(--teal-tint)", fontFamily: "var(--font-ui)" };
const FORGE_PROGRESS_HEAD: CSSProperties = { display: "flex", alignItems: "center", gap: 11 };
const FORGE_SPINNER: CSSProperties = { display: "inline-flex", width: 24, height: 24, alignItems: "center", justifyContent: "center", color: "var(--teal)", fontSize: 24, animation: "mt-spin 1.2s linear infinite" };
const FORGE_STAGES: CSSProperties = { display: "flex", gap: 12, marginTop: 12, fontFamily: "var(--font-mono)", fontSize: 12 };

export default StoryBlueprint;
