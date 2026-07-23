/**
 * BlueprintForm — the full Story Blueprint editor body (low-level-plan-v2 §3): SillyTavern-parity
 * fields grouped as Identity · Opening · Narration control · Metadata. The Narration group is
 * collapsed by default and carries the required boundary note — user prompt text guides voice only;
 * the world's rules and dice outcomes are always enforced by the app and can't be overridden here.
 *
 * Controlled: the whole `Blueprint` value + an `onChange(next)` come from the caller (the screen
 * owns persistence via the bridge). Alternate greetings are a repeatable list.
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import type { Blueprint } from "@midnight-tavern/core";

export interface BlueprintFormProps {
  value: Blueprint;
  onChange: (next: Blueprint) => void;
  className?: string;
  style?: CSSProperties;
}

const BOUNDARY_NOTE =
  "Guides the storyteller's voice and style. The world's rules and dice outcomes are always enforced by the app and can't be overridden here.";

const labelStyle: CSSProperties = { display: "block", fontSize: 12, color: "var(--secondary)", marginBottom: 5 };
const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--bg3-raised)",
  border: "1px solid var(--hairline)",
  borderRadius: 7,
  padding: "8px 11px",
  color: "var(--ui-text)",
  fontFamily: "var(--font-ui)",
  fontSize: 13,
};
const groupHeadStyle: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: ".1em",
  color: "var(--brass)",
  margin: "0 0 10px",
};

function Field(props: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={labelStyle}>{props.label}</label>
      {props.children}
    </div>
  );
}

export function BlueprintForm(props: BlueprintFormProps): JSX.Element {
  const { value, onChange, className, style } = props;
  const [narrationOpen, setNarrationOpen] = useState(false);

  function set<K extends keyof Blueprint>(key: K, v: Blueprint[K]): void {
    onChange({ ...value, [key]: v });
  }
  function setGreeting(i: number, text: string): void {
    const list = [...(value.alternateGreetings ?? [])];
    list[i] = text;
    onChange({ ...value, alternateGreetings: list });
  }
  function addGreeting(): void {
    onChange({ ...value, alternateGreetings: [...(value.alternateGreetings ?? []), ""] });
  }
  function removeGreeting(i: number): void {
    const list = [...(value.alternateGreetings ?? [])];
    list.splice(i, 1);
    onChange({ ...value, alternateGreetings: list });
  }
  function setStyle(
    key: "pov" | "tense" | "proseLength",
    next: "" | "first" | "second" | "third" | "past" | "present" | "brief" | "medium" | "long"
  ): void {
    const styleSettings = { ...(value.styleSettings ?? {}) };
    if (next) styleSettings[key] = next as never;
    else delete styleSettings[key];
    onChange({ ...value, styleSettings });
  }

  const groupStyle: CSSProperties = {
    background: "var(--bg1-panel)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius-card)",
    padding: "15px 16px",
    marginBottom: 14,
  };

  return (
    <div className={className} style={{ fontFamily: "var(--font-ui)", ...style }}>
      {/* IDENTITY */}
      <section style={groupStyle}>
        <div style={groupHeadStyle}>IDENTITY</div>
        <Field label="Name">
          <input style={inputStyle} value={value.name ?? ""} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Description / backstory">
          <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={value.description ?? ""} onChange={(e) => set("description", e.target.value)} />
        </Field>
        <Field label="Personality">
          <textarea style={{ ...inputStyle, minHeight: 50, resize: "vertical" }} value={value.personality ?? ""} onChange={(e) => set("personality", e.target.value)} />
        </Field>
        <Field label="Appearance">
          <textarea style={{ ...inputStyle, minHeight: 50, resize: "vertical" }} value={value.appearance ?? ""} onChange={(e) => set("appearance", e.target.value)} />
        </Field>
        <Field label="Speech style">
          <input style={inputStyle} value={value.speechStyle ?? ""} onChange={(e) => set("speechStyle", e.target.value)} />
        </Field>
      </section>

      {/* OPENING */}
      <section style={groupStyle}>
        <div style={groupHeadStyle}>OPENING</div>
        <Field label="Scenario">
          <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={value.scenario ?? ""} onChange={(e) => set("scenario", e.target.value)} />
        </Field>
        <Field label="First message">
          <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={value.firstMessage ?? ""} onChange={(e) => set("firstMessage", e.target.value)} />
        </Field>
        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>Alternate greetings</label>
          {(value.alternateGreetings ?? []).map((g, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 7 }}>
              <textarea style={{ ...inputStyle, minHeight: 44, resize: "vertical" }} value={g} onChange={(e) => setGreeting(i, e.target.value)} />
              <button type="button" onClick={() => removeGreeting(i)} aria-label={`Remove greeting ${i + 1}`} style={{ background: "transparent", border: "1px solid var(--hairline)", borderRadius: 7, color: "var(--secondary)", cursor: "pointer", padding: "0 10px" }}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" onClick={addGreeting} style={{ background: "transparent", border: "1px solid var(--teal-dim)", borderRadius: 7, color: "var(--teal)", cursor: "pointer", fontSize: 12, padding: "6px 12px" }}>
            + Add greeting
          </button>
        </div>
      </section>

      <section style={groupStyle}>
        <div style={groupHeadStyle}>PROSE STYLE</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
          <Field label="Point of view">
            <select
              aria-label="Point of view"
              style={inputStyle}
              value={value.styleSettings?.pov ?? ""}
              onChange={(event) => setStyle("pov", event.target.value as "" | "first" | "second" | "third")}
            >
              <option value="">Default</option>
              <option value="first">First person</option>
              <option value="second">Second person</option>
              <option value="third">Third person</option>
            </select>
          </Field>
          <Field label="Tense">
            <select
              aria-label="Tense"
              style={inputStyle}
              value={value.styleSettings?.tense ?? ""}
              onChange={(event) => setStyle("tense", event.target.value as "" | "past" | "present")}
            >
              <option value="">Default</option>
              <option value="past">Past</option>
              <option value="present">Present</option>
            </select>
          </Field>
          <Field label="Prose length">
            <select
              aria-label="Prose length"
              style={inputStyle}
              value={value.styleSettings?.proseLength ?? ""}
              onChange={(event) => setStyle("proseLength", event.target.value as "" | "brief" | "medium" | "long")}
            >
              <option value="">Default</option>
              <option value="brief">Brief</option>
              <option value="medium">Medium</option>
              <option value="long">Long</option>
            </select>
          </Field>
        </div>
      </section>

      {/* NARRATION CONTROL (collapsible, with boundary note) */}
      <section style={groupStyle}>
        <button
          type="button"
          onClick={() => setNarrationOpen((o) => !o)}
          aria-expanded={narrationOpen}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: "transparent", border: 0, cursor: "pointer", padding: 0 }}
        >
          <span style={groupHeadStyle}>NARRATION CONTROL</span>
          <span style={{ color: "var(--secondary)", marginLeft: "auto" }}>{narrationOpen ? "▴" : "▾"}</span>
        </button>
        <p style={{ fontSize: 12, color: "var(--ui-text)", fontStyle: "italic", lineHeight: 1.5, margin: "6px 0 0" }}>{BOUNDARY_NOTE}</p>
        {narrationOpen && (
          <div style={{ marginTop: 12 }}>
            <Field label="System prompt (narrator style directive)">
              <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={value.systemPrompt ?? ""} onChange={(e) => set("systemPrompt", e.target.value)} />
            </Field>
            <Field label="Post-history instructions">
              <textarea style={{ ...inputStyle, minHeight: 50, resize: "vertical" }} value={value.postHistoryInstructions ?? ""} onChange={(e) => set("postHistoryInstructions", e.target.value)} />
            </Field>
            <Field label="Example dialogue (few-shot voice)">
              <textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={value.exampleDialogue ?? ""} onChange={(e) => set("exampleDialogue", e.target.value)} />
            </Field>
          </div>
        )}
      </section>

      {/* METADATA */}
      <section style={groupStyle}>
        <div style={groupHeadStyle}>METADATA</div>
        <Field label="Creator notes">
          <textarea style={{ ...inputStyle, minHeight: 44, resize: "vertical" }} value={value.creatorNotes ?? ""} onChange={(e) => set("creatorNotes", e.target.value)} />
        </Field>
        <Field label="Tags (comma-separated)">
          <input
            style={inputStyle}
            value={(value.tags ?? []).join(", ")}
            onChange={(e) =>
              set(
                "tags",
                e.target.value
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean)
              )
            }
          />
        </Field>
      </section>
    </div>
  );
}

export default BlueprintForm;
