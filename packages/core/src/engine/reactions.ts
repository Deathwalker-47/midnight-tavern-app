/**
 * Reaction skills (plan 08 §4) — automatic answers to an attack.
 *
 * Once every action of a turn has resolved, each character that another character attacked this turn
 * answers once, with its first learned reaction skill (rulebook order) whose trigger fired, aimed at
 * the attacker:
 *   - `attacked` — the target of an allowed attack (a combat action, or one whose outcomes can wound),
 *     hit or miss;
 *   - `damaged` — the attack actually took a resource from it.
 * Planning reads only the turn's action rulings, never the reactions it produces, so a reaction can
 * never set off another. The planned intents then go through the normal gate and resolver with
 * `asReaction`, so costs, cooldowns and dice all still apply.
 *
 * Pure: reads the frozen schema, this turn's rulings and the working hard state only.
 */
import {
  baseItemKind,
  itemKindSatisfies,
  type ActionDef,
  type CharacterHardState,
  type ItemKind,
  type MechanicalIntent,
  type ReactionTrigger,
  type Ruling,
  type SkillDef,
  type StorySchema,
} from "../types/index.js";

export interface PlannedSkillReaction {
  intent: MechanicalIntent;
  skill: SkillDef;
  trigger: ReactionTrigger;
  /** The attacker the reaction answers. */
  sourceActorId: string;
}

/** True when some outcome of the action takes a resource from its target. */
function canWound(action: ActionDef): boolean {
  return Object.values(action.effects).some((effect) =>
    Object.values(effect.resourceDeltaTarget ?? {}).some((delta) => delta < 0)
  );
}

/** True when the committed ruling actually took a resource from its target. */
function wounded(ruling: Ruling): boolean {
  return Object.values(ruling.effectsApplied?.resourceDeltaTarget ?? {}).some((delta) => delta < 0);
}

/** The holder's first held item meeting a weapon need (legacy inventory), so the reaction scales. */
function heldWeaponId(schema: StorySchema, holder: CharacterHardState, required: ItemKind): string | undefined {
  return holder.inventory.find((entry) => {
    const kind = schema.items.find((item) => item.id === entry.itemId)?.kind;
    return entry.qty > 0 && kind !== undefined && itemKindSatisfies(kind, required);
  })?.itemId;
}

/** Plan this turn's reactions from its action rulings, in ruling order, one per character. */
export function planSkillReactions(
  schema: StorySchema,
  rulings: readonly Ruling[],
  workingById: ReadonlyMap<string, CharacterHardState>
): PlannedSkillReaction[] {
  const planned: PlannedSkillReaction[] = [];
  const reactionSkills = schema.skills.filter(
    (skill) => skill.skillType === "reaction" && skill.reaction
  );
  if (reactionSkills.length === 0) return planned;
  const answered = new Set<string>();
  for (const ruling of rulings) {
    const holderId = ruling.targetId;
    if (!ruling.gate.allowed || !holderId || holderId === ruling.actorId) continue;
    if (answered.has(holderId)) continue;
    const action = schema.actions.find((candidate) => candidate.id === ruling.actionId);
    if (!action || (action.category !== "combat" && !canWound(action))) continue;
    const holder = workingById.get(holderId);
    const attacker = workingById.get(ruling.actorId);
    if (!holder?.alive || !attacker?.alive) continue;
    const damaged = wounded(ruling);
    const learned = new Set(holder.skills.map((skill) => skill.skillId));
    const skill = reactionSkills.find(
      (candidate) =>
        learned.has(candidate.id) && (candidate.reaction!.trigger === "attacked" || damaged)
    );
    if (!skill) continue;
    // A reaction naming an action the rulebook lacks is a rulebook error the validator reports.
    const fired = schema.actions.find((candidate) => candidate.id === skill.reaction!.actionId);
    if (!fired) continue;
    const weaponId =
      fired.requiresItemKind && baseItemKind(fired.requiresItemKind) === "weapon"
        ? heldWeaponId(schema, holder, fired.requiresItemKind)
        : undefined;
    planned.push({
      intent: {
        actorId: holderId,
        actionId: fired.id,
        targetId: ruling.actorId,
        stakes: "danger",
        confidence: 1,
        ...(weaponId ? { itemId: weaponId } : {}),
      },
      skill,
      trigger: skill.reaction!.trigger,
      sourceActorId: ruling.actorId,
    });
    answered.add(holderId);
  }
  return planned;
}
