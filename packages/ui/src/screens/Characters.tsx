/**
 * Characters — the full character roster for the current story
 * (Design/handoff/screens/Characters.dc.html).
 *
 * Reads the present cast via the bridge (`listPresentCast`) keyed by `props.storyId`, then pulls
 * each member's full projection (`getLivingCard`) and renders a LivingCardView (full variant) per
 * character: relationship rows, trait/inventory chips, skills with MasteryPips all come through the
 * card component. The player card accents brass, others teal, fallen ones desaturate with a
 * DeadMarker — all handled inside LivingCardView from the card's `isPlayer`/`alive` flags.
 *
 * Cards are grouped: THE PARTY (the player + living allies) and ANTAGONISTS & FIGURES (everyone
 * else, including the fallen). Names resolve across relationship rows via a cast id→name map.
 *
 * State matrix: no-story (no `storyId`) · loading (spinner) · empty (no one named yet — the
 * invite) · load-failure notice (network family) · cast grid · a-death (fallen treatment) ·
 * overflow (auto-fill grid wraps; long names clip in the card) · narrow (~900px collapses the grid
 * to one column) · reduced-motion (the fade is gated on the token media query / atom animate flag).
 */
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { ScreenProps } from "./registry.js";
import { getBridge } from "../bridge/core.js";
import type { CastMember, LivingCardView as CoreLivingCardView } from "../bridge/core.js";
import { useReducedMotion, EmptyState, InlineNotice, LivingCardView } from "../components/index.js";

interface LoadedCast {
  /** Present cast in listing order (player first). */
  members: CastMember[];
  /** Full projection per character id (missing ids fall back to a card built from the cast row). */
  cards: Map<string, CoreLivingCardView>;
}

type LoadState =
  | { phase: "no-story" }
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; cast: LoadedCast };

/** Build a minimal LivingCardView from a cast row when the full projection is unavailable. */
function cardFromCastMember(m: CastMember): CoreLivingCardView {
  return {
    characterId: m.characterId,
    name: m.name,
    isPlayer: m.isPlayer,
    alive: m.alive,
    attributes: [],
    resources: m.hp ? [{ id: "hp", label: m.hp.label, current: m.hp.current, max: m.hp.max, playerVisible: true }] : [],
    inventory: [],
    skills: [],
    ...(m.mood ? { soft: { tier: "secondary", traits: [], likes: [], dislikes: [], mood: m.mood, relationships: [], recentObservations: [] } } : {}),
  };
}

const SECTION_LABEL: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  letterSpacing: "0.14em",
  color: "var(--teal)",
  marginBottom: 14,
};

export function Characters(props: ScreenProps): JSX.Element {
  const { storyId } = props;
  const reduced = useReducedMotion();
  const [state, setState] = useState<LoadState>(() => (storyId ? { phase: "loading" } : { phase: "no-story" }));

  useEffect(() => {
    if (!storyId) {
      setState({ phase: "no-story" });
      return;
    }
    let cancelled = false;
    setState({ phase: "loading" });
    const bridge = getBridge();
    (async () => {
      const members = await bridge.listPresentCast(storyId);
      const cards = new Map<string, CoreLivingCardView>();
      await Promise.all(
        members.map(async (m) => {
          const card = await bridge.getLivingCard(storyId, m.characterId);
          cards.set(m.characterId, card ?? cardFromCastMember(m));
        })
      );
      if (!cancelled) setState({ phase: "ready", cast: { members, cards } });
    })().catch((err: unknown) => {
      if (!cancelled) setState({ phase: "error", message: err instanceof Error ? err.message : "Couldn't reach the story's cast." });
    });
    return () => {
      cancelled = true;
    };
  }, [storyId]);

  // id → display name, so relationship rows on the cards read names, not raw ids.
  const resolveName = useMemo(() => {
    const names = new Map<string, string>();
    if (state.phase === "ready") {
      for (const [id, card] of state.cast.cards) names.set(id, card.name);
    }
    return (id: string): string => names.get(id) ?? id;
  }, [state]);

  if (state.phase === "no-story") {
    return (
      <div style={{ padding: "26px 34px 60px" }}>
        <EmptyState
          glyph="❦"
          title="No story open"
          body="Open a story from the Library to meet its cast — the people the story has named, with the traits and skills it gave them."
        />
      </div>
    );
  }

  if (state.phase === "loading") {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 80 }}>
        <span
          data-testid="characters-loading"
          aria-label="Loading cast"
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
        <InlineNotice
          severity="error"
          title="Couldn't reach the story's cast"
          detail={state.message}
        />
      </div>
    );
  }

  const { members, cards } = state.cast;

  if (members.length === 0) {
    return (
      <div style={{ padding: "26px 34px 60px" }}>
        <EmptyState
          glyph="☙"
          title="No one has entered the story yet"
          body="Characters appear here the moment they’re named in play — with the traits and skills the story gives them."
        />
      </div>
    );
  }

  // THE PARTY = the player + living allies; everyone else (including the fallen) is a figure.
  const party = members.filter((m) => m.isPlayer || m.alive);
  const others = members.filter((m) => !m.isPlayer && !m.alive);
  // Player first within the party.
  party.sort((a, b) => Number(b.isPlayer) - Number(a.isPlayer));

  const renderCard = (m: CastMember): JSX.Element => {
    const card = cards.get(m.characterId) ?? cardFromCastMember(m);
    return (
      <LivingCardView
        key={m.characterId}
        card={card}
        resolveName={resolveName}
        animate={!reduced}
        className={reduced ? undefined : "mt-fade"}
      />
    );
  };

  return (
    <div style={{ padding: "26px 34px 60px" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        {party.length > 0 ? (
          <section style={{ marginBottom: 30 }}>
            <div style={SECTION_LABEL}>THE PARTY</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 18 }}>
              {party.map(renderCard)}
            </div>
          </section>
        ) : null}

        {others.length > 0 ? (
          <section>
            <div style={SECTION_LABEL}>ANTAGONISTS &amp; FIGURES</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
              {others.map(renderCard)}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

export default Characters;
