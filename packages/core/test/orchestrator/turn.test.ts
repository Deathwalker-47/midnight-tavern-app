/**
 * Orchestrator integration test (low-level-plan §10: "integration test with a mock router
 * (canned model outputs) proving the pipeline order, the transaction semantics, and
 * prose-never-writes-ledger").
 *
 * A `ScriptedRouter` returns canned role outputs with zero network: the classifier yields a
 * chosen intent, the narrator yields fixed prose (deliberately claiming false mechanical
 * outcomes, to prove the authority guard rejects it), and analyzer/summarizer are stubbed.
 * We drive real `submitTurn` against a real in-memory store + frozen fixture schema and
 * assert the committed state matches the ENGINE's rulings, not the prose.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { openStore, type Store } from "../../src/store/index.js";
import { deleteLastTurn, submitTurn } from "../../src/orchestrator/index.js";
import { d20Sequence } from "../../src/engine/dice.js";
import type {
  Router,
  RolePrompt,
  Role,
  RoleBinding,
  ChatResponse,
  StreamHandler,
} from "../../src/router/index.js";
import type { ClassifiedTurn, SoftStatePatch } from "../../src/index.js";
import { makeStory, makePlayer } from "../fixtures.js";

/** Canned outputs per role; the narrator string is returned verbatim as prose. */
interface Script {
  classified: ClassifiedTurn;
  narratorProse: string;
  analyzer?: SoftStatePatch;
  classifierError?: Error;
}

/** A Router that replays a script and records the order roles were called in. */
class ScriptedRouter implements Router {
  readonly calls: Role[] = [];
  lastAnalyzerPrompt?: RolePrompt;
  constructor(private script: Script) {}

  bindingFor(_role: Role): RoleBinding {
    return { provider: "openrouter", model: "test", source: "recommended", samplersDirty: false };
  }

  async complete(role: Role, prompt: RolePrompt): Promise<ChatResponse> {
    this.calls.push(role);
    switch (role) {
      case "classifier":
        if (prompt.system.includes("strict consistency auditor")) {
          return {
            content: JSON.stringify({
              obeysRulings: false,
              contradictions: [
                {
                  rulingIndex: 0,
                  reason: "The draft reverses the successful strike and invents loot.",
                },
              ],
            }),
          };
        }
        if (prompt.system.includes("DM loot adjudicator")) {
          return { content: JSON.stringify({ award: false, reason: "No completed encounter." }) };
        }
        if (this.script.classifierError) throw this.script.classifierError;
        return { content: JSON.stringify(this.script.classified) };
      case "analyzer":
        this.lastAnalyzerPrompt = prompt;
        return {
          content: JSON.stringify(this.script.analyzer ?? { characterOps: [], worldOps: [] }),
        };
      default:
        return { content: "" };
    }
  }

  async stream(role: Role, _prompt: RolePrompt, onDelta: StreamHandler): Promise<ChatResponse> {
    this.calls.push(role);
    onDelta(this.script.narratorProse);
    return { content: this.script.narratorProse };
  }
}

function controllableStageSchedule() {
  const pending = new Map<number, () => void>();
  return {
    schedule: (ms: number, fire: () => void) => {
      pending.set(ms, fire);
      return () => {
        if (pending.get(ms) === fire) pending.delete(ms);
      };
    },
    has: (ms: number) => pending.has(ms),
    trigger: (ms: number) => {
      const fire = pending.get(ms);
      if (!fire) throw new Error(`No stage deadline is pending at ${ms}ms.`);
      fire();
    },
  };
}

/** Seed a store with the fixture story + player + a present enemy, and return it. */
async function seedStore(): Promise<{ store: Store; storyId: string }> {
  const store = await openStore(":memory:");
  const schema = makeStory();
  const storyId = schema.storyId;
  await store.stories.insert({ id: storyId, title: schema.title, createdAt: 0, schema, locked: true });
  const player = makePlayer();
  await store.characters.insert({
    id: player.characterId,
    storyId,
    name: "Kestrel",
    isPlayer: true,
    hard: player,
  });
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
      resources: { hp: { current: 12, max: 12 } },
      skills: [{ skillId: "blade", rank: "adept", successCount: 0 }],
      inventory: [{ itemId: "sword", qty: 1 }],
      flags: {},
      alive: true,
    },
  });
  return { store, storyId };
}

describe("submitTurn — pipeline order & transaction", () => {
  let store: Store;
  let storyId: string;
  beforeEach(async () => {
    ({ store, storyId } = await seedStore());
  });

  it("persists both messages, resolves a ruling, and commits the ENGINE's effect (not the prose)", async () => {
    const router = new ScriptedRouter({
      classified: {
        playerIntents: [
          {
            actorId: "kestrel",
            actionId: "attack_melee",
            targetId: "wight",
            itemId: "sword",
            confidence: 1,
          },
        ],
        npcIntents: [],
        freeText: "",
      },
      // Prose lies: claims the wight is unharmed and the player found a magic ring.
      narratorProse: "The blade whiffs harmlessly; the wight is untouched. You pocket a magic ring.",
    });

    // d20=15, +1 blade = 16 ≥ DC 12 ⇒ success ⇒ -4 base * sword damage(6) = -10 hp.
    const liveEvents: string[] = [];
    const result = await submitTurn(router, store, storyId, "I strike the wight", {
      rng: d20Sequence([15]),
      onRulings: (rulings) => liveEvents.push(`rulings:${rulings.length}`),
      onDelta: () => liveEvents.push("prose"),
    });
    await result.background;

    // Two messages persisted, in order.
    const msgs = await store.messages.listByStory(storyId);
    expect(msgs.map((m) => m.role)).toEqual(["player", "narrator"]);
    expect(msgs[1]!.content).not.toContain("magic ring");
    expect(msgs[1]!.content).toContain("A solid blow lands.");
    expect(msgs[1]!.content).not.toContain("kestrel:");
    expect(result.usedNarratorFallback).toBe(true);

    // The engine's ruling — not the prose — decided the outcome.
    expect(result.rulings).toHaveLength(2);
    expect(result.rulings[0]!.roll?.outcome).toBe("success");
    // The struck-but-surviving wight answers this same turn with its own engine ruling.
    expect(result.rulings[1]).toMatchObject({
      actorId: "wight",
      targetId: "kestrel",
      gate: { allowed: true },
    });

    // Ledger reflects the ENGINE (wight took 10 dmg → 2 hp), NOT the prose ("untouched").
    const wight = (await store.characters.get("wight"))!;
    expect(wight.hard.resources.hp!.current).toBe(2);

    // The "magic ring" the prose invented never entered the player's inventory.
    const player = (await store.characters.get("kestrel"))!;
    expect(player.hard.inventory.find((i) => i.itemId === "ring")).toBeUndefined();

    // A ruling row was persisted, linked to the narrator message.
    const rulingRow = await store.rulings.getByMessage(msgs[1]!.id);
    expect(rulingRow).toBeDefined();
    expect(rulingRow!.ruling.actionId).toBe("attack_melee");

    // Pipeline order: classifier before narrator (rulings computed before prose).
    expect(router.calls.indexOf("classifier")).toBeLessThan(router.calls.indexOf("narrator"));
    expect(liveEvents[0]).toBe("rulings:2");
    expect(liveEvents[1]).toBe("prose");
    const operation = await store.turnOperations.getByPlayerMessage(msgs[0]!.id);
    expect(operation?.stageMetrics?.map(({ stage, outcome }) => ({ stage, outcome }))).toEqual(
      expect.arrayContaining([
        { stage: "npc_introduction", outcome: "ok" },
        { stage: "classifier", outcome: "ok" },
        { stage: "npc_planner", outcome: "ok" },
        { stage: "narrator", outcome: "ok" },
        { stage: "authority_audit", outcome: "ok" },
      ])
    );
  });

  it("treats a narration-only turn (no intents) as prose with no rulings and no state change", async () => {
    const router = new ScriptedRouter({
      classified: { playerIntents: [], npcIntents: [], freeText: "I look around." },
      narratorProse: "The tavern is quiet. Embers glow in the hearth.",
    });

    const before = (await store.characters.get("wight"))!.hard.resources.hp!.current;
    const result = await submitTurn(router, store, storyId, "I look around", {
      rng: d20Sequence([20]),
    });
    await result.background;

    expect(result.rulings).toHaveLength(0);
    expect((await store.messages.listByStory(storyId)).map((m) => m.role)).toEqual(["player", "narrator"]);
    // No ruling ⇒ no state change.
    expect((await store.characters.get("wight"))!.hard.resources.hp!.current).toBe(before);
  });

  it("repairs legacy hard-only present characters before analyzer memory runs", async () => {
    await store.characters.clearSoft("kestrel");
    await store.characters.clearSoft("wight");
    const router = new ScriptedRouter({
      classified: { playerIntents: [], npcIntents: [], freeText: "I study the chamber." },
      narratorProse: "Kestrel studies the chamber while the Grave-wight watches.",
      analyzer: {
        characterOps: [
          {
            characterId: "kestrel",
            ops: [
              { op: "set", path: "mood", value: "alert" },
              { op: "set", path: "location", value: "the chamber" },
              { op: "set", path: "goal", value: "understand the chamber" },
            ],
          },
        ],
        worldOps: [],
      },
    });

    const result = await submitTurn(router, store, storyId, "I study the chamber.");
    await result.background;

    expect(router.lastAnalyzerPrompt?.user).toContain("Kestrel (kestrel)");
    expect(router.lastAnalyzerPrompt?.user).toContain("Grave-wight (wight)");
    expect((await store.characters.get("kestrel"))?.soft?.current).toEqual({
      mood: "alert",
      location: "the chamber",
      goal: "understand the chamber",
    });
    expect((await store.characters.get("wight"))?.soft).toMatchObject({
      characterId: "wight",
      tier: "secondary",
    });
  });

  it("recovers attack-it-again against the newest committed living target with an older NPC present", async () => {
    await store.characters.insert({
      id: "old-foe",
      storyId,
      name: "Old foe",
      isPlayer: false,
      hard: {
        ...(await store.characters.get("wight"))!.hard,
        characterId: "old-foe",
      },
    });
    await store.messages.insert({
      id: "prior-player",
      storyId,
      idx: 0,
      role: "player",
      content: "I attack the Grave-wight.",
      createdAt: 1,
    });
    await store.messages.insert({
      id: "prior-narrator",
      storyId,
      idx: 1,
      role: "narrator",
      content: "Your blade catches the Grave-wight.",
      createdAt: 2,
    });
    await store.events.insert({
      id: "prior-attack-event",
      storyId,
      messageId: "prior-narrator",
      turnIndex: 1,
      actorId: "kestrel",
      kind: "roll",
      payload: {
        ruling: {
          actorId: "kestrel",
          targetId: "wight",
          actionId: "attack_melee",
          gate: { allowed: true },
          roll: { outcome: "success" },
        },
      },
      rulebookVersion: 1,
      createdAt: 2,
    });
    const router = new ScriptedRouter({
      classified: { playerIntents: [], npcIntents: [], freeText: "" },
      narratorProse: "You press the attack against the Grave-wight.",
      classifierError: new Error("provider unavailable"),
    });

    const result = await submitTurn(router, store, storyId, "I attack it again.", {
      rng: d20Sequence([15, 10]),
    });
    await result.background;

    expect(result.classifierRecovered).toBe(true);
    expect(result.rulings[0]).toMatchObject({
      actorId: "kestrel",
      actionId: "attack_melee",
      targetId: "wight",
      gate: { allowed: true },
    });
  });

  it("recovers attack-it-again against recent focus when the classifier stage times out", async () => {
    await store.characters.insert({
      id: "old-foe",
      storyId,
      name: "Old foe",
      isPlayer: false,
      hard: {
        ...(await store.characters.get("wight"))!.hard,
        characterId: "old-foe",
      },
    });
    await store.messages.insert({
      id: "prior-player",
      storyId,
      idx: 0,
      role: "player",
      content: "I attack the Grave-wight.",
      createdAt: 1,
    });
    await store.messages.insert({
      id: "prior-narrator",
      storyId,
      idx: 1,
      role: "narrator",
      content: "Your blade catches the Grave-wight.",
      createdAt: 2,
    });
    await store.events.insert({
      id: "prior-attack-event",
      storyId,
      messageId: "prior-narrator",
      turnIndex: 1,
      actorId: "kestrel",
      kind: "roll",
      payload: {
        ruling: {
          actorId: "kestrel",
          targetId: "wight",
          actionId: "attack_melee",
          gate: { allowed: true },
          roll: { outcome: "success" },
        },
      },
      rulebookVersion: 1,
      createdAt: 2,
    });
    const clock = controllableStageSchedule();
    let classifierAborted = false;
    const router: Router = {
      bindingFor: () => ({
        provider: "openrouter",
        model: "test",
        source: "recommended",
        samplersDirty: false,
      }),
      async complete(_role, prompt, opts) {
        if (prompt.system.includes("NPC presence registrar")) {
          return { content: JSON.stringify({ transitions: [] }) };
        }
        if (prompt.system.includes("mechanical intent classifier")) {
          return new Promise<never>((_resolve, reject) => {
            opts?.signal?.addEventListener("abort", () => {
              classifierAborted = true;
              reject(opts.signal?.reason);
            });
          });
        }
        if (prompt.system.includes("NPC action planner")) {
          return { content: JSON.stringify({ actions: [] }) };
        }
        if (prompt.system.includes("strict consistency auditor")) {
          return { content: JSON.stringify({ obeysRulings: true, contradictions: [] }) };
        }
        if (prompt.system.includes("DM loot adjudicator")) {
          return { content: JSON.stringify({ award: false, reason: "No completed encounter." }) };
        }
        return { content: "{}" };
      },
      async stream(_role, _prompt, onDelta) {
        const content = "You press the attack against the Grave-wight.";
        onDelta(content);
        return { content };
      },
    };

    const pending = submitTurn(router, store, storyId, "I attack it again.", {
      rng: d20Sequence([15, 10]),
      stagePolicy: {
        deadlines: {
          npc_introduction: 301,
          classifier: 302,
          npc_planner: 303,
          narrator: 304,
          authority_audit: 305,
        },
        schedule: clock.schedule,
      },
    });
    for (let index = 0; index < 10 && !clock.has(302); index++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(clock.has(302)).toBe(true);
    clock.trigger(302);

    const result = await pending;
    await result.background;
    expect(classifierAborted).toBe(true);
    expect(result.classifierRecovered).toBe(true);
    expect(result.classifierRecovery?.policy).toBe("partial_mechanics");
    expect(result.rulings[0]).toMatchObject({
      actorId: "kestrel",
      actionId: "attack_melee",
      targetId: "wight",
      gate: { allowed: true },
    });
  });

  it("calls only the narrator and writes no mechanics in No Stats mode", async () => {
    const current = (await store.stories.get(storyId))!;
    await store.stories.update({
      ...current,
      schema: {
        ...current.schema,
        statMode: "none",
        attributes: [],
        resources: [],
        skills: [],
        actions: [],
        items: [],
        npcTemplates: [],
        startingState: { attributes: {}, resources: {}, skills: [], inventory: [] },
      },
    });
    const router = new ScriptedRouter({
      classified: {
        playerIntents: [{ actorId: "kestrel", actionId: "attack_melee", confidence: 1 }],
        npcIntents: [],
        freeText: "",
      },
      narratorProse: "The argument dissolves into laughter.",
    });

    const result = await submitTurn(router, store, storyId, "I tell a terrible joke.");
    await result.background;

    expect(router.calls).toEqual(["narrator"]);
    expect(result.rulings).toEqual([]);
    expect(await store.rulings.listByStory(storyId)).toEqual([]);
    expect((await store.characters.get("wight"))!.hard.resources.hp!.current).toBe(12);
  });

  it("promotes an NPC introduced organically by the current narration before committing the turn", async () => {
    await store.characters.setPresent("wight", false);
    const narratorProse =
      "Marta Hearthwright steps from the roadside inn and raises a cautious hand. \"I can help,\" she says.";
    let registrarCalls = 0;
    const router: Router = {
      bindingFor: () => ({
        provider: "openrouter",
        model: "test",
        source: "recommended",
        samplersDirty: false,
      }),
      async complete(_role, prompt) {
        if (prompt.system.includes("NPC presence registrar")) {
          registrarCalls += 1;
          return registrarCalls === 1
            ? { content: JSON.stringify({ transitions: [] }) }
            : {
                content: JSON.stringify({
                  transitions: [
                    {
                      operation: "introduce",
                      name: "Marta Hearthwright",
                      grounding: "Marta Hearthwright steps from the roadside inn",
                    },
                  ],
                }),
              };
        }
        if (prompt.system.includes("mechanical intent classifier")) {
          return {
            content: JSON.stringify({
              playerIntents: [],
              npcIntents: [],
              freeText: "I call for help.",
            }),
          };
        }
        if (prompt.system.includes("strict consistency auditor")) {
          return { content: JSON.stringify({ obeysRulings: true, contradictions: [] }) };
        }
        if (prompt.system.includes("DM loot adjudicator")) {
          return { content: JSON.stringify({ award: false, reason: "No encounter." }) };
        }
        return { content: "{}" };
      },
      async stream(_role, _prompt, onDelta) {
        onDelta(narratorProse);
        return { content: narratorProse };
      },
    };

    const result = await submitTurn(router, store, storyId, "Is anyone there? I need help!");
    await result.background;

    expect(result.rulings).toEqual([]);
    expect(result.prose).toContain("Marta Hearthwright");
    expect(registrarCalls).toBe(1);
    expect(await store.characters.listByStory(storyId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Marta Hearthwright",
          isPlayer: false,
          present: true,
          hard: expect.objectContaining({
            alive: true,
            skills: expect.arrayContaining([
              expect.objectContaining({ skillId: "silver_tongue", rank: "novice" }),
            ]),
          }),
        }),
      ])
    );
  });

  it("enriches a generic narrated actor with a revealed name without duplicating the NPC", async () => {
    await store.characters.setPresent("wight", false);
    const genericId = `${storyId}:scene:man`;
    const genericHard = structuredClone((await store.characters.get("wight"))!.hard);
    genericHard.characterId = genericId;
    await store.characters.insert({
      id: genericId,
      storyId,
      name: "Man",
      isPlayer: false,
      hard: genericHard,
    });
    const narratorProse =
      'Bram repeated your name. "I am Bram Kelder. This is Bess," he said.';
    const router: Router = {
      bindingFor: () => ({
        provider: "openrouter",
        model: "test",
        source: "recommended",
        samplersDirty: false,
      }),
      async complete(_role, prompt) {
        if (prompt.system.includes("NPC presence registrar")) {
          return { content: JSON.stringify({ transitions: [] }) };
        }
        if (prompt.system.includes("mechanical intent classifier")) {
          return { content: JSON.stringify({ playerIntents: [], npcIntents: [], freeText: "" }) };
        }
        if (prompt.system.includes("strict consistency auditor")) {
          return { content: JSON.stringify({ obeysRulings: true, contradictions: [] }) };
        }
        if (prompt.system.includes("DM loot adjudicator")) {
          return { content: JSON.stringify({ award: false, reason: "No encounter." }) };
        }
        return { content: "{}" };
      },
      async stream(_role, _prompt, onDelta) {
        onDelta(narratorProse);
        return { content: narratorProse };
      },
    };

    const result = await submitTurn(router, store, storyId, "What is your name?");
    await result.background;

    const roster = await store.characters.listByStory(storyId);
    expect(roster.filter((character) => character.id === genericId)).toHaveLength(1);
    expect((await store.characters.get(genericId))?.name).toBe("Bram Kelder");
    expect(roster).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Bess" })]));

    await deleteLastTurn(store, storyId);
    expect((await store.characters.get(genericId))?.name).toBe("Man");
    expect((await store.characters.listByStory(storyId)).find((character) => character.name === "Bess"))
      .toEqual(expect.objectContaining({ present: false }));
  });

  it("repairs narrator-established identities from an older prose-only transcript on the next turn", async () => {
    await store.characters.setPresent("wight", false);
    await store.messages.insert({
      id: "legacy-man-introduction",
      storyId,
      idx: 0,
      role: "narrator",
      content: "The man called from the farmhouse. Bess made a low sound beside him.",
      createdAt: 1,
    });
    await store.messages.insert({
      id: "legacy-name-reveal",
      storyId,
      idx: 1,
      role: "narrator",
      content: 'Bram repeated your name. "I am Bram Kelder. This is Bess," he said.',
      createdAt: 2,
    });
    const router: Router = {
      bindingFor: () => ({
        provider: "openrouter",
        model: "test",
        source: "recommended",
        samplersDirty: false,
      }),
      async complete(_role, prompt) {
        if (prompt.system.includes("NPC presence registrar")) {
          return { content: JSON.stringify({ transitions: [] }) };
        }
        if (prompt.system.includes("mechanical intent classifier")) {
          return { content: JSON.stringify({ playerIntents: [], npcIntents: [], freeText: "" }) };
        }
        if (prompt.system.includes("strict consistency auditor")) {
          return { content: JSON.stringify({ obeysRulings: true, contradictions: [] }) };
        }
        if (prompt.system.includes("DM loot adjudicator")) {
          return { content: JSON.stringify({ award: false, reason: "No encounter." }) };
        }
        return { content: "{}" };
      },
      async stream(_role, _prompt, onDelta) {
        const prose = "Bram and Bess wait beside the road while you consider your next move.";
        onDelta(prose);
        return { content: prose };
      },
    };

    const result = await submitTurn(router, store, storyId, "I thank them and look west.");
    await result.background;

    const roster = await store.characters.listByStory(storyId);
    expect(roster).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Bram Kelder", present: true }),
      expect.objectContaining({ name: "Bess", present: true }),
    ]));
    expect(roster.some((character) => character.name === "Man")).toBe(false);
  });

  it("reconciles Cyraeth villager aliases across registrar proposals and same-turn name reveals", async () => {
    await store.characters.setPresent("wight", false);
    const daenId = `${storyId}:scene:daen`;
    const firstId = `${storyId}:scene:first-man`;
    const youngerId = `${storyId}:scene:younger-man`;
    const olderId = `${storyId}:scene:older-woman`;
    const womanId = `${storyId}:scene:woman`;
    const baseHard = structuredClone((await store.characters.get("wight"))!.hard);
    for (const [id, name, present] of [
      [daenId, "Daen", true],
      [firstId, "First man", false],
      [youngerId, "Younger man", false],
      [olderId, "Older woman", false],
      [womanId, "Woman", false],
    ] as const) {
      await store.characters.insert({
        id,
        storyId,
        name,
        isPlayer: false,
        present,
        hard: { ...structuredClone(baseHard), characterId: id },
      });
    }
    await store.messages.insert({
      id: "cyraeth-village-arrival",
      storyId,
      idx: 0,
      role: "narrator",
      content: [
        "The first man raised his lantern. Daen \u2014 apparently the first man's name \u2014 lowered his weapon.",
        "The younger man stepped onto his threshold. The older woman appeared beside him. The woman said nothing.",
      ].join(" "),
      createdAt: 1,
    });
    const narratorProse = [
      "The younger man \u2014 Daenin, apparently some relation \u2014 shook his head.",
      'The older woman drew closer. "He does not smell like blood," the woman said.',
      '"That does not mean he is safe, Mera." Daenin still had not lowered his bow.',
    ].join(" ");
    const router: Router = {
      bindingFor: () => ({
        provider: "openrouter",
        model: "test",
        source: "recommended",
        samplersDirty: false,
      }),
      async complete(_role, prompt) {
        if (prompt.system.includes("NPC presence registrar")) {
          return {
            content: JSON.stringify({
              transitions: [
                { operation: "enter", characterId: firstId, name: "First man", grounding: "The first man raised his lantern" },
                { operation: "enter", characterId: youngerId, name: "Younger man", grounding: "The younger man stepped onto his threshold" },
                { operation: "enter", characterId: olderId, name: "Older woman", grounding: "The older woman appeared beside him" },
                { operation: "enter", characterId: womanId, name: "Woman", grounding: "The woman said nothing" },
              ],
            }),
          };
        }
        if (prompt.system.includes("mechanical intent classifier")) {
          return { content: JSON.stringify({ playerIntents: [], npcIntents: [], freeText: "" }) };
        }
        if (prompt.system.includes("NPC action planner")) {
          return { content: JSON.stringify({ actions: [] }) };
        }
        if (prompt.system.includes("strict consistency auditor")) {
          return { content: JSON.stringify({ obeysRulings: true, contradictions: [] }) };
        }
        if (prompt.system.includes("DM loot adjudicator")) {
          return { content: JSON.stringify({ award: false, reason: "No encounter." }) };
        }
        return { content: "{}" };
      },
      async stream(_role, _prompt, onDelta) {
        onDelta(narratorProse);
        return { content: narratorProse };
      },
    };

    const result = await submitTurn(router, store, storyId, "I show them my empty hands.");
    await result.background;

    expect(await store.characters.get(daenId)).toEqual(
      expect.objectContaining({ name: "Daen", present: true })
    );
    expect(await store.characters.get(firstId)).toEqual(
      expect.objectContaining({ name: "First man", present: false })
    );
    expect(await store.characters.get(youngerId)).toEqual(
      expect.objectContaining({ name: "Daenin", present: true })
    );
    expect(await store.characters.get(olderId)).toEqual(
      expect.objectContaining({ name: "Mera", present: true })
    );
    expect(await store.characters.get(womanId)).toEqual(
      expect.objectContaining({ name: "Woman", present: false })
    );
  });

  it("backfills an older departed creature into the registry without returning it to the scene", async () => {
    await store.characters.setPresent("wight", false);
    for (const [index, content] of [
      "The creature lifted its head and loped off into the undergrowth.",
      "The road climbed west through the quiet hills.",
      "Moonlight silvered the empty pasture.",
    ].entries()) {
      await store.messages.insert({
        id: `legacy-scene-${index}`,
        storyId,
        idx: index,
        role: "narrator",
        content,
        createdAt: index,
      });
    }
    const router = new ScriptedRouter({
      classified: { playerIntents: [], npcIntents: [], freeText: "I keep walking." },
      narratorProse: "The quiet road continues toward the sleeping village.",
    });

    const result = await submitTurn(router, store, storyId, "I keep walking.");
    await result.background;

    expect(await store.characters.get(`${storyId}:scene:creature`)).toEqual(
      expect.objectContaining({ name: "Creature", present: false })
    );
  });

  it("times out a hung classifier, persists the metric, and completes one narration-only exchange", async () => {
    await store.characters.setPresent("wight", false);
    const clock = controllableStageSchedule();
    let classifierAborted = false;
    const router: Router = {
      bindingFor: () => ({
        provider: "openrouter",
        model: "test",
        source: "recommended",
        samplersDirty: false,
      }),
      async complete(_role, prompt, opts) {
        if (prompt.system.includes("NPC presence registrar")) {
          return { content: JSON.stringify({ transitions: [] }) };
        }
        if (prompt.system.includes("strict consistency auditor")) {
          return {
            content: JSON.stringify({ obeysRulings: true, contradictions: [] }),
          };
        }
        return new Promise<ChatResponse>((_resolve, reject) => {
          opts?.signal?.addEventListener("abort", () => {
            classifierAborted = true;
            reject(opts.signal?.reason);
          });
        });
      },
      async stream(_role, _prompt, onDelta) {
        const content = "The empty crypt waits, silent and watchful.";
        onDelta(content);
        return { content };
      },
    };

    const pending = submitTurn(router, store, storyId, "I listen to the silence.", {
      stagePolicy: {
        deadlines: {
          npc_introduction: 101,
          classifier: 102,
          npc_planner: 103,
          narrator: 104,
          authority_audit: 105,
        },
        schedule: clock.schedule,
      },
    });
    for (let index = 0; index < 10 && !clock.has(102); index++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(clock.has(102)).toBe(true);
    clock.trigger(102);

    const result = await pending;
    expect(classifierAborted).toBe(true);
    expect(result.classifierRecovered).toBe(true);
    expect(result.classifierRecovery?.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "timeout" })])
    );
    expect(result.rulings).toEqual([]);
    expect(result.prose).toContain("empty crypt");
    const messages = await store.messages.listByStory(storyId);
    expect(messages.map((message) => message.role)).toEqual(["player", "narrator"]);
    const operation = await store.turnOperations.getByPlayerMessage(messages[0]!.id);
    expect(operation?.stageMetrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: "classifier", outcome: "timeout" }),
        expect.objectContaining({ stage: "narrator", outcome: "ok" }),
        expect.objectContaining({ stage: "authority_audit", outcome: "ok" }),
      ])
    );
  });

  it("times out NPC introduction to no transitions without blocking classification or narration", async () => {
    await store.characters.setPresent("wight", false);
    const clock = controllableStageSchedule();
    let introductionAborted = false;
    const router: Router = {
      bindingFor: () => ({
        provider: "openrouter",
        model: "test",
        source: "recommended",
        samplersDirty: false,
      }),
      async complete(_role, prompt, opts) {
        if (prompt.system.includes("NPC presence registrar")) {
          return new Promise<never>((_resolve, reject) => {
            opts?.signal?.addEventListener("abort", () => {
              introductionAborted = true;
              reject(opts.signal?.reason);
            });
          });
        }
        return {
          content: JSON.stringify({
            playerIntents: [],
            npcIntents: [],
            freeText: "I remember home.",
          }),
        };
      },
      async stream(_role, _prompt, onDelta) {
        const content = "Dust drifts through the empty passage.";
        onDelta(content);
        return { content };
      },
    };

    const pending = submitTurn(router, store, storyId, "I remember home.", {
      stagePolicy: {
        deadlines: {
          npc_introduction: 201,
          classifier: 202,
          npc_planner: 203,
          narrator: 204,
          authority_audit: 205,
        },
        schedule: clock.schedule,
      },
    });
    for (let index = 0; index < 10 && !clock.has(201); index++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    clock.trigger(201);
    const result = await pending;

    expect(introductionAborted).toBe(true);
    expect(result.classifierRecovered).toBe(false);
    expect(result.prose).toContain("Dust drifts");
    expect(await store.characters.listByStory(storyId)).toHaveLength(2);
    const messages = await store.messages.listByStory(storyId);
    const operation = await store.turnOperations.getByPlayerMessage(messages[0]!.id);
    expect(operation?.stageMetrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "npc_introduction",
          outcome: "timeout",
        }),
        expect.objectContaining({ stage: "classifier", outcome: "ok" }),
        expect.objectContaining({ stage: "narrator", outcome: "ok" }),
      ])
    );
  });

  it("does not commit an approved presence exit when the turn is cancelled before saving", async () => {
    await store.messages.insert({
      id: "scene-before-cancel",
      storyId,
      idx: 0,
      role: "narrator",
      content: "The gate seals behind you. You are alone now.",
      createdAt: 1,
    });
    const controller = new AbortController();
    const router: Router = {
      bindingFor: () => ({
        provider: "openrouter",
        model: "test",
        source: "recommended",
        samplersDirty: false,
      }),
      async complete(_role, prompt) {
        if (prompt.system.includes("NPC presence registrar")) {
          return {
            content: JSON.stringify({
              transitions: [{
                operation: "leave",
                characterId: "wight",
                name: "Grave-wight",
                grounding: "You are alone now",
              }],
            }),
          };
        }
        return {
          content: JSON.stringify({ playerIntents: [], npcIntents: [], freeText: "I listen." }),
        };
      },
      async stream() {
        const cancellation = new DOMException("Cancelled", "AbortError");
        controller.abort(cancellation);
        throw cancellation;
      },
    };

    await expect(
      submitTurn(router, store, storyId, "I listen.", { signal: controller.signal })
    ).rejects.toMatchObject({ name: "AbortError" });

    expect((await store.characters.get("wight"))?.present).toBe(true);
  });
});
