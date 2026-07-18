/**
 * Bootstrap repair helpers (low-level-plan §M5.1–2).
 *
 * Two jobs, both feeding the generation loop in `generate.ts`:
 *  1. `formatValidationFeedback` turns the cross-validator's error list into the exact
 *     instruction block the model sees on a repair pass.
 *  2. `deterministicRepair` fixes the class of problems we can fix WITHOUT a model call —
 *     right now, clamping out-of-range DCs onto the 5–25 scale. Cheap deterministic fixes
 *     first means fewer (sometimes zero) model round-trips, and they can never make a
 *     schema worse because they only move already-present values into the legal range.
 */
import { DC_MIN, DC_MAX, type StorySchema } from "../types/index.js";

/** Render the validator's errors as a numbered fix-list for the repair prompt. */
export function formatValidationFeedback(errors: string[]): string {
  return (
    "The previous Phase B output failed validation. Fix ALL of these and regenerate:\n" +
    errors.map((e) => `- ${e}`).join("\n")
  );
}

/**
 * Apply the deterministic, always-safe fixes to a candidate schema, returning a new schema
 * (the input is not mutated). Currently: clamp every action DC into [DC_MIN, DC_MAX].
 */
export function deterministicRepair(schema: StorySchema): StorySchema {
  const actions = schema.actions.map((a) => {
    const dc = Math.max(DC_MIN, Math.min(DC_MAX, Math.round(a.dc)));
    return dc === a.dc ? a : { ...a, dc };
  });
  return { ...schema, actions };
}
