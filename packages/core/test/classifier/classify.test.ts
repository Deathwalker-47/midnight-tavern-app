/**
 * Classifier tests (M4).
 *
 * Two layers:
 *  1. Schema layer — the per-story Zod schema built from the catalog accepts only real
 *     action/actor ids and rejects invented ones (this is the gate's guarantee).
 *  2. Behavior layer — a scripted router feeds canned classifications so the confidence
 *     demotion rule, NPC-intent flow, and repair-on-bad-id are exercised deterministically.
 *
 * The ~40-message golden corpus (golden.ts) maps phrasings → expected action ids and is
 * asserted against the per-story schema's enum, which is what a live model is constrained
 * to. A live-model run of the same corpus is a manual/CI step (plan §10).
 */
import { describe, it, expect } from "vitest";
import { classify, buildClassifierSchema } from "../../src/classifier/index.js";
import type { Router, RolePrompt } from "../../src/router/index.js";
import type { ClassifiedTurn } from "../../src/index.js";
import { makeStory } from "../fixtures.js";
import { GOLDEN_CASES } from "./golden.js";

const story = makeStory();
const present = [
  { id: "player", name: "Hero", isPlayer: true },
  { id: "guard", name: "Guard", isPlayer: false },
];

/** A router that returns a fixed JSON string (optionally different per attempt). */
function scripted(responses: string[]): Router {
  let i = 0;
  return {
    bindingFor: () => ({ provider: "openrouter", model: "test", source: "recommended", samplersDirty: false }),
    async complete(_role, _prompt: RolePrompt) {
      const content = responses[Math.min(i, responses.length - 1)] ?? "";
      i++;
      return { content };
    },
    async stream() {
      throw new Error("classifier never streams");
    },
  };
}

function turn(t: Partial<ClassifiedTurn>): string {
  return JSON.stringify({ playerIntents: [], npcIntents: [], freeText: "", ...t });
}

describe("buildClassifierSchema", () => {
  const schema = buildClassifierSchema(story, ["player", "guard"]);

  it("accepts a valid in-catalog intent", () => {
    const res = schema.safeParse({
      playerIntents: [{ actorId: "player", actionId: "attack_melee", targetId: "guard", confidence: 0.9 }],
      npcIntents: [],
      freeText: "",
    });
    expect(res.success).toBe(true);
  });

  it("rejects an action id that is not in the catalog", () => {
    const res = schema.safeParse({
      playerIntents: [{ actorId: "player", actionId: "cast_fireball", confidence: 0.9 }],
      npcIntents: [],
      freeText: "",
    });
    expect(res.success).toBe(false);
  });

  it("rejects an actor id that is not present", () => {
    const res = schema.safeParse({
      playerIntents: [{ actorId: "dragon", actionId: "attack_melee", confidence: 0.9 }],
      npcIntents: [],
      freeText: "",
    });
    expect(res.success).toBe(false);
  });

  it("accepts learn_skill with a valid skillId", () => {
    const res = schema.safeParse({
      playerIntents: [{ actorId: "player", actionId: "learn_skill", skillId: "blade", confidence: 0.8 }],
      npcIntents: [],
      freeText: "",
    });
    expect(res.success).toBe(true);
  });
});

describe("classify — behavior", () => {
  it("returns high-confidence player intents unchanged", async () => {
    const router = scripted([
      turn({
        playerIntents: [{ actorId: "player", actionId: "attack_melee", targetId: "guard", confidence: 0.95 }],
      }),
    ]);
    const out = await classify(router, story, {
      playerMessage: "I swing my sword at the guard",
      presentCharacters: present,
      recentNarration: [],
    });
    expect(out.playerIntents).toHaveLength(1);
    expect(out.playerIntents[0]!.actionId).toBe("attack_melee");
    expect(out.freeText).not.toContain("ambiguous");
  });

  it("drops sub-0.6 intents to narration and appends the ambiguity note", async () => {
    const router = scripted([
      turn({
        playerIntents: [{ actorId: "player", actionId: "pick_lock", confidence: 0.4 }],
        freeText: "You approach the door.",
      }),
    ]);
    const out = await classify(router, story, {
      playerMessage: "maybe I could try the lock?",
      presentCharacters: present,
      recentNarration: [],
    });
    expect(out.playerIntents).toHaveLength(0);
    expect(out.freeText).toContain("do not resolve them mechanically");
    expect(out.freeText).toContain("You approach the door.");
  });

  it("keeps a pure-dialogue message as narration_only", async () => {
    const router = scripted([turn({ freeText: "Hello there." })]);
    const out = await classify(router, story, {
      playerMessage: '"Nice weather," I say.',
      presentCharacters: present,
      recentNarration: [],
    });
    expect(out.playerIntents).toHaveLength(0);
    expect(out.npcIntents).toHaveLength(0);
  });

  it("passes through NPC intents implied by the fiction", async () => {
    const router = scripted([
      turn({
        npcIntents: [{ actorId: "guard", actionId: "attack_melee", targetId: "player", confidence: 0.8 }],
      }),
    ]);
    const out = await classify(router, story, {
      playerMessage: "I stand my ground",
      presentCharacters: present,
      recentNarration: ["The guard raises his blade and lunges at you."],
    });
    expect(out.npcIntents).toHaveLength(1);
    expect(out.npcIntents[0]!.actorId).toBe("guard");
  });

  it("repairs when the model first emits an out-of-catalog id", async () => {
    const router = scripted([
      turn({ playerIntents: [{ actorId: "player", actionId: "cast_fireball", confidence: 0.9 }] }),
      turn({
        playerIntents: [{ actorId: "player", actionId: "attack_wild", targetId: "guard", confidence: 0.9 }],
      }),
    ]);
    const out = await classify(router, story, {
      playerMessage: "I unleash everything I have",
      presentCharacters: present,
      recentNarration: [],
    });
    expect(out.playerIntents[0]!.actionId).toBe("attack_wild");
  });
});

describe("golden corpus — every expected action id exists in the catalog", () => {
  const catalogIds = new Set([...story.actions.map((a) => a.id), "learn_skill"]);
  it("has ~40 cases", () => {
    expect(GOLDEN_CASES.length).toBeGreaterThanOrEqual(40);
  });
  for (const c of GOLDEN_CASES) {
    it(`"${c.message}" → [${c.expected.join(", ")}]`, () => {
      for (const id of c.expected) expect(catalogIds.has(id)).toBe(true);
    });
  }
});
