/**
 * ForgingInterstitial — the bootstrap "forging your story" screen: a spinning ring plus a step
 * list that checks off in sequence. Each step has a status (pending / active / done / error).
 * The ring sweeps (mt-sweep); the active step pulses. Story-forward heading (serif), system
 * step labels (mono).
 */
import type { CSSProperties } from "react";
import { useReducedMotion } from "./_shared";

export type ForgeStepStatus = "pending" | "active" | "done" | "error";

export interface ForgeStep {
  label: string;
  status: ForgeStepStatus;
}

export interface ForgingInterstitialProps {
  /** Serif heading. Default "Forging your story". */
  title?: string;
  steps: ForgeStep[];
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
    case "pending":
      return { glyph: "○", color: "var(--muted)" };
  }
}

export function ForgingInterstitial(props: ForgingInterstitialProps): JSX.Element {
  const { title = "Forging your story", steps, animate = true, className, style } = props;
  const reduced = useReducedMotion();
  const play = animate && !reduced;
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
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 24, color: "var(--prose)" }}>{title}</div>
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
              {s.label}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default ForgingInterstitial;
