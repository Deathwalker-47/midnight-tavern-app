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
import type { StoryEvent } from "../store/repositories/storyEvents.js";
import type {
  CharacterHardState,
  CharacterSoftState,
  ItemDef,
  StorySchema,
} from "../types/index.js";
import { scoreToMod } from "../engine/attributes.js";
import { EQUIPMENT_LOOT_CONFIG, PROGRESSION_CONFIG } from "../config/index.js";

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
  /** Frozen rulebook definition; absent only for a legacy hard-state row with no schema entry. */
  definition?: string;
  tier?: string;
  rank: string;
  successCount: number;
  /** Cumulative V7 XP; zero for legacy rows until their next awarded action. */
  xp: number;
  /** XP still needed to rank up, or null at master (no next rank). */
  toNext: number | null;
  nextRankXp: number | null;
  /** Advanced uses declared by the frozen skill definition. */
  permits?: string[];
  /** Frozen actions for which this learned skill is a gate. */
  linkedActions?: {
    actionId: string;
    label: string;
    category: string;
    description?: string;
    minRank?: string;
    governingAttribute?: string;
  }[];
  /** Display name when every linked action uses the same governing attribute. */
  linkedAttribute?: string;
  /** Newest persisted XP event for this skill. */
  latestAward?: {
    xp: number;
    reason: string;
    turnIdx: number;
    rankUp?: { from: string; to: string };
  };
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
  storySoFar?: {
    summary?: string;
    keyEvents: {
      turnIdx: number;
      chapter?: number;
      title: string;
      detail?: string;
      recent?: boolean;
      provenance?: string;
    }[];
  };
  history?: {
    turnIdx: number;
    chapter?: number;
    text: string;
    kind?: string;
    recent?: boolean;
    provenance?: string;
  }[];
  relationships: {
    outgoing: DossierOutgoingEdge[];
    /** Reverse-resolved: edges from other characters that point at this one. */
    incoming: DossierIncomingEdge[];
    /** Convenience: this character's edge toward the player, if any. */
    toPlayer?: { trust: number; power: number; feeling?: string };
  };
  sheet: {
    attributes: {
      attributeId: string;
      name: string;
      abbrev: string;
      score: number;
      modifier: number;
      description: string;
    }[];
    resources: { id: string; label: string; current: number; max: number }[];
    skills: DossierSkill[];
    inventory: {
      itemId: string;
      name: string;
      qty: number;
      kind: string;
      tier?: string;
      runtime?: boolean;
      equippedSlots?: string[];
    }[];
    alive: boolean;
  };
  equipment?: {
    slots: {
      slot: string;
      itemName?: string;
      tier?: string;
      effects?: string[];
      recent?: boolean;
    }[];
    activeEffects: { label: string; source: string; active: boolean; reason?: string }[];
  };
  progressionHistory?: {
    skillName: string;
    xp: number;
    reason: string;
    turnIdx: number;
    rankUp?: string;
    rewound?: boolean;
  }[];
  attributeAdvancementHistory?: {
    attributeId: string;
    attributeName: string;
    approved: boolean;
    scoreBefore: number;
    scoreAfter: number;
    delta: number;
    source: string;
    rationale: string;
    turnIdx: number;
    band?: string;
    evidenceRefs: string[];
    denialReasons: string[];
    proposalKey: string;
    recent?: boolean;
  }[];
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

type ProjectedXpAward = NonNullable<DossierSkill["latestAward"]> & { skillId: string };

/** Read only the validated fields needed by the dossier from a persisted XP event payload. */
function projectXpAward(event: StoryEvent): ProjectedXpAward | undefined {
  if (event.kind !== "xp") return undefined;
  const award = event.payload["award"];
  if (!award || typeof award !== "object") return undefined;
  const record = award as Record<string, unknown>;
  const skillId = record["skillId"];
  const amount = record["amount"];
  const reason = record["reason"];
  if (typeof skillId !== "string" || typeof amount !== "number" || typeof reason !== "string") {
    return undefined;
  }
  const rankBefore = record["rankBefore"];
  const rankAfter = record["rankAfter"];
  return {
    skillId,
    xp: amount,
    reason,
    turnIdx: event.turnIndex,
    ...(typeof rankBefore === "string" &&
    typeof rankAfter === "string" &&
    rankBefore !== rankAfter
      ? { rankUp: { from: rankBefore, to: rankAfter } }
      : {}),
  };
}

function latestXpAwardBySkill(events: StoryEvent[]): Map<string, ProjectedXpAward> {
  const latest = new Map<string, ProjectedXpAward>();
  for (const event of events) {
    const award = projectXpAward(event);
    if (award) latest.set(award.skillId, award);
  }
  return latest;
}

type ProjectedAttributeAdvancement = NonNullable<
  Dossier["attributeAdvancementHistory"]
>[number];

function projectAttributeAdvancement(
  event: StoryEvent,
  attributeNameById: ReadonlyMap<string, string>
): ProjectedAttributeAdvancement | undefined {
  if (
    event.kind !== "attribute_advanced" &&
    event.kind !== "attribute_advancement_denied"
  ) {
    return undefined;
  }
  const value = event.payload["decision"];
  if (!value || typeof value !== "object") return undefined;
  const decision = value as Record<string, unknown>;
  const proposalValue = decision["proposal"];
  if (!proposalValue || typeof proposalValue !== "object") return undefined;
  const proposal = proposalValue as Record<string, unknown>;
  const attributeId = proposal["attributeId"];
  const source = proposal["source"];
  const rationale = proposal["rationale"];
  const scoreBefore = decision["scoreBefore"];
  const scoreAfter = decision["scoreAfter"];
  const proposalKey = decision["proposalKey"];
  if (
    typeof attributeId !== "string" ||
    typeof source !== "string" ||
    typeof rationale !== "string" ||
    typeof scoreBefore !== "number" ||
    typeof scoreAfter !== "number" ||
    typeof proposalKey !== "string"
  ) {
    return undefined;
  }
  const evidenceRefs = Array.isArray(decision["evidenceRefs"])
    ? decision["evidenceRefs"].filter(
        (reference): reference is string => typeof reference === "string"
      )
    : [];
  const denialReasons = Array.isArray(decision["denialReasons"])
    ? decision["denialReasons"].filter(
        (reason): reason is string => typeof reason === "string"
      )
    : [];
  const approved =
    typeof decision["approved"] === "boolean"
      ? decision["approved"]
      : event.kind === "attribute_advanced";
  return {
    attributeId,
    attributeName: attributeNameById.get(attributeId) ?? attributeId,
    approved,
    scoreBefore,
    scoreAfter,
    delta:
      typeof proposal["delta"] === "number"
        ? proposal["delta"]
        : scoreAfter - scoreBefore,
    source,
    rationale,
    turnIdx: event.turnIndex,
    ...(typeof decision["band"] === "string"
      ? { band: decision["band"] }
      : {}),
    evidenceRefs,
    denialReasons,
    proposalKey,
  };
}

/** Project the hard sheet (resources/skills/inventory), resolving display names via the schema. */
function buildSheet(
  schema: StorySchema,
  hard: CharacterHardState,
  itemsById: Map<string, ItemDef>,
  latestAwards: Map<string, ProjectedXpAward>
): Dossier["sheet"] {
  const skillDefs = new Map(schema.skills.map((s) => [s.id, s]));
  const attributeNames = new Map(schema.attributes.map((attribute) => [attribute.id, attribute.name]));
  const attributes: Dossier["sheet"]["attributes"] = schema.attributes.map((definition) => {
    const score = hard.attributes[definition.id] ?? definition.defaultScore;
    return {
      attributeId: definition.id,
      name: definition.name,
      abbrev: definition.abbrev,
      score,
      modifier: scoreToMod(score),
      description: definition.description,
    };
  });
  const resources: Dossier["sheet"]["resources"] = [];
  for (const def of schema.resources) {
    const state = hard.resources[def.id];
    if (state) resources.push({ id: def.id, label: def.label, current: state.current, max: state.max });
  }
  const skills: DossierSkill[] = hard.skills.map((s) => {
    const def = skillDefs.get(s.skillId);
    const xp = s.xp ?? 0;
    const rankIndex = PROGRESSION_CONFIG.ranks.findIndex((entry) => entry.rank === s.rank);
    const nextRank = PROGRESSION_CONFIG.ranks[rankIndex + 1];
    const linkedActions = schema.actions
      .filter((action) => action.requiresSkill === s.skillId)
      .map((action) => ({
        actionId: action.id,
        label: action.label,
        category: action.category,
        ...(action.description !== undefined ? { description: action.description } : {}),
        ...(action.minRank !== undefined ? { minRank: action.minRank } : {}),
        ...(action.governingAttribute !== undefined
          ? {
              governingAttribute:
                attributeNames.get(action.governingAttribute) ?? action.governingAttribute,
            }
          : {}),
      }));
    const governingAttributes = [
      ...new Set(
        linkedActions
          .map((action) => action.governingAttribute)
          .filter((attribute): attribute is string => attribute !== undefined)
      ),
    ];
    const latestAward = latestAwards.get(s.skillId);
    return {
      skillId: s.skillId,
      name: def?.name ?? s.skillId,
      ...(def?.description !== undefined ? { definition: def.description } : {}),
      ...(def?.tier !== undefined ? { tier: def.tier } : {}),
      rank: s.rank,
      successCount: s.successCount,
      xp,
      toNext: nextRank ? Math.max(0, nextRank.minimumXp - xp) : null,
      nextRankXp: nextRank?.minimumXp ?? null,
      ...(def?.advancedUses?.length
        ? {
            permits: def.advancedUses.map(
              (use) => `${use.minRank[0]!.toUpperCase()}${use.minRank.slice(1)}+: ${use.description}`
            ),
          }
        : {}),
      ...(linkedActions.length ? { linkedActions } : {}),
      ...(governingAttributes.length === 1 ? { linkedAttribute: governingAttributes[0]! } : {}),
      ...(latestAward
        ? {
            latestAward: {
              xp: latestAward.xp,
              reason: latestAward.reason,
              turnIdx: latestAward.turnIdx,
              ...(latestAward.rankUp ? { rankUp: latestAward.rankUp } : {}),
            },
          }
        : {}),
    };
  });
  const inventory = hard.inventory
    .filter((e) => e.qty > 0)
    .map((e) => {
      const def = itemsById.get(e.itemId);
      return { itemId: e.itemId, name: def?.name ?? e.itemId, qty: e.qty, kind: def?.kind ?? "misc" };
    });
  return { attributes, resources, skills, inventory, alive: hard.alive };
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
  const [
    runtimeDefinitions,
    runtimeInstances,
    runtimeAssignments,
    storyEvents,
  ] = await Promise.all([
    store.runtimeItems.listDefinitions(schema.storyId),
    store.runtimeItems.listInventory(characterId),
    store.runtimeItems.listLoadout(characterId),
    store.events.listByStory(schema.storyId, { limit: 500 }),
  ]);
  const characterEvents = storyEvents.filter((event) => event.actorId === characterId);
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

  const sheet = buildSheet(
    schema,
    self.hard,
    itemsById,
    latestXpAwardBySkill(characterEvents)
  );
  const runtimeDefinitionById = new Map(
    runtimeDefinitions.map((definition) => [definition.id, definition])
  );
  for (const instance of runtimeInstances) {
    const definition = runtimeDefinitionById.get(instance.definitionId);
    if (!definition || instance.quantity < 1) continue;
    sheet.inventory.push({
      itemId: instance.id,
      name: definition.name,
      qty: instance.quantity,
      kind: definition.kind,
      tier: definition.tier,
      runtime: true,
      equippedSlots: runtimeAssignments
        .filter((assignment) => assignment.itemInstanceId === instance.id)
        .map((assignment) => assignment.slot),
    });
  }
  const instanceById = new Map(runtimeInstances.map((instance) => [instance.id, instance]));
  const equipmentSlots: NonNullable<Dossier["equipment"]>["slots"] =
    EQUIPMENT_LOOT_CONFIG.slots.map((slot) => {
      const assignment = runtimeAssignments.find((candidate) => candidate.slot === slot);
      const instance = assignment ? instanceById.get(assignment.itemInstanceId) : undefined;
      const definition = instance ? runtimeDefinitionById.get(instance.definitionId) : undefined;
      const recentlyChanged = characterEvents.some(
        (event) =>
          event.kind === "equipment_changed" &&
          event.payload["slot"] === slot &&
          event === characterEvents[characterEvents.length - 1]
      );
      return {
        slot,
        ...(definition
          ? {
              itemName: definition.name,
              tier: definition.tier,
              effects: definition.effects.map((effect) => JSON.stringify(effect)),
            }
          : {}),
        ...(recentlyChanged ? { recent: true } : {}),
      };
    });
  const activeEffects = equipmentSlots.flatMap((slot) =>
    (slot.effects ?? []).map((effect) => ({
      label: effect,
      source: slot.itemName ?? slot.slot,
      active: true,
    }))
  );
  const storySummary = [
    soft?.identity.backstory?.trim(),
    ...observations.map((observation) => observation.text.trim()),
  ]
    .filter((part): part is string => Boolean(part))
    .join("\n\n");
  const observedKeyEvents: NonNullable<Dossier["storySoFar"]>["keyEvents"] = observations
    .slice(-8)
    .map((observation, index, selected) => ({
    turnIdx: observation.turnIdx,
    title: observation.text.split(/[.!?]/)[0]?.trim() || "Observed event",
    detail: observation.text,
    recent: index === selected.length - 1,
    provenance: `Turn ${observation.turnIdx}`,
  }));
  const actionNameById = new Map(schema.actions.map((action) => [action.id, action.label]));
  const rulingKeyEvents: NonNullable<Dossier["storySoFar"]>["keyEvents"] = storyEvents.flatMap(
    (event) => {
      if (!["roll", "automatic", "denied", "action_budget_exceeded"].includes(event.kind)) {
        return [];
      }
      const value = event.payload["ruling"];
      if (!value || typeof value !== "object") return [];
      const ruling = value as Record<string, unknown>;
      const actorId = typeof ruling["actorId"] === "string" ? ruling["actorId"] : event.actorId;
      const targetId = typeof ruling["targetId"] === "string" ? ruling["targetId"] : undefined;
      if (actorId !== characterId && targetId !== characterId) return [];
      const actionId = typeof ruling["actionId"] === "string" ? ruling["actionId"] : "action";
      const actionName = actionNameById.get(actionId) ?? actionId;
      const gate = ruling["gate"] as Record<string, unknown> | undefined;
      const roll = ruling["roll"] as Record<string, unknown> | undefined;
      const outcome =
        gate?.["allowed"] === false
          ? "denied"
          : typeof roll?.["outcome"] === "string"
            ? roll["outcome"]
            : "resolved";
      const actorName = actorId ? (nameById.get(actorId) ?? actorId) : "Unknown actor";
      const targetName = targetId ? (nameById.get(targetId) ?? targetId) : undefined;
      const detail =
        actorId === characterId
          ? `${actorName} used ${actionName}${targetName ? ` against ${targetName}` : ""}; the ruling was ${outcome}.`
          : `${actorName} used ${actionName} against ${self.name}; the ruling was ${outcome}.`;
      return [{
        turnIdx: event.turnIndex,
        title: `${actionName} — ${outcome}`,
        detail,
        provenance: `Authoritative ruling from turn ${event.turnIndex}`,
      }];
    }
  );
  const keyEvents = [...observedKeyEvents, ...rulingKeyEvents]
    .sort((left, right) => left.turnIdx - right.turnIdx)
    .slice(-8)
    .map((event, index, selected) => ({
      ...event,
      recent: index === selected.length - 1,
    }));
  const skillNameById = new Map(schema.skills.map((skill) => [skill.id, skill.name]));
  const attributeNameById = new Map(
    schema.attributes.map((attribute) => [attribute.id, attribute.name])
  );
  const progressionHistory = characterEvents.flatMap((event) => {
    if (event.kind !== "xp" && event.kind !== "rank_up") return [];
    const award = event.payload["award"];
    if (!award || typeof award !== "object") return [];
    const record = award as Record<string, unknown>;
    const skillId = typeof record["skillId"] === "string" ? record["skillId"] : "skill";
    return [{
      skillName: skillNameById.get(skillId) ?? skillId,
      xp: typeof record["amount"] === "number" ? record["amount"] : 0,
      reason: typeof record["reason"] === "string" ? record["reason"] : "DM ruling",
      turnIdx: event.turnIndex,
      ...(event.kind === "rank_up" && typeof record["rankAfter"] === "string"
        ? { rankUp: record["rankAfter"] }
        : {}),
    }];
  });
  const attributeAdvancementHistory = characterEvents
    .flatMap((event) => {
      const advancement = projectAttributeAdvancement(event, attributeNameById);
      return advancement ? [advancement] : [];
    })
    .sort((left, right) => left.turnIdx - right.turnIdx)
    .map((entry, index, entries) => ({
      ...entry,
      recent: index === entries.length - 1,
    }));

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
    storySoFar: {
      ...(storySummary.length ? { summary: storySummary } : {}),
      keyEvents,
    },
    history: observations.map((observation, index) => ({
      turnIdx: observation.turnIdx,
      text: observation.text,
      kind: "observation",
      recent: index === observations.length - 1,
      provenance: `Analyzer observation from turn ${observation.turnIdx}`,
    })),
    relationships: {
      outgoing,
      incoming,
      ...(toPlayer ? { toPlayer } : {}),
    },
    sheet,
    ...(schema.statMode === "full"
      ? {
          equipment: { slots: equipmentSlots, activeEffects },
          progressionHistory,
          attributeAdvancementHistory,
        }
      : {}),
    involvedThreads,
  };
}
