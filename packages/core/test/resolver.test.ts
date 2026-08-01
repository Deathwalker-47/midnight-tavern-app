/**
 * Resolver suite — deterministic outcomes via a seeded RNG. Covers: gate-denied
 * no-roll rulings, the four outcome branches, DC boundary, mastery modifier, opposed
 * contests (win/tie/loss), item-prop scaling, cost payment, and mastery advancement.
 */
import { describe, it, expect } from "vitest";
import { resolve, scoreToMod } from "../src/index.js";
import type { MechanicalIntent } from "../src/index.js";
import { d20Sequence } from "../src/index.js";
import { makeStory, makePlayer, makeEnemy, learned } from "./fixtures.js";

const intent = (over: Partial<MechanicalIntent> = {}): MechanicalIntent => ({
  actorId: "kestrel",
  actionId: "attack_melee",
  targetId: "wight",
  itemId: "sword",
  confidence: 1,
  ...over,
});

describe("resolve — gate denial", () => {
  it("returns a no-roll ruling with no effects and no mutations when denied", () => {
    const r = resolve(makeStory(), makePlayer({ skills: [] }), makeEnemy(), intent(), d20Sequence([15]));
    expect(r.ruling.gate.allowed).toBe(false);
    expect(r.ruling.roll).toBeUndefined();
    expect(r.ruling.effectsApplied).toBeNull();
    expect(r.mutations).toHaveLength(0);
  });

  it("omits catalog labels for an unknown denied action", () => {
    const r = resolve(
      makeStory(),
      makePlayer(),
      undefined,
      intent({ actionId: "unknown_action", targetId: undefined, itemId: undefined }),
      d20Sequence([15])
    );
    expect(r.ruling.gate.allowed).toBe(false);
    expect(r.ruling.actionLabel).toBeUndefined();
  });
});

describe("resolve — outcome branches", () => {
  it("lets a valid low-stakes narration-only action succeed without dice or XP", () => {
    const story = makeStory();
    story.actions.push({
      id: "steady_spirit",
      category: "utility",
      label: "Steady the Spirit",
      description: "Take a quiet breath or whisper a prayer.",
      dc: 12,
      effects: {
        crit_success: { narrationHint: "Calm returns completely." },
        success: { narrationHint: "The breath steadies." },
        failure: { narrationHint: "Calm remains elusive." },
        crit_failure: { narrationHint: "Fear closes in." },
      },
    });
    const neverRoll = () => {
      throw new Error("routine action must not consume RNG");
    };

    const r = resolve(
      story,
      makePlayer(),
      undefined,
      intent({
        actionId: "steady_spirit",
        targetId: undefined,
        itemId: undefined,
        stakes: "none",
      }),
      neverRoll
    );

    expect(r.ruling.gate.allowed).toBe(true);
    expect(r.ruling.roll).toBeUndefined();
    expect(r.ruling.effectsApplied?.narrationHint).toBe("The breath steadies.");
    expect(r.ruling.xpAward).toBeUndefined();
    expect(r.mutations).toEqual([]);
  });

  it("still rolls attacks even when a classifier understates their stakes", () => {
    const r = resolve(
      makeStory(),
      makePlayer(),
      makeEnemy(),
      intent({ stakes: "none" }),
      d20Sequence([11])
    );

    expect(r.ruling.roll?.outcome).toBe("success");
  });

  it("combines the governing attribute and mastery modifiers", () => {
    const story = makeStory();
    story.attributes = [
      { id: "might", name: "Might", abbrev: "MIG", description: "Physical power", defaultScore: 10 },
    ];
    story.actions.find((action) => action.id === "attack_melee")!.governingAttribute = "might";
    const actor = makePlayer({ attributes: { might: 14 } });

    const r = resolve(story, actor, makeEnemy(), intent(), d20Sequence([9]));

    expect(scoreToMod(14)).toBe(2);
    expect(r.ruling.roll).toMatchObject({
      attributeId: "might",
      attributeScore: 14,
      attributeModifier: 2,
      masterySkillId: "blade",
      masteryModifier: 1,
      modifier: 3,
      total: 12,
      outcome: "success",
    });
  });

  it("crit_success on a natural 20 regardless of DC", () => {
    const r = resolve(makeStory(), makePlayer(), makeEnemy(), intent(), d20Sequence([20]));
    expect(r.ruling.roll?.outcome).toBe("crit_success");
    expect(r.ruling.roll?.d20).toBe(20);
  });

  it("crit_failure on a natural 1 regardless of modifier", () => {
    // Even a master (+7) crit-fails on a nat 1.
    const p = makePlayer({ skills: [learned("blade", "master")] });
    const r = resolve(makeStory(), p, makeEnemy(), intent(), d20Sequence([1]));
    expect(r.ruling.roll?.outcome).toBe("crit_failure");
  });

  it("success when total meets the DC exactly", () => {
    // novice blade = +1; DC 12 ⇒ need d20 >= 11.
    const r = resolve(makeStory(), makePlayer(), makeEnemy(), intent(), d20Sequence([11]));
    expect(r.ruling.roll?.total).toBe(12);
    expect(r.ruling.roll?.outcome).toBe("success");
  });

  it("failure when total is one under the DC", () => {
    const r = resolve(makeStory(), makePlayer(), makeEnemy(), intent(), d20Sequence([10]));
    expect(r.ruling.roll?.total).toBe(11);
    expect(r.ruling.roll?.outcome).toBe("failure");
  });

  it("applies the mastery modifier to the total", () => {
    const p = makePlayer({ skills: [learned("blade", "expert")] }); // +5
    const r = resolve(makeStory(), p, makeEnemy(), intent(), d20Sequence([7]));
    expect(r.ruling.roll?.modifier).toBe(5);
    expect(r.ruling.roll?.total).toBe(12);
    expect(r.ruling.roll?.outcome).toBe("success");
  });

  it("uses a zero modifier for a skill-less action", () => {
    const r = resolve(
      makeStory(),
      makePlayer(),
      makeEnemy(),
      intent({ actionId: "attack_wild", itemId: undefined }),
      d20Sequence([15])
    );
    expect(r.ruling.roll?.modifier).toBe(0);
    expect(r.ruling.roll?.outcome).toBe("success");
  });
});

describe("resolve — effects & mutations", () => {
  it("scales a natural strike by attacker power and generic encounter durability", () => {
    const story = makeStory();
    story.resources = [
      { id: "hp", label: "Health", start: 100, max: 100, playerVisible: true, lethal: true },
    ];
    story.actions.push({
      id: "universal_natural_attack",
      universalFamily: "attack_natural",
      category: "combat",
      label: "Natural Attack",
      governingAttribute: "str",
      dc: 10,
      effects: {
        crit_success: { resourceDeltaTarget: { hp: -8 }, narrationHint: "A crushing hit." },
        success: { resourceDeltaTarget: { hp: -4 }, narrationHint: "The strike lands." },
        failure: { narrationHint: "The strike misses." },
        crit_failure: { narrationHint: "The attacker overextends." },
      },
    });
    const target = makeEnemy({ resources: { hp: { current: 100, max: 100 } } });
    delete target.templateId;
    const naturalIntent = intent({
      actionId: "universal_natural_attack",
      itemId: undefined,
    });

    const ordinary = resolve(
      story,
      makePlayer({ attributes: { str: 10 } }),
      target,
      naturalIntent,
      d20Sequence([10])
    );
    const strong = resolve(
      story,
      makePlayer({ attributes: { str: 18 } }),
      target,
      naturalIntent,
      d20Sequence([10])
    );
    const ordinaryDamage = ordinary.mutations.find(
      (mutation) => mutation.kind === "resourceDelta" && mutation.characterId === "wight"
    );
    const strongDamage = strong.mutations.find(
      (mutation) => mutation.kind === "resourceDelta" && mutation.characterId === "wight"
    );

    expect(ordinaryDamage).toMatchObject({ resourceId: "hp" });
    expect(strongDamage).toMatchObject({ resourceId: "hp" });
    expect(ordinaryDamage?.kind === "resourceDelta" ? ordinaryDamage.delta : 0).toBeLessThan(-4);
    expect(strongDamage?.kind === "resourceDelta" ? strongDamage.delta : 0).toBeLessThan(
      ordinaryDamage?.kind === "resourceDelta" ? ordinaryDamage.delta : 0
    );
  });

  it("uses an applicable weapon damage prop even when an attack omits scaleByItemProp", () => {
    const story = makeStory();
    const attack = story.actions.find((action) => action.id === "attack_melee")!;
    attack.governingAttribute = "str";
    delete attack.effects.success.scaleByItemProp;

    const result = resolve(
      story,
      makePlayer({ attributes: { str: 18 } }),
      makeEnemy(),
      intent(),
      d20Sequence([7])
    );
    const damage = result.mutations.find(
      (mutation) => mutation.kind === "resourceDelta" && mutation.characterId === "wight"
    );

    expect(result.ruling.roll?.outcome).toBe("success");
    expect(damage).toMatchObject({ resourceId: "hp", delta: -14 });
  });

  it("bounds untrusted weapon damage props before applying them", () => {
    const story = makeStory();
    const attack = story.actions.find((action) => action.id === "attack_melee")!;
    attack.governingAttribute = "str";
    story.items.find((item) => item.id === "sword")!.props.damage = 999;

    const result = resolve(
      story,
      makePlayer({ attributes: { str: 18 } }),
      makeEnemy(),
      intent(),
      d20Sequence([7])
    );
    const damage = result.mutations.find(
      (mutation) => mutation.kind === "resourceDelta" && mutation.characterId === "wight"
    );

    expect(damage).toMatchObject({ resourceId: "hp", delta: -28 });
  });

  it("stages target damage scaled by the weapon's damage prop on success", () => {
    // success base -4 hp, sword damage prop 6 ⇒ -10.
    const r = resolve(makeStory(), makePlayer(), makeEnemy(), intent(), d20Sequence([11]));
    const dmg = r.mutations.find((m) => m.kind === "resourceDelta" && m.characterId === "wight");
    expect(dmg).toMatchObject({ resourceId: "hp", delta: -10 });
  });

  it("does not scale when no item prop applies (skill-less wild attack)", () => {
    const r = resolve(
      makeStory(),
      makePlayer(),
      makeEnemy(),
      intent({ actionId: "attack_wild", itemId: undefined }),
      d20Sequence([15])
    );
    const dmg = r.mutations.find((m) => m.kind === "resourceDelta" && m.characterId === "wight");
    expect(dmg).toMatchObject({ resourceId: "hp", delta: -3 });
  });

  it("stages self-damage on a crit_failure", () => {
    const r = resolve(makeStory(), makePlayer(), makeEnemy(), intent(), d20Sequence([1]));
    const self = r.mutations.find(
      (m) => m.kind === "resourceDelta" && m.characterId === "kestrel" && m.resourceId === "hp"
    );
    expect(self).toMatchObject({ delta: -2 });
  });

  it("pays the action cost on attempt, win or lose", () => {
    const win = resolve(makeStory(), makePlayer(), makeEnemy(), intent(), d20Sequence([11]));
    const lose = resolve(makeStory(), makePlayer(), makeEnemy(), intent(), d20Sequence([2]));
    for (const r of [win, lose]) {
      const cost = r.mutations.find((m) => m.kind === "resourceDelta" && m.resourceId === "stamina");
      expect(cost).toMatchObject({ characterId: "kestrel", delta: -2 });
    }
    expect(win.ruling.costsPaid).toEqual({ resources: { stamina: 2 } });
  });

  it("stages grantItem on a crafting success and spends the ingredient", () => {
    const p = makePlayer({
      skills: [learned("alchemy", "novice"), learned("lockpicking", "novice")],
      inventory: [{ itemId: "herb", qty: 2 }],
    });
    const r = resolve(
      makeStory(),
      p,
      undefined,
      intent({ actionId: "brew_potion", targetId: undefined, itemId: undefined }),
      d20Sequence([12])
    );
    expect(r.ruling.roll?.outcome).toBe("success");
    const grant = r.mutations.find((m) => m.kind === "grantItem");
    expect(grant).toMatchObject({ itemId: "potion", qty: 1 });
    const spend = r.mutations.find((m) => m.kind === "removeItem");
    expect(spend).toMatchObject({ itemId: "herb", qty: 1 });
  });

  it("stages setFlag on a social success", () => {
    const p = makePlayer({ skills: [learned("silver_tongue", "novice")] });
    const r = resolve(
      makeStory(),
      p,
      makeEnemy(),
      intent({ actionId: "persuade", itemId: undefined }),
      d20Sequence([13])
    );
    const flag = r.mutations.find((m) => m.kind === "setFlag");
    expect(flag).toMatchObject({ flagId: "ally", value: true });
  });

  it("scales a positive target delta upward by the item prop (healing)", () => {
    // mend_ally success base +3 hp, potion heal prop 10 ⇒ +13 (additive branch).
    const p = makePlayer({ inventory: [{ itemId: "potion", qty: 1 }] });
    const target = makeEnemy({ resources: { hp: { current: 1, max: 12 } } });
    const r = resolve(
      makeStory(),
      p,
      target,
      intent({ actionId: "mend_ally", targetId: "wight", itemId: "potion" }),
      d20Sequence([10])
    );
    const heal = r.mutations.find((m) => m.kind === "resourceDelta" && m.characterId === "wight");
    expect(heal).toMatchObject({ resourceId: "hp", delta: 13 });
  });
});

describe("resolve — opposed contests", () => {
  it("uses the same attribute plus mastery formula for both sides", () => {
    const story = makeStory();
    story.attributes = [
      { id: "might", name: "Might", abbrev: "MIG", description: "Physical power", defaultScore: 10 },
    ];
    story.actions.find((action) => action.id === "duel")!.governingAttribute = "might";
    const actor = makePlayer({ attributes: { might: 14 } });
    const target = makeEnemy({ attributes: { might: 8 } });

    const r = resolve(story, actor, target, intent({ actionId: "duel" }), d20Sequence([10, 10]));

    expect(r.ruling.roll).toMatchObject({
      attributeModifier: 2,
      masteryModifier: 1,
      modifier: 3,
      opposedAttributeModifier: -1,
      opposedMasteryModifier: 3,
      opposedModifier: 2,
      total: 13,
      opposedTotal: 12,
      outcome: "success",
    });
  });

  it("attacker wins when total exceeds the defender's", () => {
    // attacker novice +1 rolls 15 ⇒ 16; defender adept +3 rolls 10 ⇒ 13.
    const r = resolve(makeStory(), makePlayer(), makeEnemy(), intent({ actionId: "duel" }), d20Sequence([15, 10]));
    expect(r.ruling.roll?.outcome).toBe("success");
    expect(r.ruling.roll?.opposedTotal).toBe(13);
  });

  it("defender wins ties (attacker must exceed)", () => {
    // attacker +1 rolls 12 ⇒ 13; defender +3 rolls 10 ⇒ 13. Tie ⇒ failure.
    const r = resolve(makeStory(), makePlayer(), makeEnemy(), intent({ actionId: "duel" }), d20Sequence([12, 10]));
    expect(r.ruling.roll?.outcome).toBe("failure");
  });

  it("attacker loses when the defender's total is higher", () => {
    const r = resolve(makeStory(), makePlayer(), makeEnemy(), intent({ actionId: "duel" }), d20Sequence([5, 18]));
    expect(r.ruling.roll?.outcome).toBe("failure");
  });

  it("a natural 20 still crits while preserving the opponent's independent roll", () => {
    const r = resolve(makeStory(), makePlayer(), makeEnemy(), intent({ actionId: "duel" }), d20Sequence([20, 10]));
    expect(r.ruling.roll?.outcome).toBe("crit_success");
    expect(r.ruling.roll?.opposedTotal).toBeDefined();
  });
});

describe("resolve — XP mastery advancement", () => {
  it("advances rank when cumulative XP crosses the configured threshold", () => {
    const p = makePlayer({
      skills: [{ ...learned("blade", "novice", 2), xp: 95 }],
    });
    const r = resolve(makeStory(), p, makeEnemy(), intent(), d20Sequence([11]));
    expect(r.ruling.masteryAdvance).toMatchObject({ skillId: "blade", fromRank: "novice", toRank: "adept" });
    const setSkill = r.mutations.find((m) => m.kind === "setSkill");
    expect(setSkill).toMatchObject({ rank: "adept", successCount: 2 });
    expect(r.ruling.xpAward?.amount).toBeGreaterThan(0);
  });

  it("awards XP without incrementing the legacy success counter", () => {
    const p = makePlayer({ skills: [learned("blade", "novice", 0)] });
    const r = resolve(makeStory(), p, makeEnemy(), intent(), d20Sequence([11]));
    expect(r.ruling.masteryAdvance).toBeUndefined();
    const setSkill = r.mutations.find((m) => m.kind === "setSkill");
    expect(setSkill).toMatchObject({ rank: "novice", successCount: 0 });
    expect(r.ruling.xpAward?.newXp).toBeGreaterThan(0);
  });

  it("awards smaller practice XP on a failed allowed action", () => {
    const p = makePlayer({ skills: [learned("blade", "novice", 2)] });
    const r = resolve(makeStory(), p, makeEnemy(), intent(), d20Sequence([2]));
    expect(r.ruling.masteryAdvance).toBeUndefined();
    expect(r.ruling.xpAward?.amount).toBeGreaterThan(0);
    expect(r.mutations.some((m) => m.kind === "setSkill")).toBe(true);
  });

  it("does not advance a master past the top rank", () => {
    const p = makePlayer({ skills: [{ ...learned("blade", "master", 2), xp: 700 }] });
    const r = resolve(makeStory(), p, makeEnemy(), intent(), d20Sequence([11]));
    expect(r.ruling.masteryAdvance).toBeUndefined();
    const setSkill = r.mutations.find((m) => m.kind === "setSkill");
    expect(setSkill).toMatchObject({ rank: "master", successCount: 2 });
    expect(r.ruling.xpAward?.newXp).toBeGreaterThan(700);
  });
});
