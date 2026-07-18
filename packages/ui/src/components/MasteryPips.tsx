/**
 * MasteryPips — ●●●○○ across the four ranks. A learned skill's rank sets how many of five pips
 * are filled: novice(+1)=1 · adept(+3)=3 · expert(+5)=5 · master(+7)=5 (master and expert both
 * fill all five; master is distinguished by --crit-gold). When `recentlyAdvanced` is set, the
 * newest filled pip turns --crit-gold with a small gold dot and pulses once, then rests static.
 *
 * SYSTEM register (mono). Pip count is derived from rank, matching MASTERY_MOD in core.
 */
import type { CSSProperties } from "react";
import type { MasteryRank } from "@midnight-tavern/core";
import { MASTERY_MOD } from "@midnight-tavern/core";
import { FONT, useReducedMotion } from "./_shared";

export interface MasteryPipsProps {
  rank: MasteryRank;
  /** Total pips shown. Default 5. */
  total?: number;
  /** The skill just advanced: newest filled pip goes gold with a dot + one-shot pulse. */
  recentlyAdvanced?: boolean;
  /** Show the numeric modifier (+1/+3/+5/+7) after the pips. Default false. */
  showModifier?: boolean;
  /** Suppress the advance pulse (still shows the static gold dot). Default true (animate). */
  animate?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** Filled-pip count for a rank (novice 1, adept 3, expert/master 5). */
export function pipsForRank(rank: MasteryRank): number {
  switch (rank) {
    case "novice":
      return 1;
    case "adept":
      return 3;
    case "expert":
      return 5;
    case "master":
      return 5;
  }
}

export function MasteryPips(props: MasteryPipsProps): JSX.Element {
  const { rank, total = 5, recentlyAdvanced = false, showModifier = false, animate = true, className, style } = props;
  const reduced = useReducedMotion();
  const filled = pipsForRank(rank);
  // Master fills all five but is called out in gold; advanced also uses gold on the newest pip.
  const goldBase = rank === "master" ? "var(--crit-gold)" : "var(--teal)";
  const advancedIndex = recentlyAdvanced ? filled - 1 : -1;

  const pips = Array.from({ length: total }, (_, i) => {
    const isFilled = i < filled;
    const isAdvanced = i === advancedIndex;
    const color = !isFilled ? "var(--muted)" : isAdvanced ? "var(--crit-gold)" : goldBase;
    const pulse = isAdvanced && animate && !reduced;
    return (
      <span
        key={i}
        data-testid={isFilled ? "pip-filled" : "pip-empty"}
        data-advanced={isAdvanced || undefined}
        style={{
          position: "relative",
          color,
          ...(pulse
            ? {
                animationName: "mt-fade",
                animationDuration: "var(--motion-med)",
                animationFillMode: "both",
              }
            : {}),
        }}
      >
        {isFilled ? "●" : "○"}
        {isAdvanced ? (
          <span
            aria-hidden="true"
            data-testid="pip-advanced-dot"
            style={{
              position: "absolute",
              top: -3,
              right: -3,
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: "var(--crit-gold)",
              boxShadow: "0 0 4px var(--crit-gold)",
            }}
          />
        ) : null}
      </span>
    );
  });

  return (
    <span
      className={className}
      data-testid="mastery-pips"
      data-rank={rank}
      aria-label={`${rank} (${filled} of ${total})`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        fontFamily: FONT.mono,
        fontSize: 11,
        letterSpacing: "2px",
        ...style,
      }}
    >
      {pips}
      {showModifier ? (
        <span style={{ marginLeft: 6, letterSpacing: "normal", color: "var(--muted)" }}>
          +{MASTERY_MOD[rank]}
        </span>
      ) : null}
    </span>
  );
}

export default MasteryPips;
