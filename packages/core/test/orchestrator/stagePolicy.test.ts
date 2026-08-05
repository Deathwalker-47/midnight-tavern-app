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
    expect(metrics[0]).toMatchObject({ stage: "npc_planner", outcome: "fallback", cause: "timeout" });
  });

  it("records outcome fallback with cause timeout when a hung stage degrades gracefully", async () => {
    const { schedule, trigger } = controllableSchedule();
    const metrics: StageMetric[] = [];
    const pending = runStage<string[]>(
      "npc_planner",
      () => new Promise<string[]>(() => {}),
      {
        deadlineMs: 20_000,
        fallback: () => [],
        onMetric: (m) => metrics.push(m),
        schedule,
      }
    );
    await Promise.resolve();
    trigger();
    await expect(pending).resolves.toEqual([]);
    expect(metrics[0]).toMatchObject({
      stage: "npc_planner",
      outcome: "fallback",
      cause: "timeout",
    });
  });

  it("records outcome fallback with cause error when the stage throws", async () => {
    const metrics: StageMetric[] = [];
    const value = await runStage(
      "narrator",
      async () => {
        throw new Error("provider 500");
      },
      { deadlineMs: 1_000, fallback: () => "safe", onMetric: (m) => metrics.push(m) }
    );
    expect(value).toBe("safe");
    expect(metrics[0]).toMatchObject({ outcome: "fallback", cause: "error" });
  });

  it("passes the failure cause to the fallback factory", async () => {
    const seen: string[] = [];
    await runStage(
      "classifier",
      async () => {
        throw new Error("boom");
      },
      {
        deadlineMs: 1_000,
        fallback: (cause) => {
          seen.push(cause);
          return 0;
        },
      }
    );
    expect(seen).toEqual(["error"]);
  });

  it("records outcome error and rethrows when the fallback itself throws", async () => {
    const metrics: StageMetric[] = [];
    await expect(
      runStage(
        "authority_audit",
        async () => {
          throw new Error("stage down");
        },
        {
          deadlineMs: 1_000,
          fallback: () => {
            throw new Error("fallback down");
          },
          onMetric: (m) => metrics.push(m),
        }
      )
    ).rejects.toThrow("fallback down");
    expect(metrics[0]).toMatchObject({ outcome: "error", cause: "error" });
  });

  it("excludes fallback execution time from durationMs", async () => {
    const metrics: StageMetric[] = [];
    let clock = 0;
    await runStage(
      "narrator",
      async () => {
        throw new Error("boom");
      },
      {
        deadlineMs: 1_000,
        now: () => (clock += 10),
        fallback: () => {
          clock += 1_000; // an expensive deterministic fallback
          return "safe";
        },
        onMetric: (m) => metrics.push(m),
      }
    );
    expect(metrics[0]!.durationMs).toBeLessThan(1_000);
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

  it("propagates caller cancellation even when the stage ignores its abort signal", async () => {
    const controller = new AbortController();
    const metrics: StageMetric[] = [];
    const pending = runStage(
      "authority_audit",
      async () => new Promise<string>(() => {}),
      {
        deadlineMs: 10,
        fallback: () => "fallback",
        signal: controller.signal,
        onMetric: (metric) => metrics.push(metric),
      }
    );
    await Promise.resolve();
    controller.abort(new DOMException("Stop now", "AbortError"));

    await expect(pending).rejects.toThrow("Stop now");
    expect(metrics).toEqual([
      expect.objectContaining({
        stage: "authority_audit",
        outcome: "cancelled",
      }),
    ]);
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
