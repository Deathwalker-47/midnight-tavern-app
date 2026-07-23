/**
 * ForgingInterstitial — the bootstrap "forging your story" screen: a spinning ring plus a step
 * list that checks off in sequence. Each step has a status (pending / active / done / error).
 * The ring sweeps (mt-sweep); the active step pulses. Story-forward heading (serif), system
 * step labels (mono).
 */
import type { CSSProperties } from "react";
import { useReducedMotion } from "./_shared";

export type ForgeStepStatus = "pending" | "active" | "done" | "error" | "paused";

export interface ForgeStep {
  key?: string;
  label: string;
  status: ForgeStepStatus;
  detail?: string;
}

export type ForgeOperationState =
  | "running"
  | "slow"
  | "degraded"
  | "timed-out"
  | "failed"
  | "cancelled"
  | "resumable"
  | "completed";

export interface ForgingInterstitialProps {
  /** Serif heading. Default "Forging your story". */
  title?: string;
  steps: ForgeStep[];
  operationState?: ForgeOperationState;
  activeSubstep?: string;
  attempt?: number;
  elapsedSeconds?: number;
  lastEvent?: string;
  regeneration?: boolean;
  onCancel?: () => void;
  onRetry?: () => void;
  onResume?: () => void;
  animate?: boolean;
  className?: string;
  style?: CSSProperties;
}

function stepGlyph(status: ForgeStepStatus): { glyph: string; color: string } {
  switch (status) {
    case "done":
      return { glyph: "✓", color: "var(--success)" };
    case "active":
      return { glyph: "◌", color: "var(--brass)" };
    case "error":
      return { glyph: "✖", color: "var(--failure)" };
    case "paused":
      return { glyph: "Ⅱ", color: "var(--brass)" };
    case "pending":
      return { glyph: "○", color: "var(--muted)" };
  }
}

export function ForgingInterstitial(props: ForgingInterstitialProps): JSX.Element {
  const { title = "Forging your story", steps, operationState = "running", animate = true, className, style } = props;
  const reduced = useReducedMotion();
  const requestActive = operationState === "running" || operationState === "slow" || operationState === "degraded";
  const play = animate && !reduced && requestActive;
  const stateCopy: Record<ForgeOperationState, string> = {
    running: "A model request is active",
    slow: "Still working · the provider is responding slowly",
    degraded: "A fragment needed repair; completed work is retained",
    "timed-out": "The active fragment timed out",
    failed: "The active fragment failed",
    cancelled: "Forging was cancelled safely",
    resumable: "A retained draft can be resumed",
    completed: "The rulebook was validated and installed",
  };
  return (
    <div
      className={className}
      role="status"
      aria-label={title}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 22,
        padding: "48px 24px",
        fontFamily: "var(--font-ui)",
        ...style,
      }}
    >
      <div
        aria-hidden="true"
        className={play ? "mt-sweep" : undefined}
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          border: "3px solid var(--hairline)",
          borderTopColor: "var(--brass)",
          ...(play ? { animationDuration: "0.9s" } : {}),
        }}
      />
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 24, color: "var(--prose)" }}>{title}</div>
        {props.regeneration ? (
          <div style={{ marginTop: 5, color: "var(--brass)", fontFamily: "var(--font-mono)", fontSize: 10 }}>
            REGENERATION · CURRENT RULEBOOK RETAINED UNTIL ATOMIC SUCCESS
          </div>
        ) : null}
      </div>
      <div
        data-operation-state={operationState}
        style={{
          width: "min(540px, 100%)",
          padding: "10px 12px",
          color: operationState === "failed" || operationState === "timed-out" ? "var(--failure)" : "var(--secondary)",
          background: "var(--bg2-card)",
          border: "1px solid var(--hairline)",
          borderRadius: 8,
          fontSize: 12,
          lineHeight: 1.5,
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <strong style={{ color: "var(--ui-text)" }}>{stateCopy[operationState]}</strong>
          <span style={{ flex: 1 }} />
          {props.elapsedSeconds !== undefined ? <span style={{ fontFamily: "var(--font-mono)", color: "var(--teal)" }}>{formatElapsed(props.elapsedSeconds)}</span> : null}
        </div>
        {props.activeSubstep ? <div style={{ marginTop: 4 }}>Active substep: {props.activeSubstep}</div> : null}
        {props.attempt && props.attempt > 1 ? <div>Repair attempt {props.attempt}</div> : null}
        {props.lastEvent ? <div style={{ color: "var(--muted)", marginTop: 4 }}>Latest real event: {props.lastEvent}</div> : null}
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8, minWidth: 240 }}>
        {steps.map((s, i) => {
          const g = stepGlyph(s.status);
          const activePulse = s.status === "active" && play;
          return (
            <li
              key={i}
              data-status={s.status}
              className={activePulse ? "mt-pulse" : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                color: s.status === "pending" ? "var(--muted)" : "var(--ui-text)",
                ...(activePulse ? { animationDuration: "1.4s" } : {}),
              }}
            >
              <span aria-hidden="true" style={{ color: g.color, width: 14, textAlign: "center" }}>
                {g.glyph}
              </span>
              <span>
                <span>{s.label}</span>
                {s.detail ? <span style={{ display: "block", color: "var(--muted)", fontSize: 10.5, marginTop: 2 }}>{s.detail}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
      {props.onCancel || props.onRetry || props.onResume ? (
        <div style={{ display: "flex", gap: 8 }}>
          {requestActive && props.onCancel ? <button type="button" onClick={props.onCancel} style={actionButton}>Cancel safely</button> : null}
          {(operationState === "failed" || operationState === "timed-out") && props.onRetry ? <button type="button" onClick={props.onRetry} style={actionButton}>Retry failed fragment</button> : null}
          {operationState === "resumable" && props.onResume ? <button type="button" onClick={props.onResume} style={actionButton}>Resume retained draft</button> : null}
        </div>
      ) : null}
    </div>
  );
}

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

const actionButton: CSSProperties = {
  padding: "7px 11px",
  color: "var(--teal)",
  background: "transparent",
  border: "1px solid var(--teal-dim)",
  borderRadius: 6,
  cursor: "pointer",
  fontFamily: "var(--font-mono)",
  fontSize: 10.5,
};

export default ForgingInterstitial;
