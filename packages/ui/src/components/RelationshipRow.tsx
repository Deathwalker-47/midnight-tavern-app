/**
 * RelationshipRow — one directional relationship line on a LivingCard: the other character's
 * name (story register, serif) with an optional feeling word, plus two small mono meters for
 * trust and power (each clamped to [-1, 1], rendered as a centered diverging bar).
 *
 * Consumes the core Relationship shape but also accepts a resolved display name (the view-model
 * carries ids; the screen resolves names).
 */
import type { CSSProperties } from "react";
import type { Relationship } from "@midnight-tavern/core";

export interface RelationshipRowProps {
  /** Display name of the target character (resolved from toCharacterId by the caller). */
  name: string;
  /** trust in [-1, 1]. */
  trust: number;
  /** power in [-1, 1]. */
  power: number;
  feeling?: string;
  className?: string;
  style?: CSSProperties;
}

/** Build a RelationshipRow props object from a core Relationship + a resolved name. */
export function relationshipRowProps(rel: Relationship, name: string): RelationshipRowProps {
  return {
    name,
    trust: rel.trust,
    power: rel.power,
    ...(rel.feeling !== undefined ? { feeling: rel.feeling } : {}),
  };
}

/** A diverging meter centered at 0; positive fills teal to the right, negative failure to the left. */
function Meter(props: { label: string; value: number }): JSX.Element {
  const v = Math.max(-1, Math.min(1, props.value));
  const pct = Math.abs(v) * 50;
  const color = v >= 0 ? "var(--teal)" : "var(--failure)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--muted)", width: 34, letterSpacing: "0.04em" }}>
        {props.label}
      </span>
      <div
        style={{ position: "relative", width: 56, height: 4, background: "var(--bg0-ground)", borderRadius: 3 }}
        role="meter"
        aria-valuenow={v}
        aria-valuemin={-1}
        aria-valuemax={1}
        aria-label={props.label}
      >
        <div style={{ position: "absolute", left: "50%", top: -1, bottom: -1, width: 1, background: "var(--hairline)" }} />
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            background: color,
            borderRadius: 3,
            ...(v >= 0 ? { left: "50%", width: `${pct}%` } : { right: "50%", width: `${pct}%` }),
          }}
        />
      </div>
    </div>
  );
}

export function RelationshipRow(props: RelationshipRowProps): JSX.Element {
  const { name, trust, power, feeling, className, style } = props;
  return (
    <div
      className={className}
      data-testid="relationship-row"
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "5px 0", ...style }}
    >
      <div style={{ minWidth: 0 }}>
        <span style={{ fontFamily: "var(--font-prose)", fontSize: 14, color: "var(--brass)" }}>{name}</span>
        {feeling ? <span style={{ fontSize: 12, color: "var(--secondary)", marginLeft: 8, fontStyle: "italic" }}>{feeling}</span> : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <Meter label="TRUST" value={trust} />
        <Meter label="POWER" value={power} />
      </div>
    </div>
  );
}

export default RelationshipRow;
