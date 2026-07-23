/**
 * Play — the main storytelling surface (Design/handoff/screens/Play.dc.html).
 *
 * A PartyStrip of the present cast sits atop a scrolling message stream: narrator prose in the
 * STORY register, the player's own turns as right-aligned bubbles, and RulingArtifact verdict
 * cards embedded inline where the dice landed. A composer at the bottom submits a turn; a
 * ThinkingIndicator plus the live `proseBuffer` show while the narrator streams. Clicking a party
 * member opens that character's LivingCard in a side drawer.
 *
 * The App shell (app/App.tsx) already renders the left rail, the story header (title · CH label ·
 * message count) and the Play/Overview/Characters/Story-Settings sub-tabs, so this screen renders
 * ONLY the story body.
 *
 * State matrix (§02 — all eleven reachable): loading · empty · normal (live turns) · thinking ·
 * ruling-reveal · error×3 (provider-auth / model-output / network) · overflow · narrow (~900px) ·
 * reduced-motion. The store drives the states it can produce; the rest are reachable through the
 * optional `debugState` view flag (used by the state harness + tests), which layers demo data onto
 * the same render path. Talks to core only through `usePlayStore`, `useUiStore` and the bridge
 * façade. Token CSS variables only — no raw hex.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import {
  PartyStrip,
  RulingArtifact,
  ThinkingIndicator,
  LivingCard,
  EmptyState,
  InlineNotice,
  Button,
  MessageActions,
  ConfirmDialog,
  fromCoreOutcome,
  type RulingRoll,
  type RulingArtifactVariant,
} from "../components";
import { usePlayStore, type TurnError, type TurnErrorKind } from "../state/playStore";
import { useUiStore, useRoute } from "../state/uiStore";
import { getBridge } from "../bridge/core";
import type { MessageRecord, Ruling, CastMember, LivingCardView } from "../bridge/core";
import type { ScreenProps } from "./registry";

// ── View state ──────────────────────────────────────────────────────────────────────────────

/** Every state in the Play matrix (§02), reachable via the store or the `debugState` flag. */
export type PlayViewState =
  | "loading"
  | "empty"
  | "normal"
  | "thinking"
  | "ruling"
  | "error-provider-auth"
  | "error-model-output"
  | "error-network"
  | "overflow"
  | "narrow"
  | "reduced-motion";

export interface PlayProps extends ScreenProps {
  /**
   * Force a specific view state for the state harness / tests. Production leaves this undefined and
   * derives everything from `usePlayStore`. When set, demo data is layered onto the real render
   * path so each design state is reviewable without a live backend.
   */
  debugState?: PlayViewState;
}

// ── Small helpers ─────────────────────────────────────────────────────────────────────────────

/** Reactive media query, guarded for environments (jsdom) without matchMedia. */
function useMediaQuery(query: string): boolean {
  const supported = typeof window !== "undefined" && typeof window.matchMedia === "function";
  const [matches, setMatches] = useState<boolean>(supported ? window.matchMedia(query).matches : false);
  useEffect(() => {
    if (!supported) return;
    const mql = window.matchMedia(query);
    const onChange = (): void => setMatches(mql.matches);
    onChange();
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, [query, supported]);
  return matches;
}

/** "pick_lock" → "Pick Lock" — a readable label from a catalog id. */
function humanize(id: string): string {
  return id
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const VARIANT_BY_OUTCOME: Record<ReturnType<typeof fromCoreOutcome>, RulingArtifactVariant> = {
  "crit-success": "crit-success",
  success: "success",
  failure: "failure",
  "crit-failure": "crit-failure",
};

interface RulingArtifactVM {
  variant: RulingArtifactVariant;
  roll?: RulingRoll;
  reason?: string;
  resultLine?: string;
  effectLine?: string;
}

/**
 * Map a core Ruling onto RulingArtifact props. The gate check happens before any roll, so a denied
 * ruling renders with no die. Opposed contests (a defender roll present) use the two-sided line;
 * everything else takes its variant from the honest outcome. Returns undefined for an allowed-but-
 * rolless ruling (e.g. a bare skill unlock) — nothing to stamp.
 */
function rulingToArtifact(r: Ruling, nameOf: (id: string) => string): RulingArtifactVM | undefined {
  if (!r.gate.allowed) {
    return { variant: "denied", ...(r.gate.reason ? { reason: r.gate.reason } : {}) };
  }
  const roll = r.roll;
  if (!roll) return undefined;

  const outcome = fromCoreOutcome(roll.outcome);
  const opposed = roll.opposedTotal !== undefined && roll.opposedTotal !== null;
  const variant: RulingArtifactVariant = opposed ? "opposed" : VARIANT_BY_OUTCOME[outcome];

  const rollVM: RulingRoll = {
    title: `${nameOf(r.actorId)} · ${r.actionLabel ?? humanize(r.actionId)}`,
    outcome,
    d20: roll.d20,
    modifier: roll.modifier,
    total: roll.total,
    dc: roll.dc,
    modifierTerms: [
      ...(roll.attributeId && roll.attributeModifier !== undefined
        ? [{ label: humanize(roll.attributeId), value: roll.attributeModifier }]
        : []),
      ...(roll.masterySkillId && roll.masteryModifier !== undefined
        ? [{ label: humanize(roll.masterySkillId), value: roll.masteryModifier }]
        : []),
    ],
  };
  if (opposed) {
    rollVM.opposed = {
      attacker: `${nameOf(r.actorId)} ${roll.total}`,
      defender: r.targetId ? `${nameOf(r.targetId)} ${roll.opposedTotal}` : `DC ${roll.dc}`,
      attackerFormula: `d20 ${roll.d20} ${roll.modifier >= 0 ? "+" : "−"} ${Math.abs(roll.modifier)}`,
      defenderFormula: roll.opposedD20 !== undefined && roll.opposedModifier !== undefined
        ? `d20 ${roll.opposedD20} ${roll.opposedModifier >= 0 ? "+" : "−"} ${Math.abs(roll.opposedModifier)}`
        : undefined,
    };
  }

  const effectLine = r.masteryAdvance
    ? `${humanize(r.masteryAdvance.skillId)} → ${r.masteryAdvance.toRank.toUpperCase()}`
    : undefined;
  const resultLine = r.effectsApplied?.narrationHint;

  return {
    variant,
    roll: rollVM,
    ...(resultLine ? { resultLine } : {}),
    ...(effectLine ? { effectLine } : {}),
  };
}

/** Interleave rulings into the transcript: each ruling renders after the message whose id is its
 * turnId; rulings with no matching message fall through to the end of the stream. */
type StreamItem = { kind: "msg"; key: string; message: MessageRecord } | { kind: "ruling"; key: string; ruling: Ruling };

function buildStream(messages: MessageRecord[], rulings: Ruling[]): StreamItem[] {
  const ordered = [...messages].sort((a, b) => a.idx - b.idx);
  const ids = new Set(ordered.map((m) => m.id));
  const byMessage = new Map<string, Ruling[]>();
  for (const r of rulings) {
    const messageId = r.messageId ?? (ids.has(r.turnId) ? r.turnId : undefined);
    if (!messageId || !ids.has(messageId)) continue;
    const bucket = byMessage.get(messageId);
    if (bucket) bucket.push(r);
    else byMessage.set(messageId, [r]);
  }
  const items: StreamItem[] = [];
  for (const m of ordered) {
    const attached = byMessage.get(m.id) ?? [];
    attached.forEach((r, i) => items.push({ kind: "ruling", key: `${m.id}:r${i}`, ruling: r }));
    items.push({ kind: "msg", key: m.id, message: m });
  }
  return items;
}

// ── Demo data (view-only; drives the harness/test states, never the production path) ────────────

const DEMO_CAST: CastMember[] = [
  { characterId: "kestrel", name: "Kestrel Vane", isPlayer: true, alive: true, hp: { current: 19, max: 24, label: "Health" }, mood: "◑ wary" },
  { characterId: "wren", name: "Wren Callow", isPlayer: false, alive: true, hp: { current: 14, max: 16, label: "Health" }, mood: "◇ restless" },
  { characterId: "aldric", name: "Brother Aldric", isPlayer: false, alive: true, hp: { current: 30, max: 30, label: "Health" }, mood: "● steady" },
];

function msg(idx: number, role: MessageRecord["role"], content: string): MessageRecord {
  return { id: `demo-${idx}`, storyId: "demo", idx, role, content, createdAt: 1_700_000_000_000 + idx };
}

/** The seed transcript ported from the prototype (copy lifted verbatim). */
const DEMO_MESSAGES: MessageRecord[] = [
  msg(0, "player", "I press my ear to the reliquary gate and listen for movement beyond it."),
  msg(
    1,
    "narrator",
    "The gate is cold enough to sting. Beyond the iron you hear the slow drip of meltwater and, beneath it, a dry chittering — like teeth worried against teeth. Wren crouches at your shoulder, one hand already on her picks."
  ),
  msg(2, "player", "I set my shoulder to the gate and try to force the lock myself."),
  msg(
    3,
    "narrator",
    "You set your shoulder to the reliquary gate and work a blade into the seam, but the mechanism answers only to a picklock's touch — and that was never your trade."
  ),
  msg(4, "player", "\"Can you get us through?\" I whisper to Wren."),
  msg(
    5,
    "narrator",
    "Past the gate, the dark unfolds into motion. The wight staggers as you plant your feet, read the opening, and drive the Vale saber up beneath its jaw. Steel meets bone and the wight comes apart in a gust of grave-ash."
  ),
];

function ruling(turnIdx: number, over: Partial<Ruling> & Pick<Ruling, "actorId" | "actionId" | "gate">): Ruling {
  return { turnId: `demo-${turnIdx}`, effectsApplied: null, ...over } as Ruling;
}

const DEMO_RULINGS: Ruling[] = [
  ruling(1, {
    actorId: "kestrel",
    actionId: "listen_at_gate",
    gate: { allowed: true },
    roll: { d20: 11, modifier: 2, total: 13, dc: 12, outcome: "success" },
    effectsApplied: { narrationHint: "You place the sound: many small things, waking." },
  }),
  ruling(3, {
    actorId: "kestrel",
    actionId: "pick_lock",
    gate: { allowed: false, reason: "Requires Lockpicking — a skill Kestrel has not learned." },
  }),
  ruling(5, {
    actorId: "kestrel",
    actionId: "blade_finishing_blow",
    gate: { allowed: true },
    roll: { d20: 20, modifier: 3, total: 23, dc: 13, outcome: "crit_success" },
    masteryAdvance: { skillId: "blade_adept", fromRank: "adept", toRank: "expert" },
    effectsApplied: { narrationHint: "The wight comes apart in a gust of grave-ash." },
  }),
];

/** A long, ruling-dense transcript for the overflow state. */
function demoOverflow(): { messages: MessageRecord[]; rulings: Ruling[] } {
  const messages: MessageRecord[] = [];
  const rulings: Ruling[] = [];
  for (let i = 0; i < 40; i++) {
    const role: MessageRecord["role"] = i % 2 === 0 ? "player" : "narrator";
    messages.push(
      msg(
        i,
        role,
        role === "player"
          ? "I push deeper into the ossuary, blade drawn, watching the dark for the next thing to move."
          : "The censers gutter. Somewhere below, a bell begins to toll — slow, deliberate, and far too deep to be rung by any living hand. The passage narrows, and the cold presses in from every wall of bone."
      )
    );
    if (role === "narrator" && i % 6 === 1) {
      rulings.push(
        ruling(i, {
          actorId: "kestrel",
          actionId: "attack_melee",
          gate: { allowed: true },
          roll: { d20: 8 + (i % 12), modifier: 3, total: 11 + (i % 12), dc: 13, outcome: i % 4 === 0 ? "failure" : "success" },
          effectsApplied: { narrationHint: "Steel bites; the dark gives a little more ground." },
        })
      );
    }
  }
  return { messages, rulings };
}

const DEMO_CARD: LivingCardView = {
  characterId: "kestrel",
  name: "Kestrel Vane",
  isPlayer: true,
  alive: true,
  attributes: [],
  resources: [
    { id: "hp", label: "Health", current: 19, max: 24, playerVisible: true },
    { id: "stamina", label: "Stamina", current: 10, max: 14, playerVisible: true },
  ],
  inventory: [
    { itemId: "saber", name: "Vale saber", qty: 1 },
    { itemId: "cloak", name: "Oil-treated cloak", qty: 1 },
  ],
  skills: [
    { skillId: "blade_adept", name: "Blade Adept", rank: "expert" },
    { skillId: "perception", name: "Perception", rank: "adept" },
  ],
  soft: {
    tier: "primary",
    traits: ["Sharp-eyed", "Debt-haunted"],
    likes: [],
    dislikes: [],
    mood: "wary",
    location: "The Ossuary Stair",
    relationships: [],
    recentObservations: [],
  },
};

// ── Error copy (design voice: name the thing and the fix) ────────────────────────────────────

interface ErrorCopy {
  title: string;
  body: string;
  /** Label for the primary action, if any (navigates to Settings). */
  settingsCta?: string;
  /** Whether a Retry affordance shows. */
  retry?: boolean;
}

function errorCopy(kind: TurnErrorKind, role: string): ErrorCopy {
  switch (kind) {
    case "provider-auth":
      return {
        title: "Your provider key was rejected",
        body: `The ${role} couldn't authenticate. Check your key in Settings, then send the turn again.`,
        settingsCta: "Open Settings →",
      };
    case "model-output":
      return {
        title: `The ${role} model returned nothing`,
        body: `Your ${role} failed to produce prose after two tries. This role needs a capable model.`,
        settingsCta: "Try a recommended model →",
        retry: true,
      };
    case "network":
      return {
        title: "Couldn't reach the provider",
        body: "The request timed out. Check your connection — your turn is saved and will resume when you send again.",
        retry: true,
      };
  }
}

// ── Screen ──────────────────────────────────────────────────────────────────────────────────

export function Play(props: PlayProps): JSX.Element {
  const { debugState } = props;
  const routeStoryId = useRoute((r) => r.params.storyId);
  const navigate = useRoute((r) => r.navigate);
  const storyId = props.storyId ?? routeStoryId;

  // Store slices.
  const load = usePlayStore((s) => s.load);
  const submit = usePlayStore((s) => s.submit);
  const clearError = usePlayStore((s) => s.clearError);
  const swipeLast = usePlayStore((s) => s.swipeLast);
  const selectVariant = usePlayStore((s) => s.selectVariant);
  const rewind = usePlayStore((s) => s.rewind);
  const deleteFrom = usePlayStore((s) => s.deleteFrom);
  const storeMessages = usePlayStore((s) => s.messages);
  const storeRulings = usePlayStore((s) => s.rulings);
  const storeCast = usePlayStore((s) => s.cast);
  const storeLoading = usePlayStore((s) => s.loading);
  const storeThinking = usePlayStore((s) => s.thinking);
  const storeProse = usePlayStore((s) => s.proseBuffer);
  const storeError = usePlayStore((s) => s.turnError);

  // UI store.
  const drawerCharacterId = useUiStore((s) => s.drawerCharacterId);
  const openCharacterDrawer = useUiStore((s) => s.openCharacterDrawer);
  const closeDrawer = useUiStore((s) => s.closeDrawer);
  const reducedMotion = useUiStore((s) => s.reducedMotion);

  const mediaNarrow = useMediaQuery("(max-width: 900px)");

  // Load the story's transcript when the id changes (mount + route/tab switch).
  useEffect(() => {
    if (storyId) void load(storyId);
  }, [storyId, load]);

  // ── Resolve effective render inputs (store, then debug override) ────────────────────────────
  let messages = storeMessages;
  let rulings = storeRulings;
  let cast = storeCast;
  let loading = storeLoading;
  let thinking = storeThinking;
  let proseBuffer = storeProse;
  let turnError: TurnError | undefined = storeError;
  let narrow = mediaNarrow;
  let reduced = reducedMotion;

  if (debugState) {
    // Reset to a clean slate, then paint the requested state with demo data.
    loading = false;
    thinking = false;
    turnError = undefined;
    proseBuffer = "";
    cast = DEMO_CAST;
    messages = DEMO_MESSAGES;
    rulings = [];

    switch (debugState) {
      case "loading":
        loading = true;
        messages = [];
        break;
      case "empty":
        messages = [];
        break;
      case "normal":
        rulings = [DEMO_RULINGS[0]!];
        break;
      case "ruling":
        rulings = DEMO_RULINGS;
        break;
      case "thinking":
        thinking = true;
        proseBuffer = "The lamp gutters as you speak, and the room leans in to listen. Somewhere below the floorboards, something old";
        break;
      case "error-provider-auth":
        turnError = { kind: "provider-auth", role: "Narrator", message: "401 unauthorized" };
        break;
      case "error-model-output":
        turnError = { kind: "model-output", role: "Narrator", message: "empty completion" };
        break;
      case "error-network":
        turnError = { kind: "network", role: "Narrator", message: "request timed out" };
        break;
      case "overflow": {
        const big = demoOverflow();
        messages = big.messages;
        rulings = big.rulings;
        break;
      }
      case "narrow":
        rulings = [DEMO_RULINGS[0]!];
        narrow = true;
        break;
      case "reduced-motion":
        rulings = DEMO_RULINGS;
        reduced = true;
        break;
    }
  }

  const nameOf = useCallback(
    (id: string): string => cast.find((c) => c.characterId === id)?.name ?? humanize(id),
    [cast]
  );
  const player = cast.find((c) => c.isPlayer);
  const playerName = player?.name ?? "you";
  const busy = thinking || loading;

  const stream = useMemo(() => buildStream(messages, rulings), [messages, rulings]);

  // ── Turn-history metadata (low-level-plan-v2 §6) ────────────────────────────────────────────
  // The latest narrator message gets swipe + delete + rewind; earlier narrator messages get
  // rewind-only. A message's turn is "roll locked" when a ruling with a die landed on it.
  const latestNarratorIdx = useMemo(() => {
    let idx = -1;
    for (const m of messages) if (m.role === "narrator" && m.idx > idx) idx = m.idx;
    return idx;
  }, [messages]);

  const rollLockedTurnIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of rulings) if (r.roll) ids.add(r.turnId);
    return ids;
  }, [rulings]);

  // Rewind confirmation: the design's confirm dialog names exactly what's removed.
  const [rewindTarget, setRewindTarget] = useState<number | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<number | undefined>(undefined);
  const historyBusy = thinking || loading;
  const rewindLaterCount = rewindTarget === undefined
    ? 0
    : messages.filter((message) => message.role === "narrator" && message.idx > rewindTarget).length;
  const deleteExchangeCount = deleteTarget === undefined
    ? 0
    : messages.filter((message) => message.role === "narrator" && message.idx >= deleteTarget).length;

  const onSwipe = useCallback((): void => {
    if (historyBusy) return;
    void swipeLast();
  }, [historyBusy, swipeLast]);

  const onSelectVariant = useCallback(
    (messageIdx: number, variantIndex: number): void => {
      void selectVariant(messageIdx, variantIndex);
    },
    [selectVariant]
  );

  const onConfirmRewind = useCallback((): void => {
    const target = rewindTarget;
    setRewindTarget(undefined);
    if (target !== undefined) void rewind(target);
  }, [rewindTarget, rewind]);

  const onConfirmDelete = useCallback((): void => {
    const target = deleteTarget;
    setDeleteTarget(undefined);
    if (target !== undefined) void deleteFrom(target);
  }, [deleteTarget, deleteFrom]);

  // ── Composer ────────────────────────────────────────────────────────────────────────────────
  const [draft, setDraft] = useState<string>("");
  const [ambiguous, setAmbiguous] = useState<boolean>(false);
  const [lastTurn, setLastTurn] = useState<string>("");

  const sendTurn = useCallback((): void => {
    const text = draft.trim();
    if (!text || busy) return;
    // Prototype heuristic: a very short input is likely too vague to classify — nudge, don't send.
    if (text.length < 12) {
      setAmbiguous(true);
      return;
    }
    setAmbiguous(false);
    setLastTurn(text);
    setDraft("");
    void submit(text);
  }, [draft, busy, submit]);

  const onComposerKey = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>): void => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendTurn();
      } else if (e.key === "Escape" && drawerCharacterId) {
        closeDrawer();
      }
    },
    [sendTurn, drawerCharacterId, closeDrawer]
  );

  const retryTurn = useCallback((): void => {
    clearError();
    if (lastTurn) void submit(lastTurn);
  }, [clearError, lastTurn, submit]);

  // ── Drawer (LivingCard) ─────────────────────────────────────────────────────────────────────
  const [card, setCard] = useState<LivingCardView | undefined>(undefined);
  const [cardLoading, setCardLoading] = useState<boolean>(false);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!drawerCharacterId) {
      setCard(undefined);
      return;
    }
    // In the harness/tests there's no live story — serve the demo card so the drawer is reviewable.
    if (debugState) {
      setCard({ ...DEMO_CARD, characterId: drawerCharacterId });
      return;
    }
    if (!storyId) return;
    let live = true;
    setCardLoading(true);
    void getBridge()
      .getLivingCard(storyId, drawerCharacterId)
      .then((c) => {
        if (live) setCard(c);
      })
      .catch(() => {
        if (live) setCard(undefined);
      })
      .finally(() => {
        if (live) setCardLoading(false);
      });
    return () => {
      live = false;
    };
  }, [drawerCharacterId, storyId, debugState]);

  // Esc closes the drawer from anywhere; focus the close button when it opens.
  useEffect(() => {
    if (!drawerCharacterId) return;
    closeBtnRef.current?.focus();
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerCharacterId, closeDrawer]);

  // ── Scroll + jump-to-latest anchor ─────────────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showAnchor, setShowAnchor] = useState<boolean>(false);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>): void => {
    const el = e.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowAnchor(distanceFromBottom > 240);
  }, []);

  const scrollToLatest = useCallback((): void => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setShowAnchor(false);
  }, []);

  // Auto-follow the stream unless the reader scrolled up.
  useEffect(() => {
    if (showAnchor) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [stream.length, thinking, proseBuffer, showAnchor]);

  // ── Render ──────────────────────────────────────────────────────────────────────────────────
  const showEmpty = !loading && messages.length === 0 && !thinking && !turnError;
  const showParty = cast.length > 0 && !loading;

  const partyMembers = cast.map((c) => ({
    id: c.characterId,
    name: c.name,
    isPlayer: c.isPlayer,
    ...(c.hp ? { hpFraction: c.hp.max > 0 ? c.hp.current / c.hp.max : 0 } : {}),
    ...(c.mood ? { mood: c.mood } : {}),
    alive: c.alive,
  }));

  return (
    <div style={S.root} data-screen="play" data-debug-state={debugState}>
      {showParty && (
        <PartyStrip
          members={partyMembers}
          collapsed={narrow}
          onSelect={openCharacterDrawer}
          style={S.party}
        />
      )}

      <div style={S.body}>
        <section style={S.streamCol} aria-label="Story">
          <div ref={scrollRef} onScroll={onScroll} style={S.scroll} data-testid="play-scroll">
            <div style={S.measure}>
              {loading ? (
                <SkeletonStream />
              ) : showEmpty ? (
                <EmptyState
                  glyph="✒"
                  title="Your story waits"
                  body="The page is blank and the lamp is lit. Tell the storyteller what you do, and the tale begins."
                />
              ) : (
                <div role="log" aria-live="polite" aria-relevant="additions text">
                  {stream.map((item) => {
                    if (item.kind === "ruling") {
                      return <RulingBlock key={item.key} ruling={item.ruling} nameOf={nameOf} animate={!reduced} />;
                    }
                    const m = item.message;
                    if (m.role !== "narrator") {
                      return <MessageBlock key={item.key} message={m} nameOf={nameOf} />;
                    }
                    // Narrator turn: prose + the swipe/delete/rewind action cluster (§6).
                    const variants = m.variants ?? [];
                    const variantCount = Math.max(1, variants.length);
                    const variantIndex = (m.activeVariant ?? 0) + 1;
                    const isLatest = m.idx === latestNarratorIdx;
                    return (
                      <div key={item.key}>
                        <MessageBlock message={m} nameOf={nameOf} />
                        <MessageActions
                          variantIndex={variantIndex}
                          variantCount={variantCount}
                          isLatest={isLatest}
                          rollLocked={rollLockedTurnIds.has(m.id)}
                          busy={historyBusy}
                          onPrevVariant={() => onSelectVariant(m.idx, (m.activeVariant ?? 0) - 1)}
                          onNextVariant={() => {
                            const active = m.activeVariant ?? 0;
                            if (active < variants.length - 1) onSelectVariant(m.idx, active + 1);
                            else if (isLatest) onSwipe();
                          }}
                          onRewindToHere={() => setRewindTarget(m.idx)}
                          onDeleteFromHere={() => setDeleteTarget(m.idx)}
                        />
                      </div>
                    );
                  })}

                  {thinking && (
                    <div style={S.thinking} data-testid="play-thinking">
                      {proseBuffer ? (
                        <p style={S.prose} data-testid="play-prose-buffer">
                          {proseBuffer}
                        </p>
                      ) : null}
                      <div style={S.thinkingRow}>
                        <span style={S.thinkingLabel}>The story continues</span>
                        <ThinkingIndicator animate={!reduced} />
                      </div>
                    </div>
                  )}

                  {turnError && (
                    <ErrorBlock
                      error={turnError}
                      onSettings={() => navigate("settings", storyId ? { storyId } : {})}
                      onRetry={retryTurn}
                      onDismiss={clearError}
                    />
                  )}
                </div>
              )}
              <div style={{ height: 20 }} />
            </div>
          </div>

          {showAnchor && (
            <button type="button" onClick={scrollToLatest} style={S.anchor} data-testid="play-anchor">
              ↓ Jump to latest
            </button>
          )}

          <Composer
            value={draft}
            onChange={setDraft}
            onKeyDown={onComposerKey}
            onSend={sendTurn}
            busy={busy}
            playerName={playerName}
            ambiguous={ambiguous}
          />
        </section>

        {drawerCharacterId && (
          <Drawer
            narrow={narrow}
            card={card}
            loading={cardLoading}
            reduced={reduced}
            onClose={closeDrawer}
            closeRef={closeBtnRef}
          />
        )}
      </div>

      <ConfirmDialog
        open={rewindTarget !== undefined}
        tone="default"
        title="Rewind to this exchange?"
        body={
          <span>
            This keeps the selected exchange and removes {rewindLaterCount} later exchange{rewindLaterCount === 1 ? "" : "s"}.
            Your attributes, resources, inventory, skills and world state return to how they were at the end of the selected exchange.
            <b style={{ color: "var(--ui-text)" }}> This can't be undone.</b>
          </span>
        }
        confirmLabel="Rewind"
        cancelLabel="Keep everything"
        onConfirm={onConfirmRewind}
        onCancel={() => setRewindTarget(undefined)}
      />
      <ConfirmDialog
        open={deleteTarget !== undefined}
        tone="danger"
        title="Delete from this exchange?"
        body={
          <span>
            This removes the selected exchange too, plus {Math.max(0, deleteExchangeCount - 1)} later exchange{deleteExchangeCount - 1 === 1 ? "" : "s"}.
            Hard state returns to the end of the previous exchange. This is more destructive than Rewind.
            <b style={{ color: "var(--failure)" }}> This can't be undone.</b>
          </span>
        }
        confirmLabel={`Delete ${deleteExchangeCount} exchange${deleteExchangeCount === 1 ? "" : "s"}`}
        cancelLabel="Keep everything"
        onConfirm={onConfirmDelete}
        onCancel={() => setDeleteTarget(undefined)}
      />
    </div>
  );
}

// ── Stream blocks ─────────────────────────────────────────────────────────────────────────────

function MessageBlock(props: { message: MessageRecord; nameOf: (id: string) => string }): JSX.Element | null {
  const { message } = props;
  if (message.role === "player") {
    return (
      <div style={S.playerRow}>
        <div style={S.playerBubble} data-testid="play-player">
          {message.content}
        </div>
      </div>
    );
  }
  if (message.role === "system") {
    return (
      <div style={S.systemLine} data-testid="play-system">
        {message.content}
      </div>
    );
  }
  return (
    <div style={S.prose} data-testid="play-narrator">
      <SafeStoryText text={message.content} />
    </div>
  );
}

function inlineStoryText(text: string, keyPrefix: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`)/g);
  return tokens.filter(Boolean).map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    if (token.startsWith("**") && token.endsWith("**")) return <strong key={key}>{token.slice(2, -2)}</strong>;
    if ((token.startsWith("*") && token.endsWith("*")) || (token.startsWith("_") && token.endsWith("_"))) {
      return <em key={key}>{token.slice(1, -1)}</em>;
    }
    if (token.startsWith("`") && token.endsWith("`")) return <code key={key}>{token.slice(1, -1)}</code>;
    return token;
  });
}

/** SillyTavern-compatible essentials without ever interpreting card HTML. */
function SafeStoryText(props: { text: string }): JSX.Element {
  const paragraphs = props.text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <>
      {paragraphs.map((paragraph, paragraphIndex) => (
        <p key={paragraphIndex} style={{ margin: paragraphIndex === 0 ? 0 : "0.9em 0 0" }}>
          {paragraph.split("\n").map((line, lineIndex) => (
            <span key={lineIndex}>
              {lineIndex > 0 ? <br /> : null}
              {inlineStoryText(line, `${paragraphIndex}-${lineIndex}`)}
            </span>
          ))}
        </p>
      ))}
    </>
  );
}

function RulingBlock(props: { ruling: Ruling; nameOf: (id: string) => string; animate: boolean }): JSX.Element | null {
  const vm = rulingToArtifact(props.ruling, props.nameOf);
  if (!vm) return null;
  return (
    <div style={S.rulingWrap}>
      <RulingArtifact
        variant={vm.variant}
        {...(vm.roll ? { roll: vm.roll } : {})}
        {...(vm.reason ? { reason: vm.reason } : {})}
        {...(vm.resultLine ? { resultLine: vm.resultLine } : {})}
        {...(vm.effectLine ? { effectLine: vm.effectLine } : {})}
        animate={props.animate}
      />
    </div>
  );
}

function SkeletonStream(): JSX.Element {
  const widths = ["92%", "78%", "85%", "60%"];
  return (
    <div aria-hidden="true" data-testid="play-skeleton" style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 24 }}>
      {widths.map((w, i) => (
        <span key={i} style={{ height: 14, width: w, borderRadius: 4, background: "var(--bg2-card)", opacity: 0.7 }} />
      ))}
    </div>
  );
}

// ── Error notice ──────────────────────────────────────────────────────────────────────────────

function ErrorBlock(props: {
  error: TurnError;
  onSettings: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}): JSX.Element {
  const { error, onSettings, onRetry, onDismiss } = props;
  const copy = errorCopy(error.kind, error.role ?? "Narrator");
  return (
    <div style={S.errorWrap} data-testid="play-error" data-error-kind={error.kind}>
      <InlineNotice
        severity="error"
        title={copy.title}
        detail={
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span>{copy.body}</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {copy.settingsCta && (
                <Button variant="system" onClick={onSettings} style={{ padding: "7px 12px", fontSize: 12 }}>
                  {copy.settingsCta}
                </Button>
              )}
              {copy.retry && (
                <Button variant="secondary" onClick={onRetry} style={{ padding: "7px 12px", fontSize: 12 }}>
                  Retry turn
                </Button>
              )}
              <Button variant="ghost" onClick={onDismiss} style={{ padding: "7px 12px", fontSize: 12 }}>
                Dismiss
              </Button>
            </div>
          </div>
        }
      />
    </div>
  );
}

// ── Composer ──────────────────────────────────────────────────────────────────────────────────

function Composer(props: {
  value: string;
  onChange: (v: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  busy: boolean;
  playerName: string;
  ambiguous: boolean;
}): JSX.Element {
  const { value, onChange, onKeyDown, onSend, busy, playerName, ambiguous } = props;
  const canSend = value.trim().length > 0 && !busy;
  const placeholder = busy ? "The storyteller is writing…" : `What does ${playerName} do?`;
  return (
    <div style={S.composerOuter}>
      <div style={S.composerInner}>
        {ambiguous && (
          <div style={S.ambiguity} data-testid="play-ambiguity">
            <span aria-hidden="true">◈</span>
            <span>That's a little vague — try naming what {playerName} does, and to whom.</span>
          </div>
        )}
        <div style={{ ...S.composerField, borderColor: busy ? "var(--hairline)" : "color-mix(in srgb, var(--brass) 25%, transparent)", opacity: busy ? 0.6 : 1 }}>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            rows={1}
            disabled={busy}
            aria-label="Your turn"
            style={S.textarea}
            data-testid="play-composer"
          />
          <Button variant={canSend ? "primary" : "disabled"} disabled={!canSend} onClick={onSend} data-testid="play-send">
            Send
          </Button>
        </div>
        <div style={S.composerFoot}>
          <div style={{ display: "flex", gap: 14 }}>
            <span>
              <b style={S.key}>Enter</b> to send
            </span>
            <span>
              <b style={S.key}>Esc</b> closes drawer
            </span>
          </div>
          <span style={{ fontFamily: "var(--font-mono)" }}>
            Playing as <span style={{ color: "var(--brass)" }}>{playerName}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Drawer ────────────────────────────────────────────────────────────────────────────────────

function Drawer(props: {
  narrow: boolean;
  card: LivingCardView | undefined;
  loading: boolean;
  reduced: boolean;
  onClose: () => void;
  closeRef: React.RefObject<HTMLButtonElement>;
}): JSX.Element {
  const { narrow, card, loading, reduced, onClose, closeRef } = props;
  return (
    <>
      {narrow && <div style={S.scrim} onClick={onClose} aria-hidden="true" data-testid="play-scrim" />}
      <aside
        role="complementary"
        aria-label="Living cards"
        style={{ ...S.drawer, ...(narrow ? S.drawerOverlay : null) }}
        data-testid="play-drawer"
      >
        <div style={S.drawerHead}>
          <span style={S.drawerHeadLabel}>LIVING CARDS</span>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close living cards (Esc)" title="Close (Esc)" style={S.drawerClose}>
            ×
          </button>
        </div>
        <div style={S.drawerBody}>
          {loading ? (
            <div style={{ color: "var(--muted)", fontSize: 13, fontFamily: "var(--font-mono)" }}>Loading card…</div>
          ) : card ? (
            <LivingCard card={card} animate={!reduced} />
          ) : (
            <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>
              No living card yet for this character.
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

// ── Styles (token variables only) ──────────────────────────────────────────────────────────────

const S: Record<string, CSSProperties> = {
  root: { display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--bg0-ground)" },
  party: { flex: "0 0 auto", margin: "10px 14px 0", borderRadius: "var(--radius-card)", overflowX: "auto" },
  body: { flex: 1, display: "flex", minHeight: 0, position: "relative" },
  streamCol: { flex: 1, minWidth: 0, position: "relative", display: "flex", flexDirection: "column" },
  scroll: { flex: 1, overflowY: "auto", padding: "26px 0 8px" },
  measure: { maxWidth: 760, margin: "0 auto", padding: "0 34px" },

  prose: { fontFamily: "var(--font-prose)", fontSize: 17, lineHeight: 1.75, color: "var(--prose)", margin: "16px 0", maxWidth: "66ch" },
  playerRow: { margin: "18px 0", display: "flex", justifyContent: "flex-end" },
  playerBubble: {
    maxWidth: "82%",
    background: "var(--bg3-raised)",
    border: "1px solid color-mix(in srgb, var(--brass) 18%, transparent)",
    borderRadius: "10px 10px 3px 10px",
    padding: "9px 13px",
    fontFamily: "var(--font-prose)",
    fontSize: 15,
    color: "var(--ui-text)",
    lineHeight: 1.55,
  },
  systemLine: { fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)", textAlign: "center", margin: "16px 0", letterSpacing: "0.04em" },
  rulingWrap: { margin: "8px 0" },

  thinking: { margin: "16px 0" },
  thinkingRow: { display: "flex", alignItems: "center", gap: 10, marginTop: 6 },
  thinkingLabel: { fontFamily: "var(--font-prose)", fontStyle: "italic", color: "var(--secondary)", fontSize: 15 },

  errorWrap: { margin: "16px 0" },

  anchor: {
    position: "absolute",
    bottom: 118,
    left: "50%",
    transform: "translateX(-50%)",
    background: "var(--bg3-raised)",
    border: "1px solid color-mix(in srgb, var(--brass) 30%, transparent)",
    color: "var(--brass)",
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "var(--font-ui)",
    borderRadius: 20,
    padding: "7px 15px",
    cursor: "pointer",
    boxShadow: "var(--elevation)",
  },

  composerOuter: { flex: "0 0 auto", borderTop: "1px solid var(--hairline)", background: "var(--bg1-panel)", padding: "14px 34px 16px" },
  composerInner: { maxWidth: 760, margin: "0 auto" },
  ambiguity: { display: "flex", alignItems: "center", gap: 8, marginBottom: 9, fontSize: 12, color: "var(--brass)" },
  composerField: {
    display: "flex",
    alignItems: "flex-end",
    gap: 10,
    background: "var(--bg0-ground)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius-card)",
    padding: "11px 13px",
  },
  textarea: {
    flex: 1,
    resize: "none",
    background: "transparent",
    border: 0,
    outline: "none",
    color: "var(--prose)",
    fontFamily: "var(--font-prose)",
    fontSize: 16,
    lineHeight: 1.5,
    maxHeight: 120,
    padding: "4px 0",
  },
  composerFoot: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, fontSize: 11, color: "var(--muted)" },
  key: { color: "var(--secondary)", fontFamily: "var(--font-mono)" },

  drawer: {
    flex: "0 0 320px",
    width: 320,
    background: "var(--bg1-panel)",
    borderLeft: "1px solid var(--hairline)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  drawerOverlay: { position: "absolute", top: 0, right: 0, bottom: 0, zIndex: 20, boxShadow: "var(--elevation)" },
  scrim: { position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 15 },
  drawerHead: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--hairline)" },
  drawerHeadLabel: { fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", color: "var(--teal)" },
  drawerClose: { background: "transparent", border: 0, color: "var(--muted)", fontSize: 18, cursor: "pointer", lineHeight: 1 },
  drawerBody: { flex: 1, overflowY: "auto", padding: "16px 16px 24px" },
};

export default Play;
