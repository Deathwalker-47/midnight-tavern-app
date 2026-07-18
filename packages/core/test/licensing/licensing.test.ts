/**
 * Licensing tests (low-level-plan §M11).
 *
 * license.ts — validate against a stubbed merchant API with an injected clock:
 *   • online valid/invalid verdicts are authoritative and cached;
 *   • a network throw or 5xx falls back to the cache, honoring the 14-day grace window;
 *   • the cache is only trusted for the SAME key; a stale cache past grace is invalid;
 *   • evaluateCachedLicense is the pure, network-free launch path.
 * trial.ts — 14-day local trial with an injected clock:
 *   • startOrGetTrial persists first-launch and is idempotent; peekTrial has no side effect;
 *   • resolveEntitlement folds license + trial into one create-story answer (license wins).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { openStore, type Store } from "../../src/store/index.js";
import {
  validateLicenseKey,
  evaluateCachedLicense,
  readLicenseCache,
  clearLicense,
  OFFLINE_GRACE_MS,
} from "../../src/licensing/license.js";
import {
  startOrGetTrial,
  peekTrial,
  resolveEntitlement,
  TRIAL_DURATION_MS,
} from "../../src/licensing/trial.js";
import type { FetchLike } from "../../src/router/providers/types.js";

const T0 = 1_700_000_000_000; // fixed epoch-ms base
const clock = (t: number) => () => t;

/** A fetch stub returning a JSON body with the given status. */
function jsonFetch(body: unknown, status = 200): FetchLike {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as FetchLike;
}

/** A fetch stub that always throws (network unreachable). */
const throwingFetch: FetchLike = (async () => {
  throw new Error("ENOTFOUND");
}) as unknown as FetchLike;

const VALID_BODY = {
  valid: true,
  error: null,
  license_key: { status: "active" },
  meta: { customer_name: "Ada L." },
};
const INVALID_BODY = {
  valid: false,
  error: "license_key not found",
  license_key: { status: "disabled" },
};

describe("validateLicenseKey", () => {
  let store: Store;
  beforeEach(() => {
    store = openStore(":memory:");
  });

  it("accepts and caches an online-valid key", async () => {
    const state = await validateLicenseKey("KEY-1", {
      store,
      fetchImpl: jsonFetch(VALID_BODY),
      now: clock(T0),
    });
    expect(state).toMatchObject({ status: "valid", source: "online" });
    expect(readLicenseCache(store)).toMatchObject({
      key: "KEY-1",
      valid: true,
      lastCheckedAt: T0,
      label: "Ada L.",
    });
  });

  it("rejects and caches an online-invalid key with the provider reason", async () => {
    const state = await validateLicenseKey("BAD", {
      store,
      fetchImpl: jsonFetch(INVALID_BODY),
      now: clock(T0),
    });
    expect(state.status).toBe("invalid");
    if (state.status === "invalid") expect(state.reason).toMatch(/not found/);
    expect(readLicenseCache(store)).toMatchObject({ valid: false });
  });

  it("trims whitespace and treats an empty key as unlicensed", async () => {
    const state = await validateLicenseKey("   ", { store, fetchImpl: throwingFetch });
    expect(state.status).toBe("unlicensed");
  });

  it("falls back to a cached success within the grace window on a network throw", async () => {
    await validateLicenseKey("KEY-1", { store, fetchImpl: jsonFetch(VALID_BODY), now: clock(T0) });
    const tenDays = T0 + 10 * 86_400_000;
    const state = await validateLicenseKey("KEY-1", {
      store,
      fetchImpl: throwingFetch,
      now: clock(tenDays),
    });
    expect(state).toMatchObject({ status: "valid", source: "grace" });
  });

  it("refuses a cached success once the grace window has elapsed", async () => {
    await validateLicenseKey("KEY-1", { store, fetchImpl: jsonFetch(VALID_BODY), now: clock(T0) });
    const past = T0 + OFFLINE_GRACE_MS + 1;
    const state = await validateLicenseKey("KEY-1", {
      store,
      fetchImpl: throwingFetch,
      now: clock(past),
    });
    expect(state.status).toBe("invalid");
  });

  it("does not trust a cached key when the presented key differs", async () => {
    await validateLicenseKey("KEY-1", { store, fetchImpl: jsonFetch(VALID_BODY), now: clock(T0) });
    const state = await validateLicenseKey("OTHER-KEY", {
      store,
      fetchImpl: throwingFetch,
      now: clock(T0 + 1000),
    });
    expect(state.status).toBe("invalid");
    if (state.status === "invalid") expect(state.reason).toMatch(/no verified copy/i);
  });

  it("treats a 5xx like an outage and leans on the cache", async () => {
    await validateLicenseKey("KEY-1", { store, fetchImpl: jsonFetch(VALID_BODY), now: clock(T0) });
    const state = await validateLicenseKey("KEY-1", {
      store,
      fetchImpl: jsonFetch({}, 503),
      now: clock(T0 + 86_400_000),
    });
    expect(state).toMatchObject({ status: "valid", source: "grace" });
  });
});

describe("evaluateCachedLicense", () => {
  let store: Store;
  beforeEach(() => {
    store = openStore(":memory:");
  });

  it("reports unlicensed with no cache", () => {
    expect(evaluateCachedLicense(store, clock(T0))).toEqual({ status: "unlicensed" });
  });

  it("is valid within grace and invalid past it, without any network", async () => {
    await validateLicenseKey("KEY-1", { store, fetchImpl: jsonFetch(VALID_BODY), now: clock(T0) });
    expect(evaluateCachedLicense(store, clock(T0 + 86_400_000)).status).toBe("valid");
    expect(evaluateCachedLicense(store, clock(T0 + OFFLINE_GRACE_MS + 1)).status).toBe("invalid");
  });

  it("clearLicense removes the cache", async () => {
    await validateLicenseKey("KEY-1", { store, fetchImpl: jsonFetch(VALID_BODY), now: clock(T0) });
    clearLicense(store);
    expect(readLicenseCache(store)).toBeUndefined();
  });
});

describe("trial", () => {
  let store: Store;
  beforeEach(() => {
    store = openStore(":memory:");
  });

  it("starts on first call and is idempotent thereafter", () => {
    const first = startOrGetTrial(store, clock(T0));
    expect(first).toMatchObject({ startedAt: T0, active: true });
    // A later call must not reset the start.
    const later = startOrGetTrial(store, clock(T0 + 5 * 86_400_000));
    expect(later.startedAt).toBe(T0);
  });

  it("peekTrial has no side effect before the trial starts", () => {
    expect(peekTrial(store, clock(T0))).toBeUndefined();
    startOrGetTrial(store, clock(T0));
    expect(peekTrial(store, clock(T0))).toMatchObject({ startedAt: T0 });
  });

  it("reports daysRemaining and expires after 14 days", () => {
    startOrGetTrial(store, clock(T0));
    expect(startOrGetTrial(store, clock(T0)).daysRemaining).toBe(14);
    const expired = startOrGetTrial(store, clock(T0 + TRIAL_DURATION_MS + 1));
    expect(expired.active).toBe(false);
    expect(expired.daysRemaining).toBe(0);
  });

  it("resolveEntitlement: license valid grants creation regardless of trial", () => {
    const ent = resolveEntitlement(
      { status: "valid", source: "online", cache: { key: "k", valid: true, lastCheckedAt: T0 } },
      store,
      clock(T0 + TRIAL_DURATION_MS + 1) // trial would be expired
    );
    expect(ent).toMatchObject({ canCreateStory: true, via: "license" });
  });

  it("resolveEntitlement: active trial grants creation when unlicensed", () => {
    const ent = resolveEntitlement({ status: "unlicensed" }, store, clock(T0));
    expect(ent).toMatchObject({ canCreateStory: true, via: "trial" });
  });

  it("resolveEntitlement: expired trial denies creation when unlicensed", () => {
    startOrGetTrial(store, clock(T0));
    const ent = resolveEntitlement(
      { status: "unlicensed" },
      store,
      clock(T0 + TRIAL_DURATION_MS + 1)
    );
    expect(ent).toMatchObject({ canCreateStory: false, reason: "trial-expired" });
  });
});
