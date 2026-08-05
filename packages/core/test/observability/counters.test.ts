import { describe, expect, it } from "vitest";
import {
  countersForTurn,
  mergeCounters,
  EMPTY_DIAGNOSTIC_COUNTERS,
} from "../../src/observability/counters.js";

describe("countersForTurn — a pure fold from one turn's outputs to counter deltas", () => {
  it("counts each gate denial under its own code", () => {
    const deltas = countersForTurn({
      rulings: [
        { gate: { allowed: false, code: "cannot_afford" } },
        { gate: { allowed: false, code: "cannot_afford" } },
        { gate: { allowed: false, code: "actor_dead" } },
        { gate: { allowed: true } },
      ],
      stageMetrics: [],
      classifierRecovered: false,
      usedNarratorFallback: false,
      narratorRepairCount: 0,
    });
    expect(deltas["gate.denied.cannot_afford"]).toBe(2);
    expect(deltas["gate.denied.actor_dead"]).toBe(1);
    expect(deltas["gate.allowed"]).toBe(1);
  });

  it("counts a stage fallback under its stage AND its cause", () => {
    const deltas = countersForTurn({
      rulings: [],
      stageMetrics: [
        { stage: "npc_planner", startedAt: 0, durationMs: 20_000, outcome: "fallback", cause: "timeout" },
        { stage: "narrator", startedAt: 0, durationMs: 900, outcome: "ok" },
      ],
      classifierRecovered: false,
      usedNarratorFallback: false,
      narratorRepairCount: 0,
    });
    expect(deltas["stage.fallback.npc_planner.timeout"]).toBe(1);
    expect(deltas["stage.fallback.narrator.timeout"]).toBeUndefined();
  });

  it("accumulates latency as a sum and a count per stage", () => {
    const deltas = countersForTurn({
      rulings: [],
      stageMetrics: [
        { stage: "narrator", startedAt: 0, durationMs: 900, outcome: "ok" },
        { stage: "narrator", startedAt: 0, durationMs: 1_100, outcome: "ok" },
      ],
      classifierRecovered: false,
      usedNarratorFallback: false,
      narratorRepairCount: 0,
    });
    expect(deltas["stage.durationMs.narrator"]).toBe(2_000);
    expect(deltas["stage.runs.narrator"]).toBe(2);
  });

  it("counts classifier recovery, narrator repairs, and the safe summary", () => {
    const deltas = countersForTurn({
      rulings: [],
      stageMetrics: [],
      classifierRecovered: true,
      usedNarratorFallback: true,
      narratorRepairCount: 2,
    });
    expect(deltas["classifier.recovered"]).toBe(1);
    expect(deltas["authorityGuard.draftRejected"]).toBe(2);
    expect(deltas["authorityGuard.safeSummaryUsed"]).toBe(1);
  });

  it("always counts the turn itself, so every rate has a denominator", () => {
    const deltas = countersForTurn({
      rulings: [],
      stageMetrics: [],
      classifierRecovered: false,
      usedNarratorFallback: false,
      narratorRepairCount: 0,
    });
    expect(deltas["turn.completed"]).toBe(1);
  });
});

describe("mergeCounters", () => {
  it("adds deltas onto an existing set without mutating either input", () => {
    const base = { "turn.completed": 3, "gate.denied.actor_dead": 1 };
    const merged = mergeCounters(base, { "turn.completed": 1, "provider.retried": 2 });
    expect(merged).toEqual({
      "turn.completed": 4,
      "gate.denied.actor_dead": 1,
      "provider.retried": 2,
    });
    expect(base["turn.completed"]).toBe(3);
  });

  it("starts from an empty set", () => {
    expect(mergeCounters(EMPTY_DIAGNOSTIC_COUNTERS, { "turn.completed": 1 })).toEqual({
      "turn.completed": 1,
    });
  });
});
