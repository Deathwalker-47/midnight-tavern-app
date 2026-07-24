import { z } from "zod";
import { ATTRIBUTE_ADVANCEMENT_CONFIG } from "../config/index.js";
import {
  applyAttributeAdvancement,
  attributeAdvancementEventId,
  evaluateAttributeAdvancement,
} from "../engine/index.js";
import { callStructured, type Router } from "../router/index.js";
import type { Store, StoryEvent } from "../store/index.js";
import {
  AttributeAdvancementProposalSchema,
  RulingSchema,
  type AttributeAdvancementDecision,
  type AttributeAdvancementEvidence,
  type AttributeAdvancementSource,
  type CharacterHardState,
  type PriorAttributeAdvancement,
  type Ruling,
  type StoryRecord,
} from "../types/index.js";

const DecisionSchema = z.object({
  proposal: AttributeAdvancementProposalSchema.nullable(),
});

const TRAINING_WORDS =
  /\b(train(?:ing|ed)?|practi[cs](?:e|ed|ing)?|study|studied|studying|exercise|drill|meditat(?:e|ed|ing|ion)|condition(?:ing|ed)?)\b/i;
const TRANSFORMATION_WORDS =
  /\b(transform(?:ation|ed|ing)?|ascend(?:ed|ing)?|awaken(?:ed|ing)?|evolv(?:e|ed|ing)|metamorphosis|mutation)\b/i;
const BLESSING_WORDS =
  /\b(bless(?:ing|ed)?|boon|divine gift|anoint(?:ed|ing)?|benediction)\b/i;
const CURSE_WORDS =
  /\b(curse(?:d)?|trauma(?:tic)?|maim(?:ed|ing)?|scar(?:red|ring)?|lasting wound|affliction)\b/i;

function successful(ruling: Ruling): boolean {
  return (
    ruling.gate.allowed &&
    (ruling.roll?.outcome === "success" || ruling.roll?.outcome === "crit_success")
  );
}

function materiallyChangedScene(ruling: Ruling): boolean {
  if ((ruling.causedDeathOf?.length ?? 0) > 0 || (ruling.loot?.length ?? 0) > 0) {
    return true;
  }
  const effects = ruling.effectsApplied;
  if (!effects) return false;
  if (
    effects.setFlag ||
    effects.grantItem ||
    Object.keys(effects.attributeDeltaSelf ?? {}).length > 0 ||
    Object.keys(effects.attributeDeltaTarget ?? {}).length > 0
  ) {
    return true;
  }
  const resourceDeltas = [
    ...Object.values(effects.resourceDeltaSelf ?? {}),
    ...Object.values(effects.resourceDeltaTarget ?? {}),
  ];
  return resourceDeltas.some(
    (delta) =>
      Math.abs(delta) >=
        ATTRIBUTE_ADVANCEMENT_CONFIG.exceptionalResourceDeltaMinimum ||
      (ruling.roll?.outcome === "crit_success" && delta !== 0)
  );
}

function sourcesForRuling(
  ruling: Ruling,
  contextText: string
): AttributeAdvancementSource[] {
  const sources: AttributeAdvancementSource[] = ["repeated_high_stakes_use"];
  const actionText = `${ruling.actionId} ${ruling.actionLabel ?? ""} ${contextText}`;
  const materialChange = materiallyChangedScene(ruling);
  if (TRAINING_WORDS.test(actionText)) sources.push("sustained_training");
  if (materialChange && TRANSFORMATION_WORDS.test(actionText)) {
    sources.push("transformation");
  }
  if (materialChange && BLESSING_WORDS.test(actionText)) sources.push("blessing");
  if (materialChange && CURSE_WORDS.test(actionText)) {
    sources.push("curse_or_trauma");
  }
  if (
    (ruling.roll?.dcEffective ?? ruling.roll?.dc ?? 0) >=
      ATTRIBUTE_ADVANCEMENT_CONFIG.exceptionalActionMinimumDc &&
    materialChange
  ) {
    sources.push("exceptional_action");
  }
  return [...new Set(sources)];
}

function evidenceFromRuling(
  ruling: Ruling,
  turnIndex: number,
  contextText = "",
  event?: StoryEvent
): AttributeAdvancementEvidence | undefined {
  if (!successful(ruling) || !ruling.roll?.attributeId) return undefined;
  const dc = ruling.roll.dcEffective ?? ruling.roll.dc;
  return {
    id: event?.id ?? ruling.turnId,
    ...(event ? { eventId: event.id } : {}),
    rulingId: ruling.turnId,
    ...(event?.messageId ?? ruling.messageId
      ? { messageId: event?.messageId ?? ruling.messageId }
      : {}),
    turnIndex,
    characterId: ruling.actorId,
    attributeId: ruling.roll.attributeId,
    kind: "successful_ruling",
    actionId: ruling.actionId,
    ...(ruling.actionLabel ? { actionLabel: ruling.actionLabel } : {}),
    highStakes:
      dc >= ATTRIBUTE_ADVANCEMENT_CONFIG.highStakesMinimumDc ||
      ruling.roll.outcome === "crit_success",
    materialChange: materiallyChangedScene(ruling),
    difficultyDc: dc,
    qualifyingSources: sourcesForRuling(ruling, contextText),
  };
}

function milestoneEvidence(event: StoryEvent): AttributeAdvancementEvidence | undefined {
  if (
    event.kind !== "milestone" &&
    event.kind !== "arc_completed" &&
    event.kind !== "chapter_started"
  ) {
    return undefined;
  }
  return {
    id: event.id,
    eventId: event.id,
    ...(event.messageId ? { messageId: event.messageId } : {}),
    turnIndex: event.turnIndex,
    ...(event.actorId ? { characterId: event.actorId } : {}),
    kind:
      event.kind === "milestone"
        ? "milestone"
        : event.kind === "arc_completed"
          ? "arc"
          : "chapter",
    highStakes: true,
    materialChange: true,
    qualifyingSources: ["milestone"],
  };
}

function rulingFromEvent(event: StoryEvent): Ruling | undefined {
  if (event.kind !== "roll") return undefined;
  const parsed = RulingSchema.safeParse(event.payload["ruling"]);
  return parsed.success ? parsed.data : undefined;
}

function priorFromEvent(event: StoryEvent): PriorAttributeAdvancement | undefined {
  if (
    event.kind !== "attribute_advanced" &&
    event.kind !== "attribute_advancement_denied"
  ) {
    return undefined;
  }
  const decision =
    event.payload["decision"] &&
    typeof event.payload["decision"] === "object" &&
    !Array.isArray(event.payload["decision"])
      ? (event.payload["decision"] as Record<string, unknown>)
      : undefined;
  const proposal =
    decision?.["proposal"] &&
    typeof decision["proposal"] === "object" &&
    !Array.isArray(decision["proposal"])
      ? (decision["proposal"] as Record<string, unknown>)
      : undefined;
  if (
    typeof decision?.["proposalKey"] !== "string" ||
    typeof proposal?.["characterId"] !== "string" ||
    typeof proposal["attributeId"] !== "string" ||
    (proposal["delta"] !== 1 && proposal["delta"] !== -1)
  ) {
    return undefined;
  }
  return {
    proposalKey: decision["proposalKey"],
    characterId: proposal["characterId"],
    attributeId: proposal["attributeId"],
    turnIndex: event.turnIndex,
    delta: proposal["delta"],
    approved: event.kind === "attribute_advanced",
  };
}

function meetsTriggerShape(
  source: AttributeAdvancementSource,
  items: readonly AttributeAdvancementEvidence[]
): boolean {
  const policy = ATTRIBUTE_ADVANCEMENT_CONFIG.triggers[source]!;
  const turns = [...new Set(items.map((item) => item.turnIndex))].sort(
    (left, right) => left - right
  );
  const turnSpan = turns.length > 1 ? turns.at(-1)! - turns[0]! : 0;
  if (
    items.length < policy.minimumEvidence ||
    turns.length < policy.minimumDistinctTurns ||
    turnSpan < policy.minimumTurnSpan ||
    items.filter((item) => item.highStakes).length <
      policy.minimumHighStakesEvidence
  ) {
    return false;
  }
  if (source === "exceptional_action") {
    return items.some(
      (item) =>
        item.kind === "successful_ruling" &&
        item.materialChange &&
        item.highStakes &&
        (item.difficultyDc ?? 0) >=
          ATTRIBUTE_ADVANCEMENT_CONFIG.exceptionalActionMinimumDc
    );
  }
  return true;
}

interface EligibleCandidate {
  characterId: string;
  attributeId: string;
  source: AttributeAdvancementSource;
  evidenceRefs: string[];
}

function eligibleCandidates(
  current: readonly AttributeAdvancementEvidence[],
  allEvidence: readonly AttributeAdvancementEvidence[]
): EligibleCandidate[] {
  const candidates: EligibleCandidate[] = [];
  for (const anchor of current) {
    if (!anchor.characterId || !anchor.attributeId) continue;
    for (const source of anchor.qualifyingSources) {
      const relevant = allEvidence.filter(
        (item) =>
          item.qualifyingSources.includes(source) &&
          (!item.characterId || item.characterId === anchor.characterId) &&
          (item.kind !== "successful_ruling" || item.attributeId === anchor.attributeId)
      );
      if (!meetsTriggerShape(source, relevant)) continue;
      candidates.push({
        characterId: anchor.characterId,
        attributeId: anchor.attributeId,
        source,
        evidenceRefs: relevant
          .slice(-ATTRIBUTE_ADVANCEMENT_CONFIG.maximumEvidenceRefs)
          .map((item) => item.id),
      });
    }
  }
  return [
    ...new Map(
      candidates.map((candidate) => [
        `${candidate.characterId}|${candidate.attributeId}|${candidate.source}`,
        candidate,
      ])
    ).values(),
  ];
}

export interface DetermineAttributeAdvancementArgs {
  story: StoryRecord;
  playerText: string;
  rulings: readonly Ruling[];
  turnIndex: number;
  hardStates: ReadonlyMap<string, CharacterHardState>;
  signal?: AbortSignal;
}

export interface AttributeAdvancementAdjudication {
  decisions: AttributeAdvancementDecision[];
  hardStates: Map<string, CharacterHardState>;
}

/**
 * Ask the DM model for at most one evidence-bound proposal, then let the deterministic engine
 * accept or deny it. Model failure is deliberately non-fatal to the story turn.
 */
export async function determineAttributeAdvancements(
  router: Router,
  store: Store,
  args: DetermineAttributeAdvancementArgs
): Promise<AttributeAdvancementAdjudication> {
  const current = args.rulings.flatMap((ruling) => {
    const evidence = evidenceFromRuling(
      ruling,
      args.turnIndex,
      args.playerText
    );
    return evidence ? [evidence] : [];
  });
  if (current.length === 0) {
    return { decisions: [], hardStates: new Map(args.hardStates) };
  }

  const persistedEvents = await store.events.listByStory(args.story.id, {
    kinds: [
      "roll",
      "milestone",
      "arc_completed",
      "chapter_started",
      "attribute_advanced",
      "attribute_advancement_denied",
    ],
    limit: 500,
  });
  const historical = persistedEvents.flatMap((event) => {
    const ruling = rulingFromEvent(event);
    const evidence = ruling
      ? evidenceFromRuling(
          ruling,
          event.turnIndex,
          typeof event.payload["playerText"] === "string"
            ? event.payload["playerText"]
            : "",
          event
        )
      : milestoneEvidence(event);
    return evidence ? [evidence] : [];
  });
  const milestones = historical.filter((item) => item.kind !== "successful_ruling");
  for (const item of current) {
    if (
      milestones.some(
        (milestone) =>
          (!milestone.characterId || milestone.characterId === item.characterId) &&
          Math.abs(milestone.turnIndex - item.turnIndex) <= 2
      )
    ) {
      item.qualifyingSources = [
        ...new Set<AttributeAdvancementSource>([
          ...item.qualifyingSources,
          "milestone",
        ]),
      ];
    }
  }
  const allEvidence = [...historical, ...current].filter(
    (item) =>
      args.turnIndex - item.turnIndex <=
      ATTRIBUTE_ADVANCEMENT_CONFIG.recentEvidenceTurns
  );
  const candidates = eligibleCandidates(current, allEvidence);
  if (candidates.length === 0) {
    return { decisions: [], hardStates: new Map(args.hardStates) };
  }

  let proposal: z.infer<typeof DecisionSchema>["proposal"];
  try {
    const response = await callStructured(
      router,
      "classifier",
      {
        system: [
          "You are the authoritative DM attribute-growth proposer.",
          "You may propose at most one change, and the deterministic engine may deny it.",
          "Use only the eligible candidates and exact evidence refs provided.",
          "A routine action, one lucky roll, repeated farming in one scene, failure, or prose-only claim never qualifies.",
          "Valid sources are sustained training across turns, repeated successful high-stakes use of the same attribute across turns, an exceptional scene-changing high-DC action, a major milestone demonstrated through action, explicit transformation/blessing, or a lasting curse/trauma.",
          "Use delta +1 except curse_or_trauma, which must use -1. When uncertain return proposal:null.",
        ].join("\n"),
        user: [
          `STORY: ${args.story.title}`,
          `CURRENT PLAYER MESSAGE: ${args.playerText}`,
          `CURRENT AUTHORITATIVE RULINGS: ${JSON.stringify(args.rulings)}`,
          `ELIGIBLE CANDIDATES WITH RECOMMENDED EVIDENCE REFS: ${JSON.stringify(
            candidates
          )}`,
          `EVIDENCE RECORDS: ${JSON.stringify(allEvidence)}`,
          "Return one evidence-bound proposal or null. Do not infer a stat change from narration.",
        ].join("\n\n"),
      },
      DecisionSchema,
      { maxRepairs: 1, ...(args.signal ? { signal: args.signal } : {}) }
    );
    proposal = response.proposal;
  } catch (error) {
    if (args.signal?.aborted) throw error;
    return { decisions: [], hardStates: new Map(args.hardStates) };
  }
  if (!proposal) return { decisions: [], hardStates: new Map(args.hardStates) };

  const prior = persistedEvents.flatMap((event) => {
    const record = priorFromEvent(event);
    return record ? [record] : [];
  });
  const decision = evaluateAttributeAdvancement(proposal, {
    storyId: args.story.id,
    schema: args.story.schema,
    character: args.hardStates.get(proposal.characterId),
    currentTurnIndex: args.turnIndex,
    evidence: allEvidence,
    prior,
  });
  const hardStates = new Map(args.hardStates);
  const currentHard = hardStates.get(proposal.characterId);
  if (currentHard && decision.approved) {
    hardStates.set(
      proposal.characterId,
      applyAttributeAdvancement(currentHard, decision)
    );
  }
  return { decisions: [decision], hardStates };
}

export async function recordAttributeAdvancementDecision(
  store: Store,
  story: StoryRecord,
  messageId: string,
  turnIndex: number,
  decision: AttributeAdvancementDecision
): Promise<void> {
  if (
    !decision.approved &&
    decision.denialCodes.includes("duplicate_proposal")
  ) {
    return;
  }
  await store.events.insert({
    id: decision.approved
      ? attributeAdvancementEventId(decision.proposalKey)
      : `attribute-advancement-denied:${decision.proposalKey}`,
    storyId: story.id,
    messageId,
    turnIndex,
    actorId: decision.proposal.characterId,
    kind: decision.approved
      ? "attribute_advanced"
      : "attribute_advancement_denied",
    payload: { decision },
    rulebookVersion: story.rulebookVersion ?? 1,
    createdAt: Date.now(),
  });
}
