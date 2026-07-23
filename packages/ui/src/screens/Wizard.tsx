/**
 * Wizard — the new-story flow: PremiseInput → forge (ForgingInterstitial with a step list that
 * checks off) → enter Play. Ported from Design/handoff/screens/Wizard.dc.html and the Library
 * prototype's premise/forge overlays (the "Demo" chip row is dropped). The Wizard is a full-bleed
 * screen, not a modal, so it owns its own centered layout.
 *
 * Flow / state matrix (§02 + flagship flow 1):
 *   • premise    — the protagonist name + PremiseInput + seed suggestions; gated by entitlement.
 *   • gated      — expired trial + no license blocks creation; show the upsell instead of the form.
 *   • forging    — ForgingInterstitial; steps advance from `onProgress`, driven off `store.forging`.
 *   • error      — three families surfaced during forge: provider-auth · model-output · network,
 *                  each naming the role/resource and the fix (retry / open Settings).
 *   • done       — navigate to Play with the new storyId.
 *
 * Wiring: `useStoriesStore.create(args)` forges via the bridge; `useSettingsStore().entitlement`
 * gates creation. Nav via `useRoute().navigate`. Token variables only; honors reduced-motion
 * through the components' own hooks.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { EMPTY_STORY_DRAFT, useStoriesStore } from "../state/storiesStore";
import { useSettingsStore } from "../state/settingsStore";
import { useRoute } from "../state/uiStore";
import { getBridge } from "../bridge/core";
import type {
  BootstrapProgressEvent,
  BootstrapResumeState,
  PersonaRecord,
} from "../bridge/core";
import {
  Button,
  PremiseInput,
  ForgingInterstitial,
  InlineNotice,
  Chip,
  StoryCreationReview,
  STANDARD_DIFFICULTY,
} from "../components";
import type {
  DifficultyValue,
  ForgeOperationState,
  ForgeStep,
  ForgeStepStatus,
  MacroReview,
  MechanicSourceReview,
} from "../components";
import type { ScreenProps } from "./registry";

/** The forge phases the bridge streams via `onProgress`, mapped to human step labels. */
const FORGE_PHASES = ["phase-a", "repair", "phase-b", "validate", "freeze", "install"] as const;
type ForgePhase = (typeof FORGE_PHASES)[number];

const STEP_LABELS: Record<ForgePhase, string> = {
  "phase-a": "Reading premise, card, and persona cues",
  repair: "Correcting the model's structured response",
  "phase-b": "Defining attributes, skills, resources, and story actions",
  validate: "Validating every mechanic and reference",
  freeze: "Sealing the versioned rulebook",
  install: "Placing characters and opening the scene",
};

const FORGE_RESUME_KEY = "midnight-tavern:v7-forge-resume";

interface ForgeResumeEnvelope {
  storyId: string;
  checkpoint: BootstrapResumeState;
}

function readForgeResume(): ForgeResumeEnvelope | undefined {
  try {
    const raw = globalThis.sessionStorage?.getItem(FORGE_RESUME_KEY);
    return raw ? (JSON.parse(raw) as ForgeResumeEnvelope) : undefined;
  } catch {
    return undefined;
  }
}

function persistForgeResume(value: ForgeResumeEnvelope | undefined): void {
  try {
    if (value) globalThis.sessionStorage?.setItem(FORGE_RESUME_KEY, JSON.stringify(value));
    else globalThis.sessionStorage?.removeItem(FORGE_RESUME_KEY);
  } catch {
    // Resume is a reliability enhancement; restricted browser storage must not block forging.
  }
}

/** The three error families forging can fail with, each with a named cause + fix. */
type ForgeErrorKind = "provider-auth" | "model-output" | "network";
interface ForgeError {
  kind: ForgeErrorKind;
  message: string;
}

function classifyError(err: unknown): ForgeError {
  const msg = err instanceof Error ? err.message : String(err);
  const low = msg.toLowerCase();
  if (low.includes("key") || low.includes("auth") || low.includes("401") || low.includes("unauthor")) {
    return { kind: "provider-auth", message: msg };
  }
  if (low.includes("network") || low.includes("timeout") || low.includes("fetch") || low.includes("reach")) {
    return { kind: "network", message: msg };
  }
  return { kind: "model-output", message: msg };
}

/** Premise seed suggestions (lifted verbatim from the Library prototype). */
const SEEDS: { label: string; text: string }[] = [
  {
    label: "Ash-buried pilgrim road",
    text: "A courier crosses an ash-buried mountain road where pilgrims vanish near a ruined monastery, and a dead cult stirs beneath the ossuary.",
  },
  {
    label: "Drowned city returns",
    text: "A drowned city surfaces once a generation to collect on old bargains, and it has come for one your family made.",
  },
  {
    label: "Debt across a cruel desert",
    text: "A caravan-master smuggles forbidden cargo across a desert that remembers every soul who has ever crossed it.",
  },
];

export function Wizard(_props: ScreenProps): JSX.Element {
  const create = useStoriesStore((s) => s.create);
  const forging = useStoriesStore((s) => s.forging);
  const storyDraft = useStoriesStore((s) => s.draft) ?? EMPTY_STORY_DRAFT;
  const setDraft = useStoriesStore((s) => s.setDraft);
  const entitlement = useSettingsStore((s) => s.entitlement);
  const { navigate } = useRoute();

  const [playerName, setPlayerName] = useState(storyDraft.playerName ?? "");
  const [premise, setPremise] = useState(storyDraft.premise ?? "");
  const [wizardStep, setWizardStep] = useState<"premise" | "review">("premise");
  const [statMode, setStatMode] = useState<"none" | "full">(storyDraft.statMode ?? "full");
  const [difficulty, setDifficulty] = useState<DifficultyValue>(STANDARD_DIFFICULTY);
  const [actionBudget, setActionBudget] = useState(2);
  const [continueWithoutPersona, setContinueWithoutPersona] = useState(
    storyDraft.continueWithoutPersona ?? false
  );
  const [phase, setPhase] = useState<ForgePhase | undefined>(undefined);
  const [error, setError] = useState<ForgeError | undefined>(undefined);
  const [forgeState, setForgeState] = useState<ForgeOperationState>("running");
  const [elapsed, setElapsed] = useState(0);
  const [lastProgressEvent, setLastProgressEvent] = useState<string>();
  const [progressAttempt, setProgressAttempt] = useState(1);
  const [resumeEnvelope, setResumeEnvelope] = useState<ForgeResumeEnvelope | undefined>(
    readForgeResume
  );
  const forgeStoryId = useRef(
    resumeEnvelope?.storyId ?? globalThis.crypto?.randomUUID?.() ?? `story-${Date.now()}`
  );
  const forgeAbort = useRef<AbortController>();
  // Optional persona pick (v2 §4); "" ⇒ use the global default persona.
  const [personas, setPersonas] = useState<PersonaRecord[]>([]);
  const [personaId, setPersonaId] = useState(storyDraft.personaId ?? "");
  const [personaLoadState, setPersonaLoadState] = useState<"loading" | "ready" | "error">(
    "loading"
  );

  useEffect(() => {
    let cancelled = false;
    void getBridge()
      .listPersonas()
      .then((ps) => {
        if (!cancelled) {
          setPersonas(ps);
          setPersonaId((current) => {
            if (current && ps.some((persona) => persona.id === current)) return current;
            const sensibleDefault =
              ps.find((persona) => persona.isDefault) ?? (ps.length === 1 ? ps[0] : undefined);
            return sensibleDefault?.id ?? "";
          });
          setPersonaLoadState("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setPersonaLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const persistedPersonaId = personaId || undefined;
    if (
      storyDraft.personaId === persistedPersonaId &&
      Boolean(storyDraft.continueWithoutPersona) === continueWithoutPersona
    ) {
      return;
    }
    const nextDraft = { ...storyDraft };
    if (persistedPersonaId) nextDraft.personaId = persistedPersonaId;
    else delete nextDraft.personaId;
    if (continueWithoutPersona) nextDraft.continueWithoutPersona = true;
    else delete nextDraft.continueWithoutPersona;
    setDraft(nextDraft);
  }, [continueWithoutPersona, personaId, setDraft, storyDraft]);

  useEffect(() => {
    if (!forging && !phase) return;
    const started = Date.now() - elapsed * 1000;
    const timer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - started) / 1000);
      setElapsed(seconds);
      setForgeState((current) => current === "running" && seconds >= 30 ? "slow" : current);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [forging, phase]);

  // Default to allowing creation while entitlement loads; only an expired trial blocks it.
  const canCreate = entitlement ? entitlement.canCreateStory : true;
  const trimmedPremise = premise.trim();
  const selectedPersona = personas.find((persona) => persona.id === personaId);
  const macroReview = useMemo(() => inspectMacros([
    ["Premise", premise],
    ["Imported card", storyDraft.importedCard?.premise ?? ""],
    ["Opening", storyDraft.selectedOpening ?? ""],
  ]), [premise, storyDraft.importedCard, storyDraft.selectedOpening]);
  const mechanicReview = useMemo(() => mechanicsFromDraft(storyDraft.importedCard), [storyDraft.importedCard]);
  const reviewBlocked =
    (statMode === "full" && macroReview.some((macro) => macro.state === "blocking")) ||
    (!selectedPersona && !continueWithoutPersona);
  const forgeDisabled = trimmedPremise.length < 12 || forging || reviewBlocked;

  const runForge = async (): Promise<void> => {
    if (forgeDisabled) return;
    setError(undefined);
    setPhase("phase-a");
    setForgeState("running");
    setElapsed(0);
    setLastProgressEvent("Forge request accepted");
    const abort = new AbortController();
    forgeAbort.current = abort;
    try {
      const result = await create({
        storyId: forgeStoryId.current,
        title: deriveTitle(trimmedPremise),
        premise: trimmedPremise,
        playerName: playerName.trim() || selectedPersona?.name.trim() || "You",
        statMode,
        blueprint: storyDraft.blueprint,
        openingMessage: storyDraft.selectedOpening,
        lorebookSeeds: storyDraft.importedCard?.lorebook,
        sourceCard: storyDraft.importedCard?.sourceCard,
        importedMechanics: storyDraft.importedCard?.importedMechanics,
        acceptImportedMechanics: Boolean(storyDraft.importedCard?.importedMechanics),
        persona: selectedPersona,
        difficulty,
        actionBudget,
        signal: abort.signal,
        resume: resumeEnvelope?.checkpoint,
        onCheckpoint: (checkpoint: BootstrapResumeState) => {
          const envelope = { storyId: forgeStoryId.current, checkpoint };
          setResumeEnvelope(envelope);
          persistForgeResume(envelope);
        },
        onProgress: (rawPhase: ForgePhase) => {
          const p = FORGE_PHASES.includes(rawPhase) ? rawPhase : undefined;
          if (p) setPhase(p);
          setForgeState(p === "repair" ? "degraded" : "running");
          setLastProgressEvent(p ? STEP_LABELS[p] : "Progress event received");
        },
        onProgressDetail: (event: BootstrapProgressEvent) => {
          if (FORGE_PHASES.includes(event.phase as ForgePhase)) {
            setPhase(event.phase as ForgePhase);
          }
          setProgressAttempt(event.attempt);
          setElapsed(Math.floor(event.elapsedMs / 1000));
          setForgeState(
            event.status === "retrying"
              ? "degraded"
              : event.status === "cancelled"
                ? "cancelled"
                : "running"
          );
          setLastProgressEvent(event.message);
        },
      });
      persistForgeResume(undefined);
      setResumeEnvelope(undefined);
      setForgeState("completed");
      navigate("play", { storyId: result.story.id });
    } catch (err) {
      if (abort.signal.aborted) {
        setForgeState("cancelled");
        setLastProgressEvent("Cancellation acknowledged; completed fragments retained");
        return;
      }
      setError(classifyError(err));
      setForgeState(String(err).toLowerCase().includes("timeout") ? "timed-out" : "failed");
    }
  };

  // ── Gated: expired trial with no license ─────────────────────────────────
  if (!canCreate) {
    return (
      <div style={styles.screen}>
        <div style={styles.card}>
          <div className="mono" style={styles.kicker}>
            NEW STORY
          </div>
          <h1 style={styles.title}>Your trial has ended</h1>
          <p style={styles.lede}>
            Reading every story on your shelf stays open forever. Forging a new world — and playing on — needs a
            license.
          </p>
          <div style={styles.gateActions}>
            <Button variant="primary" onClick={() => navigate("settings")}>
              Enter a license key
            </Button>
            <Button variant="ghost" onClick={() => navigate("library")}>
              Back to the shelf
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Forging interstitial ─────────────────────────────────────────────────
  if (forging || phase) {
    const steps = buildSteps(phase, error?.kind ? phase : undefined, forgeState);
    return (
      <div style={styles.screen}>
        <div style={styles.card}>
          <ForgingInterstitial
            title={statMode === "none" ? "Opening your story" : "Forging your story"}
            steps={steps}
            operationState={forgeState}
            elapsedSeconds={elapsed}
            activeSubstep={phase ? STEP_LABELS[phase] : undefined}
            attempt={progressAttempt}
            lastEvent={lastProgressEvent}
            onCancel={() => forgeAbort.current?.abort()}
            onRetry={() => void runForge()}
            onResume={() => {
              setForgeState("running");
              void runForge();
            }}
          />
          {error ? <ForgeErrorNotice error={error} onRetry={() => void runForge()} onSettings={() => navigate("settings")} /> : null}
          {forgeState === "cancelled" ? (
            <div style={{ display: "flex", justifyContent: "center" }}>
              <Button variant="secondary" onClick={() => { setPhase(undefined); setWizardStep("review"); }}>
                Return to review
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (wizardStep === "review") {
    return (
      <div style={{ ...styles.screen, alignItems: "flex-start" }}>
        <div style={{ ...styles.card, width: 900 }}>
          <div className="mono" style={styles.kicker}>NEW STORY · REVIEW BEFORE FORGE</div>
          <h1 style={styles.title}>Review the world and your role</h1>
          <p style={styles.lede}>These choices become part of the sealed rulebook. Runtime loot is generated only when a DM Ruling awards it; no item catalog or starting gear is forged here.</p>
          <StoryCreationReview
            persona={selectedPersona}
            continueWithoutPersona={continueWithoutPersona}
            onContinueWithoutPersona={setContinueWithoutPersona}
            onChangePersona={() => setWizardStep("premise")}
            onEditPersona={() => navigate("personas", selectedPersona ? { personaId: selectedPersona.id } : {})}
            mechanics={mechanicReview}
            macros={macroReview}
            statMode={statMode}
            onStatModeChange={setStatMode}
            difficulty={difficulty}
            onDifficultyChange={setDifficulty}
            actionBudget={actionBudget}
            onActionBudgetChange={setActionBudget}
          />
          <div style={styles.footer}>
            <Button variant="ghost" onClick={() => setWizardStep("premise")}>← Back</Button>
            <Button variant="primary" onClick={() => void runForge()} disabled={forgeDisabled} title={reviewBlocked ? "Resolve the persona or macro warning first" : undefined}>
              {statMode === "none" ? "Open this story →" : "Forge this world →"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Premise entry ────────────────────────────────────────────────────────
  return (
    <div style={styles.screen}>
      <div style={styles.card}>
        <div className="mono" style={styles.kicker}>
          NEW STORY · PREMISE
        </div>
        <h1 style={styles.title}>What world shall we forge?</h1>
        <p style={styles.lede}>
          Describe the premise in a sentence or a page. On the next screen you will confirm your persona,
          imported mechanics, macro compatibility, difficulty, and action budget before anything is forged.
        </p>

        {error ? <ForgeErrorNotice error={error} onRetry={() => void runForge()} onSettings={() => navigate("settings")} /> : null}

        <div style={styles.nameField}>
          <label className="mono" style={styles.fieldLabel} htmlFor="wizard-player-name">
            YOUR NAME IN THE STORY
          </label>
          <input
            id="wizard-player-name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Kestrel Vane"
            style={styles.nameInput}
          />
        </div>

        <div style={styles.nameField}>
          <label className="mono" style={styles.fieldLabel} htmlFor="wizard-persona">
            PLAY AS - PERSONA
          </label>
          {personas.length > 0 ? (
            <select
              id="wizard-persona"
              value={personaId}
              onChange={(e) => {
                setPersonaId(e.target.value);
                if (e.target.value) setContinueWithoutPersona(false);
              }}
              style={{ ...styles.nameInput, fontFamily: "var(--font-ui)", fontSize: 14 }}
            >
              <option value="">No persona selected</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.isDefault ? " (default)" : ""}
                </option>
              ))}
            </select>
          ) : null}
          {selectedPersona ? (
            <InlineNotice
              severity="success"
              title={`${selectedPersona.name} is attached`}
              detail={`${selectedPersona.description} This exact persona will shape the player character's identity, attributes, learned skills, and available abilities.`}
            />
          ) : personaLoadState === "loading" ? (
            <InlineNotice
              severity="info"
              title="Loading personas"
              detail="The forge will wait for persona review before it can begin."
            />
          ) : (
            <InlineNotice
              severity="warn"
              title={personaLoadState === "error" ? "Personas could not be loaded" : "Attach a persona before forging"}
              detail="Your player character depends heavily on this choice. Create or select the correct persona, or explicitly acknowledge continuing without one on the review screen."
            />
          )}
          <button type="button" onClick={() => navigate("personas")} style={styles.configLink}>
            {personas.length > 0 ? "Manage personas" : "Create a persona"}
          </button>
        </div>

        <PremiseInput
          value={premise}
          onChange={setPremise}
          onSubmit={() => {
            if (trimmedPremise.length >= 12) setWizardStep("review");
          }}
          label="Your premise"
          placeholder="A courier crosses an ash-buried mountain road where pilgrims have begun to vanish near a ruined monastery…"
        />

        <div style={styles.seeds}>
          <span className="mono" style={styles.seedsLabel}>
            Try:
          </span>
          {SEEDS.map((sd) => (
            <Chip key={sd.label} tone="keyword" onClick={() => setPremise(sd.text)} title={sd.text}>
              {sd.label}
            </Chip>
          ))}
        </div>

        <div style={styles.configRow}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            The storyteller uses your model role matrix.
          </span>
          <button type="button" onClick={() => navigate("rolematrix")} style={styles.configLink}>
            Configure models →
          </button>
        </div>

        <div style={styles.footer}>
          <Button variant="ghost" onClick={() => navigate("library")}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => setWizardStep("review")} disabled={trimmedPremise.length < 12 || forging} title={trimmedPremise.length < 12 ? "Write a little more of the premise first" : undefined}>
            Review before forge →
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Map the current forge phase onto the step list; the errored phase (if any) shows as `error`. */
function buildSteps(phase: ForgePhase | undefined, erroredPhase: ForgePhase | undefined, operationState: ForgeOperationState = "running"): ForgeStep[] {
  const currentIdx = phase ? FORGE_PHASES.indexOf(phase) : -1;
  return FORGE_PHASES.map((p, i) => {
    let status: ForgeStepStatus;
    if (erroredPhase && p === erroredPhase) status = "error";
    else if (i < currentIdx) status = "done";
    else if (i === currentIdx) status = operationState === "cancelled" || operationState === "resumable" ? "paused" : "active";
    else status = "pending";
    return { label: STEP_LABELS[p], status };
  });
}

/** A forge error card that names the role/resource and the fix (§02 three error families). */
function ForgeErrorNotice(props: { error: ForgeError; onRetry: () => void; onSettings: () => void }): JSX.Element {
  const { error, onRetry, onSettings } = props;
  const copy = ERROR_COPY[error.kind];
  return (
    <div style={{ marginBottom: 18 }} data-testid="wizard-error" data-kind={error.kind}>
      <InlineNotice severity="error" title={copy.title} detail={copy.detail} />
      <div style={styles.errorActions}>
        {error.kind === "provider-auth" ? (
          <Button variant="system" onClick={onSettings}>
            Open Settings →
          </Button>
        ) : (
          <Button variant="system" onClick={onRetry}>
            Try forging again
          </Button>
        )}
      </div>
    </div>
  );
}

const ERROR_COPY: Record<ForgeErrorKind, { title: string; detail: string }> = {
  "provider-auth": {
    title: "The Bootstrapper couldn’t reach your model",
    detail: "Your provider key was rejected. Check it in Settings, then forge again.",
  },
  "model-output": {
    title: "The Bootstrapper returned an unusable rulebook",
    detail: "The model’s reply didn’t validate into a story schema. Try again, or pick a recommended model in Settings.",
  },
  network: {
    title: "Couldn’t reach the provider",
    detail: "The request failed on the way out. Check your connection and forge again.",
  },
};

/** Derive a short story title from the premise's first clause (the real title comes from core). */
function deriveTitle(premise: string): string {
  const firstClause = premise.split(/[.,;—]/)[0]?.trim() ?? premise;
  const words = firstClause.split(/\s+/).slice(0, 6).join(" ");
  return words.length > 0 ? words.replace(/^\w/, (c) => c.toUpperCase()) : "Untitled story";
}

const BUILTIN_MACROS = new Set([
  "user", "char", "persona", "description", "scenario", "personality", "mesexamples",
  "system", "wiBefore", "wiAfter", "charPrompt", "charJailbreak", "original", "input",
  "lastMessage", "lastCharMessage", "lastUserMessage", "time", "date", "weekday", "isotime",
  "isodate", "idle_duration", "random", "roll", "pick", "trim", "newline", "noop",
]);

function inspectMacros(fields: Array<readonly [string, string]>): MacroReview[] {
  const review: MacroReview[] = [];
  for (const [field, text] of fields) {
    const tokens = text.match(/\{\{[^{}]*\}\}/g) ?? [];
    for (const token of tokens) {
      const body = token.slice(2, -2).trim();
      const name = body.split(/[:\s]/, 1)[0] ?? "";
      const supported = BUILTIN_MACROS.has(name) || name.startsWith("getvar") || name.startsWith("setvar") || name.startsWith("addvar");
      review.push({
        token,
        field,
        state: supported ? "supported" : "warning",
        detail: supported
          ? name === "user" ? "Resolves to the attached persona." : name === "char" ? "Resolves to the imported card/story character." : "Built-in SillyTavern macro."
          : "Unknown or extension-provided token; preserved for review.",
      });
    }
    const stripped = text.replace(/\{\{[^{}]*\}\}/g, "");
    if (stripped.includes("{{") || stripped.includes("}}")) {
      review.push({
        token: "Unclosed {{…}}",
        field,
        state: field === "Premise" ? "blocking" : "warning",
        detail: field === "Premise" ? "A required field contains an incomplete token." : "The incomplete token is preserved.",
      });
    }
  }
  return review;
}

function mechanicsFromDraft(card: unknown): MechanicSourceReview[] {
  if (!card || typeof card !== "object") return [];
  const extended = card as {
    mechanicSources?: unknown[];
    mechanics?: { attributes?: unknown[] };
  };
  const rows = extended.mechanicSources ?? extended.mechanics?.attributes ?? [];
  return rows.flatMap((row, index) => {
    if (!row || typeof row !== "object") return [];
    const value = row as Record<string, unknown>;
    const name = typeof value.name === "string" ? value.name : undefined;
    if (!name) return [];
    const score = typeof value.score === "number" ? value.score : undefined;
    const source = typeof value.source === "string" ? value.source.toUpperCase() : "CARD";
    return [{
      id: typeof value.id === "string" ? value.id : `imported-mechanic-${index}`,
      name,
      abbreviation: typeof value.abbreviation === "string" ? value.abbreviation : typeof value.abbrev === "string" ? value.abbrev : name.slice(0, 4).toUpperCase(),
      ...(score !== undefined ? { score } : {}),
      ...(typeof value.lockedReason === "string" ? { lockedReason: value.lockedReason } : {}),
      definition: typeof value.definition === "string" ? value.definition : typeof value.description === "string" ? value.description : "Explicit mechanic imported from the card.",
      source: (["CARD", "PERSONA", "BLUEPRINT", "CUE", "GENERATED"].includes(source) ? source : "CARD") as MechanicSourceReview["source"],
      scope: value.scope === "WORLD" ? "WORLD" : "PLAYER",
    }];
  });
}

const styles: Record<string, CSSProperties> = {
  screen: {
    minHeight: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "40px 24px",
    background: "radial-gradient(120% 80% at 50% -10%, var(--bg1-panel), var(--bg0-ground) 60%)",
  },
  card: {
    width: 640,
    maxWidth: "100%",
    background: "var(--bg1-panel)",
    border: "1px solid var(--hairline-soft)",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--elevation)",
    padding: "30px 34px 26px",
  },
  kicker: { fontSize: 11, letterSpacing: "0.16em", color: "var(--teal)" },
  title: { fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 32, color: "var(--prose)", margin: "6px 0 0" },
  lede: { fontSize: 14, color: "var(--secondary)", lineHeight: 1.6, margin: "8px 0 20px", maxWidth: "52ch" },
  nameField: { display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 },
  fieldLabel: { fontSize: 11, letterSpacing: "0.08em", color: "var(--secondary)" },
  nameInput: {
    fontFamily: "var(--font-display)",
    fontSize: 18,
    color: "var(--prose)",
    background: "var(--bg2-card)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius-chip)",
    padding: "10px 14px",
    outline: "none",
  },
  seeds: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 14 },
  seedsLabel: { fontSize: 11, color: "var(--muted)" },
  configRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 16 },
  configLink: { background: "transparent", border: "none", color: "var(--teal)", fontSize: 12.5, cursor: "pointer", padding: 0 },
  footer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 22,
    paddingTop: 16,
    borderTop: "1px solid var(--hairline)",
  },
  gateActions: { display: "flex", gap: 10, marginTop: 6 },
  errorActions: { display: "flex", justifyContent: "flex-end", marginTop: 10 },
};

export default Wizard;
