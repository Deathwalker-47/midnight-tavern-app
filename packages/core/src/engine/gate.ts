/**
 * Gate (low-level-plan M2 step 2) — the guarantee that rules hold.
 *
 * `checkGate` is a PURE function with no I/O. It decides whether an attempted action
 * is even permitted, BEFORE any die is rolled. A denied action never rolls.
 *
 * Checks run in this exact order, returning `{ allowed: false, reason }` on the first
 * failure:
 *   1. action exists in the catalog
 *   2. actor is alive
 *   3. `requiresSkill` is learned
 *   4. `minRank` is met
 *   5. `requiresItemKind` is present in inventory
 *   6. `costs` are affordable
 *   7. all `Condition` prerequisites hold
 */
import type { StorySchema, Condition, CostSpec } from "../types/index.js";
import { rankAtLeast } from "../types/index.js";
import type { CharacterHardState } from "../types/index.js";
import type { GateVerdict, MechanicalIntent } from "../types/index.js";
import { attrScore } from "./attributes.js";

const deny = (reason: string): GateVerdict => ({ allowed: false, reason });
const ALLOW: GateVerdict = { allowed: true };

/** Find a learned skill on the actor, or undefined. */
function learnedSkill(actor: CharacterHardState, skillId: string) {
  return actor.skills.find((s) => s.skillId === skillId);
}

/** How many of an item the actor holds. */
function heldQty(actor: CharacterHardState, itemId: string): number {
  return actor.inventory.find((e) => e.itemId === itemId)?.qty ?? 0;
}

/** True if the actor holds at least one item of the given kind (per the schema table). */
function holdsItemKind(schema: StorySchema, actor: CharacterHardState, kind: string): boolean {
  return actor.inventory.some((entry) => {
    if (entry.qty <= 0) return false;
    const def = schema.items.find((i) => i.id === entry.itemId);
    return def?.kind === kind;
  });
}

/** Whether the actor can currently pay a cost (resources + items). */
export function canAfford(actor: CharacterHardState, cost: CostSpec | undefined): boolean {
  if (!cost) return true;
  if (cost.resources) {
    for (const [resId, amount] of Object.entries(cost.resources)) {
      const res = actor.resources[resId];
      if (!res || res.current < amount) return false;
    }
  }
  if (cost.items) {
    for (const { itemId, qty } of cost.items) {
      if (heldQty(actor, itemId) < qty) return false;
    }
  }
  return true;
}

/** Evaluate a single prerequisite condition against the actor's hard state. */
export function conditionHolds(actor: CharacterHardState, cond: Condition): boolean {
  switch (cond.type) {
    case "skill": {
      const sk = learnedSkill(actor, cond.skillId);
      if (!sk) return false;
      return cond.minRank ? rankAtLeast(sk.rank, cond.minRank) : true;
    }
    case "resource": {
      const res = actor.resources[cond.resourceId];
      return !!res && res.current >= cond.min;
    }
    case "item":
      return heldQty(actor, cond.itemId) > 0;
    case "flag":
      return (actor.flags[cond.flagId] ?? false) === cond.value;
    case "attribute":
      return attrScore(actor, cond.attributeId) >= cond.min;
  }
}

/**
 * The gate check. Pure; no rolls, no mutation. The schema must be frozen
 * (`locked`) — the gate refuses to rule against an unfrozen rule set.
 */
export function checkGate(
  schema: StorySchema,
  actor: CharacterHardState,
  intent: MechanicalIntent
): GateVerdict {
  if (!schema.locked) {
    return deny("Story schema is not frozen; the gate refuses unlocked schemas.");
  }

  // 1. action exists in the catalog
  const action = schema.actions.find((a) => a.id === intent.actionId);
  if (!action) {
    return deny(`Unknown action "${intent.actionId}".`);
  }

  // 2. actor is alive
  if (!actor.alive) {
    return deny("Actor is not alive.");
  }

  // 3. requiresSkill learned  +  4. minRank met
  if (action.requiresSkill) {
    const sk = learnedSkill(actor, action.requiresSkill);
    if (!sk) {
      const def = schema.skills.find((s) => s.id === action.requiresSkill);
      return deny(`Requires ${def?.name ?? action.requiresSkill} — not learned.`);
    }
    if (action.minRank && !rankAtLeast(sk.rank, action.minRank)) {
      return deny(`Requires ${action.minRank} rank — current rank is ${sk.rank}.`);
    }
  }

  // 5. requiresItemKind present in inventory
  if (action.requiresItemKind && !holdsItemKind(schema, actor, action.requiresItemKind)) {
    return deny(`Requires a ${action.requiresItemKind} in inventory.`);
  }

  // 6. costs affordable
  if (!canAfford(actor, action.costs)) {
    return deny("Cannot afford the cost of this action.");
  }

  // 7. all prerequisite conditions on the required skill hold
  if (action.requiresSkill) {
    const def = schema.skills.find((s) => s.id === action.requiresSkill);
    if (def) {
      for (const cond of def.prerequisites) {
        if (!conditionHolds(actor, cond)) {
          return deny(`Prerequisite not met for ${def.name}.`);
        }
      }
    }
  }

  return ALLOW;
}
