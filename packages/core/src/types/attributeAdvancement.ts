import { z } from "zod";

export const AttributeAdvancementSourceSchema = z.enum([
  "sustained_training",
  "repeated_high_stakes_use",
  "exceptional_action",
  "milestone",
  "transformation",
  "blessing",
  "curse_or_trauma",
]);
export type AttributeAdvancementSource = z.infer<
  typeof AttributeAdvancementSourceSchema
>;

export const AttributeAdvancementBandSchema = z.enum([
  "easy",
  "normal",
  "moderate",
  "hard",
  "near_impossible",
]);
export type AttributeAdvancementBand = z.infer<
  typeof AttributeAdvancementBandSchema
>;

export const AttributeAdvancementProposalSchema = z.object({
  characterId: z.string().min(1),
  attributeId: z.string().min(1),
  source: AttributeAdvancementSourceSchema,
  /** Advancement is normally +1. A lasting curse or trauma may apply -1. */
  delta: z.union([z.literal(1), z.literal(-1)]),
  evidenceRefs: z.array(z.string().min(1)).min(1).max(8),
  rationale: z.string().min(1).max(1_000),
});
export type AttributeAdvancementProposal = z.infer<
  typeof AttributeAdvancementProposalSchema
>;

export const AttributeAdvancementEvidenceSchema = z.object({
  /** Stable event id or pending ruling id accepted as a proposal reference. */
  id: z.string().min(1),
  eventId: z.string().min(1).optional(),
  rulingId: z.string().min(1).optional(),
  messageId: z.string().min(1).optional(),
  turnIndex: z.number().int().nonnegative(),
  characterId: z.string().min(1).optional(),
  attributeId: z.string().min(1).optional(),
  kind: z.enum(["successful_ruling", "milestone", "arc", "chapter"]),
  actionId: z.string().min(1).optional(),
  actionLabel: z.string().min(1).optional(),
  highStakes: z.boolean().default(false),
  materialChange: z.boolean().default(false),
  difficultyDc: z.number().int().nonnegative().optional(),
  qualifyingSources: z.array(AttributeAdvancementSourceSchema),
});
export type AttributeAdvancementEvidence = z.infer<
  typeof AttributeAdvancementEvidenceSchema
>;

export const AttributeAdvancementDenialCodeSchema = z.enum([
  "unknown_character",
  "unknown_attribute",
  "attribute_locked",
  "invalid_delta",
  "ordinary_cap_reached",
  "superhuman_not_authorized",
  "maximum_reached",
  "missing_evidence",
  "evidence_not_recent",
  "evidence_wrong_character",
  "evidence_wrong_attribute",
  "evidence_does_not_support_source",
  "insufficient_qualifying_evidence",
  "insufficient_distinct_turns",
  "insufficient_turn_span",
  "insufficient_high_stakes_evidence",
  "cooldown_active",
  "advancement_limit_reached",
  "duplicate_proposal",
  "difficulty_check_failed",
]);
export type AttributeAdvancementDenialCode = z.infer<
  typeof AttributeAdvancementDenialCodeSchema
>;

export interface PriorAttributeAdvancement {
  proposalKey: string;
  characterId: string;
  attributeId: string;
  turnIndex: number;
  delta: 1 | -1;
  approved?: boolean;
}

export interface AttributeAdvancementDecision {
  approved: boolean;
  proposal: AttributeAdvancementProposal;
  proposalKey: string;
  band?: AttributeAdvancementBand;
  scoreBefore: number;
  scoreAfter: number;
  dc: number;
  roll: number;
  modifier: number;
  effectiveChancePercent: number;
  evidenceRefs: string[];
  denialCodes: AttributeAdvancementDenialCode[];
  denialReasons: string[];
  policyVersion: number;
}
