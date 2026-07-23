import { describe, expect, it } from "vitest";
import {
  computeXpAward,
  enforceActionBudget,
  rankForXp,
  type MechanicalIntent,
} from "../src/index.js";

describe("V7 XP progression", () => {
  it("uses cumulative exponential thresholds", () => {
    expect(rankForXp(0)).toBe("novice");
    expect(rankForXp(99)).toBe("novice");
    expect(rankForXp(100)).toBe("adept");
    expect(rankForXp(300)).toBe("expert");
    expect(rankForXp(700)).toBe("master");
  });

  it("awards by outcome/challenge and applies deterministic anti-grind", () => {
    expect(computeXpAward("success", 15, 0).amount).toBe(13);
    expect(computeXpAward("failure", 8, 0).amount).toBe(5);
    expect(computeXpAward("crit_success", 25, 0).amount).toBe(20);
    expect(computeXpAward("success", 15, 3).amount).toBe(0);
  });
});

describe("V7 action budget", () => {
  const intents: MechanicalIntent[] = [0, 1, 2, 3].map((index) => ({
    actorId: "player",
    actionId: `action_${index}`,
    confidence: 1,
  }));

  it("accepts in order and visibly refuses overflow", () => {
    const decision = enforceActionBudget(intents, 2);
    expect(decision.accepted.map((intent) => intent.actionId)).toEqual(["action_0", "action_1"]);
    expect(decision.refused[0]).toMatchObject({
      actionIndex: 2,
      actionId: "action_2",
      code: "action_budget_exceeded",
      limit: 2,
    });
  });

  it("clamps unsafe limits into the supported range", () => {
    expect(enforceActionBudget(intents, 0).limit).toBe(1);
    expect(enforceActionBudget(intents, 99).limit).toBe(5);
  });
});
