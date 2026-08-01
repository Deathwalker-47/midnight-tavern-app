/**
 * Same-turn NPC agency (HANDOFF root cause 2). A present, living NPC that the player
 * attacks this turn must produce its OWN authoritative ruling before narration — engine
 * gates/dice, not narrator prose. Dead/off-scene entities never act, and NPC reactions
 * are governed by their own encounter budget, never the player's configured action budget.
 *
 * These are deterministic: `attack_melee` costs stamina the grave-wight fixture does not
 * have, so the wight's only gate-legal counter is `attack_wild` (no skill, no item, no
 * cost) — one flat d20 the seeded RNG controls exactly.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { d20Sequence } from "../../src/engine/dice.js";
import { submitTurn } from "../../src/orchestrator/index.js";
import type {
  ActionDef,
  ChatResponse,
  ClassifiedTurn,
  Role,
  RoleBinding,
  RolePrompt,
  Router,
  StreamHandler,
} from "../../src/index.js";
import { openStore, type Store } from "../../src/store/index.js";
import { makeEnemy, makePlayer, makeStory } from "../fixtures.js";
import type { NpcIntroductionProposal } from "../../src/orchestrator/npcIntroduction.js";
import {
  planHostileNpcFallback,
  type NpcActionProposal,
  type NpcPlanInput,
} from "../../src/orchestrator/npcAgency.js";
import type { StageMetric } from "../../src/orchestrator/stagePolicy.js";

/** Minimal V7 router: canned classifier + loot decline + a fixed narrator stream. */
class AgencyRouter implements Router {
  lastClassifierPrompt?: RolePrompt;
  lastNarratorPrompt?: RolePrompt;
  lastPlannerPrompt?: RolePrompt;
  plannedActions: readonly NpcActionProposal[] = [];
  plannerFailure?: Error;

  constructor(
    readonly classified: ClassifiedTurn,
    readonly narration = "Blades cross in the dark; the creature does not yield.",
    readonly transitions: readonly NpcIntroductionProposal[] = [],
    readonly narrationFailure?: Error
  ) {}
  bindingFor(_role: Role): RoleBinding {
    return { provider: "openrouter", model: "test", source: "recommended", samplersDirty: false };
  }
  async complete(role: Role, prompt: RolePrompt): Promise<ChatResponse> {
    if (role === "classifier" && prompt.system.includes("NPC presence registrar")) {
      return { content: JSON.stringify({ transitions: this.transitions }) };
    }
    if (role === "classifier" && prompt.system.includes("NPC action planner")) {
      this.lastPlannerPrompt = prompt;
      if (this.plannerFailure) throw this.plannerFailure;
      return { content: JSON.stringify({ actions: this.plannedActions }) };
    }
    if (role === "classifier" && prompt.system.includes("strict consistency auditor")) {
      return { content: JSON.stringify({ obeysRulings: true, contradictions: [] }) };
    }
    if (role === "classifier" && prompt.system.includes("DM loot adjudicator")) {
      return { content: JSON.stringify({ award: false, reason: "No completed encounter." }) };
    }
    if (role === "classifier") {
      this.lastClassifierPrompt = prompt;
      return { content: JSON.stringify(this.classified) };
    }
    if (role === "analyzer") return { content: JSON.stringify({ characterOps: [], worldOps: [] }) };
    return { content: "" };
  }
  async stream(_role: Role, prompt: RolePrompt, onDelta: StreamHandler): Promise<ChatResponse> {
    this.lastNarratorPrompt = prompt;
    if (this.narrationFailure) throw this.narrationFailure;
    const content = this.narration;
    onDelta(content);
    return { content };
  }
}

const PLAYER_ATTACK = {
  actorId: "kestrel",
  actionId: "attack_melee",
  targetId: "wight",
  itemId: "sword",
  confidence: 1,
} as const;

function hostileFallbackInput(): NpcPlanInput {
  const schema = makeStory({ storyId: "fallback-story" });
  const player = makePlayer();
  const hostile = makeEnemy({ flags: { npc_hostile_to_player: true } });
  return {
    schema,
    playerText: "I wait.",
    recentNarration: ["The Grave-wight attacks Kestrel."],
    candidates: [hostile],
    nameById: new Map([["kestrel", "Kestrel"], ["wight", "Grave-wight"]]),
    present: new Map([["kestrel", true], ["wight", false]]),
    hardById: new Map([["kestrel", player], ["wight", hostile]]),
  };
}

describe("validated hostile fallback policy", () => {
  it("requires one present living player target and a present living hostile actor", () => {
    const baseline = hostileFallbackInput();
    expect(planHostileNpcFallback(baseline)).toHaveLength(1);

    const deadActor = makeEnemy({ alive: false, flags: { npc_hostile_to_player: true } });
    expect(planHostileNpcFallback({ ...baseline, candidates: [deadActor] })).toEqual([]);

    const absentActor = hostileFallbackInput();
    absentActor.present.delete("wight");
    expect(planHostileNpcFallback(absentActor)).toEqual([]);

    const deadTarget = hostileFallbackInput();
    deadTarget.hardById = new Map([
      ["kestrel", makePlayer({ alive: false })],
      ["wight", deadTarget.candidates[0]!],
    ]);
    expect(planHostileNpcFallback(deadTarget)).toEqual([]);

    const absentTarget = hostileFallbackInput();
    absentTarget.present.delete("kestrel");
    expect(planHostileNpcFallback(absentTarget)).toEqual([]);
  });

  it("does nothing when the sealed catalog has no legal damaging action", () => {
    const input = hostileFallbackInput();
    input.schema = {
      ...input.schema,
      actions: input.schema.actions.filter((action) => action.category !== "combat"),
    };

    expect(planHostileNpcFallback(input)).toEqual([]);
  });
});

describe("same-turn NPC agency", () => {
  let store: Store;
  const storyId = "fixture-story";

  async function seedWightHp(hp: number, hostile = false): Promise<void> {
    await store.characters.insert({
      id: "wight",
      storyId,
      name: "Grave-wight",
      isPlayer: false,
      hard: {
        characterId: "wight",
        isPlayer: false,
        templateId: "wight",
        attributes: {},
        resources: { hp: { current: hp, max: hp } },
        skills: [{ skillId: "blade", rank: "adept", successCount: 0 }],
        inventory: [{ itemId: "sword", qty: 1 }],
        flags: hostile ? { npc_hostile_to_player: true } : {},
        alive: true,
      },
    });
  }

  beforeEach(async () => {
    store = await openStore(":memory:");
    const schema = makeStory({ storyId });
    await store.stories.insert({
      id: storyId,
      title: schema.title,
      createdAt: 0,
      schema,
      locked: true,
      actionBudget: 2,
    });
    await store.characters.insert({
      id: "kestrel",
      storyId,
      name: "Kestrel",
      isPlayer: true,
      hard: makePlayer(),
    });
  });

  it("gives a living, attacked NPC a same-turn authoritative counter-attack", async () => {
    await seedWightHp(12); // survives a -10 melee success, so it reacts
    const result = await submitTurn(
      new AgencyRouter({ playerIntents: [PLAYER_ATTACK], npcIntents: [], freeText: "" }),
      store,
      storyId,
      "I strike the wight with my sword.",
      { rng: d20Sequence([15]) } // player roll 15, NPC reaction reuses 15
    );
    await result.background;

    // The player's strike stands...
    expect(result.rulings[0]).toMatchObject({
      actorId: "kestrel",
      actionId: "attack_melee",
      targetId: "wight",
      gate: { allowed: true },
    });
    // ...and the wight answers this SAME turn with its own engine ruling targeting the player.
    const reaction = result.rulings.find(
      (ruling) => ruling.actorId === "wight" && ruling.targetId === "kestrel"
    );
    expect(reaction, "the attacked wight should react this turn").toBeDefined();
    expect(reaction!.gate.allowed).toBe(true);
    expect(reaction!.roll).toBeDefined(); // authoritative dice, not prose
    // The reaction actually committed: the wight can't afford melee's stamina, so it
    // wild-swings (success at d20 15 vs DC 15) for -3 to the player.
    expect(reaction!.actionId).toBe("attack_wild");
    expect((await store.characters.get("kestrel"))!.hard.resources.hp!.current).toBe(17);
  });

  it("promotes a consequential prose-only creature before it acts this turn", async () => {
    await store.messages.insert({
      id: "scene-intro",
      storyId,
      idx: 0,
      role: "narrator",
      content: "A hunched creature crawls from the cistern and blocks the narrow passage.",
      createdAt: 0,
    });
    const promotedId = "fixture-story:scene:hunched-creature";
    const result = await submitTurn(
      new AgencyRouter({
        playerIntents: [
          {
            ...PLAYER_ATTACK,
            targetId: promotedId,
          },
        ],
        npcIntents: [],
        freeText: "",
      }),
      store,
      storyId,
      "I attack the hunched creature with my sword.",
      { rng: d20Sequence([15]) }
    );
    await result.background;

    const promoted = await store.characters.get(promotedId);
    expect(promoted).toMatchObject({
      id: promotedId,
      storyId,
      name: "Hunched creature",
      isPlayer: false,
      hard: {
        characterId: promotedId,
        isPlayer: false,
        alive: true,
      },
    });
    expect(result.rulings[0]).toMatchObject({
      actorId: "kestrel",
      actionId: "attack_melee",
      targetId: promotedId,
      gate: { allowed: true },
    });
    expect(
      result.rulings.find(
        (ruling) => ruling.actorId === promotedId && ruling.targetId === "kestrel"
      )
    ).toMatchObject({
      actionId: "attack_wild",
      gate: { allowed: true },
      roll: { natural: 15 },
    });
  });

  it("lets a skill-less promoted creature counter through the universal natural attack", async () => {
    const persisted = await store.stories.get(storyId);
    await store.stories.update({
      ...persisted!,
      schema: {
        ...persisted!.schema,
        actions: persisted!.schema.actions.filter((action) => action.id !== "attack_wild"),
      },
    });
    await store.messages.insert({
      id: "gated-scene-intro",
      storyId,
      idx: 0,
      role: "narrator",
      content: "A hunched beast drops from the arch and attacks Kestrel.",
      createdAt: 0,
    });
    const creatureId = "fixture-story:scene:hunched-beast";

    const result = await submitTurn(
      new AgencyRouter(
        {
          playerIntents: [{ ...PLAYER_ATTACK, targetId: creatureId }],
          npcIntents: [],
          freeText: "",
        },
        "The hunched beast recoils but remains in the fight.",
        [
          {
            operation: "introduce",
            name: "Hunched beast",
            grounding: "hunched beast",
          },
        ]
      ),
      store,
      storyId,
      "I strike the hunched beast with my sword.",
      { rng: d20Sequence([15]) }
    );
    await result.background;

    const creature = await store.characters.get(creatureId);
    expect(creature?.hard.skills).toEqual([]);
    expect(creature?.hard.inventory).toEqual([]);
    expect(result.rulings).toContainEqual(
      expect.objectContaining({
        actorId: creatureId,
        actionId: "universal_natural_attack",
        targetId: "kestrel",
        gate: { allowed: true },
        roll: expect.objectContaining({ natural: 15 }),
      })
    );
    expect((await store.characters.get("kestrel"))!.hard.resources.hp!.current).toBe(16);
  });

  it("registers the current undocumented creature before classifying two player strikes", async () => {
    await store.characters.insert({
      id: "old-dead-man",
      storyId,
      name: "Dead man",
      isPlayer: false,
      present: true,
      hard: {
        characterId: "old-dead-man",
        isPlayer: false,
        attributes: {},
        resources: { hp: { current: 10, max: 10 } },
        skills: [],
        inventory: [],
        flags: {},
        alive: true,
      },
    });
    await store.messages.insert({
      id: "new-threat",
      storyId,
      idx: 0,
      role: "narrator",
      content: "A hulking creature drops from the vaulted dark and bears down on you.",
      createdAt: 0,
    });
    const creatureId = `${storyId}:scene:hulking-creature`;
    const attack = {
      ...PLAYER_ATTACK,
      targetId: creatureId,
    };
    const router = new AgencyRouter(
      { playerIntents: [attack, attack], npcIntents: [], freeText: "" },
      "Both cuts bite into the creature as it crashes down.",
      [{
        operation: "introduce",
        name: "Hulking creature",
        grounding: "A hulking creature drops from the vaulted dark",
      }]
    );

    const result = await submitTurn(
      router,
      store,
      storyId,
      "I strike the creature twice.",
      { rng: d20Sequence([15]) }
    );
    await result.background;

    expect(await store.characters.get(creatureId)).toMatchObject({
      name: "Hulking creature",
      present: true,
      isPlayer: false,
    });
    expect(result.refusedActionCount).toBe(0);
    expect(result.rulings.slice(0, 2)).toEqual([
      expect.objectContaining({
        actorId: "kestrel",
        targetId: creatureId,
        gate: { allowed: true },
      }),
      expect.objectContaining({
        actorId: "kestrel",
        targetId: creatureId,
        gate: { allowed: true },
      }),
    ]);
    expect(result.rulings.some((ruling) => ruling.targetId === "old-dead-man")).toBe(false);
    expect(router.lastClassifierPrompt?.user).toContain("Hulking creature");
    expect(router.lastNarratorPrompt?.user).toContain("Hulking creature");
  });

  it("does not promote an ambient depiction even when the player names it", async () => {
    await store.messages.insert({
      id: "ambient-scene",
      storyId,
      idx: 0,
      role: "narrator",
      content:
        "The scenery is crumbling. A faded mural shows a guard beside a painted crowd.",
      createdAt: 0,
    });
    const result = await submitTurn(
      new AgencyRouter({ playerIntents: [], npcIntents: [], freeText: "I threaten the guard." }),
      store,
      storyId,
      "I threaten the guard.",
      { rng: d20Sequence([15]) }
    );
    await result.background;

    expect(await store.characters.listByStory(storyId)).toHaveLength(1);
    expect(result.rulings).toHaveLength(0);
  });

  it("registers an actual NPC introduced by narration before the player provokes it", async () => {
    await store.messages.insert({
      id: "guard-arrives",
      storyId,
      idx: 0,
      role: "narrator",
      content: "A weary guard stands beside the gate and watches the road.",
      createdAt: 0,
    });
    const result = await submitTurn(
      new AgencyRouter({ playerIntents: [], npcIntents: [], freeText: "I wait." }),
      store,
      storyId,
      "I wait and listen.",
      { rng: d20Sequence([15]) }
    );
    await result.background;

    expect(await store.characters.get("fixture-story:scene:weary-guard")).toMatchObject({
      name: "Weary guard",
      isPlayer: false,
    });
    expect(result.rulings).toHaveLength(0);
  });

  it("registers a grounded named NPC before narration portrays it", async () => {
    const result = await submitTurn(
      new AgencyRouter(
        { playerIntents: [], npcIntents: [], freeText: "I wait." },
        "Mara enters the crypt and raises a lantern.",
        [{
          operation: "introduce",
          name: "Mara",
          grounding: "Mara",
        }]
      ),
      store,
      storyId,
      "I call for Mara and wait.",
      { rng: d20Sequence([15]) }
    );
    await result.background;

    expect(await store.characters.get("fixture-story:scene:mara")).toMatchObject({
      name: "Mara",
      isPlayer: false,
    });
  });

  it("commits an approved NPC with deterministic fallback when narration is unavailable", async () => {
    const maraId = `${storyId}:scene:mara`;
    const result = await submitTurn(
      new AgencyRouter(
        { playerIntents: [], npcIntents: [], freeText: "I wait." },
        "Mara enters the crypt.",
        [{
          operation: "introduce",
          name: "Mara",
          grounding: "Mara",
        }],
        new Error("Narrator unavailable")
      ),
      store,
      storyId,
      "I call for Mara.",
      { rng: d20Sequence([15]) }
    );
    expect(result.usedNarratorFallback).toBe(true);
    expect(await store.characters.get(maraId)).toMatchObject({
      name: "Mara",
      present: true,
    });
  });

  it("never lets a slain NPC act", async () => {
    await seedWightHp(12); // dies to a -16 melee crit
    const result = await submitTurn(
      new AgencyRouter({ playerIntents: [PLAYER_ATTACK], npcIntents: [], freeText: "" }),
      store,
      storyId,
      "I run the wight through.",
      { rng: d20Sequence([20]) } // natural 20 crit
    );
    await result.background;

    expect((await store.characters.get("wight"))!.hard.alive).toBe(false);
    expect(result.rulings.some((ruling) => ruling.actorId === "wight")).toBe(false);
    expect((await store.characters.get("kestrel"))!.hard.resources.hp!.current).toBe(20);
  });

  it("keeps an absent NPC registered but excludes it from active play", async () => {
    await seedWightHp(12);
    await store.characters.setPresent("wight", false);
    const router = new AgencyRouter({
      playerIntents: [PLAYER_ATTACK],
      npcIntents: [],
      freeText: "",
    });

    const result = await submitTurn(
      router,
      store,
      storyId,
      "I search the empty crypt.",
      { rng: d20Sequence([15]) }
    );
    await result.background;

    expect((await store.characters.get("wight"))?.present).toBe(false);
    expect(result.rulings.some((ruling) =>
      ruling.actorId === "wight" || ruling.targetId === "wight"
    )).toBe(false);
    expect(router.lastClassifierPrompt?.user).not.toContain("Grave-wight");
    expect(router.lastNarratorPrompt?.user).not.toContain("Grave-wight");
  });

  it("reacts on the player's own budget-exhausting turn — NPC agency is a separate budget", async () => {
    await seedWightHp(12);
    // Two attacks with a budget of 1: one accepted, one refused. The wight still reacts
    // to the accepted attack even though the player's action budget is fully spent.
    const current = (await store.stories.get(storyId))!;
    await store.stories.update({ ...current, actionBudget: 1 });
    const result = await submitTurn(
      new AgencyRouter({
        playerIntents: [PLAYER_ATTACK, PLAYER_ATTACK],
        npcIntents: [],
        freeText: "",
      }),
      store,
      storyId,
      "I strike twice.",
      { rng: d20Sequence([15]) }
    );
    await result.background;

    expect(result.refusedActionCount).toBe(1); // player is capped at one action
    const reaction = result.rulings.find((ruling) => ruling.actorId === "wight");
    expect(reaction, "player budget must not suppress NPC agency").toBeDefined();
    expect(reaction!.gate.allowed).toBe(true);
  });

  it("runs the goal planner as a bounded stage and emits its latency metric", async () => {
    await seedWightHp(12); // a present idle NPC → the planner stage fires
    const metrics: StageMetric[] = [];
    const result = await submitTurn(
      new AgencyRouter({ playerIntents: [], npcIntents: [], freeText: "I wait." }),
      store,
      storyId,
      "I wait and watch.",
      { rng: d20Sequence([15]), onStageMetric: (metric) => metrics.push(metric) }
    );
    await result.background;

    const plannerMetric = metrics.find((metric) => metric.stage === "npc_planner");
    expect(plannerMetric, "the npc_planner stage should be measured").toBeDefined();
    expect(plannerMetric!.durationMs).toBeGreaterThanOrEqual(0);
    expect(["ok", "timeout", "fallback", "error"]).toContain(plannerMetric!.outcome);
  });

  it("does not react when no living NPC was the target (narration-only turn)", async () => {
    await seedWightHp(12);
    const result = await submitTurn(
      new AgencyRouter({ playerIntents: [], npcIntents: [], freeText: "I study the room." }),
      store,
      storyId,
      "I look around the crypt.",
      { rng: d20Sequence([15]) }
    );
    await result.background;

    expect(result.rulings.some((ruling) => ruling.actorId === "wight")).toBe(false);
    expect((await store.characters.get("wight"))!.hard.resources.hp!.current).toBe(12);
  });

  // ── Task 5: goal-driven bounded NPC planning ────────────────────────────────────────────

  it("lets a present NPC exploit an opening on a non-combat player turn", async () => {
    await seedWightHp(12); // present, alive, and NOT attacked this turn → a planner candidate
    const router = new AgencyRouter({ playerIntents: [], npcIntents: [], freeText: "I search the shelves." });
    router.plannedActions = [
      {
        actorId: "wight",
        actionId: "attack_wild",
        targetId: "kestrel",
        reason: "The intruder turned their back to rummage — an opening.",
        confidence: 0.9,
      },
    ];
    const result = await submitTurn(
      router,
      store,
      storyId,
      "I rummage through the shelves.",
      { rng: d20Sequence([15]) }
    );
    await result.background;

    // No deterministic reaction fired (the player never attacked); the goal planner did.
    const action = result.rulings.find(
      (ruling) => ruling.actorId === "wight" && ruling.targetId === "kestrel"
    );
    expect(action, "the present wight should act on its goal this turn").toBeDefined();
    expect(action!.actionId).toBe("attack_wild");
    expect(action!.gate.allowed).toBe(true);
    expect(action!.roll).toBeDefined(); // engine dice, not prose
    expect((await store.characters.get("kestrel"))!.hard.resources.hp!.current).toBeLessThan(20);
    // The planner ran through the classifier role WITHOUT clobbering the player-classify prompt.
    expect(router.lastPlannerPrompt?.system).toContain("NPC action planner");
    expect(router.lastPlannerPrompt?.user).toContain('"skills":[{"skillId":"blade"');
    expect(router.lastPlannerPrompt?.user).toContain('"attributes"');
    expect(router.lastPlannerPrompt?.user).toContain('"inventory"');
  });

  it("lets an ally NPC aid the wounded player with a sealed support action", async () => {
    await store.characters.insert({
      id: "medic",
      storyId,
      name: "Field medic",
      isPlayer: false,
      present: true,
      hard: {
        characterId: "medic",
        isPlayer: false,
        attributes: {},
        resources: { hp: { current: 12, max: 12 } },
        skills: [],
        inventory: [{ itemId: "potion", qty: 1 }], // a consumable, so mend_ally's gate passes
        flags: {},
        alive: true,
      },
    });
    const wounded = makePlayer();
    wounded.resources.hp!.current = 8;
    await store.characters.updateHard("kestrel", wounded);

    const router = new AgencyRouter({ playerIntents: [], npcIntents: [], freeText: "I catch my breath." });
    router.plannedActions = [
      {
        actorId: "medic",
        actionId: "mend_ally",
        targetId: "kestrel",
        itemId: "potion",
        reason: "The medic tends the wounded companion.",
        confidence: 0.95,
      },
    ];
    const result = await submitTurn(router, store, storyId, "I steady myself.", {
      rng: d20Sequence([15]),
    });
    await result.background;

    const aid = result.rulings.find(
      (ruling) => ruling.actorId === "medic" && ruling.actionId === "mend_ally"
    );
    expect(aid, "the ally should aid the player this turn").toBeDefined();
    expect(aid!.gate.allowed).toBe(true);
    expect((await store.characters.get("kestrel"))!.hard.resources.hp!.current).toBeGreaterThan(8);
  });

  it("rejects goal proposals that violate the sealed catalog or scene", async () => {
    await seedWightHp(12);
    const router = new AgencyRouter({ playerIntents: [], npcIntents: [], freeText: "I hold still." });
    router.plannedActions = [
      { actorId: "wight", actionId: "cast_meteor", targetId: "kestrel", reason: "invented action", confidence: 1 },
      { actorId: "ghost", actionId: "attack_wild", targetId: "kestrel", reason: "actor not present", confidence: 1 },
      { actorId: "wight", actionId: "attack_wild", targetId: "phantom", reason: "target not present", confidence: 1 },
      { actorId: "wight", actionId: "master_strike", targetId: "kestrel", reason: "gate fails on rank", confidence: 1 },
    ];
    const result = await submitTurn(router, store, storyId, "I hold still.", {
      rng: d20Sequence([15]),
    });
    await result.background;

    // Every proposal is invalid (unknown action / absent actor / absent target / failed gate),
    // so nothing reaches the ledger.
    expect(result.rulings).toHaveLength(0);
    expect((await store.characters.get("kestrel"))!.hard.resources.hp!.current).toBe(20);
  });

  it("fails closed to no NPC action when the planner errors, without blocking narration", async () => {
    await seedWightHp(12);
    const router = new AgencyRouter({ playerIntents: [], npcIntents: [], freeText: "I wait." });
    router.plannerFailure = new Error("planner timeout");

    const result = await submitTurn(router, store, storyId, "I wait in the dark.", {
      rng: d20Sequence([15]),
    });
    await result.background;

    expect(result.rulings.some((ruling) => ruling.actorId === "wight")).toBe(false);
    expect((await store.characters.get("wight"))!.hard.resources.hp!.current).toBe(12);
    expect(result.prose.length).toBeGreaterThan(0); // narration is never blocked by the planner
  });

  it("lets a validated hostile NPC attack independently when the planner provider fails", async () => {
    await seedWightHp(12, true);
    const router = new AgencyRouter({ playerIntents: [], npcIntents: [], freeText: "I wait." });
    router.plannerFailure = new Error("provider unavailable");

    const result = await submitTurn(router, store, storyId, "I wait in the dark.", {
      rng: d20Sequence([15]),
    });
    await result.background;

    expect(result.rulings).toContainEqual(
      expect.objectContaining({
        actorId: "wight",
        actionId: "attack_wild",
        targetId: "kestrel",
        gate: { allowed: true },
        roll: expect.objectContaining({ natural: 15 }),
      })
    );
    expect((await store.characters.get("kestrel"))!.hard.resources.hp!.current).toBe(17);
  });

  it("does not let an empty planner response suppress a validated hostile NPC", async () => {
    await seedWightHp(12, true);
    const router = new AgencyRouter({ playerIntents: [], npcIntents: [], freeText: "I wait." });

    const result = await submitTurn(router, store, storyId, "I wait in the dark.", {
      rng: d20Sequence([15]),
    });
    await result.background;

    expect(result.rulings).toContainEqual(
      expect.objectContaining({ actorId: "wight", actionId: "attack_wild", targetId: "kestrel" })
    );
  });

  it("shares one NPC action budget between reaction and hostile fallback", async () => {
    await seedWightHp(12, true);
    const router = new AgencyRouter({
      playerIntents: [PLAYER_ATTACK],
      npcIntents: [],
      freeText: "",
    });
    router.plannerFailure = new Error("provider unavailable");

    const result = await submitTurn(router, store, storyId, "I strike the wight.", {
      rng: d20Sequence([15]),
    });
    await result.background;

    expect(result.rulings.filter((ruling) => ruling.actorId === "wight")).toHaveLength(1);
    expect((await store.characters.get("kestrel"))!.hard.resources.hp!.current).toBe(17);
  });

  it("does not let validated hostility bypass death, presence, or a dead player target", async () => {
    await seedWightHp(12, true);
    await store.characters.setPresent("wight", false);
    const player = makePlayer();
    player.alive = false;
    player.resources.hp!.current = 0;
    await store.characters.updateHard("kestrel", player);
    const router = new AgencyRouter({ playerIntents: [], npcIntents: [], freeText: "I wait." });
    router.plannerFailure = new Error("provider unavailable");

    const result = await submitTurn(router, store, storyId, "I wait.", {
      rng: d20Sequence([15]),
    });
    await result.background;

    expect(result.rulings.some((ruling) => ruling.actorId === "wight")).toBe(false);
  });

  // ── Task 6: deterministic provocation beyond combat ─────────────────────────────────────

  const INTIMIDATE: ActionDef = {
    id: "intimidate",
    category: "social",
    label: "Intimidate",
    dc: 12,
    effects: {
      crit_success: { resourceDeltaTarget: { hp: -3 }, narrationHint: "it recoils in fear" },
      success: { resourceDeltaTarget: { hp: -1 }, narrationHint: "it flinches" },
      failure: { narrationHint: "it holds firm" },
      crit_failure: { narrationHint: "it scoffs at you" },
    },
  };
  const MENACE: ActionDef = {
    id: "menace",
    category: "social",
    label: "Menace",
    dc: 10,
    opposed: true, // a contest of wills — a sealed hostile signal even with no damage
    effects: {
      crit_success: { setFlag: { flagId: "cowed", value: true }, narrationHint: "it cowers" },
      success: { narrationHint: "it wavers" },
      failure: { narrationHint: "it resists" },
      crit_failure: { narrationHint: "it laughs you off" },
    },
  };
  const GREET: ActionDef = {
    id: "greet",
    category: "social",
    label: "Greet",
    dc: 5,
    effects: {
      crit_success: { setFlag: { flagId: "rapport", value: true }, narrationHint: "a warm greeting" },
      success: { narrationHint: "a polite nod" },
      failure: { narrationHint: "it ignores you" },
      crit_failure: { narrationHint: "an awkward silence" },
    },
  };

  async function addActions(...actions: ActionDef[]): Promise<void> {
    const current = (await store.stories.get(storyId))!;
    await store.stories.update({
      ...current,
      schema: { ...current.schema, actions: [...current.schema.actions, ...actions] },
    });
  }

  it("reacts to a sealed non-combat provocation that can harm the target", async () => {
    await addActions(INTIMIDATE);
    await seedWightHp(12);
    const result = await submitTurn(
      new AgencyRouter({
        playerIntents: [
          { actorId: "kestrel", actionId: "intimidate", targetId: "wight", stakes: "danger", confidence: 1 },
        ],
        npcIntents: [],
        freeText: "",
      }),
      store,
      storyId,
      "I loom over the wight and snarl a threat.",
      { rng: d20Sequence([15]) }
    );
    await result.background;

    // Intimidation is 'social', not 'combat', but its sealed outcome table can harm the target,
    // so the engine treats it as hostile and the wight answers this same turn.
    const reaction = result.rulings.find(
      (ruling) => ruling.actorId === "wight" && ruling.targetId === "kestrel"
    );
    expect(reaction, "a threatened NPC should answer a non-combat provocation").toBeDefined();
    expect(reaction!.gate.allowed).toBe(true);
  });

  it("reacts to an opposed contest even when it deals no direct damage", async () => {
    await addActions(MENACE);
    // A properly-attributed wight so the opposed contest can roll a defense.
    await store.characters.insert({
      id: "wight",
      storyId,
      name: "Grave-wight",
      isPlayer: false,
      present: true,
      hard: {
        characterId: "wight",
        isPlayer: false,
        attributes: { str: 12, dex: 10 },
        resources: { hp: { current: 12, max: 12 } },
        skills: [{ skillId: "blade", rank: "adept", successCount: 0 }],
        inventory: [{ itemId: "sword", qty: 1 }],
        flags: {},
        alive: true,
      },
    });
    const result = await submitTurn(
      new AgencyRouter({
        playerIntents: [
          { actorId: "kestrel", actionId: "menace", targetId: "wight", stakes: "opposed", confidence: 1 },
        ],
        npcIntents: [],
        freeText: "",
      }),
      store,
      storyId,
      "I stare the wight down and dare it to move.",
      { rng: d20Sequence([15]) }
    );
    await result.background;

    expect(
      result.rulings.some((ruling) => ruling.actorId === "wight" && ruling.targetId === "kestrel"),
      "an opposed contest is a sealed provocation"
    ).toBe(true);
  });

  it("does not react to harmless, non-hostile dialogue", async () => {
    await addActions(GREET);
    await seedWightHp(12);
    const result = await submitTurn(
      new AgencyRouter({
        playerIntents: [
          { actorId: "kestrel", actionId: "greet", targetId: "wight", stakes: "none", confidence: 1 },
        ],
        npcIntents: [],
        freeText: "",
      }),
      store,
      storyId,
      "I offer the wight a civil greeting.",
      { rng: d20Sequence([15]) }
    );
    await result.background;

    // A permitted, non-opposed, harmless social action is NOT a provocation.
    expect(result.rulings.some((ruling) => ruling.actorId === "wight")).toBe(false);
  });

  it("does not treat aid or healing as provocation", async () => {
    // Wounded (6) but with headroom (max 12) so a heal is observable.
    await store.characters.insert({
      id: "wight",
      storyId,
      name: "Grave-wight",
      isPlayer: false,
      present: true,
      hard: {
        characterId: "wight",
        isPlayer: false,
        templateId: "wight",
        attributes: {},
        resources: { hp: { current: 6, max: 12 } },
        skills: [{ skillId: "blade", rank: "adept", successCount: 0 }],
        inventory: [{ itemId: "sword", qty: 1 }],
        flags: {},
        alive: true,
      },
    });
    const healer = makePlayer({
      inventory: [
        { itemId: "sword", qty: 1 },
        { itemId: "potion", qty: 1 },
      ],
    });
    await store.characters.updateHard("kestrel", healer);
    const result = await submitTurn(
      new AgencyRouter({
        playerIntents: [
          { actorId: "kestrel", actionId: "mend_ally", targetId: "wight", itemId: "potion", stakes: "none", confidence: 1 },
        ],
        npcIntents: [],
        freeText: "",
      }),
      store,
      storyId,
      "I press a healing draught to the wounded creature.",
      { rng: d20Sequence([15]) }
    );
    await result.background;

    // Healing raises the target's resource — a positive delta is never a provocation.
    expect(result.rulings.some((ruling) => ruling.actorId === "wight")).toBe(false);
    expect((await store.characters.get("wight"))!.hard.resources.hp!.current).toBeGreaterThan(6);
  });
});
