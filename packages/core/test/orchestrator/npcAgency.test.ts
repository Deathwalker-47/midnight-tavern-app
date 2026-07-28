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
  ChatResponse,
  ClassifiedTurn,
  Role,
  RoleBinding,
  RolePrompt,
  Router,
  StreamHandler,
} from "../../src/index.js";
import { openStore, type Store } from "../../src/store/index.js";
import { makePlayer, makeStory } from "../fixtures.js";
import type { NpcIntroductionProposal } from "../../src/orchestrator/npcIntroduction.js";

/** Minimal V7 router: canned classifier + loot decline + a fixed narrator stream. */
class AgencyRouter implements Router {
  lastClassifierPrompt?: RolePrompt;
  lastNarratorPrompt?: RolePrompt;

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

describe("same-turn NPC agency", () => {
  let store: Store;
  const storyId = "fixture-story";

  async function seedWightHp(hp: number): Promise<void> {
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
        flags: {},
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

  it("does not persist a proposed NPC when narration fails before the turn commits", async () => {
    const maraId = `${storyId}:scene:mara`;
    await expect(
      submitTurn(
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
      )
    ).rejects.toThrow("Narrator unavailable");
    expect(await store.characters.get(maraId)).toBeUndefined();
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
});
