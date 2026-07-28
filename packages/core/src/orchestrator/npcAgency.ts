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
import { checkGate } from "../engine/index.js";
import type {
  ActionDef,
  CharacterHardState,
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
}

/** True when an action can reduce a target resource — i.e. it is genuinely offensive. */
function dealsTargetHarm(action: ActionDef): boolean {
  return Object.values(action.effects).some((effect) =>
    Object.values(effect.resourceDeltaTarget ?? {}).some((delta) => delta < 0)
  );
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
 * Pick the NPC's counter-attack: the first sealed combat action that (a) can harm a target
 * and (b) the NPC's own gate permits right now (skill, rank, item, cost, prerequisites). The
 * gate is re-run by the caller on resolve; checking here only avoids emitting a dead intent.
 */
function chooseCounterAction(
  schema: StorySchema,
  npc: CharacterHardState,
  attackerId: string
): MechanicalIntent | undefined {
  const weaponId = heldWeaponId(schema, npc);
  for (const action of schema.actions) {
    if (action.category !== "combat") continue;
    if (!dealsTargetHarm(action)) continue;
    const intent: MechanicalIntent = {
      actorId: npc.characterId,
      actionId: action.id,
      targetId: attackerId,
      stakes: "danger", // a defensive strike is always a genuine, uncertain attempt
      confidence: 1,
      ...(action.requiresItemKind === "weapon" && weaponId ? { itemId: weaponId } : {}),
    };
    if (checkGate(schema, npc, intent).allowed) return intent;
  }
  return undefined;
}

/**
 * Plan deterministic same-turn NPC reactions. For every hostile player act that landed on a
 * present, living NPC, that NPC counter-attacks its attacker (if the attacker is itself still
 * a living, present character). Bounded by {@link DEFAULT_NPC_ENCOUNTER_BUDGET} per NPC and
 * computed once over `priorRulings`, so a reaction can never trigger further reactions.
 */
export function planNpcReactions(ctx: NpcReactionContext): MechanicalIntent[] {
  const { schema, priorRulings, workingById, present } = ctx;
  const intents: MechanicalIntent[] = [];
  const spent = new Map<string, number>();

  for (const ruling of priorRulings) {
    if (!ruling.gate.allowed) continue; // the attempt was blocked — it never happened
    const targetId = ruling.targetId;
    if (!targetId) continue;
    if (present.get(targetId) !== false) continue; // must be a present NON-player NPC

    const action = schema.actions.find((candidate) => candidate.id === ruling.actionId);
    if (!action || action.category !== "combat") continue; // only hostile acts provoke a reaction

    const npc = workingById.get(targetId);
    if (!npc || !npc.alive) continue; // dead/off-scene NPCs never act
    if ((spent.get(targetId) ?? 0) >= DEFAULT_NPC_ENCOUNTER_BUDGET) continue;

    const attacker = workingById.get(ruling.actorId);
    if (!attacker || !attacker.alive) continue; // don't strike an attacker who is already down
    if (present.get(ruling.actorId) === undefined) continue; // attacker must be on-scene

    const reaction = chooseCounterAction(schema, npc, ruling.actorId);
    if (!reaction) continue;

    intents.push(reaction);
    spent.set(targetId, (spent.get(targetId) ?? 0) + 1);
  }

  return intents;
}
