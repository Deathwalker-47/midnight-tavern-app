import type { CSSProperties } from "react";
import { DIFFICULTY_PRESETS, STANDARD_DIFFICULTY as CORE_STANDARD_DIFFICULTY } from "@midnight-tavern/core";

export type DifficultyPreset = "story" | "standard" | "hard" | "brutal" | "custom";

export interface DifficultyValue {
  preset: DifficultyPreset;
  dcOffset: number;
  damageTakenMultiplier: number;
  damageDealtMultiplier: number;
}

export const STANDARD_DIFFICULTY: DifficultyValue = {
  ...CORE_STANDARD_DIFFICULTY,
};

const COPY: Record<Exclude<DifficultyPreset, "custom">, string> = {
  story: "Gentler player checks and consequences. The fiction is unchanged.",
  standard: "The intended baseline for checks, damage, and consequences.",
  hard: "Harder player checks and heavier incoming damage.",
  brutal: "A severe mechanical challenge with little margin for error.",
};

export function DifficultyPicker(props: {
  value: DifficultyValue;
  onChange: (next: DifficultyValue) => void;
  disabled?: boolean;
  compact?: boolean;
  showEffectiveTiming?: boolean;
}): JSX.Element {
  const { value, onChange, disabled = false, compact = false, showEffectiveTiming = false } = props;
  const presets: DifficultyPreset[] = ["story", "standard", "hard", "brutal", "custom"];
  const choose = (preset: DifficultyPreset): void => {
    onChange(preset === "custom" ? { ...value, preset } : { preset, ...DIFFICULTY_PRESETS[preset] });
  };
  return (
    <div data-testid="difficulty-picker">
      <div
        role="radiogroup"
        aria-label="Difficulty"
        style={{
          display: "grid",
          gridTemplateColumns: compact ? "repeat(auto-fit, minmax(110px, 1fr))" : "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 8,
        }}
      >
        {presets.map((preset) => {
          const active = value.preset === preset;
          return (
            <button
              key={preset}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => choose(preset)}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 5,
                minHeight: compact ? 54 : 88,
                padding: compact ? "9px 11px" : "12px 13px",
                textAlign: "left",
                color: active ? "var(--ui-text)" : "var(--secondary)",
                background: active ? "var(--teal-tint)" : "var(--bg1-panel)",
                border: `1px solid ${active ? "var(--teal)" : "var(--hairline)"}`,
                borderRadius: "var(--radius-chip)",
                cursor: disabled ? "not-allowed" : "pointer",
                fontFamily: "var(--font-ui)",
              }}
            >
              <strong style={{ textTransform: "capitalize", fontSize: 13 }}>{preset}</strong>
              {!compact ? (
                <span style={{ fontSize: 11.5, lineHeight: 1.45 }}>
                  {preset === "custom" ? "Set player-check and damage modifiers directly." : COPY[preset]}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {value.preset === "custom" ? (
        <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
          <RangeField label="DC offset · player checks only" value={value.dcOffset} min={-4} max={4} step={1}
            display={value.dcOffset >= 0 ? `+${value.dcOffset}` : String(value.dcOffset)} disabled={disabled}
            onChange={(dcOffset) => onChange({ ...value, dcOffset })} />
          <RangeField label="Damage taken multiplier" value={value.damageTakenMultiplier} min={0.25} max={2.5} step={0.05}
            display={`×${value.damageTakenMultiplier.toFixed(2).replace(/0$/, "")}`} disabled={disabled}
            onChange={(damageTakenMultiplier) => onChange({ ...value, damageTakenMultiplier })} />
          <RangeField label="Damage dealt multiplier" value={value.damageDealtMultiplier} min={0.25} max={2.5} step={0.05}
            display={`×${value.damageDealtMultiplier.toFixed(2).replace(/0$/, "")}`} disabled={disabled}
            onChange={(damageDealtMultiplier) => onChange({ ...value, damageDealtMultiplier })} />
        </div>
      ) : null}
      {showEffectiveTiming ? (
        <p style={{ margin: "10px 0 0", color: "var(--muted)", fontSize: 11.5, lineHeight: 1.5 }}>
          Changes begin with the next turn. Existing rulings are never recalculated, and opposed contests do not use the player DC offset.
        </p>
      ) : null}
    </div>
  );
}

function RangeField(props: {
  label: string; value: number; min: number; max: number; step: number; display: string;
  disabled: boolean; onChange: (value: number) => void;
}): JSX.Element {
  const row: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(150px, 1fr) minmax(130px, 2fr) 52px", gap: 10, alignItems: "center" };
  return (
    <label style={row}>
      <span style={{ fontSize: 12, color: "var(--secondary)" }}>{props.label}</span>
      <input type="range" min={props.min} max={props.max} step={props.step} value={props.value}
        disabled={props.disabled} onChange={(event) => props.onChange(Number(event.target.value))}
        aria-label={props.label} style={{ accentColor: "var(--teal)", width: "100%" }} />
      <output style={{ fontFamily: "var(--font-mono)", color: "var(--teal)", fontSize: 12, textAlign: "right" }}>{props.display}</output>
    </label>
  );
}
