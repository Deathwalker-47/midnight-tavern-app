/**
 * ModelStatusChip — the rail's connection indicator: a colored dot (green connected / amber
 * validating / red error / grey idle) + a model name. SYSTEM register (mono). The connected
 * dot glows; the validating dot pulses.
 */
import type { CSSProperties } from "react";

export type ModelStatus = "connected" | "validating" | "error" | "idle";

export interface ModelStatusChipProps {
  status: ModelStatus;
  /** Model or role name, e.g. "Narrator connected" or "claude-3-5-sonnet". */
  label: string;
  /** Suppress the pulse on the validating dot. Default true (animate). */
  animate?: boolean;
  className?: string;
  style?: CSSProperties;
}

interface StatusTone {
  color: string;
  glow: boolean;
  pulse: boolean;
}

export function modelStatusTone(status: ModelStatus): StatusTone {
  switch (status) {
    case "connected":
      return { color: "var(--success)", glow: true, pulse: false };
    case "validating":
      return { color: "var(--brass)", glow: false, pulse: true };
    case "error":
      return { color: "var(--failure)", glow: false, pulse: false };
    case "idle":
      return { color: "var(--muted)", glow: false, pulse: false };
  }
}

export function ModelStatusChip(props: ModelStatusChipProps): JSX.Element {
  const { status, label, animate = true, className, style } = props;
  const tone = modelStatusTone(status);
  return (
    <span
      className={className}
      data-status={status}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        color: tone.color,
        ...style,
      }}
    >
      <span
        aria-hidden="true"
        className={tone.pulse && animate ? "mt-pulse" : undefined}
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: tone.color,
          ...(tone.glow ? { boxShadow: `0 0 6px ${tone.color}` } : {}),
          ...(tone.pulse && animate ? { animationDuration: "1.4s" } : {}),
        }}
      />
      {label}
    </span>
  );
}

export default ModelStatusChip;
