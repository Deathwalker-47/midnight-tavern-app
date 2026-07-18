/**
 * Bootstrapper prompt contracts (low-level-plan §8.5, §2.2).
 *
 * The two phase prompts. Each states the §2.2 catalog constraints explicitly and embeds a
 * one-per-category example so the model has a concrete target shape. The user prompts carry
 * the premise (Phase A) and the Phase A output (Phase B), plus any cross-validation
 * feedback the repair loop injects.
 */
import {
  CATALOG_MIN_ACTIONS,
  CATALOG_MIN_PER_CATEGORY,
  DC_MIN,
  DC_MAX,
} from "../types/index.js";
import type { PhaseA } from "./generate.js";

/** Phase A: define the world's stat mode, resources, tiers, and skills. */
export const PHASE_A_SYSTEM = [
  "You are the story bootstrapper for a d20 roleplay engine. This is PHASE A of two.",
  "From the premise, design the world's numeric and skill shape ONLY. Output JSON with:",
  "- statMode: \"none\" | \"light\" | \"full\". Use \"none\" for pure social/narrative stories",
  "  (then resources MUST be an empty array). Use \"light\" or \"full\" for stories with",
  "  combat, survival, or resource tension.",
  "- resources: numeric bars (id, label, start, max, playerVisible, optional regenPerScene,",
  "  optional lethal). When statMode is not \"none\", EXACTLY ONE resource must have",
  "  lethal:true (reaching 0 kills the character) — typically health/hp.",
  "- tiers: rarity/power bands (id, label, minProgress) from common to legendary.",
  "- skills: learnable abilities (id, name, description, tier, prerequisites[], unlockPaths[],",
  "  masteryAdvance{successesPerRank}). Every skill you define WILL need at least one action",
  "  that uses it in Phase B, so do not over-produce skills.",
  "Keep ids lowercase snake_case. Design 4–10 skills and 3–6 tiers.",
].join("\n");

/** Phase B: build the item table, action catalog, starting state, and NPC templates. */
export const PHASE_B_SYSTEM = [
  "You are the story bootstrapper for a d20 roleplay engine. This is PHASE B of two.",
  "Given the premise and the Phase A world shape, produce the interactive layer as JSON:",
  "- items: equipment/consumables (id, name, description, kind, tier, optional requiresSkill,",
  "  props map e.g. {\"damage\":6} or {\"heal\":10}).",
  "- actions: THE ACTION CATALOG. This is the hard constraint:",
  `  • at least ${CATALOG_MIN_ACTIONS} actions total,`,
  `  • at least ${CATALOG_MIN_PER_CATEGORY} in EACH category: combat, social, exploration, crafting, utility,`,
  `  • every action's dc is an integer within ${DC_MIN}–${DC_MAX} (5 trivial … 25 near-impossible),`,
  "  • each action has a full effects table with one EffectSpec per outcome:",
  "    crit_success, success, failure, crit_failure. Each EffectSpec needs a narrationHint.",
  "  • an action may requireSkill (must be a Phase A skill id) and/or requiresItemKind.",
  "  • combat actions typically deal resourceDeltaTarget; use scaleByItemProp to scale by a weapon prop.",
  "- startingState: what the player begins with (resources map, skills[], inventory[]).",
  "- npcTemplates: sheets for foreseeable key NPCs (templateId, name, resources, skills, inventory).",
  "REFERENCE RULES: every skill/item/resource/flag you mention must exist. Every Phase A skill",
  "must be used by at least one action. A flag referenced by a trial unlock must be set by some action.",
  "",
  "Example of one action per category (shape only):",
  JSON.stringify(
    {
      id: "strike",
      category: "combat",
      label: "Strike",
      requiresSkill: "melee",
      requiresItemKind: "weapon",
      dc: 12,
      costs: { resources: { stamina: 2 } },
      effects: {
        crit_success: { resourceDeltaTarget: { hp: -8 }, scaleByItemProp: "damage", narrationHint: "a devastating blow" },
        success: { resourceDeltaTarget: { hp: -4 }, scaleByItemProp: "damage", narrationHint: "a clean hit" },
        failure: { narrationHint: "the strike misses" },
        crit_failure: { resourceDeltaSelf: { hp: -1 }, narrationHint: "you overextend" },
      },
    },
    null,
    0
  ),
].join("\n");

/** Build the Phase A user prompt from the premise. */
export function buildPhaseAUser(premise: string): string {
  return ["PREMISE:", premise, "", "Design Phase A (statMode, resources, tiers, skills)."].join("\n");
}

/** Build the Phase B user prompt from the premise, Phase A output, and repair feedback. */
export function buildPhaseBUser(premise: string, phaseA: PhaseA, feedback: string): string {
  const parts = [
    "PREMISE:",
    premise,
    "",
    "PHASE A OUTPUT (build on exactly these ids):",
    JSON.stringify(phaseA, null, 0),
    "",
    "Design Phase B (items, actions, startingState, npcTemplates).",
  ];
  if (feedback) parts.push("", feedback);
  return parts.join("\n");
}
