/**
 * Local, opt-in diagnostic counters (Plan 11 / W-10).
 *
 * A flat integer map. `countersForTurn` is a PURE fold from one turn's already-computed outputs to
 * a delta map — it performs no I/O, imports no store, and is therefore testable in isolation and
 * safe on the webview path. Persistence and the opt-in gate live in the app layer, not here.
 *
 * Counter keys are dotted and stable. `total ÷ runs` gives mean stage latency; keeping only sums
 * avoids shipping a histogram for a developer panel.
 */
import { z } from "zod";
import type { GateVerdict, Ruling } from "../types/index.js";
import type { StageMetric } from "../orchestrator/stagePolicy.js";

/** Hard cap so a bug can never grow the map without bound; the closed key set is far below it. */
export const MAX_DIAGNOSTIC_COUNTERS = 64;

export const DiagnosticCountersSchema = z
  .record(z.string().min(1), z.number().int().nonnegative())
  .refine((map) => Object.keys(map).length <= MAX_DIAGNOSTIC_COUNTERS, {
    message: `A diagnostic counter set may hold at most ${MAX_DIAGNOSTIC_COUNTERS} keys.`,
  });
export type DiagnosticCounters = z.infer<typeof DiagnosticCountersSchema>;

export const DIAGNOSTIC_COUNTERS_SETTING_KEY = "diagnosticCounters";
export const DIAGNOSTICS_ENABLED_SETTING_KEY = "diagnosticsEnabled";

export const EMPTY_DIAGNOSTIC_COUNTERS: DiagnosticCounters = Object.freeze({});

export interface TurnCounterInput {
  /** Only `gate` is read; the parameter is widened so callers may pass full rulings. */
  rulings: readonly Pick<Ruling, "gate">[] | readonly { gate: GateVerdict }[];
  stageMetrics: readonly StageMetric[];
  classifierRecovered: boolean;
  usedNarratorFallback: boolean;
  /** `GuardedNarrationResult.repairCount` — how many drafts the authority auditor rejected. */
  narratorRepairCount: number;
}

/** Pure: one turn's outputs → counter deltas. Never throws. */
export function countersForTurn(input: TurnCounterInput): DiagnosticCounters {
  const deltas: Record<string, number> = { "turn.completed": 1 };
  const bump = (key: string, by = 1): void => {
    deltas[key] = (deltas[key] ?? 0) + by;
  };

  for (const { gate } of input.rulings) {
    if (gate.allowed) bump("gate.allowed");
    else bump(`gate.denied.${gate.code ?? "unspecified"}`);
  }
  for (const metric of input.stageMetrics) {
    bump(`stage.runs.${metric.stage}`);
    bump(`stage.durationMs.${metric.stage}`, Math.round(metric.durationMs));
    if (metric.outcome === "fallback" || metric.outcome === "error") {
      bump(`stage.${metric.outcome}.${metric.stage}.${metric.cause ?? "error"}`);
    }
  }
  if (input.classifierRecovered) bump("classifier.recovered");
  if (input.usedNarratorFallback) bump("authorityGuard.safeSummaryUsed");
  if (input.narratorRepairCount > 0)
    bump("authorityGuard.draftRejected", input.narratorRepairCount);
  return deltas;
}

/** Pure: add `deltas` onto `base`, returning a new map. Neither input is mutated. */
export function mergeCounters(
  base: DiagnosticCounters,
  deltas: DiagnosticCounters
): DiagnosticCounters {
  const merged: Record<string, number> = { ...base };
  for (const [key, value] of Object.entries(deltas)) {
    merged[key] = (merged[key] ?? 0) + value;
  }
  return merged;
}
