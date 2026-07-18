/**
 * Chip — a small mono pill used for fit badges and status tags. Design-system tones:
 *   recommended — success text + success border  ("RECOMMENDED")
 *   advanced    — brass-ish amber text + hairline border ("ADVANCED — RESULTS MAY VARY")
 *   fallen      — dead text + dead border ("FALLEN")
 *   keyword     — neutral raised chip for lorebook keys / traits
 *
 * SYSTEM register (mono). Optional onClick makes it a button (keyboard-accessible); otherwise
 * it is a static <span>.
 */
import type { CSSProperties, ReactNode } from "react";

export type ChipTone = "recommended" | "advanced" | "fallen" | "keyword";

export interface ChipProps {
  tone?: ChipTone;
  children: ReactNode;
  onClick?: () => void;
  title?: string;
  className?: string;
  style?: CSSProperties;
}

function toneStyle(tone: ChipTone): CSSProperties {
  switch (tone) {
    case "recommended":
      return { color: "var(--success)", border: "1px solid var(--success)" };
    case "advanced":
      return { color: "var(--brass)", border: "1px solid var(--hairline)" };
    case "fallen":
      return { color: "var(--dead)", border: "1px solid var(--dead)" };
    case "keyword":
      return { color: "var(--ui-text)", border: "1px solid var(--hairline)", background: "var(--bg3-raised)" };
  }
}

export function Chip(props: ChipProps): JSX.Element {
  const { tone = "keyword", children, onClick, title, className, style } = props;
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    borderRadius: "var(--radius-chip)",
    padding: "3px 8px",
    lineHeight: 1.3,
    whiteSpace: "nowrap",
    ...toneStyle(tone),
    ...style,
  };
  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={title} className={className} data-tone={tone} style={{ ...base, cursor: "pointer", background: base.background ?? "transparent" }}>
        {children}
      </button>
    );
  }
  return (
    <span className={className} title={title} data-tone={tone} style={base}>
      {children}
    </span>
  );
}

export default Chip;
