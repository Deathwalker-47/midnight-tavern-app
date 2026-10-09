/**
 * The pure decisions behind enabling and disabling pool entries (plan 09 §3, §7.2), shared by core's
 * store-backed enablement and the UI's in-memory bridge so the two backends cannot disagree.
 */
import type { ActionDef, SkillDef, StorySchema } from "../types/index.js";
import { materializeEntry, SHIPPED_CATALOGUE, type PoolCatalogue } from "./materialize.js";

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
 * Why an entry may not be disabled now, or undefined when it may. Refused while it is not enabled,
 * while anyone has learned it (owner decision D8 — the reason names who), or while an enabled action
 * still needs it.
 */
export function disableRefusal(
  enabled: readonly PlannedEnablement[],
  learnerNames: readonly string[],
  entryId: string
): string | undefined {
  if (!enabled.some((enablement) => enablement.entryId === entryId)) {
    return "That entry is not enabled in this story.";
  }
  if (learnerNames.length > 0) {
    return `${learnerNames.join(", ")} ${learnerNames.length === 1 ? "has" : "have"} learned this, so it stays.`;
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
