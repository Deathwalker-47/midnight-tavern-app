/**
 * Weapon specials (plan 09 §8.2) — signature moves equipped gear grants. A special is a universal-pool
 * action flagged `equipmentEnabled`: it materializes with `requiresEquipmentEnabler`, so the gate
 * refuses it unless an equipped item's `action_enable` effect names it, and its cooldown is the
 * ordinary action cooldown (plan 08 §4) — there is no second mechanism.
 *
 * Loot is the only way a special arrives in play: the adjudicator may attach one from the sealed list
 * below to a weapon it awards, and the engine enables the entry in the story when the turn commits
 * (turn-scoped, so rewinding the turn removes both). Pure.
 */
import type { ItemKind, ItemTier, StorySchema } from "../types/index.js";
import { isWeaponSpecial, SHIPPED_CATALOGUE, type PoolCatalogue } from "./materialize.js";
import { planEnablement, poolTier, tierLock } from "./plan.js";
import { inferSettingFits } from "./select.js";

export interface WeaponSpecialOption {
  entryId: string;
  name: string;
  description: string;
  tier: ItemTier;
  /** The weapon kind the special swings; the granting item must be of it. */
  requiresItemKind: ItemKind;
  /** Already in the story's catalogue; otherwise awarding it enables it. */
  enabled: boolean;
}

/**
 * Every weapon special this story could see granted now: those already enabled, and those that fit
 * its setting, that it can express, and whose tier has unlocked (`tierLock`, the same pacing as every
 * other in-story enablement).
 */
export function weaponSpecialOptions(
  frozen: StorySchema,
  effective: StorySchema,
  completedChapters: number,
  catalogue: PoolCatalogue = SHIPPED_CATALOGUE
): WeaponSpecialOption[] {
  const present = new Set([...effective.actions.map((action) => action.id), ...effective.skills.map((skill) => skill.id)]);
  const fits = new Set(inferSettingFits(frozen.premise));
  return catalogue.pool.entries.flatMap((entry): WeaponSpecialOption[] => {
    if (entry.excluded || !isWeaponSpecial(entry, catalogue)) return [];
    const enabled = effective.actions.find((action) => action.id === entry.id);
    if (!enabled && !entry.settingFit.some((fit) => fits.has(fit))) return [];
    const plan = enabled ? undefined : planEnablement(frozen, present, entry.id, catalogue);
    if (plan && (!plan.ok || tierLock(plan.additions, completedChapters, catalogue))) return [];
    const definition = enabled ?? (plan?.ok && plan.additions[0]?.kind === "action" ? plan.additions[0].definition : undefined);
    if (!definition?.requiresItemKind) return [];
    return [
      {
        entryId: entry.id,
        name: entry.name,
        description: entry.description,
        tier: poolTier(entry.id, catalogue)!,
        requiresItemKind: definition.requiresItemKind,
        enabled: enabled !== undefined,
      },
    ];
  });
}
