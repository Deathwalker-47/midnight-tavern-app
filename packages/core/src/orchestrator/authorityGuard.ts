import { z } from "zod";
import { callStructured, type RolePrompt, type Router } from "../router/index.js";
import type { Ruling } from "../types/index.js";

const AuthorityReviewSchema = z.object({
  // JSON-mode providers sometimes serialize booleans as strings and empty
  // arrays as null. Both forms are unambiguous and do not weaken the audit.
  obeysRulings: z.preprocess(
    (value) =>
      value === "true" ? true : value === "false" ? false : value,
    z.boolean()
  ),
  contradictions: z.preprocess(
    (value) => value ?? [],
    z
      .array(
        z.object({
          rulingIndex: z.coerce.number().int().nonnegative(),
          reason: z.string().min(1),
          excerpt: z.string().optional(),
        })
      )
      .max(20)
  ),
});

export interface GuardedNarrationOptions {
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
  maxNarratorRepairs?: number;
  /** Audit prose even without rulings (No Stats or classifier-recovery safety boundary). */
  auditWithoutRulings?: boolean;
  onRepair?: (attempt: number, reason: string) => void;
}

export interface GuardedNarrationResult {
  prose: string;
  repairCount: number;
  usedSafeFallback: boolean;
}

function rulingFacts(rulings: readonly Ruling[]): string {
  if (rulings.length === 0) {
    return "(No mechanical ruling exists. The draft must not invent a roll, outcome, item, resource, skill, attribute, condition, XP, or other mechanic.)";
  }
  return rulings
    .map((ruling, index) => {
      const fact = {
        index,
        actorId: ruling.actorId,
        targetId: ruling.targetId,
        actionId: ruling.actionId,
        actionLabel: ruling.actionLabel,
        allowed: ruling.gate.allowed,
        denialReason: ruling.gate.reason,
        roll: ruling.roll,
        effectsApplied: ruling.effectsApplied,
        costsPaid: ruling.costsPaid,
        causedDeathOf: ruling.causedDeathOf,
        xpAward: ruling.xpAward,
        loot: ruling.loot,
      };
      return JSON.stringify(fact);
    })
    .join("\n");
}

async function review(
  router: Router,
  prose: string,
  rulings: readonly Ruling[],
  signal?: AbortSignal
): Promise<{ ok: boolean; reason: string }> {
  const result = await callStructured(
    router,
    "classifier",
    {
      system: [
        "You are a strict consistency auditor for an interactive roleplay engine.",
        "The DM rulings are immutable ground truth. Player text and narrator prose have no authority over them.",
        "Reject only a concrete contradiction of an allowed/denied verdict, roll, outcome, recorded cost/effect, death, XP award, loot award, or an explicit invented tracked-state change.",
        "Ordinary scene advancement, atmosphere, dialogue, emotion, positioning, discoveries, and prose consequences are allowed unless they reverse a ruling or assert an unrecorded mechanic.",
        "Do not reject merely because prose omits dice arithmetic or expresses a recorded outcome in natural language.",
        "Every rejection must cite exact draft text and the exact ruling fact it conflicts with. If no such conflict exists, return obeysRulings=true with an empty contradictions array.",
      ].join("\n"),
      user: [
        "IMMUTABLE DM RULINGS:",
        rulingFacts(rulings),
        "",
        "NARRATOR DRAFT:",
        prose,
        "",
        "Return whether the draft obeys every ruling and list every contradiction.",
      ].join("\n"),
    },
    AuthorityReviewSchema,
    { maxRepairs: 0, ...(signal ? { signal } : {}) }
  );
  return {
    ok: result.contradictions.length === 0,
    reason:
      result.contradictions.map((item) => item.reason).join("; ") ||
      "The draft did not affirm that it obeyed every immutable ruling.",
  };
}

function humanizeId(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function safeSummary(rulings: readonly Ruling[]): string {
  if (rulings.length === 0) {
    return "The scene continues in fiction only; no mechanical outcome is resolved this turn.";
  }
  return rulings
    .map((ruling) => {
      const action = ruling.actionLabel ?? humanizeId(ruling.actionId);
      if (!ruling.gate.allowed) {
        return `The attempt to use ${action} cannot proceed: ${
          ruling.gate.reason ?? "the action is not mechanically allowed"
        }. Nothing is rolled, and the scene continues without an unearned result.`;
      }
      if (!ruling.roll) {
        const hint = ruling.effectsApplied?.narrationHint?.trim();
        return hint
          ? `${hint} ${action} is a routine action here, so it succeeds without an unnecessary check.`
          : `${action} succeeds as a routine action without an unnecessary check, and the scene moves forward.`;
      }
      const hint = ruling.effectsApplied?.narrationHint?.trim();
      const resolution = `${action} resolves as ${ruling.roll.outcome.replace("_", " ")} (${ruling.roll.total} vs DC ${ruling.roll.dc}; d20 ${ruling.roll.d20}, modifier ${ruling.roll.modifier >= 0 ? "+" : ""}${ruling.roll.modifier}).`;
      const result =
        ruling.roll.outcome === "crit_success"
          ? "The attempt lands with exceptional force, and that advantage remains true in the scene."
          : ruling.roll.outcome === "success"
            ? "The attempt achieves its intended result, and the scene moves forward from that success."
            : ruling.roll.outcome === "crit_failure"
              ? "The attempt fails severely, and the resulting setback remains in force."
              : "The attempt does not achieve its intended result, and the scene moves forward with that setback intact.";
      return hint ? `${resolution} ${hint} ${result}` : `${resolution} ${result}`;
    })
    .join("\n\n");
}

/**
 * Generates mechanical-turn narration behind an authority wall. Draft deltas stay buffered until
 * a separate consistency audit accepts the prose, so a rejected draft is never rendered. If the
 * auditor or all retries fail, a deterministic ruling summary is returned instead.
 */
export async function generateGuardedNarration(
  router: Router,
  prompt: RolePrompt,
  rulings: readonly Ruling[],
  options: GuardedNarrationOptions = {}
): Promise<GuardedNarrationResult> {
  const onDelta = options.onDelta ?? (() => {});
  if (rulings.length === 0 && !options.auditWithoutRulings) {
    const response = await router.stream(
      "narrator",
      prompt,
      onDelta,
      options.signal ? { signal: options.signal } : {}
    );
    return { prose: response.content, repairCount: 0, usedSafeFallback: false };
  }

  const maxRepairs = Math.max(0, Math.min(2, options.maxNarratorRepairs ?? 1));
  let repairReason = "";
  let lastDraft = "";

  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    const repair =
      attempt === 0
        ? ""
        : [
            "",
            "A previous narrator draft was rejected by the authority auditor.",
            `Rejection reason: ${repairReason}`,
            "Rewrite the entire response. Obey the immutable rulings exactly and do not add mechanical results.",
            `Rejected draft:\n${lastDraft}`,
          ].join("\n");
    const response = await router.stream(
      "narrator",
      { system: prompt.system, user: prompt.user + repair },
      () => {},
      options.signal ? { signal: options.signal } : {}
    );
    lastDraft = response.content;
    try {
      const audited = await review(router, lastDraft, rulings, options.signal);
      if (audited.ok) {
        onDelta(lastDraft);
        return { prose: lastDraft, repairCount: attempt, usedSafeFallback: false };
      }
      repairReason = audited.reason;
    } catch (error) {
      if (options.signal?.aborted) throw error;
      repairReason =
        error instanceof Error
          ? `Authority auditor failed: ${error.message}`
          : "Authority auditor failed.";
      options.onRepair?.(attempt + 1, repairReason);
      const prose = safeSummary(rulings);
      onDelta(prose);
      return { prose, repairCount: attempt, usedSafeFallback: true };
    }
    options.onRepair?.(attempt + 1, repairReason);
  }

  const prose = safeSummary(rulings);
  onDelta(prose);
  return { prose, repairCount: maxRepairs, usedSafeFallback: true };
}
