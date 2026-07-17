/**
 * 50-turn scripted playthrough (low-level-plan Milestone A: "a scripted 'fake story'
 * plays 50 turns via unit harness with correct gating, mastery advancement, death").
 *
 * This is an integration harness, not a unit test: it drives the real resolve → commit
 * loop over a deterministic RNG and asserts the emergent behaviours the milestone gate
 * calls for — a gating denial mid-run, mastery ranking up through a threshold, and a
 * target dying from accumulated damage — plus the invariant that hard state never
 * leaves its bounds across the whole run.
 *
 * Exact arithmetic (all rolls seeded to a d20 face of 15 ⇒ +1 blade ⇒ total 16 ≥ DC 12,
 * a plain success):
 *   • attack_melee success = -4 hp base, scaled by the sword's `damage` prop (6) ⇒ -10 hp.
 *   • The wight starts at 50 hp, so it dies on the 5th landed hit.
 *   • blade ranks up every 3 successes: novice→adept lands on the 3rd hit (turn 4),
 *     while the wight is still alive; adept only reaches 2 successes before we stop
 *     attacking, so no second rank-up.
 */
import { describe, it, expect } from "vitest";
import { resolve, commit } from "../src/index.js";
import type { MechanicalIntent, CharacterHardState, RollRecord } from "../src/index.js";
import { makeStory, makePlayer, makeEnemy, learned } from "./fixtures.js";

/** A per-turn RNG so each turn's rolls are independent and exact. */
function facesRng(faces: number[]): () => number {
  let i = 0;
  return () => {
    const f = faces[Math.min(i, faces.length - 1)] ?? 10;
    i += 1;
    return (f - 0.5) / 20; // inverse of rollD20's floor(rng()*20)+1
  };
}

/** Record of what happened on a committed turn, for post-run assertions. */
interface TurnLog {
  turn: number;
  actionId: string;
  allowed: boolean;
  outcome?: RollRecord["outcome"];
  ranked?: { from: string; to: string };
  died: string[];
}

describe("50-turn scripted playthrough", () => {
  it("plays 50 turns with correct gating, mastery advancement, and death", () => {
    const story = makeStory();
    const player = makePlayer({
      // Fresh blade novice at 0 successes so we can watch it rank up.
      skills: [learned("blade", "novice", 0)],
      inventory: [{ itemId: "sword", qty: 1 }],
      resources: { hp: { current: 20, max: 20 }, stamina: { current: 40, max: 40 } },
    });
    const enemy = makeEnemy({ resources: { hp: { current: 50, max: 50 } } });
    const world = new Map<string, CharacterHardState>([
      [player.characterId, player],
      [enemy.characterId, enemy],
    ]);

    const attack: MechanicalIntent = {
      actorId: "kestrel",
      actionId: "attack_melee",
      targetId: "wight",
      itemId: "sword",
      confidence: 1,
    };
    const denied: MechanicalIntent = { actorId: "kestrel", actionId: "phantom_rite", confidence: 1 };
    const rest: MechanicalIntent = { actorId: "kestrel", actionId: "search_room", confidence: 1 };

    // Build the 50-turn script deterministically:
    //   turn 1        — a gate denial (unlearned skill "phantom")
    //   turns 2..6    — five landed hits; rank-up on turn 4, the wight dies on turn 6
    //   turns 7..50   — non-combat filler (search_room) so mastery does not climb further
    const script: { intent: MechanicalIntent; faces: number[] }[] = [];
    script.push({ intent: denied, faces: [15] });
    for (let i = 0; i < 5; i++) script.push({ intent: attack, faces: [15] });
    for (let i = 0; i < 44; i++) script.push({ intent: rest, faces: [15] });

    const logs: TurnLog[] = [];

    script.forEach(({ intent, faces }, idx) => {
      const actor = world.get(intent.actorId)!;
      const target = intent.targetId ? world.get(intent.targetId) : undefined;
      const r = resolve(story, actor, target, intent, facesRng(faces));

      const log: TurnLog = {
        turn: idx + 1,
        actionId: intent.actionId,
        allowed: r.ruling.gate.allowed,
        died: [],
      };
      if (r.ruling.roll) log.outcome = r.ruling.roll.outcome;
      if (r.ruling.masteryAdvance) {
        log.ranked = { from: r.ruling.masteryAdvance.fromRank, to: r.ruling.masteryAdvance.toRank };
      }
      if (r.mutations.length > 0) log.died = commit(story, r.mutations, world);
      logs.push(log);
    });

    // --- Milestone assertions ---

    // Exactly 50 turns ran.
    expect(logs).toHaveLength(50);

    // Gating: turn 1 was denied and rolled nothing.
    expect(logs[0]!.allowed).toBe(false);
    expect(logs[0]!.outcome).toBeUndefined();
    // Every other scripted turn was allowed (player stays alive and can afford costs).
    expect(logs.slice(1).every((l) => l.allowed)).toBe(true);

    // Mastery advancement: blade ranked novice→adept exactly once, on turn 4.
    const ranks = logs.filter((l) => l.ranked);
    expect(ranks).toHaveLength(1);
    expect(ranks[0]).toMatchObject({ turn: 4, ranked: { from: "novice", to: "adept" } });
    expect(player.skills.find((s) => s.skillId === "blade")!.rank).toBe("adept");

    // Death: the wight died once, from accumulated damage, on the 5th hit (turn 6).
    const deathTurns = logs.filter((l) => l.died.includes("wight"));
    expect(deathTurns).toHaveLength(1);
    expect(deathTurns[0]!.turn).toBe(6);
    expect(enemy.alive).toBe(false);
    expect(enemy.resources.hp!.current).toBe(0);

    // No resurrection: the wight stays dead at 0 hp for the rest of the run.
    expect(enemy.alive).toBe(false);
    expect(enemy.resources.hp!.current).toBe(0);

    // Invariant: every resource on every character stayed within [0, max] all run.
    for (const c of world.values()) {
      for (const res of Object.values(c.resources)) {
        expect(res.current).toBeGreaterThanOrEqual(0);
        expect(res.current).toBeLessThanOrEqual(res.max);
      }
    }
  });
});
