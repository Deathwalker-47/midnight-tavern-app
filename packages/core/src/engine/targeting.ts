/**
 * Targeting scopes (plan 08 §4) — who one action reaches.
 *
 * The engine knows exactly one fact about sides: whether a character has been validated hostile to
 * the player. So `all_allies` is everyone on the actor's side of that line (the actor included) and
 * `all_enemies` everyone on the other side; `area` ignores sides and reaches everyone but the actor;
 * `multiple` reaches the targets the classifier named. Only present, living characters are reached,
 * in roster order, and never more than the scope's cap.
 *
 * Pure: the caller supplies the present roster as candidates.
 */
import {
  DEFAULT_MULTIPLE_TARGETS,
  MAX_ACTION_TARGETS,
  type ActionDef,
  type MechanicalIntent,
} from "../types/index.js";

export interface TargetCandidate {
  characterId: string;
  alive: boolean;
  /** Validated hostile to the player (the engine's only notion of a side). */
  hostile: boolean;
}

/**
 * The character ids a scoped action reaches, or undefined when the action is single-target (absent
 * or `single` scope) and the caller should resolve the named target as always. An empty list means
 * nobody is in reach.
 */
export function expandTargets(
  action: Pick<ActionDef, "targeting">,
  intent: Pick<MechanicalIntent, "actorId" | "targetId" | "targetIds">,
  candidates: readonly TargetCandidate[]
): string[] | undefined {
  const scope = action.targeting?.scope;
  if (!scope || scope === "single") return undefined;
  if (scope === "self") return [intent.actorId];
  const living = candidates.filter((candidate) => candidate.alive);
  // The schema already bounds an explicit cap by MAX_ACTION_TARGETS.
  const cap =
    action.targeting!.maxTargets ??
    (scope === "multiple" ? DEFAULT_MULTIPLE_TARGETS : MAX_ACTION_TARGETS);
  if (scope === "multiple") {
    const named = new Set([intent.targetId, ...(intent.targetIds ?? [])]);
    return living
      .filter((candidate) => candidate.characterId !== intent.actorId && named.has(candidate.characterId))
      .map((candidate) => candidate.characterId)
      .slice(0, cap);
  }
  if (scope === "area") {
    return living
      .filter((candidate) => candidate.characterId !== intent.actorId)
      .map((candidate) => candidate.characterId)
      .slice(0, cap);
  }
  // A missing actor reads as not hostile, the side of every unflagged character.
  const actorHostile =
    candidates.find((candidate) => candidate.characterId === intent.actorId)?.hostile ?? false;
  const wantHostile = scope === "all_allies" ? actorHostile : !actorHostile;
  return living
    .filter((candidate) => candidate.hostile === wantHostile)
    .map((candidate) => candidate.characterId)
    .slice(0, cap);
}
