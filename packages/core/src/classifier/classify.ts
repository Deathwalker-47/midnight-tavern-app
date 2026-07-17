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
import { callStructured, type Router } from "../router/index.js";
import type { ClassifiedTurn, MechanicalIntent, StorySchema } from "../types/index.js";
import {
  buildClassifierSchema,
  buildClassifierUser,
  CLASSIFIER_SYSTEM,
  CONFIDENCE_THRESHOLD,
  type ClassifyInput,
} from "./prompt.js";

const AMBIGUITY_NOTE =
  "[note: one or more attempted actions were ambiguous; do not resolve them mechanically]";

/** Partition intents into confident (kept) and ambiguous (dropped). */
function filterConfident(intents: MechanicalIntent[]): { kept: MechanicalIntent[]; dropped: number } {
  const kept = intents.filter((i) => i.confidence >= CONFIDENCE_THRESHOLD);
  return { kept, dropped: intents.length - kept.length };
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
    playerIntents: player.kept,
    npcIntents: npc.kept,
    freeText: anyDropped
      ? `${raw.freeText}${raw.freeText ? " " : ""}${AMBIGUITY_NOTE}`.trim()
      : raw.freeText,
  };
}
