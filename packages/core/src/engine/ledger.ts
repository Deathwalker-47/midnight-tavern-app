/**
 * Ledger (low-level-plan M2 step 4) — the ONLY code path that mutates hard state.
 *
 * The resolver computes outcomes purely and stages explicit mutations; the ledger
 * applies them with clamping, inventory add/remove, flags, skill progress, and death
 * (a character dies when a resource flagged `lethal` in the schema reaches 0).
 *
 * Nothing else in the codebase writes CharacterHardState. Prose never reaches here.
 */
import type { CharacterHardState, MasteryRank, StorySchema } from "../types/index.js";
import { scaleDamageDelta } from "../types/index.js";
import { attrScore, clampAttribute } from "./attributes.js";

/** A single staged change to one character's hard state. */
export type StagedMutation =
  | {
      kind: "resourceDelta";
      characterId: string;
      resourceId: string;
      delta: number;
      /** Applies only to effect damage; costs and healing omit this field. */
      difficultyMultiplier?: number;
    }
  | { kind: "attributeDelta"; characterId: string; attributeId: string; delta: number }
  | { kind: "grantItem"; characterId: string; itemId: string; qty: number }
  | { kind: "removeItem"; characterId: string; itemId: string; qty: number }
  | { kind: "setFlag"; characterId: string; flagId: string; value: boolean }
  | {
      kind: "setSkill";
      characterId: string;
      skillId: string;
      rank: MasteryRank;
      successCount: number;
      xp?: number;
    };

/** Clamp a value into [0, max]. */
function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(value, max));
}

/** Add/remove from an inventory stack; drops the stack when it hits 0. */
function adjustInventory(actor: CharacterHardState, itemId: string, delta: number): void {
  const entry = actor.inventory.find((e) => e.itemId === itemId);
  if (entry) {
    entry.qty = Math.max(0, entry.qty + delta);
    if (entry.qty === 0) {
      actor.inventory = actor.inventory.filter((e) => e.itemId !== itemId);
    }
  } else if (delta > 0) {
    actor.inventory.push({ itemId, qty: delta });
  }
  // Removing from an absent stack is a no-op (nothing to remove).
}

/** The ids of resources the schema marks lethal (reaching 0 kills the character). */
function lethalResourceIds(schema: StorySchema): string[] {
  return schema.resources.filter((r) => r.lethal).map((r) => r.id);
}

/**
 * Apply staged mutations to the given characters (keyed by id), in order.
 * Mutates the passed states in place. Returns the ids of characters that died as a
 * direct result (were alive before, dead after).
 *
 * `commit` is transactional at the call site (the orchestrator wraps a turn's
 * ledger writes + persistence in one DB transaction, M6/§6).
 */
export function commit(
  schema: StorySchema,
  mutations: StagedMutation[],
  charsById: Map<string, CharacterHardState>
): string[] {
  const lethal = lethalResourceIds(schema);
  const wasAlive = new Map<string, boolean>();
  for (const [id, c] of charsById) wasAlive.set(id, c.alive);

  for (const m of mutations) {
    const actor = charsById.get(m.characterId);
    if (!actor) continue; // unknown character: skip defensively (orchestrator ensures presence)

    switch (m.kind) {
      case "attributeDelta": {
        const definition = schema.attributes.find(
          (attribute) => attribute.id === m.attributeId
        );
        actor.attributes[m.attributeId] = clampAttribute(
          attrScore(actor, m.attributeId, schema) + m.delta,
          definition
        );
        break;
      }
      case "resourceDelta": {
        const res = actor.resources[m.resourceId];
        const delta =
          m.delta < 0 && m.difficultyMultiplier !== undefined
            ? scaleDamageDelta(m.delta, m.difficultyMultiplier)
            : m.delta;
        if (res) res.current = clamp(res.current + delta, res.max);
        break;
      }
      case "grantItem":
        adjustInventory(actor, m.itemId, m.qty);
        break;
      case "removeItem":
        adjustInventory(actor, m.itemId, -m.qty);
        break;
      case "setFlag":
        actor.flags[m.flagId] = m.value;
        break;
      case "setSkill": {
        const sk = actor.skills.find((s) => s.skillId === m.skillId);
        if (sk) {
          sk.rank = m.rank;
          sk.successCount = m.successCount;
          if (m.xp !== undefined) sk.xp = m.xp;
        } else {
          actor.skills.push({
            skillId: m.skillId,
            rank: m.rank,
            successCount: m.successCount,
            ...(m.xp !== undefined ? { xp: m.xp } : {}),
          });
        }
        break;
      }
    }
  }

  // Derive death: any character whose lethal resource is now <= 0 falls.
  const died: string[] = [];
  for (const [id, actor] of charsById) {
    if (!actor.alive) continue;
    const dead = lethal.some((rid) => {
      const res = actor.resources[rid];
      return !!res && res.current <= 0;
    });
    if (dead) {
      actor.alive = false;
      if (wasAlive.get(id)) died.push(id);
    }
  }
  return died;
}
