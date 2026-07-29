/**
 * Stage policy (plan Task 9) — a deadline + deterministic fallback wrapper for the async stages of a
 * turn (classifier, NPC introduction, NPC planner, narrator, authority audit).
 *
 * `runStage` races a stage against a configured deadline. On success it returns the value and reports
 * an `ok` metric; on timeout it aborts the stage and returns a DETERMINISTIC fallback (never blocking
 * the turn) with a `timeout` metric; on error it returns the fallback with an `error` metric; and if
 * the caller's own signal aborts, the abort propagates (a real cancel, not a fallback) with a
 * `cancelled` metric. Provider internals never leak — only the stage name, timing, and outcome.
 *
 * Timing and the deadline timer are injectable so tests are deterministic without a global fake clock.
 */

export type TurnStage =
  | "classifier"
  | "npc_introduction"
  | "npc_planner"
  | "narrator"
  | "authority_audit";

export interface StageMetric {
  stage: TurnStage;
  startedAt: number;
  durationMs: number;
  outcome: "ok" | "fallback" | "timeout" | "cancelled" | "error";
}

/** Default per-stage deadlines (ms). Generous — a real timeout means the provider genuinely hung. */
export const DEFAULT_STAGE_DEADLINES: Record<TurnStage, number> = {
  classifier: 30_000,
  npc_introduction: 20_000,
  npc_planner: 20_000,
  narrator: 60_000,
  authority_audit: 30_000,
};

/** Cancel handle for a scheduled deadline. */
export type CancelTimer = () => void;

export interface RunStageOptions<T> {
  deadlineMs: number;
  /** Deterministic fallback produced on timeout/error. Must not throw. */
  fallback: () => T;
  /** Injectable clock (defaults to Date.now). */
  now?: () => number;
  /** Caller cancellation. A genuine abort propagates instead of falling back. */
  signal?: AbortSignal;
  /** Records the stage outcome; never throws into the turn. */
  onMetric?: (metric: StageMetric) => void;
  /** Injectable deadline timer (defaults to setTimeout); returns a cancel handle. */
  schedule?: (ms: number, fire: () => void) => CancelTimer;
}

/** Thrown internally when a stage exceeds its deadline; never surfaced to the caller. */
class StageTimeoutError extends Error {
  constructor(readonly stage: TurnStage) {
    super(`Stage "${stage}" exceeded its deadline.`);
    this.name = "StageTimeoutError";
  }
}

const defaultSchedule = (ms: number, fire: () => void): CancelTimer => {
  const timer = setTimeout(fire, ms);
  return () => clearTimeout(timer);
};

/**
 * Run one turn stage under a deadline. `run` receives an AbortSignal that fires on timeout OR caller
 * cancellation, so a well-behaved provider call stops promptly. Returns the stage value on success,
 * or the deterministic fallback on timeout/error. A genuine caller cancel re-throws.
 */
export async function runStage<T>(
  stage: TurnStage,
  run: (signal: AbortSignal) => Promise<T>,
  options: RunStageOptions<T>
): Promise<T> {
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? defaultSchedule;
  const startedAt = now();
  const emit = (outcome: StageMetric["outcome"]): void => {
    try {
      options.onMetric?.({ stage, startedAt, durationMs: Math.max(0, now() - startedAt), outcome });
    } catch {
      /* telemetry must never break a turn */
    }
  };

  // Already-cancelled: surface the cancel without starting the stage.
  if (options.signal?.aborted) {
    emit("cancelled");
    throw options.signal.reason ?? new DOMException("Cancelled", "AbortError");
  }

  const controller = new AbortController();
  const abortStage = (reason: unknown): void => {
    if (!controller.signal.aborted) controller.abort(reason);
  };
  let rejectCallerCancellation: (reason?: unknown) => void = () => {};
  const callerCancellation = new Promise<never>((_, reject) => {
    rejectCallerCancellation = reject;
  });
  const onCallerAbort = (): void => {
    const reason =
      options.signal?.reason ?? new DOMException("Cancelled", "AbortError");
    abortStage(reason);
    // Do not rely on provider code observing the stage signal. Cancellation must release the turn
    // immediately even when a provider leaves its promise pending forever.
    rejectCallerCancellation(reason);
  };
  options.signal?.addEventListener("abort", onCallerAbort, { once: true });

  let timedOut = false;
  let cancelTimer: CancelTimer = () => {};
  const deadline = new Promise<never>((_, reject) => {
    cancelTimer = schedule(options.deadlineMs, () => {
      timedOut = true;
      const error = new StageTimeoutError(stage);
      abortStage(error);
      reject(error);
    });
  });

  const finish = (): void => {
    cancelTimer();
    options.signal?.removeEventListener("abort", onCallerAbort);
  };

  try {
    const value = await Promise.race([
      run(controller.signal),
      deadline,
      ...(options.signal ? [callerCancellation] : []),
    ]);
    finish();
    emit("ok");
    return value;
  } catch (error) {
    finish();
    // A genuine caller cancel (not our deadline) propagates as a real cancellation.
    if (options.signal?.aborted && !timedOut) {
      emit("cancelled");
      throw options.signal.reason ?? error;
    }
    emit(timedOut ? "timeout" : "error");
    return options.fallback();
  }
}
