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
import { useReducedMotion, EmptyState, InlineNotice, Button, SkillProgress } from "../components/index.js";

type LoadState =
  | { phase: "no-target" }
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; dossier: Dossier; statMode: "none" | "full" };

interface V7DossierExtras {
  appearance?: string;
  storySoFar?: {
    summary?: string;
    keyEvents?: Array<{ turnIdx: number; chapter?: number; title: string; detail?: string; recent?: boolean; provenance?: string }>;
  };
  history?: Array<{ turnIdx: number; chapter?: number; text: string; kind?: string; recent?: boolean; provenance?: string }>;
  equipment?: {
    slots?: Array<{ slot: string; itemName?: string; tier?: string; effects?: string[]; recent?: boolean }>;
    activeEffects?: Array<{ label: string; source: string; active: boolean; reason?: string }>;
  };
  progressionHistory?: Array<{ skillName: string; xp: number; reason: string; turnIdx: number; rankUp?: string; rewound?: boolean }>;
}

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
      recentChange: (r as typeof r & { recentChange?: string }).recentChange,
    }));
    const inc = d.relationships.incoming.map((r) => ({
      key: `in:${r.fromCharacterId}`,
      dir: `← ${r.fromName}`,
      feeling: r.feeling ?? "—",
      trust: r.trust,
      power: r.power,
      isPlayer: false,
      recentChange: (r as typeof r & { recentChange?: string }).recentChange,
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
            recentChange: (d.relationships.toPlayer as typeof d.relationships.toPlayer & { recentChange?: string }).recentChange,
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
  const v7 = d as typeof d & V7DossierExtras;
  const fullStats = state.statMode === "full";
  const fallen = !d.sheet.alive;
  const short = d.identity.name.split(/\s+/)[0] ?? d.identity.name;
  const accent = fallen ? "var(--muted)" : d.isPlayer ? "var(--brass)" : "var(--teal)";

  const currentCells: { k: string; v: string }[] = [
    { k: fallen ? "STATE" : "MOOD", v: fallen ? "Fallen" : d.currentState.mood ?? "—" },
    { k: "LOCATION", v: d.currentState.location ?? "—" },
    { k: fallen ? "LAST GOAL" : "GOAL", v: d.currentState.goal ?? "—" },
    { k: "STATUS", v: (d.currentState as typeof d.currentState & { status?: string }).status ?? (fallen ? "No longer active" : "Active") },
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
            {v7.appearance ? (
              <div style={{ fontFamily: "var(--font-body)", fontSize: 13.5, color: "var(--secondary)", marginTop: 8, lineHeight: 1.55 }}>
                <span style={SUB_LABEL}>APPEARANCE · </span>{v7.appearance}
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

            {/* Story so far + key events */}
            <section>
              <SectionRule label="STORY SO FAR" />
              {v7.storySoFar?.summary ? (
                <p style={{ fontFamily: "var(--font-body)", fontSize: 16, lineHeight: 1.75, color: "var(--ui-text)", margin: "0 0 16px", maxWidth: "60ch" }}>
                  {v7.storySoFar.summary}
                </p>
              ) : (
                <div style={{ fontFamily: "var(--font-body)", fontStyle: "italic", fontSize: 14, color: "var(--muted)", marginBottom: 12 }}>
                  No chapter summary has been written for {short} yet.
                </div>
              )}
              {v7.storySoFar?.keyEvents?.length ? (
                <div style={{ display: "grid", gap: 8 }}>
                  {v7.storySoFar.keyEvents.map((event, index) => (
                    <div key={`${event.turnIdx}:${event.title}:${index}`} style={{ padding: "10px 12px", background: "var(--bg2-card)", border: `1px solid ${event.recent ? "var(--brass-dim)" : "var(--hairline)"}`, borderRadius: 8 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontFamily: "var(--font-mono)", color: "var(--teal)", fontSize: 9 }}>CH{event.chapter ?? "—"} · T{event.turnIdx}</span>
                        <strong style={{ color: "var(--ui-text)", fontSize: 13 }}>{event.title}</strong>
                        {event.recent ? <span style={{ marginLeft: "auto", color: "var(--brass)", fontFamily: "var(--font-mono)", fontSize: 9 }}>RECENTLY CHANGED</span> : null}
                      </div>
                      {event.detail ? <div style={{ color: "var(--secondary)", fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>{event.detail}</div> : null}
                      {event.provenance ? <div style={{ color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 9, marginTop: 4 }}>SOURCE · {event.provenance}</div> : null}
                    </div>
                  ))}
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
              {v7.history?.length ? (
                <>
                  <div style={{ ...SUB_LABEL, margin: "18px 0 12px" }}>CHRONOLOGICAL HISTORY</div>
                  <div style={{ display: "grid", gap: 7 }}>
                    {v7.history.map((event, index) => (
                      <div key={`${event.turnIdx}:${index}`} style={{ display: "grid", gridTemplateColumns: "82px 1fr", gap: 10, padding: "8px 10px", background: event.recent ? "var(--brass-tint)" : "transparent", borderLeft: `2px solid ${event.recent ? "var(--brass)" : "var(--hairline)"}` }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--teal)" }}>CH{event.chapter ?? "—"} · T{event.turnIdx}</span>
                        <span style={{ color: "var(--secondary)", fontSize: 12.5, lineHeight: 1.5 }}>
                          {event.text}
                          {event.provenance ? <small style={{ display: "block", color: "var(--muted)", marginTop: 2 }}>SOURCE · {event.provenance}</small> : null}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
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
                        {r.recentChange ? <div style={{ marginTop: 7, color: "var(--brass)", fontFamily: "var(--font-mono)", fontSize: 9.5 }}>RECENT CHANGE · {r.recentChange}</div> : null}
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
                    <div style={{ display: "grid", gap: 8 }}>
                      {d.sheet.skills.map((sk) => {
                        const linkedActionPermits = (sk.linkedActions ?? []).map((action) => {
                          const rank = action.minRank
                            ? `${action.minRank[0]!.toUpperCase()}${action.minRank.slice(1)}+: `
                            : "";
                          const detail = action.description ? ` — ${action.description}` : "";
                          return `${rank}${action.label}${detail}`;
                        });
                        const permits = [...(sk.permits ?? []), ...linkedActionPermits];
                        return (
                          <SkillProgress
                            key={sk.skillId}
                            name={sk.name}
                            definition={sk.definition ?? "Definition unavailable in this legacy rulebook."}
                            rank={sk.rank}
                            currentXp={sk.xp}
                            nextThreshold={sk.nextRankXp}
                            {...(sk.linkedAttribute ? { linkedAttribute: sk.linkedAttribute } : {})}
                            {...(permits.length ? { permits } : {})}
                            {...(sk.latestAward
                              ? {
                                  latestAward: {
                                    xp: sk.latestAward.xp,
                                    reason: sk.latestAward.reason,
                                    rulingRef: `Turn ${sk.latestAward.turnIdx}`,
                                  },
                                }
                              : {})}
                            {...(sk.latestAward?.rankUp ? { rankUp: sk.latestAward.rankUp } : {})}
                          />
                        );
                      })}
                    </div>
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

                {/* Equipped loadout and item effects are distinct from stored inventory. */}
                <>
                  <div style={{ ...SUB_LABEL, margin: "16px 0 9px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>EQUIPPED LOADOUT · 7 SLOTS</span>
                    {storyId && characterId ? (
                      <Button variant="ghost" onClick={() => useRoute.getState().navigate("loadout", { storyId, characterId })} style={{ padding: "4px 7px", fontSize: 10 }}>
                        Open loadout →
                      </Button>
                    ) : null}
                  </div>
                  {v7.equipment?.slots?.length ? (
                    <div style={{ display: "grid", gap: 6 }}>
                      {v7.equipment.slots.map((slot) => (
                        <div key={slot.slot} style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 8, padding: "7px 9px", background: "var(--bg2-card)", border: `1px solid ${slot.recent ? "var(--brass-dim)" : "var(--hairline)"}`, borderRadius: 6 }}>
                          <span style={{ color: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 9 }}>{slot.slot.toUpperCase()}</span>
                          <span style={{ color: slot.itemName ? "var(--ui-text)" : "var(--muted)", fontSize: 11.5 }}>
                            {slot.itemName ?? "Empty"}{slot.tier ? ` · ${slot.tier}` : ""}
                            {slot.recent ? <small style={{ marginLeft: 6, color: "var(--brass)" }}>RECENTLY CHANGED</small> : null}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: "var(--muted)", fontSize: 11.5, lineHeight: 1.5 }}>No equipment is currently assigned. Items are granted on demand by validated DM Rulings, never pregenerated at story creation.</div>
                  )}
                  {v7.equipment?.activeEffects?.length ? (
                    <>
                      <div style={{ ...SUB_LABEL, margin: "14px 0 7px" }}>ITEM EFFECTS</div>
                      <div style={{ display: "grid", gap: 5 }}>{v7.equipment.activeEffects.map((effect, index) => (
                        <div key={`${effect.source}:${effect.label}:${index}`} style={{ color: effect.active ? "var(--success)" : "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 10.5 }}>
                          {effect.active ? "ACTIVE" : "CONDITIONAL"} · {effect.label} <span style={{ color: "var(--secondary)" }}>from {effect.source}{effect.reason ? ` · ${effect.reason}` : ""}</span>
                        </div>
                      ))}</div>
                    </>
                  ) : null}
                </>

                {v7.progressionHistory?.length ? (
                  <>
                    <div style={{ ...SUB_LABEL, margin: "16px 0 8px" }}>PROGRESSION HISTORY</div>
                    <div style={{ display: "grid", gap: 5 }}>
                      {v7.progressionHistory.map((entry, index) => (
                        <div key={`${entry.turnIdx}:${entry.skillName}:${index}`} style={{ display: "grid", gridTemplateColumns: "45px 1fr", gap: 7, color: entry.rewound ? "var(--muted)" : "var(--secondary)", fontFamily: "var(--font-mono)", fontSize: 9.5 }}>
                          <span>T{entry.turnIdx}</span>
                          <span>{entry.rewound ? "REWOUND" : `+${entry.xp} XP`} · {entry.skillName} · {entry.reason}{entry.rankUp ? ` · RANK UP ${entry.rankUp}` : ""}</span>
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
