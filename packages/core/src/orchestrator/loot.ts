import { z } from "zod";
import { EQUIPMENT_LOOT_CONFIG } from "../config/index.js";
import { finalizeLootProposal } from "../engine/index.js";
import { callStructured, type Router } from "../router/index.js";
import type { Store } from "../store/index.js";
import {
  ItemProposalSchema,
  type ItemDefinition,
  type ItemInstance,
  type LootSourceType,
  type Ruling,
  type StoryRecord,
} from "../types/index.js";
import { randomUUID } from "../util/uuid.js";

const LootAwardProposalSchema = z.object({
    sourceType: z.enum(["combat", "non_combat", "milestone", "quest"]).optional(),
    sourceLabel: z.string().min(1).max(200).optional(),
    recipientCharacterId: z.string().min(1).optional(),
    proposal: ItemProposalSchema.optional(),
    reason: z.string().min(1).max(300).optional(),
});

const LootDecisionSchema = z
  .object({
    award: z.boolean().optional(),
    sourceType: LootAwardProposalSchema.shape.sourceType,
    sourceLabel: LootAwardProposalSchema.shape.sourceLabel,
    recipientCharacterId: LootAwardProposalSchema.shape.recipientCharacterId,
    proposal: LootAwardProposalSchema.shape.proposal,
    awards: z
      .array(LootAwardProposalSchema)
      .max(EQUIPMENT_LOOT_CONFIG.loot.maximumItemsPerEncounter)
      .optional(),
    reason: z.string().min(1).max(300),
  })
  .superRefine((decision, ctx) => {
    if (decision.awards?.length) return;
    if (!decision.award) return;
    for (const field of ["sourceType", "sourceLabel", "recipientCharacterId", "proposal"] as const) {
      if (decision[field] === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} is required when award is true.`,
        });
      }
    }
  });

export interface PendingLootAward {
  rulingIndex: number;
  definition: ItemDefinition;
  instance: ItemInstance;
}

function completedSuccess(ruling: Ruling): boolean {
  return Boolean(
    ruling.gate.allowed &&
      ruling.roll &&
      (ruling.roll.outcome === "success" || ruling.roll.outcome === "crit_success")
  );
}

/**
 * Ask the DM classifier whether this resolved exchange legitimately completed a reward-bearing
 * encounter. The model may propose content but cannot materialize it: tier ceilings, milestones,
 * mythical authorization, effect counts, and bonus magnitudes are validated by deterministic code.
 */
export async function determineLootAwards(
  router: Router,
  store: Store,
  story: StoryRecord,
  playerText: string,
  rulings: readonly Ruling[],
  signal?: AbortSignal
): Promise<PendingLootAward[]> {
  const successfulIndices = rulings
    .map((ruling, index) => (completedSuccess(ruling) ? index : -1))
    .filter((index) => index >= 0);
  if (successfulIndices.length === 0) return [];

  let decision: z.infer<typeof LootDecisionSchema>;
  try {
    decision = await callStructured(
      router,
      "classifier",
      {
        system: [
          "You are the authoritative DM loot adjudicator.",
          "Award an item only when the current exchange clearly completes a combat or non-combat encounter, quest, or explicit milestone and the reward is earned.",
          "Do not award routine loot for every successful action. When uncertain, set award=false.",
          `Propose between one and ${EQUIPMENT_LOOT_CONFIG.loot.maximumItemsPerEncounter} items only when the completed encounter truly earned them. The deterministic engine rejects excessive tiers or effects.`,
          "Mythical items are impossible unless separate frozen authorization exists; never assume it.",
        ].join("\n"),
        user: [
          `STORY: ${story.title}`,
          `PREMISE: ${story.schema.premise}`,
          `PLAYER MESSAGE: ${playerText}`,
          "SUCCESSFUL DM RULINGS:",
          successfulIndices.map((index) => JSON.stringify({ index, ruling: rulings[index] })).join("\n"),
          "",
          "Decide whether this exchange deserves no loot, one item, or a small multi-item reward now. Explain every award.",
        ].join("\n"),
      },
      LootDecisionSchema,
      { maxRepairs: 2, ...(signal ? { signal } : {}) }
    );
  } catch (error) {
    if (signal?.aborted) throw error;
    return [];
  }
  const proposedAwards = decision.awards?.length
    ? decision.awards
    : decision.award
      ? [
          {
            sourceType: decision.sourceType,
            sourceLabel: decision.sourceLabel,
            recipientCharacterId: decision.recipientCharacterId,
            proposal: decision.proposal,
            reason: decision.reason,
          },
        ]
      : [];
  if (proposedAwards.length === 0) return [];

  const milestoneEvents = await store.events.listByStory(story.id, {
    kinds: ["milestone"],
    limit: 1,
  });
  const mythicalAuthorized = story.configSnapshot?.["mythicalLootAuthorized"] === true;
  const rulingIndex = successfulIndices[successfulIndices.length - 1]!;
  const ruling = rulings[rulingIndex]!;
  const existingDefinitionIds = (await store.runtimeItems.listDefinitions(story.id)).map(
    (definition) => definition.id
  );
  const awards: PendingLootAward[] = [];
  for (const proposal of proposedAwards.slice(
    0,
    EQUIPMENT_LOOT_CONFIG.loot.maximumItemsPerEncounter
  )) {
    if (
      !proposal.proposal ||
      !proposal.sourceType ||
      !proposal.sourceLabel ||
      !proposal.recipientCharacterId
    ) {
      continue;
    }
    const recipient = await store.characters.get(proposal.recipientCharacterId);
    if (!recipient || recipient.storyId !== story.id || !recipient.hard.alive) continue;
    const sourceType: LootSourceType = proposal.sourceType;
    const milestoneAuthorized =
      (sourceType === "milestone" || sourceType === "quest") &&
      (milestoneEvents.length > 0 || completedSuccess(ruling));
    const maximumTier = EQUIPMENT_LOOT_CONFIG.loot.routineMaximumTier[sourceType];
    const now = new Date().toISOString();
    const finalized = finalizeLootProposal(
      proposal.proposal,
      {
        storyId: story.id,
        sourceType,
        sourceLabel: proposal.sourceLabel,
        maximumTier,
        milestoneAuthorized,
        mythicalAuthorized,
        existingDefinitionIds: [...existingDefinitionIds, ...awards.map((award) => award.definition.id)],
      },
      { definitionId: randomUUID(), createdAt: now }
    );
    if (!finalized.valid || !finalized.definition) continue;

    const instance: ItemInstance = {
      id: randomUUID(),
      storyId: story.id,
      definitionId: finalized.definition.id,
      ownerCharacterId: recipient.id,
      quantity: 1,
      acquiredAt: now,
      provenance: {
        sourceType,
        sourceLabel: proposal.sourceLabel,
        rulingId: ruling.turnId,
        turnId: ruling.turnId,
        tierBudget: maximumTier,
        eligibilityReasons: [proposal.reason ?? decision.reason],
        policyVersion: EQUIPMENT_LOOT_CONFIG.version,
        grantedAt: now,
      },
    };
    awards.push({ rulingIndex, definition: finalized.definition, instance });
  }
  return awards;
}
