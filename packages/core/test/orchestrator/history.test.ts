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
  deleteFromExchange,
  rewindTo,
  selectVariant,
  setStoryDifficulty,
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
  lastNarratorPrompt?: RolePrompt;
  constructor(public script: Script) {}
  bindingFor(_role: Role): RoleBinding {
    return { provider: "openrouter", model: "test", source: "recommended", samplersDirty: false };
  }
  async complete(role: Role, prompt: RolePrompt): Promise<ChatResponse> {
    switch (role) {
      case "classifier":
        if (prompt.system.includes("strict consistency auditor")) {
          return { content: JSON.stringify({ obeysRulings: true, contradictions: [] }) };
        }
        if (prompt.system.includes("DM loot adjudicator")) {
          return { content: JSON.stringify({ award: false, reason: "No completed encounter." }) };
        }
        return { content: JSON.stringify(this.script.classified) };
      case "analyzer":
        return { content: JSON.stringify({ characterOps: [], worldOps: [] }) };
      default:
        return { content: "" };
    }
  }
  async stream(_role: Role, prompt: RolePrompt, onDelta: StreamHandler): Promise<ChatResponse> {
    this.lastNarratorPrompt = prompt;
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
    expect(
      narrator.variants?.map((variant) =>
        typeof variant === "string" ? variant : variant.prose
      )
    ).toEqual(["First telling.", "Second telling."]);
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

  it("feedback steers only the retelling, stays before authority, and rejects oversized notes", async () => {
    await strike(router, store, storyId, "I strike");
    router.script.narratorProse = "A tighter telling.";
    const feedback = "Tell this more concisely.";
    await swipeLastTurn(router, store, storyId, { feedback });

    const system = router.lastNarratorPrompt!.system;
    expect(system).toContain(feedback);
    expect(system.indexOf(feedback)).toBeLessThan(system.lastIndexOf("AUTHORITY:"));
    const narrator = (await store.messages.listByStory(storyId)).find(
      (message) => message.role === "narrator"
    )!;
    const active = narrator.variants?.[narrator.activeVariant ?? 0];
    expect(typeof active === "string" ? undefined : active?.feedback).toBe(feedback);
    expect(narrator.content).not.toContain(feedback);

    await expect(
      swipeLastTurn(router, store, storyId, { feedback: "x".repeat(301) })
    ).rejects.toThrow("300 characters or fewer");
  });

  it("deleteLastTurn rolls state back to the checkpoint and drops the exchange", async () => {
    await strike(router, store, storyId, "I strike");
    expect(await wightHp(store)).toBe(2);
    expect(await store.messages.listByStory(storyId)).toHaveLength(2);
    expect((await store.events.listByStory(storyId)).length).toBeGreaterThan(0);

    await deleteLastTurn(store, storyId);

    // Wight is back to full; the player+narrator pair is gone; no orphan checkpoint/ruling.
    expect(await wightHp(store)).toBe(12);
    expect(await store.messages.listByStory(storyId)).toHaveLength(0);
    expect(await store.checkpoints.listByStory(storyId)).toHaveLength(0);
    expect(await store.rulings.listByStory(storyId)).toHaveLength(0);
    expect(await store.events.listByStory(storyId)).toHaveLength(0);
  });

  it("rewindTo keeps the selected exchange and truncates later exchanges", async () => {
    await strike(router, store, storyId, "strike one"); // wight 12 → 2
    expect(await wightHp(store)).toBe(2);

    // A second turn would kill the wight (2 - 10, clamped). Its checkpoint pre-image is hp=2.
    await strike(router, store, storyId, "strike two");
    const msgs = await store.messages.listByStory(storyId);
    expect(msgs).toHaveLength(4); // player, narrator, player, narrator
    const secondNarratorIdx = msgs[3]!.idx;
    const firstPlayerIdx = msgs[0]!.idx;

    // Rewind to the first exchange: the selected player+narrator pair stays intact.
    await rewindTo(store, storyId, firstPlayerIdx);

    // State restored to the second turn's pre-image (hp=2), transcript truncated to turn one.
    expect(await wightHp(store)).toBe(2);
    const after = await store.messages.listByStory(storyId);
    expect(after).toHaveLength(2);
    expect(after.every((m) => m.idx < secondNarratorIdx)).toBe(true);
    // Later turn checkpoint + ruling are gone; the selected exchange's remain.
    expect(await store.checkpoints.listByStory(storyId)).toHaveLength(1);
    expect(await store.rulings.listByStory(storyId)).toHaveLength(1);
    expect((await store.events.listByStory(storyId)).every((event) => event.turnIndex < 2)).toBe(true);
  });

  it("rewind restores the difficulty that preceded the truncated timeline", async () => {
    await strike(router, store, storyId, "strike one");
    await setStoryDifficulty(store, storyId, {
      preset: "hard",
      dcOffset: 2,
      damageTakenMultiplier: 1.3,
      damageDealtMultiplier: 0.9,
    });
    await strike(router, store, storyId, "strike two");

    await rewindTo(store, storyId, 0);

    expect((await store.stories.get(storyId))?.difficulty?.preset).toBe("standard");
    expect(
      (await store.events.listByStory(storyId)).some(
        (event) => event.kind === "difficulty_changed"
      )
    ).toBe(false);
  });

  it("deleteFromExchange removes the selected exchange and restores its pre-turn state", async () => {
    await strike(router, store, storyId, "strike one");
    await strike(router, store, storyId, "strike two");
    const messages = await store.messages.listByStory(storyId);

    await deleteFromExchange(store, storyId, messages[3]!.idx);

    expect(await wightHp(store)).toBe(2);
    expect((await store.messages.listByStory(storyId)).map((message) => message.content)).toEqual([
      "strike one",
      "First telling.",
    ]);
    expect(await store.checkpoints.listByStory(storyId)).toHaveLength(1);
    expect(await store.rulings.listByStory(storyId)).toHaveLength(1);
    expect((await store.events.listByStory(storyId)).every((event) => event.turnIndex < 2)).toBe(true);
  });

  // ── V2 §6 blocking tests: swipe re-runs analyzer + per-variant soft state; summary invalidation ──

  it("swipe re-runs the analyzer per variant and cycling restores that variant's soft state", async () => {
    // Analyzer writes the wight's mood = current narrator prose, so each variant yields distinct soft.
    const moodRouter = new ScriptedRouter({ classified: strikeIntent, narratorProse: "First telling." });
    moodRouter.complete = async (role: Role, prompt: RolePrompt) => {
      if (role === "classifier" && prompt.system.includes("strict consistency auditor")) {
        return { content: JSON.stringify({ obeysRulings: true, contradictions: [] }) };
      }
      if (role === "classifier" && prompt.system.includes("DM loot adjudicator")) {
        return { content: JSON.stringify({ award: false, reason: "No completed encounter." }) };
      }
      if (role === "classifier") return { content: JSON.stringify(strikeIntent) };
      if (role === "analyzer") {
        return {
          content: JSON.stringify({
            characterOps: [
              { characterId: "wight", ops: [{ op: "set", path: "mood", value: moodRouter.script.narratorProse }] },
            ],
            worldOps: [],
          }),
        };
      }
      return { content: "" };
    };

    await strike(moodRouter, store, storyId, "I strike");
    expect((await store.characters.get("wight"))!.soft?.current.mood).toBe("First telling.");
    const hpAfterTurn = await wightHp(store);

    moodRouter.script.narratorProse = "Second telling.";
    await swipeLastTurn(moodRouter, store, storyId);
    // Soft state followed the NEW prose; hard state is byte-identical (no re-roll).
    expect((await store.characters.get("wight"))!.soft?.current.mood).toBe("Second telling.");
    expect(await wightHp(store)).toBe(hpAfterTurn);

    // Cycling back to variant 0 restores its stored soft snapshot — with NO model call.
    const narratorIdx = (await store.messages.nextIdx(storyId)) - 1;
    let analyzerCalls = 0;
    moodRouter.complete = async (role: Role) => {
      if (role === "analyzer") analyzerCalls++;
      return { content: "{}" };
    };
    await selectVariant(store, storyId, narratorIdx, 0);
    expect(analyzerCalls).toBe(0);
    expect((await store.characters.get("wight"))!.soft?.current.mood).toBe("First telling.");
  });

  it("failed swipe restores the active variant's soft state and leaves variants unchanged", async () => {
    const moodRouter = new ScriptedRouter({ classified: strikeIntent, narratorProse: "First telling." });
    moodRouter.complete = async (role: Role, prompt: RolePrompt) => {
      if (role === "classifier" && prompt.system.includes("strict consistency auditor")) {
        return { content: JSON.stringify({ obeysRulings: true, contradictions: [] }) };
      }
      if (role === "classifier" && prompt.system.includes("DM loot adjudicator")) {
        return { content: JSON.stringify({ award: false, reason: "No completed encounter." }) };
      }
      if (role === "classifier") return { content: JSON.stringify(strikeIntent) };
      if (role === "analyzer") {
        return {
          content: JSON.stringify({
            characterOps: [
              { characterId: "wight", ops: [{ op: "set", path: "mood", value: "First telling." }] },
            ],
            worldOps: [],
          }),
        };
      }
      return { content: "" };
    };

    await strike(moodRouter, store, storyId, "I strike");
    expect((await store.characters.get("wight"))!.soft?.current.mood).toBe("First telling.");
    const hpAfterTurn = await wightHp(store);

    moodRouter.stream = async () => {
      throw new Error("network down");
    };
    await expect(swipeLastTurn(moodRouter, store, storyId)).rejects.toThrow("network down");

    expect((await store.characters.get("wight"))!.soft?.current.mood).toBe("First telling.");
    expect(await wightHp(store)).toBe(hpAfterTurn);
    const narratorIdx = (await store.messages.nextIdx(storyId)) - 1;
    const narrator = await store.messages.getByIndex(storyId, narratorIdx);
    expect(narrator!.variants).toEqual(["First telling."]);
    expect(narrator!.activeVariant).toBe(0);
  });

  it("deleteLastTurn invalidates chapters/arcs built from the removed messages", async () => {
    await strike(router, store, storyId, "I strike");
    const narratorIdx = (await store.messages.nextIdx(storyId)) - 1;
    // Seed a chapter + arc that summarize through the last message.
    await store.chapters.insert({
      id: "ch0",
      storyId,
      idx: 0,
      msgFrom: 0,
      msgTo: narratorIdx,
      title: "Chapter One",
      summary: "…",
    });
    await store.arcs.insert({
      id: "arc0",
      storyId,
      idx: 0,
      chapterFrom: 0,
      chapterTo: 0,
      title: "Arc One",
      doc: {
        plotSummary: "…",
        characterDevelopment: [],
        relationshipDynamics: [],
        secretsRevealed: [],
        keyDialogue: [],
        promisesAndOaths: [],
        antagonists: [],
        worldLore: [],
        unresolvedThreads: [],
        stakes: [],
        keyItems: [],
        skillsAndPowers: [],
        limitations: [],
        timeline: [],
      },
    });

    await deleteLastTurn(store, storyId);

    expect(await store.chapters.listByStory(storyId)).toHaveLength(0);
    expect(await store.arcs.listByStory(storyId)).toHaveLength(0);
  });

  it("restore drops characters and world created after the checkpoint", async () => {
    await strike(router, store, storyId, "I strike");
    // Simulate post-turn analyzer artifacts: a brand-new observed character + a world doc that did
    // NOT exist at checkpoint time.
    await store.characters.insert({
      id: "ghost",
      storyId,
      name: "Pale ghost",
      isPlayer: false,
      hard: { characterId: "ghost", isPlayer: false, attributes: {}, resources: {}, skills: [], inventory: [], flags: {}, alive: true },
    });
    await store.worldSoft.set(storyId, {
      overview: "A world that appeared this turn.",
      locations: [],
      arcs: [],
      unresolvedThreads: [],
    });

    await deleteLastTurn(store, storyId);

    // The checkpoint pre-image had neither → both are gone after rollback.
    expect(await store.characters.get("ghost")).toBeUndefined();
    expect(await store.worldSoft.get(storyId)).toBeUndefined();
  });
});
