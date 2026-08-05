/**
 * Stage policy (plan Task 9) — a deadline + deterministic fallback wrapper for the async stages of a
 * turn (classifier, NPC introduction, NPC planner, narrator, authority audit).
 *
 * `runStage` races a stage against a configured deadline. On success it returns the value and reports
 * an `ok` metric. On timeout OR error it aborts the stage (if applicable) and returns a DETERMINISTIC
 * fallback (never blocking the turn), reporting outcome `fallback` with `cause` set to `timeout` or
 * `error` — a timeout is a reason the stage didn't return its own value, not a disposition of its
 * own. If the fallback itself throws, outcome is `error` and the error propagates. If the caller's
 * own signal aborts, the abort propagates (a real cancel, not a fallback) with a `cancelled` metric.
 * Provider internals never leak — only the stage name, timing, and outcome/cause.
 *
 * Timing and the deadline timer are injectable so tests are deterministic without a global fake clock.
 */

export type TurnStage =
  | "classifier"
  | "npc_introduction"
  | "npc_planner"
  | "narrator"
  | "authority_audit";

/** Why a stage did not return its own value. A timeout is a cause, never a disposition. */
export type StageFailureCause = "timeout" | "error";

export interface StageMetric {
  stage: TurnStage;
  startedAt: number;
  durationMs: number;
  /**
   * What the CALLER got. `ok` = the stage's own value; `fallback` = the deterministic fallback
   * stood in and the turn continued; `cancelled` = the caller aborted; `error` = the fallback
   * itself threw and nothing usable was produced.
   */
  outcome: "ok" | "fallback" | "cancelled" | "error";
  /** Present whenever `outcome` is `fallback` or `error`. */
  cause?: StageFailureCause;
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
  /** Deterministic fallback produced on timeout/error. Should not throw; if it does, `runStage` rethrows. */
  fallback: (cause: StageFailureCause) => T;
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
  const emit = (
    outcome: StageMetric["outcome"],
    durationMs: number,
    cause?: StageFailureCause
  ): void => {
    try {
      options.onMetric?.({
        stage,
        startedAt,
        durationMs,
        outcome,
        ...(cause ? { cause } : {}),
      });
    } catch {
      /* telemetry must never break a turn */
    }
  };
  const elapsed = (): number => Math.max(0, now() - startedAt);

  // Already-cancelled: surface the cancel without starting the stage.
  if (options.signal?.aborted) {
    emit("cancelled", elapsed());
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
    emit("ok", elapsed());
    return value;
  } catch (error) {
    finish();
    // A genuine caller cancel (not our deadline) propagates as a real cancellation.
    if (options.signal?.aborted && !timedOut) {
      emit("cancelled", elapsed());
      throw options.signal.reason ?? error;
    }
    const cause: StageFailureCause = timedOut ? "timeout" : "error";
    const durationMs = elapsed(); // measured before the fallback runs
    try {
      const value = options.fallback(cause);
      emit("fallback", durationMs, cause);
      return value;
    } catch (fallbackError) {
      // The contract says a fallback must not throw. If one does, the turn genuinely has no
      // usable value — report it as `error` and propagate rather than inventing one.
      emit("error", durationMs, cause);
      throw fallbackError;
    }
  }
}
