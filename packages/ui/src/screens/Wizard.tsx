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
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useStoriesStore } from "../state/storiesStore";
import { useSettingsStore } from "../state/settingsStore";
import { useRoute } from "../state/uiStore";
import { getBridge } from "../bridge/core";
import type { PersonaRecord } from "../bridge/core";
import { Button, PremiseInput, ForgingInterstitial, InlineNotice, Chip } from "../components";
import type { ForgeStep, ForgeStepStatus } from "../components";
import type { ScreenProps } from "./registry";

/** The forge phases the bridge streams via `onProgress`, mapped to human step labels. */
const FORGE_PHASES = ["phase-a", "phase-b", "validate", "freeze", "install"] as const;
type ForgePhase = (typeof FORGE_PHASES)[number];

const STEP_LABELS: Record<ForgePhase, string> = {
  "phase-a": "Reading your premise",
  "phase-b": "Deciding the rules of this world",
  validate: "Writing the skill catalog",
  freeze: "Sealing the rulebook",
  install: "Placing your starting gear",
};

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
  const entitlement = useSettingsStore((s) => s.entitlement);
  const { navigate } = useRoute();

  const [playerName, setPlayerName] = useState("");
  const [premise, setPremise] = useState("");
  const [phase, setPhase] = useState<ForgePhase | undefined>(undefined);
  const [error, setError] = useState<ForgeError | undefined>(undefined);
  // Optional persona pick (v2 §4); "" ⇒ use the global default persona.
  const [personas, setPersonas] = useState<PersonaRecord[]>([]);
  const [personaId, setPersonaId] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getBridge()
      .listPersonas()
      .then((ps) => {
        if (!cancelled) setPersonas(ps);
      })
      .catch(() => {
        /* personas are optional; a load failure just leaves the picker empty */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Default to allowing creation while entitlement loads; only an expired trial blocks it.
  const canCreate = entitlement ? entitlement.canCreateStory : true;
  const trimmedPremise = premise.trim();
  const forgeDisabled = trimmedPremise.length < 12 || forging;

  const runForge = async (): Promise<void> => {
    if (forgeDisabled) return;
    setError(undefined);
    setPhase("phase-a");
    try {
      const result = await create({
        title: deriveTitle(trimmedPremise),
        premise: trimmedPremise,
        playerName: playerName.trim() || "You",
        onProgress: (p) => setPhase(p),
      });
      // Apply the optional persona pick to the freshly-created story (v2 §4).
      if (personaId) {
        try {
          await getBridge().setActivePersona(result.story.id, personaId);
        } catch {
          /* non-fatal: the story still opens on the default persona */
        }
      }
      navigate("play", { storyId: result.story.id });
    } catch (err) {
      setError(classifyError(err));
      setPhase(undefined);
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
    const steps = buildSteps(phase, error?.kind ? phase : undefined);
    return (
      <div style={styles.screen}>
        <div style={styles.card}>
          <ForgingInterstitial title="Forging your story" steps={steps} />
        </div>
      </div>
    );
  }

  // ── Premise entry ────────────────────────────────────────────────────────
  return (
    <div style={styles.screen}>
      <div style={styles.card}>
        <div className="mono" style={styles.kicker}>
          NEW STORY · STEP 1 OF 1
        </div>
        <h1 style={styles.title}>What world shall we forge?</h1>
        <p style={styles.lede}>
          Describe the premise in a sentence or a page. The storyteller reads it and writes the rules — the skills you
          can learn, the dangers, the things you&rsquo;ll carry.
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

        {personas.length > 0 ? (
          <div style={styles.nameField}>
            <label className="mono" style={styles.fieldLabel} htmlFor="wizard-persona">
              PLAY AS
            </label>
            <select
              id="wizard-persona"
              value={personaId}
              onChange={(e) => setPersonaId(e.target.value)}
              style={{ ...styles.nameInput, fontFamily: "var(--font-ui)", fontSize: 14 }}
            >
              <option value="">Default persona</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.isDefault ? " (default)" : ""}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <PremiseInput
          value={premise}
          onChange={setPremise}
          onSubmit={() => void runForge()}
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
          <Button variant="primary" onClick={() => void runForge()} disabled={forgeDisabled} title={trimmedPremise.length < 12 ? "Write a little more of the premise first" : undefined}>
            Forge this world →
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Map the current forge phase onto the step list; the errored phase (if any) shows as `error`. */
function buildSteps(phase: ForgePhase | undefined, erroredPhase: ForgePhase | undefined): ForgeStep[] {
  const currentIdx = phase ? FORGE_PHASES.indexOf(phase) : -1;
  return FORGE_PHASES.map((p, i) => {
    let status: ForgeStepStatus;
    if (erroredPhase && p === erroredPhase) status = "error";
    else if (i < currentIdx) status = "done";
    else if (i === currentIdx) status = "active";
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
