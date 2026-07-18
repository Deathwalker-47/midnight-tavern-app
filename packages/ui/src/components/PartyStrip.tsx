/**
 * PartyStrip — the slim present-cast strip atop the story stream. Each member: a small
 * avatar/initial tile, name, a player-visible HP bar, and a mood glyph from soft state. Player
 * tiles accent brass; others teal. Fallen members are desaturated with the FALLEN treatment and
 * a 0% bar. Clicking a member opens their LivingCard (caller-provided onSelect).
 *
 * Responsive: below `collapseBelow` px (default ~900) the strip collapses to avatars only. Since
 * this is a pure component with no access to window width by contract, the caller passes
 * `collapsed` (screens wire it to a media query); a built-in container-query fallback is not
 * used to keep it deterministic for tests.
 */
import type { CSSProperties } from "react";
import { DeadMarker } from "./DeadMarker";

export interface PartyMember {
  id: string;
  name: string;
  isPlayer: boolean;
  /** Avatar initials, e.g. "KV". Falls back to the first two name letters. */
  initials?: string;
  /** Player-visible HP fraction 0..1. Omit when HP is hidden for this member. */
  hpFraction?: number;
  /** Mood glyph from soft state, e.g. "◑". */
  mood?: string;
  alive?: boolean;
}

export interface PartyStripProps {
  members: PartyMember[];
  onSelect?: (id: string) => void;
  /** Render avatars only (narrow layout). Default false. */
  collapsed?: boolean;
  className?: string;
  style?: CSSProperties;
}

function initialsFor(m: PartyMember): string {
  if (m.initials) return m.initials;
  const parts = m.name.trim().split(/\s+/);
  const a = parts[0]?.[0] ?? "";
  const b = parts[1]?.[0] ?? parts[0]?.[1] ?? "";
  return (a + b).toUpperCase();
}

function hpColor(fraction: number): string {
  if (fraction <= 0.25) return "var(--failure)";
  if (fraction < 0.5) return "var(--crit-gold)";
  return "var(--success)";
}

export function PartyStrip(props: PartyStripProps): JSX.Element {
  const { members, onSelect, collapsed = false, className, style } = props;
  return (
    <div
      className={className}
      role="list"
      aria-label="Present party"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 14px",
        border: "1px solid var(--hairline)",
        borderRadius: "var(--radius-card)",
        background: "var(--bg1-panel)",
        flexWrap: "wrap",
        ...style,
      }}
    >
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.12em", color: "var(--muted)" }}>PRESENT</span>
      {members.map((m) => {
        const fallen = m.alive === false;
        const accent = fallen ? "var(--dead)" : m.isPlayer ? "var(--brass)" : "var(--teal)";
        const frac = fallen ? 0 : Math.max(0, Math.min(1, m.hpFraction ?? 0));
        const clickable = Boolean(onSelect);
        const Tag: "button" | "div" = clickable ? "button" : "div";
        return (
          <Tag
            key={m.id}
            role="listitem"
            {...(clickable ? { type: "button", onClick: () => onSelect?.(m.id), "aria-label": `${m.name}${fallen ? ", fallen" : ""}` } : {})}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              background: fallen ? "var(--bg0-ground)" : "var(--bg2-card)",
              border: `1px solid color-mix(in srgb, ${accent} 33%, transparent)`,
              borderRadius: 9,
              padding: "6px 12px 6px 6px",
              opacity: fallen ? 0.6 : 1,
              filter: fallen ? "grayscale(0.7)" : undefined,
              cursor: clickable ? "pointer" : "default",
              font: "inherit",
              textAlign: "left",
            }}
            data-fallen={fallen || undefined}
          >
            <span
              aria-hidden="true"
              style={{
                width: 30,
                height: 30,
                flex: "0 0 30px",
                borderRadius: 7,
                background: "var(--bg3-raised)",
                border: `1px solid color-mix(in srgb, ${accent} 33%, transparent)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 14,
                color: accent,
              }}
            >
              {initialsFor(m)}
            </span>
            {collapsed ? null : (
              <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: fallen ? "var(--dead)" : "var(--prose)" }}>{m.name}</span>
                  {fallen ? <DeadMarker /> : m.mood ? <span style={{ fontSize: 11, color: "var(--secondary)" }}>{m.mood}</span> : null}
                </span>
                {m.hpFraction !== undefined || fallen ? (
                  <span style={{ width: 66, height: 4, background: "var(--bg0-ground)", borderRadius: 3, overflow: "hidden", display: "block" }}>
                    <span style={{ display: "block", height: "100%", width: `${frac * 100}%`, background: fallen ? "var(--dead)" : hpColor(frac), borderRadius: 3 }} />
                  </span>
                ) : null}
              </span>
            )}
          </Tag>
        );
      })}
    </div>
  );
}

export default PartyStrip;
