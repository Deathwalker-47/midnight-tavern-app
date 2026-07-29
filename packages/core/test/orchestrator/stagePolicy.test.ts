import { describe, expect, it } from "vitest";
import {
  runStage,
  DEFAULT_STAGE_DEADLINES,
  type StageMetric,
} from "../../src/orchestrator/stagePolicy.js";

/** A scheduler whose deadline only fires when the test calls `trigger()`. */
function controllableSchedule() {
  let fire: (() => void) | undefined;
  return {
    schedule: (_ms: number, cb: () => void) => {
      fire = cb;
      return () => {
        fire = undefined;
      };
    },
    trigger: () => fire?.(),
  };
}

describe("runStage — deadlines, fallbacks, telemetry", () => {
  it("returns the stage value and records an ok metric on success", async () => {
    const metrics: StageMetric[] = [];
    let clock = 100;
    const value = await runStage("classifier", async () => "done", {
      deadlineMs: 1_000,
      fallback: () => "fallback",
      now: () => (clock += 5),
      onMetric: (m) => metrics.push(m),
    });
    expect(value).toBe("done");
    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({ stage: "classifier", outcome: "ok" });
    expect(metrics[0]!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns the deterministic fallback and aborts a hung stage on timeout", async () => {
    const { schedule, trigger } = controllableSchedule();
    const metrics: StageMetric[] = [];
    let aborted = false;
    const pending = runStage<string[]>(
      "npc_planner",
      (signal) =>
        new Promise<string[]>(() => {
          signal.addEventListener("abort", () => {
            aborted = true;
          });
        }),
      {
        deadlineMs: 20_000,
        fallback: () => [],
        onMetric: (m) => metrics.push(m),
        schedule,
      }
    );
    await Promise.resolve();
    trigger(); // the deadline elapses
    const value = await pending;

    expect(value).toEqual([]); // deterministic fallback, turn not blocked
    expect(aborted).toBe(true); // the hung stage was signalled to stop
    expect(metrics[0]).toMatchObject({ stage: "npc_planner", outcome: "timeout" });
  });

  it("returns the fallback and records an error metric when the stage throws", async () => {
    const metrics: StageMetric[] = [];
    const value = await runStage(
      "narrator",
      async () => {
        throw new Error("provider 500");
      },
      { deadlineMs: 1_000, fallback: () => "safe", onMetric: (m) => metrics.push(m) }
    );
    expect(value).toBe("safe");
    expect(metrics[0]).toMatchObject({ outcome: "error" });
  });

  it("propagates a genuine caller cancel instead of falling back", async () => {
    const controller = new AbortController();
    const metrics: StageMetric[] = [];
    const pending = runStage(
      "narrator",
      (signal) =>
        new Promise<string>((_, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason));
        }),
      {
        deadlineMs: 60_000,
        fallback: () => "fallback",
        signal: controller.signal,
        onMetric: (m) => metrics.push(m),
      }
    );
    await Promise.resolve();
    controller.abort(new DOMException("User cancelled", "AbortError"));

    await expect(pending).rejects.toThrow("User cancelled");
    expect(metrics[0]).toMatchObject({ outcome: "cancelled" });
  });

  it("does not start the stage when the caller signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("gone", "AbortError"));
    let started = false;
    await expect(
      runStage(
        "classifier",
        async () => {
          started = true;
          return 1;
        },
        { deadlineMs: 1_000, fallback: () => 0, signal: controller.signal }
      )
    ).rejects.toThrow("gone");
    expect(started).toBe(false);
  });

  it("ships a positive default deadline for every stage", () => {
    for (const ms of Object.values(DEFAULT_STAGE_DEADLINES)) {
      expect(ms).toBeGreaterThan(0);
    }
  });
});
