/**
 * CharacterDossier — the deep, read-only character profile (low-level-plan-v2 §7;
 * Design/handoff-v2/screens/CharacterDossier.dc.html).
 *
 * Two registers on one page, walled apart exactly as the design mandates:
 *   • STORY REGISTER (left) — mentality (traits, behavioral signatures, outlook), past
 *     (backstory + observation timeline), relationships (outgoing + reverse-resolved incoming),
 *     and involved world threads. All soft, serif, model-derived.
 *   • SYSTEM REGISTER (right) — "THE SHEET": resources, skills with mastery progress, inventory,
 *     alive/fallen status. All hard, mono, dice-authored. Explicitly non-editable ("set by dice
 *     and rules — they can't be edited by hand").
 *
 * Pure read model: data comes from `bridge.getCharacterDossier(storyId, characterId)`. Identity is
 * authored in the blueprint (link out), never here. The character id is read from the route param
 * `characterId`; `storyId` from props/route.
 *
 * State matrix: no-story / no-character · loading · error · fallen (desaturated, FALLEN badge) ·
 * sparse (few observations → invite copy) · narrow (<~1000px collapses the two columns to one) ·
 * reduced-motion (fade gated on the token).
 */
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { ScreenProps } from "./registry.js";
import { getBridge } from "../bridge/core.js";
import type { Dossier } from "../bridge/core.js";
import { useRoute } from "../app/router.js";
import { useReducedMotion, EmptyState, InlineNotice, MasteryPips } from "../components/index.js";
import type { MasteryPipsProps } from "../components/index.js";

type MasteryRank = MasteryPipsProps["rank"];
const MASTERY_RANKS: readonly string[] = ["novice", "adept", "expert", "master"];
/** Narrow the dossier's free-string rank to the MasteryPips union, defaulting to novice. */
function asMasteryRank(rank: string): MasteryRank {
  return (MASTERY_RANKS.includes(rank) ? rank : "novice") as MasteryRank;
}

type LoadState =
  | { phase: "no-target" }
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; dossier: Dossier; statMode: "none" | "full" };

const MONO_LABEL: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.14em",
  color: "var(--brass)",
};

const SUB_LABEL: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: "0.1em",
  color: "var(--muted)",
};

/** Section header: mono caption + a hairline rule filling the row. */
function SectionRule(props: { label: string }): JSX.Element {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 13 }}>
      <span style={MONO_LABEL}>{props.label}</span>
      <div style={{ flex: 1, height: 1, background: "var(--hairline)" }} />
    </div>
  );
}

/** trust ∈ [-1,1] → bar width %, color, and signed label (mirrors the design's trustBar). */
function trustView(v: number): { pct: number; color: string; label: string } {
  const pct = Math.round(((v + 1) / 2) * 100);
  const color = v >= 0.3 ? "var(--success)" : v < 0 ? "var(--danger)" : "var(--brass)";
  return { pct, color, label: `${v >= 0 ? "+" : ""}${v.toFixed(1)}` };
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function CharacterDossier(props: ScreenProps): JSX.Element {
  const { params } = useRoute();
  const storyId = props.storyId ?? params.storyId;
  const characterId = params.characterId;
  const reduced = useReducedMotion();
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  // Narrow layout collapses the two-register grid; measured off the window width.
  const [narrow, setNarrow] = useState<boolean>(
    () => typeof window !== "undefined" && window.innerWidth < 1000
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setNarrow(window.innerWidth < 1000);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!storyId || !characterId) {
      setState({ phase: "no-target" });
      return;
    }
    let cancelled = false;
    setState({ phase: "loading" });
    (async () => {
      const bridge = getBridge();
      const [dossier, story] = await Promise.all([
        bridge.getCharacterDossier(storyId, characterId),
        bridge.getStory(storyId),
      ]);
      if (cancelled) return;
      if (!dossier) {
        setState({ phase: "error", message: "This character isn't in the story's cast." });
        return;
      }
      setState({ phase: "ready", dossier, statMode: story?.schema.statMode === "full" ? "full" : "none" });
    })().catch((err: unknown) => {
      if (!cancelled) {
        setState({
          phase: "error",
          message: err instanceof Error ? err.message : "Couldn't load this character's profile.",
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [storyId, characterId]);

  const back = (): void => {
    useRoute.getState().navigate("characters", storyId ? { storyId } : {});
  };

  // Merge outgoing + incoming + toPlayer into one relationship list the design renders uniformly.
  // Declared before early returns so hook order stays stable across states.
  const rels = useMemo(() => {
    if (state.phase !== "ready") return [];
    const d = state.dossier;
    const out = d.relationships.outgoing.map((r) => ({
      key: `out:${r.toCharacterId}`,
      dir: `→ ${r.toName}`,
      feeling: r.feeling ?? "—",
      trust: r.trust,
      power: r.power,
      isPlayer: false,
    }));
    const inc = d.relationships.incoming.map((r) => ({
      key: `in:${r.fromCharacterId}`,
      dir: `← ${r.fromName}`,
      feeling: r.feeling ?? "—",
      trust: r.trust,
      power: r.power,
      isPlayer: false,
    }));
    const toPlayer = d.relationships.toPlayer
      ? [
          {
            key: "toPlayer",
            dir: "→ You",
            feeling: d.relationships.toPlayer.feeling ?? "—",
            trust: d.relationships.toPlayer.trust,
            power: d.relationships.toPlayer.power,
            isPlayer: true,
          },
        ]
      : [];
    return [...toPlayer, ...out, ...inc];
  }, [state]);

  if (state.phase === "no-target") {
    return (
      <div style={{ padding: "26px 34px 60px" }}>
        <EmptyState
          glyph="❦"
          title="No character selected"
          body="Open a character from the roster to see their full profile — what the story has learned, walled off from the dice-authored sheet."
        />
      </div>
    );
  }

  if (state.phase === "loading") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 80 }}>
        <span
          data-testid="dossier-loading"
          aria-label="Loading profile"
          className={reduced ? undefined : "mt-sweep"}
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            border: "2px solid var(--hairline)",
            borderTopColor: "var(--teal)",
            ...(reduced ? {} : { animationDuration: "0.8s" }),
          }}
        />
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div style={{ padding: "26px 34px 60px", maxWidth: 1080, margin: "0 auto" }}>
        <button
          type="button"
          onClick={back}
          style={{ background: "none", border: "none", color: "var(--secondary)", cursor: "pointer", fontSize: 12.5, marginBottom: 16, padding: 0 }}
        >
          ← All characters
        </button>
        <InlineNotice severity="error" title="Couldn't load this character" detail={state.message} />
      </div>
    );
  }

  const d = state.dossier;
  const fullStats = state.statMode === "full";
  const fallen = !d.sheet.alive;
  const short = d.identity.name.split(/\s+/)[0] ?? d.identity.name;
  const accent = fallen ? "var(--muted)" : d.isPlayer ? "var(--brass)" : "var(--teal)";

  const currentCells: { k: string; v: string }[] = [
    { k: fallen ? "STATE" : "MOOD", v: fallen ? "Fallen" : d.currentState.mood ?? "—" },
    { k: "LOCATION", v: d.currentState.location ?? "—" },
    { k: fallen ? "LAST GOAL" : "GOAL", v: d.currentState.goal ?? "—" },
  ];

  const sparse = d.past.observations.length === 0;

  const containerFade = reduced ? undefined : "mt-fade";
  const gridStyle: CSSProperties = narrow
    ? { display: "block" }
    : { display: "grid", gridTemplateColumns: "1.55fr .95fr", gap: 34, alignItems: "start" };

  return (
    <div style={{ flex: 1, overflowY: "auto" }} className={containerFade}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "22px 40px 70px" }}>
        <button
          type="button"
          onClick={back}
          style={{ background: "none", border: "none", color: "var(--secondary)", cursor: "pointer", fontSize: 12.5, marginBottom: 16, padding: 0 }}
        >
          ← All characters
        </button>

        {/* IDENTITY HEADER */}
        <div style={{ display: "flex", gap: 22, alignItems: "flex-start" }}>
          <div
            aria-hidden="true"
            style={{
              width: 104,
              height: 104,
              flex: "0 0 104px",
              borderRadius: 16,
              background: "var(--bg3-raised)",
              border: `1px solid ${accent}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-display)",
              fontWeight: 700,
              fontSize: 44,
              color: accent,
              ...(fallen ? { filter: "grayscale(.4)" } : {}),
            }}
          >
            {initialsOf(d.identity.name)}
          </div>
          <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 40,
                  fontWeight: 600,
                  color: fallen ? "var(--muted)" : "var(--ui-text)",
                  margin: 0,
                  lineHeight: 1.05,
                }}
              >
                {d.identity.name}
              </h1>
              {d.identity.tier ? (
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    color: "var(--teal)",
                    border: "1px solid var(--teal-dim)",
                    borderRadius: 4,
                    padding: "3px 8px",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  {d.identity.tier}
                </span>
              ) : null}
              {fallen ? (
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    color: "var(--muted)",
                    border: "1px solid var(--muted)",
                    borderRadius: 4,
                    padding: "2px 7px",
                    letterSpacing: "0.08em",
                  }}
                >
                  FALLEN
                </span>
              ) : null}
            </div>
            {d.identity.whatTheyAre ? (
              <div style={{ fontFamily: "var(--font-body)", fontSize: 17, color: "var(--secondary)", marginTop: 8, fontStyle: "italic" }}>
                {d.identity.whatTheyAre}
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              {storyId ? (
                <button
                  type="button"
                  onClick={() => useRoute.getState().navigate("blueprint", { storyId })}
                  style={{
                    fontSize: 12,
                    color: "var(--teal)",
                    border: "1px solid var(--teal-dim)",
                    borderRadius: 7,
                    padding: "7px 13px",
                    background: "transparent",
                    cursor: "pointer",
                  }}
                >
                  ✎ Edit in blueprint
                </button>
              ) : null}
              <span style={{ fontSize: 12, color: "var(--muted)", alignSelf: "center", maxWidth: 460 }}>
                Identity is authored in the blueprint · everything below is what the story has learned.
              </span>
            </div>
          </div>
        </div>

        {/* CURRENT STATE STRIP */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            marginTop: 24,
            background: "var(--bg2-card)",
            border: "1px solid var(--hairline)",
            borderRadius: 11,
            overflow: "hidden",
          }}
        >
          {currentCells.map((c, i) => (
            <div
              key={c.k}
              style={{
                flex: 1,
                minWidth: 140,
                padding: "13px 17px",
                ...(i > 0 ? { borderLeft: "1px solid var(--hairline)" } : {}),
              }}
            >
              <div style={SUB_LABEL}>{c.k}</div>
              <div style={{ fontSize: 15, color: "var(--ui-text)", marginTop: 4, fontFamily: "var(--font-display)", fontWeight: 600 }}>{c.v}</div>
            </div>
          ))}
        </div>

        {/* TWO REGISTERS */}
        <div style={gridStyle}>
          {/* STORY REGISTER */}
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 26, marginTop: 26 }}>
            {/* Mentality */}
            <section>
              <SectionRule label="MENTALITY" />
              {d.mentality.traits.length > 0 ? (
                <>
                  <div style={{ ...SUB_LABEL, marginBottom: 8 }}>TRAITS</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 16 }}>
                    {d.mentality.traits.map((t) => (
                      <span key={t} style={{ fontSize: 12, color: "var(--ui-text)", background: "var(--bg3-raised)", border: "1px solid var(--hairline)", borderRadius: 6, padding: "4px 10px" }}>
                        {t}
                      </span>
                    ))}
                  </div>
                </>
              ) : null}
              {d.mentality.behavioralSignatures.length > 0 ? (
                <>
                  <div style={{ ...SUB_LABEL, marginBottom: 8 }}>BEHAVIORAL SIGNATURES</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                    {d.mentality.behavioralSignatures.map((sg, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, fontFamily: "var(--font-body)", fontSize: 15, lineHeight: 1.55, color: "var(--ui-text)" }}>
                        <span style={{ color: "var(--brass)", flex: "0 0 auto" }}>“</span>
                        <span>{sg.pattern}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
              {d.mentality.outlook ? (
                <div style={{ marginTop: 15, padding: "12px 15px", background: "var(--bg2-card)", border: "1px solid var(--hairline)", borderRadius: 9, fontFamily: "var(--font-body)", fontSize: 15, lineHeight: 1.6, color: "var(--ui-text)" }}>
                  <span style={{ ...SUB_LABEL, display: "block", marginBottom: 5 }}>OUTLOOK</span>
                  {d.mentality.outlook}
                </div>
              ) : null}
            </section>

            {/* Past */}
            <section>
              <SectionRule label="PAST" />
              {d.past.backstory ? (
                <p style={{ fontFamily: "var(--font-body)", fontSize: 16, lineHeight: 1.75, color: "var(--ui-text)", margin: "0 0 20px", maxWidth: "60ch" }}>
                  {d.past.backstory}
                </p>
              ) : null}
              <div style={{ ...SUB_LABEL, marginBottom: 12 }}>OBSERVATIONS · WHAT THE STORY HAS NOTICED</div>
              {sparse ? (
                <div style={{ fontFamily: "var(--font-body)", fontStyle: "italic", fontSize: 14, color: "var(--muted)", padding: "12px 0" }}>
                  Little is known yet. The story will fill this in as {short} does more.
                </div>
              ) : (
                <div style={{ position: "relative", paddingLeft: 20 }}>
                  <div style={{ position: "absolute", left: 5, top: 6, bottom: 6, width: 1, background: "var(--hairline)" }} />
                  {d.past.observations.map((o, i) => {
                    const recent = i === d.past.observations.length - 1;
                    return (
                      <div key={i} style={{ position: "relative", marginBottom: 16 }}>
                        <span
                          style={{
                            position: "absolute",
                            left: -19,
                            top: 5,
                            width: 9,
                            height: 9,
                            borderRadius: "50%",
                            background: recent ? "var(--brass)" : "var(--teal-dim)",
                            border: "2px solid var(--bg1-base)",
                          }}
                        />
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--teal)", letterSpacing: "0.04em" }}>
                          TURN {o.turnIdx}
                        </div>
                        <div style={{ fontFamily: "var(--font-body)", fontSize: 15, lineHeight: 1.6, color: "var(--ui-text)", marginTop: 2 }}>{o.text}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Relationships */}
            {rels.length > 0 ? (
              <section>
                <SectionRule label="RELATIONSHIPS" />
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {rels.map((r) => {
                    const t = trustView(r.trust);
                    return (
                      <div
                        key={r.key}
                        style={{
                          background: r.isPlayer ? "var(--brass-tint)" : "var(--bg2-card)",
                          border: `1px solid ${r.isPlayer ? "var(--brass-dim)" : "var(--hairline)"}`,
                          borderRadius: 10,
                          padding: "13px 15px",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--teal)" }}>{r.dir}</span>
                            <span style={{ fontFamily: "var(--font-body)", fontSize: 15, color: "var(--ui-text)", fontStyle: "italic" }}>“{r.feeling}”</span>
                          </div>
                          {r.isPlayer ? (
                            <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--brass)", border: "1px solid var(--brass-dim)", borderRadius: 4, padding: "2px 6px", flex: "0 0 auto" }}>
                              THE PLAYER
                            </span>
                          ) : null}
                        </div>
                        <div style={{ display: "flex", gap: 16, marginTop: 9, flexWrap: "wrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <span style={SUB_LABEL}>TRUST</span>
                            <div style={{ width: 70, height: 5, background: "var(--bg1-base)", borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${t.pct}%`, background: t.color, borderRadius: 3 }} />
                            </div>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: t.color }}>{t.label}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <span style={SUB_LABEL}>POWER</span>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--secondary)" }}>{r.power >= 0 ? "+" : ""}{r.power.toFixed(1)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {/* Involved threads */}
            {d.involvedThreads.length > 0 ? (
              <section>
                <SectionRule label="INVOLVED THREADS" />
                {d.involvedThreads.map((th, i) => (
                  <div key={i} style={{ display: "flex", gap: 11, alignItems: "flex-start", padding: "11px 14px", background: "var(--bg2-card)", border: "1px solid var(--hairline)", borderRadius: 9, marginBottom: 9 }}>
                    <span style={{ color: "var(--brass)", fontSize: 13, marginTop: 1 }}>◆</span>
                    <div>
                      <div style={{ fontFamily: "var(--font-body)", fontSize: 15, color: "var(--ui-text)", lineHeight: 1.5 }}>{th.title}</div>
                      {th.note ? <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{th.note}</div> : null}
                    </div>
                  </div>
                ))}
              </section>
            ) : null}
          </div>

          {/* SYSTEM REGISTER — THE SHEET */}
          <div style={{ marginTop: 26, ...(narrow ? { maxWidth: 420 } : {}) }}>
            {!fullStats ? (
              <InlineNotice
                severity="info"
                title="No Stats story"
                detail="This story is prose-only. Identity and authored character details remain available, while attributes, resources, skills, mastery and mechanical inventory stay dormant."
              />
            ) : (
            <div style={{ position: narrow ? "static" : "sticky", top: 0, background: "var(--bg1-raised)", border: "1px solid var(--teal-dim)", borderRadius: 13, overflow: "hidden" }}>
              <div style={{ background: "var(--teal-tint)", borderBottom: "1px solid var(--teal-dim)", padding: "13px 17px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", color: "var(--teal)" }}>THE SHEET · HARD STATE</span>
                <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: fallen ? "var(--muted)" : "var(--success)", border: `1px solid ${fallen ? "var(--muted)" : "var(--success)"}`, borderRadius: 4, padding: "2px 7px", letterSpacing: "0.08em" }}>
                  {fallen ? "FALLEN" : "ALIVE"}
                </span>
              </div>
              <div style={{ padding: 17 }}>
                {d.sheet.attributes.length > 0 ? (
                  <>
                    <div style={{ ...SUB_LABEL, margin: "0 0 9px" }}>ATTRIBUTES</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 7, marginBottom: 16 }}>
                      {d.sheet.attributes.map((attribute) => (
                        <div
                          key={attribute.attributeId}
                          title={attribute.description}
                          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 9px", background: "var(--teal-tint)", border: "1px solid var(--teal-dim)", borderRadius: 7 }}
                        >
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--teal)", letterSpacing: ".08em" }}>{attribute.abbrev}</span>
                            <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10.5, color: "var(--secondary)" }}>{attribute.name}</span>
                          </span>
                          <span style={{ display: "flex", alignItems: "baseline", gap: 5, fontFamily: "var(--font-mono)" }}>
                            <strong style={{ fontSize: 15, color: "var(--ui-text)" }}>{attribute.score}</strong>
                            <span style={{ fontSize: 10, color: "var(--brass)" }}>{attribute.modifier >= 0 ? "+" : ""}{attribute.modifier}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}

                {/* Resources */}
                {d.sheet.resources.map((rs) => {
                  const pct = rs.max > 0 ? Math.max(0, Math.round((rs.current / rs.max) * 100)) : 0;
                  const color = fallen ? "var(--muted)" : pct < 40 ? "var(--danger)" : pct < 70 ? "var(--brass)" : "var(--success)";
                  return (
                    <div key={rs.id} style={{ marginBottom: 13 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--secondary)", marginBottom: 4 }}>
                        <span>{rs.label}</span>
                        <span style={{ color }}>{rs.current} / {rs.max}</span>
                      </div>
                      <div style={{ height: 7, background: "var(--bg1-base)", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4 }} />
                      </div>
                    </div>
                  );
                })}

                {/* Skills */}
                {d.sheet.skills.length > 0 ? (
                  <>
                    <div style={{ ...SUB_LABEL, margin: "16px 0 9px" }}>SKILLS</div>
                    {d.sheet.skills.map((sk) => (
                      <div key={sk.skillId} style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={{ fontSize: 13, color: "var(--ui-text)" }}>{sk.name}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", color: "var(--teal)", textTransform: "uppercase" }}>{sk.rank}</span>
                            <MasteryPips rank={asMasteryRank(sk.rank)} />
                          </div>
                        </div>
                        {sk.toNext !== null && sk.toNext > 0 ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
                            <div style={{ flex: 1, height: 4, background: "var(--bg1-base)", borderRadius: 3, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${Math.round((sk.successCount / (sk.successCount + sk.toNext)) * 100)}%`, background: "var(--teal-dim)", borderRadius: 3 }} />
                            </div>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--muted)", whiteSpace: "nowrap" }}>
                              {sk.successCount} successes · {sk.toNext} to next
                            </span>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </>
                ) : null}

                {/* Inventory */}
                {d.sheet.inventory.length > 0 ? (
                  <>
                    <div style={{ ...SUB_LABEL, margin: "16px 0 9px" }}>INVENTORY</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {d.sheet.inventory.map((iv) => (
                        <div key={iv.itemId} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                          <span style={{ color: "var(--ui-text)" }}>{iv.name}</span>
                          <span style={{ color: "var(--muted)" }}>×{iv.qty}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}

                <div style={{ marginTop: 15, paddingTop: 12, borderTop: "1px solid var(--teal-dim)", fontSize: 10.5, color: "var(--muted)", lineHeight: 1.5 }}>
                  These values are set by dice and rules — they can’t be edited by hand.
                </div>
              </div>
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CharacterDossier;
