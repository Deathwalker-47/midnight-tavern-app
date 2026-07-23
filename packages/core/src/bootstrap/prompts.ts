/**
 * Bootstrapper prompt contracts (low-level-plan §8.5, §2.2).
 *
 * The Phase A prompt defines the world shape. Phase B is split into a compact foundation
 * request and bounded action batches so provider output ceilings cannot truncate the full
 * catalog. User prompts carry the prior phase output and cross-validation feedback.
 */
import {
  CATALOG_MIN_ACTIONS,
  DC_MIN,
  DC_MAX,
} from "../types/index.js";
import type { PhaseA } from "./generate.js";
import type { StatMode } from "../types/index.js";

/** Phase A: define the world's stat mode, resources, tiers, and skills. */
export const PHASE_A_SYSTEM = [
  "You are the story bootstrapper for a d20 roleplay engine. This is PHASE A of two.",
  "From the premise, design the world's numeric and skill shape ONLY. Output JSON with:",
  "- statMode: exactly \"none\" or \"full\". Never emit \"light\".",
  "- attributes: for full, generally 3-6 genre-specific entries with id, name, abbrev,",
  "  description, and defaultScore (ordinary scores 8-16, absolute band 1-30). For none, [].",
  "- resources: numeric bars (id, label, start, max, playerVisible, optional regenPerScene,",
  "  optional lethal). When statMode is not \"none\", EXACTLY ONE resource must have",
  "  lethal:true (reaching 0 kills the character) — typically health/hp.",
  "- tiers: rarity/power bands (id, label, minProgress) from common to legendary.",
  "- skills: learnable abilities (id, name, description, tier, prerequisites[], unlockPaths[],",
  "  masteryAdvance{successesPerRank}). Every skill you define WILL need at least one action",
  "  that uses it in Phase B, so do not over-produce skills.",
  "  Every unlockPaths entry MUST use exactly one of these JSON shapes:",
  '  {"method":"trainer","npcHint":"who teaches it","cost":{"resources":{"resource_id":2}}}',
  '  {"method":"manual","itemId":"item_id"}',
  '  {"method":"trial","flagId":"flag_id"}',
  "  Trainer cost is ALWAYS an object. Never use a bare number or string for cost; use {} for no cost.",
  "Keep ids lowercase snake_case. Design 4–8 skills and 3–5 tiers. Keep descriptions concise.",
].join("\n");

/**
 * Builds the Phase A user prompt.
 *
 * @param premise - User-authored story premise.
 * @returns Prompt containing the premise and Phase A request.
 */
export function buildPhaseAUser(premise: string, statMode?: StatMode): string {
  return [
    "PREMISE:",
    premise,
    "",
    ...(statMode ? [`USER-SELECTED STAT SYSTEM: ${statMode}. This value is mandatory.`] : []),
    "Design Phase A (statMode, attributes, resources, tiers, skills).",
  ].join("\n");
}

/** Phase B foundation: the compact item and actor layer, without the action catalog. */
export const PHASE_B_FOUNDATION_SYSTEM = [
  "You are the story bootstrapper for a d20 roleplay engine. This is PHASE B FOUNDATION.",
  "Output one JSON object containing ONLY items, startingState, and npcTemplates.",
  "- items: 8-12 concise equipment/consumables with id, name, description, kind, tier,",
  '  optional requiresSkill, and a numeric props map such as {"damage":6}.',
  "- startingState: resources map, skills array, and inventory array.",
  "  It also includes attributes, assigning every Phase A attribute a score in 1-30.",
  "- npcTemplates: 2-4 key NPCs with templateId, name, attributes, resources, skills, and inventory.",
  'Every skill grant is {"skillId":"existing_skill_id","rank":"novice"}.',
  'Every inventory entry is {"itemId":"existing_item_id","qty":1}.',
  "Use only Phase A resource and skill ids. Inventory item ids must exist in your items array.",
  "Keep ids lowercase snake_case and descriptions concise. Do not output actions in this call.",
].join("\n");

/** Phase B action batch: a bounded subset of the otherwise oversized action catalog. */
export const PHASE_B_ACTION_BATCH_SYSTEM = [
  "You are the story bootstrapper for a d20 roleplay engine. This is PHASE B ACTION BATCH.",
  'Output one JSON object with exactly one key: {"actions":[...]}.',
  `For EACH requested category, output exactly ${CATALOG_MIN_ACTIONS / 5} concise actions and no other categories.`,
  `Every dc is an integer within ${DC_MIN}-${DC_MAX}.`,
  "Every action has effects for crit_success, success, failure, and crit_failure.",
  "Every EffectSpec has a narrationHint of 12 words or fewer.",
  "requiresSkill must be a Phase A skill id; requiresItemKind is optional.",
  "governingAttribute should be a Phase A attribute id for capability-based actions; omit only for flat luck.",
  "Resource deltas/costs use Phase A resource ids. Item costs/grants use foundation item ids.",
  'Every item cost/grant is {"itemId":"existing_item_id","qty":1}.',
  "Prefix every action id with its category so ids remain unique across batches.",
  "Use every REQUIRED SKILL ID at least once and set every REQUIRED TRIAL FLAG at least once.",
].join("\n");

/**
 * Builds the compact Phase B foundation request.
 *
 * @param premise - User-authored story premise.
 * @param phaseA - Validated world-shape output.
 * @param feedback - Cross-validation failures from a prior pass.
 * @returns Prompt for items, starting state, and NPC templates.
 */
export function buildPhaseBFoundationUser(premise: string, phaseA: PhaseA, feedback: string): string {
  const parts = [
    "PREMISE:",
    premise,
    "",
    "PHASE A OUTPUT (build on exactly these ids):",
    JSON.stringify(phaseA),
    "",
    "Design items, startingState, and npcTemplates only.",
  ];
  if (feedback) parts.push("", feedback);
  return parts.join("\n");
}

/**
 * Builds one bounded action-catalog request.
 *
 * @param premise - User-authored story premise.
 * @param phaseA - Validated world-shape output.
 * @param foundation - Validated item and actor foundation.
 * @param categories - Action categories assigned to this batch.
 * @param requiredSkillIds - Skills not yet covered by an earlier batch.
 * @param requiredTrialFlags - Trial flags not yet set by an earlier batch.
 * @param feedback - Cross-validation failures from a prior pass.
 * @returns Prompt for a bounded action subset.
 */
export function buildPhaseBActionBatchUser(
  premise: string,
  phaseA: PhaseA,
  foundation: unknown,
  categories: readonly string[],
  requiredSkillIds: readonly string[],
  requiredTrialFlags: readonly string[],
  feedback: string
): string {
  const parts = [
    "PREMISE:",
    premise,
    "",
    "PHASE A OUTPUT:",
    JSON.stringify(phaseA),
    "",
    "PHASE B FOUNDATION:",
    JSON.stringify(foundation),
    "",
    `REQUESTED CATEGORIES: ${categories.join(", ")}`,
    `REQUIRED SKILL IDS: ${requiredSkillIds.join(", ") || "none"}`,
    `REQUIRED TRIAL FLAGS: ${requiredTrialFlags.join(", ") || "none"}`,
  ];
  if (feedback) parts.push("", feedback);
  return parts.join("\n");
}
