/**
 * Attempt costs (plan 08 §3) — the ONE place that decides what an attempt costs, so the gate and
 * the resolver can never disagree about affordability.
 *
 * An attempt pays the action's own `costs` plus, for an action that swings a weapon, that weapon's
 * `staminaCost` drawn from the story's stamina-role pool. Costs are paid on the attempt, win or lose.
 * Generated item numbers are untrusted, so the weapon cost is clamped the way item damage is.
 *
 * Pure: reads the frozen schema, the actor, and the runtime equipment catalog only.
 */
import type {
  ActionDef,
  CharacterHardState,
  CostSpec,
  EquipmentRuntimeCatalog,
  MechanicalIntent,
  StorySchema,
} from "../types/index.js";
import { equippedItemDefinition } from "./equipment.js";
import { resourceIdForRole } from "./resources.js";

/** Ceiling on a single weapon's per-swing stamina cost, whatever an item claims. */
export const MAX_WEAPON_STAMINA_COST = 10;

/**
 * Engine-owned default for a v3 weapon that declares no stamina cost (finding 21: every weapon
 * carries one). Legacy rulebooks keep weapons free unless the item says otherwise (D7).
 */
export const DEFAULT_WEAPON_STAMINA_COST = { oneHanded: 1, twoHanded: 2 } as const;

export interface WeaponStaminaCost {
  resourceId: string;
  amount: number;
  itemName: string;
}

/** Item schemas already require a non-negative integer; this only enforces the ceiling. */
function boundedStaminaCost(value: number): number {
  return Math.min(MAX_WEAPON_STAMINA_COST, value);
}

/** The extra stamina this attempt's weapon demands, or undefined when none applies. */
export function weaponStaminaCost(
  schema: StorySchema,
  actor: CharacterHardState,
  action: ActionDef,
  intent: MechanicalIntent,
  equipment?: EquipmentRuntimeCatalog
): WeaponStaminaCost | undefined {
  if (action.requiresItemKind !== "weapon") return undefined;
  const resourceId = resourceIdForRole(schema, "stamina");
  if (!resourceId) return undefined;
  const item =
    (equipment ? equippedItemDefinition(actor, equipment, "weapon", intent.itemId) : undefined) ??
    (intent.itemId ? schema.items.find((entry) => entry.id === intent.itemId) : undefined);
  if (!item) return undefined;
  const amount =
    item.staminaCost !== undefined
      ? boundedStaminaCost(item.staminaCost)
      : schema.schemaVersion >= 3
        ? "handsRequired" in item && item.handsRequired === 2
          ? DEFAULT_WEAPON_STAMINA_COST.twoHanded
          : DEFAULT_WEAPON_STAMINA_COST.oneHanded
        : 0;
  return amount > 0 ? { resourceId, amount, itemName: item.name } : undefined;
}

/** Everything one attempt costs: the action's own costs plus any weapon stamina. */
export function attemptCost(
  schema: StorySchema,
  actor: CharacterHardState,
  action: ActionDef,
  intent: MechanicalIntent,
  equipment?: EquipmentRuntimeCatalog
): CostSpec | undefined {
  const weapon = weaponStaminaCost(schema, actor, action, intent, equipment);
  if (!weapon) return action.costs;
  const resources = { ...(action.costs?.resources ?? {}) };
  resources[weapon.resourceId] = (resources[weapon.resourceId] ?? 0) + weapon.amount;
  return { ...action.costs, resources };
}
