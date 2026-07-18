/**
 * KeyField — the API-key input with four states whose border and trailing indicator track the
 * state (design system §Providers):
 *   empty      — neutral hairline border, no indicator
 *   validating — brass border, spinning ring ("Validating")
 *   valid      — success border, ✓ check + optional balance readout
 *   rejected   — failure border, ✕ + reason
 *
 * SYSTEM register (the key is a system value). Controlled input; the caller owns the value and
 * triggers validation. Masking is on by default with a show/hide toggle.
 */
import { useState } from "react";
import type { CSSProperties } from "react";
import { useReducedMotion } from "./_shared";

export type KeyFieldState = "empty" | "validating" | "valid" | "rejected";

export interface KeyFieldProps {
  value: string;
  onChange: (value: string) => void;
  state: KeyFieldState;
  label?: string;
  placeholder?: string;
  /** Balance/credit readout shown when valid, e.g. "$4.20 credit". */
  balance?: string;
  /** Reason shown when rejected, e.g. "Invalid key". */
  reason?: string;
  disabled?: boolean;
  animate?: boolean;
  className?: string;
  style?: CSSProperties;
}

function borderColor(state: KeyFieldState): string {
  switch (state) {
    case "validating":
      return "var(--brass)";
    case "valid":
      return "var(--success)";
    case "rejected":
      return "var(--failure)";
    case "empty":
      return "var(--hairline)";
  }
}

export function KeyField(props: KeyFieldProps): JSX.Element {
  const {
    value,
    onChange,
    state,
    label = "API key",
    placeholder = "sk-...",
    balance,
    reason,
    disabled = false,
    animate = true,
    className,
    style,
  } = props;
  const reduced = useReducedMotion();
  const [revealed, setRevealed] = useState(false);
  const play = animate && !reduced;

  return (
    <div className={className} style={{ display: "flex", flexDirection: "column", gap: 5, ...style }} data-state={state}>
      <label style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em", color: "var(--secondary)" }}>
        {label.toUpperCase()}
      </label>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "var(--bg0-ground)",
          border: `1px solid ${borderColor(state)}`,
          borderRadius: "var(--radius-chip)",
          padding: "8px 10px",
        }}
      >
        <input
          type={revealed ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          spellCheck={false}
          autoComplete="off"
          style={{
            flex: 1,
            minWidth: 0,
            background: "transparent",
            border: 0,
            outline: "none",
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            color: "var(--ui-text)",
          }}
        />
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          aria-label={revealed ? "Hide key" : "Show key"}
          style={{ background: "transparent", border: 0, color: "var(--muted)", cursor: "pointer", fontSize: 12 }}
        >
          {revealed ? "◎" : "◉"}
        </button>
        {state === "validating" ? (
          <span
            aria-hidden="true"
            className={play ? "mt-sweep" : undefined}
            data-testid="keyfield-spinner"
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              border: "2px solid var(--hairline)",
              borderTopColor: "var(--brass)",
              ...(play ? { animationDuration: "0.8s" } : {}),
            }}
          />
        ) : null}
        {state === "valid" ? (
          <span aria-hidden="true" style={{ color: "var(--success)", fontSize: 13 }}>
            ✓
          </span>
        ) : null}
        {state === "rejected" ? (
          <span aria-hidden="true" style={{ color: "var(--failure)", fontSize: 13 }}>
            ✕
          </span>
        ) : null}
      </div>
      {state === "valid" && balance ? (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--success)" }}>{balance}</span>
      ) : null}
      {state === "rejected" && reason ? (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--failure)" }}>{reason}</span>
      ) : null}
      {state === "validating" ? (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--brass)" }}>Validating…</span>
      ) : null}
    </div>
  );
}

export default KeyField;
