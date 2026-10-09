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
import {
  baseItemKind,
  CORE_RESOURCE_ROLES,
  type ActionDef,
  type CharacterHardState,
  type CostSpec,
  type EquipmentRuntimeCatalog,
  type MechanicalIntent,
  type ResourceRole,
  type StorySchema,
} from "../types/index.js";
import { equippedItemDefinition } from "./equipment.js";
import { resourceIdForRole } from "./resources.js";

const CORE_ROLES: ReadonlySet<string> = new Set(CORE_RESOURCE_ROLES);

/**
 * Translate a cost whose resource keys name a core role ("mana") into the story's own pool ids
 * ("aether"). Keys that are already resource ids, or roles the story lacks, are left untouched, so
 * an unmappable cost stays unaffordable rather than silently free.
 */
export function normalizeCost(
  schema: Pick<StorySchema, "resources">,
  cost: CostSpec | undefined
): CostSpec | undefined {
  if (!cost?.resources) return cost;
  const ids = new Set(schema.resources.map((resource) => resource.id));
  const resources: Record<string, number> = {};
  for (const [key, amount] of Object.entries(cost.resources)) {
    const mapped =
      !ids.has(key) && CORE_ROLES.has(key)
        ? resourceIdForRole(schema, key as ResourceRole) ?? key
        : key;
    resources[mapped] = (resources[mapped] ?? 0) + amount;
  }
  return { ...cost, resources };
}

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
  if (!action.requiresItemKind || baseItemKind(action.requiresItemKind) !== "weapon") return undefined;
  const resourceId = resourceIdForRole(schema, "stamina");
  if (!resourceId) return undefined;
  const item =
    (equipment
      ? equippedItemDefinition(actor, equipment, action.requiresItemKind, intent.itemId)
      : undefined) ??
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
  const own = normalizeCost(schema, action.costs);
  const weapon = weaponStaminaCost(schema, actor, action, intent, equipment);
  if (!weapon) return own;
  const resources = { ...(own?.resources ?? {}) };
  resources[weapon.resourceId] = (resources[weapon.resourceId] ?? 0) + weapon.amount;
  return { ...own, resources };
}
