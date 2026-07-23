import {
  DC_MAX,
  DC_MIN,
  normalizeDifficultyConfig,
  scaleDamageDelta,
  type ActionDef,
  type CharacterHardState,
  type DifficultyConfig,
} from "../types/index.js";

export function isPlayerSide(character: CharacterHardState): boolean {
  return character.isPlayer === true;
}

/**
 * Computes the transparent effective DC for one attempted action.
 *
 * @param action - Frozen action containing the base DC.
 * @param actor - Acting character used to determine player-side eligibility.
 * @param difficulty - Difficulty values frozen into the ruling snapshot.
 * @param opposed - Whether the action is an opposed contest.
 * @returns Base DC plus the bounded player offset, clamped to 5–25.
 *
 * @remarks NPC and opposed checks intentionally ignore the DC offset.
 * @see {@link damageMultiplierForRecipient} for the second difficulty lever.
 * @since 0.1.0
 */
export function effectiveDc(
  action: ActionDef,
  actor: CharacterHardState,
  difficulty: DifficultyConfig,
  opposed = action.opposed === true
): number {
  if (opposed || !isPlayerSide(actor)) return action.dc;
  const normalized = normalizeDifficultyConfig(difficulty);
  return Math.max(DC_MIN, Math.min(DC_MAX, action.dc + normalized.dcOffset));
}

/**
 * Selects the difficulty damage multiplier from the effect recipient.
 *
 * @param recipient - Character receiving the negative resource delta.
 * @param difficulty - Active normalized or custom difficulty values.
 * @returns Damage-taken scale for players or damage-dealt scale for nonplayers.
 *
 * @remarks Recipient-based selection keeps NPC action routing from cancelling difficulty.
 * @see {@link effectiveDc} for flat-check difficulty.
 * @since 0.1.0
 */
export function damageMultiplierForRecipient(
  recipient: CharacterHardState,
  difficulty: DifficultyConfig
): number {
  const normalized = normalizeDifficultyConfig(difficulty);
  return isPlayerSide(recipient)
    ? normalized.damageTakenMultiplier
    : normalized.damageDealtMultiplier;
}

export { scaleDamageDelta };
