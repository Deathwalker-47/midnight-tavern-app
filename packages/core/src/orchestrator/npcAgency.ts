/**
 * Same-turn NPC agency (HANDOFF root cause 2) — the deterministic reaction stage.
 *
 * After the player's intents resolve, a present, living NPC that was the target of an
 * allowed hostile (combat) action this turn gets to answer *this same turn*. The reaction
 * is chosen by fixed policy — no model call — and returned as a plain {@link MechanicalIntent}
 * that the caller re-resolves through the ordinary engine gate/dice/effects path. That is
 * the wall: nothing here can invent an action id, target, item, or skill, or bypass a gate;
 * every returned intent is still adjudicated by the same authority as a player intent.
 *
 * Scope of this first slice (see HANDOFF "Required direction"): deterministic direct
 * reactions only (counter-attack the attacker). Ambient prose-only extras stay prose-only
 * until promoted, and ambiguous social/tactical planning (a small bounded model call) is a
 * later refinement. NPC reactions use their own encounter budget and never consume the
 * player's configured action allowance.
 */
import { z } from "zod";
import { checkGate } from "../engine/index.js";
import { callStructured, type Router } from "../router/index.js";
import { NPC_HOSTILE_TO_PLAYER_FLAG } from "./npcIntroduction.js";
import type {
  ActionDef,
  CharacterHardState,
  CharacterSoftState,
  MechanicalIntent,
  Ruling,
  StorySchema,
} from "../types/index.js";

/**
 * Reactions a single NPC may take per turn. Separate from the player's sealed
 * `actionBudget`: an NPC answers a hostile act regardless of how many actions the player
 * spent. One keeps a same-turn exchange from spiralling; a future planner can raise it.
 */
export const DEFAULT_NPC_ENCOUNTER_BUDGET = 1;

export interface NpcReactionContext {
  schema: StorySchema;
  /**
   * Rulings already produced this turn (player intents + any refusals), in order. The
   * planner scans these for hostile acts that landed on a living NPC.
   */
  priorRulings: readonly Ruling[];
  /** Live working hard state after player resolution, keyed by characterId. */
  workingById: Map<string, CharacterHardState>;
  /** Present roster: characterId → isPlayer. Only characters with a row here may react. */
  present: Map<string, boolean>;
  /**
   * Optional `ruling.turnId → intent.stakes` for the player's rulings this turn, so provocation
   * can factor in the classifier's sealed hostility grade (Task 6). Omission is safe — the
   * predicate still fires on combat/target-harm signals.
   */
  stakesByTurnId?: ReadonlyMap<string, MechanicalIntent["stakes"]>;
  /**
   * Soft profiles keyed by characterId, for disposition (Plan 13 Phase 2). Absent or missing
   * entries read as neutral — no relationship data is a safe, non-hostile default.
   */
  softById?: ReadonlyMap<string, CharacterSoftState>;
  /** Display names keyed by characterId, for the player-facing reaction reason (Plan 13 3.3). */
  nameById?: ReadonlyMap<string, string>;
}

/** True when an action can reduce a target resource — i.e. it is genuinely offensive. */
function dealsTargetHarm(action: ActionDef): boolean {
  return Object.values(action.effects).some((effect) =>
    Object.values(effect.resourceDeltaTarget ?? {}).some((delta) => delta < 0)
  );
}

/** True when the committed ruling actually reduced a target resource this turn. */
function dealtCommittedTargetHarm(ruling: Ruling): boolean {
  return Object.values(ruling.effectsApplied?.resourceDeltaTarget ?? {}).some((delta) => delta < 0);
}

/**
 * A genuinely offensive act (Plan 13 Phase 2, superseding plan Task 6's `isProvocation`).
 * Deliberately EXCLUDES bare `opposed` and bare `stakes === "opposed"`: a contest of nerve,
 * persuasion, or intimidation is not violence merely because it is resolved adversarially
 * (CONTEXT.md invariant 8). Uses only SEALED signals — never raw prose:
 *  - `category === "combat"` — the classic attack;
 *  - the sealed outcome table can reduce a target resource, or the committed effect actually did;
 *  - the classifier marked the attempt with `danger` stakes.
 * Beneficial acts (healing, aid), harmless dialogue, and self-directed actions are never hostile.
 */
export function isHostileAct(
  action: ActionDef,
  ruling: Ruling,
  stakes?: MechanicalIntent["stakes"]
): boolean {
  return (
    action.category === "combat" ||
    dealsTargetHarm(action) ||
    dealtCommittedTargetHarm(ruling) ||
    stakes === "danger"
  );
}

/**
 * A direct contest of force or will that is not itself violence (intimidation, persuasion
 * against resistance, a duel of nerve). Warrants a response from the target, but never alone
 * justifies a counter-attack — see {@link chooseCounterAction}'s disposition-gated tiers.
 */
export function isOpposedContest(action: ActionDef): boolean {
  return action.opposed === true && !dealsTargetHarm(action);
}

/** Engine-derived stance of one NPC toward one actor. Ordered least→most cooperative. */
export type NpcDisposition = "hostile" | "wary" | "neutral" | "friendly";

/** Relationship trust at or below this reads as wary; at or above its positive twin, friendly. */
export const WARY_TRUST_THRESHOLD = -0.4;
export const FRIENDLY_TRUST_THRESHOLD = 0.4;

/**
 * Derive a graded disposition from the two facts the engine actually owns: the validated
 * hostility flag (authoritative — set only from an explicit narrated attack on the player, see
 * `npcIntroduction.ts`) and the analyzer's accumulated relationship trust (advisory). The flag
 * always wins: a validated-hostile actor is hostile no matter what the analyzer's trust reads.
 */
export function deriveDisposition(
  npc: CharacterHardState,
  npcSoft: CharacterSoftState | undefined,
  towardId: string
): NpcDisposition {
  if (npc.flags[NPC_HOSTILE_TO_PLAYER_FLAG] === true) return "hostile";
  const trust = npcSoft?.relationships.find((r) => r.toCharacterId === towardId)?.trust ?? 0;
  if (trust <= WARY_TRUST_THRESHOLD) return "wary";
  if (trust >= FRIENDLY_TRUST_THRESHOLD) return "friendly";
  return "neutral";
}

/** The NPC's first held weapon item id (for damage scaling on weapon actions), if any. */
function heldWeaponId(schema: StorySchema, npc: CharacterHardState): string | undefined {
  for (const entry of npc.inventory) {
    if (entry.qty <= 0) continue;
    const def = schema.items.find((item) => item.id === entry.itemId);
    if (def?.kind === "weapon") return def.id;
  }
  return undefined;
}

/**
 * Pick the NPC's reaction, gated by disposition rather than catalog order (Plan 13 Phase 2,
 * closing D-1/D-2). Every candidate still passes the same gate the player does — this only
 * changes WHICH sealed action is proposed, never whether the engine adjudicates it.
 *
 * Preference order per disposition:
 *  - hostile: harmful first, always — a validated-hostile actor answers with force.
 *  - wary: peaceful options first; falls back to harmful only if genuinely harmed this turn.
 *  - neutral: same as wary — no reason yet to expect violence either way.
 *  - friendly: peaceful options first, and falls back to harmful only if genuinely harmed and no
 *    peaceful option is available — a friend tries to de-escalate before it defends itself.
 */
function chooseCounterAction(
  schema: StorySchema,
  npc: CharacterHardState,
  attackerId: string,
  disposition: NpcDisposition,
  wasHarmed: boolean
): MechanicalIntent | undefined {
  const weaponId = heldWeaponId(schema, npc);
  const build = (action: ActionDef): MechanicalIntent => ({
    actorId: npc.characterId,
    actionId: action.id,
    targetId: attackerId,
    stakes: action.category === "combat" ? "danger" : "uncertain",
    confidence: 1,
    ...(action.requiresItemKind === "weapon" && weaponId ? { itemId: weaponId } : {}),
  });
  const legal = (action: ActionDef): boolean => checkGate(schema, npc, build(action)).allowed;

  const harmful = schema.actions.filter((a) => a.category === "combat" && dealsTargetHarm(a));
  const nonHarmful = schema.actions.filter((a) => !dealsTargetHarm(a) && a.opposed === true);
  const social = schema.actions.filter((a) => a.category === "social" && !dealsTargetHarm(a));

  const order: ActionDef[][] =
    disposition === "hostile"
      ? [harmful, nonHarmful, social]
      : disposition === "friendly"
        ? wasHarmed
          ? [social, nonHarmful, harmful]
          : [social, nonHarmful]
        : wasHarmed // wary and neutral share the same rule
          ? [harmful, nonHarmful, social]
          : [nonHarmful, social];

  for (const tier of order) {
    const found = tier.find(legal);
    if (found) return build(found);
  }
  return undefined; // Silence is correct here. A manufactured counter is not.
}

/** A planned NPC reaction alongside the disposition and reason that produced it (Plan 13 3.3). */
export interface PlannedNpcReaction {
  intent: MechanicalIntent;
  disposition: NpcDisposition;
  /** Player-facing justification, derived from sealed signals only — never from raw prose. */
  reason: string;
}

/** Build the player-facing reaction reason from the same sealed facts the decision already used. */
function reactionReason(
  disposition: NpcDisposition,
  wasHarmed: boolean,
  actorName: string,
  action: ActionDef
): string {
  if (wasHarmed) return `${actorName} harmed them with ${action.label}.`;
  if (disposition === "hostile") return `They were already hostile to ${actorName}.`;
  return `${actorName} opened a contest with ${action.label}.`;
}

/**
 * As {@link planNpcReactions}, but carrying the disposition and an honest player-facing reason
 * behind each choice — so the UI can render an NPC ruling that explains itself instead of looking
 * like an unexplained attack (Plan 13 3.3, closing the UI half of D-1).
 */
export function planNpcReactionsDetailed(ctx: NpcReactionContext): PlannedNpcReaction[] {
  const { schema, priorRulings, workingById, present, stakesByTurnId, softById, nameById } = ctx;
  const planned: PlannedNpcReaction[] = [];
  const spent = new Map<string, number>();

  for (const ruling of priorRulings) {
    if (!ruling.gate.allowed) continue; // the attempt was blocked — it never happened
    const targetId = ruling.targetId;
    if (!targetId) continue;
    if (present.get(targetId) !== false) continue; // must be a present NON-player NPC

    const action = schema.actions.find((candidate) => candidate.id === ruling.actionId);
    if (!action) continue;
    const stakes = stakesByTurnId?.get(ruling.turnId);
    const hostile = isHostileAct(action, ruling, stakes);
    const contest = isOpposedContest(action);
    // A reaction requires either a genuinely hostile act or an opposed contest (Plan 13 Phase 2).
    // Harmless dialogue and beneficial acts (healing/aid) never trigger a reaction at all.
    if (!hostile && !contest) continue;

    const npc = workingById.get(targetId);
    if (!npc || !npc.alive) continue; // dead/off-scene NPCs never act
    if ((spent.get(targetId) ?? 0) >= DEFAULT_NPC_ENCOUNTER_BUDGET) continue;

    const attacker = workingById.get(ruling.actorId);
    if (!attacker || !attacker.alive) continue; // don't strike an attacker who is already down
    if (present.get(ruling.actorId) === undefined) continue; // attacker must be on-scene

    const disposition = deriveDisposition(npc, softById?.get(targetId), ruling.actorId);
    const wasHarmed = dealtCommittedTargetHarm(ruling);
    const reaction = chooseCounterAction(schema, npc, ruling.actorId, disposition, wasHarmed);
    if (!reaction) continue;

    const actorName = nameById?.get(ruling.actorId) ?? ruling.actorId;
    planned.push({
      intent: reaction,
      disposition,
      reason: reactionReason(disposition, wasHarmed, actorName, action),
    });
    spent.set(targetId, (spent.get(targetId) ?? 0) + 1);
  }

  return planned;
}

/**
 * Plan deterministic same-turn NPC reactions. For every hostile player act that landed on a
 * present, living NPC, that NPC counter-attacks its attacker (if the attacker is itself still
 * a living, present character). Bounded by {@link DEFAULT_NPC_ENCOUNTER_BUDGET} per NPC and
 * computed once over `priorRulings`, so a reaction can never trigger further reactions.
 */
export function planNpcReactions(ctx: NpcReactionContext): MechanicalIntent[] {
  return planNpcReactionsDetailed(ctx).map((planned) => planned.intent);
}

// ── Goal-driven bounded NPC planning (plan Task 5) ─────────────────────────────
//
// Deterministic counters (above) cover the obvious "someone hit me, hit back" case. A present,
// living NPC that did NOT deterministically react may still have a reason to act this turn — aid an
// ally, converse, flee, surrender, or exploit an opening the player left. Those are ambiguous, so a
// single bounded structured request proposes them and deterministic code validates every proposal
// against present scene state and the sealed catalogs before the engine resolves it. The model may
// propose; it can never invent an actor, action, target, item, or skill, or bypass a gate. Any
// timeout / malformed / cancelled output degrades to NO NPC action so narration is never blocked.

/** A model-proposed NPC action, before engine validation. */
export interface NpcActionProposal {
  actorId: string;
  actionId: string;
  targetId?: string;
  itemId?: string;
  skillId?: string;
  reason: string;
  confidence: number;
}

const NpcActionProposalSchema = z.object({
  actorId: z.string().min(1),
  actionId: z.string().min(1),
  targetId: z.string().min(1).optional(),
  itemId: z.string().min(1).optional(),
  skillId: z.string().min(1).optional(),
  reason: z.string().trim().min(1).max(300),
  confidence: z.number().min(0).max(1),
});
const NpcActionPlanSchema = z.object({
  actions: z.array(NpcActionProposalSchema).max(6),
});

export interface NpcPlanInput {
  schema: StorySchema;
  playerText: string;
  recentNarration: readonly string[];
  /** Present, living, non-player NPCs that have NOT already acted this turn. */
  candidates: readonly CharacterHardState[];
  /** Display names for the prompt, keyed by characterId. */
  nameById: Map<string, string>;
  /** Present roster (characterId → isPlayer). A proposed target must be present. */
  present: Map<string, boolean>;
  /** Current hard state for every present actor, used by deterministic validation/fallback. */
  hardById: ReadonlyMap<string, CharacterHardState>;
}

function nameOf(id: string, nameById: Map<string, string>): string {
  return nameById.get(id) ?? id;
}

function plannerPrompt(input: NpcPlanInput) {
  const catalog = input.schema.actions.map((action) => ({
    id: action.id,
    label: action.label,
    category: action.category,
    ...(action.requiresSkill ? { requiresSkill: action.requiresSkill } : {}),
    ...(action.requiresItemKind ? { requiresItemKind: action.requiresItemKind } : {}),
  }));
  return {
    system: [
      "You are the NPC action planner for a deterministic roleplay engine.",
      "For each present NPC that has a grounded reason to act this turn, choose at most one goal:",
      "aid an ally, converse, flee, surrender, or exploit an opening the player left.",
      "Only propose sealed catalog actions for actors that are present and alive.",
      "Never invent an action, actor, target, item, or skill. Target only a present character by id.",
      "Return { actions: [...] }. Return an empty array when no present NPC has a grounded reason.",
    ].join("\n"),
    user: [
      `PLAYER ACTION:\n${input.playerText}`,
      `RECENT NARRATION:\n${input.recentNarration.slice(-4).join("\n") || "(none)"}`,
      `PRESENT NPCS (may act):\n${
        input.candidates
          .map((npc) =>
            JSON.stringify({
              id: npc.characterId,
              name: nameOf(npc.characterId, input.nameById),
              attributes: npc.attributes,
              resources: npc.resources,
              skills: npc.skills,
              inventory: npc.inventory,
            })
          )
          .join("\n") || "(none)"
      }`,
      `PRESENT CHARACTERS (valid targets):\n${
        [...input.present.entries()]
          .map(([id, isPlayer]) =>
            JSON.stringify({ id, name: nameOf(id, input.nameById), isPlayer })
          )
          .join("\n") || "(none)"
      }`,
      `SEALED ACTION CATALOG:\n${catalog.map((action) => JSON.stringify(action)).join("\n")}`,
    ].join("\n\n"),
  };
}

/**
 * Deterministic fallback policy for already validated hostile NPCs. It never infers hostility:
 * actors must carry the engine flag and have a gate-legal sealed damaging action. The target
 * must be the one unambiguous present, living player.
 */
export function planHostileNpcFallback(input: NpcPlanInput): MechanicalIntent[] {
  const livingPlayers = [...input.present.entries()]
    .filter(([id, isPlayer]) => isPlayer && input.hardById.get(id)?.alive)
    .map(([id]) => id);
  if (livingPlayers.length !== 1) return [];
  const playerId = livingPlayers[0]!;
  const intents: MechanicalIntent[] = [];

  for (const npc of input.candidates) {
    if (!npc.alive || input.present.get(npc.characterId) !== false) continue;
    if (npc.flags[NPC_HOSTILE_TO_PLAYER_FLAG] !== true) continue;
    // Already validated hostile by the engine flag — always the "hostile" tier, and treat as
    // harmed so a hostile actor with no legal weapon still exhausts every tier before giving up.
    const intent = chooseCounterAction(input.schema, npc, playerId, "hostile", true);
    if (intent) intents.push(intent);
  }
  return intents;
}

/**
 * Plan bounded goal-driven NPC actions. Fires one structured request only when there is at least
 * one candidate NPC, validates every proposal (actor is a present living candidate; action/item/
 * skill are sealed; target is present; the actor's gate permits it), and returns engine-ready
 * intents — one per NPC ({@link DEFAULT_NPC_ENCOUNTER_BUDGET}). Fails closed to `[]` on any
 * malformed/timeout/empty output. Only an actual abort propagates. A valid model proposal for an
 * actor takes precedence; an unplanned validated hostile actor uses the sealed fallback.
 */
export async function planNpcActions(
  router: Router,
  input: NpcPlanInput,
  signal?: AbortSignal
): Promise<MechanicalIntent[]> {
  if (input.candidates.length === 0) return [];
  if (signal?.aborted) throw signal.reason ?? new DOMException("Cancelled", "AbortError");

  let proposals: NpcActionProposal[];
  try {
    const response = await callStructured(
      router,
      "classifier",
      plannerPrompt(input),
      NpcActionPlanSchema,
      { maxRepairs: 0, maxTokens: 1_200, ...(signal ? { signal } : {}) }
    );
    proposals = response.actions;
  } catch (error) {
    if (signal?.aborted) throw signal.reason ?? error;
    return planHostileNpcFallback(input);
  }

  const candidateById = new Map(input.candidates.map((npc) => [npc.characterId, npc]));
  const intents: MechanicalIntent[] = [];
  const spent = new Map<string, number>();

  for (const proposal of proposals) {
    const actor = candidateById.get(proposal.actorId);
    if (!actor || !actor.alive) continue; // only a present, living, not-yet-acted NPC
    if ((spent.get(proposal.actorId) ?? 0) >= DEFAULT_NPC_ENCOUNTER_BUDGET) continue;

    const action = input.schema.actions.find((candidate) => candidate.id === proposal.actionId);
    if (!action) continue; // sealed catalog only
    if (proposal.targetId && !input.present.has(proposal.targetId)) continue; // present targets only
    if (proposal.itemId && !input.schema.items.some((item) => item.id === proposal.itemId)) continue;
    if (proposal.skillId && !input.schema.skills.some((skill) => skill.id === proposal.skillId)) {
      continue;
    }

    const intent: MechanicalIntent = {
      actorId: proposal.actorId,
      actionId: proposal.actionId,
      ...(proposal.targetId ? { targetId: proposal.targetId } : {}),
      ...(proposal.itemId ? { itemId: proposal.itemId } : {}),
      stakes: action.category === "combat" ? "danger" : "uncertain",
      confidence: proposal.confidence,
    };
    if (!checkGate(input.schema, actor, intent).allowed) continue; // engine gate is authoritative

    intents.push(intent);
    spent.set(proposal.actorId, (spent.get(proposal.actorId) ?? 0) + 1);
  }

  const acted = new Set(intents.map((intent) => intent.actorId));
  return [
    ...intents,
    ...planHostileNpcFallback(input).filter((intent) => !acted.has(intent.actorId)),
  ];
}
