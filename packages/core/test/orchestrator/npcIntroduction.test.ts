import { describe, expect, it } from "vitest";
import {
  planNpcTransitions,
  type NpcIntroductionProposal,
} from "../../src/orchestrator/npcIntroduction.js";
import type { CharacterRecord } from "../../src/store/index.js";
import type { ChatResponse, Role, RoleBinding, RolePrompt, Router } from "../../src/router/index.js";
import { makeEnemy, makeStory } from "../fixtures.js";

class ProposalRouter implements Router {
  lastPrompt?: RolePrompt;

  constructor(
    private readonly proposals: readonly NpcIntroductionProposal[] | string,
    private readonly error?: Error
  ) {}

  bindingFor(_role: Role): RoleBinding {
    return { provider: "openrouter", model: "test", source: "recommended", samplersDirty: false };
  }

  async complete(_role: Role, prompt: RolePrompt): Promise<ChatResponse> {
    this.lastPrompt = prompt;
    if (this.error) throw this.error;
    return {
      content:
        typeof this.proposals === "string"
          ? this.proposals
          : JSON.stringify({ transitions: this.proposals }),
    };
  }

  async stream(): Promise<ChatResponse> {
    return { content: "" };
  }
}

const storyId = "intro-story";
const schema = makeStory({ storyId });

function existing(overrides: Partial<CharacterRecord> = {}): CharacterRecord {
  return {
    id: "wight",
    storyId,
    name: "Grave-wight",
    isPlayer: false,
    present: false,
    hard: makeEnemy(),
    ...overrides,
  };
}

async function plan(
  proposals: readonly NpcIntroductionProposal[] | string,
  overrides: Partial<Parameters<typeof planNpcTransitions>[1]> = {}
) {
  return planNpcTransitions(
    new ProposalRouter(proposals),
    {
      storyId,
      schema,
      playerText: "I raise my blade.",
      recentNarration: ["A hunched creature crawls from the cistern and blocks the passage."],
      roster: [],
      ...overrides,
    }
  );
}

describe("planNpcTransitions", () => {
  it("instantiates a sealed NPC template before narration", async () => {
    const result = await plan([
      {
        operation: "introduce",
        name: "Grave-wight",
        templateId: "wight",
        grounding: "Grave-wight",
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      operation: "introduce",
      character: {
        id: "intro-story:scene:wight",
        name: "Grave-wight",
        present: true,
        hard: { templateId: "wight", isPlayer: false },
      },
    });
  });

  it("registers a grounded unnamed creature with bounded generic hard state", async () => {
    const result = await plan([
      {
        operation: "introduce",
        name: "Hunched creature",
        grounding: "A hunched creature crawls from the cistern",
      },
    ]);

    expect(result[0]).toMatchObject({
      operation: "introduce",
      character: {
        id: "intro-story:scene:hunched-creature",
        name: "Hunched creature",
        present: true,
        hard: { characterId: "intro-story:scene:hunched-creature", isPlayer: false },
      },
    });
  });

  it("grants a grounded generic NPC only unique sealed skills at novice rank", async () => {
    const result = await plan([
      {
        operation: "introduce",
        name: "Hunched creature",
        grounding: "A hunched creature crawls from the cistern",
        skillIds: ["blade", "blade", "unknown_skill"],
      },
    ]);

    expect(result[0]?.character.hard.skills).toEqual([
      { skillId: "blade", rank: "novice", successCount: 0 },
    ]);
  });

  it("does not let a proposal override a sealed NPC template loadout", async () => {
    const result = await plan([
      {
        operation: "introduce",
        name: "Grave-wight",
        templateId: "wight",
        grounding: "Grave-wight",
        skillIds: ["lockpicking"],
      },
    ]);

    expect(result[0]?.character.hard.skills).toEqual([
      { skillId: "blade", rank: "adept", successCount: 0 },
    ]);
  });

  it("does not let presence transitions rewrite an existing character loadout", async () => {
    const wight = existing();
    const result = await plan(
      [
        {
          operation: "enter",
          characterId: "wight",
          name: "Grave-wight",
          grounding: "The Grave-wight enters the vault",
          skillIds: ["lockpicking"],
        },
      ],
      {
        recentNarration: ["The Grave-wight enters the vault."],
        roster: [wight],
      }
    );

    expect(result).toEqual([
      { operation: "enter", character: { ...wight, present: true } },
    ]);
  });

  it("shows the registrar only the sealed skill catalogue and bounds proposed loadouts", async () => {
    const router = new ProposalRouter([]);
    await planNpcTransitions(router, {
      storyId,
      schema,
      playerText: "I wait.",
      recentNarration: [],
      roster: [],
    });

    expect(router.lastPrompt?.system).toContain("at most three sealed skill ids");
    expect(router.lastPrompt?.user).toContain('"id":"blade"');
    expect(router.lastPrompt?.user).toContain('"description"');
  });

  it("fails closed when a model exceeds the NPC capability bound", async () => {
    expect(
      await plan([
        {
          operation: "introduce",
          name: "Hunched creature",
          grounding: "A hunched creature crawls from the cistern",
          skillIds: ["blade", "lockpicking", "survival", "mastery"],
        },
      ])
    ).toEqual([]);
  });

  it("reuses a normalized registry identity instead of creating a duplicate", async () => {
    const result = await plan(
      [{
        operation: "introduce",
        name: "grave WIGHT",
        grounding: "The Grave-wight enters the vault.",
      }],
      {
        recentNarration: ["The Grave-wight enters the vault."],
        roster: [existing()],
      }
    );

    expect(result).toEqual([
      { operation: "enter", character: { ...existing(), present: true } },
    ]);
  });

  it("supports leave and later re-entry without deleting the registry record", async () => {
    const roster = [existing({ present: true })];
    const left = await plan(
      [{ operation: "leave", characterId: "wight", name: "Grave-wight", grounding: "leaves" }],
      { playerText: "The Grave-wight leaves.", recentNarration: [], roster }
    );
    const returned = await plan(
      [{ operation: "enter", characterId: "wight", name: "Grave-wight", grounding: "returns" }],
      { playerText: "The Grave-wight returns.", recentNarration: [], roster: [left[0]!.character] }
    );

    expect(left[0]).toEqual({ operation: "leave", character: { ...roster[0]!, present: false } });
    expect(returned[0]).toEqual({
      operation: "enter",
      character: { ...roster[0]!, present: true },
    });
  });

  it("persists hostility only when committed narration explicitly targets the player", async () => {
    const wight = existing({ present: true });
    const result = await plan([], {
      playerText: "I wait.",
      recentNarration: ["The Grave-wight lunges at Kestrel and tries to kill her."],
      roster: [wight, existing({ id: "kestrel", name: "Kestrel", isPlayer: true, present: true })],
    });

    expect(result).toEqual([
      {
        operation: "update",
        character: {
          ...wight,
          hard: {
            ...wight.hard,
            flags: { ...wight.hard.flags, npc_hostile_to_player: true },
          },
        },
      },
    ]);
  });

  it.each([
    ["a player claim", "I say the Grave-wight attacks me.", ["The wight watches in silence."]],
    ["reverse-direction violence", "I wait.", ["Kestrel attacks the Grave-wight."]],
    ["negated violence", "I wait.", ["The Grave-wight does not attack Kestrel."]],
    ["an ominous appearance", "I wait.", ["The Grave-wight looks vicious and dangerous."]],
  ])("does not infer hostility from %s", async (_label, playerText, recentNarration) => {
    expect(
      await plan([], {
        playerText,
        recentNarration,
        roster: [
          existing({ present: true }),
          existing({ id: "kestrel", name: "Kestrel", isPlayer: true, present: true }),
        ],
      })
    ).toEqual([]);
  });

  it("recognizes a grounded registry alias without creating a second creature", async () => {
    const shadow = existing({ id: "shadow", name: "shadow_entity", present: true });
    const result = await plan([], {
      playerText: "I brace myself.",
      recentNarration: ["The shadow claws at you from the dark."],
      roster: [shadow, existing({ id: "kestrel", name: "Kestrel", isPlayer: true, present: true })],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      operation: "update",
      character: { id: "shadow", hard: { flags: { npc_hostile_to_player: true } } },
    });
  });

  it("fails closed when a shortened narration alias matches multiple registry actors", async () => {
    const result = await plan([], {
      playerText: "I brace myself.",
      recentNarration: ["The shadow attacks you from behind."],
      roster: [
        existing({ id: "shadow-entity", name: "Shadow Entity", present: true }),
        existing({ id: "shadow-beast", name: "Shadow Beast", present: true }),
        existing({ id: "kestrel", name: "Kestrel", isPlayer: true, present: true }),
      ],
    });

    expect(result).toEqual([]);
  });

  it.each([
    [
      "an unknown template",
      [{
        operation: "introduce",
        name: "Dragon",
        templateId: "dragon",
        grounding: "A dragon descends.",
      }],
      ["A dragon descends."],
    ],
    [
      "an ambient mural",
      [{
        operation: "introduce",
        name: "Painted guard",
        grounding: "A mural shows a painted guard beside a crowd.",
      }],
      ["A mural shows a painted guard beside a crowd."],
    ],
    [
      "an ungrounded invention",
      [{
        operation: "introduce",
        name: "Mara",
        grounding: "Mara enters.",
      }],
      ["The empty room is silent."],
    ],
  ])("rejects %s", async (_label, proposals, recentNarration) => {
    expect(await plan(proposals as NpcIntroductionProposal[], { recentNarration })).toEqual([]);
  });

  it("fails closed on malformed model output", async () => {
    expect(await plan("not json")).toEqual([]);
  });

  it("propagates cancellation instead of converting it into an empty plan", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("Cancelled", "AbortError"));
    await expect(
      planNpcTransitions(
        new ProposalRouter([], new DOMException("Cancelled", "AbortError")),
        {
          storyId,
          schema,
          playerText: "Wait.",
          recentNarration: [],
          roster: [],
        },
        controller.signal
      )
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
