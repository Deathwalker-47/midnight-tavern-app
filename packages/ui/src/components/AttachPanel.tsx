/**
 * AttachPanel — two small presentational pieces for the "attach to story" surfaces (low-level-plan-v2
 * §2 & §4), used in Story Settings and the new-story overlay.
 *
 *   • AttachRow      — one attachable lorebook: name, optional source tag, an enable toggle, and a
 *                      detach affordance.
 *   • PersonaPickerRow — the "Play as: <persona> ▾" row: monogram, label, name, and a change control.
 *
 * Presentational: state + callbacks come from the caller.
 */
import type { CSSProperties } from "react";

export type AttachSourceTag = "user" | "imported_card" | "migrated";

export interface AttachRowProps {
  name: string;
  source?: AttachSourceTag;
  /** Link-level enabled flag (the toggle position). */
  enabled: boolean;
  onToggle?: (enabled: boolean) => void;
  onDetach?: () => void;
  className?: string;
  style?: CSSProperties;
}

const SOURCE_LABEL: Record<AttachSourceTag, string> = {
  user: "USER",
  imported_card: "FROM CARD",
  migrated: "MIGRATED",
};

function Toggle({ on, onChange }: { on: boolean; onChange?: (v: boolean) => void }): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange?.(!on)}
      style={{
        width: 36,
        height: 20,
        borderRadius: 11,
        background: on ? "var(--brass)" : "var(--bg3-raised)",
        border: on ? "0" : "1px solid var(--hairline)",
        padding: 2,
        display: "flex",
        justifyContent: on ? "flex-end" : "flex-start",
        cursor: "pointer",
      }}
    >
      <span style={{ width: 16, height: 16, borderRadius: "50%", background: on ? "var(--bg1-panel)" : "var(--secondary)" }} />
    </button>
  );
}

export function AttachRow(props: AttachRowProps): JSX.Element {
  const { name, source, enabled, onToggle, onDetach, className, style } = props;
  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        background: "var(--bg1-panel)",
        border: "1px solid var(--hairline)",
        borderRadius: "var(--radius-card)",
        padding: "11px 13px",
        fontFamily: "var(--font-ui)",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
        <span style={{ fontSize: 13.5, color: "var(--ui-text)" }}>{name}</span>
        {source && (
          <span
            style={{
              fontSize: 9,
              fontFamily: "var(--font-mono)",
              color: "var(--brass)",
              border: "1px solid var(--hairline)",
              borderRadius: 3,
              padding: "1px 5px",
              whiteSpace: "nowrap",
            }}
          >
            {SOURCE_LABEL[source]}
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Toggle on={enabled} onChange={onToggle} />
        {onDetach && (
          <button type="button" onClick={onDetach} aria-label={`Detach ${name}`} style={{ background: "transparent", border: 0, color: "var(--secondary)", fontSize: 13, cursor: "pointer" }}>
            Detach
          </button>
        )}
      </div>
    </div>
  );
}

export interface PersonaPickerRowProps {
  /** Persona name; when undefined the row reads as "no persona / default". */
  personaName?: string;
  /** Small label above the name (defaults to "Play as"). */
  label?: string;
  onChange?: () => void;
  className?: string;
  style?: CSSProperties;
}

/** Two-letter monogram from a name ("Kestrel Vane" → "KV"). */
function monogram(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "··";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function PersonaPickerRow(props: PersonaPickerRowProps): JSX.Element {
  const { personaName, label = "Play as", onChange, className, style } = props;
  const name = personaName ?? "Default persona";
  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 11,
        background: "var(--bg1-panel)",
        border: "1px solid var(--hairline)",
        borderRadius: "var(--radius-card)",
        padding: "11px 13px",
        fontFamily: "var(--font-ui)",
        ...style,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          background: "var(--bg3-raised)",
          border: "1px solid var(--hairline)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: 14,
          color: "var(--brass)",
        }}
      >
        {monogram(name)}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: "var(--secondary)" }}>{label}</div>
        <div style={{ fontSize: 14, color: "var(--ui-text)", fontFamily: "var(--font-display)", fontWeight: 600 }}>{name}</div>
      </div>
      <button type="button" onClick={onChange} style={{ background: "transparent", border: 0, color: "var(--teal)", fontSize: 12, cursor: "pointer" }}>
        Change ▾
      </button>
    </div>
  );
}

export default AttachRow;
