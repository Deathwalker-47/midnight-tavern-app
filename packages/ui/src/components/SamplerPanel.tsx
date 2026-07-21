/**
 * SamplerPanel — the full per-role sampler surface (low-level-plan-v2 §8), opened from a
 * RoleMatrix row. Three named presets (Precise / Balanced / Creative) set a whole profile in one
 * tap; a per-role "Reset to recommended" clears the manual-override (`samplersDirty`) state; and
 * each field renders as a labelled slider with its mono value. Fields the chosen provider does not
 * support render disabled with a "not supported by this provider" note.
 *
 * Presentational: the profile, the active preset, the disabled-field set, and the change/reset
 * callbacks are all supplied by the caller. Samplers are ALWAYS per-role — there is no global
 * creativity control (the guardrail from §8).
 */
import type { CSSProperties } from "react";

export type SamplerPreset = "Precise" | "Balanced" | "Creative";

/** One editable sampler field. `min`/`max` bound the slider; `step` its granularity. */
export interface SamplerField {
  key: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** When false, the field is greyed out with a "not supported by this provider" note. */
  supported?: boolean;
}

export interface SamplerPanelProps {
  fields: SamplerField[];
  /** The preset currently matching the profile, or undefined when the profile is custom. */
  activePreset?: SamplerPreset;
  /** Whether the role's samplers have been manually edited (enables the reset affordance). */
  dirty?: boolean;
  onPreset?: (preset: SamplerPreset) => void;
  onFieldChange?: (key: string, value: number) => void;
  onResetToRecommended?: () => void;
  className?: string;
  style?: CSSProperties;
}

const PRESETS: SamplerPreset[] = ["Precise", "Balanced", "Creative"];

export function SamplerPanel(props: SamplerPanelProps): JSX.Element {
  const { fields, activePreset, dirty = false, onPreset, onFieldChange, onResetToRecommended, className, style } = props;
  return (
    <div
      className={className}
      style={{
        background: "var(--bg2-card)",
        border: "1px solid var(--hairline)",
        borderRadius: "var(--radius-card)",
        padding: "16px 18px",
        fontFamily: "var(--font-ui)",
        ...style,
      }}
    >
      {/* Presets + reset */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 7 }}>
          {PRESETS.map((p) => {
            const active = p === activePreset;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onPreset?.(p)}
                aria-pressed={active}
                style={{
                  fontSize: 11.5,
                  padding: "5px 12px",
                  borderRadius: 6,
                  cursor: "pointer",
                  color: active ? "var(--teal)" : "var(--secondary)",
                  background: active ? "var(--teal-tint)" : "var(--bg3-raised)",
                  border: `1px solid ${active ? "var(--teal-dim)" : "var(--hairline)"}`,
                }}
              >
                {p}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => onResetToRecommended?.()}
          disabled={!dirty}
          style={{
            fontSize: 11.5,
            color: dirty ? "var(--teal)" : "var(--muted)",
            border: `1px solid ${dirty ? "var(--teal-dim)" : "var(--hairline)"}`,
            borderRadius: 6,
            padding: "5px 11px",
            background: "transparent",
            cursor: dirty ? "pointer" : "default",
          }}
        >
          ↺ Reset to recommended
        </button>
      </div>

      {/* Fields */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 26px" }}>
        {fields.map((f) => {
          const supported = f.supported !== false;
          const pct = f.max > f.min ? ((f.value - f.min) / (f.max - f.min)) * 100 : 0;
          return (
            <div key={f.key} style={{ opacity: supported ? 1 : 0.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                <span style={{ fontSize: 12, color: supported ? "var(--ui-text)" : "var(--muted)" }}>{f.label}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: supported ? "var(--teal)" : "var(--muted)" }}>
                  {supported ? f.value.toFixed(f.step < 1 ? 2 : 0) : "—"}
                </span>
              </div>
              <input
                type="range"
                min={f.min}
                max={f.max}
                step={f.step}
                value={f.value}
                disabled={!supported}
                aria-label={f.label}
                onChange={(e) => onFieldChange?.(f.key, Number(e.target.value))}
                style={{
                  width: "100%",
                  height: 4,
                  accentColor: "var(--teal)",
                  cursor: supported ? "pointer" : "default",
                  background: `linear-gradient(to right, var(--teal) ${pct}%, var(--hairline) ${pct}%)`,
                  borderRadius: 3,
                }}
              />
              {!supported && (
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 3 }}>not supported by this provider</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SamplerPanel;
