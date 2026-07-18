/**
 * DeadMarker — the small "FALLEN" tag used on cards and the party strip when a character's
 * hard state has alive=false. SYSTEM register (mono), --dead color. Purely presentational.
 */
import type { CSSProperties } from "react";

export interface DeadMarkerProps {
  /** Label text. Default "FALLEN". */
  label?: string;
  /** Show a leading ✝ glyph. Default false. */
  withGlyph?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function DeadMarker(props: DeadMarkerProps): JSX.Element {
  const { label = "FALLEN", withGlyph = false, className, style } = props;
  return (
    <span
      className={className}
      data-testid="dead-marker"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        letterSpacing: "0.08em",
        color: "var(--dead)",
        ...style,
      }}
    >
      {withGlyph ? <span aria-hidden="true">✝</span> : null}
      {label}
    </span>
  );
}

export default DeadMarker;
