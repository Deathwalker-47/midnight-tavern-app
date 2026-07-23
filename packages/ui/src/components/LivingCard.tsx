/**
 * LivingCard — the character sheet, in two densities:
 *   compact (`LivingCard`)   — drawer/companion form: name + accent, player-visible resource
 *                              bars, mastery pips summary, mood, a couple of trait chips.
 *   full (`LivingCardView`)  — the Characters-page form: everything above plus inventory chips,
 *                              all skills with pips, relationships, likes/dislikes, recent
 *                              observations.
 *
 * Player cards accent brass; others teal. Fallen state (alive === false) desaturates the card,
 * pins HP to 0, shows a FALLEN marker, and uses --dead. Composes ResourceBar, MasteryPips,
 * Chip, RelationshipRow, DeadMarker. Consumes the core LivingCardView projection directly.
 *
 * Names are STORY register (serif); numbers/skills are SYSTEM register (mono).
 */
import type { CSSProperties, ReactNode } from "react";
import type { LivingCardView as CoreLivingCardView, MasteryRank } from "@midnight-tavern/core";
import { ResourceBar } from "./ResourceBar";
import { MasteryPips } from "./MasteryPips";
import { Chip } from "./Chip";
import { RelationshipRow } from "./RelationshipRow";
import { DeadMarker } from "./DeadMarker";

export interface LivingCardProps {
  card: CoreLivingCardView;
  /** Skill ids that recently advanced (drives the gold pip). */
  recentlyAdvancedSkillIds?: string[];
  /** Resolve a character id to a display name for relationships. Defaults to the id. */
  resolveName?: (id: string) => string;
  /** Suppress delta/advance animations. Default true (animate). */
  animate?: boolean;
  className?: string;
  style?: CSSProperties;
}

const KNOWN_RANKS: MasteryRank[] = ["novice", "adept", "expert", "master"];
function asRank(rank: string): MasteryRank {
  return (KNOWN_RANKS as string[]).includes(rank) ? (rank as MasteryRank) : "novice";
}

function CardShell(props: {
  card: CoreLivingCardView;
  accent: string;
  fallen: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}): JSX.Element {
  const { card, accent, fallen, className, style, children } = props;
  return (
    <section
      className={className}
      data-testid="living-card"
      data-fallen={fallen || undefined}
      data-player={card.isPlayer || undefined}
      style={{
        background: "linear-gradient(160deg, var(--bg2-card), var(--bg1-panel))",
        border: "1px solid var(--hairline)",
        borderTop: `2px solid ${accent}`,
        borderRadius: "var(--radius-card)",
        padding: "16px 18px",
        boxShadow: "var(--elevation)",
        opacity: fallen ? 0.72 : 1,
        filter: fallen ? "grayscale(0.65)" : undefined,
        fontFamily: "var(--font-ui)",
        ...style,
      }}
    >
      {children}
    </section>
  );
}

function CardHeader(props: { card: CoreLivingCardView; accent: string; fallen: boolean }): JSX.Element {
  const { card, accent, fallen } = props;
  return (
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 22, color: fallen ? "var(--dead)" : accent }}>
          {card.name}
        </span>
        {card.soft?.tier ? (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted)", letterSpacing: "0.06em" }}>
            {card.soft.tier.toUpperCase()}
          </span>
        ) : null}
      </div>
      {fallen ? <DeadMarker withGlyph /> : card.soft?.mood ? (
        <span style={{ fontSize: 12, color: "var(--secondary)", fontStyle: "italic" }}>{card.soft.mood}</span>
      ) : null}
    </header>
  );
}

/** The two registers share a resource-bar block; fallen forces the first (HP-like) bar to 0. */
function Resources(props: { card: CoreLivingCardView; fallen: boolean; animate: boolean; visibleOnly: boolean }): JSX.Element | null {
  const bars = props.card.resources.filter((r) => (props.visibleOnly ? r.playerVisible : true));
  if (bars.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
      {bars.map((r, i) => (
        <ResourceBar
          key={r.id}
          label={r.label}
          current={props.fallen && i === 0 ? 0 : r.current}
          max={r.max}
          wounded={props.fallen && i === 0}
          animate={props.animate}
        />
      ))}
    </div>
  );
}

function TraitChips(props: { traits: string[] }): JSX.Element | null {
  if (props.traits.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
      {props.traits.map((t, i) => (
        <Chip key={i} tone="keyword">
          {t}
        </Chip>
      ))}
    </div>
  );
}

function SectionLabel(props: { children: ReactNode }): JSX.Element {
  return (
    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", color: "var(--teal)", margin: "12px 0 8px" }}>
      {props.children}
    </div>
  );
}

function signed(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}

function Attributes(props: { card: CoreLivingCardView; compact?: boolean }): JSX.Element | null {
  if (props.card.attributes.length === 0) return null;
  return (
    <>
      <SectionLabel>ATTRIBUTES</SectionLabel>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: props.compact ? "repeat(3, minmax(0, 1fr))" : "repeat(2, minmax(0, 1fr))",
          gap: 7,
        }}
      >
        {props.card.attributes.map((attribute) => (
          <div
            key={attribute.attributeId}
            title={`${attribute.name}: ${attribute.description}`}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 7,
              padding: props.compact ? "6px 8px" : "8px 10px",
              background: "var(--teal-tint)",
              border: "1px solid var(--teal-dim)",
              borderRadius: 7,
              minWidth: 0,
            }}
          >
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--teal)", letterSpacing: ".08em" }}>
                {attribute.abbrev}
              </span>
              {!props.compact ? (
                <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, color: "var(--secondary)" }}>
                  {attribute.name}
                </span>
              ) : null}
            </span>
            <span style={{ display: "flex", alignItems: "baseline", gap: 5, fontFamily: "var(--font-mono)" }}>
              <strong style={{ fontSize: 15, color: "var(--ui-text)" }}>{attribute.score}</strong>
              <span style={{ fontSize: 10, color: "var(--brass)" }}>{signed(attribute.modifier)}</span>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

/** Compact drawer form. */
export function LivingCard(props: LivingCardProps): JSX.Element {
  const { card, recentlyAdvancedSkillIds = [], animate = true, className, style } = props;
  const fallen = !card.alive;
  const accent = fallen ? "var(--dead)" : card.isPlayer ? "var(--brass)" : "var(--teal)";
  const traits = card.soft?.traits ?? [];

  return (
    <CardShell card={card} accent={accent} fallen={fallen} className={className} style={style}>
      <CardHeader card={card} accent={accent} fallen={fallen} />
      <Resources card={card} fallen={fallen} animate={animate} visibleOnly />
      <Attributes card={card} compact />
      {card.skills.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          {card.skills.slice(0, 4).map((s) => (
            <span key={s.skillId} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ui-text)" }}>{s.name}</span>
              <MasteryPips rank={asRank(s.rank)} recentlyAdvanced={recentlyAdvancedSkillIds.includes(s.skillId)} animate={animate} />
            </span>
          ))}
        </div>
      ) : null}
      <TraitChips traits={traits.slice(0, 4)} />
    </CardShell>
  );
}

/** Full Characters-page form. */
export function LivingCardView(props: LivingCardProps): JSX.Element {
  const { card, recentlyAdvancedSkillIds = [], resolveName = (id) => id, animate = true, className, style } = props;
  const fallen = !card.alive;
  const accent = fallen ? "var(--dead)" : card.isPlayer ? "var(--brass)" : "var(--teal)";
  const soft = card.soft;

  return (
    <CardShell card={card} accent={accent} fallen={fallen} className={className} style={style}>
      <CardHeader card={card} accent={accent} fallen={fallen} />

      <Resources card={card} fallen={fallen} animate={animate} visibleOnly={false} />

      <Attributes card={card} />

      {soft?.traits && soft.traits.length > 0 ? (
        <>
          <SectionLabel>TRAITS</SectionLabel>
          <TraitChips traits={soft.traits} />
        </>
      ) : null}

      {card.skills.length > 0 ? (
        <>
          <SectionLabel>SKILLS</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {card.skills.map((s) => (
              <div key={s.skillId} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ui-text)" }}>{s.name}</span>
                  <MasteryPips
                    rank={asRank(s.rank)}
                    recentlyAdvanced={recentlyAdvancedSkillIds.includes(s.skillId)}
                    showModifier
                    animate={animate}
                  />
                </div>
                {s.toNext !== undefined && s.toNext !== null && s.successCount !== undefined ? (
                  <span style={{ alignSelf: "flex-end", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--muted)" }}>
                    {s.successCount} successes · {s.toNext} to next rank
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </>
      ) : null}

      {card.inventory.length > 0 ? (
        <>
          <SectionLabel>INVENTORY</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {card.inventory.map((it) => (
              <Chip key={it.itemId} tone="keyword">
                {it.name}
                {it.qty > 1 ? ` ×${it.qty}` : ""}
              </Chip>
            ))}
          </div>
        </>
      ) : null}

      {soft?.relationships && soft.relationships.length > 0 ? (
        <>
          <SectionLabel>RELATIONSHIPS</SectionLabel>
          <div>
            {soft.relationships.map((r, i) => (
              <RelationshipRow
                key={i}
                name={resolveName(r.toCharacterId)}
                trust={r.trust}
                power={r.power}
                {...(r.feeling !== undefined ? { feeling: r.feeling } : {})}
              />
            ))}
          </div>
        </>
      ) : null}

      {soft?.recentObservations && soft.recentObservations.length > 0 ? (
        <>
          <SectionLabel>RECENT</SectionLabel>
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
            {soft.recentObservations.slice(0, 5).map((o, i) => (
              <li key={i} style={{ fontFamily: "var(--font-prose)", fontSize: 13.5, color: "var(--secondary)", lineHeight: 1.5 }}>
                {o}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </CardShell>
  );
}

export default LivingCard;
