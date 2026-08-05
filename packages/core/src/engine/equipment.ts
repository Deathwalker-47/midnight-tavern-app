import { EQUIPMENT_LOOT_CONFIG, type EquipmentLootConfig } from "../config/index.js";
import {
  EQUIPMENT_SLOTS,
  MAX_EQUIPPED_SLOTS,
  type CharacterHardState,
  type EquipmentAssignment,
  type EquipmentEffect,
  type EquipmentRuntimeCatalog,
  type EquipmentSlot,
  type ItemDefinition,
  type ItemInstance,
  type ItemProposal,
  type ItemTier,
  type LootEligibilityContext,
  type MasteryRank,
} from "../types/index.js";
import { conditionHolds } from "./conditions.js";

const TIER_ORDER: readonly ItemTier[] = [
  "common",
  "uncommon",
  "rare",
  "legendary",
  "mythical",
];

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface LoadoutValidationResult extends ValidationResult {
  assignments: EquipmentAssignment[];
}

export interface FinalizeLootResult extends ValidationResult {
  definition?: ItemDefinition;
}

export function tierAtMost(tier: ItemTier, maximum: ItemTier): boolean {
  return TIER_ORDER.indexOf(tier) <= TIER_ORDER.indexOf(maximum);
}

/**
 * Validates a model-proposed item against frozen encounter and tier budgets.
 *
 * @param proposal - Content-only proposal with no authority to grant itself.
 * @param context - Engine-computed loot entitlement for the resolved encounter.
 * @param config - Versioned equipment and loot policy.
 * @returns Validation result containing every policy violation.
 *
 * @remarks Mythical and milestone gates are fail-closed.
 * @see {@link finalizeLootProposal} for authoritative definition materialization.
 * @since 0.1.0
 */
export function validateLootProposal(
  proposal: ItemProposal,
  context: LootEligibilityContext,
  config: EquipmentLootConfig = EQUIPMENT_LOOT_CONFIG
): ValidationResult {
  const errors: string[] = [];
  const sourceMaximum = config.loot.routineMaximumTier[context.sourceType];
  const policy = config.tiers[proposal.tier];

  if (!tierAtMost(proposal.tier, context.maximumTier)) {
    errors.push(`Tier ${proposal.tier} exceeds the frozen encounter budget ${context.maximumTier}.`);
  }
  if (
    !tierAtMost(proposal.tier, sourceMaximum) &&
    !(proposal.tier === "mythical" && context.mythicalAuthorized)
  ) {
    errors.push(`Tier ${proposal.tier} exceeds the ${context.sourceType} source ceiling.`);
  }
  if (policy.requiresMilestone && !context.milestoneAuthorized) {
    errors.push(`${proposal.tier} loot requires an explicit story milestone.`);
  }
  if (
    proposal.tier === "mythical" &&
    config.loot.mythicalRequiresExplicitAuthorization &&
    !context.mythicalAuthorized
  ) {
    errors.push("Mythical loot requires explicit frozen-story authorization.");
  }
  if (proposal.effects.length > policy.maximumEffects) {
    errors.push(
      `${proposal.tier} items allow at most ${policy.maximumEffects} mechanical effects.`
    );
  }
  for (const effect of proposal.effects) {
    if (
      (effect.type === "skill_check" || effect.type === "action_check") &&
      Math.abs(effect.amount) > policy.maximumCheckBonus
    ) {
      errors.push(
        `${proposal.tier} check bonuses cannot exceed ${policy.maximumCheckBonus}.`
      );
    }
    if (
      effect.type === "attribute_score" &&
      Math.abs(effect.amount) > policy.maximumAttributeBonus
    ) {
      errors.push(
        `${proposal.tier} attribute bonuses cannot exceed ${policy.maximumAttributeBonus}.`
      );
    }
  }
  if (proposal.handsRequired === 2) {
    if (
      !proposal.slotCompatibility.includes("primary") ||
      !proposal.slotCompatibility.includes("secondary")
    ) {
      errors.push("Two-handed items must be compatible with Primary and Secondary.");
    }
  }
  if (proposal.handsRequired > 0 && proposal.kind !== "weapon" && proposal.kind !== "tool") {
    errors.push("Only weapons and tools may reserve hand slots.");
  }
  return { valid: errors.length === 0, errors };
}

export function finalizeLootProposal(
  proposal: ItemProposal,
  context: LootEligibilityContext,
  identity: { definitionId: string; createdAt: string },
  config: EquipmentLootConfig = EQUIPMENT_LOOT_CONFIG
): FinalizeLootResult {
  const validation = validateLootProposal(proposal, context, config);
  if (!validation.valid) return validation;
  return {
    valid: true,
    errors: [],
    definition: {
      id: identity.definitionId,
      storyId: context.storyId,
      ...proposal,
      createdAt: identity.createdAt,
      configVersion: config.version,
    },
  };
}

function mapsFor(catalog: EquipmentRuntimeCatalog): {
  definitions: Map<string, ItemDefinition>;
  instances: Map<string, ItemInstance>;
} {
  return {
    definitions: new Map(catalog.definitions.map((definition) => [definition.id, definition])),
    instances: new Map(catalog.instances.map((instance) => [instance.id, instance])),
  };
}

export function validateLoadout(
  characterId: string,
  assignments: readonly EquipmentAssignment[],
  catalog: EquipmentRuntimeCatalog
): LoadoutValidationResult {
  const errors: string[] = [];
  const normalized = assignments.filter((assignment) => assignment.characterId === characterId);
  const { definitions, instances } = mapsFor(catalog);
  const occupied = new Set<EquipmentSlot>();
  const assignedCounts = new Map<string, number>();
  const stackingKeys = new Set<string>();
  const equippedDefinitions = new Set<string>();

  if (normalized.length > MAX_EQUIPPED_SLOTS) {
    errors.push(`A loadout may occupy at most ${MAX_EQUIPPED_SLOTS} slots.`);
  }
  for (const assignment of normalized) {
    if (!EQUIPMENT_SLOTS.includes(assignment.slot)) {
      errors.push(`Unknown equipment slot ${assignment.slot}.`);
      continue;
    }
    if (occupied.has(assignment.slot)) {
      errors.push(`Slot ${assignment.slot} is occupied more than once.`);
    }
    occupied.add(assignment.slot);

    const instance = instances.get(assignment.itemInstanceId);
    if (!instance || instance.ownerCharacterId !== characterId || instance.quantity < 1) {
      errors.push(`Item instance ${assignment.itemInstanceId} is not owned by ${characterId}.`);
      continue;
    }
    const definition = definitions.get(instance.definitionId);
    if (!definition) {
      errors.push(`Missing definition ${instance.definitionId}.`);
      continue;
    }
    if (!definition.slotCompatibility.includes(assignment.slot)) {
      errors.push(`${definition.name} cannot occupy ${assignment.slot}.`);
    }
    const nextCount = (assignedCounts.get(instance.id) ?? 0) + 1;
    assignedCounts.set(instance.id, nextCount);
    if (nextCount > (definition.handsRequired === 2 ? 2 : 1)) {
      errors.push(`${definition.name} is assigned to too many slots.`);
    }
    if (definition.stackingKey) {
      if (stackingKeys.has(definition.stackingKey) && nextCount === 1) {
        errors.push(`Stacking group ${definition.stackingKey} may be equipped only once.`);
      }
      stackingKeys.add(definition.stackingKey);
    }
    if (nextCount === 1) {
      if (equippedDefinitions.has(definition.id)) {
        errors.push(`${definition.name} cannot be equipped more than once.`);
      }
      equippedDefinitions.add(definition.id);
    }
  }

  for (const [instanceId, count] of assignedCounts) {
    // assignedCounts is populated only after both records were resolved above.
    const instance = instances.get(instanceId)!;
    const definition = definitions.get(instance.definitionId)!;
    if (definition.handsRequired === 2) {
      const assignedSlots = normalized
        .filter((assignment) => assignment.itemInstanceId === instanceId)
        .map((assignment) => assignment.slot);
      if (
        count !== 2 ||
        !assignedSlots.includes("primary") ||
        !assignedSlots.includes("secondary")
      ) {
        errors.push(`${definition.name} must occupy Primary and Secondary together.`);
      }
    }
  }
  return { valid: errors.length === 0, errors, assignments: [...normalized] };
}

export function equipItem(
  characterId: string,
  current: readonly EquipmentAssignment[],
  itemInstanceId: string,
  preferredSlot: EquipmentSlot,
  catalog: EquipmentRuntimeCatalog
): LoadoutValidationResult {
  const { definitions, instances } = mapsFor(catalog);
  const instance = instances.get(itemInstanceId);
  const definition = instance ? definitions.get(instance.definitionId) : undefined;
  if (!instance || !definition || instance.ownerCharacterId !== characterId) {
    return {
      valid: false,
      errors: [`Item instance ${itemInstanceId} is not owned by ${characterId}.`],
      assignments: [...current],
    };
  }
  const requiredSlots: EquipmentSlot[] =
    definition.handsRequired === 2 ? ["primary", "secondary"] : [preferredSlot];
  if (requiredSlots.some((slot) => !definition.slotCompatibility.includes(slot))) {
    return {
      valid: false,
      errors: [`${definition.name} is not compatible with the selected slot.`],
      assignments: [...current],
    };
  }
  const replacedSlots = new Set(requiredSlots);
  const candidate = current
    .filter(
      (assignment) =>
        assignment.characterId !== characterId ||
        (!replacedSlots.has(assignment.slot) && assignment.itemInstanceId !== itemInstanceId)
    )
    .concat(
      requiredSlots.map((slot) => ({
        characterId,
        slot,
        itemInstanceId,
      }))
    );
  return validateLoadout(characterId, candidate, catalog);
}

/**
 * Collects active effects from validated equipped instances.
 *
 * @param actor - Character whose loadout is evaluated.
 * @param catalog - Runtime item definitions and owned instances.
 * @returns Deterministic effects, once per instance.
 *
 * @remarks Two-handed assignments occupy two slots but never duplicate effects.
 * @see {@link validateLoadout} for slot and duplicate enforcement.
 * @since 0.1.0
 */
export function equippedEffects(
  actor: CharacterHardState,
  catalog: EquipmentRuntimeCatalog
): EquipmentEffect[] {
  const { definitions, instances } = mapsFor(catalog);
  const seen = new Set<string>();
  const effects: EquipmentEffect[] = [];
  for (const assignment of actor.equipment ?? []) {
    if (seen.has(assignment.itemInstanceId)) continue;
    seen.add(assignment.itemInstanceId);
    const instance = instances.get(assignment.itemInstanceId);
    const definition = instance ? definitions.get(instance.definitionId) : undefined;
    if (instance?.ownerCharacterId !== actor.characterId || !definition) continue;
    effects.push(
      ...definition.effects.filter(
        (effect) =>
          !("condition" in effect) ||
          !effect.condition ||
          conditionHolds(actor, effect.condition)
      )
    );
  }
  return effects;
}

/** "pick_lock" → "Pick Lock". Ids are the only labels a ruling carries for these. */
function label(id: string): string {
  return id.replace(/[_-]+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

function signedAmount(amount: number): string {
  return amount >= 0 ? `+${amount}` : `−${Math.abs(amount)}`;
}

/**
 * One equipment effect as a player-facing sentence fragment. Exhaustive over
 * {@link EquipmentEffectSchema} — adding an arm to that union without adding a case here is a
 * compile error, which is the point: it is what stops a raw object reaching a loot card.
 */
export function formatEquipmentEffect(effect: EquipmentEffect): string {
  switch (effect.type) {
    case "attribute_score":
      return `${signedAmount(effect.amount)} ${label(effect.attributeId)}`;
    case "skill_check":
      return `${signedAmount(effect.amount)} ${label(effect.skillId)} checks`;
    case "action_check":
      return `${signedAmount(effect.amount)} ${label(effect.actionId)}`;
    case "resource_capacity":
      return `${signedAmount(effect.amount)} max ${label(effect.resourceId)}`;
    case "action_enable":
      return `Enables ${label(effect.actionId)}`;
    case "skill_enable":
      return `Grants ${label(effect.skillId)} at ${effect.rank}`;
    case "lifestyle":
      return effect.description;
  }
}

export function equippedItemKind(
  actor: CharacterHardState,
  kind: string,
  catalog: EquipmentRuntimeCatalog
): boolean {
  const { definitions, instances } = mapsFor(catalog);
  return (actor.equipment ?? []).some((assignment) => {
    const instance = instances.get(assignment.itemInstanceId);
    const definition = instance ? definitions.get(instance.definitionId) : undefined;
    return instance?.ownerCharacterId === actor.characterId && definition?.kind === kind;
  });
}

export function equippedItemDefinition(
  actor: CharacterHardState,
  catalog: EquipmentRuntimeCatalog,
  kind?: string,
  itemId?: string
): ItemDefinition | undefined {
  const { definitions, instances } = mapsFor(catalog);
  for (const assignment of actor.equipment ?? []) {
    const instance = instances.get(assignment.itemInstanceId);
    const definition = instance ? definitions.get(instance.definitionId) : undefined;
    if (!instance || instance.ownerCharacterId !== actor.characterId || !definition) continue;
    if (itemId && itemId !== instance.id && itemId !== definition.id) continue;
    if (kind && definition.kind !== kind) continue;
    return definition;
  }
  return undefined;
}

export function equipmentAttributeBonus(
  actor: CharacterHardState,
  attributeId: string,
  catalog: EquipmentRuntimeCatalog
): number {
  let total = 0;
  for (const effect of equippedEffects(actor, catalog)) {
    if (effect.type === "attribute_score" && effect.attributeId === attributeId) {
      total += effect.amount;
    }
  }
  return total;
}

export function equipmentCheckBonus(
  actor: CharacterHardState,
  actionId: string,
  skillId: string | undefined,
  catalog: EquipmentRuntimeCatalog
): number {
  return equippedEffects(actor, catalog).reduce((sum, effect) => {
    if (effect.type === "action_check" && effect.actionId === actionId) return sum + effect.amount;
    if (effect.type === "skill_check" && skillId && effect.skillId === skillId) {
      return sum + effect.amount;
    }
    return sum;
  }, 0);
}

export function equipmentEnabledSkillRank(
  actor: CharacterHardState,
  skillId: string,
  catalog: EquipmentRuntimeCatalog
): MasteryRank | undefined {
  const ranks: MasteryRank[] = [];
  for (const effect of equippedEffects(actor, catalog)) {
    if (effect.type === "skill_enable" && effect.skillId === skillId) ranks.push(effect.rank);
  }
  const order: readonly MasteryRank[] = ["novice", "adept", "expert", "master"];
  return ranks.sort((a, b) => order.indexOf(b) - order.indexOf(a))[0];
}

export function equipmentEnablesAction(
  actor: CharacterHardState,
  actionId: string,
  catalog: EquipmentRuntimeCatalog
): boolean {
  return equippedEffects(actor, catalog).some(
    (effect) => effect.type === "action_enable" && effect.actionId === actionId
  );
}

export function equipmentResourceCapacityBonus(
  actor: CharacterHardState,
  resourceId: string,
  catalog: EquipmentRuntimeCatalog
): number {
  let total = 0;
  for (const effect of equippedEffects(actor, catalog)) {
    if (effect.type === "resource_capacity" && effect.resourceId === resourceId) {
      total += effect.amount;
    }
  }
  return total;
}
