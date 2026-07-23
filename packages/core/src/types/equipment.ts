import { z } from "zod";
import { ItemKindSchema, MasteryRankSchema } from "./primitives.js";
import { ConditionSchema } from "./conditions.js";

export const ItemTierSchema = z.enum([
  "common",
  "uncommon",
  "rare",
  "legendary",
  "mythical",
]);
export type ItemTier = z.infer<typeof ItemTierSchema>;

// The seven and only seven universal loadout positions.
export const EquipmentSlotSchema = z.enum([
  "primary",
  "secondary",
  "head",
  "body",
  "utility",
  "accessory_1",
  "accessory_2",
]);
export type EquipmentSlot = z.infer<typeof EquipmentSlotSchema>;

export const EQUIPMENT_SLOTS: readonly EquipmentSlot[] = Object.freeze([
  "primary",
  "secondary",
  "head",
  "body",
  "utility",
  "accessory_1",
  "accessory_2",
]);
export const MAX_EQUIPPED_SLOTS = EQUIPMENT_SLOTS.length;

export const EquipmentEffectSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("attribute_score"),
    attributeId: z.string(),
    amount: z.number().int(),
    condition: ConditionSchema.optional(),
  }),
  z.object({
    type: z.literal("skill_check"),
    skillId: z.string(),
    amount: z.number().int(),
    condition: ConditionSchema.optional(),
  }),
  z.object({
    type: z.literal("action_check"),
    actionId: z.string(),
    amount: z.number().int(),
    condition: ConditionSchema.optional(),
  }),
  z.object({
    type: z.literal("resource_capacity"),
    resourceId: z.string(),
    amount: z.number(),
  }),
  z.object({
    type: z.literal("action_enable"),
    actionId: z.string(),
  }),
  z.object({
    type: z.literal("skill_enable"),
    skillId: z.string(),
    rank: MasteryRankSchema.default("novice"),
  }),
  z.object({
    type: z.literal("lifestyle"),
    capabilityId: z.string(),
    description: z.string().trim().min(1).max(240),
  }),
]);
export type EquipmentEffect = z.infer<typeof EquipmentEffectSchema>;

export const ItemDefinitionSchema = z.object({
  id: z.string(),
  storyId: z.string(),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(1000),
  kind: ItemKindSchema,
  tier: ItemTierSchema,
  slotCompatibility: z.array(EquipmentSlotSchema).max(MAX_EQUIPPED_SLOTS).default([]),
  handsRequired: z.union([z.literal(0), z.literal(1), z.literal(2)]).default(0),
  unique: z.boolean().default(false),
  stackingKey: z.string().optional(),
  requiresSkill: z.string().optional(),
  effects: z.array(EquipmentEffectSchema).default([]),
  props: z.record(z.string(), z.number()).default({}),
  tags: z.array(z.string()).default([]),
  createdAt: z.string(),
  configVersion: z.number().int().positive(),
});
export type ItemDefinition = z.infer<typeof ItemDefinitionSchema>;

export const LootSourceTypeSchema = z.enum([
  "combat",
  "non_combat",
  "milestone",
  "quest",
]);
export type LootSourceType = z.infer<typeof LootSourceTypeSchema>;

export const LootProvenanceSchema = z.object({
  sourceType: LootSourceTypeSchema,
  sourceLabel: z.string().trim().min(1).max(200),
  encounterId: z.string().optional(),
  rulingId: z.string(),
  turnId: z.string(),
  tierBudget: ItemTierSchema,
  eligibilityReasons: z.array(z.string().trim().min(1).max(200)).default([]),
  proposalId: z.string().optional(),
  policyVersion: z.number().int().positive(),
  grantedAt: z.string(),
});
export type LootProvenance = z.infer<typeof LootProvenanceSchema>;

export const ItemInstanceSchema = z.object({
  id: z.string(),
  storyId: z.string(),
  definitionId: z.string(),
  ownerCharacterId: z.string(),
  quantity: z.number().int().positive().default(1),
  acquiredAt: z.string(),
  provenance: LootProvenanceSchema,
});
export type ItemInstance = z.infer<typeof ItemInstanceSchema>;

export const EquipmentAssignmentSchema = z.object({
  characterId: z.string(),
  slot: EquipmentSlotSchema,
  itemInstanceId: z.string(),
});
export type EquipmentAssignment = z.infer<typeof EquipmentAssignmentSchema>;

// Model-produced content candidate. It carries no IDs and cannot grant itself.
export const ItemProposalSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(1000),
  kind: ItemKindSchema,
  tier: ItemTierSchema,
  slotCompatibility: z.array(EquipmentSlotSchema).max(MAX_EQUIPPED_SLOTS).default([]),
  handsRequired: z.union([z.literal(0), z.literal(1), z.literal(2)]).default(0),
  unique: z.boolean().default(false),
  stackingKey: z.string().optional(),
  requiresSkill: z.string().optional(),
  effects: z.array(EquipmentEffectSchema).default([]),
  props: z.record(z.string(), z.number()).default({}),
  tags: z.array(z.string()).default([]),
});
export type ItemProposal = z.infer<typeof ItemProposalSchema>;

export const LootEligibilityContextSchema = z.object({
  storyId: z.string(),
  sourceType: LootSourceTypeSchema,
  sourceLabel: z.string(),
  maximumTier: ItemTierSchema,
  milestoneAuthorized: z.boolean().default(false),
  mythicalAuthorized: z.boolean().default(false),
  existingDefinitionIds: z.array(z.string()).default([]),
});
export type LootEligibilityContext = z.infer<typeof LootEligibilityContextSchema>;

export interface EquipmentRuntimeCatalog {
  definitions: readonly ItemDefinition[];
  instances: readonly ItemInstance[];
}
