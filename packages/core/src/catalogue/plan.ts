/**
 * The pure decisions behind enabling and disabling pool entries (plan 09 §3, §7.2), shared by core's
 * store-backed enablement and the UI's in-memory bridge so the two backends cannot disagree.
 */
import type { ActionDef, EquipmentEffect, ItemTier, SkillDef, StorySchema } from "../types/index.js";
import { materializeEntry, SHIPPED_CATALOGUE, type PoolCatalogue } from "./materialize.js";

/**
 * Completed chapters before a pool tier may be enabled during a story (plan 09 §6.2, design brief
 * §5b) — by the player's hand or the analyzer's. Only the forge, which sets the world's starting
 * catalogue, is exempt. Enabling never teaches anyone, so the lock paces how fast the world grows
 * rather than guarding power.
 */
export const TIER_UNLOCK_CHAPTERS: Readonly<Record<ItemTier, number>> = {
  common: 0,
  uncommon: 1,
  rare: 3,
  legendary: 6,
  mythical: Number.POSITIVE_INFINITY,
};

export type PlannedEnablement =
  | { entryId: string; kind: "action"; definition: ActionDef }
  | { entryId: string; kind: "skill"; definition: SkillDef };

export type EnablementPlan =
  | { ok: true; additions: PlannedEnablement[] }
  | { ok: false; reason: string };

/**
 * What enabling `entryId` adds: the entry plus any skill it needs that is not already `present`
 * (enabled, or forged into the rulebook). All-or-nothing: one unexpressible part refuses the lot.
 */
export function planEnablement(
  frozen: StorySchema,
  present: ReadonlySet<string>,
  entryId: string,
  catalogue: PoolCatalogue = SHIPPED_CATALOGUE
): EnablementPlan {
  const seen = new Set(present);
  const additions: PlannedEnablement[] = [];
  const queue = [entryId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    const materialized = materializeEntry(frozen, id, catalogue);
    if (!materialized.ok) return { ok: false, reason: materialized.reason };
    seen.add(id);
    additions.push(
      materialized.kind === "action"
        ? { entryId: id, kind: "action", definition: materialized.definition }
        : { entryId: id, kind: "skill", definition: materialized.definition }
    );
    queue.push(...materialized.requires);
  }
  return { ok: true, additions };
}

/**
 * Entry id → "Ari's Flamebrand" for every item a character holds whose effects grant that action or
 * skill (`action_enable` / `skill_enable`). Held, not only equipped: unequipping must not strand a
 * special the item still carries.
 */
export function grantorsByEntry(
  holders: readonly { name: string; items: readonly { name: string; effects: readonly EquipmentEffect[] }[] }[]
): Map<string, string[]> {
  const grantors = new Map<string, string[]>();
  for (const holder of holders) {
    for (const item of holder.items) {
      for (const effect of item.effects) {
        const id = effect.type === "action_enable" ? effect.actionId : effect.type === "skill_enable" ? effect.skillId : undefined;
        if (id) grantors.set(id, [...(grantors.get(id) ?? []), `${holder.name}'s ${item.name}`]);
      }
    }
  }
  return grantors;
}

/** A pool entry's tier: its archetype's (entries carry none of their own). */
export function poolTier(entryId: string, catalogue: PoolCatalogue = SHIPPED_CATALOGUE): ItemTier | undefined {
  const entry = catalogue.pool.entries.find((candidate) => candidate.id === entryId);
  return catalogue.archetypes.archetypes.find((archetype) => archetype.id === entry?.archetypeId)?.tier;
}

/**
 * Why a planned enablement is still locked by tier after `completedChapters`, or undefined when every
 * part of it has unlocked. Checks everything the plan brings along, so a common action cannot carry
 * an uncommon skill in early.
 */
export function tierLock(
  additions: readonly PlannedEnablement[],
  completedChapters: number,
  catalogue: PoolCatalogue = SHIPPED_CATALOGUE
): string | undefined {
  for (const addition of additions) {
    const tier = poolTier(addition.entryId, catalogue);
    if (!tier || TIER_UNLOCK_CHAPTERS[tier] <= completedChapters) continue;
    const name = addition.kind === "action" ? addition.definition.label : addition.definition.name;
    const chapters = TIER_UNLOCK_CHAPTERS[tier];
    if (!Number.isFinite(chapters)) return `${name} is ${tier}; ${tier} entries never arrive during a story.`;
    const when = chapters === 1 ? "its first chapter" : `${chapters} chapters`;
    return `${name} is ${tier}; ${tier} entries unlock once the story completes ${when}.`;
  }
  return undefined;
}

/**
 * Why an entry may not be disabled now, or undefined when it may. Refused while it is not enabled,
 * while anyone has learned it, while an item someone holds grants it (owner decision D8, plan 09 §7.2
 * — the reason names who or what), or while an enabled action still needs it.
 */
export function disableRefusal(
  enabled: readonly PlannedEnablement[],
  learnerNames: readonly string[],
  entryId: string,
  grantors: readonly string[] = []
): string | undefined {
  if (!enabled.some((enablement) => enablement.entryId === entryId)) {
    return "That entry is not enabled in this story.";
  }
  if (learnerNames.length > 0) {
    return `${learnerNames.join(", ")} ${learnerNames.length === 1 ? "has" : "have"} learned this, so it stays.`;
  }
  if (grantors.length > 0) {
    return `${grantors.join(", ")} ${grantors.length === 1 ? "grants" : "grant"} this, so it stays.`;
  }
  const dependants = enabled.flatMap((enablement) =>
    enablement.kind === "action" && enablement.definition.requiresSkill === entryId
      ? [enablement.definition.label]
      : []
  );
  if (dependants.length === 0) return undefined;
  const one = dependants.length === 1;
  return `${dependants.join(", ")} still ${one ? "needs" : "need"} it; disable ${one ? "that" : "those"} first.`;
}
