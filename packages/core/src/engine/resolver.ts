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
  STANDARD_DIFFICULTY,
  normalizeDifficultyConfig,
  scaleDamageDelta,
  type StorySchema,
  type ActionDef,
  type DamageAdjustment,
  type DifficultyConfig,
  type EffectSpec,
  type EquipmentRuntimeCatalog,
  type ItemDef,
} from "../types/index.js";
import type { CharacterHardState, LearnedSkill } from "../types/index.js";
import type { Ruling, MechanicalIntent, Outcome, RollRecord } from "../types/index.js";
import { rollD20Mode, type Rng } from "./dice.js";
import { attrScore, clampAttribute, scoreToMod } from "./attributes.js";
import { checkGate } from "./gate.js";
import type { StagedMutation } from "./ledger.js";
import { computeRollMode } from "./rollMode.js";
import { damageMultiplierForRecipient, effectiveDc } from "./difficulty.js";
import {
  equipmentAttributeBonus,
  equipmentCheckBonus,
  equipmentEnabledSkillRank,
  equippedItemDefinition,
} from "./equipment.js";
import {
  computeXpAward,
  minimumXpForRank,
  modifierForRank,
  rankForXp,
} from "./progression.js";

export interface ResolveResult {
  ruling: Ruling;
  mutations: StagedMutation[];
}

export interface ResolveOptions {
  difficulty?: DifficultyConfig;
  equipment?: EquipmentRuntimeCatalog;
  /** Matching action/target uses in the configured anti-grind window. */
  recentSimilarUses?: number;
}

/** The learned skill an action uses for its modifier, if any. */
function skillFor(actor: CharacterHardState, action: ActionDef): LearnedSkill | undefined {
  return action.requiresSkill
    ? actor.skills.find((s) => s.skillId === action.requiresSkill)
    : undefined;
}

/** d20 modifier from a learned skill's rank (0 when no skill applies). */
function modifierFor(skill: LearnedSkill | undefined): number {
  return skill ? modifierForRank(skill.rank) : 0;
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
  actor: CharacterHardState,
  target: CharacterHardState | undefined,
  itemPropValue: number | undefined,
  difficulty: DifficultyConfig
): { mutations: StagedMutation[]; damageAdjustments: DamageAdjustment[] } {
  const muts: StagedMutation[] = [];
  const damageAdjustments: DamageAdjustment[] = [];

  const stageResource = (
    recipient: CharacterHardState,
    resourceId: string,
    delta: number
  ): void => {
    if (delta >= 0) {
      muts.push({
        kind: "resourceDelta",
        characterId: recipient.characterId,
        resourceId,
        delta,
      });
      return;
    }
    const multiplier = damageMultiplierForRecipient(recipient, difficulty);
    const scaledDelta = scaleDamageDelta(delta, multiplier);
    muts.push({
      kind: "resourceDelta",
      characterId: recipient.characterId,
      resourceId,
      delta,
      difficultyMultiplier: multiplier,
    });
    damageAdjustments.push({
      characterId: recipient.characterId,
      resourceId,
      baseDelta: delta,
      multiplier,
      scaledDelta,
    });
  };

  if (effect.resourceDeltaSelf) {
    for (const [resId, delta] of Object.entries(effect.resourceDeltaSelf)) {
      stageResource(actor, resId, delta);
    }
  }

  if (effect.resourceDeltaTarget && target) {
    const deltas =
      effect.scaleByItemProp && itemPropValue !== undefined
        ? scaleTargetDeltas(effect.resourceDeltaTarget, itemPropValue)
        : effect.resourceDeltaTarget;
    for (const [resId, delta] of Object.entries(deltas)) {
      stageResource(target, resId, delta);
    }
  }

  if (effect.attributeDeltaSelf) {
    for (const [attributeId, delta] of Object.entries(effect.attributeDeltaSelf)) {
      muts.push({
        kind: "attributeDelta",
        characterId: actor.characterId,
        attributeId,
        delta,
      });
    }
  }

  if (effect.attributeDeltaTarget && target) {
    for (const [attributeId, delta] of Object.entries(effect.attributeDeltaTarget)) {
      muts.push({
        kind: "attributeDelta",
        characterId: target.characterId,
        attributeId,
        delta,
      });
    }
  }

  if (effect.grantItem) {
    muts.push({
      kind: "grantItem",
      characterId: actor.characterId,
      itemId: effect.grantItem.itemId,
      qty: effect.grantItem.qty,
    });
  }

  if (effect.setFlag) {
    muts.push({
      kind: "setFlag",
      characterId: actor.characterId,
      flagId: effect.setFlag.flagId,
      value: effect.setFlag.value,
    });
  }

  return { mutations: muts, damageAdjustments };
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
  rng: Rng,
  options: ResolveOptions = {}
): ResolveResult {
  const difficulty = normalizeDifficultyConfig(options.difficulty ?? STANDARD_DIFFICULTY);
  const turnId = intent.actorId + ":" + intent.actionId;
  const catalogAction = schema.actions.find((action) => action.id === intent.actionId);
  const baseRuling = {
    turnId,
    actorId: actor.characterId,
    actionId: intent.actionId,
    difficulty,
    ...(catalogAction ? { actionLabel: catalogAction.label } : {}),
    ...(intent.targetId ? { targetId: intent.targetId } : {}),
  };

  // 1. gate — deny is a full stop.
  const gate = checkGate(schema, actor, intent, { equipment: options.equipment });
  if (!gate.allowed) {
    return { ruling: { ...baseRuling, gate, effectsApplied: null }, mutations: [] };
  }

  // Gate passed ⇒ the action exists in the catalog.
  const action = catalogAction!;

  // 2. costs on attempt.
  const mutations: StagedMutation[] = stageCosts(action, actor.characterId);

  // 3. modifier.
  const skill = skillFor(actor, action);
  const enabledRank =
    !skill && action.requiresSkill && options.equipment
      ? equipmentEnabledSkillRank(actor, action.requiresSkill, options.equipment)
      : undefined;
  const masteryModifier = skill
    ? modifierFor(skill)
    : enabledRank
      ? modifierForRank(enabledRank)
      : 0;
  const attributeDefinition = action.governingAttribute
    ? schema.attributes.find((attribute) => attribute.id === action.governingAttribute)
    : undefined;
  const equipmentAttribute =
    action.governingAttribute && options.equipment
      ? equipmentAttributeBonus(actor, action.governingAttribute, options.equipment)
      : 0;
  const attributeScore = clampAttribute(
    attrScore(actor, action.governingAttribute, schema) + equipmentAttribute,
    attributeDefinition
  );
  const attributeModifier = action.governingAttribute ? scoreToMod(attributeScore) : 0;
  const equipmentModifier = options.equipment
    ? equipmentCheckBonus(actor, action.id, action.requiresSkill, options.equipment)
    : 0;
  const modifier = attributeModifier + masteryModifier + equipmentModifier;

  // 4. roll + outcome.
  const rollMode = computeRollMode(schema, action, actor);
  const diceRoll = rollD20Mode(rollMode.mode, rng);
  const total = diceRoll.natural + modifier;
  const dcBase = action.dc;
  const dcEffective = effectiveDc(action, actor, difficulty);

  let outcome: Outcome;
  let opposedD20: number | undefined;
  let opposedModifier: number | undefined;
  let opposedTotal: number | undefined;
  let opposedAttributeScore: number | undefined;
  let opposedAttributeModifier: number | undefined;
  let opposedMasteryModifier: number | undefined;
  let opposedEquipmentModifier: number | undefined;
  let opposedEquipmentAttributeBonus: number | undefined;
  let opposedRoll:
    | ReturnType<typeof rollD20Mode>
    | undefined;
  let opposedMode: ReturnType<typeof computeRollMode> | undefined;

  if (action.opposed && target) {
    // Opposed contest: the defender rolls with its own relevant skill modifier.
    opposedMode = computeRollMode(schema, action, target);
    opposedRoll = rollD20Mode(opposedMode.mode, rng);
    opposedD20 = opposedRoll.natural;
    const targetAttributeDefinition = action.governingAttribute
      ? schema.attributes.find((attribute) => attribute.id === action.governingAttribute)
      : undefined;
    opposedEquipmentAttributeBonus =
      action.governingAttribute && options.equipment
        ? equipmentAttributeBonus(target, action.governingAttribute, options.equipment)
        : 0;
    opposedAttributeScore = clampAttribute(
      attrScore(target, action.governingAttribute, schema) + opposedEquipmentAttributeBonus,
      targetAttributeDefinition
    );
    opposedAttributeModifier = action.governingAttribute ? scoreToMod(opposedAttributeScore) : 0;
    const targetSkill = skillFor(target, action);
    const targetEnabledRank =
      !targetSkill && action.requiresSkill && options.equipment
        ? equipmentEnabledSkillRank(target, action.requiresSkill, options.equipment)
        : undefined;
    opposedMasteryModifier = targetSkill
      ? modifierFor(targetSkill)
      : targetEnabledRank
        ? modifierForRank(targetEnabledRank)
        : 0;
    opposedEquipmentModifier = options.equipment
      ? equipmentCheckBonus(target, action.id, action.requiresSkill, options.equipment)
      : 0;
    opposedModifier =
      opposedAttributeModifier + opposedMasteryModifier + opposedEquipmentModifier;
    opposedTotal = opposedD20 + opposedModifier;
    if (diceRoll.natural === 20 && opposedD20 !== 20) outcome = "crit_success";
    else if (diceRoll.natural === 1) outcome = "crit_failure";
    else if (opposedD20 === 20) outcome = "failure";
    else if (opposedD20 === 1) outcome = "success";
    else outcome = total > opposedTotal ? "success" : "failure"; // ties defend
  } else if (diceRoll.natural === 20) {
    outcome = "crit_success";
  } else if (diceRoll.natural === 1) {
    outcome = "crit_failure";
  } else {
    outcome = total >= dcEffective ? "success" : "failure";
  }

  const roll: RollRecord = {
    d20: diceRoll.natural,
    dice: diceRoll.dice,
    usedIndex: diceRoll.usedIndex,
    natural: diceRoll.natural,
    rollMode: rollMode.mode,
    advantageSources: rollMode.advantageSources,
    disadvantageSources: rollMode.disadvantageSources,
    modifier,
    ...(action.governingAttribute
      ? {
          attributeId: action.governingAttribute,
          attributeScore,
          attributeModifier,
          equipmentAttributeBonus: equipmentAttribute,
        }
      : {}),
    ...(action.requiresSkill
      ? { masterySkillId: action.requiresSkill, masteryModifier }
      : {}),
    equipmentModifier,
    total,
    dc: dcEffective,
    dcBase,
    dcEffective,
    outcome,
    ...(opposedD20 !== undefined
      ? {
          opposedD20,
          opposedDice: opposedRoll!.dice,
          opposedUsedIndex: opposedRoll!.usedIndex,
          opposedNatural: opposedRoll!.natural,
          opposedRollMode: opposedMode!.mode,
          opposedAdvantageSources: opposedMode!.advantageSources,
          opposedDisadvantageSources: opposedMode!.disadvantageSources,
          opposedModifier: opposedModifier!,
          opposedTotal: opposedTotal!,
          ...(action.governingAttribute
            ? {
                opposedAttributeScore,
                opposedAttributeModifier,
                opposedEquipmentAttributeBonus,
              }
            : {}),
          ...(action.requiresSkill ? { opposedMasteryModifier } : {}),
          opposedEquipmentModifier,
        }
      : {}),
  };

  // 5. effects for the outcome, scaled by an item prop where applicable.
  const effect = action.effects[outcome];
  const item =
    (options.equipment
      ? equippedItemDefinition(
          actor,
          options.equipment,
          action.requiresItemKind,
          intent.itemId
        )
      : undefined) ?? itemFor(schema, intent);
  const itemPropValue =
    effect.scaleByItemProp && item ? item.props[effect.scaleByItemProp] : undefined;
  const stagedEffect = stageEffect(effect, actor, target, itemPropValue, difficulty);
  mutations.push(...stagedEffect.mutations);

  // 6. mastery advancement on a successful skill-gated action.
  const ruling: Ruling = {
    ...baseRuling,
    gate,
    roll,
    effectsApplied: effect,
    difficulty,
    ...(stagedEffect.damageAdjustments.length > 0
      ? { damageAdjustments: stagedEffect.damageAdjustments }
      : {}),
    ...(action.costs ? { costsPaid: action.costs } : {}),
  };

  if (skill && action.requiresSkill) {
    const previousXp = Math.max(skill.xp ?? 0, minimumXpForRank(skill.rank));
    const computed = computeXpAward(
      outcome,
      action.opposed ? 14 : dcEffective,
      options.recentSimilarUses ?? 0
    );
    const newXp = previousXp + computed.amount;
    const nextRank = rankForXp(newXp);
    mutations.push({
      kind: "setSkill",
      characterId: actor.characterId,
      skillId: skill.skillId,
      rank: nextRank,
      successCount: skill.successCount,
      xp: newXp,
    });
    ruling.xpAward = {
      skillId: skill.skillId,
      amount: computed.amount,
      previousXp,
      newXp,
      rankBefore: skill.rank,
      rankAfter: nextRank,
      reason: computed.reason,
    };
    if (nextRank !== skill.rank) {
      ruling.masteryAdvance = {
        skillId: skill.skillId,
        fromRank: skill.rank,
        toRank: nextRank,
      };
    }
  }

  return { ruling, mutations };
}
