import { equipItem, validateLoadout } from "../engine/index.js";
import type { Store } from "../store/index.js";
import type {
  EquipmentAssignment,
  EquipmentSlot,
  ItemDefinition,
  ItemInstance,
} from "../types/index.js";
import { randomUUID } from "../util/uuid.js";

export interface CharacterInventoryView {
  definitions: ItemDefinition[];
  instances: ItemInstance[];
  assignments: EquipmentAssignment[];
}

export async function getCharacterInventory(
  store: Store,
  characterId: string
): Promise<CharacterInventoryView> {
  const character = await store.characters.get(characterId);
  if (!character) throw new Error(`Unknown character ${characterId}.`);
  const [definitions, instances, assignments] = await Promise.all([
    store.runtimeItems.listDefinitions(character.storyId),
    store.runtimeItems.listInventory(characterId),
    store.runtimeItems.listLoadout(characterId),
  ]);
  return { definitions, instances, assignments };
}

async function persistLoadout(
  store: Store,
  characterId: string,
  assignments: readonly EquipmentAssignment[]
): Promise<void> {
  await store.runtimeItems.clearLoadout(characterId);
  for (const assignment of assignments) await store.runtimeItems.setSlot(assignment);
  const character = await store.characters.get(characterId);
  if (character) {
    await store.characters.updateHard(characterId, {
      ...character.hard,
      equipment: [...assignments],
    });
  }
}

export async function equipRuntimeItem(
  store: Store,
  characterId: string,
  itemInstanceId: string,
  slot: EquipmentSlot
): Promise<EquipmentAssignment[]> {
  const character = await store.characters.get(characterId);
  if (!character) throw new Error(`Unknown character ${characterId}.`);
  const inventory = await getCharacterInventory(store, characterId);
  const result = equipItem(characterId, inventory.assignments, itemInstanceId, slot, {
    definitions: inventory.definitions,
    instances: inventory.instances,
  });
  if (!result.valid) throw new Error(result.errors.join(" "));
  await store.transaction(async () => {
    await persistLoadout(store, characterId, result.assignments);
    const story = await store.stories.get(character.storyId);
    await store.events.insert({
      id: randomUUID(),
      storyId: character.storyId,
      turnIndex: Math.max(0, (await store.messages.nextIdx(character.storyId)) - 1),
      actorId: characterId,
      kind: "equipment_changed",
      payload: { itemInstanceId, slot, assignments: result.assignments },
      rulebookVersion: story?.rulebookVersion ?? 1,
      createdAt: Date.now(),
    });
  });
  return result.assignments;
}

export async function unequipRuntimeSlot(
  store: Store,
  characterId: string,
  slot: EquipmentSlot
): Promise<EquipmentAssignment[]> {
  const character = await store.characters.get(characterId);
  if (!character) throw new Error(`Unknown character ${characterId}.`);
  const inventory = await getCharacterInventory(store, characterId);
  const selected = inventory.assignments.find((assignment) => assignment.slot === slot);
  const assignments = selected
    ? inventory.assignments.filter(
        (assignment) => assignment.itemInstanceId !== selected.itemInstanceId
      )
    : inventory.assignments;
  const validation = validateLoadout(characterId, assignments, {
    definitions: inventory.definitions,
    instances: inventory.instances,
  });
  if (!validation.valid) throw new Error(validation.errors.join(" "));
  await store.transaction(async () => {
    await persistLoadout(store, characterId, validation.assignments);
    const story = await store.stories.get(character.storyId);
    await store.events.insert({
      id: randomUUID(),
      storyId: character.storyId,
      turnIndex: Math.max(0, (await store.messages.nextIdx(character.storyId)) - 1),
      actorId: characterId,
      kind: "equipment_changed",
      payload: { removedSlot: slot, assignments: validation.assignments },
      rulebookVersion: story?.rulebookVersion ?? 1,
      createdAt: Date.now(),
    });
  });
  return validation.assignments;
}
