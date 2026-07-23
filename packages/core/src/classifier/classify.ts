/**
 * Classifier (low-level-plan §M4, D4).
 *
 * `classify` runs the per-story structured call and applies the confidence rule: any
 * intent below CONFIDENCE_THRESHOLD (0.6) is dropped from mechanical resolution and a
 * note is appended to `freeText` so the narrator knows to treat it as pure fiction
 * ("player intent ambiguous; do not resolve mechanically"). The engine only ever sees
 * high-confidence, in-catalog intents.
 *
 * On a hard model failure the orchestrator (§6) treats the turn as narration_only; that
 * fallback lives in the orchestrator, not here — here we surface the ModelOutputError.
 */
import {
  callStructured,
  ModelOutputError,
  ProviderTimeoutError,
  type Router,
} from "../router/index.js";
import type { ClassifiedTurn, MechanicalIntent, StorySchema } from "../types/index.js";
import { matchUniversalAction } from "../config/index.js";
import {
  buildClassifierSchema,
  buildClassifierUser,
  CLASSIFIER_SYSTEM,
  CONFIDENCE_THRESHOLD,
  type ClassifyInput,
} from "./prompt.js";

const AMBIGUITY_NOTE =
  "[note: one or more attempted actions were ambiguous; do not resolve them mechanically]";
const RECOVERY_NOTE =
  "[mechanics unavailable for this turn: narrate conservatively; do not claim any roll, item award, resource change, skill progress, or other mechanical result]";
const UNIVERSAL_RECOVERY_NOTE =
  "[classifier provider unavailable: one unambiguous universal player action was recovered locally; obey its DM ruling and do not invent any additional mechanical result]";

export interface ClassifierRecoveryResult {
  turn: ClassifiedTurn;
  recovered: boolean;
  recovery?: ClassifierRecoveryMetadata;
  /** Legacy/provider error class retained for diagnostics. Prefer `recovery.issues[].kind` in UI. */
  errorKind?: string;
}

export type ClassifierRecoveryKind =
  | "no_content"
  | "invalid_output"
  | "timeout"
  | "low_confidence"
  | "unresolved_action"
  | "unresolved_target"
  | "provider_error";

export interface ClassifierRecoveryIssue {
  kind: ClassifierRecoveryKind;
  message: string;
  /** Whether retrying the classifier with the same persisted player message may resolve it. */
  retryable: boolean;
  /** Number of affected intents when known (currently used for low-confidence demotion). */
  count?: number;
}

export interface ClassifierRecoveryMetadata {
  /**
   * `narration_only` means no mechanical intent survived. `partial_mechanics` means safe,
   * high-confidence intents remain while only ambiguous intents were demoted.
   */
  policy: "narration_only" | "partial_mechanics";
  issues: ClassifierRecoveryIssue[];
}

/** Partition intents into confident (kept) and ambiguous (dropped). */
function filterConfident(intents: MechanicalIntent[]): { kept: MechanicalIntent[]; dropped: number } {
  const kept = intents.filter((i) => i.confidence >= CONFIDENCE_THRESHOLD);
  return { kept, dropped: intents.length - kept.length };
}

interface ClassifiedDetail {
  turn: ClassifiedTurn;
  droppedPlayer: number;
  droppedNpc: number;
}

interface UniversalFallback {
  intent?: MechanicalIntent;
  issue?: ClassifierRecoveryIssue;
}

function normalizePhrase(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function containsPhrase(haystack: string, needle: string): boolean {
  const normalizedNeedle = normalizePhrase(needle);
  return Boolean(
    normalizedNeedle &&
      ` ${normalizePhrase(haystack)} `.includes(` ${normalizedNeedle} `)
  );
}

function actionMatchScore(
  action: StorySchema["actions"][number],
  playerMessage: string
): number {
  let score = 0;
  if (containsPhrase(playerMessage, action.label)) score = Math.max(score, 4);
  if (containsPhrase(playerMessage, action.id)) score = Math.max(score, 4);
  for (const alias of action.aliases ?? []) {
    if (containsPhrase(playerMessage, alias)) {
      score = Math.max(score, 3 + normalizePhrase(alias).split(" ").length);
    }
  }
  return score;
}

function actionNeedsTarget(
  action: StorySchema["actions"][number],
  universalRequiresTarget: boolean
): boolean {
  if (universalRequiresTarget || action.opposed) return true;
  return Object.values(action.effects).some(
    (effect) =>
      effect.resourceDeltaTarget !== undefined ||
      effect.attributeDeltaTarget !== undefined
  );
}

/**
 * Recover one crystal-clear universal action without letting free-form text bypass the sealed
 * catalog. Ambiguous action specializations, actors, and required targets deliberately fail
 * closed and are reported to the UI.
 */
function recoverUniversalPlayerIntent(
  schema: StorySchema,
  input: ClassifyInput
): UniversalFallback {
  const universal = matchUniversalAction(input.playerMessage);
  if (!universal) return {};

  const players = input.presentCharacters.filter((character) => character.isPlayer);
  if (players.length !== 1) {
    return {
      issue: issue(
        "unresolved_target",
        "A universal action was recognized, but the active player character was ambiguous.",
        true
      ),
    };
  }

  const candidates = schema.actions.filter(
    (action) => action.id === universal.id || action.universalFamily === universal.id
  );
  let action = candidates.find((candidate) => candidate.id === universal.id);
  if (!action && candidates.length === 1) action = candidates[0];
  if (!action && candidates.length > 1) {
    const scored = candidates
      .map((candidate) => ({
        candidate,
        score: actionMatchScore(candidate, input.playerMessage),
      }))
      .sort((left, right) => right.score - left.score);
    if (scored[0] && scored[0].score > 0 && scored[0].score > (scored[1]?.score ?? 0)) {
      action = scored[0].candidate;
    }
  }
  if (!action) {
    return {
      issue: issue(
        "unresolved_action",
        `The universal action "${universal.label}" was recognized, but it did not map unambiguously to this story's sealed action catalog.`,
        true
      ),
    };
  }

  const otherCharacters = input.presentCharacters.filter(
    (character) => character.id !== players[0]!.id
  );
  const namedTargets = otherCharacters.filter((character) =>
    containsPhrase(input.playerMessage, character.name)
  );
  const requiresTarget = actionNeedsTarget(action, universal.requiresCharacterTarget);
  const target =
    namedTargets.length === 1
      ? namedTargets[0]
      : namedTargets.length === 0 && requiresTarget && otherCharacters.length === 1
        ? otherCharacters[0]
        : undefined;

  if (requiresTarget && !target) {
    return {
      issue: issue(
        "unresolved_target",
        `The universal action "${universal.label}" requires one unambiguous present character target.`,
        true
      ),
    };
  }

  return {
    intent: {
      actorId: players[0]!.id,
      actionId: action.id,
      ...(target ? { targetId: target.id } : {}),
      confidence: 1,
    },
  };
}

async function classifyDetailed(
  router: Router,
  schema: StorySchema,
  input: ClassifyInput,
  opts?: { maxRepairs?: number; signal?: AbortSignal }
): Promise<ClassifiedDetail> {
  const presentIds = input.presentCharacters.map((c) => c.id);
  const zodSchema = buildClassifierSchema(schema, presentIds);
  const prompt = { system: CLASSIFIER_SYSTEM, user: buildClassifierUser(schema, input) };

  const raw = await callStructured(router, "classifier", prompt, zodSchema, {
    maxRepairs: opts?.maxRepairs ?? 3,
    signal: opts?.signal,
  });

  const player = filterConfident(raw.playerIntents);
  const npc = filterConfident(raw.npcIntents);
  const anyDropped = player.dropped + npc.dropped > 0;

  return {
    turn: {
      playerIntents: player.kept,
      npcIntents: npc.kept,
      freeText: anyDropped
        ? `${raw.freeText}${raw.freeText ? " " : ""}${AMBIGUITY_NOTE}`.trim()
        : raw.freeText,
    },
    droppedPlayer: player.dropped,
    droppedNpc: npc.dropped,
  };
}

/**
 * Classify one player message against the story's catalog. Returns a ClassifiedTurn whose
 * intents are all in-catalog and confident; ambiguous intents are folded into freeText.
 */
export async function classify(
  router: Router,
  schema: StorySchema,
  input: ClassifyInput,
  opts?: { maxRepairs?: number; signal?: AbortSignal }
): Promise<ClassifiedTurn> {
  return (await classifyDetailed(router, schema, input, opts)).turn;
}

function errorKind(error: unknown): string {
  if (error instanceof Error && error.name) return error.name;
  return "ClassifierError";
}

function isCancellation(error: unknown, signal?: AbortSignal): boolean {
  return Boolean(
    signal?.aborted ||
      (error instanceof Error &&
        (error.name === "AbortError" || /abort|cancel/i.test(error.message)))
  );
}

function issue(
  kind: ClassifierRecoveryKind,
  message: string,
  retryable: boolean,
  count?: number
): ClassifierRecoveryIssue {
  return {
    kind,
    message,
    retryable,
    ...(count === undefined ? {} : { count }),
  };
}

function hardFailureIssues(error: unknown): ClassifierRecoveryIssue[] {
  if (
    error instanceof ProviderTimeoutError ||
    (error instanceof Error && /timeout|timed out/i.test(`${error.name} ${error.message}`))
  ) {
    return [issue("timeout", "The classifier request timed out.", true)];
  }

  if (error instanceof ModelOutputError) {
    if (error.lastRaw.trim().length === 0) {
      return [issue("no_content", "The classifier returned no content.", true)];
    }

    const issues: ClassifierRecoveryIssue[] = [];
    if (/(?:playerIntents|npcIntents)\.\d+\.(?:actionId|skillId)\b/i.test(error.lastError)) {
      issues.push(
        issue(
          "unresolved_action",
          "The classifier could not map an attempted action to the sealed action catalog.",
          true
        )
      );
    }
    if (/(?:playerIntents|npcIntents)\.\d+\.(?:actorId|targetId)\b/i.test(error.lastError)) {
      issues.push(
        issue(
          "unresolved_target",
          "The classifier could not map an actor or target to a present story character.",
          true
        )
      );
    }
    if (issues.length > 0) return issues;
    return [issue("invalid_output", "The classifier returned invalid structured output.", true)];
  }

  return [issue("provider_error", "The classifier provider failed.", true)];
}

/**
 * Product-facing classifier entrypoint. A provider returning an empty or malformed body is
 * already repaired by `callStructured`; if every repair is exhausted, this converts the turn to a
 * typed narration-only recovery instead of leaving a persisted player message and a stuck UI.
 * Cancellation is never swallowed.
 */
export async function classifyWithRecovery(
  router: Router,
  schema: StorySchema,
  input: ClassifyInput,
  opts?: { maxRepairs?: number; signal?: AbortSignal }
): Promise<ClassifierRecoveryResult> {
  try {
    const detail = await classifyDetailed(router, schema, input, opts);
    const universalFallback =
      detail.turn.playerIntents.length === 0
        ? recoverUniversalPlayerIntent(schema, input)
        : {};
    if (universalFallback.intent) {
      detail.turn.playerIntents = [universalFallback.intent];
    }
    const dropped = detail.droppedPlayer + detail.droppedNpc;
    if (dropped > 0) {
      const surviving =
        detail.turn.playerIntents.length + detail.turn.npcIntents.length;
      return {
        turn: detail.turn,
        recovered: true,
        recovery: {
          policy: surviving > 0 ? "partial_mechanics" : "narration_only",
          issues: [
            issue(
              "low_confidence",
              `${dropped} classifier intent${dropped === 1 ? " was" : "s were"} below the confidence threshold and demoted to narration.`,
              false,
              dropped
            ),
          ],
        },
      };
    }
    if (universalFallback.issue) {
      return {
        turn: detail.turn,
        recovered: true,
        recovery: {
          policy: "narration_only",
          issues: [universalFallback.issue],
        },
      };
    }
    return {
      turn: detail.turn,
      recovered: false,
    };
  } catch (error) {
    if (isCancellation(error, opts?.signal)) throw error;
    const issues = hardFailureIssues(error);
    const universalFallback = recoverUniversalPlayerIntent(schema, input);
    if (universalFallback.issue) issues.push(universalFallback.issue);
    return {
      turn: {
        playerIntents: universalFallback.intent ? [universalFallback.intent] : [],
        npcIntents: [],
        freeText: universalFallback.intent ? UNIVERSAL_RECOVERY_NOTE : RECOVERY_NOTE,
      },
      recovered: true,
      recovery: {
        policy: universalFallback.intent ? "partial_mechanics" : "narration_only",
        issues,
      },
      errorKind: errorKind(error),
    };
  }
}
