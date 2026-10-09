/**
 * Skill types (plan 08 §4.2) — the bonuses a character carries from what it has learned.
 *
 * A passive skill is always on once learned: its flat, bounded check and attribute bonuses feed
 * every roll they apply to. It can never be invoked — no action may be gated by one (the gate
 * refuses and the forge validator rejects such a rulebook).
 *
 * Pure: reads the frozen schema and hard state only.
 */
import type {
  ActionDef,
  CharacterHardState,
  SkillBonus,
  SkillDef,
  StorySchema,
} from "../types/index.js";

export function isPassiveSkill(schema: Pick<StorySchema, "skills">, skillId: string): boolean {
  return schema.skills.some((skill) => skill.id === skillId && skill.skillType === "passive");
}

/** The bonus blocks currently granted to `actor` by its learned skills. */
export function activeSkillBonuses(
  schema: Pick<StorySchema, "skills">,
  actor: CharacterHardState
): SkillBonus[] {
  const learned = new Set(actor.skills.map((skill) => skill.skillId));
  return schema.skills
    .filter((skill: SkillDef) => learned.has(skill.id) && skill.skillType === "passive")
    .flatMap((skill) => (skill.passive ? [skill.passive] : []));
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
