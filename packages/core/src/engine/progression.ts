import { PROGRESSION_CONFIG, type ProgressionConfig } from "../config/index.js";
import type { MasteryRank, MechanicalIntent, Outcome, Ruling } from "../types/index.js";

/**
 * How many times this actor already used this action on this target within its own most recent
 * `windowTurns` turns (finding 16). Only the acting character's rulings are considered, so another
 * character's rulings — an NPC reaction between two player strikes — never consume the window.
 * A "turn" is one committed narrator message; rulings without a message id count as their own turn.
 */
export function countRecentSimilarUses(
  priorRulings: readonly Ruling[],
  intent: Pick<MechanicalIntent, "actorId" | "actionId" | "targetId">,
  windowTurns: number = PROGRESSION_CONFIG.repetitionWindowTurns
): number {
  const own = priorRulings.filter((ruling) => ruling.actorId === intent.actorId);
  const turnOf = (index: number): string => own[index]!.messageId ?? `ruling:${index}`;
  const inWindow = new Set<string>();
  for (let index = own.length - 1; index >= 0 && inWindow.size < windowTurns; index--) {
    inWindow.add(turnOf(index));
  }
  return own.filter(
    (ruling, index) =>
      inWindow.has(turnOf(index)) &&
      ruling.actionId === intent.actionId &&
      ruling.targetId === intent.targetId
  ).length;
}

export interface XpComputation {
  amount: number;
  base: number;
  challengeMultiplier: number;
  repetitionMultiplier: number;
  reason: string;
}

export function rankForXp(
  xp: number,
  config: ProgressionConfig = PROGRESSION_CONFIG
): MasteryRank {
  let result: MasteryRank = "novice";
  for (const entry of config.ranks) {
    if (xp >= entry.minimumXp) result = entry.rank;
  }
  return result;
}

export function minimumXpForRank(
  rank: MasteryRank,
  config: ProgressionConfig = PROGRESSION_CONFIG
): number {
  return config.ranks.find((entry) => entry.rank === rank)?.minimumXp ?? 0;
}

export function modifierForRank(
  rank: MasteryRank,
  config: ProgressionConfig = PROGRESSION_CONFIG
): number {
  return config.ranks.find((entry) => entry.rank === rank)?.modifier ?? 0;
}

export function computeXpAward(
  outcome: Outcome,
  dc: number,
  recentSimilarUses = 0,
  config: ProgressionConfig = PROGRESSION_CONFIG
): XpComputation {
  const base = config.outcomeBaseXp[outcome];
  const challengeMultiplier =
    config.challengeBands.find((band) => dc <= band.maximumDc)?.multiplier ??
    config.challengeBands.at(-1)?.multiplier ??
    1;
  const repetitionMultiplier =
    config.repetitionMultipliers[
      Math.min(Math.max(0, recentSimilarUses), config.repetitionMultipliers.length - 1)
    ] ?? 0;
  const amount = Math.min(
    config.maximumAward,
    Math.max(0, Math.round(base * challengeMultiplier * repetitionMultiplier))
  );
  return {
    amount,
    base,
    challengeMultiplier,
    repetitionMultiplier,
    reason:
      amount === 0
        ? "No XP: repeated action no longer provides meaningful practice."
        : `${outcome.replace("_", " ")} at DC ${dc}; challenge ×${challengeMultiplier}, repetition ×${repetitionMultiplier}.`,
  };
}
