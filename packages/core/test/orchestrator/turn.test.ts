/**
 * Orchestrator integration test (low-level-plan §10: "integration test with a mock router
 * (canned model outputs) proving the pipeline order, the transaction semantics, and
 * prose-never-writes-ledger").
 *
 * A `ScriptedRouter` returns canned role outputs with zero network: the classifier yields a
 * chosen intent, the narrator yields fixed prose (deliberately claiming false mechanical
 * outcomes, to prove prose never touches the ledger), and analyzer/summarizer are stubbed.
 * We drive real `submitTurn` against a real in-memory store + frozen fixture schema and
 * assert the committed state matches the ENGINE's rulings, not the prose.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { openStore, type Store } from "../../src/store/index.js";
import { submitTurn } from "../../src/orchestrator/index.js";
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
}

/** A Router that replays a script and records the order roles were called in. */
class ScriptedRouter implements Router {
  readonly calls: Role[] = [];
  constructor(private script: Script) {}

  bindingFor(_role: Role): RoleBinding {
    return { provider: "openrouter", model: "test", source: "recommended", samplersDirty: false };
  }

  async complete(role: Role, _prompt: RolePrompt): Promise<ChatResponse> {
    this.calls.push(role);
    switch (role) {
      case "classifier":
        return { content: JSON.stringify(this.script.classified) };
      case "analyzer":
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
    const result = await submitTurn(router, store, storyId, "I strike the wight", {
      rng: d20Sequence([15]),
    });
    await result.background;

    // Two messages persisted, in order.
    const msgs = await store.messages.listByStory(storyId);
    expect(msgs.map((m) => m.role)).toEqual(["player", "narrator"]);
    expect(msgs[1]!.content).toContain("magic ring"); // prose stored verbatim

    // The engine's ruling — not the prose — decided the outcome.
    expect(result.rulings).toHaveLength(1);
    expect(result.rulings[0]!.roll?.outcome).toBe("success");

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
});
