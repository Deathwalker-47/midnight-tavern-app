import { describe, expect, it } from "vitest";
import {
  checkGate,
  d20Sequence,
  passiveAttributeBonus,
  passiveCheckBonus,
  resolve,
  SkillDefSchema,
  validateStorySchema,
  type ActionDef,
  type MechanicalIntent,
  type SkillDef,
} from "../src/index.js";
import { makeEnemy, makePlayer, makeStory } from "./fixtures.js";

const keenEye: SkillDef = {
  id: "keen_eye",
  name: "Keen Eye",
  description: "Nothing escapes your notice.",
  tier: "common",
  prerequisites: [],
  unlockPaths: [{ method: "trial", flagId: "keen" }],
  masteryAdvance: { successesPerRank: 5 },
  skillType: "passive",
  passive: { checkBonus: { amount: 2, categories: ["exploration"] }, attributeBonus: { dex: 2 } },
};
const ironHide: SkillDef = {
  ...keenEye,
  id: "iron_hide",
  name: "Iron Hide",
  passive: { checkBonus: { amount: 1 } },
};
const stout: SkillDef = { ...keenEye, id: "stout", name: "Stout", passive: { attributeBonus: { str: 1 } } };
const quiet: SkillDef = { ...keenEye, id: "quiet", name: "Quiet", passive: undefined };
const wild = makeStory().actions.find((action) => action.id === "attack_wild")!;
const search: ActionDef = {
  ...wild,
  id: "scour_area",
  category: "exploration",
  label: "Search",
  governingAttribute: "dex",
  dc: 15,
  effects: {
    crit_success: { narrationHint: "found everything" },
    success: { narrationHint: "found it" },
    failure: { narrationHint: "nothing" },
    crit_failure: { narrationHint: "noise" },
  },
};
const story = makeStory({
  skills: [...makeStory().skills, keenEye, ironHide, stout, quiet],
  actions: [...makeStory().actions, search],
});
const intent = (actionId: string): MechanicalIntent => ({
  actorId: "kestrel",
  actionId,
  targetId: "wight",
  stakes: "uncertain",
  confidence: 1,
});
const knows = (...ids: string[]) =>
  makePlayer({
    skills: [
      { skillId: "blade", rank: "novice", successCount: 0 },
      ...ids.map((skillId) => ({ skillId, rank: "novice" as const, successCount: 0 })),
    ],
  });

describe("passive skills (plan 08 §4.2)", () => {
  it("accept a skill type and bounded passive bonuses", () => {
    expect(SkillDefSchema.parse(keenEye).skillType).toBe("passive");
    expect(SkillDefSchema.safeParse({ ...keenEye, passive: { checkBonus: { amount: 9 } } }).success)
      .toBe(false);
    expect(SkillDefSchema.parse({ ...keenEye, skillType: undefined, passive: undefined }).skillType)
      .toBeUndefined();
  });

  it("apply only while learned, scoped by action category", () => {
    expect(passiveCheckBonus(story, knows("keen_eye"), search)).toBe(2);
    expect(passiveCheckBonus(story, knows("keen_eye"), wild)).toBe(0);
    expect(passiveCheckBonus(story, knows("keen_eye", "iron_hide"), wild)).toBe(1);
    expect(passiveCheckBonus(story, knows(), search)).toBe(0);
    expect(passiveAttributeBonus(story, knows("keen_eye"), "dex")).toBe(2);
    expect(passiveAttributeBonus(story, knows("keen_eye"), "str")).toBe(0);
    // An attribute-only passive adds no check bonus; a passive with no bonus block adds nothing.
    expect(passiveCheckBonus(story, knows("stout", "quiet"), search)).toBe(0);
    expect(passiveAttributeBonus(story, knows("stout", "quiet"), "str")).toBe(1);
  });

  it("feed the roll and are recorded on it", () => {
    // DEX 12 → +1; Keen Eye adds +2 DEX (14 → +2) and +2 to exploration checks.
    const plain = resolve(story, knows(), undefined, intent("scour_area"), d20Sequence([10]));
    const keen = resolve(story, knows("keen_eye"), undefined, intent("scour_area"), d20Sequence([10]));
    expect(keen.ruling.roll?.passiveModifier).toBe(2);
    expect(keen.ruling.roll!.total - plain.ruling.roll!.total).toBe(3);
    expect(plain.ruling.roll?.passiveModifier).toBeUndefined();
  });

  it("also strengthen a defender in an opposed contest", () => {
    const duel = makeStory().actions.find((action) => action.id === "duel")!;
    const contest = { ...duel, category: "combat" as const };
    const schema = { ...story, actions: [...story.actions.filter((a) => a.id !== "duel"), contest] };
    const tough = makeEnemy({ skills: [...makeEnemy().skills, { skillId: "iron_hide", rank: "novice", successCount: 0 }] });
    const result = resolve(schema, knows(), tough, intent("duel"), d20Sequence([10, 10]));
    const baseline = resolve(schema, knows(), makeEnemy(), intent("duel"), d20Sequence([10, 10]));
    expect(result.ruling.roll!.opposedModifier! - baseline.ruling.roll!.opposedModifier!).toBe(1);
  });

  it("can never be invoked as an action: the gate refuses and the validator rejects", () => {
    const misuse: ActionDef = { ...search, id: "use_keen_eye", requiresSkill: "keen_eye" };
    const schema = { ...story, actions: [...story.actions, misuse] };
    expect(checkGate(schema, knows("keen_eye"), intent("use_keen_eye"))).toMatchObject({
      allowed: false,
      code: "not_invocable",
    });
    expect(validateStorySchema(schema).some((error) => /use_keen_eye/.test(error) && /passive/.test(error)))
      .toBe(true);
  });
});
