/**
 * Resolver (low-level-plan M2 step 3) — deterministic action resolution.
 *
 * Pure with respect to state: it reads the frozen schema and the actor/target hard
 * state, rolls via the injected RNG, and returns a `Ruling` plus the `StagedMutation[]`
 * the ledger will apply. It never mutates state itself.
 *
 * Sequence:
 *   1. gate check — if denied, a no-roll Ruling, no effects, no mutations.
 *   2. pay `costs` on attempt (win or lose), staged.
 *   3. modifier = MASTERY_MOD[rank] of the required skill (0 if the action has none).
 *   4. total = d20 + modifier. nat 20 ⇒ crit_success; nat 1 ⇒ crit_failure;
 *      opposed ⇒ higher total wins (ties defend); else total >= dc ? success : failure.
 *   5. apply effects[outcome]; scale resourceDeltaTarget by an item prop if used.
 *   6. on success/crit_success of a skill-gated action: advance mastery deterministically.
 */
import {
  MASTERY_MOD,
  MASTERY_ORDER,
  type StorySchema,
  type ActionDef,
  type EffectSpec,
  type ItemDef,
  type MasteryRank,
} from "../types/index.js";
import type { CharacterHardState, LearnedSkill } from "../types/index.js";
import type { Ruling, MechanicalIntent, Outcome, RollRecord } from "../types/index.js";
import { rollD20, type Rng } from "./dice.js";
import { checkGate } from "./gate.js";
import type { StagedMutation } from "./ledger.js";

export interface ResolveResult {
  ruling: Ruling;
  mutations: StagedMutation[];
}

/** The learned skill an action uses for its modifier, if any. */
function skillFor(actor: CharacterHardState, action: ActionDef): LearnedSkill | undefined {
  return action.requiresSkill
    ? actor.skills.find((s) => s.skillId === action.requiresSkill)
    : undefined;
}

/** d20 modifier from a learned skill's rank (0 when no skill applies). */
function modifierFor(skill: LearnedSkill | undefined): number {
  return skill ? MASTERY_MOD[skill.rank] : 0;
}

/** Next rank up from `rank`, or undefined if already master. */
function nextRank(rank: MasteryRank): MasteryRank | undefined {
  const i = MASTERY_ORDER.indexOf(rank);
  return MASTERY_ORDER[i + 1];
}

/** The item the intent uses, resolved against the schema table (if any). */
function itemFor(schema: StorySchema, intent: MechanicalIntent): ItemDef | undefined {
  return intent.itemId ? schema.items.find((i) => i.id === intent.itemId) : undefined;
}

/**
 * Scale a target resource-delta map by an item property, in the direction of each
 * base delta (away from zero): a negative base (damage) scales more negative.
 */
function scaleTargetDeltas(base: Record<string, number>, prop: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [resId, delta] of Object.entries(base)) {
    out[resId] = delta < 0 ? delta - prop : delta + prop;
  }
  return out;
}

/** Stage the mutations for one EffectSpec on actor (self) and optional target. */
function stageEffect(
  effect: EffectSpec,
  actorId: string,
  targetId: string | undefined,
  itemPropValue: number | undefined
): StagedMutation[] {
  const muts: StagedMutation[] = [];

  if (effect.resourceDeltaSelf) {
    for (const [resId, delta] of Object.entries(effect.resourceDeltaSelf)) {
      muts.push({ kind: "resourceDelta", characterId: actorId, resourceId: resId, delta });
    }
  }

  if (effect.resourceDeltaTarget && targetId) {
    const deltas =
      effect.scaleByItemProp && itemPropValue !== undefined
        ? scaleTargetDeltas(effect.resourceDeltaTarget, itemPropValue)
        : effect.resourceDeltaTarget;
    for (const [resId, delta] of Object.entries(deltas)) {
      muts.push({ kind: "resourceDelta", characterId: targetId, resourceId: resId, delta });
    }
  }

  if (effect.grantItem) {
    muts.push({
      kind: "grantItem",
      characterId: actorId,
      itemId: effect.grantItem.itemId,
      qty: effect.grantItem.qty,
    });
  }

  if (effect.setFlag) {
    muts.push({
      kind: "setFlag",
      characterId: actorId,
      flagId: effect.setFlag.flagId,
      value: effect.setFlag.value,
    });
  }

  return muts;
}

/** Stage cost payment (paid on attempt, win or lose). */
function stageCosts(action: ActionDef, actorId: string): StagedMutation[] {
  const muts: StagedMutation[] = [];
  if (!action.costs) return muts;
  if (action.costs.resources) {
    for (const [resId, amount] of Object.entries(action.costs.resources)) {
      muts.push({ kind: "resourceDelta", characterId: actorId, resourceId: resId, delta: -amount });
    }
  }
  if (action.costs.items) {
    for (const { itemId, qty } of action.costs.items) {
      muts.push({ kind: "removeItem", characterId: actorId, itemId, qty });
    }
  }
  return muts;
}

/**
 * Resolve one mechanical intent. `rng` is injected for deterministic tests; an
 * opposed contest consumes a second roll from the same source.
 */
export function resolve(
  schema: StorySchema,
  actor: CharacterHardState,
  target: CharacterHardState | undefined,
  intent: MechanicalIntent,
  rng: Rng
): ResolveResult {
  const turnId = intent.actorId + ":" + intent.actionId;
  const baseRuling = {
    turnId,
    actorId: actor.characterId,
    actionId: intent.actionId,
    ...(intent.targetId ? { targetId: intent.targetId } : {}),
  };

  // 1. gate — deny is a full stop.
  const gate = checkGate(schema, actor, intent);
  if (!gate.allowed) {
    return { ruling: { ...baseRuling, gate, effectsApplied: null }, mutations: [] };
  }

  // Gate passed ⇒ the action exists in the catalog.
  const action = schema.actions.find((a) => a.id === intent.actionId)!;

  // 2. costs on attempt.
  const mutations: StagedMutation[] = stageCosts(action, actor.characterId);

  // 3. modifier.
  const skill = skillFor(actor, action);
  const modifier = modifierFor(skill);

  // 4. roll + outcome.
  const d20 = rollD20(rng);
  const total = d20 + modifier;

  let outcome: Outcome;
  let opposedD20: number | undefined;
  let opposedModifier: number | undefined;
  let opposedTotal: number | undefined;

  if (d20 === 20) {
    outcome = "crit_success";
  } else if (d20 === 1) {
    outcome = "crit_failure";
  } else if (action.opposed && target) {
    // Opposed contest: the defender rolls with its own relevant skill modifier.
    opposedD20 = rollD20(rng);
    opposedModifier = modifierFor(skillFor(target, action));
    opposedTotal = opposedD20 + opposedModifier;
    outcome = total > opposedTotal ? "success" : "failure"; // ties defend
  } else {
    outcome = total >= action.dc ? "success" : "failure";
  }

  const roll: RollRecord = {
    d20,
    modifier,
    total,
    dc: action.dc,
    outcome,
    ...(opposedD20 !== undefined
      ? { opposedD20, opposedModifier: opposedModifier!, opposedTotal: opposedTotal! }
      : {}),
  };

  // 5. effects for the outcome, scaled by an item prop where applicable.
  const effect = action.effects[outcome];
  const item = itemFor(schema, intent);
  const itemPropValue =
    effect.scaleByItemProp && item ? item.props[effect.scaleByItemProp] : undefined;
  mutations.push(...stageEffect(effect, actor.characterId, intent.targetId, itemPropValue));

  // 6. mastery advancement on a successful skill-gated action.
  const ruling: Ruling = {
    ...baseRuling,
    gate,
    roll,
    effectsApplied: effect,
    ...(action.costs ? { costsPaid: action.costs } : {}),
  };

  const succeeded = outcome === "success" || outcome === "crit_success";
  if (skill && action.requiresSkill && succeeded) {
    const def = schema.skills.find((s) => s.id === action.requiresSkill);
    const perRank = def?.masteryAdvance.successesPerRank;
    const up = nextRank(skill.rank);
    const newCount = skill.successCount + 1;
    if (perRank !== undefined && up && newCount >= perRank) {
      mutations.push({
        kind: "setSkill",
        characterId: actor.characterId,
        skillId: skill.skillId,
        rank: up,
        successCount: 0,
      });
      ruling.masteryAdvance = { skillId: skill.skillId, fromRank: skill.rank, toRank: up };
    } else {
      mutations.push({
        kind: "setSkill",
        characterId: actor.characterId,
        skillId: skill.skillId,
        rank: skill.rank,
        successCount: newCount,
      });
    }
  }

  return { ruling, mutations };
}
