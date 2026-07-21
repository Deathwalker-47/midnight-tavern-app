/**
 * playStore — the Play surface's state: transcript, the in-flight turn (streaming prose buffer +
 * thinking flag), the present cast (PartyStrip), and the dice/ruling feed. The heartbeat is
 * `submitTurn`, which streams narrator deltas into `proseBuffer` and appends committed rulings.
 *
 * Mirrors the Play state matrix (§02): loading/empty/thinking, plus a `turnError` family
 * (provider-auth / model-output / network) the screen renders as an error card.
 */
import { create } from "zustand";
import { getBridge } from "../bridge/core.js";
import type { MessageRecord, Ruling, CastMember } from "../bridge/core.js";

/** The three error families a turn can fail with (§02 universal errors). */
export type TurnErrorKind = "provider-auth" | "model-output" | "network";

export interface TurnError {
  kind: TurnErrorKind;
  /** The role or resource at fault (e.g. "Narrator"), for the error card headline. */
  role?: string;
  message: string;
}

interface PlayState {
  storyId?: string;
  messages: MessageRecord[];
  rulings: Ruling[];
  cast: CastMember[];
  loading: boolean;

  /** True between send and completion; composer disables, thinking indicator shows. */
  thinking: boolean;
  /** Live narrator prose accumulated from stream deltas during a turn. */
  proseBuffer: string;
  turnError?: TurnError;

  /** Load a story's transcript, rulings, and cast into the store. */
  load: (storyId: string) => Promise<void>;
  /** Send the player's turn; streams deltas into `proseBuffer`, then commits. */
  submit: (playerText: string, opts?: { personaBlock?: string; signal?: AbortSignal }) => Promise<void>;
  /**
   * Regenerate the last narrator turn's prose as a new variant (low-level-plan-v2 §6). Streams into
   * `proseBuffer` like a turn; the committed ruling is re-used verbatim so the mechanical outcome is
   * stable — only the prose changes. Re-pulls authoritative state on completion.
   */
  swipeLast: (opts?: { personaBlock?: string; signal?: AbortSignal }) => Promise<void>;
  /** Cycle to an already-generated variant of a narrator message (no model call). */
  selectVariant: (messageIdx: number, variantIndex: number) => Promise<void>;
  /** Delete the last narrator turn + its player message, rolling state back to the turn checkpoint. */
  deleteLast: () => Promise<void>;
  /** Rewind to just before the message at `fromIdx`, truncating everything at idx ≥ fromIdx. */
  rewind: (fromIdx: number) => Promise<void>;
  clearError: () => void;
  reset: () => void;
}

/** Classify a thrown error into one of the three families the UI renders. */
function classifyError(err: unknown): TurnError {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (lower.includes("api key") || lower.includes("credential") || lower.includes("401") || lower.includes("unauthor")) {
    return { kind: "provider-auth", role: "Narrator", message };
  }
  if (lower.includes("timeout") || lower.includes("network") || lower.includes("fetch") || lower.includes("reach")) {
    return { kind: "network", role: "Narrator", message };
  }
  return { kind: "model-output", role: "Narrator", message };
}

export const usePlayStore = create<PlayState>((set, get) => ({
  storyId: undefined,
  messages: [],
  rulings: [],
  cast: [],
  loading: false,
  thinking: false,
  proseBuffer: "",
  turnError: undefined,

  load: async (storyId) => {
    set({ storyId, loading: true, turnError: undefined });
    try {
      const bridge = getBridge();
      const [messages, rulings, cast] = await Promise.all([
        bridge.listMessages(storyId),
        bridge.listRulings(storyId),
        bridge.listPresentCast(storyId),
      ]);
      set({ messages, rulings, cast, loading: false });
    } catch (err) {
      set({ loading: false, turnError: classifyError(err) });
    }
  },

  submit: async (playerText, opts = {}) => {
    const storyId = get().storyId;
    if (!storyId) return;

    // Optimistically show the player line so the stream feels immediate.
    const optimistic: MessageRecord = {
      id: `pending-${Date.now()}`,
      storyId,
      idx: get().messages.length,
      role: "player",
      content: playerText,
      createdAt: Date.now(),
    };
    set((s) => ({
      messages: [...s.messages, optimistic],
      thinking: true,
      proseBuffer: "",
      turnError: undefined,
    }));

    try {
      const outcome = await getBridge().submitTurn({
        storyId,
        playerText,
        onDelta: (delta) => set((s) => ({ proseBuffer: s.proseBuffer + delta })),
        ...(opts.personaBlock ? { personaBlock: opts.personaBlock } : {}),
        ...(opts.signal ? { signal: opts.signal } : {}),
      });
      // Re-pull authoritative state (ids, idx, committed rulings, cast deltas).
      const bridge = getBridge();
      const [messages, rulings, cast] = await Promise.all([
        bridge.listMessages(storyId),
        bridge.listRulings(storyId),
        bridge.listPresentCast(storyId),
      ]);
      set({ messages, rulings, cast, thinking: false, proseBuffer: "" });
      void outcome;
    } catch (err) {
      // Keep the optimistic player line (turn is "saved"); surface the error card.
      set({ thinking: false, proseBuffer: "", turnError: classifyError(err) });
    }
  },

  clearError: () => set({ turnError: undefined }),

  swipeLast: async (opts = {}) => {
    const storyId = get().storyId;
    if (!storyId) return;
    set({ thinking: true, proseBuffer: "", turnError: undefined });
    try {
      await getBridge().swipeLastTurn({
        storyId,
        onDelta: (delta) => set((s) => ({ proseBuffer: s.proseBuffer + delta })),
        ...(opts.personaBlock ? { personaBlock: opts.personaBlock } : {}),
        ...(opts.signal ? { signal: opts.signal } : {}),
      });
      // The analyzer may re-derive soft state on the new prose; re-pull everything.
      const bridge = getBridge();
      const [messages, rulings, cast] = await Promise.all([
        bridge.listMessages(storyId),
        bridge.listRulings(storyId),
        bridge.listPresentCast(storyId),
      ]);
      set({ messages, rulings, cast, thinking: false, proseBuffer: "" });
    } catch (err) {
      set({ thinking: false, proseBuffer: "", turnError: classifyError(err) });
    }
  },

  selectVariant: async (messageIdx, variantIndex) => {
    const storyId = get().storyId;
    if (!storyId) return;
    try {
      await getBridge().selectVariant(storyId, messageIdx, variantIndex);
      const messages = await getBridge().listMessages(storyId);
      set({ messages });
    } catch (err) {
      set({ turnError: classifyError(err) });
    }
  },

  deleteLast: async () => {
    const storyId = get().storyId;
    if (!storyId) return;
    try {
      await getBridge().deleteLastTurn(storyId);
      await get().load(storyId);
    } catch (err) {
      set({ turnError: classifyError(err) });
    }
  },

  rewind: async (fromIdx) => {
    const storyId = get().storyId;
    if (!storyId) return;
    try {
      await getBridge().rewindTo(storyId, fromIdx);
      await get().load(storyId);
    } catch (err) {
      set({ turnError: classifyError(err) });
    }
  },

  reset: () =>
    set({
      storyId: undefined,
      messages: [],
      rulings: [],
      cast: [],
      loading: false,
      thinking: false,
      proseBuffer: "",
      turnError: undefined,
    }),
}));
