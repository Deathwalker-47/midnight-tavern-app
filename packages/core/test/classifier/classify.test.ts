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
import {
  classify,
  classifyWithRecovery,
  buildClassifierSchema,
} from "../../src/classifier/index.js";
import {
  ProviderTimeoutError,
  type Router,
  type RolePrompt,
} from "../../src/router/index.js";
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

function failing(error: Error): Router {
  return {
    bindingFor: () => ({
      provider: "openrouter",
      model: "test",
      source: "recommended",
      samplersDirty: false,
    }),
    async complete() {
      throw error;
    },
    async stream() {
      throw new Error("classifier never streams");
    },
  };
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

  it("normalizes harmless JSON-mode nulls, whitespace, and numeric confidence", () => {
    const res = schema.safeParse({
      playerIntents: [{
        actorId: " player ",
        actionId: " pick_lock ",
        targetId: null,
        itemId: "   ",
        skillId: null,
        confidence: "0.9",
      }],
      npcIntents: null,
      freeText: null,
    });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data).toEqual({
      playerIntents: [{
        actorId: "player",
        actionId: "pick_lock",
        confidence: 0.9,
      }],
      npcIntents: [],
      freeText: "",
    });
  });

  it("still rejects unknown ids after structural normalization", () => {
    const res = schema.safeParse({
      playerIntents: [{
        actorId: " player ",
        actionId: " cast_fireball ",
        targetId: null,
        confidence: "0.9",
      }],
      npcIntents: null,
      freeText: null,
    });
    expect(res.success).toBe(false);
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

  it("recovers an empty classifier response as a conservative narration-only turn", async () => {
    const out = await classifyWithRecovery(
      scripted([""]),
      story,
      {
        playerMessage: "I contemplate the wallpaper.",
        presentCharacters: present,
        recentNarration: [],
      },
      { maxRepairs: 0 }
    );
    expect(out.recovered).toBe(true);
    expect(out.errorKind).toBe("ModelOutputError");
    expect(out.recovery?.issues.map((issue) => issue.kind)).toEqual(["no_content"]);
    expect(out.turn.playerIntents).toEqual([]);
    expect(out.turn.freeText).toContain("do not claim any roll");
  });

  it("maps a clear knife lunge to the sealed universal melee action when the model emits no intents", async () => {
    const out = await classifyWithRecovery(
      scripted([turn({})]),
      story,
      {
        playerMessage: "I lunge with my knife at the guard.",
        presentCharacters: present,
        recentNarration: [],
      }
    );
    expect(out.recovered).toBe(false);
    expect(out.turn.playerIntents).toEqual([
      {
        actorId: "player",
        actionId: "attack_melee",
        targetId: "guard",
        confidence: 1,
      },
    ]);
  });

  it("recovers a clear universal action mechanically after an empty provider response", async () => {
    const out = await classifyWithRecovery(
      scripted([""]),
      story,
      {
        playerMessage: "I stab the guard with my knife.",
        presentCharacters: present,
        recentNarration: [],
      },
      { maxRepairs: 0 }
    );
    expect(out.recovered).toBe(true);
    expect(out.recovery?.policy).toBe("partial_mechanics");
    expect(out.recovery?.issues.map((entry) => entry.kind)).toEqual(["no_content"]);
    expect(out.turn.playerIntents[0]).toMatchObject({
      actorId: "player",
      actionId: "attack_melee",
      targetId: "guard",
    });
    expect(out.turn.freeText).toContain("obey their DM rulings");
  });

  it("recovers multiple explicitly named sealed actions after invalid structured output", async () => {
    const baseAction = story.actions.find((action) => action.id === "pick_lock")!;
    const jerusalemStory = {
      ...story,
      actions: [
        {
          ...baseAction,
          id: "social_press_the_ride",
          label: "Press the Ride",
          aliases: ["ride hard", "push the horse"],
          universalFamily: "move" as const,
          opposed: false,
        },
        {
          ...baseAction,
          id: "crafting_reload_and_clean",
          label: "Reload and Clean",
          aliases: ["reload", "clean the pistols"],
          universalFamily: "interact" as const,
          opposed: false,
        },
      ],
    };
    const out = await classifyWithRecovery(
      scripted(["not json"]),
      jerusalemStory,
      {
        playerMessage:
          "Reload and Clean your pistols before continuing. Press the Ride toward the mountains.",
        presentCharacters: present,
        recentNarration: [],
      },
      { maxRepairs: 0 }
    );
    expect(out.recovered).toBe(true);
    expect(out.recovery?.policy).toBe("partial_mechanics");
    expect(out.turn.playerIntents.map((intent) => intent.actionId)).toEqual([
      "crafting_reload_and_clean",
      "social_press_the_ride",
    ]);
  });

  it("does not guess between actions that share the same explicit phrase", async () => {
    const baseAction = story.actions.find((action) => action.id === "pick_lock")!;
    const ambiguousStory = {
      ...story,
      actions: [
        { ...baseAction, id: "pray_one", label: "First Prayer", aliases: ["pray"] },
        { ...baseAction, id: "pray_two", label: "Second Prayer", aliases: ["pray"] },
      ],
    };
    const out = await classifyWithRecovery(
      scripted(["not json"]),
      ambiguousStory,
      {
        playerMessage: "I pray.",
        presentCharacters: present,
        recentNarration: [],
      },
      { maxRepairs: 0 }
    );
    expect(out.recovery?.policy).toBe("narration_only");
    expect(out.turn.playerIntents).toEqual([]);
  });

  it("fails closed when a universal attack has an ambiguous target", async () => {
    const out = await classifyWithRecovery(
      scripted([turn({})]),
      story,
      {
        playerMessage: "I stab with my knife.",
        presentCharacters: [
          ...present,
          { id: "scout", name: "Scout", isPlayer: false },
        ],
        recentNarration: [],
      }
    );
    expect(out.recovered).toBe(true);
    expect(out.recovery?.issues.map((entry) => entry.kind)).toEqual([
      "unresolved_target",
    ]);
    expect(out.turn.playerIntents).toEqual([]);
  });

  it("preserves low-confidence demotion as structured recovery metadata", async () => {
    const out = await classifyWithRecovery(
      scripted([
        turn({
          playerIntents: [
            { actorId: "player", actionId: "pick_lock", confidence: 0.4 },
          ],
        }),
      ]),
      story,
      {
        playerMessage: "Maybe I try the lock.",
        presentCharacters: present,
        recentNarration: [],
      }
    );
    expect(out.recovered).toBe(true);
    expect(out.recovery).toMatchObject({
      policy: "narration_only",
      issues: [{ kind: "low_confidence", retryable: false, count: 1 }],
    });
  });

  it.each([
    {
      label: "invalid output",
      response: "not json",
      expected: ["invalid_output"],
    },
    {
      label: "unresolved action",
      response: turn({
        playerIntents: [
          { actorId: "player", actionId: "invented_action", confidence: 1 },
        ],
      }),
      expected: ["unresolved_action"],
    },
    {
      label: "unresolved target",
      response: turn({
        playerIntents: [
          {
            actorId: "player",
            actionId: "attack_melee",
            targetId: "missing-character",
            confidence: 1,
          },
        ],
      }),
      expected: ["unresolved_target"],
    },
  ])("preserves $label recovery metadata", async ({ response, expected }) => {
    const out = await classifyWithRecovery(
      scripted([response]),
      story,
      {
        playerMessage: "I attempt it.",
        presentCharacters: present,
        recentNarration: [],
      },
      { maxRepairs: 0 }
    );
    expect(out.recovered).toBe(true);
    expect(out.recovery?.issues.map((entry) => entry.kind)).toEqual(expected);
  });

  it("preserves provider timeout recovery metadata", async () => {
    const out = await classifyWithRecovery(
      failing(new ProviderTimeoutError("openrouter", "test", 1_000)),
      story,
      {
        playerMessage: "I contemplate the wallpaper.",
        presentCharacters: present,
        recentNarration: [],
      }
    );
    expect(out.recovered).toBe(true);
    expect(out.recovery?.issues.map((entry) => entry.kind)).toEqual(["timeout"]);
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
