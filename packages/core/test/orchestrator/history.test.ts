/**
 * History-operations integration test (low-level-plan-v2 §6): swipe, delete, rewind.
 *
 * Drives real `submitTurn` to build a transcript with committed hard-state deltas + pre-image
 * checkpoints, then proves:
 *   • swipe regenerates prose as a new variant WITHOUT re-rolling or re-committing state;
 *   • deleteLastTurn rolls hard state back to the pre-turn checkpoint and truncates the exchange;
 *   • rewindTo restores an earlier checkpoint and truncates every message/ruling/checkpoint after.
 *
 * A `ScriptedRouter` returns canned per-role output (zero network); a mutable `script` lets each
 * test swap the narrator prose so we can tell variants apart.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { openStore, type Store } from "../../src/store/index.js";
import {
  submitTurn,
  swipeLastTurn,
  deleteLastTurn,
  rewindTo,
  selectVariant,
} from "../../src/orchestrator/index.js";
import { d20Sequence } from "../../src/engine/dice.js";
import type {
  Router,
  RolePrompt,
  Role,
  RoleBinding,
  ChatResponse,
  StreamHandler,
} from "../../src/router/index.js";
import type { ClassifiedTurn } from "../../src/index.js";
import { makeStory, makePlayer } from "../fixtures.js";

interface Script {
  classified: ClassifiedTurn;
  narratorProse: string;
}

class ScriptedRouter implements Router {
  constructor(public script: Script) {}
  bindingFor(_role: Role): RoleBinding {
    return { provider: "openrouter", model: "test", source: "recommended", samplersDirty: false };
  }
  async complete(role: Role, _prompt: RolePrompt): Promise<ChatResponse> {
    switch (role) {
      case "classifier":
        return { content: JSON.stringify(this.script.classified) };
      case "analyzer":
        return { content: JSON.stringify({ characterOps: [], worldOps: [] }) };
      default:
        return { content: "" };
    }
  }
  async stream(_role: Role, _prompt: RolePrompt, onDelta: StreamHandler): Promise<ChatResponse> {
    onDelta(this.script.narratorProse);
    return { content: this.script.narratorProse };
  }
}

const strikeIntent: ClassifiedTurn = {
  playerIntents: [
    { actorId: "kestrel", actionId: "attack_melee", targetId: "wight", itemId: "sword", confidence: 1 },
  ],
  npcIntents: [],
  freeText: "",
};

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

/** Run one strike turn (d20=15 ⇒ success ⇒ wight takes 10 dmg). */
async function strike(router: ScriptedRouter, store: Store, storyId: string, text: string) {
  const res = await submitTurn(router, store, storyId, text, { rng: d20Sequence([15]) });
  await res.background;
  return res;
}

async function wightHp(store: Store): Promise<number> {
  return (await store.characters.get("wight"))!.hard.resources.hp!.current;
}

describe("history ops — swipe / delete / rewind (§6)", () => {
  let store: Store;
  let storyId: string;
  let router: ScriptedRouter;
  beforeEach(async () => {
    ({ store, storyId } = await seedStore());
    router = new ScriptedRouter({ classified: strikeIntent, narratorProse: "First telling." });
  });

  it("captures a checkpoint per turn bound to the narrator message", async () => {
    await strike(router, store, storyId, "I strike");
    const msgs = await store.messages.listByStory(storyId);
    const narrator = msgs.find((m) => m.role === "narrator")!;
    const cp = await store.checkpoints.getByMessage(narrator.id);
    expect(cp).toBeDefined();
    // Pre-image holds the wight at full hp (before the -10 committed this turn).
    const snap = JSON.parse(cp!.hardPreJson) as Record<
      string,
      { resources: { hp: { current: number } } }
    >;
    expect(snap.wight!.resources.hp.current).toBe(12);
  });

  it("swipe regenerates prose as a new active variant without re-committing state", async () => {
    await strike(router, store, storyId, "I strike");
    expect(await wightHp(store)).toBe(2);

    router.script.narratorProse = "Second telling.";
    const result = await swipeLastTurn(router, store, storyId);
    expect(result.variants).toEqual(["First telling.", "Second telling."]);
    expect(result.activeVariant).toBe(1);

    // State is untouched by a swipe — no second -10 applied.
    expect(await wightHp(store)).toBe(2);

    // Persisted message carries both variants with the new one active.
    const msgs = await store.messages.listByStory(storyId);
    const narrator = msgs.find((m) => m.role === "narrator")!;
    expect(narrator.variants).toEqual(["First telling.", "Second telling."]);
    expect(narrator.activeVariant).toBe(1);
  });

  it("selectVariant switches the active variant with no model call", async () => {
    await strike(router, store, storyId, "I strike");
    router.script.narratorProse = "Second telling.";
    await swipeLastTurn(router, store, storyId);

    const narratorIdx = (await store.messages.nextIdx(storyId)) - 1;
    const sel = await selectVariant(store, storyId, narratorIdx, 0);
    expect(sel.activeVariant).toBe(0);
    const msg = await store.messages.getByIndex(storyId, narratorIdx);
    expect(msg!.activeVariant).toBe(0);
  });

  it("deleteLastTurn rolls state back to the checkpoint and drops the exchange", async () => {
    await strike(router, store, storyId, "I strike");
    expect(await wightHp(store)).toBe(2);
    expect(await store.messages.listByStory(storyId)).toHaveLength(2);

    await deleteLastTurn(store, storyId);

    // Wight is back to full; the player+narrator pair is gone; no orphan checkpoint/ruling.
    expect(await wightHp(store)).toBe(12);
    expect(await store.messages.listByStory(storyId)).toHaveLength(0);
    expect(await store.checkpoints.listByStory(storyId)).toHaveLength(0);
    expect(await store.rulings.listByStory(storyId)).toHaveLength(0);
  });

  it("rewindTo restores an earlier checkpoint and truncates everything after", async () => {
    await strike(router, store, storyId, "strike one"); // wight 12 → 2
    expect(await wightHp(store)).toBe(2);

    // A second turn would kill the wight (2 - 10, clamped). Its checkpoint pre-image is hp=2.
    await strike(router, store, storyId, "strike two");
    const msgs = await store.messages.listByStory(storyId);
    expect(msgs).toHaveLength(4); // player, narrator, player, narrator
    const secondNarratorIdx = msgs[3]!.idx;
    const secondPlayerIdx = msgs[2]!.idx;

    // Rewind to just before the SECOND turn's player message.
    await rewindTo(store, storyId, secondPlayerIdx);

    // State restored to the second turn's pre-image (hp=2), transcript truncated to turn one.
    expect(await wightHp(store)).toBe(2);
    const after = await store.messages.listByStory(storyId);
    expect(after).toHaveLength(2);
    expect(after.every((m) => m.idx < secondNarratorIdx)).toBe(true);
    // The rewound turn's checkpoint + ruling are gone; turn one's remain.
    expect(await store.checkpoints.listByStory(storyId)).toHaveLength(1);
    expect(await store.rulings.listByStory(storyId)).toHaveLength(1);
  });
});
