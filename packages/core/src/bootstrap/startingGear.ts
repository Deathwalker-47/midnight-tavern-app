import { z } from "zod";
import { EQUIPMENT_LOOT_CONFIG } from "../config/index.js";
import type { CharacterCard } from "../importer/index.js";
import type { Store } from "../store/index.js";
import {
  EQUIPMENT_SLOTS,
  EquipmentSlotSchema,
  ItemProposalSchema,
  MAX_EQUIPPED_SLOTS,
  type EquipmentAssignment,
  type EquipmentSlot,
  type ItemKind,
  type ItemProposal,
} from "../types/index.js";
import { randomUUID } from "../util/uuid.js";

/**
 * Validates one bounded, creation-time possession before runtime installation.
 * The seed is intentionally separate from the frozen StorySchema item catalog.
 *
 * @remarks
 * Validation extends {@link ItemProposalSchema} with one optional preferred
 * equipment slot. Only instances actually owned by the player are persisted.
 *
 * @see {@link resolveStartingGear} for merging model and source-derived seeds.
 * @see {@link persistStartingGear} for runtime installation.
 * @since 0.2.4
 */
export const StartingGearSeedSchema = ItemProposalSchema.extend({
  preferredSlot: EquipmentSlotSchema.optional(),
});

/**
 * A validated player possession proposed during the actor-foundation stage.
 *
 * @remarks
 * Validation is provided by {@link StartingGearSeedSchema}; item and slot
 * constraints otherwise match the runtime equipment system.
 *
 * @see {@link StartingGearSeedSchema} for runtime validation.
 * @since 0.2.4
 */
export type StartingGearSeed = z.infer<typeof StartingGearSeedSchema>;

/**
 * Narrative sources allowed to establish the player's initial possessions.
 *
 * @property sourceCard - Imported card whose player-facing prose may describe carried gear.
 * @property persona - Selected player persona whose description may establish carried gear.
 *
 * @remarks
 * Source text is reference data only. It cannot create a universe-wide item catalog.
 *
 * @see {@link explicitStartingGear} for deterministic extraction.
 * @since 0.2.4
 */
export type StartingGearCreationSource = {
  sourceCard?: CharacterCard;
  persona?: { id?: string; name: string; description: string };
  /**
   * Prompt-time macro-expanded source text. The original card/persona remains
   * untouched for persistence and later reevaluation.
   */
  resolvedStartingPossessionSources?: {
    card?: string;
    persona?: string;
  };
};

interface GearLexeme {
  pattern: RegExp;
  name: string;
  kind: ItemKind;
  slots: EquipmentSlot[];
  preferredSlot?: EquipmentSlot;
  handsRequired?: 0 | 1 | 2;
}

const POSSESSION_CUE =
  /\b(?:carry|carries|carrying|wield|wields|wielding|wear|wears|wearing|armed with|equipped with|keeps?|holsters?|holstered|straps?|strapped|packs?|packed)\b/i;

const GEAR_LEXEMES: readonly GearLexeme[] = [
  { pattern: /\blongbow\b/i, name: "Longbow", kind: "weapon", slots: ["primary"], preferredSlot: "primary", handsRequired: 2 },
  { pattern: /\b(?:shortbow|bow)\b/i, name: "Bow", kind: "weapon", slots: ["primary"], preferredSlot: "primary", handsRequired: 2 },
  { pattern: /\b(?:pistol|revolver|handgun)\b/i, name: "Pistol", kind: "weapon", slots: ["primary", "secondary"], preferredSlot: "primary", handsRequired: 1 },
  { pattern: /\b(?:rifle|shotgun|musket)\b/i, name: "Long Gun", kind: "weapon", slots: ["primary"], preferredSlot: "primary", handsRequired: 2 },
  { pattern: /\b(?:knife|dagger)\b/i, name: "Knife", kind: "weapon", slots: ["primary", "secondary"], preferredSlot: "secondary", handsRequired: 1 },
  { pattern: /\b(?:sword|blade|machete|axe)\b/i, name: "Blade", kind: "weapon", slots: ["primary", "secondary"], preferredSlot: "primary", handsRequired: 1 },
  { pattern: /\b(?:helmet|helm|hat)\b/i, name: "Headwear", kind: "armor", slots: ["head"], preferredSlot: "head" },
  { pattern: /\b(?:armor|armour|breastplate|vest)\b/i, name: "Body Armor", kind: "armor", slots: ["body"], preferredSlot: "body" },
  { pattern: /\b(?:coat|cloak|jacket|robes?)\b/i, name: "Protective Clothing", kind: "armor", slots: ["body"], preferredSlot: "body" },
  { pattern: /\b(?:lockpicks?|toolkit|tools?|medkit|first aid kit|rope|lantern|torch|compass|radio|phone|binoculars|spellbook)\b/i, name: "Field Tool", kind: "tool", slots: ["utility"], preferredSlot: "utility" },
  { pattern: /\b(?:ring|amulet|necklace|bracelet|watch|talisman)\b/i, name: "Personal Accessory", kind: "accessory", slots: ["accessory_1", "accessory_2"], preferredSlot: "accessory_1" },
];

function titleCase(value: string): string {
  return value.replace(
    /(^|[\s-])([\p{L}\p{N}])/gu,
    (_match, boundary: string, letter: string) =>
      `${boundary}${letter.toLocaleUpperCase()}`
  );
}

function lastPossessionCue(
  text: string,
  itemIndex: number
): { end: number } | undefined {
  const boundary = Math.max(
    text.lastIndexOf(".", itemIndex - 1),
    text.lastIndexOf("!", itemIndex - 1),
    text.lastIndexOf("?", itemIndex - 1),
    text.lastIndexOf(";", itemIndex - 1),
    text.lastIndexOf("\n", itemIndex - 1)
  );
  const beforeItem = text.slice(boundary + 1, itemIndex);
  const matcher = new RegExp(POSSESSION_CUE.source, "giu");
  let latest: RegExpExecArray | undefined;
  for (const candidate of beforeItem.matchAll(matcher)) latest = candidate;
  if (!latest || latest.index === undefined) return undefined;
  return { end: boundary + 1 + latest.index + latest[0].length };
}

function displayName(
  text: string,
  match: RegExpExecArray,
  cueEnd: number,
  fallback: string
): string {
  const rawPhrase = text.slice(cueEnd, match.index + match[0].length);
  const finalListedItem =
    rawPhrase.split(/\s*(?:,|\band\b|\bbut\b|\bwhile\b)\s*/iu).at(-1) ?? rawPhrase;
  const cleaned = finalListedItem
    .replace(/^[\s:–—-]+/u, "")
    .replace(/^(?:(?:a|an|the|his|her|their|its|my|our|your)\s+)+/iu, "")
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/gu, "")
    .trim();
  const bounded =
    cleaned.length > 0 && cleaned.split(/\s+/u).length <= 8
      ? cleaned
      : match[0] || fallback;
  return titleCase(bounded).slice(0, 100);
}

function seedFromMatch(
  text: string,
  match: RegExpExecArray,
  lexeme: GearLexeme,
  sourceLabel: string
): StartingGearSeed | undefined {
  const cue = lastPossessionCue(text, match.index);
  if (!cue) return undefined;
  return StartingGearSeedSchema.parse({
    name: displayName(text, match, cue.end, lexeme.name),
    description: `A starting possession explicitly described by the ${sourceLabel}.`,
    kind: lexeme.kind,
    tier: "common",
    slotCompatibility: lexeme.slots,
    handsRequired: lexeme.handsRequired ?? 0,
    unique: false,
    effects: [],
    props: {},
    tags: ["starting_gear", sourceLabel],
    ...(lexeme.preferredSlot ? { preferredSlot: lexeme.preferredSlot } : {}),
  });
}

function sourceTexts(source: StartingGearCreationSource): Array<{ label: string; text: string }> {
  const rows: Array<{ label: string; text: string }> = [];
  const resolved = source.resolvedStartingPossessionSources;
  if (resolved?.card?.trim()) rows.push({ label: "card", text: resolved.card });
  if (resolved?.persona?.trim()) rows.push({ label: "persona", text: resolved.persona });
  if (rows.length > 0) return rows;
  const card = source.sourceCard?.data;
  if (card) {
    const text = [
      card.description,
      card.personality,
      card.scenario,
      card.first_mes,
      card.creator_notes ?? "",
    ].filter(Boolean).join("\n");
    if (text.trim()) rows.push({ label: "card", text });
  }
  if (source.persona?.description.trim()) {
    rows.push({ label: "persona", text: source.persona.description });
  }
  return rows;
}

/**
 * Extract only possessions explicitly attached to the imported card/persona.
 * This is a deterministic backstop for the model's bounded actor-foundation output.
 *
 * @param source - Imported card and selected persona used during story creation.
 * @returns At most seven unique, validated starting-gear seeds.
 *
 * @remarks
 * Possession cues and a conservative gear lexicon prevent unrelated world objects
 * from becoming player inventory.
 *
 * @see {@link resolveStartingGear} for model-seed merging and fallback behavior.
 * @since 0.2.4
 */
export function explicitStartingGear(source: StartingGearCreationSource): StartingGearSeed[] {
  const seeds: StartingGearSeed[] = [];
  for (const row of sourceTexts(source)) {
    for (const lexeme of GEAR_LEXEMES) {
      const flags = lexeme.pattern.flags.includes("g")
        ? lexeme.pattern.flags
        : `${lexeme.pattern.flags}g`;
      for (const match of row.text.matchAll(new RegExp(lexeme.pattern.source, flags))) {
        const seed = seedFromMatch(row.text, match, lexeme, row.label);
        if (seed) seeds.push(seed);
      }
    }
  }
  return dedupeStartingGear(seeds).slice(0, MAX_EQUIPPED_SLOTS);
}

function normalizedName(seed: Pick<ItemProposal, "name">): string {
  return seed.name.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function dedupeStartingGear(seeds: readonly StartingGearSeed[]): StartingGearSeed[] {
  const seen: Array<{ key: string; kind: ItemKind }> = [];
  const output: StartingGearSeed[] = [];
  for (const value of seeds) {
    const parsed = StartingGearSeedSchema.safeParse(value);
    if (!parsed.success) continue;
    const key = normalizedName(parsed.data);
    if (
      !key ||
      seen.some((entry) =>
        entry.kind === parsed.data.kind &&
        (entry.key === key || entry.key.includes(key) || key.includes(entry.key))
      )
    ) continue;
    seen.push({ key, kind: parsed.data.kind });
    output.push(parsed.data);
  }
  return output;
}

/**
 * Resolve the bounded player possessions for installation. When a card/persona source
 * exists, only deterministically verified carried gear is accepted; model proposals
 * cannot add scenery or another character's items. Premise-only creation may use the
 * bounded actor-foundation proposals. An empty result receives neutral personal effects.
 *
 * @param source - Imported card and selected persona used during story creation.
 * @param generated - Bounded actor-foundation proposals used only without attached card/persona prose.
 * @returns Unique starting possessions capped at {@link MAX_EQUIPPED_SLOTS}.
 *
 * @remarks
 * Attached source prose is authoritative over model-selected basics. Invalid and
 * duplicate proposals are dropped before the cap is applied.
 *
 * @see {@link explicitStartingGear} for deterministic source extraction.
 * @see {@link persistStartingGear} for runtime installation.
 * @since 0.2.4
 */
export function resolveStartingGear(
  source: StartingGearCreationSource,
  generated: readonly StartingGearSeed[] = []
): StartingGearSeed[] {
  const explicit = explicitStartingGear(source);
  const hasAttachedSource = sourceTexts(source).length > 0;
  const merged = dedupeStartingGear(
    hasAttachedSource ? explicit : generated
  ).slice(0, MAX_EQUIPPED_SLOTS);
  if (merged.length > 0) return merged;
  return [StartingGearSeedSchema.parse({
    name: "Basic Personal Effects",
    description: "Ordinary clothing and small necessities appropriate to the character.",
    kind: "misc",
    tier: "common",
    slotCompatibility: [],
    handsRequired: 0,
    unique: false,
    effects: [],
    props: {},
    tags: ["starting_gear", "basic"],
  })];
}

function firstAvailableSlot(
  seed: StartingGearSeed,
  used: ReadonlySet<EquipmentSlot>
): EquipmentSlot | undefined {
  const candidates = [
    seed.preferredSlot,
    ...seed.slotCompatibility,
    ...EQUIPMENT_SLOTS,
  ].filter((slot): slot is EquipmentSlot => Boolean(slot));
  return candidates.find((slot) => seed.slotCompatibility.includes(slot) && !used.has(slot));
}

/**
 * Install only the player's resolved starting possessions in runtime item tables.
 * No unrelated universe-wide definitions are created.
 *
 * @param store - Active story store whose transaction contains character creation.
 * @param storyId - Story that owns the runtime item definitions.
 * @param characterId - Player character that owns every created item instance.
 * @param seeds - Validated, bounded possessions to install.
 * @returns Compatible equipment assignments; inventory-only items are omitted.
 *
 * @remarks
 * Definitions, instances, provenance, and compatible slots are persisted together.
 * The caller owns the surrounding transaction and hard-state synchronization.
 *
 * @see {@link resolveStartingGear} for seed selection.
 * @since 0.2.4
 */
export async function persistStartingGear(
  store: Store,
  storyId: string,
  characterId: string,
  seeds: readonly StartingGearSeed[]
): Promise<EquipmentAssignment[]> {
  const assignments: EquipmentAssignment[] = [];
  const usedSlots = new Set<EquipmentSlot>();
  const acquiredAt = new Date().toISOString();
  for (const seed of dedupeStartingGear(seeds).slice(0, MAX_EQUIPPED_SLOTS)) {
    const definitionId = randomUUID();
    const instanceId = randomUUID();
    await store.runtimeItems.insertDefinition({
      id: definitionId,
      storyId,
      name: seed.name,
      description: seed.description,
      kind: seed.kind,
      tier: seed.tier,
      slotCompatibility: seed.slotCompatibility,
      handsRequired: seed.handsRequired,
      unique: seed.unique,
      ...(seed.stackingKey ? { stackingKey: seed.stackingKey } : {}),
      ...(seed.requiresSkill ? { requiresSkill: seed.requiresSkill } : {}),
      effects: seed.effects,
      props: seed.props,
      tags: [...new Set([...seed.tags, "starting_gear"])],
      createdAt: acquiredAt,
      configVersion: EQUIPMENT_LOOT_CONFIG.version,
    });
    await store.runtimeItems.insertInstance({
      id: instanceId,
      storyId,
      definitionId,
      ownerCharacterId: characterId,
      quantity: 1,
      acquiredAt,
      provenance: {
        sourceType: "quest",
        sourceLabel: "Character creation",
        rulingId: `story_creation:${storyId}`,
        turnId: `story_creation:${storyId}`,
        tierBudget: seed.tier,
        eligibilityReasons: ["Established starting possession"],
        policyVersion: EQUIPMENT_LOOT_CONFIG.version,
        grantedAt: acquiredAt,
      },
    });
    const slot = firstAvailableSlot(seed, usedSlots);
    if (!slot || assignments.length >= MAX_EQUIPPED_SLOTS) continue;
    const assignment = { characterId, slot, itemInstanceId: instanceId };
    await store.runtimeItems.setSlot(assignment);
    assignments.push(assignment);
    usedSlots.add(slot);
  }
  return assignments;
}
