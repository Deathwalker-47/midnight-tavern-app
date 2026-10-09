import { describe, expect, it } from "vitest";
import {
  computeXpAward,
  countRecentSimilarUses,
  enforceActionBudget,
  minimumXpForRank,
  modifierForRank,
  rankForXp,
  type MechanicalIntent,
  type ProgressionConfig,
  type Ruling,
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
    expect(computeXpAward("success", 15, 3).amount).toBe(6);
  });

  it("softens repetition to a 40% floor and never reaches zero (finding 16)", () => {
    // success at DC 15 = 10 base × 1.25 challenge = 12.5 before repetition.
    const amounts = [0, 1, 2, 3, 4, 5, 10].map(
      (uses) => computeXpAward("success", 15, uses).amount
    );
    expect(amounts).toEqual([13, 10, 8, 6, 5, 5, 5]);
    expect(computeXpAward("success", 15, 99).repetitionMultiplier).toBe(0.4);
    expect(computeXpAward("success", 15, 99).reason).not.toMatch(/No XP/);
  });

  it("uses safe fallbacks for sparse versioned progression configuration", () => {
    const sparse: ProgressionConfig = {
      version: 99,
      ranks: [],
      outcomeBaseXp: {
        crit_failure: 4,
        failure: 6,
        success: 10,
        crit_success: 15,
      },
      challengeBands: [],
      repetitionWindowTurns: 5,
      repetitionMultipliers: [],
      maximumAward: 20,
    };
    expect(minimumXpForRank("master", sparse)).toBe(0);
    expect(modifierForRank("master", sparse)).toBe(0);
    expect(computeXpAward("success", 99, -3, sparse)).toMatchObject({
      amount: 0,
      challengeMultiplier: 1,
      repetitionMultiplier: 0,
    });
  });

  it("uses the final configured challenge band above its declared ceiling", () => {
    expect(computeXpAward("success", 99, 0).challengeMultiplier).toBe(1.5);
  });
});

describe("repetition window (finding 16)", () => {
  type Prior = { actorId: string; actionId: string; targetId?: string; messageId: string };
  const ruling = (prior: Prior) =>
    ({
      turnId: `${prior.actorId}:${prior.actionId}`,
      actorId: prior.actorId,
      actionId: prior.actionId,
      ...(prior.targetId ? { targetId: prior.targetId } : {}),
      messageId: prior.messageId,
      gate: { allowed: true },
      effectsApplied: null,
    }) as unknown as Ruling;
  const strike = { actorId: "player", actionId: "attack_melee", targetId: "wight" };
  const intent: MechanicalIntent = { ...strike, confidence: 1 };

  it("counts only the acting character's own rulings, so NPC rulings never consume the window", () => {
    // Three player strikes followed by six NPC rulings. A global "last five rulings" window
    // would see only NPC rulings; a per-actor window still sees the three strikes.
    const priors: Prior[] = [
      { ...strike, messageId: "m1" },
      { ...strike, messageId: "m3" },
      { ...strike, messageId: "m5" },
      ...[7, 9, 11, 13, 15, 17].map((index) => ({
        actorId: "wight",
        actionId: "attack_melee",
        targetId: "player",
        messageId: `m${index}`,
      })),
    ];
    expect(countRecentSimilarUses(priors.map(ruling), intent, 5)).toBe(3);
  });

  it("resets when the target changes", () => {
    const priors = [1, 3, 5].map((index) => ruling({ ...strike, messageId: `m${index}` }));
    expect(countRecentSimilarUses(priors, { ...intent, targetId: "bandit" }, 5)).toBe(0);
  });

  it("looks back over the configured number of the actor's turns, not raw rulings", () => {
    // Two strikes per turn across four turns; a window of two turns sees four strikes.
    const priors = [1, 1, 3, 3, 5, 5, 7, 7].map((index) =>
      ruling({ ...strike, messageId: `m${index}` })
    );
    expect(countRecentSimilarUses(priors, intent, 2)).toBe(4);
    expect(countRecentSimilarUses(priors, intent, 5)).toBe(8);
  });

  it("treats each legacy ruling without a message id as its own turn", () => {
    const priors = [0, 1, 2].map(() => {
      const legacy = ruling({ ...strike, messageId: "unused" });
      delete (legacy as { messageId?: string }).messageId;
      return legacy;
    });
    expect(countRecentSimilarUses(priors, intent, 2)).toBe(2);
    expect(countRecentSimilarUses(priors, intent)).toBe(3);
  });

  it("only counts the same action", () => {
    const priors = [
      ruling({ ...strike, messageId: "m1" }),
      ruling({ ...strike, actionId: "intimidate", messageId: "m3" }),
    ];
    expect(countRecentSimilarUses(priors, intent, 5)).toBe(1);
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
