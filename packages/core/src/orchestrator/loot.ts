import { z } from "zod";
import { applyUniversalActionDefaults, EQUIPMENT_LOOT_CONFIG, type UniversalItems } from "../config/index.js";
import { finalizeLootProposal, tierAtMost } from "../engine/index.js";
import { effectiveSchema } from "../catalogue/enablement.js";
import { weaponSpecialOptions, type WeaponSpecialOption } from "../catalogue/specials.js";
import { catalogueOf, configForStory, enablementsForPlay } from "../catalogue/storyConfig.js";
import { callStructured, type Router } from "../router/index.js";
import type { Store } from "../store/index.js";
import {
  EquipmentEffectSchema,
  ItemProposalSchema,
  itemKindSatisfies,
  type ItemDefinition,
  type ItemInstance,
  type LootSourceType,
  type Ruling,
  type StoryRecord,
} from "../types/index.js";
import { randomUUID } from "../util/uuid.js";

/**
 * Every awarded item names a universal item archetype from a sealed list (plan 09 §8.1): the model
 * writes the flavour, and the archetype sets the mechanics (`shapeByArchetype`). Loot never grants an
 * action or a skill directly; a weapon may instead carry one weapon special from a sealed list (plan
 * 09 §8.2), which the engine attaches as an `action_enable` effect only when it suits the weapon.
 */
const LootEffectSchema = EquipmentEffectSchema.refine(
  (effect) => effect.type !== "action_enable" && effect.type !== "skill_enable",
  "Loot never grants an action or a skill through effects; name a specialId for a weapon special."
);

function lootDecisionSchema(items: UniversalItems, specialIds: readonly string[]) {
  const archetypeIds = items.archetypes.map((archetype) => archetype.id) as [string, ...string[]];
  const proposal = ItemProposalSchema.extend({
    archetypeId: z.enum(archetypeIds),
    effects: z.array(LootEffectSchema).default([]),
    ...(specialIds.length > 0 ? { specialId: z.enum(specialIds as [string, ...string[]]).optional() } : {}),
  });
  const award = z.object({
    sourceType: z.enum(["combat", "non_combat", "milestone", "quest"]).optional(),
    sourceLabel: z.string().min(1).max(200).optional(),
    recipientCharacterId: z.string().min(1).optional(),
    proposal: proposal.optional(),
    reason: z.string().min(1).max(300).optional(),
  });
  return z
    .object({
      award: z.boolean().optional(),
      sourceType: award.shape.sourceType,
      sourceLabel: award.shape.sourceLabel,
      recipientCharacterId: award.shape.recipientCharacterId,
      proposal: award.shape.proposal,
      awards: z.array(award).max(EQUIPMENT_LOOT_CONFIG.loot.maximumItemsPerEncounter).optional(),
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
}

/** The item archetypes as the adjudicator sees them, one line each. */
export function lootArchetypeLines(items: UniversalItems): string[] {
  return items.archetypes.map((archetype) => `- ${archetype.id} · ${archetype.kind} · ${archetype.description}`);
}

export interface PendingLootAward {
  rulingIndex: number;
  definition: ItemDefinition;
  instance: ItemInstance;
  /** A weapon special this item grants that the story has not enabled yet; enabled when it commits. */
  enablesSpecial?: string;
}

/**
 * Attach a proposed weapon special when it suits the finalized item: the item must be the kind of
 * weapon the special swings, at least the special's tier, and have an effect slot left at its tier.
 * Otherwise the item is still awarded, without the special. Returns the special attached, if any.
 */
export function attachWeaponSpecial(
  definition: ItemDefinition,
  special: WeaponSpecialOption | undefined
): WeaponSpecialOption | undefined {
  if (!special) return undefined;
  if (!itemKindSatisfies(definition.kind, special.requiresItemKind)) return undefined;
  if (!tierAtMost(special.tier, definition.tier)) return undefined;
  if (definition.effects.length >= EQUIPMENT_LOOT_CONFIG.tiers[definition.tier].maximumEffects) return undefined;
  definition.effects.push({ type: "action_enable", actionId: special.entryId });
  return special;
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

  // The story's universal config (plan 09 §4c), and the weapon specials it could see granted now (§8.2).
  const config = configForStory(story);
  const frozen = applyUniversalActionDefaults(story.schema);
  const specials = weaponSpecialOptions(
    frozen,
    effectiveSchema(frozen, enablementsForPlay(story, await store.poolEnablements.list(story.id))),
    (await store.chapters.listByStory(story.id)).length,
    catalogueOf(config)
  );
  const LootDecisionSchema = lootDecisionSchema(config.items, specials.map((special) => special.entryId));
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
          "Every item names an archetypeId from ITEM ARCHETYPES. The archetype and the tier fix the item's kind, slots, hands, damage, stamina per swing and what it restores; you write its name, description, tier and any bonus effects.",
          "Effects never grant actions or skills. A remarkable weapon may instead carry one specialId from WEAPON SPECIALS, when one is listed: it must suit the weapon, and its tier may not exceed the item's.",
        ].join("\n"),
        user: [
          `STORY: ${story.title}`,
          `PREMISE: ${story.schema.premise}`,
          `PLAYER MESSAGE: ${playerText}`,
          "SUCCESSFUL DM RULINGS:",
          successfulIndices.map((index) => JSON.stringify({ index, ruling: rulings[index] })).join("\n"),
          "",
          "Decide whether this exchange deserves no loot, one item, or a small multi-item reward now. Explain every award.",
          "",
          "ITEM ARCHETYPES:",
          ...lootArchetypeLines(config.items),
          ...(specials.length > 0
            ? [
                "",
                "WEAPON SPECIALS:",
                ...specials.map(
                  (special) =>
                    `- ${special.entryId} · ${special.name} · ${special.tier} · needs a ${special.requiresItemKind.replace(/_/g, " ")} · ${special.description}`
                ),
              ]
            : []),
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
    const { specialId, ...item } = proposal.proposal as typeof proposal.proposal & { specialId?: string };
    const finalized = finalizeLootProposal(
      item,
      {
        storyId: story.id,
        sourceType,
        sourceLabel: proposal.sourceLabel,
        maximumTier,
        milestoneAuthorized,
        mythicalAuthorized,
        existingDefinitionIds: [...existingDefinitionIds, ...awards.map((award) => award.definition.id)],
      },
      { definitionId: randomUUID(), createdAt: now },
      EQUIPMENT_LOOT_CONFIG,
      config.items
    );
    if (!finalized.valid || !finalized.definition) continue;
    const special = attachWeaponSpecial(
      finalized.definition,
      specials.find((candidate) => candidate.entryId === specialId)
    );

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
    awards.push({
      rulingIndex,
      definition: finalized.definition,
      instance,
      ...(special && !special.enabled ? { enablesSpecial: special.entryId } : {}),
    });
  }
  return awards;
}
