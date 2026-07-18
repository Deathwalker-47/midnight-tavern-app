/**
 * Free trial (low-level-plan §M11.3).
 *
 * A 14-day trial that starts on first launch and is stored locally in settings. When it
 * expires it gates STORY CREATION (and, at the UI layer, generation in existing stories) —
 * but existing stories stay fully readable: chapters, arcs, and living cards remain open.
 * There is no server check; the trial start is a local timestamp, deliberately soft DRM.
 *
 * A valid license supersedes the trial entirely — {@link resolveEntitlement} takes a license
 * state so callers get one answer to "may this user create a story right now?".
 *
 * `now` is injected for testability.
 */
import { z } from "zod";
import type { Store } from "../store/index.js";
import type { LicenseState } from "./license.js";

/** Settings key holding the epoch-ms timestamp of first launch. */
export const TRIAL_START_KEY = "trialStartedAt";

/** Trial length: 14 days from first launch (§M11.3). */
export const TRIAL_DURATION_MS = 14 * 24 * 60 * 60 * 1000;

/** The trial's standing at a point in time. */
export interface TrialStatus {
  startedAt: number;
  expiresAt: number;
  /** True while now < expiresAt. */
  active: boolean;
  /** Whole days remaining (0 once expired), for display. */
  daysRemaining: number;
}

/** Derive a {@link TrialStatus} from a start timestamp and the current time. */
function statusFrom(startedAt: number, nowMs: number): TrialStatus {
  const expiresAt = startedAt + TRIAL_DURATION_MS;
  const remainingMs = Math.max(0, expiresAt - nowMs);
  return {
    startedAt,
    expiresAt,
    active: nowMs < expiresAt,
    daysRemaining: Math.ceil(remainingMs / 86_400_000),
  };
}

/**
 * Return the trial status, STARTING the trial on first call (persisting the start timestamp).
 * Idempotent: subsequent calls read the stored start. This is what a first-launch hook calls.
 */
export async function startOrGetTrial(
  store: Store,
  now: () => number = Date.now
): Promise<TrialStatus> {
  let startedAt = await store.settings.get(TRIAL_START_KEY, z.number().int());
  if (startedAt === undefined) {
    startedAt = now();
    await store.settings.set(TRIAL_START_KEY, z.number().int(), startedAt);
  }
  return statusFrom(startedAt, now());
}

/**
 * Read the trial status WITHOUT starting it — returns `undefined` if the trial has never been
 * started. Use this for read-only checks that must not have the side effect of starting a
 * trial (e.g. rendering license status).
 */
export async function peekTrial(
  store: Store,
  now: () => number = Date.now
): Promise<TrialStatus | undefined> {
  const startedAt = await store.settings.get(TRIAL_START_KEY, z.number().int());
  return startedAt === undefined ? undefined : statusFrom(startedAt, now());
}

/** The user's right to create a story, and why. */
export type Entitlement =
  | { canCreateStory: true; via: "license" | "trial"; trial?: TrialStatus }
  | { canCreateStory: false; reason: "trial-expired"; trial: TrialStatus };

/**
 * The single "may this user create a story now?" answer. A valid license always wins; failing
 * that, an active trial grants creation; an expired trial denies it. Existing stories are never
 * gated here — that is a UI decision keyed off `canCreateStory` for the *creation* action only.
 */
export async function resolveEntitlement(
  license: LicenseState,
  store: Store,
  now: () => number = Date.now
): Promise<Entitlement> {
  if (license.status === "valid") {
    return { canCreateStory: true, via: "license" };
  }
  const trial = await startOrGetTrial(store, now);
  if (trial.active) return { canCreateStory: true, via: "trial", trial };
  return { canCreateStory: false, reason: "trial-expired", trial };
}
