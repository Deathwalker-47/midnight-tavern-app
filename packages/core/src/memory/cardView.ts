/**
 * Living card view (low-level-plan §M7.3).
 *
 * The read-only join of a character's hard state (authoritative mechanics) and soft state
 * (observed narrative) into the exact shape the UI's living-card drawer renders. This is a
 * pure projection: it never writes, and it computes nothing the two stored states don't
 * already contain — resource bars come from hard state, personality/mood/relationships from
 * soft state. A character with hard state but no soft profile yet still yields a card (soft
 * fields empty); the two sides never merge into one blob, preserving the wall even in view.
 */
import type { Store } from "../store/index.js";
import type {
  CharacterHardState,
  CharacterSoftState,
  ItemDef,
  StorySchema,
} from "../types/index.js";

/** One resource bar as the UI shows it (label from schema, values from hard state). */
export interface ResourceBar {
  id: string;
  label: string;
  current: number;
  max: number;
  playerVisible: boolean;
}

/** One inventory line, resolved against the schema's item table for its display name. */
export interface InventoryLine {
  itemId: string;
  name: string;
  qty: number;
}

/** One learned skill line for the card. */
export interface SkillLine {
  skillId: string;
  name: string;
  rank: string;
}

/** The full read-only card the UI renders for one character. */
export interface LivingCardView {
  characterId: string;
  name: string;
  isPlayer: boolean;
  alive: boolean;
  /** Mechanical side (hard state). */
  resources: ResourceBar[];
  inventory: InventoryLine[];
  skills: SkillLine[];
  /** Narrative side (soft state); undefined when the character has no soft profile yet. */
  soft?: {
    tier: CharacterSoftState["tier"];
    traits: string[];
    likes: string[];
    dislikes: string[];
    appearance?: string;
    speechStyle?: string;
    mood?: string;
    location?: string;
    goal?: string;
    relationships: CharacterSoftState["relationships"];
    recentObservations: string[];
  };
}

/** Project hard resources into labelled bars using the schema's ResourceDefs. */
function resourceBars(schema: StorySchema, hard: CharacterHardState): ResourceBar[] {
  const bars: ResourceBar[] = [];
  for (const def of schema.resources) {
    const state = hard.resources[def.id];
    if (!state) continue;
    bars.push({
      id: def.id,
      label: def.label,
      current: state.current,
      max: state.max,
      playerVisible: def.playerVisible,
    });
  }
  return bars;
}

/** Resolve inventory item ids to display names via the schema item table. */
function inventoryLines(itemsById: Map<string, ItemDef>, hard: CharacterHardState): InventoryLine[] {
  return hard.inventory
    .filter((e) => e.qty > 0)
    .map((e) => ({ itemId: e.itemId, name: itemsById.get(e.itemId)?.name ?? e.itemId, qty: e.qty }));
}

/** Resolve learned skill ids to display names via the schema skill table. */
function skillLines(schema: StorySchema, hard: CharacterHardState): SkillLine[] {
  const byId = new Map(schema.skills.map((s) => [s.id, s]));
  return hard.skills.map((s) => ({
    skillId: s.skillId,
    name: byId.get(s.skillId)?.name ?? s.skillId,
    rank: s.rank,
  }));
}

/** Condense a soft state into the card's narrative slice (most-recent observations first). */
function softSlice(soft: CharacterSoftState, recentObs: number): NonNullable<LivingCardView["soft"]> {
  return {
    tier: soft.tier,
    traits: soft.identity.traits,
    likes: soft.identity.likes,
    dislikes: soft.identity.dislikes,
    ...(soft.identity.appearance !== undefined ? { appearance: soft.identity.appearance } : {}),
    ...(soft.identity.speechStyle !== undefined ? { speechStyle: soft.identity.speechStyle } : {}),
    ...(soft.current.mood !== undefined ? { mood: soft.current.mood } : {}),
    ...(soft.current.location !== undefined ? { location: soft.current.location } : {}),
    ...(soft.current.goal !== undefined ? { goal: soft.current.goal } : {}),
    relationships: soft.relationships,
    recentObservations: soft.observations.slice(-recentObs).reverse().map((o) => o.text),
  };
}

/**
 * Build the living card for one character. Returns undefined only when the character id is
 * unknown to the store. `recentObservations` defaults to the 10 newest.
 */
export async function getLivingCard(
  store: Store,
  schema: StorySchema,
  characterId: string,
  recentObservations = 10
): Promise<LivingCardView | undefined> {
  const record = await store.characters.get(characterId);
  if (!record) return undefined;

  const itemsById = new Map(schema.items.map((i) => [i.id, i]));
  const card: LivingCardView = {
    characterId: record.id,
    name: record.name,
    isPlayer: record.isPlayer,
    alive: record.hard.alive,
    resources: resourceBars(schema, record.hard),
    inventory: inventoryLines(itemsById, record.hard),
    skills: skillLines(schema, record.hard),
  };
  if (record.soft) card.soft = softSlice(record.soft, recentObservations);
  return card;
}
