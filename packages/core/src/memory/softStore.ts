/**
 * Soft-state store & patch merge (low-level-plan §M7.2, D5).
 *
 * The analyzer emits a typed `SoftStatePatch`; this module is the *only* thing that turns
 * one into persisted soft state, applying the exact merge rules from the plan:
 *   • `set`                 → overwrites a `current`/`identity` scalar,
 *   • `append`              → adds to a string list, deduped case-insensitively,
 *   • `observe`             → appends a timestamped observation, FIFO-capped at 200,
 *   • `adjust_relationship` → nudges trust/power by a delta, clamped to [-1, 1],
 *   • an unknown characterId → auto-creates a **secondary** soft profile (NPCs get hard
 *     state only via NpcTemplate instantiation, never here — this is the wall).
 *
 * The merge functions are pure (state in → state out) so M7's tests can prove each rule
 * and prove a mechanical field can never appear; `applySoftPatch` wires them to the store
 * inside one transaction.
 */
import type { Store } from "../store/index.js";
import {
  type CharacterSoftState,
  type WorldSoftState,
  type SoftStatePatch,
  type CharacterOp,
  type WorldOp,
} from "../types/index.js";

/** Maximum retained observations per character (FIFO). */
export const OBSERVATION_CAP = 200;

/** Clamp a relationship axis into its legal [-1, 1] range. */
function clamp01(n: number): number {
  return Math.max(-1, Math.min(1, n));
}

/** Case-insensitive membership test for deduping string lists. */
function includesCI(list: string[], value: string): boolean {
  const v = value.toLowerCase();
  return list.some((x) => x.toLowerCase() === v);
}

/** A blank secondary soft profile for a newly-observed character. */
export function newSoftState(characterId: string, name: string): CharacterSoftState {
  return {
    characterId,
    name,
    tier: "secondary",
    identity: { traits: [], likes: [], dislikes: [] },
    behavioralSignatures: [],
    current: {},
    relationships: [],
    observations: [],
  };
}

/** A blank world soft state (used when a story has none yet). */
export function newWorldSoftState(): WorldSoftState {
  return { overview: "", locations: [], arcs: [], unresolvedThreads: [] };
}

/** Apply one character op to a soft state, returning a new state (input untouched). */
export function applyCharacterOp(
  state: CharacterSoftState,
  op: CharacterOp,
  turnIdx: number
): CharacterSoftState {
  switch (op.op) {
    case "set": {
      if (op.path === "mood" || op.path === "location" || op.path === "goal") {
        return { ...state, current: { ...state.current, [op.path]: op.value } };
      }
      // "appearance" | "speechStyle" live on identity.
      return { ...state, identity: { ...state.identity, [op.path]: op.value } };
    }
    case "append": {
      const list = state.identity[op.path];
      if (includesCI(list, op.value)) return state;
      return { ...state, identity: { ...state.identity, [op.path]: [...list, op.value] } };
    }
    case "observe": {
      const observations = [...state.observations, { turnIdx, text: op.text }];
      // FIFO cap: keep only the most recent OBSERVATION_CAP.
      const capped =
        observations.length > OBSERVATION_CAP
          ? observations.slice(observations.length - OBSERVATION_CAP)
          : observations;
      return { ...state, observations: capped };
    }
    case "adjust_relationship": {
      const existing = state.relationships.find((r) => r.toCharacterId === op.toCharacterId);
      const next = {
        toCharacterId: op.toCharacterId,
        trust: clamp01((existing?.trust ?? 0) + op.trustDelta),
        power: clamp01((existing?.power ?? 0) + op.powerDelta),
        ...(op.feeling !== undefined
          ? { feeling: op.feeling }
          : existing?.feeling !== undefined
            ? { feeling: existing.feeling }
            : {}),
      };
      const relationships = existing
        ? state.relationships.map((r) => (r.toCharacterId === op.toCharacterId ? next : r))
        : [...state.relationships, next];
      return { ...state, relationships };
    }
  }
}

/** Apply one world op to a world soft state, returning a new state (input untouched). */
export function applyWorldOp(state: WorldSoftState, op: WorldOp): WorldSoftState {
  switch (op.op) {
    case "set_overview_hint":
      return { ...state, overview: op.text };
    case "add_location": {
      if (state.locations.some((l) => l.name.toLowerCase() === op.name.toLowerCase())) return state;
      return { ...state, locations: [...state.locations, { name: op.name, description: op.description }] };
    }
    case "add_thread": {
      if (state.unresolvedThreads.some((t) => t.title.toLowerCase() === op.title.toLowerCase())) return state;
      return {
        ...state,
        unresolvedThreads: [...state.unresolvedThreads, { title: op.title, note: op.note, resolved: false }],
      };
    }
    case "resolve_thread": {
      return {
        ...state,
        unresolvedThreads: state.unresolvedThreads.map((t) =>
          t.title.toLowerCase() === op.title.toLowerCase() ? { ...t, resolved: true } : t
        ),
      };
    }
  }
}

/**
 * Persist a full analyzer patch for one story at `turnIdx`, inside a single transaction.
 * Unknown character ids auto-create a secondary profile; `nameFor` supplies a display name
 * for those (falling back to the id). Reads-modify-writes each touched character's soft
 * state and the world soft state.
 */
export async function applySoftPatch(
  store: Store,
  storyId: string,
  patch: SoftStatePatch,
  turnIdx: number,
  nameFor?: (characterId: string) => string | undefined
): Promise<void> {
  await store.transaction(async () => {
    for (const entry of patch.characterOps) {
      const existing = await store.characters.get(entry.characterId);
      let soft: CharacterSoftState =
        existing?.soft ??
        newSoftState(entry.characterId, nameFor?.(entry.characterId) ?? entry.characterId);
      for (const op of entry.ops) soft = applyCharacterOp(soft, op, turnIdx);

      if (existing) {
        // Known character (has hard state): update its soft column, preserving its tier
        // (default primary — it earned hard state) unless it already had one.
        await store.characters.updateSoft(entry.characterId, soft, existing.softTier ?? soft.tier);
      } else {
        // Unknown id: a purely-observed secondary character, no hard state. Persist a
        // minimal row carrying only the soft profile so getLivingCard can render it.
        await store.characters.insert({
          id: entry.characterId,
          storyId,
          name: soft.name,
          isPlayer: false,
          hard: {
            characterId: entry.characterId,
            isPlayer: false,
            attributes: {},
            resources: {},
            skills: [],
            inventory: [],
            flags: {},
            alive: true,
          },
          soft,
          softTier: "secondary",
        });
      }
    }

    if (patch.worldOps.length > 0) {
      let world = (await store.worldSoft.get(storyId)) ?? newWorldSoftState();
      for (const op of patch.worldOps) world = applyWorldOp(world, op);
      await store.worldSoft.set(storyId, world);
    }
  });
}
