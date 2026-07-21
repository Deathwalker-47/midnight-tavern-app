/**
 * Card → import mapping (low-level-plan §M9.4).
 *
 * Projects a parsed character card onto the shapes the rest of the app consumes:
 *   • a **premise** string handed to the bootstrapper (name + description + personality +
 *     scenario) — this is the ONLY path from card to mechanics, and it goes through the
 *     bootstrapper, never directly. The card cannot inject items/skills/resources (the wall).
 *   • a **soft identity** seed (description→backstory/appearance, personality→traits),
 *   • **selectable openings** (first_mes + alternate_greetings),
 *   • **lorebook rows** (character_book entries → keyword-triggered LorebookEntry rows).
 *
 * Everything here is pure shaping; persistence (assigning ids, writing rows, running the
 * bootstrapper) is the caller's job. Row ids are left to the caller so this stays testable
 * and free of side effects.
 */
import type { CharacterCard } from "./cardTypes.js";
import type { SoftIdentity, Blueprint } from "../types/index.js";

/** A lorebook row awaiting a story id + row id (the persistence-free part of LorebookEntry). */
export interface LorebookSeed {
  keys: string[];
  content: string;
  enabled: boolean;
}

/** The persistence-free result of mapping a card. */
export interface MappedCard {
  /** Display name (falls back to "Imported Character"). */
  name: string;
  /** Premise text for the bootstrapper — the sole card→mechanics channel. */
  premise: string;
  /** Seed soft identity (traits/appearance/backstory only — no mechanics). */
  identity: SoftIdentity;
  /** Opening scenes the player may pick from (first_mes first, then alternates). */
  openings: string[];
  /** Lorebook rows to persist for the story. */
  lorebook: LorebookSeed[];
  /**
   * Author-facing Story Blueprint (§3), mapped from the card's narrative/style fields. Persisted
   * on the story so the blueprint editor and narrator style slots are populated from the import.
   * Style-only — the card's `system_prompt` lands in `systemPrompt`, never in mechanics.
   */
  blueprint: Blueprint;
}

/** Split a personality blob into discrete traits (comma/newline separated, deduped). */
function toTraits(personality: string): string[] {
  const seen = new Set<string>();
  const traits: string[] = [];
  for (const raw of personality.split(/[,\n;]+/)) {
    const t = raw.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    traits.push(t);
  }
  return traits;
}

/** Assemble the bootstrapper premise from the card's narrative fields. */
function buildPremise(card: CharacterCard): string {
  const d = card.data;
  const parts: string[] = [];
  if (d.name) parts.push(`Character: ${d.name}`);
  if (d.description) parts.push(`Description: ${d.description}`);
  if (d.personality) parts.push(`Personality: ${d.personality}`);
  if (d.scenario) parts.push(`Scenario: ${d.scenario}`);
  return parts.join("\n\n");
}

/**
 * Map the card's narrative/style fields to an internal Blueprint (§3). Only style/identity/premise
 * fields cross over — `system_prompt` becomes the user style directive, `mes_example` the few-shot
 * voice block. Nothing here can carry mechanics. Empty strings are dropped so the blueprint stays
 * sparse (every field optional).
 */
function buildBlueprint(card: CharacterCard): Blueprint {
  const d = card.data;
  const bp: Blueprint = {};
  const set = (v: string | undefined, k: keyof Blueprint) => {
    const t = v?.trim();
    if (t) (bp as Record<string, unknown>)[k] = t;
  };
  set(d.name, "name");
  set(d.description, "description");
  set(d.personality, "personality");
  set(d.scenario, "scenario");
  set(d.first_mes, "firstMessage");
  set(d.mes_example, "exampleDialogue");
  set(d.system_prompt, "systemPrompt");
  set(d.creator_notes, "creatorNotes");
  const greetings = d.alternate_greetings.map((s) => s.trim()).filter(Boolean);
  if (greetings.length) bp.alternateGreetings = greetings;
  if (d.tags.length) bp.tags = d.tags;
  return bp;
}

/**
 * Map a parsed card to the app's import shapes. `first_mes` becomes the primary opening;
 * `alternate_greetings` follow. Disabled/empty character-book entries are dropped.
 */
export function mapCardToImport(card: CharacterCard): MappedCard {
  const d = card.data;

  const identity: SoftIdentity = {
    traits: toTraits(d.personality),
    likes: [],
    dislikes: [],
    ...(d.description ? { appearance: d.description, backstory: d.description } : {}),
  };

  const openings = [d.first_mes, ...d.alternate_greetings]
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const lorebook: LorebookSeed[] = (d.character_book?.entries ?? [])
    .filter((e) => e.enabled && e.content.trim().length > 0 && e.keys.length > 0)
    .map((e) => ({
      keys: e.keys.map((k) => k.trim()).filter(Boolean),
      content: e.content.trim(),
      enabled: true,
    }))
    .filter((e) => e.keys.length > 0);

  return {
    name: d.name.trim() || "Imported Character",
    premise: buildPremise(card),
    identity,
    openings,
    lorebook,
    blueprint: buildBlueprint(card),
  };
}
