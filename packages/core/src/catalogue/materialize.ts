/**
 * Materialization (plan 09 §4.4) — turning a story-agnostic pool entry into a concrete `ActionDef` or
 * `SkillDef` for one story's frozen rulebook:
 *   - attribute roles → the story's attribute (first role it has; none → a flat roll);
 *   - pool roles → the story's resource ids (an entry needing a pool the story lacks cannot be
 *     enabled, rather than silently becoming free or unpayable);
 *   - health multiples → numbers, scaled by the story's baseline hit (its ungated natural attack's
 *     success damage, else the universal default);
 *   - the pool's tier → the story's own tier ladder;
 *   - `{param}` placeholders in narration → the entry's parameters.
 * The result is validated with the same Zod schemas as forged content. Pure.
 */
import {
  ActionDefSchema,
  SkillDefSchema,
  type ActionDef,
  type EffectSpec,
  type ItemTier,
  type SkillBonus,
  type SkillDef,
  type StatusEffectSpec,
  type StorySchema,
} from "../types/index.js";
import {
  UNIVERSAL_ACTIONS_CONFIG,
  UNIVERSAL_ARCHETYPES,
  UNIVERSAL_POOL,
  type ActionArchetype,
  type ArchetypeEffect,
  type AttributeRole,
  type PoolEntry,
  type PoolStatus,
  type SkillArchetype,
  type UniversalArchetypes,
  type UniversalPool,
} from "../config/index.js";
import { resourceIdForRole } from "../engine/resources.js";
import { attributeIdForRole } from "./attributeRoles.js";

/** The pool a story draws from: the shipped one, or (S17) one merged with the user's overrides. */
export interface PoolCatalogue {
  archetypes: UniversalArchetypes;
  pool: UniversalPool;
}

export const SHIPPED_CATALOGUE: PoolCatalogue = {
  archetypes: UNIVERSAL_ARCHETYPES,
  pool: UNIVERSAL_POOL,
};

export type Materialized =
  | { ok: true; entry: PoolEntry; kind: "action"; definition: ActionDef; requires: string[] }
  | { ok: true; entry: PoolEntry; kind: "skill"; definition: SkillDef; requires: string[] }
  | { ok: false; reason: string };

type CoreRole = "health" | "mana" | "stamina";
const TIER_ORDER: readonly ItemTier[] = ["common", "uncommon", "rare", "legendary", "mythical"];

/** Damage the story's ungated natural attack deals on a success; the unit health multiples scale. */
export function baselineHit(schema: Pick<StorySchema, "actions" | "resources">): number {
  const lethal = resourceIdForRole(schema, "health");
  const natural = schema.actions.find(
    (action) =>
      action.category === "combat" &&
      (action.universalFamily ?? action.id) === "attack_natural" &&
      !action.requiresSkill
  );
  const delta = lethal ? natural?.effects.success.resourceDeltaTarget?.[lethal] : undefined;
  if (delta !== undefined && delta < 0) return -delta;
  const family = UNIVERSAL_ACTIONS_CONFIG.actions.find((candidate) => candidate.id === "attack_natural");
  return family?.defaultTargetDamage?.success ?? 4;
}

/** A health multiple as a whole number of points; a non-zero multiple never rounds to nothing. */
function healthPoints(multiple: number, baseline: number): number {
  const points = Math.round(multiple * baseline);
  return points === 0 ? Math.sign(multiple) : points;
}

/** Map role-keyed amounts to the story's ids (every role was checked to resolve beforehand). */
function byPoolId(
  pools: Partial<Record<CoreRole, number>> | undefined,
  idFor: (role: CoreRole) => string
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [role, amount] of Object.entries(pools ?? {})) {
    if (amount) out[idFor(role as CoreRole)] = (out[idFor(role as CoreRole)] ?? 0) + amount;
  }
  return out;
}

/** Attribute-role bonuses mapped to the story's attributes; roles the story lacks drop out. */
function byAttributeId(
  schema: StorySchema,
  bonus: Partial<Record<AttributeRole, number>> | undefined
): Record<string, number> | undefined {
  const out: Record<string, number> = {};
  for (const [role, amount] of Object.entries(bonus ?? {})) {
    const attributeId = attributeIdForRole(schema, role as AttributeRole);
    if (attributeId && amount) out[attributeId] = amount;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function fill(text: string, params: Record<string, string> | undefined): string {
  return text.replace(/\{([a-z0-9_]+)\}/g, (whole, name: string) => params?.[name] ?? whole);
}

/** Every core pool role an archetype touches. */
function rolesUsed(archetype: ActionArchetype | SkillArchetype): Set<CoreRole> {
  const roles = new Set<CoreRole>();
  const statusRoles = (status: PoolStatus | undefined) =>
    Object.keys(status?.resourcePerTurn ?? {}).forEach((role) => roles.add(role as CoreRole));
  if (archetype.kind === "skill") {
    Object.keys(archetype.toggle?.upkeep ?? {}).forEach((role) => roles.add(role as CoreRole));
    return roles;
  }
  Object.keys(archetype.costs ?? {}).forEach((role) => roles.add(role as CoreRole));
  for (const effect of Object.values(archetype.effects)) {
    if (effect.targetHealth || effect.selfHealth) roles.add("health");
    Object.keys(effect.targetPools ?? {}).forEach((role) => roles.add(role as CoreRole));
    Object.keys(effect.selfPools ?? {}).forEach((role) => roles.add(role as CoreRole));
    statusRoles(effect.statusSelf);
    statusRoles(effect.statusTarget);
  }
  return roles;
}

/** The story's tier at the same rung of its own ladder as the pool tier (clamped to its top). */
function storyTier(schema: StorySchema, tier: ItemTier): string | undefined {
  const ladder = [...schema.tiers].sort((left, right) => left.minProgress - right.minProgress);
  return ladder[Math.min(TIER_ORDER.indexOf(tier), ladder.length - 1)]?.id;
}

function skillBonus(schema: StorySchema, bonus: NonNullable<SkillArchetype["passive"]>): SkillBonus {
  const attributeBonus = byAttributeId(schema, bonus.attributeBonus);
  return {
    ...(bonus.checkBonus ? { checkBonus: bonus.checkBonus } : {}),
    ...(attributeBonus ? { attributeBonus } : {}),
  };
}

/** Materialize one pool entry against one story's frozen rulebook. */
export function materializeEntry(
  schema: StorySchema,
  entryId: string,
  catalogue: PoolCatalogue = SHIPPED_CATALOGUE
): Materialized {
  const entry = catalogue.pool.entries.find((candidate) => candidate.id === entryId);
  if (!entry) return { ok: false, reason: `Unknown pool entry "${entryId}".` };
  if (entry.excluded) {
    return { ok: false, reason: `${entry.name} is excluded from the pool: ${entry.exclusionReason}` };
  }
  const archetype = catalogue.archetypes.archetypes.find((candidate) => candidate.id === entry.archetypeId);
  if (!archetype || archetype.kind !== entry.kind) {
    return { ok: false, reason: `${entry.name} has no usable ${entry.kind} archetype ("${entry.archetypeId}").` };
  }
  if (schema.statMode === "none") {
    return { ok: false, reason: "A no-stats story has no action or skill catalogue." };
  }
  const pools = new Map<CoreRole, string>();
  for (const role of rolesUsed(archetype)) {
    const resourceId = resourceIdForRole(schema, role);
    if (!resourceId) return { ok: false, reason: `This story has no ${role} pool, which ${entry.name} needs.` };
    pools.set(role, resourceId);
  }
  const poolId = (role: CoreRole) => pools.get(role)!;

  if (archetype.kind === "skill") {
    const tier = storyTier(schema, archetype.tier);
    if (!tier) return { ok: false, reason: "This story defines no tiers to place the skill in." };
    const definition: SkillDef = SkillDefSchema.parse({
      id: entry.id,
      name: entry.name,
      description: entry.description,
      tier,
      prerequisites: [],
      unlockPaths: [{ method: "trainer", npcHint: `someone accomplished in ${entry.name}`, cost: {} }],
      masteryAdvance: { successesPerRank: 5 },
      ...(archetype.skillType !== "active" ? { skillType: archetype.skillType } : {}),
      ...(archetype.passive ? { passive: skillBonus(schema, archetype.passive) } : {}),
      ...(archetype.toggle
        ? {
            toggle: {
              upkeep: byPoolId(archetype.toggle.upkeep, poolId),
              bonus: skillBonus(schema, archetype.toggle.bonus),
            },
          }
        : {}),
    });
    return { ok: true, entry, kind: "skill", definition, requires: [] };
  }

  const baseline = baselineHit(schema);
  const status = (spec: PoolStatus | undefined): StatusEffectSpec | undefined => {
    if (!spec) return undefined;
    const attributeBonus = byAttributeId(schema, spec.attributeBonus);
    const resourcePerTurn = byPoolId(spec.resourcePerTurn, poolId);
    return {
      id: spec.id,
      label: fill(spec.label, entry.params),
      durationTurns: spec.durationTurns,
      ...(spec.checkBonus ? { checkBonus: spec.checkBonus } : {}),
      ...(attributeBonus ? { attributeBonus } : {}),
      ...(Object.keys(resourcePerTurn).length > 0 ? { resourcePerTurn } : {}),
    };
  };
  const effect = (spec: ArchetypeEffect): EffectSpec => {
    const target = byPoolId(spec.targetPools, poolId);
    const self = byPoolId(spec.selfPools, poolId);
    if (spec.targetHealth) target[poolId("health")] = healthPoints(spec.targetHealth, baseline);
    if (spec.selfHealth) self[poolId("health")] = healthPoints(spec.selfHealth, baseline);
    const statusSelf = status(spec.statusSelf);
    const statusTarget = status(spec.statusTarget);
    return {
      narrationHint: fill(spec.narrationHint, entry.params),
      ...(Object.keys(target).length > 0 ? { resourceDeltaTarget: target } : {}),
      ...(Object.keys(self).length > 0 ? { resourceDeltaSelf: self } : {}),
      ...(statusSelf ? { statusSelf } : {}),
      ...(statusTarget ? { statusTarget } : {}),
    };
  };
  const governingAttribute = archetype.governingRoles
    .map((role) => attributeIdForRole(schema, role))
    .find((attributeId) => attributeId !== undefined);
  const costs = byPoolId(archetype.costs, poolId);
  const definition: ActionDef = ActionDefSchema.parse({
    id: entry.id,
    category: archetype.category,
    label: entry.name,
    description: entry.description,
    ...(entry.aliases ? { aliases: entry.aliases } : {}),
    universalFamily: archetype.universalFamily,
    ...(governingAttribute ? { governingAttribute } : {}),
    ...(entry.requiresSkill ? { requiresSkill: entry.requiresSkill } : {}),
    ...(archetype.requiresItemKind ? { requiresItemKind: archetype.requiresItemKind } : {}),
    dc: archetype.dc,
    ...(archetype.opposed ? { opposed: true } : {}),
    ...(Object.keys(costs).length > 0 ? { costs: { resources: costs } } : {}),
    ...(archetype.cooldownTurns ? { cooldownTurns: archetype.cooldownTurns } : {}),
    ...(archetype.targeting ? { targeting: archetype.targeting } : {}),
    effects: {
      crit_success: effect(archetype.effects.crit_success),
      success: effect(archetype.effects.success),
      failure: effect(archetype.effects.failure),
      crit_failure: effect(archetype.effects.crit_failure),
    },
  });
  return {
    ok: true,
    entry,
    kind: "action",
    definition,
    requires: entry.requiresSkill ? [entry.requiresSkill] : [],
  };
}
