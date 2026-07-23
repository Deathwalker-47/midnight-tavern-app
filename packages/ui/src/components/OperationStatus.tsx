import type { CSSProperties } from "react";
import { ThinkingIndicator } from "./ThinkingIndicator.js";
import type { TurnOperationPhase } from "../bridge/core.js";

export type { TurnOperationPhase } from "../bridge/core.js";

const COPY: Record<Exclude<TurnOperationPhase, "idle">, string> = {
  classifying: "Reading your actions",
  "classifier-recovery": "The mechanics classifier needs recovery",
  ruling: "The DM is resolving mechanics",
  "generating-loot": "Validating the encounter reward",
  thinking: "The narrator is thinking",
  streaming: "The story continues",
  saving: "Saving the completed exchange",
  error: "The exchange stopped with an error",
  cancelled: "Generation was cancelled",
  "timed-out": "The provider timed out",
  stale: "An interrupted exchange can be recovered",
};

export function OperationStatus(props: {
  phase: TurnOperationPhase;
  animate?: boolean;
  detail?: string;
  onResume?: () => void;
  onDismiss?: () => void;
}): JSX.Element | null {
  if (props.phase === "idle") return null;
  const terminal = ["error", "cancelled", "timed-out", "stale"].includes(props.phase);
  return (
    <div role="status" data-operation-phase={props.phase} style={{
      display: "flex", alignItems: "center", gap: 9, padding: "8px 10px",
      color: terminal ? "var(--brass)" : "var(--secondary)",
      background: terminal ? "var(--brass-tint)" : "transparent",
      border: terminal ? "1px solid var(--brass-dim)" : "1px solid transparent",
      borderRadius: 7, fontSize: 12,
    }}>
      {!terminal ? <ThinkingIndicator animate={props.animate} /> : <span aria-hidden="true">◇</span>}
      <span>{COPY[props.phase]}{props.detail ? ` · ${props.detail}` : ""}</span>
      <span style={{ flex: 1 }} />
      {props.onResume && (props.phase === "stale" || props.phase === "timed-out") ? <button type="button" style={action} onClick={props.onResume}>Resume</button> : null}
      {props.onDismiss && terminal ? <button type="button" style={action} onClick={props.onDismiss}>Dismiss</button> : null}
    </div>
  );
}

const action: CSSProperties = { color: "var(--teal)", background: "transparent", border: 0, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10.5 };
