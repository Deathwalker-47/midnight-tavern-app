/**
 * RulingArtifact — THE signature component. The embedded verdict card that mounts mid-prose in
 * the story stream. It carries the SYSTEM register only (mono, teal/verdict colors); it never
 * borrows story serif/brass.
 *
 * The reveal (~900ms) plays in sequence (design system §Motion):
 *   1. die settles      — mt-die, ~350ms, ease-settle
 *   2. math fades in     — mt-fade, ~400ms, delay ~350ms
 *   3. total counts up   — integer tween, ~600ms, delay ~500ms (useCountUp)
 *   4. verdict stamps    — mt-stamp overshoot, ~500ms, delay ~850ms
 *   5. crits add a ring-burst around the die (mt-ring, delay ~400ms) and ~300ms overall.
 * `prefers-reduced-motion: reduce` collapses every duration to ~0 (tokens + motion.css guard),
 * and `animate={false}` renders final values immediately for tests and long lists.
 *
 * Variants: success · failure · crit-success · crit-failure · opposed · npc · stacked · denied.
 * DENIED has no die (dashed ⊘ glyph, --dead, reason + optional hint).
 */
import type { CSSProperties, ReactNode } from "react";
import type { RollOutcome } from "./_shared";
import { FONT, outcomeStamp, outcomeVar, useCountUp, useReducedMotion } from "./_shared";

/** One resolved roll — the math the card renders honestly. */
export interface RulingRoll {
  /** Optional caption above the math, e.g. "Persuade the warden". */
  title?: string;
  outcome: RollOutcome;
  d20: number;
  modifier: number;
  total: number;
  dc: number;
  /** Override the default stamp text (SUCCESS / FAILURE / CRITICAL / CRIT FAIL). */
  stamp?: string;
  /** For opposed contests: label each side instead of the flat `d20 X + mod` line. */
  opposed?: { attacker: string; defender: string };
}

export type RulingArtifactVariant =
  | "success"
  | "failure"
  | "crit-success"
  | "crit-failure"
  | "opposed"
  | "npc"
  | "stacked"
  | "denied";

export interface RulingArtifactProps {
  variant: RulingArtifactVariant;
  /** Register label, e.g. "RULING · SUCCESS". Defaults from the variant. */
  label?: string;
  /** The roll for single-roll variants (success, failure, crit, opposed, npc). */
  roll?: RulingRoll;
  /** Two rolls for the `stacked` variant (e.g. enemy hits, then player ripostes). */
  rolls?: [RulingRoll, RulingRoll];
  /** DENIED: why the gate refused the action (system voice). */
  reason?: string;
  /** DENIED: an optional hint on how to satisfy the gate. */
  hint?: string;
  /** Optional italic result line beneath the math (narrated consequence, serif is NOT used — kept mono/secondary). */
  resultLine?: string;
  /** Optional mastery / effect line, e.g. "Lockpicking → adept" or "12 damage dealt". */
  effectLine?: string;
  /** Disable the reveal animation; render final values immediately. Default true (animate). */
  animate?: boolean;
  className?: string;
  style?: CSSProperties;
}

const LABEL_BY_VARIANT: Record<RulingArtifactVariant, string> = {
  success: "RULING · SUCCESS",
  failure: "RULING · FAILURE",
  "crit-success": "RULING · NAT 20",
  "crit-failure": "RULING · NAT 1",
  opposed: "RULING · OPPOSED",
  npc: "RULING · NPC",
  stacked: "RULING · EXCHANGE",
  denied: "RULING · DENIED",
};

/** Resolve the accent color that carries the left border + bg tint. */
function accentFor(props: RulingArtifactProps): string {
  if (props.variant === "denied") return "var(--dead)";
  if (props.variant === "opposed" || props.variant === "npc") return "var(--teal)";
  if (props.variant === "stacked") {
    // The exchange takes its color from the final (second) roll's outcome.
    const last = props.rolls?.[1] ?? props.rolls?.[0];
    return last ? outcomeVar(last.outcome) : "var(--teal)";
  }
  if (props.roll) return outcomeVar(props.roll.outcome);
  // Fall back to the variant name when it is itself an outcome.
  return outcomeVar(props.variant as RollOutcome);
}

function anim(name: string, delay: string, duration: string, reduced: boolean): CSSProperties {
  if (reduced) return {};
  return { animationName: name, animationDelay: delay, animationDuration: duration, animationFillMode: "both" };
}

function DieBlock(props: {
  roll: RulingRoll;
  color: string;
  animate: boolean;
  reduced: boolean;
  crit: boolean;
}): ReactNode {
  const { roll, color, animate, reduced, crit } = props;
  const play = animate && !reduced;
  const dieStyle: CSSProperties = {
    width: 44,
    height: 44,
    flex: "0 0 44px",
    borderRadius: 9,
    background: "var(--bg0-ground)",
    border: `1px solid ${color}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: FONT.mono,
    fontWeight: 600,
    fontSize: 18,
    color,
    position: "relative",
    ...(play ? { ...anim("mt-die", "0s", "0.35s", reduced), animationTimingFunction: "var(--ease-settle)" } : {}),
  };
  return (
    <div style={dieStyle} data-testid="ruling-die">
      {roll.d20}
      {crit && play ? (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: -2,
            borderRadius: 11,
            border: `2px solid ${color}`,
            ...anim("mt-ring", "0.4s", "1.1s", reduced),
            animationTimingFunction: "ease-out",
          }}
          data-testid="ruling-ring"
        />
      ) : null}
    </div>
  );
}

function MathBlock(props: {
  roll: RulingRoll;
  color: string;
  animate: boolean;
  reduced: boolean;
}): ReactNode {
  const { roll, color, animate, reduced } = props;
  const play = animate && !reduced;
  const total = useCountUp(roll.total, { enabled: play });
  const style: CSSProperties = {
    flex: 1,
    minWidth: 0,
    ...(play ? { ...anim("mt-fade", "0.35s", "0.4s", reduced), animationTimingFunction: "ease" } : {}),
  };
  return (
    <div style={style}>
      {roll.title ? (
        <div style={{ fontSize: 12, color: "var(--secondary)", marginBottom: 3 }}>{roll.title}</div>
      ) : null}
      <div style={{ fontFamily: FONT.mono, fontSize: 13.5, color: "var(--ui-text)" }} data-testid="ruling-math">
        {roll.opposed ? (
          <span>
            {roll.opposed.attacker} vs {roll.opposed.defender}
          </span>
        ) : (
          <>
            <span>d20 </span>
            <b style={{ color }}>{roll.d20}</b>
            <span style={{ color: "var(--muted)" }}>{` ${roll.modifier < 0 ? "-" : "+"} ${Math.abs(roll.modifier)} = `}</span>
            <b style={{ color, fontSize: 15 }} data-testid="ruling-total">
              {total}
            </b>
            <span style={{ color: "var(--muted)" }}>{`  vs DC ${roll.dc}`}</span>
          </>
        )}
      </div>
    </div>
  );
}

function StampBlock(props: { roll: RulingRoll; color: string; animate: boolean; reduced: boolean }): ReactNode {
  const { roll, color, animate, reduced } = props;
  const play = animate && !reduced;
  const style: CSSProperties = {
    fontFamily: FONT.mono,
    fontWeight: 600,
    fontSize: 12,
    letterSpacing: "0.1em",
    color,
    border: `2px solid ${color}`,
    borderRadius: "var(--radius-stamp)",
    padding: "5px 9px",
    transform: "rotate(-6deg)",
    whiteSpace: "nowrap",
    ...(play ? { ...anim("mt-stamp", "0.85s", "0.5s", reduced), animationTimingFunction: "cubic-bezier(.3,1.4,.4,1)" } : {}),
  };
  return (
    <div style={style} data-testid="ruling-stamp">
      {roll.stamp ?? outcomeStamp(roll.outcome)}
    </div>
  );
}

function RollRow(props: { roll: RulingRoll; color: string; animate: boolean; reduced: boolean }): ReactNode {
  const { roll, color, animate, reduced } = props;
  const crit = roll.outcome === "crit-success" || roll.outcome === "crit-failure";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <DieBlock roll={roll} color={color} animate={animate} reduced={reduced} crit={crit} />
      <MathBlock roll={roll} color={color} animate={animate} reduced={reduced} />
      <StampBlock roll={roll} color={color} animate={animate} reduced={reduced} />
    </div>
  );
}

export function RulingArtifact(props: RulingArtifactProps): ReactNode {
  const { variant, animate = true, className, style } = props;
  const reduced = useReducedMotion();
  const accent = accentFor(props);
  const label = props.label ?? LABEL_BY_VARIANT[variant];

  const cardStyle: CSSProperties = {
    background: "linear-gradient(160deg, var(--bg2-card), var(--bg1-panel))",
    border: `1px solid color-mix(in srgb, ${accent} 27%, transparent)`,
    borderLeft: `3px solid ${accent}`,
    borderRadius: "var(--radius-card)",
    padding: "14px 16px",
    boxShadow: "var(--elevation)",
    position: "relative",
    overflow: "hidden",
    ...style,
  };

  const head = (
    <div
      style={{
        fontFamily: FONT.mono,
        fontSize: 10,
        letterSpacing: "0.16em",
        color: "var(--teal)",
        marginBottom: 8,
      }}
      data-testid="ruling-label"
    >
      {label}
    </div>
  );

  let body: ReactNode;
  if (variant === "denied") {
    body = (
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          aria-hidden="true"
          style={{
            width: 40,
            height: 40,
            flex: "0 0 40px",
            borderRadius: 8,
            border: "1px dashed var(--dead)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--dead)",
            fontSize: 20,
          }}
          data-testid="ruling-denied-glyph"
        >
          ⊘
        </div>
        <div>
          <div style={{ fontFamily: FONT.mono, fontWeight: 600, fontSize: 15, color: "var(--dead)" }}>DENIED</div>
          {props.reason ? (
            <div style={{ fontSize: 12.5, color: "var(--secondary)", marginTop: 2 }} data-testid="ruling-reason">
              {props.reason}
            </div>
          ) : null}
          {props.hint ? (
            <div style={{ fontFamily: FONT.mono, fontSize: 11.5, color: "var(--muted)", marginTop: 4 }} data-testid="ruling-hint">
              {props.hint}
            </div>
          ) : null}
        </div>
      </div>
    );
  } else if (variant === "stacked") {
    const rolls = props.rolls ?? (props.roll ? ([props.roll, props.roll] as [RulingRoll, RulingRoll]) : undefined);
    body = (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rolls?.map((r, i) => (
          <RollRow key={i} roll={r} color={outcomeVar(r.outcome)} animate={animate} reduced={reduced} />
        ))}
      </div>
    );
  } else if (props.roll) {
    body = <RollRow roll={props.roll} color={accent} animate={animate} reduced={reduced} />;
  } else {
    body = null;
  }

  return (
    <div role="group" aria-label={label} className={className} style={cardStyle} data-variant={variant}>
      {head}
      {body}
      {props.resultLine ? (
        <div
          style={{ fontStyle: "italic", fontSize: 12.5, color: "var(--secondary)", marginTop: 10 }}
          data-testid="ruling-result"
        >
          {props.resultLine}
        </div>
      ) : null}
      {props.effectLine ? (
        <div
          style={{ fontFamily: FONT.mono, fontSize: 11.5, color: accent, marginTop: 6 }}
          data-testid="ruling-effect"
        >
          {props.effectLine}
        </div>
      ) : null}
    </div>
  );
}

export default RulingArtifact;
