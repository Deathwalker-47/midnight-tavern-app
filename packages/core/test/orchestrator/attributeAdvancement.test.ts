import { describe, expect, it, vi } from "vitest";
import {
  assembleContext,
  determineAttributeAdvancements,
  evaluateAttributeAdvancement,
  openStore,
  recordAttributeAdvancementDecision,
  type AttributeAdvancementDecision,
  type AttributeAdvancementEvidence,
  type AttributeAdvancementProposal,
  type Router,
  type Ruling,
  type Store,
  type StoryRecord,
} from "../../src/index.js";
import { makePlayer, makeStory } from "../fixtures.js";

function successfulExceptionalRuling(turnId: string): Ruling {
  return {
    turnId,
    actorId: "kestrel",
    actionId: "hold_collapsing_gate",
    actionLabel: "Hold the collapsing gate",
    gate: { allowed: true },
    roll: {
      d20: 19,
      modifier: 4,
      total: 23,
      dc: 18,
      attributeId: "str",
      attributeScore: 10,
      attributeModifier: 0,
      outcome: "success",
    },
    effectsApplied: {
      setFlag: { flagId: "villagers_rescued", value: true },
      narrationHint: "The last villagers escape before the gate collapses.",
    },
  };
}

function approvedExceptionalFixture(story: StoryRecord): {
  ruling: Ruling;
  proposal: AttributeAdvancementProposal;
  decision: AttributeAdvancementDecision;
} {
  for (let index = 0; index < 500; index++) {
    const ruling = successfulExceptionalRuling(`exceptional-ruling-${index}`);
    const evidence: AttributeAdvancementEvidence = {
      id: ruling.turnId,
      rulingId: ruling.turnId,
      turnIndex: 30,
      characterId: "kestrel",
      attributeId: "str",
      kind: "successful_ruling",
      actionId: ruling.actionId,
      actionLabel: ruling.actionLabel,
      highStakes: true,
      materialChange: true,
      difficultyDc: 18,
      qualifyingSources: ["repeated_high_stakes_use", "exceptional_action"],
    };
    const proposal: AttributeAdvancementProposal = {
      characterId: "kestrel",
      attributeId: "str",
      source: "exceptional_action",
      delta: 1,
      evidenceRefs: [ruling.turnId],
      rationale: "A high-DC feat directly used Strength and rescued the villagers.",
    };
    const decision = evaluateAttributeAdvancement(proposal, {
      storyId: story.id,
      schema: story.schema,
      character: makePlayer({ attributes: { str: 10, dex: 12 } }),
      currentTurnIndex: 30,
      evidence: [evidence],
      prior: [],
    });
    if (decision.approved) return { ruling, proposal, decision };
  }
  throw new Error("Could not construct an approved exceptional-action fixture.");
}

describe("live attribute advancement adjudication", () => {
  it("does not ask for advancement after one routine attack or narration-only effect", async () => {
    const schema = makeStory();
    const story: StoryRecord = {
      id: schema.storyId,
      title: schema.title,
      createdAt: 0,
      schema,
      locked: true,
    };
    const routine: Ruling = {
      ...successfulExceptionalRuling("routine-attack"),
      actionId: "routine_attack",
      actionLabel: "Routine attack",
      effectsApplied: { narrationHint: "The ordinary strike lands." },
    };
    const complete = vi.fn();
    const result = await determineAttributeAdvancements(
      { complete, bindingFor: vi.fn(), stream: vi.fn() } as unknown as Router,
      {
        events: { listByStory: vi.fn().mockResolvedValue([]) },
      } as unknown as Store,
      {
        story,
        playerText: "I attack again.",
        rulings: [routine],
        turnIndex: 30,
        hardStates: new Map([["kestrel", makePlayer()]]),
      }
    );

    expect(complete).not.toHaveBeenCalled();
    expect(result.decisions).toEqual([]);
    expect(result.hardStates.get("kestrel")?.attributes.str).toBe(14);
  });

  it("reconstructs sustained-training evidence from persisted ruling context across turns", async () => {
    const schema = makeStory();
    const story: StoryRecord = {
      id: schema.storyId,
      title: schema.title,
      createdAt: 0,
      schema,
      locked: true,
    };
    const trainingRuling = (turnId: string): Ruling => ({
      ...successfulExceptionalRuling(turnId),
      actionId: "conditioning_drill",
      actionLabel: "Conditioning drill",
    });
    const historical = [20, 24].map((turnIndex) => ({
      id: `training-event-${turnIndex}`,
      storyId: story.id,
      messageId: `message-${turnIndex}`,
      turnIndex,
      actorId: "kestrel",
      kind: "roll" as const,
      payload: {
        ruling: trainingRuling(`training-ruling-${turnIndex}`),
        playerText: "I train my strength with a demanding conditioning drill.",
      },
      rulebookVersion: 1,
      createdAt: turnIndex,
    }));
    const current = trainingRuling("training-ruling-30");
    const proposal: AttributeAdvancementProposal = {
      characterId: "kestrel",
      attributeId: "str",
      source: "sustained_training",
      delta: 1,
      evidenceRefs: [
        "training-event-20",
        "training-event-24",
        current.turnId,
      ],
      rationale: "Strength training was sustained across three distinct turns.",
    };
    const complete = vi.fn().mockResolvedValue({
      content: JSON.stringify({ proposal }),
      finishReason: "stop",
    });

    const result = await determineAttributeAdvancements(
      { complete, bindingFor: vi.fn(), stream: vi.fn() } as unknown as Router,
      {
        events: { listByStory: vi.fn().mockResolvedValue(historical) },
      } as unknown as Store,
      {
        story,
        playerText: "I continue the demanding strength training drill.",
        rulings: [current],
        turnIndex: 30,
        hardStates: new Map([["kestrel", makePlayer()]]),
      }
    );

    expect(complete).toHaveBeenCalledOnce();
    expect(complete.mock.calls[0]?.[1].user).toContain("training-event-20");
    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]?.denialCodes).not.toContain(
      "insufficient_qualifying_evidence"
    );
    expect(result.decisions[0]?.denialCodes).not.toContain(
      "insufficient_distinct_turns"
    );
  });

  it("asks the DM for an evidence-bound proposal, validates it, and stages hard-state mutation", async () => {
    const schema = makeStory();
    const story: StoryRecord = {
      id: schema.storyId,
      title: schema.title,
      createdAt: 0,
      schema,
      locked: true,
      rulebookVersion: 1,
    };
    const fixture = approvedExceptionalFixture(story);
    const complete = vi.fn().mockResolvedValue({
      content: JSON.stringify({ proposal: fixture.proposal }),
      finishReason: "stop",
    });
    const router = {
      complete,
      bindingFor: vi.fn(),
      stream: vi.fn(),
    } as unknown as Router;
    const store = {
      events: {
        listByStory: vi.fn().mockResolvedValue([]),
      },
    } as unknown as Store;

    const result = await determineAttributeAdvancements(router, store, {
      story,
      playerText:
        "I brace under the collapsing gate and hold it until the last villagers escape.",
      rulings: [fixture.ruling],
      turnIndex: 30,
      hardStates: new Map([
        ["kestrel", makePlayer({ attributes: { str: 10, dex: 12 } })],
      ]),
    });

    expect(complete).toHaveBeenCalledOnce();
    expect(complete.mock.calls[0]?.[1].user).toContain(fixture.ruling.turnId);
    expect(complete.mock.calls[0]?.[1].user).toContain("hold_collapsing_gate");
    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]?.approved).toBe(true);
    expect(result.hardStates.get("kestrel")?.attributes.str).toBe(11);
  });

  it("persists an approved decision as an idempotent structured audit event", async () => {
    const schema = makeStory();
    const story: StoryRecord = {
      id: schema.storyId,
      title: schema.title,
      createdAt: 0,
      schema,
      locked: true,
      rulebookVersion: 2,
    };
    const { decision } = approvedExceptionalFixture(story);
    const insert = vi.fn().mockResolvedValue(undefined);
    const store = { events: { insert } } as unknown as Store;

    await recordAttributeAdvancementDecision(
      store,
      story,
      "narrator-message",
      30,
      decision
    );

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: `attribute-advancement:${decision.proposalKey}`,
        storyId: story.id,
        messageId: "narrator-message",
        turnIndex: 30,
        actorId: "kestrel",
        kind: "attribute_advanced",
        payload: { decision },
        rulebookVersion: 2,
      })
    );
  });

  it("places approved and denied verdicts in the narrator's immutable ruling block", async () => {
    const store = await openStore(":memory:");
    try {
      const schema = makeStory();
      const story: StoryRecord = {
        id: schema.storyId,
        title: schema.title,
        createdAt: 0,
        schema,
        locked: true,
      };
      await store.stories.insert(story);
      const fixture = approvedExceptionalFixture(story);
      const denied: AttributeAdvancementDecision = {
        ...fixture.decision,
        approved: false,
        scoreAfter: fixture.decision.scoreBefore,
        denialCodes: ["cooldown_active"],
        denialReasons: ["This attribute advanced too recently."],
      };
      const assembled = await assembleContext(store, {
        storyId: story.id,
        schema,
        rulings: [],
        attributeAdvancements: [fixture.decision, denied],
        presentIds: [],
        playerText: "I catch my breath.",
      });

      expect(assembled.user).toContain("ATTRIBUTE RULING:");
      expect(assembled.user).toContain("APPROVED by framework policy");
      expect(assembled.user).toContain("DENIED");
      expect(assembled.user).toContain("Do not imply that the attribute changed");
    } finally {
      await store.close();
    }
  });
});
