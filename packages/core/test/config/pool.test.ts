/**
 * The universal pool (plan 09 §4–§4b, S9). The shipped pool must pass every balance rule, and each
 * rule must actually catch what it claims to — so the "clean" result is not vacuous.
 */
import { describe, expect, it } from "vitest";
import {
  ArchetypeSchema,
  hasMechanics,
  outcomeValue,
  PoolEntrySchema,
  poolDomain,
  poolViolations,
  UNIVERSAL_ARCHETYPES,
  UNIVERSAL_POOL,
  type ActionArchetype,
  type PoolEntry,
  type UniversalArchetypes,
  type UniversalPool,
} from "../../src/index.js";
import lockedIds from "./universal-pool.ids.json";

const clone = <T>(value: T): T => structuredClone(value);
const sway = UNIVERSAL_ARCHETYPES.archetypes.find((archetype) => archetype.id === "arch.social.sway") as ActionArchetype;
const persuade = UNIVERSAL_POOL.entries.find((entry) => entry.id === "uni.social.persuasion.persuade")!;

/** Violations after one edit to a copy of the shipped pool. */
function violationsAfter(edit: (archetypes: UniversalArchetypes, pool: UniversalPool) => void) {
  const archetypes = clone(UNIVERSAL_ARCHETYPES) as UniversalArchetypes;
  const pool = clone(UNIVERSAL_POOL) as UniversalPool;
  edit(archetypes, pool);
  return poolViolations(archetypes, pool);
}
const actionArchetype = (archetypes: UniversalArchetypes, id: string) =>
  archetypes.archetypes.find((archetype) => archetype.id === id) as ActionArchetype;
const entry = (pool: UniversalPool, id: string) => pool.entries.find((candidate) => candidate.id === id)!;

describe("the shipped universal pool", () => {
  it("passes every structural and balance rule", () => {
    expect(poolViolations(UNIVERSAL_ARCHETYPES, UNIVERSAL_POOL)).toEqual([]);
  });

  it("covers everyday, combat and magic play at a meaningful size", () => {
    const live = UNIVERSAL_POOL.entries.filter((candidate) => !candidate.excluded);
    expect(live.filter((candidate) => candidate.kind === "action").length).toBeGreaterThanOrEqual(170);
    expect(live.filter((candidate) => candidate.kind === "skill").length).toBeGreaterThanOrEqual(30);
    expect(UNIVERSAL_POOL.sections.length).toBeGreaterThanOrEqual(35);
    const actionArchetypes = UNIVERSAL_ARCHETYPES.archetypes.filter((archetype) => archetype.kind === "action");
    expect(new Set(actionArchetypes.map((archetype) => archetype.category))).toEqual(
      new Set(["combat", "social", "exploration", "crafting", "utility"])
    );
    // Shape-identical entries really do collapse: far fewer archetypes than entries.
    expect(UNIVERSAL_ARCHETYPES.archetypes.length * 3).toBeLessThan(live.length);
  });

  it("pairs every reaction skill with the one action it fires", () => {
    const reactions = UNIVERSAL_POOL.entries.filter((candidate) => {
      const archetype = UNIVERSAL_ARCHETYPES.archetypes.find((a) => a.id === candidate.archetypeId);
      return archetype?.kind === "skill" && archetype.skillType === "reaction";
    });
    expect(reactions.map((reaction) => reaction.name)).toEqual(["Riposte", "Retaliation"]);
  });

  it("never loses an id once shipped", () => {
    const ids = new Set(UNIVERSAL_POOL.entries.map((candidate) => candidate.id));
    expect((lockedIds as string[]).filter((id) => !ids.has(id))).toEqual([]);
  });

  it("gives the classic finding-19 gesture an honest home", () => {
    const peaceful = UNIVERSAL_POOL.entries.find((candidate) => candidate.aliases?.includes("show my empty hands"));
    expect(peaceful).toMatchObject({ archetypeId: "arch.social.defuse", kind: "action" });
  });

  it("records every exclusion with a reason instead of dropping it", () => {
    const excluded = UNIVERSAL_POOL.entries.filter((candidate) => candidate.excluded);
    expect(excluded.length).toBeGreaterThan(0);
    expect(excluded.every((candidate) => (candidate.exclusionReason ?? "").length > 20)).toBe(true);
  });
});

describe("pool schemas", () => {
  it("reject mechanics on an entry, malformed ids, and unexplained exclusions", () => {
    expect(PoolEntrySchema.safeParse({ ...persuade, dc: 5 }).success).toBe(false);
    expect(PoolEntrySchema.safeParse({ ...persuade, id: "persuade" }).success).toBe(false);
    expect(PoolEntrySchema.safeParse({ ...persuade, excluded: true }).success).toBe(false);
    expect(poolDomain(persuade.id)).toBe("social");
  });

  it("tie a skill archetype's bonus block to its type", () => {
    const base = { id: "arch.skill.x", kind: "skill", description: "x", tier: "common" };
    expect(ArchetypeSchema.safeParse({ ...base, skillType: "passive" }).success).toBe(false);
    expect(ArchetypeSchema.safeParse({ ...base, skillType: "active", passive: { checkBonus: { amount: 1 } } }).success)
      .toBe(false);
    expect(ArchetypeSchema.safeParse({ ...base, skillType: "toggle" }).success).toBe(false);
    expect(ArchetypeSchema.safeParse({ ...base, skillType: "active" }).success).toBe(true);
    expect(ArchetypeSchema.safeParse({ ...base, skillType: "reaction" }).success).toBe(false);
    expect(ArchetypeSchema.safeParse({ ...base, skillType: "active", reaction: { trigger: "attacked" } }).success).toBe(false);
    expect(ArchetypeSchema.safeParse({ ...base, skillType: "reaction", reaction: { trigger: "damaged" } }).success).toBe(true);
  });
});

describe("outcome scoring", () => {
  it("counts target effects in the direction the archetype aims them", () => {
    const hurt = { narrationHint: "x", targetHealth: -1 };
    expect(outcomeValue(hurt, "foe")).toBe(4);
    expect(outcomeValue(hurt, "ally")).toBe(-4);
    expect(outcomeValue(hurt, "none")).toBe(0);
    const buff = {
      narrationHint: "x",
      selfPools: { stamina: 1 },
      statusSelf: { id: "s", label: "S", durationTurns: 2, checkBonus: 1, attributeBonus: { might: 2 }, resourcePerTurn: { health: 1 } },
    };
    expect(outcomeValue(buff, "none")).toBe(1 + 2 * (1 + 1 + 1));
    expect(hasMechanics({ narrationHint: "x" })).toBe(false);
    expect(hasMechanics({ narrationHint: "x", targetPools: { mana: -1 } })).toBe(true);
  });
});

describe("each balance rule catches what it claims to", () => {
  const rulesOf = (violations: ReturnType<typeof poolViolations>) => violations.map((violation) => violation.rule);

  it("structure", () => {
    expect(rulesOf(violationsAfter((a) => a.archetypes.push(clone(a.archetypes[0]!))))).toContain("structure");
    expect(rulesOf(violationsAfter((_, p) => p.entries.push(clone(p.entries[0]!))))).toContain("structure");
    expect(rulesOf(violationsAfter((_, p) => p.sections.push(clone(p.sections[0]!))))).toContain("structure");
    expect(violationsAfter((_, p) => (entry(p, persuade.id).section = "nowhere"))).toContainEqual(
      expect.objectContaining({ rule: "structure", id: persuade.id, message: 'Unknown section "nowhere".' })
    );
    expect(violationsAfter((_, p) => (entry(p, persuade.id).archetypeId = "arch.social.missing"))).toContainEqual(
      expect.objectContaining({ rule: "structure", message: 'Unknown archetype "arch.social.missing".' })
    );
    expect(violationsAfter((_, p) => (entry(p, persuade.id).archetypeId = "arch.skill.discipline"))).toContainEqual(
      expect.objectContaining({ rule: "structure", message: "A action entry cannot use the skill archetype arch.skill.discipline." })
    );
    expect(violationsAfter((_, p) => delete entry(p, persuade.id).aliases)).toContainEqual(
      expect.objectContaining({ rule: "structure", message: "An action entry needs at least one alias for the classifier." })
    );
    expect(violationsAfter((a) => (actionArchetype(a, sway.id).universalFamily = "juggle"))).toContainEqual(
      expect.objectContaining({ rule: "structure", message: 'Unknown universal family "juggle".' })
    );
    expect(violationsAfter((a) => (actionArchetype(a, sway.id).universalFamily = "search"))).toContainEqual(
      expect.objectContaining({ rule: "structure", message: 'Universal family "search" is exploration, not social.' })
    );
    // An archetype nothing uses, and a section with no entries, are dead weight.
    expect(violationsAfter((_, p) => (p.entries = p.entries.filter((candidate) => candidate.archetypeId !== "arch.tech.hack"))))
      .toContainEqual(expect.objectContaining({ rule: "structure", id: "arch.tech.hack" }));
    expect(violationsAfter((_, p) => p.sections.push({ id: "empty", title: "Empty", description: "Nothing." })))
      .toContainEqual(expect.objectContaining({ rule: "structure", id: "empty" }));
  });

  it("dc", () => {
    expect(violationsAfter((a) => (actionArchetype(a, sway.id).dc = 20))).toContainEqual(
      expect.objectContaining({ rule: "dc", id: sway.id, message: "DC 20 is not standard (10–14)." })
    );
  });

  it("cost", () => {
    expect(violationsAfter((a) => (actionArchetype(a, sway.id).costs = { stamina: 4 }))).toContainEqual(
      expect.objectContaining({ rule: "cost", id: sway.id })
    );
    expect(violationsAfter((a) => (actionArchetype(a, "arch.social.rally").costs = { stamina: 1 }))).toContainEqual(
      expect.objectContaining({ rule: "cost", id: "arch.social.rally" })
    );
  });

  it("cooldown", () => {
    expect(violationsAfter((a) => (actionArchetype(a, sway.id).cooldownTurns = 6))).toContainEqual(
      expect.objectContaining({ rule: "cooldown", id: sway.id })
    );
    expect(
      violationsAfter((a) => {
        const archetype = actionArchetype(a, sway.id);
        archetype.cooldownTurns = 6;
        archetype.tier = "legendary";
      }).filter((violation) => violation.rule === "cooldown")
    ).toEqual([]);
  });

  it("magnitude", () => {
    expect(violationsAfter((a) => (actionArchetype(a, "arch.care.tend").effects.crit_success.targetHealth = 3))).toContainEqual(
      expect.objectContaining({ rule: "magnitude", id: "arch.care.tend" })
    );
    expect(violationsAfter((a) => (actionArchetype(a, "arch.care.self_tend").effects.crit_success.selfHealth = 3))).toContainEqual(
      expect.objectContaining({ rule: "magnitude", id: "arch.care.self_tend" })
    );
    expect(
      violationsAfter((a) => {
        const knack = a.archetypes.find((archetype) => archetype.id === "arch.skill.hardy");
        if (knack?.kind === "skill") knack.passive = { attributeBonus: { endurance: 3 } };
      })
    ).toContainEqual(expect.objectContaining({ rule: "magnitude", id: "arch.skill.hardy" }));
    expect(
      violationsAfter((a) => {
        const toggle = a.archetypes.find((archetype) => archetype.id === "arch.skill.charm_toggle");
        if (toggle?.kind === "skill") toggle.toggle!.bonus = { checkBonus: { amount: 4 } };
      })
    ).toContainEqual(expect.objectContaining({ rule: "magnitude", id: "arch.skill.charm_toggle" }));
  });

  it("outcomes", () => {
    const messages = (edit: (archetype: ActionArchetype) => void) =>
      violationsAfter((a) => edit(actionArchetype(a, sway.id)))
        .filter((violation) => violation.rule === "outcomes")
        .map((violation) => violation.message);
    expect(messages((archetype) => delete archetype.effects.crit_success.statusSelf)).toEqual([
      "crit_success must be strictly better than success.",
    ]);
    expect(messages((archetype) => delete archetype.effects.crit_failure.statusSelf)).toEqual([
      "crit_failure must be strictly worse than failure.",
    ]);
    expect(messages((archetype) => (archetype.effects.success.selfPools = { stamina: -3 }))).toContain(
      "success may not be worse than failure."
    );
    expect(
      messages((archetype) => {
        for (const effect of Object.values(archetype.effects)) delete effect.statusSelf;
      })
    ).toContain("At least one outcome must change tracked state.");
  });

  it("gates", () => {
    expect(violationsAfter((a) => (actionArchetype(a, "arch.social.rally").opposed = true))).toContainEqual(
      expect.objectContaining({ rule: "gates", id: "arch.social.rally" })
    );
    const gated = "uni.social.diplomacy.broker_an_agreement";
    const gate = (requiresSkill: string) =>
      violationsAfter((_, p) => (entry(p, gated).requiresSkill = requiresSkill)).filter((violation) => violation.rule === "gates");
    expect(gate("uni.social.diplomacy.lobby_for_support")).toHaveLength(1);
    expect(gate("uni.care.medicine.medicine")[0]!.message).toMatch(/outside the social domain/);
    expect(
      violationsAfter((_, p) => {
        entry(p, "uni.social.diplomacy.diplomacy").excluded = true;
        entry(p, "uni.social.diplomacy.diplomacy").exclusionReason = "For the test.";
      }).filter((violation) => violation.rule === "gates")
    ).toHaveLength(3);
    expect(
      violationsAfter((_, p) => (entry(p, "uni.care.medicine.medicine").requiresSkill = "uni.care.medicine.medicine"))
    ).toContainEqual(expect.objectContaining({ rule: "gates", message: "Only an action can require a skill." }));
    // A reaction skill fires exactly one action.
    expect(
      violationsAfter((_, p) => (entry(p, "uni.combat.reflexes.riposte_strike").requiresSkill = "uni.combat.melee.weapon_mastery"))
    ).toContainEqual(expect.objectContaining({ rule: "gates", id: "uni.combat.reflexes.riposte", message: "A reaction skill must gate exactly one action (it gates 0)." }));
    expect(
      violationsAfter((_, p) => (entry(p, "uni.combat.reflexes.retaliating_blow").requiresSkill = "uni.combat.reflexes.riposte"))
    ).toContainEqual(expect.objectContaining({ rule: "gates", id: "uni.combat.reflexes.riposte", message: "A reaction skill must gate exactly one action (it gates 2)." }));
  });

  it("symmetry", () => {
    expect(
      violationsAfter((a) => {
        const twin = clone(actionArchetype(a, sway.id));
        twin.id = "arch.social.sway_twin";
        a.archetypes.push(twin);
      })
    ).toContainEqual(expect.objectContaining({ rule: "symmetry", id: "arch.social.sway_twin" }));
    expect(
      violationsAfter((_, p) => ((entry(p, persuade.id) as PoolEntry).params = { element: "fire" }))
    ).toContainEqual(expect.objectContaining({ rule: "symmetry", id: persuade.id }));
  });
});
