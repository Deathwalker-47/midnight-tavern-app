import type { CSSProperties } from "react";

export interface SkillProgressProps {
  name: string;
  definition: string;
  rank: string;
  currentXp: number;
  nextThreshold?: number | null;
  latestAward?: { xp: number; reason: string; rulingRef?: string };
  linkedAttribute?: string;
  permits?: string[];
  rankUp?: { from: string; to: string };
  rewound?: boolean;
  compact?: boolean;
}

export function SkillProgress(props: SkillProgressProps): JSX.Element {
  const maxed = props.nextThreshold === null || props.nextThreshold === undefined;
  const pct = maxed ? 100 : Math.max(0, Math.min(100, Math.round((props.currentXp / props.nextThreshold!) * 100)));
  const accent = props.rankUp ? "var(--brass)" : props.rewound ? "var(--muted)" : "var(--teal)";
  return (
    <article data-testid="skill-progress" data-rank={props.rank.toLowerCase()} style={{
      background: "var(--bg1-panel)", border: `1px solid ${props.rankUp ? "var(--brass-dim)" : "var(--hairline)"}`,
      borderRadius: "var(--radius-chip)", padding: props.compact ? "10px 12px" : "13px 15px",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <strong style={{ color: "var(--ui-text)", fontSize: 13.5 }}>{props.name}</strong>
        <span style={{ color: accent, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase" }}>
          {props.rank}{maxed ? " · MASTERED" : ""}
        </span>
      </div>
      {!props.compact ? <p style={{ margin: "5px 0 0", color: "var(--secondary)", fontSize: 12, lineHeight: 1.5 }}>{props.definition}</p> : null}
      {!props.compact && (props.linkedAttribute || props.permits?.length) ? (
        <div style={{ marginTop: 7, color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 10.5 }}>
          {props.linkedAttribute ? `${props.linkedAttribute} · ` : ""}{props.permits?.join(", ")}
        </div>
      ) : null}
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 9 }}>
        <div style={{ flex: 1, height: 5, background: "var(--bg0-ground)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: accent, borderRadius: 4 }} />
        </div>
        <span style={{ color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 10, whiteSpace: "nowrap" }}>
          {maxed ? `${props.currentXp} XP` : `${props.currentXp} / ${props.nextThreshold} XP`}
        </span>
      </div>
      {props.latestAward ? (
        <div style={awardStyle}>
          <strong style={{ color: props.rewound ? "var(--muted)" : "var(--success)" }}>
            {props.rewound ? "REWOUND" : `+${props.latestAward.xp} XP`}
          </strong>
          <span>{props.latestAward.reason}</span>
          {props.latestAward.rulingRef ? <span style={{ color: "var(--teal)" }}>{props.latestAward.rulingRef}</span> : null}
        </div>
      ) : null}
      {props.rankUp ? <div role="status" style={{ marginTop: 9, color: "var(--brass)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
        ◆ RANK UP · {props.rankUp.from.toUpperCase()} → {props.rankUp.to.toUpperCase()}
      </div> : null}
    </article>
  );
}

const awardStyle: CSSProperties = {
  display: "flex", flexWrap: "wrap", gap: 7, alignItems: "center", marginTop: 8,
  color: "var(--secondary)", fontFamily: "var(--font-mono)", fontSize: 10.5,
};
