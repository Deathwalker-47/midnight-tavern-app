/**
 * Licensing barrel (low-level-plan §M11).
 *
 * Two soft-DRM surfaces the app layer drives on launch and at story-creation time:
 *   • license.ts — validate a pasted key against the merchant API, cache it, 14-day offline grace.
 *   • trial.ts   — 14-day local trial; `resolveEntitlement` folds license + trial into one
 *                  "may this user create a story?" answer.
 */
export {
  validateLicenseKey,
  evaluateCachedLicense,
  readLicenseCache,
  clearLicense,
  LicenseCacheSchema,
  LICENSE_CACHE_KEY,
  OFFLINE_GRACE_MS,
  LEMON_SQUEEZY_VALIDATE_URL,
  type LicenseCache,
  type LicenseState,
  type LicenseDeps,
} from "./license.js";
export {
  startOrGetTrial,
  peekTrial,
  resolveEntitlement,
  TRIAL_START_KEY,
  TRIAL_DURATION_MS,
  type TrialStatus,
  type Entitlement,
} from "./trial.js";
