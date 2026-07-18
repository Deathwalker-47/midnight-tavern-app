/**
 * ThinkingIndicator — three brass dots doing a staggered ink-bob while the narrator composes.
 * Story register (brass). Under reduced motion the dots rest static at partial opacity.
 */
import type { CSSProperties } from "react";
import { useReducedMotion } from "./_shared";

export interface ThinkingIndicatorProps {
  /** Accessible label announced to screen readers. Default "Narrator is writing". */
  label?: string;
  /** Suppress the bob animation. Default true (animate). */
  animate?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function ThinkingIndicator(props: ThinkingIndicatorProps): JSX.Element {
  const { label = "Narrator is writing", animate = true, className, style } = props;
  const reduced = useReducedMotion();
  const play = animate && !reduced;
  return (
    <div
      className={className}
      role="status"
      aria-label={label}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, ...style }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          className={play ? "mt-ink" : undefined}
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--brass)",
            opacity: play ? undefined : 0.45,
            ...(play ? { animationDuration: "1.1s", animationDelay: `${i * 0.16}s` } : {}),
          }}
        />
      ))}
    </div>
  );
}

export default ThinkingIndicator;
