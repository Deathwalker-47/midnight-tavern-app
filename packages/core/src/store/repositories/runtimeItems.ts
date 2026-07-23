import type { Db } from "../db.js";
import {
  EquipmentAssignmentSchema,
  EquipmentSlotSchema,
  ItemDefinitionSchema,
  ItemInstanceSchema,
  type EquipmentAssignment,
  type EquipmentSlot,
  type ItemDefinition,
  type ItemInstance,
} from "../../types/index.js";

interface DefinitionRow {
  id: string;
  story_id: string;
  name: string;
  description: string;
  tier: string;
  kind: string;
  slot_compatibility_json: string;
  hands_required: number;
  unique_item: number;
  stacking_key: string | null;
  requires_skill: string | null;
  effects_json: string;
  props_json: string;
  tags_json: string;
  config_version: number;
  created_at: string;
}

interface InstanceRow {
  id: string;
  story_id: string;
  owner_character_id: string;
  definition_id: string;
  quantity: number;
  acquired_at: string;
  provenance_json: string;
}

interface AssignmentRow {
  character_id: string;
  slot: string;
  item_instance_id: string;
}

function definitionFromRow(row: DefinitionRow): ItemDefinition {
  return ItemDefinitionSchema.parse({
    id: row.id,
    storyId: row.story_id,
    name: row.name,
    description: row.description,
    tier: row.tier,
    kind: row.kind,
    slotCompatibility: JSON.parse(row.slot_compatibility_json) as unknown,
    handsRequired: row.hands_required,
    unique: row.unique_item !== 0,
    ...(row.stacking_key ? { stackingKey: row.stacking_key } : {}),
    ...(row.requires_skill ? { requiresSkill: row.requires_skill } : {}),
    effects: JSON.parse(row.effects_json) as unknown,
    props: JSON.parse(row.props_json) as unknown,
    tags: JSON.parse(row.tags_json) as unknown,
    configVersion: row.config_version,
    createdAt: row.created_at,
  });
}

function instanceFromRow(row: InstanceRow): ItemInstance {
  return ItemInstanceSchema.parse({
    id: row.id,
    storyId: row.story_id,
    ownerCharacterId: row.owner_character_id,
    definitionId: row.definition_id,
    quantity: row.quantity,
    acquiredAt: row.acquired_at,
    provenance: JSON.parse(row.provenance_json) as unknown,
  });
}

function assignmentFromRow(row: AssignmentRow): EquipmentAssignment {
  return EquipmentAssignmentSchema.parse({
    characterId: row.character_id,
    slot: row.slot,
    itemInstanceId: row.item_instance_id,
  });
}

export interface RuntimeItemRepo {
  insertDefinition(definition: ItemDefinition): Promise<void>;
  getDefinition(id: string): Promise<ItemDefinition | undefined>;
  listDefinitions(storyId: string): Promise<ItemDefinition[]>;
  insertInstance(instance: ItemInstance): Promise<void>;
  getInstance(id: string): Promise<ItemInstance | undefined>;
  listInventory(characterId: string): Promise<ItemInstance[]>;
  setSlot(assignment: EquipmentAssignment): Promise<void>;
  clearSlot(characterId: string, slot: EquipmentSlot): Promise<void>;
  clearLoadout(characterId: string): Promise<void>;
  listLoadout(characterId: string): Promise<EquipmentAssignment[]>;
  deleteInstanceAndOrphanDefinition(instanceId: string): Promise<void>;
  deleteStoryItems(storyId: string): Promise<void>;
}

export function makeRuntimeItemRepo(db: Db): RuntimeItemRepo {
  return {
    async insertDefinition(definition) {
      const parsed = ItemDefinitionSchema.parse(definition);
      await db.run(
        `INSERT INTO item_definitions
          (id, story_id, name, description, tier, kind, slot_compatibility_json,
           hands_required, unique_item, stacking_key, requires_skill, effects_json,
           props_json, tags_json, config_version, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        parsed.id,
        parsed.storyId,
        parsed.name,
        parsed.description,
        parsed.tier,
        parsed.kind,
        JSON.stringify(parsed.slotCompatibility),
        parsed.handsRequired,
        parsed.unique ? 1 : 0,
        parsed.stackingKey ?? null,
        parsed.requiresSkill ?? null,
        JSON.stringify(parsed.effects),
        JSON.stringify(parsed.props),
        JSON.stringify(parsed.tags),
        parsed.configVersion,
        parsed.createdAt
      );
    },

    async getDefinition(id) {
      const row = await db.get<DefinitionRow>("SELECT * FROM item_definitions WHERE id = ?", id);
      return row ? definitionFromRow(row) : undefined;
    },

    async listDefinitions(storyId) {
      const rows = await db.all<DefinitionRow>(
        "SELECT * FROM item_definitions WHERE story_id = ? ORDER BY created_at, id",
        storyId
      );
      return rows.map(definitionFromRow);
    },

    async insertInstance(instance) {
      const parsed = ItemInstanceSchema.parse(instance);
      await db.run(
        `INSERT INTO item_instances
          (id, story_id, owner_character_id, definition_id, quantity, acquired_at,
           provenance_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        parsed.id,
        parsed.storyId,
        parsed.ownerCharacterId,
        parsed.definitionId,
        parsed.quantity,
        parsed.acquiredAt,
        JSON.stringify(parsed.provenance)
      );
    },

    async getInstance(id) {
      const row = await db.get<InstanceRow>("SELECT * FROM item_instances WHERE id = ?", id);
      return row ? instanceFromRow(row) : undefined;
    },

    async listInventory(characterId) {
      const rows = await db.all<InstanceRow>(
        "SELECT * FROM item_instances WHERE owner_character_id = ? ORDER BY acquired_at, id",
        characterId
      );
      return rows.map(instanceFromRow);
    },

    async setSlot(assignment) {
      const parsed = EquipmentAssignmentSchema.parse(assignment);
      const owner = await db.get<{ owner_character_id: string }>(
        "SELECT owner_character_id FROM item_instances WHERE id = ?",
        parsed.itemInstanceId
      );
      if (!owner || owner.owner_character_id !== parsed.characterId) {
        throw new Error("Only an item instance owned by the character can be equipped.");
      }
      await db.run(
        `INSERT INTO equipment_assignments (character_id, slot, item_instance_id)
         VALUES (?, ?, ?)
         ON CONFLICT(character_id, slot) DO UPDATE SET
           item_instance_id = excluded.item_instance_id`,
        parsed.characterId,
        parsed.slot,
        parsed.itemInstanceId
      );
    },

    async clearSlot(characterId, slot) {
      EquipmentSlotSchema.parse(slot);
      await db.run(
        "DELETE FROM equipment_assignments WHERE character_id = ? AND slot = ?",
        characterId,
        slot
      );
    },

    async clearLoadout(characterId) {
      await db.run("DELETE FROM equipment_assignments WHERE character_id = ?", characterId);
    },

    async listLoadout(characterId) {
      const rows = await db.all<AssignmentRow>(
        "SELECT * FROM equipment_assignments WHERE character_id = ? ORDER BY slot",
        characterId
      );
      return rows.map(assignmentFromRow);
    },

    async deleteInstanceAndOrphanDefinition(instanceId) {
      const instance = await db.get<{ definition_id: string }>(
        "SELECT definition_id FROM item_instances WHERE id = ?",
        instanceId
      );
      if (!instance) return;
      await db.run("DELETE FROM item_instances WHERE id = ?", instanceId);
      await db.run(
        `DELETE FROM item_definitions
         WHERE id = ?
           AND NOT EXISTS (SELECT 1 FROM item_instances WHERE definition_id = ?)`,
        instance.definition_id,
        instance.definition_id
      );
    },

    async deleteStoryItems(storyId) {
      await db.run("DELETE FROM item_definitions WHERE story_id = ?", storyId);
    },
  };
}
