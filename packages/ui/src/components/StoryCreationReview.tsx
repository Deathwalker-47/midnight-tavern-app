import type { CSSProperties, ReactNode } from "react";
import { Button } from "./Button.js";
import { DifficultyPicker, type DifficultyValue } from "./DifficultyPicker.js";
import { InlineNotice } from "./InlineNotice.js";

export interface MechanicSourceReview {
  id: string;
  name: string;
  abbreviation: string;
  score?: number;
  lockedReason?: string;
  definition: string;
  source: "CARD" | "PERSONA" | "BLUEPRINT" | "CUE" | "GENERATED";
  scope: "WORLD" | "PLAYER";
}

export interface MacroReview {
  token: string;
  field: string;
  state: "supported" | "warning" | "blocking";
  detail: string;
}

export function StoryCreationReview(props: {
  persona?: { id: string; name: string; description?: string };
  continueWithoutPersona: boolean;
  onChangePersona: () => void;
  onEditPersona: () => void;
  onContinueWithoutPersona: (value: boolean) => void;
  mechanics: MechanicSourceReview[];
  macros: MacroReview[];
  statMode: "none" | "full";
  onStatModeChange: (mode: "none" | "full") => void;
  difficulty: DifficultyValue;
  onDifficultyChange: (value: DifficultyValue) => void;
  actionBudget: number;
  onActionBudgetChange: (value: number) => void;
}): JSX.Element {
  const blocked = props.macros.some((macro) => macro.state === "blocking");
  const warned = props.macros.some((macro) => macro.state === "warning");
  return (
    <div style={{ display: "grid", gap: 24 }} data-testid="story-creation-review">
      <ReviewSection label="PERSONA" title="Who are you in this story?">
        {props.persona ? (
          <div style={personaCard}>
            <div style={avatar} aria-hidden="true">{initials(props.persona.name)}</div>
            <div style={{ flex: 1 }}>
              <strong style={{ display: "block", color: "var(--ui-text)", fontFamily: "var(--font-display)", fontSize: 20 }}>{props.persona.name}</strong>
              <span style={{ display: "block", color: "var(--secondary)", fontSize: 12.5, lineHeight: 1.5, marginTop: 3 }}>
                {props.persona.description || "This persona will shape the player character's identity, attributes, skills, and starting state."}
              </span>
            </div>
            <Button variant="secondary" onClick={props.onChangePersona}>Change</Button>
            <Button variant="ghost" onClick={props.onEditPersona}>Edit persona</Button>
          </div>
        ) : (
          <InlineNotice
            severity="warn"
            title="No persona is attached"
            detail="Your player character depends heavily on the persona. Continuing without one gives Story AI fewer identity and mechanics cues."
          />
        )}
        {!props.persona ? (
          <label style={{ display: "flex", gap: 9, alignItems: "flex-start", marginTop: 10, color: "var(--secondary)", fontSize: 12 }}>
            <input type="checkbox" checked={props.continueWithoutPersona} onChange={(event) => props.onContinueWithoutPersona(event.target.checked)} />
            I understand and want to continue without a persona.
          </label>
        ) : null}
      </ReviewSection>

      <ReviewSection label="STAT SYSTEM" title="How should the story play?">
        <div role="radiogroup" aria-label="Stat system" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 9 }}>
          <ModeCard active={props.statMode === "full"} title="Full Stats" body="DM Rulings, attributes, skills, XP, equipment, loot, and the Mechanical Journal." onClick={() => props.onStatModeChange("full")} />
          <ModeCard active={props.statMode === "none"} title="No Stats" body="Narrator-only roleplay. All mechanical surfaces stay hidden, not empty." onClick={() => props.onStatModeChange("none")} />
        </div>
      </ReviewSection>

      {props.statMode === "full" ? (
        <>
          <ReviewSection label="MECHANIC SOURCES" title="Protected mechanics before forge">
            <p style={note}>Imported card mechanics take precedence over generated suggestions. Scores use 1–20; explicit locked zeroes remain locked with their reason.</p>
            {props.mechanics.length === 0 ? (
              <div style={empty}>No explicit mechanics were found. Story AI will propose a world-fitting set of 3–6 attributes, and the validation step will show their generated provenance.</div>
            ) : (
              <div style={{ display: "grid", gap: 7 }}>{props.mechanics.map((mechanic) => (
                <div key={mechanic.id} style={mechanicRow}>
                  <span style={abbr}>{mechanic.abbreviation}</span>
                  <span style={{ minWidth: 0 }}>
                    <strong style={{ display: "block", color: "var(--ui-text)", fontSize: 13 }}>{mechanic.name}</strong>
                    <span style={{ display: "block", color: "var(--secondary)", fontSize: 11.5, lineHeight: 1.45 }}>{mechanic.definition}</span>
                  </span>
                  <span style={{ fontFamily: "var(--font-mono)", color: mechanic.lockedReason ? "var(--muted)" : "var(--brass)", fontSize: 11 }}>
                    {mechanic.lockedReason ? `0 · LOCKED` : mechanic.score !== undefined ? `${mechanic.score} (${signed(Math.floor((mechanic.score - 10) / 2))})` : "DEFINED"}
                  </span>
                  <span style={source}>{mechanic.source} · {mechanic.scope}</span>
                </div>
              ))}</div>
            )}
          </ReviewSection>

          <ReviewSection label="MACROS" title="SillyTavern compatibility">
            {blocked ? <InlineNotice severity="error" title="A required field contains an unresolved macro" detail="Resolve the blocking token before forging. It is preserved in the source and never silently deleted." /> :
              warned ? <InlineNotice severity="warn" title="Some extension macros are not recognized" detail="Known built-in macros will resolve. Unknown tokens are preserved and identified by source field." /> :
                <InlineNotice severity="success" title="Macro check passed" detail="{{user}} resolves to the attached persona and {{char}} to the imported card/story character. Supported tokens never appear raw in prose." />}
            {props.macros.length ? <div style={{ display: "grid", gap: 6, marginTop: 10 }}>{props.macros.map((macro, index) => (
              <div key={`${macro.field}:${macro.token}:${index}`} style={{ ...macroRow, borderColor: macro.state === "blocking" ? "var(--failure)" : macro.state === "warning" ? "var(--brass-dim)" : "var(--hairline)" }}>
                <code style={{ color: macro.state === "supported" ? "var(--teal)" : "var(--brass)" }}>{macro.token}</code>
                <span style={{ color: "var(--muted)" }}>{macro.field}</span>
                <span style={{ color: "var(--secondary)" }}>{macro.detail}</span>
              </div>
            ))}</div> : null}
          </ReviewSection>

          <ReviewSection label="DIFFICULTY" title="Mechanical challenge">
            <DifficultyPicker value={props.difficulty} onChange={props.onDifficultyChange} />
          </ReviewSection>

          <ReviewSection label="ACTION BUDGET" title="Actions per player turn">
            <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
              <button type="button" aria-label="Decrease actions per turn" disabled={props.actionBudget <= 1} onClick={() => props.onActionBudgetChange(Math.max(1, props.actionBudget - 1))} style={stepper}>−</button>
              <output style={{ minWidth: 70, textAlign: "center", color: "var(--brass)", fontFamily: "var(--font-mono)", fontSize: 22 }}>{props.actionBudget}</output>
              <button type="button" aria-label="Increase actions per turn" disabled={props.actionBudget >= 5} onClick={() => props.onActionBudgetChange(Math.min(5, props.actionBudget + 1))} style={stepper}>+</button>
              <span style={{ color: "var(--secondary)", fontSize: 12.5, lineHeight: 1.5 }}>
                Combat, movement, item use, and consequential social attempts count. Overflow actions are visibly refused and receive no roll, XP, loot, or consequence.
              </span>
            </div>
          </ReviewSection>
        </>
      ) : null}
    </div>
  );
}

function ReviewSection(props: { label: string; title: string; children: ReactNode }): JSX.Element {
  return <section><div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}><span style={source}>§ {props.label}</span><h2 style={{ margin: 0, color: "var(--prose)", fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600 }}>{props.title}</h2><div style={{ flex: 1, height: 1, background: "var(--hairline)" }} /></div>{props.children}</section>;
}
function ModeCard(props: { active: boolean; title: string; body: string; onClick: () => void }): JSX.Element {
  return <button type="button" role="radio" aria-checked={props.active} onClick={props.onClick} style={{ padding: "12px 13px", color: props.active ? "var(--ui-text)" : "var(--secondary)", background: props.active ? "var(--teal-tint)" : "var(--bg1-panel)", border: `1px solid ${props.active ? "var(--teal)" : "var(--hairline)"}`, borderRadius: 8, textAlign: "left", cursor: "pointer" }}><strong style={{ display: "block", fontSize: 13 }}>{props.title}</strong><span style={{ display: "block", marginTop: 4, fontSize: 11.5, lineHeight: 1.45 }}>{props.body}</span></button>;
}
function initials(name: string): string { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?"; }
function signed(value: number): string { return value >= 0 ? `+${value}` : String(value); }

const personaCard: CSSProperties = { display: "flex", alignItems: "center", gap: 12, padding: 13, background: "var(--brass-tint)", border: "1px solid var(--brass-dim)", borderRadius: 9 };
const avatar: CSSProperties = { width: 48, height: 48, flex: "0 0 48px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--brass)", background: "var(--bg2-card)", border: "1px solid var(--brass-dim)", borderRadius: 10, fontFamily: "var(--font-display)", fontSize: 20 };
const note: CSSProperties = { margin: "0 0 10px", color: "var(--secondary)", fontSize: 12, lineHeight: 1.5 };
const empty: CSSProperties = { padding: 12, color: "var(--muted)", fontSize: 12, lineHeight: 1.5, border: "1px dashed var(--hairline)", borderRadius: 8 };
const mechanicRow: CSSProperties = { display: "grid", gridTemplateColumns: "44px minmax(180px, 1fr) 92px 120px", alignItems: "center", gap: 10, padding: "9px 10px", background: "var(--bg1-panel)", border: "1px solid var(--hairline)", borderRadius: 7 };
const abbr: CSSProperties = { color: "var(--teal)", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".08em" };
const source: CSSProperties = { color: "var(--teal)", fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: ".07em" };
const macroRow: CSSProperties = { display: "grid", gridTemplateColumns: "110px 120px 1fr", gap: 10, padding: "7px 9px", background: "var(--bg1-panel)", border: "1px solid var(--hairline)", borderRadius: 6, fontSize: 11 };
const stepper: CSSProperties = { width: 34, height: 34, color: "var(--brass)", background: "var(--bg2-card)", border: "1px solid var(--hairline)", borderRadius: 7, cursor: "pointer", fontSize: 20 };
