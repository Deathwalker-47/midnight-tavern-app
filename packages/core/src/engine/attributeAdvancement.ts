import { ATTRIBUTE_ADVANCEMENT_CONFIG } from "../config/index.js";
import type {
  AttributeAdvancementBand,
  AttributeAdvancementDecision,
  AttributeAdvancementDenialCode,
  AttributeAdvancementEvidence,
  AttributeAdvancementProposal,
  CharacterHardState,
  PriorAttributeAdvancement,
  StorySchema,
} from "../types/index.js";
import { maximumAttributeScore } from "./attributes.js";

export interface AttributeAdvancementEvaluation {
  storyId: string;
  schema: StorySchema;
  character?: CharacterHardState;
  currentTurnIndex: number;
  evidence: readonly AttributeAdvancementEvidence[];
  prior: readonly PriorAttributeAdvancement[];
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function proposalFingerprint(proposal: AttributeAdvancementProposal): string {
  return [
    proposal.characterId,
    proposal.attributeId,
    proposal.source,
    String(proposal.delta),
    ...[...new Set(proposal.evidenceRefs)].sort(),
  ].join("|");
}

export function attributeAdvancementProposalKey(
  storyId: string,
  proposal: AttributeAdvancementProposal
): string {
  return `aa-v${ATTRIBUTE_ADVANCEMENT_CONFIG.version}-${stableHash(
    `${storyId}|${proposalFingerprint(proposal)}`
  ).toString(36)}`;
}

export function attributeAdvancementEventId(proposalKey: string): string {
  return `attribute-advancement:${proposalKey}`;
}

export function attributeAdvancementBandForScore(
  score: number
): (typeof ATTRIBUTE_ADVANCEMENT_CONFIG.bands)[number] {
  return (
    ATTRIBUTE_ADVANCEMENT_CONFIG.bands.find(
      (band) => score >= band.minimumScore && score <= band.maximumScore
    ) ?? ATTRIBUTE_ADVANCEMENT_CONFIG.bands.at(-1)!
  );
}

function reasonFor(code: AttributeAdvancementDenialCode): string {
  const reasons: Record<AttributeAdvancementDenialCode, string> = {
    unknown_character: "The proposed character does not exist in the authoritative ledger.",
    unknown_attribute: "The proposed attribute is not part of the sealed rulebook.",
    attribute_locked: "This attribute is explicitly locked and cannot advance.",
    invalid_delta: "Advancement is +1; only a lasting curse or trauma may apply -1.",
    ordinary_cap_reached: "Ordinary attributes cannot increase beyond 20.",
    superhuman_not_authorized:
      "Crossing 20 requires a superhuman attribute definition and an explicit transformation or blessing.",
    maximum_reached: "The attribute has reached its authorized maximum.",
    missing_evidence: "Every proposal must cite persisted ruling or event evidence.",
    evidence_not_recent: "The cited evidence is outside the configured recent-evidence window.",
    evidence_wrong_character: "The cited evidence belongs to a different character.",
    evidence_wrong_attribute: "The cited action evidence exercised a different attribute.",
    evidence_does_not_support_source:
      "The cited evidence does not mechanically support the proposed growth source.",
    insufficient_qualifying_evidence:
      "The proposal does not contain enough qualifying actions or events.",
    insufficient_distinct_turns:
      "Qualifying evidence must come from distinct turns rather than repeated farming in one exchange.",
    insufficient_turn_span:
      "Qualifying evidence must span multiple turns/scenes rather than one short burst.",
    insufficient_high_stakes_evidence:
      "This advancement requires more successful high-stakes uses of the attribute.",
    cooldown_active: "This attribute advanced too recently and remains on cooldown.",
    advancement_limit_reached:
      "The character has reached the configured advancement limit for the current window.",
    duplicate_proposal: "This exact evidence proposal has already been adjudicated.",
    difficulty_check_failed:
      "The deterministic advancement check did not meet the score band's difficulty.",
  };
  return reasons[code];
}

/**
 * Validate a DM proposal against persisted mechanical evidence and the engineering-owned policy.
 * This function is the sole authority for attribute advancement; narration cannot invoke it.
 */
export function evaluateAttributeAdvancement(
  proposal: AttributeAdvancementProposal,
  input: AttributeAdvancementEvaluation
): AttributeAdvancementDecision {
  const denialCodes: AttributeAdvancementDenialCode[] = [];
  const deny = (code: AttributeAdvancementDenialCode): void => {
    if (!denialCodes.includes(code)) denialCodes.push(code);
  };
  const definition = input.schema.attributes.find(
    (attribute) => attribute.id === proposal.attributeId
  );
  const scoreBefore =
    input.character?.attributes[proposal.attributeId] ?? definition?.defaultScore ?? 0;
  const band = attributeAdvancementBandForScore(Math.max(1, scoreBefore));
  const proposalKey = attributeAdvancementProposalKey(input.storyId, proposal);

  if (!input.character || input.character.characterId !== proposal.characterId) {
    deny("unknown_character");
  }
  if (!definition) deny("unknown_attribute");
  if (definition?.lockedAtZero) deny("attribute_locked");
  if (
    (proposal.source === "curse_or_trauma" && proposal.delta !== -1) ||
    (proposal.source !== "curse_or_trauma" && proposal.delta !== 1)
  ) {
    deny("invalid_delta");
  }

  const maximum = maximumAttributeScore(definition);
  if (proposal.delta > 0) {
    if (scoreBefore >= maximum) deny(maximum > 20 ? "maximum_reached" : "ordinary_cap_reached");
    if (
      scoreBefore >= 20 &&
      (!definition?.superhuman ||
        (proposal.source !== "transformation" && proposal.source !== "blessing"))
    ) {
      deny("superhuman_not_authorized");
    }
  }

  const evidenceByReference = new Map<string, AttributeAdvancementEvidence>();
  for (const item of input.evidence) {
    evidenceByReference.set(item.id, item);
    if (item.eventId) evidenceByReference.set(item.eventId, item);
    if (item.rulingId) evidenceByReference.set(item.rulingId, item);
  }
  const cited = [
    ...new Map(
      proposal.evidenceRefs
        .map((reference) => evidenceByReference.get(reference))
        .filter((item): item is AttributeAdvancementEvidence => Boolean(item))
        .map((item) => [item.id, item])
    ).values(),
  ];
  if (cited.length === 0 || cited.length !== new Set(proposal.evidenceRefs).size) {
    deny("missing_evidence");
  }

  const recent = cited.filter(
    (item) =>
      item.turnIndex <= input.currentTurnIndex &&
      input.currentTurnIndex - item.turnIndex <=
        ATTRIBUTE_ADVANCEMENT_CONFIG.recentEvidenceTurns
  );
  if (recent.length !== cited.length) deny("evidence_not_recent");
  const sameCharacter = recent.filter(
    (item) => !item.characterId || item.characterId === proposal.characterId
  );
  if (sameCharacter.length !== recent.length) deny("evidence_wrong_character");
  const sameAttribute = sameCharacter.filter(
    (item) =>
      item.kind !== "successful_ruling" || item.attributeId === proposal.attributeId
  );
  if (sameAttribute.length !== sameCharacter.length) deny("evidence_wrong_attribute");
  const qualifying = sameAttribute.filter((item) =>
    item.qualifyingSources.includes(proposal.source)
  );
  if (qualifying.length !== sameAttribute.length) deny("evidence_does_not_support_source");

  const triggerPolicy = ATTRIBUTE_ADVANCEMENT_CONFIG.triggers[proposal.source]!;
  const distinctTurns = new Set(qualifying.map((item) => item.turnIndex));
  const turns = [...distinctTurns].sort((left, right) => left - right);
  const turnSpan = turns.length > 1 ? turns.at(-1)! - turns[0]! : 0;
  const highStakesCount = qualifying.filter((item) => item.highStakes).length;
  if (qualifying.length < triggerPolicy.minimumEvidence) {
    deny("insufficient_qualifying_evidence");
  }
  if (distinctTurns.size < triggerPolicy.minimumDistinctTurns) {
    deny("insufficient_distinct_turns");
  }
  if (turnSpan < triggerPolicy.minimumTurnSpan) deny("insufficient_turn_span");
  if (highStakesCount < triggerPolicy.minimumHighStakesEvidence) {
    deny("insufficient_high_stakes_evidence");
  }
  if (
    proposal.source === "exceptional_action" &&
    !qualifying.some(
      (item) =>
        item.kind === "successful_ruling" &&
        item.highStakes &&
        item.materialChange &&
        (item.difficultyDc ?? 0) >=
          ATTRIBUTE_ADVANCEMENT_CONFIG.exceptionalActionMinimumDc
    )
  ) {
    deny("evidence_does_not_support_source");
  }
  if (
    (proposal.source === "transformation" ||
      proposal.source === "blessing" ||
      proposal.source === "curse_or_trauma") &&
    !qualifying.some(
      (item) => item.kind === "successful_ruling" && item.materialChange
    )
  ) {
    deny("evidence_does_not_support_source");
  }

  if (input.prior.some((item) => item.proposalKey === proposalKey)) {
    deny("duplicate_proposal");
  }
  const approvals = input.prior.filter((item) => item.approved !== false);
  const lastForAttribute = approvals
    .filter(
      (item) =>
        item.characterId === proposal.characterId &&
        item.attributeId === proposal.attributeId
    )
    .sort((left, right) => right.turnIndex - left.turnIndex)[0];
  if (
    lastForAttribute &&
    input.currentTurnIndex - lastForAttribute.turnIndex < band.cooldownTurns
  ) {
    deny("cooldown_active");
  }
  const approvalsInWindow = approvals.filter(
    (item) =>
      item.characterId === proposal.characterId &&
      input.currentTurnIndex - item.turnIndex <
        ATTRIBUTE_ADVANCEMENT_CONFIG.approvalWindowTurns
  );
  if (
    approvalsInWindow.length >=
    ATTRIBUTE_ADVANCEMENT_CONFIG.maximumApprovalsPerCharacterWindow
  ) {
    deny("advancement_limit_reached");
  }

  const extraEvidenceBonus = Math.min(
    ATTRIBUTE_ADVANCEMENT_CONFIG.maximumEvidenceBonus,
    Math.max(0, qualifying.length - triggerPolicy.minimumEvidence)
  );
  const modifier = triggerPolicy.checkBonus + extraEvidenceBonus;
  const roll =
    1 +
    (stableHash(
      `${input.storyId}|${proposalKey}|${ATTRIBUTE_ADVANCEMENT_CONFIG.version}`
    ) %
      20);
  const effectiveChancePercent = Math.max(
    0,
    Math.min(100, (21 - Math.max(1, band.dc - modifier)) * 5)
  );
  if (denialCodes.length === 0 && roll + modifier < band.dc) {
    deny("difficulty_check_failed");
  }

  const approved = denialCodes.length === 0;
  const scoreAfter = approved
    ? Math.max(1, Math.min(maximum, scoreBefore + proposal.delta))
    : scoreBefore;
  return {
    approved,
    proposal,
    proposalKey,
    band: band.id as AttributeAdvancementBand,
    scoreBefore,
    scoreAfter,
    dc: band.dc,
    roll,
    modifier,
    effectiveChancePercent,
    evidenceRefs: qualifying.map((item) => item.id),
    denialCodes,
    denialReasons: denialCodes.map(reasonFor),
    policyVersion: ATTRIBUTE_ADVANCEMENT_CONFIG.version,
  };
}

export function applyAttributeAdvancement(
  hard: CharacterHardState,
  decision: AttributeAdvancementDecision
): CharacterHardState {
  if (!decision.approved || hard.characterId !== decision.proposal.characterId) {
    return hard;
  }
  return {
    ...hard,
    attributes: {
      ...hard.attributes,
      [decision.proposal.attributeId]: decision.scoreAfter,
    },
  };
}
