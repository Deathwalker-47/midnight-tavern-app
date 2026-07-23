import type { ActionBudgetRefusal, MechanicalIntent } from "../types/index.js";

export interface ActionBudgetDecision {
  limit: number;
  accepted: MechanicalIntent[];
  refused: ActionBudgetRefusal[];
}

/**
 * Applies the story's sealed consequential-action limit without reordering intents.
 *
 * @param intents - Player intents in classifier source order.
 * @param configuredLimit - Story limit, bounded to the supported range 1–5.
 * @returns Accepted intents and explicit refusal records for every overflow action.
 *
 * @remarks NPC intents are not passed to this function and never consume player budget.
 * @see {@link ActionBudgetRefusal} for the refusal data contract.
 * @since 0.1.0
 */
export function enforceActionBudget(
  intents: readonly MechanicalIntent[],
  configuredLimit = 2
): ActionBudgetDecision {
  const limit = Math.max(1, Math.min(5, Math.round(configuredLimit)));
  return {
    limit,
    accepted: intents.slice(0, limit),
    refused: intents.slice(limit).map((intent, offset) => ({
      actionIndex: limit + offset,
      actionId: intent.actionId,
      code: "action_budget_exceeded",
      limit,
      reason: `This turn allows ${limit} consequential action${limit === 1 ? "" : "s"}; send this action next turn.`,
    })),
  };
}
