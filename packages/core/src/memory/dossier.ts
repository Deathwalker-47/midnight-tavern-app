/**
 * Character dossier (low-level-plan-v2 §7) — the deep read-only profile view.
 *
 * Where {@link getLivingCard} is the compact drawer projection, the dossier is the full join of a
 * character's hard state (the authoritative sheet) and soft state (mentality, current snapshot,
 * observation timeline, relationship graph), plus two derived views:
 *
 *   • REVERSE RELATIONSHIPS — soft `relationships` are stored one-directional (A→B). The dossier
 *     scans every OTHER character's edges for ones pointing AT this character and assembles the
 *     `incoming` side, so the UI can show "who trusts/fears them" without the analyzer ever writing
 *     a back-edge.
 *   • INVOLVED THREADS — world `unresolvedThreads` whose title or note names this character.
 *
 * Pure projection: never writes, preserves the hard/soft wall (hard fields come only from the
 * ledger, soft only from the analyzer). Returns undefined only when the character id is unknown.
 */
import type { Store } from "../store/index.js";
import type {
  CharacterHardState,
  CharacterSoftState,
  ItemDef,
  StorySchema,
} from "../types/index.js";

/** An outgoing relationship edge: this character → someone (name resolved for display). §7. */
export interface DossierOutgoingEdge {
  toCharacterId: string;
  toName: string;
  trust: number;
  power: number;
  feeling?: string;
}

/** An incoming relationship edge: someone → this character (reverse-resolved). §7. */
export interface DossierIncomingEdge {
  fromCharacterId: string;
  fromName: string;
  trust: number;
  power: number;
  feeling?: string;
}

/** One skill line with progress toward the next rank (hard state + schema advance rule). */
export interface DossierSkill {
  skillId: string;
  name: string;
  rank: string;
  successCount: number;
  /** Successes still needed to rank up, or null at master (no next rank). */
  toNext: number | null;
}

/** The full read-only dossier for one character. */
export interface Dossier {
  characterId: string;
  isPlayer: boolean;
  identity: {
    name: string;
    /** Short "what they are" descriptor — appearance-derived; blank when unknown (v1 has no field). */
    whatTheyAre: string;
    appearance?: string;
    /** Soft tracking tier (how deeply the analyzer tracks them). */
    tier?: CharacterSoftState["tier"];
  };
  mentality: {
    traits: string[];
    behavioralSignatures: { pattern: string; confidence: number }[];
    mood?: string;
    speechStyle?: string;
    /** Narrative disposition (§7 "OUTLOOK") — authoring/blueprint sourced, not analyzer-written. */
    outlook?: string;
  };
  currentState: {
    mood?: string;
    location?: string;
    goal?: string;
  };
  past: {
    backstory?: string;
    /** Observation timeline, oldest → newest (the analyzer's capped FIFO order). */
    observations: { turnIdx: number; text: string }[];
  };
  relationships: {
    outgoing: DossierOutgoingEdge[];
    /** Reverse-resolved: edges from other characters that point at this one. */
    incoming: DossierIncomingEdge[];
    /** Convenience: this character's edge toward the player, if any. */
    toPlayer?: { trust: number; power: number; feeling?: string };
  };
  sheet: {
    resources: { id: string; label: string; current: number; max: number }[];
    skills: DossierSkill[];
    inventory: { itemId: string; name: string; qty: number; kind: string }[];
    alive: boolean;
  };
  /** World threads that name this character (unresolved only). */
  involvedThreads: { title: string; note: string }[];
}

/** Best-effort "what they are" from appearance (first clause) — blank when there's nothing to show. */
function whatTheyAreFrom(soft: CharacterSoftState | undefined): string {
  const appearance = soft?.identity.appearance?.trim();
  if (!appearance) return "";
  const firstClause = appearance.split(/[.;]/)[0]!.trim();
  return firstClause.length > 60 ? `${firstClause.slice(0, 59)}…` : firstClause;
}

/** Project the hard sheet (resources/skills/inventory), resolving display names via the schema. */
function buildSheet(schema: StorySchema, hard: CharacterHardState, itemsById: Map<string, ItemDef>) {
  const skillDefs = new Map(schema.skills.map((s) => [s.id, s]));
  const resources: Dossier["sheet"]["resources"] = [];
  for (const def of schema.resources) {
    const state = hard.resources[def.id];
    if (state) resources.push({ id: def.id, label: def.label, current: state.current, max: state.max });
  }
  const skills: DossierSkill[] = hard.skills.map((s) => {
    const def = skillDefs.get(s.skillId);
    const perRank = def?.masteryAdvance.successesPerRank;
    const atMaster = s.rank === "master";
    return {
      skillId: s.skillId,
      name: def?.name ?? s.skillId,
      rank: s.rank,
      successCount: s.successCount,
      toNext: atMaster || perRank === undefined ? null : Math.max(0, perRank - s.successCount),
    };
  });
  const inventory = hard.inventory
    .filter((e) => e.qty > 0)
    .map((e) => {
      const def = itemsById.get(e.itemId);
      return { itemId: e.itemId, name: def?.name ?? e.itemId, qty: e.qty, kind: def?.kind ?? "misc" };
    });
  return { resources, skills, inventory, alive: hard.alive };
}

/**
 * Build the full dossier for one character. `observationLimit` caps the returned timeline to the
 * newest N (default: all). Returns undefined when the character id is unknown to the store.
 */
export async function getCharacterDossier(
  store: Store,
  schema: StorySchema,
  characterId: string,
  observationLimit?: number
): Promise<Dossier | undefined> {
  const roster = await store.characters.listByStory(schema.storyId);
  const self = roster.find((c) => c.id === characterId);
  if (!self) return undefined;

  const nameById = new Map(roster.map((c) => [c.id, c.name]));
  const playerId = roster.find((c) => c.isPlayer)?.id;
  const itemsById = new Map(schema.items.map((i) => [i.id, i]));
  const soft = self.soft;

  // Outgoing: this character's own edges. Reverse (incoming): every OTHER character's edge whose
  // target is this character, re-presented from the source's point of view.
  const outgoing: DossierOutgoingEdge[] = (soft?.relationships ?? []).map((r) => ({
    toCharacterId: r.toCharacterId,
    toName: nameById.get(r.toCharacterId) ?? r.toCharacterId,
    trust: r.trust,
    power: r.power,
    ...(r.feeling !== undefined ? { feeling: r.feeling } : {}),
  }));

  const incoming: DossierIncomingEdge[] = [];
  for (const other of roster) {
    if (other.id === characterId || !other.soft) continue;
    for (const edge of other.soft.relationships) {
      if (edge.toCharacterId !== characterId) continue;
      incoming.push({
        fromCharacterId: other.id,
        fromName: other.name,
        trust: edge.trust,
        power: edge.power,
        ...(edge.feeling !== undefined ? { feeling: edge.feeling } : {}),
      });
    }
  }

  // Convenience edge toward the player (skip when this character IS the player).
  let toPlayer: Dossier["relationships"]["toPlayer"];
  if (playerId && playerId !== characterId) {
    const edge = soft?.relationships.find((r) => r.toCharacterId === playerId);
    if (edge) {
      toPlayer = {
        trust: edge.trust,
        power: edge.power,
        ...(edge.feeling !== undefined ? { feeling: edge.feeling } : {}),
      };
    }
  }

  const allObs = soft?.observations ?? [];
  const observations =
    observationLimit !== undefined ? allObs.slice(-observationLimit) : allObs.slice();

  // World threads that name this character by name (case-insensitive substring in title or note).
  const world = await store.worldSoft.get(schema.storyId);
  const needle = self.name.toLowerCase();
  const involvedThreads = (world?.unresolvedThreads ?? [])
    .filter((t) => !t.resolved)
    .filter(
      (t) => t.title.toLowerCase().includes(needle) || t.note.toLowerCase().includes(needle)
    )
    .map((t) => ({ title: t.title, note: t.note }));

  return {
    characterId: self.id,
    isPlayer: self.isPlayer,
    identity: {
      name: self.name,
      whatTheyAre: whatTheyAreFrom(soft),
      ...(soft?.identity.appearance !== undefined ? { appearance: soft.identity.appearance } : {}),
      ...(soft ? { tier: soft.tier } : {}),
    },
    mentality: {
      traits: soft?.identity.traits ?? [],
      behavioralSignatures: (soft?.behavioralSignatures ?? []).map((b) => ({
        pattern: b.pattern,
        confidence: b.confidence,
      })),
      ...(soft?.current.mood !== undefined ? { mood: soft.current.mood } : {}),
      ...(soft?.identity.speechStyle !== undefined ? { speechStyle: soft.identity.speechStyle } : {}),
      ...(soft?.identity.outlook !== undefined ? { outlook: soft.identity.outlook } : {}),
    },
    currentState: {
      ...(soft?.current.mood !== undefined ? { mood: soft.current.mood } : {}),
      ...(soft?.current.location !== undefined ? { location: soft.current.location } : {}),
      ...(soft?.current.goal !== undefined ? { goal: soft.current.goal } : {}),
    },
    past: {
      ...(soft?.identity.backstory !== undefined ? { backstory: soft.identity.backstory } : {}),
      observations: observations.map((o) => ({ turnIdx: o.turnIdx, text: o.text })),
    },
    relationships: {
      outgoing,
      incoming,
      ...(toPlayer ? { toPlayer } : {}),
    },
    sheet: buildSheet(schema, self.hard, itemsById),
    involvedThreads,
  };
}
