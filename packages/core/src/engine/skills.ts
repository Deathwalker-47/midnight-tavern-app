/**
 * Skill types (plan 08 §4.2) — the bonuses a character carries from what it has learned.
 *
 * A passive skill is always on once learned: its flat, bounded check and attribute bonuses feed
 * every roll they apply to. It can never be invoked — no action may be gated by one (the gate
 * refuses and the forge validator rejects such a rulebook).
 *
 * A toggle skill is switched on and off with the engine-owned `toggle_skill` action. While on, its
 * bonus applies like a passive's and its upkeep is paid at the end of every turn — including the
 * turn it was switched on, so there is no free turn. When upkeep cannot be paid it lapses, and that
 * lapse is reported as a ruling.
 *
 * Pure: reads the frozen schema and hard state only; the ledger applies every change.
 */
import {
  TOGGLE_SKILL_ACTION_ID,
  type ActionDef,
  type CharacterHardState,
  type GateVerdict,
  type MechanicalIntent,
  type Ruling,
  type SkillBonus,
  type SkillDef,
  type StorySchema,
} from "../types/index.js";
import { normalizeCost } from "./costs.js";
import { canAfford } from "./gate.js";
import type { StagedMutation } from "./ledger.js";

export function isPassiveSkill(schema: Pick<StorySchema, "skills">, skillId: string): boolean {
  return schema.skills.some((skill) => skill.id === skillId && skill.skillType === "passive");
}

/** The bonus blocks currently granted to `actor` by its learned skills. */
export function activeSkillBonuses(
  schema: Pick<StorySchema, "skills">,
  actor: CharacterHardState
): SkillBonus[] {
  const learned = new Set(actor.skills.map((skill) => skill.skillId));
  const switchedOn = new Set(actor.toggledOn ?? []);
  return schema.skills
    .filter((skill: SkillDef) => learned.has(skill.id))
    .flatMap((skill) => {
      if (skill.skillType === "passive" && skill.passive) return [skill.passive];
      if (skill.skillType === "toggle" && skill.toggle && switchedOn.has(skill.id)) {
        return [skill.toggle.bonus];
      }
      return [];
    });
}

/** Total passive check bonus for one action (category-scoped bonuses apply only to their categories). */
export function passiveCheckBonus(
  schema: Pick<StorySchema, "skills">,
  actor: CharacterHardState,
  action: Pick<ActionDef, "category">
): number {
  return activeSkillBonuses(schema, actor).reduce((sum, bonus) => {
    const check = bonus.checkBonus;
    if (!check) return sum;
    return !check.categories || check.categories.includes(action.category)
      ? sum + check.amount
      : sum;
  }, 0);
}

/** Total passive bonus to one attribute. */
export function passiveAttributeBonus(
  schema: Pick<StorySchema, "skills">,
  actor: CharacterHardState,
  attributeId: string
): number {
  return activeSkillBonuses(schema, actor).reduce(
    (sum, bonus) => sum + (bonus.attributeBonus?.[attributeId] ?? 0),
    0
  );
}

export interface SkillResolution {
  ruling: Ruling;
  mutations: StagedMutation[];
}

/** Switch a learned toggle skill on (if one upkeep is affordable now) or off (always free). */
export function resolveToggleSkill(
  schema: StorySchema,
  actor: CharacterHardState,
  intent: MechanicalIntent
): SkillResolution {
  const skill = intent.skillId
    ? schema.skills.find((candidate) => candidate.id === intent.skillId)
    : undefined;
  const isOn = Boolean(skill && actor.toggledOn?.includes(skill.id));
  const base = {
    turnId: `${intent.actorId}:${TOGGLE_SKILL_ACTION_ID}`,
    actorId: actor.characterId,
    actionId: TOGGLE_SKILL_ACTION_ID,
    actionLabel: skill ? `${isOn ? "Deactivate" : "Activate"} ${skill.name}` : "Toggle a skill",
  };
  const refuse = (reason: string, code: NonNullable<GateVerdict["code"]>): SkillResolution => ({
    ruling: { ...base, gate: { allowed: false, reason, code }, effectsApplied: null },
    mutations: [],
  });
  if (!schema.locked) {
    return refuse("Story schema is not frozen; the gate refuses unlocked schemas.", "schema_unlocked");
  }
  if (!actor.alive) return refuse("Actor is not alive.", "actor_dead");
  if (!skill) {
    return refuse(
      intent.skillId ? `Unknown skill "${intent.skillId}".` : "No skill was named to toggle.",
      "unknown_action"
    );
  }
  if (skill.skillType !== "toggle" || !skill.toggle) {
    return refuse(`${skill.name} is not a skill that can be switched on or off.`, "not_invocable");
  }
  if (!actor.skills.some((learned) => learned.skillId === skill.id)) {
    return refuse(`Requires ${skill.name} — not learned.`, "skill_required");
  }
  if (!isOn && !canAfford(actor, normalizeCost(schema, { resources: skill.toggle.upkeep }))) {
    return refuse(`Cannot sustain ${skill.name}: its upkeep is unaffordable.`, "cannot_afford");
  }
  return {
    ruling: {
      ...base,
      gate: { allowed: true },
      effectsApplied: {
        narrationHint: isOn ? `${skill.name} is released.` : `${skill.name} takes hold.`,
      },
    },
    mutations: [
      { kind: "setToggle", characterId: actor.characterId, skillId: skill.id, on: !isOn },
    ],
  };
}

/**
 * End-of-turn upkeep for every toggle the bearer has switched on. Affordable upkeep is paid
 * silently; an unaffordable toggle lapses (switched off, nothing paid) with a ruling. A toggle that no
 * longer exists in the rulebook is switched off. The dead pay nothing.
 */
export function planToggleUpkeep(
  schema: StorySchema,
  bearer: CharacterHardState
): { rulings: Ruling[]; mutations: StagedMutation[] } {
  const rulings: Ruling[] = [];
  const mutations: StagedMutation[] = [];
  if (!bearer.alive) return { rulings, mutations };
  // Upkeep already paid this tick is spent before the next toggle is checked.
  const remaining = structuredClone(bearer.resources);
  for (const skillId of bearer.toggledOn ?? []) {
    const skill = schema.skills.find((candidate) => candidate.id === skillId);
    if (!skill?.toggle) {
      mutations.push({ kind: "setToggle", characterId: bearer.characterId, skillId, on: false });
      continue;
    }
    const upkeep = normalizeCost(schema, { resources: skill.toggle.upkeep })!.resources!;
    if (canAfford({ ...bearer, resources: remaining }, { resources: upkeep })) {
      for (const [resourceId, amount] of Object.entries(upkeep)) {
        remaining[resourceId]!.current -= amount;
        mutations.push({
          kind: "resourceDelta",
          characterId: bearer.characterId,
          resourceId,
          delta: -amount,
        });
      }
      continue;
    }
    mutations.push({ kind: "setToggle", characterId: bearer.characterId, skillId, on: false });
    rulings.push({
      turnId: `${bearer.characterId}:${TOGGLE_SKILL_ACTION_ID}:${skillId}:lapse`,
      actorId: bearer.characterId,
      actionId: TOGGLE_SKILL_ACTION_ID,
      actionLabel: `${skill.name} fades`,
      gate: { allowed: true },
      effectsApplied: {
        narrationHint: `${skill.name} can no longer be sustained and fades.`,
      },
    });
  }
  return { rulings, mutations };
}
