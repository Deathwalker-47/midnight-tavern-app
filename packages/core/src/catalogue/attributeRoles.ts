/**
 * Attribute roles (plan 09 §4.4) — how a story-agnostic pool archetype finds "the story's charm
 * stat". Forged attributes are themed freely ("Allure", "Grit", "Aether"); this infers what each is
 * FOR from its id, name and abbreviation, deterministically, the way `engine/resources.ts` infers
 * resource roles. Magic is tried first so "Psychic Power" reads as magic rather than might.
 */
import type { AttributeDef, StorySchema } from "../types/index.js";
import type { AttributeRole } from "../config/index.js";

const ROLE_PATTERNS: ReadonlyArray<readonly [AttributeRole, RegExp]> = [
  ["magic", /\b(magic|magick|arcana|arcane|spirit|mana|aether|ether|essence|mystic|mysticism|sorcery|psionics?|psychic|ki|chi|faith|divinity|attunement)\b/],
  ["might", /\b(str|strength|might|power|brawn|muscle|force|physique|body|brute)\b/],
  ["agility", /\b(dex|dexterity|agility|agi|finesse|reflexes?|speed|quickness|grace|nimbleness|coordination)\b/],
  ["endurance", /\b(con|constitution|endurance|end|vitality|toughness|grit|resilience|fortitude|vigou?r|stamina|hardiness)\b/],
  ["intellect", /\b(int|intelligence|intellect|reason|logic|knowledge|learning|wits?|mind|cunning|smarts|education|tech|technology)\b/],
  ["insight", /\b(wis|wisdom|insight|perception|per|awareness|intuition|instinct|senses|alertness|judgement|judgment)\b/],
  ["presence", /\b(cha|charisma|presence|charm|influence|will|willpower|personality|allure|leadership|empathy|composure|resolve|command|social)\b/],
];

/** The role an attribute plays, or undefined when nothing about it says. */
export function inferAttributeRole(
  attribute: Pick<AttributeDef, "id" | "name" | "abbrev">
): AttributeRole | undefined {
  const text = `${attribute.id.replace(/_/g, " ")} ${attribute.name} ${attribute.abbrev}`.toLowerCase();
  return ROLE_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0];
}

/** The first attribute (in rulebook order) playing `role`, if any. */
export function attributeIdForRole(
  schema: Pick<StorySchema, "attributes">,
  role: AttributeRole
): string | undefined {
  return schema.attributes.find((attribute) => inferAttributeRole(attribute) === role)?.id;
}
