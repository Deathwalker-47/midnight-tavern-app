import { rankAtLeast, type CharacterHardState, type Condition } from "../types/index.js";
import { attrScore } from "./attributes.js";

/**
 * Evaluates one frozen condition against authoritative character state.
 *
 * @param actor - Character whose hard-state fields are inspected.
 * @param cond - Typed deterministic predicate from the frozen rulebook.
 * @returns Whether the condition currently holds.
 *
 * @remarks The function performs no mutation and makes no model calls.
 * @see {@link computeRollMode} for advantage-condition consumption.
 * @since 0.1.0
 */
export function conditionHolds(actor: CharacterHardState, cond: Condition): boolean {
  switch (cond.type) {
    case "skill": {
      const skill = actor.skills.find((candidate) => candidate.skillId === cond.skillId);
      if (!skill) return false;
      return cond.minRank ? rankAtLeast(skill.rank, cond.minRank) : true;
    }
    case "resource": {
      const resource = actor.resources[cond.resourceId];
      return !!resource && resource.current >= cond.min;
    }
    case "item":
      return actor.inventory.some((entry) => entry.itemId === cond.itemId && entry.qty > 0);
    case "flag":
      return (actor.flags[cond.flagId] ?? false) === cond.value;
    case "attribute":
      return attrScore(actor, cond.attributeId) >= cond.min;
  }
}
