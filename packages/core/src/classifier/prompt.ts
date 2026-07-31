/**
 * Classifier prompt + per-story schema (low-level-plan §M4, §8.2, D4).
 *
 * The heart of the gate's reliability: `buildClassifierSchema` produces a Zod schema whose
 * `actionId` is a LITERAL ENUM of this story's catalog ids (plus `learn_skill`). The
 * classifier physically cannot name an action that doesn't exist — an out-of-catalog id
 * fails validation and triggers a repair, so the engine only ever sees real actions.
 *
 * The prompt (§8.2) hands the model the catalog (id/label/category/requiresSkill), the
 * present character ids, the player message, and the last two narrator messages (so it can
 * extract NPC intents the fiction commits to — D7).
 */
import { z, type ZodType } from "zod";
import { LEARN_SKILL_ACTION_ID, type StorySchema } from "../types/index.js";
import type { ClassifiedTurn } from "../types/index.js";

/** Below this confidence, an intent is demoted to narration (D4). */
export const CONFIDENCE_THRESHOLD = 0.6;

/** Present character, as the classifier is told about them. */
export interface PresentCharacter {
  id: string;
  name: string;
  isPlayer: boolean;
}

/** Inputs for one classification. */
export interface ClassifyInput {
  playerMessage: string;
  presentCharacters: PresentCharacter[];
  /** Most recent narrator messages, oldest→newest; the last two are used. */
  recentNarration: string[];
  /** Engine-validated prior target focus; local recovery may use it only for continuation wording. */
  recentTargetId?: string;
}

/**
 * Build the per-story classifier output schema. `actionId` is constrained to the story's
 * catalog ids plus `learn_skill`; `actorId`/`targetId` to the present character ids. This
 * is what makes the classifier unable to emit an unknown action or actor.
 */
export function buildClassifierSchema(
  schema: StorySchema,
  presentCharacterIds: string[]
): ZodType<ClassifiedTurn> {
  const actionIds = [...schema.actions.map((a) => a.id), LEARN_SKILL_ACTION_ID];
  const skillIds = schema.skills.map((s) => s.id);
  const trimString = (value: unknown) =>
    typeof value === "string" ? value.trim() : value;
  const normalizeOptional = (value: unknown) => {
    const normalized = trimString(value);
    return normalized === null || normalized === "" ? undefined : normalized;
  };
  const normalizeConfidence = (value: unknown) =>
    typeof value === "string" && value.trim() !== ""
      ? Number(value)
      : value;

  // z.enum needs a non-empty tuple; fall back to z.string() only if a story somehow has
  // no actions (the bootstrapper guarantees ≥20, so this is a guard, not a live path).
  const actionId =
    actionIds.length > 0
      ? z.preprocess(trimString, z.enum(actionIds as [string, ...string[]]))
      : z.preprocess(trimString, z.string());
  const actorId =
    presentCharacterIds.length > 0
      ? z.preprocess(trimString, z.enum(presentCharacterIds as [string, ...string[]]))
      : z.preprocess(trimString, z.string());
  const skillId =
    skillIds.length > 0
      ? z.preprocess(trimString, z.enum(skillIds as [string, ...string[]]))
      : z.preprocess(trimString, z.string());

  const intent = z
    .object({
      actorId,
      actionId,
      // OpenAI-compatible JSON-mode models commonly emit null for an optional field.
      // Null/empty means "not supplied"; identifiers are still validated against the
      // sealed enums after normalization, so this does not broaden mechanical authority.
      targetId: z.preprocess(normalizeOptional, actorId.optional()),
      itemId: z.preprocess(normalizeOptional, z.string().optional()),
      skillId: z.preprocess(normalizeOptional, skillId.optional()),
      stakes: z
        .preprocess(
          normalizeOptional,
          z
            .enum(["none", "uncertain", "danger", "opposed", "time_pressure", "scarcity"])
            .optional()
        )
        .transform((value) => value ?? "none"),
      stakesReason: z.preprocess(normalizeOptional, z.string().max(240).optional()),
      confidence: z.preprocess(normalizeConfidence, z.number().min(0).max(1)),
    })
    .transform(({ targetId, itemId, skillId: parsedSkillId, stakesReason, ...required }) => ({
      ...required,
      ...(targetId ? { targetId } : {}),
      ...(itemId ? { itemId } : {}),
      ...(parsedSkillId ? { skillId: parsedSkillId } : {}),
      ...(stakesReason ? { stakesReason } : {}),
    }));

  return z.object({
    // Missing/null containers have an unambiguous conservative meaning. Defaulting
    // them avoids repeated provider repairs while never creating a mechanical intent.
    playerIntents: z.preprocess((value) => value ?? [], z.array(intent)),
    npcIntents: z.preprocess((value) => value ?? [], z.array(intent)),
    freeText: z.preprocess((value) => value ?? "", z.string()),
  }) as unknown as ZodType<ClassifiedTurn>;
}

/** Render the catalog as compact lines the model can map against. */
function renderCatalog(schema: StorySchema): string {
  const lines = schema.actions.map((a) => {
    const parts = [`${a.id} [${a.category}]`, a.label];
    if (a.description) parts.push(`means:${a.description}`);
    if (a.aliases?.length) parts.push(`aliases:${a.aliases.join(", ")}`);
    if (a.universalFamily) parts.push(`universal:${a.universalFamily}`);
    if (a.requiresSkill) parts.push(`requires:${a.requiresSkill}`);
    return "- " + parts.join(" · ");
  });
  lines.push(`- ${LEARN_SKILL_ACTION_ID} [utility] Learn a new skill (set skillId)`);
  return lines.join("\n");
}

/** The static classifier system instruction (§8.2). */
export const CLASSIFIER_SYSTEM = [
  "You are the mechanical intent classifier for a roleplay engine.",
  "Map the player's message onto zero or more actions from the provided catalog.",
  "Rules:",
  "- Use ONLY action ids from the catalog. Never invent an id.",
  "- Match by meaning and aliases, not merely exact wording. A concrete attack such as a knife lunge maps to the closest valid attack action.",
  "- Prefer narration (empty intents) over guessing. If no clear mechanical action is attempted, return empty playerIntents.",
  "- Dialogue, thoughts, ordinary prayer, routine maintenance, safe travel, and atmospheric gestures are narration, not mechanical intents, unless the player seeks a tracked change or faces a concrete obstacle.",
  "- For every intent set stakes to one of: none, uncertain, danger, opposed, time_pressure, scarcity.",
  "- Use stakes=none for an unopposed routine action with no concrete risk. Future or atmospheric danger alone does not create stakes.",
  "- Use non-none stakes only when the current attempt faces a specific obstacle, active opposition, immediate danger, deadline, or scarce resource; briefly explain it in stakesReason.",
  "- Attacks and active deception always have concrete stakes.",
  "- Extract npcIntents ONLY when the recent narration clearly commits an NPC to a catalog action.",
  "- Every playerIntent actorId MUST be the one present character marked isPlayer=true. Never assign the player's words to an NPC.",
  "- Set confidence honestly in [0,1]. Use < 0.6 when the mapping is uncertain.",
  "- actorId and targetId must be ids of present characters.",
  "- itemId is the item used, if any. For learn_skill, set skillId.",
  "- freeText carries any residual narration content (may be empty).",
].join("\n");

/** Build the user prompt for one classification. */
export function buildClassifierUser(schema: StorySchema, input: ClassifyInput): string {
  const present = input.presentCharacters
    .map((c) => `${c.id} (${c.name}${c.isPlayer ? ", player" : ""})`)
    .join(", ");
  const lastTwo = input.recentNarration.slice(-2);
  const narration =
    lastTwo.length > 0 ? lastTwo.map((t, i) => `[${i + 1}] ${t}`).join("\n") : "(none)";

  return [
    "ACTION CATALOG:",
    renderCatalog(schema),
    "",
    `PRESENT CHARACTERS: ${present || "(none)"}`,
    "",
    "RECENT NARRATION (for NPC intent extraction):",
    narration,
    "",
    "PLAYER MESSAGE:",
    input.playerMessage,
    "",
    "Return a ClassifiedTurn JSON object with playerIntents, npcIntents, and freeText. Every intent must include stakes.",
  ].join("\n");
}
