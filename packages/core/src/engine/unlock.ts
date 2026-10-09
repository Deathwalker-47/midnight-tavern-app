/**
 * Skill unlock (low-level-plan M2 step 5).
 *
 * Handles the special `learn_skill` catalog action. Validates the chosen unlock
 * path (trainer flag / manual item / trial flag), the skill's prerequisites, and its
 * cost, then stages the mutations that grant the skill at novice rank and pay the
 * cost. Pure: returns a result + staged mutations for the ledger to commit.
 */
import { LEARN_SKILL_ACTION_ID } from "../types/index.js";
import type {
  CharacterHardState,
  CostSpec,
  GateVerdict,
  MechanicalIntent,
  Ruling,
  StorySchema,
  UnlockPath,
} from "../types/index.js";
import { normalizeCost } from "./costs.js";
import { canAfford, conditionHolds } from "./gate.js";
import type { StagedMutation } from "./ledger.js";

export interface UnlockResult {
  ok: boolean;
  reason?: string;
  mutations: StagedMutation[];
}

const fail = (reason: string): UnlockResult => ({ ok: false, reason, mutations: [] });

/** Whether the actor already knows the skill. */
function alreadyLearned(actor: CharacterHardState, skillId: string): boolean {
  return actor.skills.some((s) => s.skillId === skillId);
}

/** Validate that a chosen unlock path's own precondition is satisfied. */
function pathSatisfied(actor: CharacterHardState, path: UnlockPath): boolean {
  switch (path.method) {
    case "trainer":
      // A trainer path is gated by cost only (the npcHint is narrative);
      // affordability is checked separately against the path's cost.
      return true;
    case "manual":
      // Learning from a manual/tome requires holding that item.
      return (actor.inventory.find((e) => e.itemId === path.itemId)?.qty ?? 0) > 0;
    case "trial":
      // A trial path requires the trial's completion flag to be set.
      return actor.flags[path.flagId] === true;
  }
}

/** The cost a given path charges (only trainer paths have one). */
function pathCost(path: UnlockPath): CostSpec | undefined {
  return path.method === "trainer" ? path.cost : undefined;
}

/** Stage payment of an unlock cost. */
function stageCost(cost: CostSpec | undefined, actorId: string): StagedMutation[] {
  const muts: StagedMutation[] = [];
  if (!cost) return muts;
  if (cost.resources) {
    for (const [resId, amount] of Object.entries(cost.resources)) {
      muts.push({ kind: "resourceDelta", characterId: actorId, resourceId: resId, delta: -amount });
    }
  }
  if (cost.items) {
    for (const { itemId, qty } of cost.items) {
      muts.push({ kind: "removeItem", characterId: actorId, itemId, qty });
    }
  }
  return muts;
}

/**
 * Attempt to learn `skillId` for `actor` via the unlock path at `pathIndex` in the
 * skill's `unlockPaths`. Called by the orchestrator when the classifier emits
 * `learn_skill`.
 */
export function tryUnlock(
  schema: StorySchema,
  actor: CharacterHardState,
  skillId: string,
  pathIndex: number
): UnlockResult {
  if (!schema.locked) return fail("Story schema is not frozen.");
  if (!actor.alive) return fail("Actor is not alive.");

  const def = schema.skills.find((s) => s.id === skillId);
  if (!def) return fail(`Unknown skill "${skillId}".`);
  if (alreadyLearned(actor, skillId)) return fail(`${def.name} is already learned.`);

  const path = def.unlockPaths[pathIndex];
  if (!path) return fail("No such unlock path for this skill.");

  // Skill prerequisites must hold.
  for (const cond of def.prerequisites) {
    if (!conditionHolds(actor, cond)) {
      return fail(`Prerequisite not met for ${def.name}.`);
    }
  }

  // The chosen path's own precondition must hold.
  if (!pathSatisfied(actor, path)) {
    return fail(`Unlock path unavailable for ${def.name}.`);
  }

  // The path's cost must be affordable.
  const cost = pathCost(path);
  if (!canAfford(actor, cost)) {
    return fail(`Cannot afford to learn ${def.name}.`);
  }

  const mutations: StagedMutation[] = [
    ...stageCost(cost, actor.characterId),
    { kind: "setSkill", characterId: actor.characterId, skillId, rank: "novice", successCount: 0 },
  ];
  return { ok: true, mutations };
}

export interface LearnSkillContext {
  /** A present, living, non-hostile character other than the learner is available to teach. */
  trainerPresent: boolean;
}

export interface LearnSkillResolution {
  ruling: Ruling;
  mutations: StagedMutation[];
}

/**
 * Resolve a `learn_skill` intent into a ruling (plan 09 §3.2). Learning is ledger-only and fully
 * deterministic: the skill must exist, be unlearned, have its prerequisites met, and offer a path the
 * actor can use right now — a held manual, a completed trial, or a present teacher they can pay.
 * Paths are tried in rulebook order, so a free satisfied path wins over a later paid one.
 */
export function resolveLearnSkill(
  schema: StorySchema,
  actor: CharacterHardState,
  intent: MechanicalIntent,
  context: LearnSkillContext
): LearnSkillResolution {
  const skill = intent.skillId
    ? schema.skills.find((candidate) => candidate.id === intent.skillId)
    : undefined;
  const base = {
    turnId: `${intent.actorId}:${LEARN_SKILL_ACTION_ID}`,
    actorId: actor.characterId,
    actionId: LEARN_SKILL_ACTION_ID,
    actionLabel: skill ? `Learn ${skill.name}` : "Learn a skill",
  };
  const refuse = (reason: string, code: NonNullable<GateVerdict["code"]>): LearnSkillResolution => ({
    ruling: { ...base, gate: { allowed: false, reason, code }, effectsApplied: null },
    mutations: [],
  });

  if (!schema.locked) {
    return refuse("Story schema is not frozen; the gate refuses unlocked schemas.", "schema_unlocked");
  }
  if (!actor.alive) return refuse("Actor is not alive.", "actor_dead");
  if (!skill) {
    return refuse(
      intent.skillId ? `Unknown skill "${intent.skillId}".` : "No skill was named to learn.",
      "unknown_action"
    );
  }
  if (alreadyLearned(actor, skill.id)) {
    return refuse(`${skill.name} is already learned.`, "prerequisite_failed");
  }
  for (const condition of skill.prerequisites) {
    if (!conditionHolds(actor, condition)) {
      return refuse(`Prerequisite not met for ${skill.name}.`, "prerequisite_failed");
    }
  }

  let teacherMissing = false;
  let unaffordable = false;
  for (const path of skill.unlockPaths) {
    if (!pathSatisfied(actor, path)) continue;
    if (path.method === "trainer" && !context.trainerPresent) {
      teacherMissing = true;
      continue;
    }
    const cost = normalizeCost(schema, pathCost(path));
    if (!canAfford(actor, cost)) {
      unaffordable = true;
      continue;
    }
    return {
      ruling: {
        ...base,
        gate: { allowed: true },
        effectsApplied: { narrationHint: `${skill.name} is learned at novice rank.` },
        ...(cost ? { costsPaid: cost } : {}),
        masteryAdvance: { skillId: skill.id, fromRank: "untrained", toRank: "novice" },
      },
      mutations: [
        ...stageCost(cost, actor.characterId),
        { kind: "setSkill", characterId: actor.characterId, skillId: skill.id, rank: "novice", successCount: 0 },
      ],
    };
  }
  if (unaffordable) return refuse(`Cannot afford to learn ${skill.name}.`, "cannot_afford");
  if (teacherMissing) return refuse(`No one here can teach ${skill.name}.`, "prerequisite_failed");
  return refuse(`No way to learn ${skill.name} is available right now.`, "prerequisite_failed");
}
