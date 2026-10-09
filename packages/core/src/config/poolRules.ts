/**
 * Balance rules for the universal pool (plan 09 §4.5). Engineering authors every number in the pool
 * under the owner's grant; these rules are what make that authority reviewable rather than arbitrary.
 * Each is machine-checkable, runs over the whole pool in the test suite, and will run on user
 * overrides (S17), where a balance violation is a warning — the human GM may unbalance their own
 * game deliberately — while a structural one is an error.
 *
 * Interpretations recorded here so they can be challenged:
 *   - Cost scales with tier, but a free entry is allowed at any tier; a costed entry must cost within
 *     its tier's band.
 *   - "Better" and "worse" outcomes are compared by `outcomeValue`, a single actor-centred score in
 *     which one baseline hit of health is worth 4 points, matching a typical baseline attack.
 */
import type { ItemTier } from "../types/index.js";
import type {
  ActionArchetype,
  ArchetypeEffect,
  DifficultyWord,
  PoolStatus,
  UniversalArchetypes,
  UniversalPool,
} from "./pool.js";
import { poolDomain } from "./pool.js";
import { UNIVERSAL_ACTIONS_CONFIG, type UniversalActionConfig } from "./registry.js";

export type PoolRule =
  | "structure"
  | "dc"
  | "cost"
  | "cooldown"
  | "magnitude"
  | "outcomes"
  | "gates"
  | "symmetry";

export interface PoolViolation {
  rule: PoolRule;
  /** The archetype, entry or section the violation is about. */
  id: string;
  message: string;
}

/** DC band per difficulty word (inside the engine's 5–25). */
export const DIFFICULTY_DC_BANDS: Readonly<Record<DifficultyWord, readonly [number, number]>> = {
  trivial: [5, 9],
  standard: [10, 14],
  hard: [15, 19],
  extreme: [20, 25],
};

/** Total attempt cost band per tier, for entries that cost anything at all. */
export const TIER_COST_BANDS: Readonly<Record<ItemTier, readonly [number, number]>> = {
  common: [1, 2],
  uncommon: [3, 5],
  rare: [6, 9],
  legendary: [10, 14],
  mythical: [15, 40],
};

/** Ceiling on any health multiple per tier. */
export const TIER_MAX_HEALTH_MULTIPLE: Readonly<Record<ItemTier, number>> = {
  common: 1.5,
  uncommon: 2,
  rare: 2.5,
  legendary: 3.5,
  mythical: 4,
};

/** Ceiling on a skill's flat check or attribute bonus per tier. */
export const TIER_MAX_SKILL_BONUS: Readonly<Record<ItemTier, number>> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  legendary: 4,
  mythical: 5,
};

/** Cooldowns longer than this are reserved for legendary and mythical archetypes. */
export const MAX_ORDINARY_COOLDOWN = 5;

/** One baseline hit of health is worth this many points when comparing outcomes. */
const HEALTH_WEIGHT = 4;

function sum(values: Record<string, number | undefined> | undefined): number {
  return Object.values(values ?? {}).reduce<number>((total, value) => total + (value ?? 0), 0);
}

function statusValue(status: PoolStatus | undefined): number {
  if (!status) return 0;
  // Two attribute points are worth one point of check modifier.
  const perTurn = (status.checkBonus ?? 0) + sum(status.attributeBonus) / 2 + sum(status.resourcePerTurn);
  return perTurn * status.durationTurns;
}

/**
 * How good an outcome is for the actor. Target-side effects count in the direction the archetype
 * aims them: harm is good against a foe, help is good for an ally, and neither counts when the
 * target's side is unspecified.
 */
export function outcomeValue(effect: ArchetypeEffect, stance: ActionArchetype["targetStance"]): number {
  const self =
    HEALTH_WEIGHT * (effect.selfHealth ?? 0) + sum(effect.selfPools) + statusValue(effect.statusSelf);
  const target =
    HEALTH_WEIGHT * (effect.targetHealth ?? 0) +
    sum(effect.targetPools) +
    statusValue(effect.statusTarget);
  const direction = stance === "ally" ? 1 : stance === "foe" ? -1 : 0;
  return self + direction * target;
}

/** Whether an outcome changes any tracked state at all. */
export function hasMechanics(effect: ArchetypeEffect): boolean {
  return Boolean(
    effect.targetHealth ||
      effect.selfHealth ||
      sum(effect.targetPools) ||
      sum(effect.selfPools) ||
      effect.statusSelf ||
      effect.statusTarget
  );
}

/** The mechanical content of an archetype, for detecting two archetypes that should be one. */
function mechanicalFingerprint(archetype: UniversalArchetypes["archetypes"][number]): string {
  const { id: _id, description: _description, ...mechanics } = archetype;
  return JSON.stringify(mechanics);
}

/** Every violation of the structural and balance rules across the whole pool. */
export function poolViolations(
  archetypes: UniversalArchetypes,
  pool: UniversalPool,
  families: UniversalActionConfig = UNIVERSAL_ACTIONS_CONFIG
): PoolViolation[] {
  const violations: PoolViolation[] = [];
  const flag = (rule: PoolRule, id: string, message: string) => violations.push({ rule, id, message });

  const duplicates = (ids: string[], what: string) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) flag("structure", id, `Duplicate ${what} id.`);
      seen.add(id);
    }
  };
  duplicates(archetypes.archetypes.map((archetype) => archetype.id), "archetype");
  duplicates(pool.entries.map((entry) => entry.id), "entry");
  duplicates(pool.sections.map((section) => section.id), "section");

  const familiesById = new Map(families.actions.map((family) => [family.id, family]));
  const fingerprints = new Map<string, string>();
  for (const archetype of archetypes.archetypes) {
    const fingerprint = mechanicalFingerprint(archetype);
    const twin = fingerprints.get(fingerprint);
    if (twin) flag("symmetry", archetype.id, `Mechanically identical to ${twin}; collapse them into one.`);
    fingerprints.set(fingerprint, archetype.id);

    if (archetype.kind === "skill") {
      const bonuses = [archetype.passive, archetype.toggle?.bonus].filter((bonus) => bonus !== undefined);
      const cap = TIER_MAX_SKILL_BONUS[archetype.tier];
      for (const bonus of bonuses) {
        const amounts = [bonus.checkBonus?.amount ?? 0, ...Object.values(bonus.attributeBonus ?? {})];
        if (amounts.some((amount) => Math.abs(amount) > cap)) {
          flag("magnitude", archetype.id, `A ${archetype.tier} skill bonus may not exceed ±${cap}.`);
        }
      }
      continue;
    }

    const family = familiesById.get(archetype.universalFamily);
    if (!family) {
      flag("structure", archetype.id, `Unknown universal family "${archetype.universalFamily}".`);
    } else if (family.category !== archetype.category) {
      flag("structure", archetype.id, `Universal family "${family.id}" is ${family.category}, not ${archetype.category}.`);
    }

    const [low, high] = DIFFICULTY_DC_BANDS[archetype.difficulty];
    if (archetype.dc < low || archetype.dc > high) {
      flag("dc", archetype.id, `DC ${archetype.dc} is not ${archetype.difficulty} (${low}–${high}).`);
    }

    const cost = sum(archetype.costs);
    const [costLow, costHigh] = TIER_COST_BANDS[archetype.tier];
    if (cost > 0 && (cost < costLow || cost > costHigh)) {
      flag("cost", archetype.id, `A ${archetype.tier} archetype that costs anything costs ${costLow}–${costHigh}; this costs ${cost}.`);
    }

    const cooldown = archetype.cooldownTurns ?? 0;
    if (cooldown > MAX_ORDINARY_COOLDOWN && archetype.tier !== "legendary" && archetype.tier !== "mythical") {
      flag("cooldown", archetype.id, `A ${cooldown}-turn cooldown is reserved for legendary and mythical archetypes.`);
    }

    const healthCap = TIER_MAX_HEALTH_MULTIPLE[archetype.tier];
    for (const [outcome, effect] of Object.entries(archetype.effects)) {
      for (const multiple of [effect.targetHealth, effect.selfHealth]) {
        if (multiple !== undefined && Math.abs(multiple) > healthCap) {
          flag("magnitude", archetype.id, `${outcome} moves health by ${multiple}×; a ${archetype.tier} cap is ${healthCap}×.`);
        }
      }
    }

    const value = (outcome: keyof ActionArchetype["effects"]) =>
      outcomeValue(archetype.effects[outcome], archetype.targetStance);
    if (!(value("crit_success") > value("success"))) {
      flag("outcomes", archetype.id, "crit_success must be strictly better than success.");
    }
    if (!(value("crit_failure") < value("failure"))) {
      flag("outcomes", archetype.id, "crit_failure must be strictly worse than failure.");
    }
    if (value("success") < value("failure")) {
      flag("outcomes", archetype.id, "success may not be worse than failure.");
    }
    if (!Object.values(archetype.effects).some(hasMechanics)) {
      flag("outcomes", archetype.id, "At least one outcome must change tracked state.");
    }
    if (archetype.opposed && archetype.targeting && archetype.targeting.scope !== "single") {
      flag("gates", archetype.id, "An opposed contest needs one named defender, not a multi-target scope.");
    }
  }

  const archetypesById = new Map(archetypes.archetypes.map((archetype) => [archetype.id, archetype]));
  const entriesById = new Map(pool.entries.map((entry) => [entry.id, entry]));
  const sectionIds = new Set(pool.sections.map((section) => section.id));
  const usedArchetypes = new Set<string>();
  const usedSections = new Set<string>();
  for (const entry of pool.entries) {
    if (!sectionIds.has(entry.section)) flag("structure", entry.id, `Unknown section "${entry.section}".`);
    usedSections.add(entry.section);
    const archetype = archetypesById.get(entry.archetypeId);
    if (!archetype) {
      flag("structure", entry.id, `Unknown archetype "${entry.archetypeId}".`);
      continue;
    }
    if (!entry.excluded) usedArchetypes.add(archetype.id);
    if (archetype.kind !== entry.kind) {
      flag("structure", entry.id, `A ${entry.kind} entry cannot use the ${archetype.kind} archetype ${archetype.id}.`);
    }
    const expected = (archetype.params ?? []).map((param) => param.name).sort();
    const supplied = Object.keys(entry.params ?? {}).sort();
    if (JSON.stringify(expected) !== JSON.stringify(supplied)) {
      flag("symmetry", entry.id, `Parameters [${supplied.join(", ")}] do not match ${archetype.id}'s [${expected.join(", ")}].`);
    }
    if (entry.kind === "action" && !entry.aliases?.length) {
      flag("structure", entry.id, "An action entry needs at least one alias for the classifier.");
    }
    if (entry.requiresSkill) {
      const skill = entriesById.get(entry.requiresSkill);
      if (entry.kind !== "action") {
        flag("gates", entry.id, "Only an action can require a skill.");
      } else if (!skill || skill.kind !== "skill") {
        flag("gates", entry.id, `requiresSkill "${entry.requiresSkill}" is not a skill entry.`);
      } else if (skill.excluded) {
        flag("gates", entry.id, `requiresSkill "${skill.id}" is excluded.`);
      } else if (poolDomain(skill.id) !== poolDomain(entry.id)) {
        flag("gates", entry.id, `requiresSkill "${skill.id}" is outside the ${poolDomain(entry.id)} domain.`);
      }
    }
  }
  // A reaction skill fires exactly one action: the single live action entry gated by it.
  for (const entry of pool.entries) {
    const archetype = archetypesById.get(entry.archetypeId);
    if (entry.excluded || archetype?.kind !== "skill" || archetype.skillType !== "reaction") continue;
    const paired = pool.entries.filter(
      (candidate) => !candidate.excluded && candidate.kind === "action" && candidate.requiresSkill === entry.id
    );
    if (paired.length !== 1) {
      flag("gates", entry.id, `A reaction skill must gate exactly one action (it gates ${paired.length}).`);
    }
  }
  for (const archetype of archetypes.archetypes) {
    if (!usedArchetypes.has(archetype.id)) flag("structure", archetype.id, "No entry uses this archetype.");
  }
  for (const section of pool.sections) {
    if (!usedSections.has(section.id)) flag("structure", section.id, "This section has no entries.");
  }
  return violations;
}
