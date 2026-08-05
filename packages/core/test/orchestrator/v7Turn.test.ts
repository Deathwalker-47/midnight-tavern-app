import { beforeEach, describe, expect, it } from "vitest";
import { d20Sequence } from "../../src/engine/dice.js";
import {
  deleteLastTurn,
  inspectTurnOperationRecovery,
  retryTurnOperation,
  submitTurn,
} from "../../src/orchestrator/index.js";
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

class V7Router implements Router {
  constructor(
    readonly classified: ClassifiedTurn,
    readonly lootDecision: unknown = { award: false, reason: "No completed encounter." }
  ) {}
  bindingFor(_role: Role): RoleBinding {
    return { provider: "openrouter", model: "test", source: "recommended", samplersDirty: false };
  }
  async complete(role: Role, prompt: RolePrompt): Promise<ChatResponse> {
    if (role === "classifier" && prompt.system.includes("strict consistency auditor")) {
      return { content: JSON.stringify({ obeysRulings: true, contradictions: [] }) };
    }
    if (role === "classifier" && prompt.system.includes("DM loot adjudicator")) {
      return { content: JSON.stringify(this.lootDecision) };
    }
    if (role === "classifier") return { content: JSON.stringify(this.classified) };
    if (role === "analyzer") {
      return { content: JSON.stringify({ characterOps: [], worldOps: [] }) };
    }
    return { content: "" };
  }
  async stream(
    _role: Role,
    _prompt: RolePrompt,
    onDelta: StreamHandler
  ): Promise<ChatResponse> {
    const content = "The first strike lands; exhaustion stops the follow-up.";
    onDelta(content);
    return { content };
  }
}

class NarratorCancellationRouter extends V7Router {
  constructor(
    classified: ClassifiedTurn,
    private readonly controller: AbortController
  ) {
    super(classified);
  }
  override async stream(): Promise<ChatResponse> {
    this.controller.abort(new DOMException("Player cancelled narration.", "AbortError"));
    throw this.controller.signal.reason;
  }
}

describe("V7 ordered turn semantics", () => {
  let store: Store;
  const storyId = "fixture-story";

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
    const player = makePlayer();
    player.resources.stamina!.current = 3;
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
      name: "Wight",
      isPlayer: false,
      hard: {
        characterId: "wight",
        isPlayer: false,
        attributes: {},
        resources: { hp: { current: 20, max: 20 } },
        skills: [],
        inventory: [],
        flags: {},
        alive: true,
      },
    });
  });

  it("makes action two observe action one and visibly refuses action three", async () => {
    const intent = {
      actorId: "kestrel",
      actionId: "attack_melee",
      targetId: "wight",
      itemId: "sword",
      confidence: 1,
    };
    const result = await submitTurn(
      new V7Router({
        playerIntents: [intent, intent, intent],
        npcIntents: [],
        freeText: "",
      }),
      store,
      storyId,
      "I strike three times.",
      { rng: d20Sequence([15]) }
    );
    await result.background;

    expect(result.refusedActionCount).toBe(1);
    // Player: one landed strike, one denied (no stamina), one refused (budget). The surviving
    // wight then answers on its own separate encounter budget — a fourth ruling.
    expect(result.rulings).toHaveLength(4);
    expect(result.rulings[0]!.gate.allowed).toBe(true);
    expect(result.rulings[1]!.gate.allowed).toBe(false);
    expect(result.rulings[1]!.gate.reason).toMatch(/stamina|resource|cost/i);
    expect(result.rulings[2]!.gate.allowed).toBe(false);
    expect(result.rulings[2]!.gate.reason).toMatch(/turn allows 2/i);
    // The UI must route on the machine code, never regex-match this reason text (Plan 13 3.2).
    expect(result.rulings[2]!.gate.code).toBe("action_budget_exceeded");
    expect(result.rulings[3]).toMatchObject({ actorId: "wight", targetId: "kestrel" });
    expect(result.rulings[3]!.gate.allowed).toBe(true);
    expect((await store.characters.get("kestrel"))!.hard.resources.stamina!.current).toBe(1);

    const operation = await store.turnOperations.getByPlayerMessage(
      (await store.messages.getByIndex(storyId, 0))!.id
    );
    expect(operation?.state).toBe("idle");
    const events = await store.events.listByStory(storyId);
    expect(events.some((event) => event.kind === "action_budget_exceeded")).toBe(true);
  });

  it("sends a clear knife attack through DM ruling when the classifier returns no intents", async () => {
    const result = await submitTurn(
      new V7Router({
        playerIntents: [],
        npcIntents: [],
        freeText: "",
      }),
      store,
      storyId,
      "I lunge with my knife at the wight.",
      { rng: d20Sequence([15]) }
    );
    await result.background;

    // The recovered player strike, plus the surviving wight's same-turn counter.
    expect(result.rulings).toHaveLength(2);
    expect(result.rulings[0]).toMatchObject({
      actorId: "kestrel",
      actionId: "attack_melee",
      targetId: "wight",
      gate: { allowed: true },
    });
    expect(result.rulings[1]).toMatchObject({
      actorId: "wight",
      targetId: "kestrel",
      gate: { allowed: true },
    });
  });

  it("materializes only a validated DM-awarded runtime item after play", async () => {
    const router = new V7Router(
      {
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
      {
        award: true,
        sourceType: "combat",
        sourceLabel: "The wight is defeated",
        recipientCharacterId: "kestrel",
        reason: "A completed combat encounter earned a modest reward.",
        proposal: {
          name: "Wightglass Shard",
          description: "A pale shard that steadies a blade hand.",
          kind: "weapon",
          tier: "common",
          slotCompatibility: ["primary"],
          handsRequired: 1,
          unique: false,
          effects: [],
          props: { damage: 1 },
          tags: ["wight"],
        },
      }
    );
    const result = await submitTurn(router, store, storyId, "I finish the wight.", {
      rng: d20Sequence([20]),
    });
    await result.background;

    const definitions = await store.runtimeItems.listDefinitions(storyId);
    const inventory = await store.runtimeItems.listInventory("kestrel");
    expect(definitions).toHaveLength(1);
    expect(definitions[0]!.name).toBe("Wightglass Shard");
    expect(inventory).toHaveLength(1);
    expect(result.rulings[0]!.loot?.[0]?.itemDefinitionId).toBe(definitions[0]!.id);
    expect((await store.events.listByStory(storyId)).map((event) => event.kind)).toContain(
      "item_gained"
    );

    await deleteLastTurn(store, storyId);
    expect(await store.runtimeItems.listDefinitions(storyId)).toHaveLength(0);
    expect(await store.runtimeItems.listInventory("kestrel")).toHaveLength(0);
    // The turn's own gameplay events are gone; only the truncation's own honest journal record
    // survives (Plan 9 step 5 — a deletion must not read as "never happened").
    const events = await store.events.listByStory(storyId);
    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe("turn_rewound");
  });

  it("retries a cancelled operation with its persisted player message and creates no duplicate", async () => {
    const classified: ClassifiedTurn = {
      playerIntents: [],
      npcIntents: [],
      freeText: "The player studies the room.",
    };
    const controller = new AbortController();
    await expect(
      submitTurn(
        new NarratorCancellationRouter(classified, controller),
        store,
        storyId,
        "I study the room.",
        { signal: controller.signal }
      )
    ).rejects.toThrow("Player cancelled narration");

    const afterFailure = await store.messages.listByStory(storyId);
    expect(afterFailure.map((message) => message.role)).toEqual(["player"]);
    const failedOperation = await store.turnOperations.getByPlayerMessage(
      afterFailure[0]!.id
    );
    expect(failedOperation?.state).toBe("cancelled");

    const inspection = await inspectTurnOperationRecovery(store, storyId);
    expect(inspection).toMatchObject({
      recoverable: true,
      playerText: "I study the room.",
      playerMessageIdx: 0,
    });

    const recovered = await retryTurnOperation(
      new V7Router(classified),
      store,
      failedOperation!.id
    );
    await recovered.background;

    const messages = await store.messages.listByStory(storyId);
    expect(messages.map((message) => message.role)).toEqual(["player", "narrator"]);
    expect(messages.filter((message) => message.content === "I study the room.")).toHaveLength(1);
    expect((await store.turnOperations.get(failedOperation!.id))?.state).toBe("idle");
  });
});
