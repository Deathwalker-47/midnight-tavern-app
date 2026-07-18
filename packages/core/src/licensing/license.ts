/**
 * License validation (low-level-plan §M11.2).
 *
 * Validates a pasted license key against the merchant-of-record API (Lemon Squeezy first
 * choice — its `/v1/licenses/validate` endpoint), caches the last successful result in
 * settings, and honors a 14-day OFFLINE GRACE: if the network is unreachable but we have a
 * cached success within the grace window, the license stays valid. This is deliberately light
 * DRM (§M11.3 "no aggressive DRM; single check on launch") — a user who paid should never be
 * locked out by a flaky connection, and we never phone home more than the launch check needs.
 *
 * `fetch` and `now` are injected so this module is fully testable without a network or a real
 * clock. The store's settings repo is the only persistence.
 */
import { z } from "zod";
import type { Store } from "../store/index.js";
import type { FetchLike } from "../router/providers/types.js";

/** Settings key under which the last validation result is cached. */
export const LICENSE_CACHE_KEY = "licenseCache";

/** Offline grace window: a cached success stays valid this long without a re-check (§M11.2). */
export const OFFLINE_GRACE_MS = 14 * 24 * 60 * 60 * 1000;

/** Default Lemon Squeezy license validation endpoint. */
export const LEMON_SQUEEZY_VALIDATE_URL = "https://api.lemonsqueezy.com/v1/licenses/validate";

/** The cached outcome of the most recent license validation. */
export const LicenseCacheSchema = z.object({
  /** The key that was validated (so a changed paste invalidates the cache). */
  key: z.string(),
  /** Whether the last *successful contact* judged the key valid. */
  valid: z.boolean(),
  /** Epoch ms of the last successful contact with the provider. */
  lastCheckedAt: z.number().int(),
  /** Provider-reported status, e.g. "active" | "expired" | "disabled". */
  status: z.string().optional(),
  /** Human-readable instance/customer label for display, if the provider returned one. */
  label: z.string().optional(),
});
export type LicenseCache = z.infer<typeof LicenseCacheSchema>;

/** The three ways a license can be judged, plus why. */
export type LicenseState =
  | { status: "valid"; source: "online" | "grace"; cache: LicenseCache }
  | { status: "invalid"; reason: string; cache?: LicenseCache }
  | { status: "unlicensed" };

export interface LicenseDeps {
  store: Store;
  /** Injectable fetch (defaults to global). */
  fetchImpl?: FetchLike;
  /** Injectable clock in epoch ms (defaults to Date.now). */
  now?: () => number;
  /** Override the validation endpoint (defaults to Lemon Squeezy). */
  validateUrl?: string;
}

/** The subset of the Lemon Squeezy validate response we rely on. Extra fields are ignored. */
const LemonValidateResponseSchema = z.object({
  valid: z.boolean(),
  error: z.string().nullish(),
  license_key: z.object({ status: z.string().optional() }).partial().nullish(),
  meta: z
    .object({ customer_name: z.string().nullish(), product_name: z.string().nullish() })
    .partial()
    .nullish(),
});

/** Read the cached validation result, if any. */
export function readLicenseCache(store: Store): LicenseCache | undefined {
  return store.settings.get(LICENSE_CACHE_KEY, LicenseCacheSchema);
}

/** Clear a stored license (used when the user removes their key). */
export function clearLicense(store: Store): void {
  store.settings.delete(LICENSE_CACHE_KEY);
}

/**
 * Judge the currently-cached license WITHOUT contacting the network. This is the cheap
 * launch/offline path: valid if the cache says valid and we're inside the grace window.
 */
export function evaluateCachedLicense(store: Store, now: () => number = Date.now): LicenseState {
  const cache = readLicenseCache(store);
  if (!cache) return { status: "unlicensed" };
  if (!cache.valid) {
    return { status: "invalid", reason: cache.status ?? "License is not valid.", cache };
  }
  const age = now() - cache.lastCheckedAt;
  if (age <= OFFLINE_GRACE_MS) {
    return { status: "valid", source: "grace", cache };
  }
  return {
    status: "invalid",
    reason: `License needs re-checking (last verified ${Math.floor(age / 86_400_000)} days ago).`,
    cache,
  };
}

/** Offline path shared by every network-failure branch of {@link validateLicenseKey}. */
function offlineFallback(store: Store, key: string, now: () => number): LicenseState {
  const cached = readLicenseCache(store);
  // Only honor the cache if it belongs to the SAME key the user is presenting.
  if (cached && cached.key === key) return evaluateCachedLicense(store, now);
  return {
    status: "invalid",
    reason: "Couldn't reach the licensing server and no verified copy of this key is cached.",
  };
}

/**
 * Validate a license key against the provider, caching the result. On a network failure,
 * fall back to {@link evaluateCachedLicense} so a paid user inside the grace window stays
 * valid. A provider response that judges the key invalid is authoritative and cached as such.
 */
export async function validateLicenseKey(key: string, deps: LicenseDeps): Promise<LicenseState> {
  const { store } = deps;
  const doFetch = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const url = deps.validateUrl ?? LEMON_SQUEEZY_VALIDATE_URL;

  const trimmed = key.trim();
  if (!trimmed) return { status: "unlicensed" };

  let res: Response;
  try {
    res = await doFetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ license_key: trimmed }).toString(),
    });
  } catch {
    // Network unreachable: fall back to the cached judgment (grace window applies).
    return offlineFallback(store, trimmed, now);
  }

  // A server-side (5xx) error isn't a verdict — lean on the cache like an outage.
  if (res.status >= 500) return offlineFallback(store, trimmed, now);

  let parsed: z.infer<typeof LemonValidateResponseSchema>;
  try {
    parsed = LemonValidateResponseSchema.parse(await res.json());
  } catch {
    return offlineFallback(store, trimmed, now);
  }

  const label = parsed.meta?.customer_name || parsed.meta?.product_name || undefined;
  const cache: LicenseCache = {
    key: trimmed,
    valid: parsed.valid,
    lastCheckedAt: now(),
    status: parsed.license_key?.status ?? undefined,
    ...(label ? { label } : {}),
  };
  store.settings.set(LICENSE_CACHE_KEY, LicenseCacheSchema, cache);

  if (parsed.valid) return { status: "valid", source: "online", cache };
  return {
    status: "invalid",
    reason: parsed.error || parsed.license_key?.status || "The licensing server rejected this key.",
    cache,
  };
}
