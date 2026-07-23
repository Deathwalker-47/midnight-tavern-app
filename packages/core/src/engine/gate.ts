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
import type {
  StorySchema,
  CostSpec,
  EquipmentRuntimeCatalog,
  MasteryRank,
} from "../types/index.js";
import { rankAtLeast } from "../types/index.js";
import type { CharacterHardState } from "../types/index.js";
import type { GateVerdict, MechanicalIntent } from "../types/index.js";
import { conditionHolds } from "./conditions.js";
import {
  equippedItemKind,
  equipmentEnabledSkillRank,
  equipmentEnablesAction,
} from "./equipment.js";

export { conditionHolds } from "./conditions.js";

export interface GateContext {
  equipment?: EquipmentRuntimeCatalog;
}

const deny = (reason: string, code: GateVerdict["code"]): GateVerdict => ({
  allowed: false,
  reason,
  code,
});
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

function effectiveSkillRank(
  actor: CharacterHardState,
  skillId: string,
  context?: GateContext
): MasteryRank | undefined {
  return (
    learnedSkill(actor, skillId)?.rank ??
    (context?.equipment
      ? equipmentEnabledSkillRank(actor, skillId, context.equipment)
      : undefined)
  );
}

/**
 * The gate check. Pure; no rolls, no mutation. The schema must be frozen
 * (`locked`) — the gate refuses to rule against an unfrozen rule set.
 */
export function checkGate(
  schema: StorySchema,
  actor: CharacterHardState,
  intent: MechanicalIntent,
  context?: GateContext
): GateVerdict {
  if (!schema.locked) {
    return deny(
      "Story schema is not frozen; the gate refuses unlocked schemas.",
      "schema_unlocked"
    );
  }

  // 1. action exists in the catalog
  const action = schema.actions.find((a) => a.id === intent.actionId);
  if (!action) {
    return deny(`Unknown action "${intent.actionId}".`, "unknown_action");
  }

  // 2. actor is alive
  if (!actor.alive) {
    return deny("Actor is not alive.", "actor_dead");
  }

  if (
    action.requiresEquipmentEnabler &&
    (!context?.equipment || !equipmentEnablesAction(actor, action.id, context.equipment))
  ) {
    return deny(`Requires equipped gear that enables ${action.label}.`, "item_required");
  }

  // 3. requiresSkill learned  +  4. minRank met
  if (action.requiresSkill) {
    const rank = effectiveSkillRank(actor, action.requiresSkill, context);
    if (!rank) {
      const def = schema.skills.find((s) => s.id === action.requiresSkill);
      return deny(`Requires ${def?.name ?? action.requiresSkill} — not learned.`, "skill_required");
    }
    if (action.minRank && !rankAtLeast(rank, action.minRank)) {
      return deny(`Requires ${action.minRank} rank — current rank is ${rank}.`, "rank_required");
    }
  }

  // 5. runtime equipment must be equipped; legacy catalog stories retain inventory gating.
  if (action.requiresItemKind) {
    const present = context?.equipment
      ? equippedItemKind(actor, action.requiresItemKind, context.equipment)
      : holdsItemKind(schema, actor, action.requiresItemKind);
    if (!present) {
      return deny(
        context?.equipment
          ? `Requires an equipped ${action.requiresItemKind}.`
          : `Requires a ${action.requiresItemKind} in inventory.`,
        "item_required"
      );
    }
  }

  // 6. costs affordable
  if (!canAfford(actor, action.costs)) {
    return deny("Cannot afford the cost of this action.", "cannot_afford");
  }

  // 7. all prerequisite conditions on the required skill hold
  if (action.requiresSkill) {
    const def = schema.skills.find((s) => s.id === action.requiresSkill);
    if (def) {
      for (const cond of def.prerequisites) {
        if (!conditionHolds(actor, cond)) {
          return deny(`Prerequisite not met for ${def.name}.`, "prerequisite_failed");
        }
      }
    }
  }

  return ALLOW;
}
