/**
 * Recovery (plan 08 §5, owner decision D5) — how health, stamina and mana come back.
 *
 * The brief: "a genuine currency, but don't inconvenience the user all the time — a tad easier than
 * normal". Four mechanisms, every number in `config/economy.json`:
 *   - end-of-turn regeneration, as a share of each core pool's maximum: stamina comes back quickly out
 *     of combat, mana trickles always, health trickles out of combat. A character is "in combat" for a
 *     turn when it acted in or was the target of a combat or wounding ruling that turn (the engine has
 *     no scene boundary, so "per scene" is per quiet turn);
 *   - `take_rest`, an engine-owned action that restores a larger share out of danger, then cools down;
 *   - `consume_item`, which uses up one held item that declares `restores`.
 * Regeneration and resting apply to schema-version-3 rulebooks only (D7: legacy stories keep their
 * economy); consuming works wherever an item declares what it restores. The dead never recover, and
 * nothing is restored past a pool's maximum.
 *
 * Pure: reads the frozen schema, the turn's rulings and hard state; the ledger applies every change.
 */
import { ECONOMY_CONFIG, type EconomyConfig } from "../config/index.js";
import {
  CONSUME_ITEM_ACTION_ID,
  REST_ACTION_ID,
  type CharacterHardState,
  type GateVerdict,
  type MechanicalIntent,
  type Ruling,
  type StorySchema,
} from "../types/index.js";
import type { StagedMutation } from "./ledger.js";
import { resourceIdForRole } from "./resources.js";

const RECOVERY_ROLES = ["health", "stamina", "mana"] as const;
type RecoveryRole = (typeof RECOVERY_ROLES)[number];
type Pool = { current: number; max: number };

export interface Recovery {
  /** Amount restored per resource id. */
  gains: Record<string, number>;
  mutations: StagedMutation[];
}

export interface RecoveryResolution {
  ruling: Ruling;
  mutations: StagedMutation[];
}

/** Whether the rulebook runs the regeneration and rest economy (role-bearing v3 rulebooks, D7). */
export function hasRecoveryEconomy(schema: Pick<StorySchema, "schemaVersion">): boolean {
  return schema.schemaVersion >= 3;
}

/** Characters that acted in, or were the target of, a combat or wounding ruling. */
export function combatParticipants(
  schema: Pick<StorySchema, "actions">,
  rulings: readonly Ruling[]
): Set<string> {
  const involved = new Set<string>();
  for (const ruling of rulings) {
    if (!ruling.gate.allowed) continue;
    const combat = schema.actions.find((action) => action.id === ruling.actionId)?.category === "combat";
    const wounding = Object.values(ruling.effectsApplied?.resourceDeltaTarget ?? {}).some(
      (delta) => delta < 0
    );
    if (!combat && !wounding) continue;
    involved.add(ruling.actorId);
    if (ruling.targetId) involved.add(ruling.targetId);
  }
  return involved;
}

/** Room left in a pool. */
function headroom(pool: Pool): number {
  return Math.max(0, pool.max - pool.current);
}

/** A share of a pool's maximum: at least `minimumGain` when the share is non-zero, never past max. */
function shareOf(pool: Pool, fraction: number, config: EconomyConfig): number {
  if (fraction <= 0) return 0;
  return Math.min(Math.max(config.minimumGain, Math.round(pool.max * fraction)), headroom(pool));
}

/** Restore each core pool the bearer has by `amountFor(role, pool)`. */
function restore(
  schema: Pick<StorySchema, "resources">,
  bearer: CharacterHardState,
  amountFor: (role: RecoveryRole, pool: Pool) => number
): Recovery {
  const gains: Record<string, number> = {};
  const mutations: StagedMutation[] = [];
  for (const role of RECOVERY_ROLES) {
    const resourceId = resourceIdForRole(schema, role);
    const pool = resourceId ? bearer.resources[resourceId] : undefined;
    if (!resourceId || !pool) continue;
    const amount = amountFor(role, pool);
    if (amount <= 0) continue;
    gains[resourceId] = amount;
    mutations.push({
      kind: "resourceDelta",
      characterId: bearer.characterId,
      resourceId,
      delta: amount,
    });
  }
  return { gains, mutations };
}

/** End-of-turn regeneration for one character. Nothing for the dead or for legacy rulebooks. */
export function planRecovery(
  schema: Pick<StorySchema, "resources" | "schemaVersion">,
  bearer: CharacterHardState,
  inCombat: boolean,
  config: EconomyConfig = ECONOMY_CONFIG
): Recovery {
  if (!hasRecoveryEconomy(schema) || !bearer.alive) return { gains: {}, mutations: [] };
  const rate = inCombat ? "inCombat" : "outOfCombat";
  return restore(schema, bearer, (role, pool) =>
    shareOf(pool, config.regenPerTurn[role][rate], config)
  );
}

function refusal(
  base: Omit<Ruling, "gate" | "effectsApplied">,
  reason: string,
  code: NonNullable<GateVerdict["code"]>
): RecoveryResolution {
  return { ruling: { ...base, gate: { allowed: false, reason, code }, effectsApplied: null }, mutations: [] };
}

/**
 * Rest out of danger: restore the configured share of every core pool, then cool down. Refused
 * while anyone hostile to the actor's side is present (`in_combat`) and on legacy rulebooks.
 */
export function resolveRest(
  schema: StorySchema,
  actor: CharacterHardState,
  intent: MechanicalIntent,
  context: { threatened: boolean },
  config: EconomyConfig = ECONOMY_CONFIG
): RecoveryResolution {
  const base = {
    turnId: `${intent.actorId}:${REST_ACTION_ID}`,
    actorId: actor.characterId,
    actionId: REST_ACTION_ID,
    actionLabel: "Rest",
  };
  if (!schema.locked) {
    return refusal(base, "Story schema is not frozen; the gate refuses unlocked schemas.", "schema_unlocked");
  }
  if (!actor.alive) return refusal(base, "Actor is not alive.", "actor_dead");
  if (!hasRecoveryEconomy(schema)) {
    return refusal(base, "This story's rulebook has no recovery economy to rest into.", "not_invocable");
  }
  if (context.threatened) return refusal(base, "There is no resting with enemies close by.", "in_combat");
  const waiting = actor.cooldowns?.[REST_ACTION_ID] ?? 0;
  if (waiting > 0) {
    return refusal(base, `Too soon to rest again — wait ${waiting} more turn(s).`, "on_cooldown");
  }
  const { gains, mutations } = restore(schema, actor, (role, pool) =>
    shareOf(pool, config.rest.restore[role], config)
  );
  const cooldown = config.rest.cooldownTurns;
  if (cooldown > 0) {
    mutations.push({
      kind: "setCooldown",
      characterId: actor.characterId,
      actionId: REST_ACTION_ID,
      turns: cooldown,
    });
  }
  return {
    ruling: {
      ...base,
      gate: { allowed: true },
      effectsApplied: { resourceDeltaSelf: gains, narrationHint: "a proper rest restores strength" },
      ...(cooldown > 0 ? { cooldownApplied: cooldown } : {}),
    },
    mutations,
  };
}

/** Use up one held item that declares what it restores. Never rolls; allowed in combat. */
export function resolveConsumeItem(
  schema: StorySchema,
  actor: CharacterHardState,
  intent: MechanicalIntent,
  config: EconomyConfig = ECONOMY_CONFIG
): RecoveryResolution {
  const item = intent.itemId ? schema.items.find((entry) => entry.id === intent.itemId) : undefined;
  const base = {
    turnId: `${intent.actorId}:${CONSUME_ITEM_ACTION_ID}`,
    actorId: actor.characterId,
    actionId: CONSUME_ITEM_ACTION_ID,
    actionLabel: item ? `Use ${item.name}` : "Use an item",
  };
  if (!schema.locked) {
    return refusal(base, "Story schema is not frozen; the gate refuses unlocked schemas.", "schema_unlocked");
  }
  if (!actor.alive) return refusal(base, "Actor is not alive.", "actor_dead");
  if (!item) {
    return refusal(
      base,
      intent.itemId ? `Unknown item "${intent.itemId}".` : "No item was named to use.",
      "item_required"
    );
  }
  const restores = item.restores;
  if (!restores) return refusal(base, `${item.name} restores nothing when used.`, "not_invocable");
  const held = actor.inventory.find((entry) => entry.itemId === item.id)?.qty ?? 0;
  if (held < 1) return refusal(base, `No ${item.name} left to use.`, "item_required");
  const { gains, mutations } = restore(schema, actor, (role, pool) =>
    Math.min(restores[role] ?? 0, config.maximumConsumableRestore, headroom(pool))
  );
  mutations.push({ kind: "removeItem", characterId: actor.characterId, itemId: item.id, qty: 1 });
  return {
    ruling: {
      ...base,
      gate: { allowed: true },
      effectsApplied: { resourceDeltaSelf: gains, narrationHint: `the ${item.name} is used up` },
      costsPaid: { items: [{ itemId: item.id, qty: 1 }] },
    },
    mutations,
  };
}
