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

function sentence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const capitalized = trimmed[0]!.toLocaleUpperCase("en-US") + trimmed.slice(1);
  return /[.!?…]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

function safeSummary(rulings: readonly Ruling[]): string {
  if (rulings.length === 0) {
    return "For a breath, the scene holds—then the moment moves on.";
  }
  const beats = rulings
    .map((ruling) => {
      const action = ruling.actionLabel ?? humanizeId(ruling.actionId);
      if (!ruling.gate.allowed) {
        return sentence(
          ruling.gate.reason
            ? `${action} cannot begin; ${ruling.gate.reason}`
            : `${action} cannot begin, and the moment slips away`
        );
      }
      const hint = ruling.effectsApplied?.narrationHint?.trim();
      if (!ruling.roll) {
        return hint
          ? sentence(hint)
          : sentence(`${action} carries through without resistance`);
      }
      if (hint) return sentence(hint);
      if (ruling.roll.outcome === "crit_success") {
        return sentence(`${action} lands with sudden, decisive force`);
      }
      if (ruling.roll.outcome === "success") return sentence(`${action} finds its mark`);
      if (ruling.roll.outcome === "crit_failure") {
        return sentence(`${action} goes badly awry, leaving a costly opening`);
      }
      return sentence(`${action} falters before it can achieve its aim`);
    })
    .filter(Boolean);
  return [...new Set(beats)].join("\n\n");
}

/**
 * Conservative deterministic check: does this prose beat assert a game mechanic (roll, DC, outcome,
 * damage, death, XP, loot, tier, attribute/skill/stat change)? A beat that asserts none cannot
 * contradict a mechanical ruling, so it is safe to show before the full authority audit. We err
 * toward "yes" (hold) — a false positive only delays a beat; a false negative could leak an
 * unaudited mechanic, which must never happen.
 */
const MECHANICAL_VOCAB =
  /\b(d20|dc\b|dc\d|rolls?|rolled|rolling|dice|modifiers?|crit(ical)?s?|\bxp\b|experience\s+points?|levels?\s*up|levell?ed\s*up|hit\s*points?|\bhp\b|loot|award(s|ed|ing)?|damage|damages|success(es|ful)?|failures?|\bdies?\b|killed|\bdeath\b|wounds?|wounded|attributes?|\bskills?\b|\bstats?\b|checks?|common|uncommon|rare|legendary|mythical)\b/i;

function assertsMechanic(paragraph: string): boolean {
  return MECHANICAL_VOCAB.test(paragraph);
}

const DEATH_ASSERTION =
  /\b(?:kill(?:ed|s)?|slay(?:s|ing|ed)?|dies?|falls?\s+dead|is\s+dead|lifeless\s+corpse)\b/i;

function deterministicContradiction(
  prose: string,
  rulings: readonly Ruling[]
): string | undefined {
  const recordedDeaths = rulings.flatMap((ruling) => ruling.causedDeathOf ?? []);
  if (recordedDeaths.length === 0 && DEATH_ASSERTION.test(prose)) {
    return "The draft declares a death, but no ruling reduced a lethal resource to zero.";
  }
  return undefined;
}

/**
 * Generates mechanical-turn narration behind an authority wall. Prose is released progressively:
 * each complete paragraph that asserts no mechanic is shown as soon as it streams (it cannot
 * contradict a ruling), while the first mechanical paragraph and everything after it stay buffered
 * until a separate consistency audit accepts the whole draft. A rejected mechanical remainder is
 * replaced by a deterministic ruling summary and never rendered. If the auditor or all retries
 * fail, the deterministic summary stands in.
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

  // Progressive verified release, on the first (streaming) attempt only. As paragraphs stream in,
  // each complete paragraph that asserts no mechanic is released immediately; the first mechanical
  // paragraph (and everything after it) is held for the whole-draft audit. `releasedLen` tracks how
  // many characters of the draft have already reached the UI.
  let streamed = "";
  let releasedLen = 0;
  let holding = false;
  const releaseSafeParagraphs = (): void => {
    if (holding) return;
    for (;;) {
      const boundary = streamed.indexOf("\n\n", releasedLen);
      if (boundary === -1) break;
      const paragraph = streamed.slice(releasedLen, boundary);
      if (assertsMechanic(paragraph)) {
        holding = true;
        break;
      }
      onDelta(streamed.slice(releasedLen, boundary + 2));
      releasedLen = boundary + 2;
    }
  };

  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    const streaming = attempt === 0;
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
      streaming
        ? (delta: string) => {
            streamed += delta;
            releaseSafeParagraphs();
          }
        : () => {},
      options.signal ? { signal: options.signal } : {}
    );
    lastDraft = response.content;
    // What we have already shown, but only if it is genuinely a prefix of the final draft (real
    // providers return content === concat(deltas); this guards the defensive case).
    const releasedPrefix =
      releasedLen > 0 && lastDraft.startsWith(streamed.slice(0, releasedLen))
        ? lastDraft.slice(0, releasedLen)
        : "";

    try {
      const deterministicReason = deterministicContradiction(lastDraft, rulings);
      const audited = deterministicReason
        ? { ok: false, reason: deterministicReason }
        : await review(router, lastDraft, rulings, options.signal);
      if (audited.ok) {
        onDelta(releasedPrefix ? lastDraft.slice(releasedPrefix.length) : lastDraft);
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
      const summary = safeSummary(rulings);
      onDelta(summary);
      return { prose: releasedPrefix + summary, repairCount: attempt, usedSafeFallback: true };
    }

    options.onRepair?.(attempt + 1, repairReason);
    // If safe prose is already on screen we cannot regenerate a conflicting replacement for it, so
    // replace only the held mechanical remainder with the deterministic summary and stop.
    if (releasedPrefix) {
      const summary = safeSummary(rulings);
      onDelta(summary);
      return { prose: releasedPrefix + summary, repairCount: attempt, usedSafeFallback: true };
    }
  }

  const prose = safeSummary(rulings);
  onDelta(prose);
  return { prose, repairCount: maxRepairs, usedSafeFallback: true };
}
