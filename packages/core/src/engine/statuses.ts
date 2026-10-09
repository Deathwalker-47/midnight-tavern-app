/**
 * Timed statuses (plan 08 §4 durations) — buffs, debuffs, poisons and regeneration.
 *
 * An outcome may apply a status to its actor or target for the next `durationTurns` turns. While
 * active, a status adds its check bonus to the bearer's rolls and its attribute bonuses to the
 * bearer's scores. A status with `resourcePerTurn` changes the bearer's pools at the end of each
 * turn it already existed at; that change is reported as a ruling so the narrator is told about it,
 * and a death it causes is derived by the ledger like any other.
 *
 * Pure: plans mutations; only the ledger applies them.
 */
import {
  CORE_RESOURCE_ROLES,
  STANDARD_DIFFICULTY,
  type CharacterHardState,
  type DamageAdjustment,
  type DifficultyConfig,
  type ResourceRole,
  type Ruling,
  type StorySchema,
} from "../types/index.js";
import { damageMultiplierForRecipient, scaleDamageDelta } from "./difficulty.js";
import type { StagedMutation } from "./ledger.js";
import { resourceIdForRole } from "./resources.js";

const CORE_ROLES: ReadonlySet<string> = new Set(CORE_RESOURCE_ROLES);

/** Total check bonus from the bearer's active statuses. */
export function statusCheckBonus(bearer: CharacterHardState): number {
  return (bearer.activeEffects ?? []).reduce((sum, status) => sum + (status.checkBonus ?? 0), 0);
}

/** Total bonus to one attribute from the bearer's active statuses. */
export function statusAttributeBonus(bearer: CharacterHardState, attributeId: string): number {
  return (bearer.activeEffects ?? []).reduce(
    (sum, status) => sum + (status.attributeBonus?.[attributeId] ?? 0),
    0
  );
}

export interface StatusTick {
  /** One ruling per status that changed a pool this turn (for the narrator, journal and UI). */
  rulings: Ruling[];
  /** Pool changes, then the countdown — commit these through the ledger. */
  mutations: StagedMutation[];
}

/**
 * End-of-turn tick for one bearer. Only statuses named in `statusIds` (those present when the turn
 * began) tick, so a status applied this turn first acts at the end of the next one. The dead are
 * never healed or harmed further, but their statuses still count down.
 */
export function planStatusTick(
  schema: StorySchema,
  bearer: CharacterHardState,
  statusIds: readonly string[],
  difficulty: DifficultyConfig = STANDARD_DIFFICULTY
): StatusTick {
  const ticking = new Set(statusIds);
  const rulings: Ruling[] = [];
  const mutations: StagedMutation[] = [];
  const poolIds = new Set(schema.resources.map((resource) => resource.id));

  for (const status of bearer.activeEffects ?? []) {
    if (!ticking.has(status.id) || !bearer.alive) continue;
    const deltas: Record<string, number> = {};
    const damageAdjustments: DamageAdjustment[] = [];
    for (const [key, delta] of Object.entries(status.resourcePerTurn ?? {})) {
      const resourceId =
        !poolIds.has(key) && CORE_ROLES.has(key)
          ? resourceIdForRole(schema, key as ResourceRole) ?? key
          : key;
      if (!bearer.resources[resourceId] || delta === 0) continue;
      deltas[resourceId] = delta;
      if (delta < 0) {
        const multiplier = damageMultiplierForRecipient(bearer, difficulty);
        mutations.push({
          kind: "resourceDelta",
          characterId: bearer.characterId,
          resourceId,
          delta,
          difficultyMultiplier: multiplier,
        });
        damageAdjustments.push({
          characterId: bearer.characterId,
          resourceId,
          baseDelta: delta,
          multiplier,
          scaledDelta: scaleDamageDelta(delta, multiplier),
        });
      } else {
        mutations.push({ kind: "resourceDelta", characterId: bearer.characterId, resourceId, delta });
      }
    }
    if (Object.keys(deltas).length === 0) continue;
    rulings.push({
      turnId: `${bearer.characterId}:status:${status.id}`,
      actorId: bearer.characterId,
      actionId: `status_${status.id}`,
      actionLabel: status.label,
      gate: { allowed: true },
      effectsApplied: {
        resourceDeltaSelf: deltas,
        narrationHint: `${status.label} continues to take effect.`,
      },
      difficulty,
      ...(damageAdjustments.length > 0 ? { damageAdjustments } : {}),
    });
  }

  const listed = (bearer.activeEffects ?? []).filter((status) => ticking.has(status.id));
  if (listed.length > 0) {
    mutations.push({
      kind: "tickStatuses",
      characterId: bearer.characterId,
      statusIds: listed.map((status) => status.id),
    });
  }
  return { rulings, mutations };
}
