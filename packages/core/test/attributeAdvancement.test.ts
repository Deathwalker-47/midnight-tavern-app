import { describe, expect, it } from "vitest";
import {
  applyAttributeAdvancement,
  attributeAdvancementBandForScore,
  attributeAdvancementProposalKey,
  clampAttribute,
  evaluateAttributeAdvancement,
  maximumAttributeScore,
  type AttributeAdvancementEvidence,
  type AttributeAdvancementProposal,
  type AttributeAdvancementSource,
  type PriorAttributeAdvancement,
} from "../src/index.js";
import { makePlayer, makeStory } from "./fixtures.js";

function proposal(
  source: AttributeAdvancementSource,
  evidenceRefs: string[],
  overrides: Partial<AttributeAdvancementProposal> = {}
): AttributeAdvancementProposal {
  return {
    characterId: "kestrel",
    attributeId: "str",
    source,
    delta: source === "curse_or_trauma" ? -1 : 1,
    evidenceRefs,
    rationale: "Persisted rulings demonstrate meaningful change.",
    ...overrides,
  };
}

function rulingEvidence(
  id: string,
  turnIndex: number,
  source: AttributeAdvancementSource,
  overrides: Partial<AttributeAdvancementEvidence> = {}
): AttributeAdvancementEvidence {
  return {
    id,
    rulingId: id,
    turnIndex,
    characterId: "kestrel",
    attributeId: "str",
    kind: "successful_ruling",
    actionId: "tested_action",
    actionLabel: "Tested action",
    highStakes: false,
    materialChange: true,
    difficultyDc: 12,
    qualifyingSources: [source],
    ...overrides,
  };
}

function evaluate(
  candidate: AttributeAdvancementProposal,
  evidence: AttributeAdvancementEvidence[],
  score = 10,
  prior: PriorAttributeAdvancement[] = [],
  currentTurnIndex = 30,
  superhuman = false
) {
  const base = makeStory();
  const schema = superhuman
    ? makeStory({
        attributes: base.attributes.map((attribute) =>
          attribute.id === "str"
            ? {
                ...attribute,
                superhuman: true,
                maximumScore: 30,
              }
            : attribute
        ),
      })
    : base;
  return evaluateAttributeAdvancement(candidate, {
    storyId: schema.storyId,
    schema,
    character: makePlayer({ attributes: { str: score, dex: 12 } }),
    currentTurnIndex,
    evidence,
    prior,
  });
}

function findApproved(
  source: AttributeAdvancementSource,
  score: number,
  evidenceFactory: (suffix: string) => AttributeAdvancementEvidence[],
  superhuman = false
) {
  for (let index = 0; index < 500; index++) {
    const evidence = evidenceFactory(String(index));
    const candidate = proposal(
      source,
      evidence.map((item) => item.id)
    );
    const decision = evaluate(candidate, evidence, score, [], 30, superhuman);
    if (decision.approved) return decision;
  }
  throw new Error("Could not find an approved deterministic proposal fixture.");
}

describe("attribute advancement policy", () => {
  it("maps every requested score band to an increasingly difficult DC", () => {
    expect(
      [1, 5, 6, 9, 10, 13, 14, 17, 18, 19].map(
        (score) => attributeAdvancementBandForScore(score).id
      )
    ).toEqual([
      "easy",
      "easy",
      "normal",
      "normal",
      "moderate",
      "moderate",
      "hard",
      "hard",
      "near_impossible",
      "near_impossible",
    ]);
    expect([1, 6, 10, 14, 18].map((score) => attributeAdvancementBandForScore(score).dc)).toEqual([
      8,
      12,
      16,
      20,
      24,
    ]);
  });

  it("rejects a routine single action and prose-only/missing evidence", () => {
    const one = rulingEvidence("one", 30, "repeated_high_stakes_use");
    const routine = evaluate(
      proposal("repeated_high_stakes_use", [one.id]),
      [one]
    );
    expect(routine.approved).toBe(false);
    expect(routine.denialCodes).toContain("insufficient_qualifying_evidence");

    const missing = evaluate(
      proposal("transformation", ["narrator-only-claim"]),
      []
    );
    expect(missing.denialCodes).toContain("missing_evidence");
  });

  it("requires sustained training across distinct turns with meaningful span", () => {
    const farmed = [1, 2, 3].map((index) =>
      rulingEvidence(`farm-${index}`, 30, "sustained_training")
    );
    const farmedDecision = evaluate(
      proposal(
        "sustained_training",
        farmed.map((item) => item.id)
      ),
      farmed
    );
    expect(farmedDecision.denialCodes).toContain("insufficient_distinct_turns");
    expect(farmedDecision.denialCodes).toContain("insufficient_turn_span");

    const trained = [20, 24, 30].map((turn) =>
      rulingEvidence(`training-${turn}`, turn, "sustained_training")
    );
    const trainedDecision = evaluate(
      proposal(
        "sustained_training",
        trained.map((item) => item.id)
      ),
      trained
    );
    expect(trainedDecision.denialCodes).not.toContain(
      "insufficient_qualifying_evidence"
    );
    expect(trainedDecision.denialCodes).not.toContain("insufficient_distinct_turns");
    expect(trainedDecision.denialCodes).not.toContain("insufficient_turn_span");
  });

  it("requires repeated use to be successful, direct, distinct, and high-stakes", () => {
    const uses = [20, 25, 30].map((turn, index) =>
      rulingEvidence(`use-${turn}`, turn, "repeated_high_stakes_use", {
        highStakes: index > 0,
        difficultyDc: index > 0 ? 16 : 12,
      })
    );
    const decision = evaluate(
      proposal(
        "repeated_high_stakes_use",
        uses.map((item) => item.id)
      ),
      uses
    );
    expect(decision.denialCodes).not.toContain("insufficient_high_stakes_evidence");
    expect(decision.denialCodes).not.toContain("evidence_wrong_attribute");

    const wrongAttribute = uses.map((item) => ({ ...item, attributeId: "dex" }));
    expect(
      evaluate(
        proposal(
          "repeated_high_stakes_use",
          wrongAttribute.map((item) => item.id)
        ),
        wrongAttribute
      ).denialCodes
    ).toContain("evidence_wrong_attribute");
  });

  it("allows one exceptional action only when it is direct, high-DC and scene-changing", () => {
    const weak = rulingEvidence("weak", 30, "exceptional_action", {
      highStakes: true,
      materialChange: false,
      difficultyDc: 17,
    });
    expect(
      evaluate(proposal("exceptional_action", [weak.id]), [weak]).denialCodes
    ).toContain("evidence_does_not_support_source");

    const exceptional = rulingEvidence("exceptional", 30, "exceptional_action", {
      highStakes: true,
      materialChange: true,
      difficultyDc: 18,
    });
    const decision = evaluate(
      proposal("exceptional_action", [exceptional.id]),
      [exceptional]
    );
    expect(decision.denialCodes).not.toContain("evidence_does_not_support_source");
    expect(decision.denialCodes).not.toContain("insufficient_high_stakes_evidence");
  });

  it("requires a milestone plus an attribute-bearing successful ruling", () => {
    const milestone: AttributeAdvancementEvidence = {
      id: "milestone-event",
      eventId: "milestone-event",
      turnIndex: 29,
      kind: "milestone",
      highStakes: true,
      materialChange: true,
      qualifyingSources: ["milestone"],
    };
    const action = rulingEvidence("milestone-action", 30, "milestone", {
      highStakes: true,
      difficultyDc: 16,
    });
    const decision = evaluate(
      proposal("milestone", [milestone.id, action.id]),
      [milestone, action]
    );
    expect(decision.denialCodes).not.toContain(
      "insufficient_qualifying_evidence"
    );
    expect(decision.denialCodes).not.toContain("insufficient_distinct_turns");
  });

  it("enforces ordinary and explicit superhuman caps", () => {
    const evidence = rulingEvidence("transform", 30, "transformation", {
      highStakes: true,
      difficultyDc: 18,
    });
    expect(
      evaluate(proposal("transformation", [evidence.id]), [evidence], 20)
        .denialCodes
    ).toContain("ordinary_cap_reached");

    const repeated = rulingEvidence("repeat-over-20", 30, "repeated_high_stakes_use", {
      highStakes: true,
      difficultyDc: 18,
    });
    expect(
      evaluate(
        proposal("repeated_high_stakes_use", [repeated.id]),
        [repeated],
        20,
        [],
        30,
        true
      ).denialCodes
    ).toContain("superhuman_not_authorized");

    const approved = findApproved(
      "transformation",
      20,
      (suffix) => [
        rulingEvidence(`superhuman-${suffix}`, 30, "transformation", {
          highStakes: true,
          difficultyDc: 18,
        }),
      ],
      true
    );
    expect(approved.scoreAfter).toBe(21);

    expect(
      evaluate(
        proposal("transformation", [evidence.id]),
        [evidence],
        30,
        [],
        30,
        true
      ).denialCodes
    ).toContain("maximum_reached");
  });

  it("supports only a -1 lasting curse mutation", () => {
    const approved = findApproved("curse_or_trauma", 10, (suffix) => [
      rulingEvidence(`curse-${suffix}`, 30, "curse_or_trauma", {
        highStakes: true,
        difficultyDc: 18,
      }),
    ]);
    const changed = applyAttributeAdvancement(
      makePlayer({ attributes: { str: 10, dex: 12 } }),
      approved
    );
    expect(changed.attributes.str).toBe(9);

    const evidence = rulingEvidence("bad-curse", 30, "curse_or_trauma");
    const invalid = evaluate(
      proposal("curse_or_trauma", [evidence.id], { delta: 1 }),
      [evidence]
    );
    expect(invalid.denialCodes).toContain("invalid_delta");
  });

  it("enforces cooldown, rolling limits, and proposal idempotency", () => {
    const evidence = rulingEvidence("blessing", 30, "blessing", {
      highStakes: true,
      difficultyDc: 18,
    });
    const candidate = proposal("blessing", [evidence.id]);
    const key = attributeAdvancementProposalKey(makeStory().storyId, candidate);
    expect(
      evaluate(candidate, [evidence], 10, [
        {
          proposalKey: "recent-other",
          characterId: "kestrel",
          attributeId: "str",
          turnIndex: 25,
          delta: 1,
          approved: true,
        },
      ]).denialCodes
    ).toContain("cooldown_active");

    expect(
      evaluate(candidate, [evidence], 10, [
        {
          proposalKey: "first",
          characterId: "kestrel",
          attributeId: "dex",
          turnIndex: 5,
          delta: 1,
          approved: true,
        },
        {
          proposalKey: "second",
          characterId: "kestrel",
          attributeId: "dex",
          turnIndex: 20,
          delta: 1,
          approved: true,
        },
      ]).denialCodes
    ).toContain("advancement_limit_reached");

    expect(
      evaluate(candidate, [evidence], 10, [
        {
          proposalKey: key,
          characterId: "kestrel",
          attributeId: "str",
          turnIndex: 30,
          delta: 1,
          approved: false,
        },
      ]).denialCodes
    ).toContain("duplicate_proposal");
  });

  it("exposes the effective chance implied by DC and evidence modifier", () => {
    const chances = [1, 6, 10, 14, 18].map((score) => {
      const evidence = rulingEvidence(`transform-${score}`, 30, "transformation");
      return evaluate(
        proposal("transformation", [evidence.id]),
        [evidence],
        score
      ).effectiveChancePercent;
    });
    expect(chances).toEqual([95, 75, 55, 35, 15]);
  });

  it("rejects unknown and locked subjects plus stale or mismatched evidence", () => {
    const base = makeStory();
    const lockedSchema = makeStory({
      attributes: base.attributes.map((attribute) =>
        attribute.id === "str"
          ? { ...attribute, defaultScore: 0, lockedAtZero: true }
          : attribute
      ),
    });
    const evidence = rulingEvidence("mismatch", 1, "blessing", {
      characterId: "other",
      qualifyingSources: ["transformation"],
    });
    const unknownCharacter = evaluateAttributeAdvancement(
      proposal("blessing", [evidence.id], { characterId: "missing" }),
      {
        storyId: base.storyId,
        schema: base,
        character: undefined,
        currentTurnIndex: 100,
        evidence: [evidence],
        prior: [],
      }
    );
    expect(unknownCharacter.denialCodes).toContain("unknown_character");
    expect(unknownCharacter.denialCodes).toContain("evidence_not_recent");

    const unknownAttribute = evaluateAttributeAdvancement(
      proposal("blessing", [evidence.id], { attributeId: "unknown" }),
      {
        storyId: base.storyId,
        schema: base,
        character: makePlayer(),
        currentTurnIndex: 30,
        evidence: [evidence],
        prior: [],
      }
    );
    expect(unknownAttribute.scoreBefore).toBe(0);
    expect(unknownAttribute.denialCodes).toContain("unknown_attribute");
    expect(unknownAttribute.denialCodes).toContain("evidence_wrong_character");
    expect(unknownAttribute.denialCodes).toContain("evidence_does_not_support_source");

    const wrongSource = rulingEvidence("wrong-source", 30, "transformation", {
      qualifyingSources: ["transformation"],
    });
    expect(
      evaluate(proposal("blessing", [wrongSource.id]), [wrongSource]).denialCodes
    ).toContain("evidence_does_not_support_source");

    const locked = evaluateAttributeAdvancement(
      proposal("blessing", [evidence.id]),
      {
        storyId: lockedSchema.storyId,
        schema: lockedSchema,
        character: makePlayer(),
        currentTurnIndex: 30,
        evidence: [evidence],
        prior: [],
      }
    );
    expect(locked.denialCodes).toContain("attribute_locked");

    const exceptionalWithoutDc = rulingEvidence(
      "exceptional-no-dc",
      30,
      "exceptional_action",
      { highStakes: true, materialChange: true, difficultyDc: undefined }
    );
    expect(
      evaluate(
        proposal("exceptional_action", [exceptionalWithoutDc.id]),
        [exceptionalWithoutDc]
      ).denialCodes
    ).toContain("evidence_does_not_support_source");
  });

  it("does not apply denied decisions or an approved decision to another character", () => {
    const hard = makePlayer({ attributes: { str: 10, dex: 12 } });
    const evidence = rulingEvidence("denied-apply", 30, "transformation");
    const denied = evaluate(
      proposal("transformation", [evidence.id]),
      [evidence],
      30
    );
    expect(applyAttributeAdvancement(hard, denied)).toBe(hard);

    const approved = findApproved("transformation", 10, (suffix) => [
      rulingEvidence(`apply-other-${suffix}`, 30, "transformation"),
    ]);
    const other = makePlayer({ characterId: "other", attributes: { str: 10, dex: 12 } });
    expect(applyAttributeAdvancement(other, approved)).toBe(other);
  });

  it("honors locked and implicit superhuman attribute boundaries", () => {
    expect(
      maximumAttributeScore({
        id: "zero",
        name: "Zero",
        abbrev: "ZER",
        description: "Permanently unavailable.",
        defaultScore: 0,
        lockedAtZero: true,
      })
    ).toBe(0);
    expect(
      maximumAttributeScore({
        id: "mythic",
        name: "Mythic",
        abbrev: "MYT",
        description: "Beyond mortal range.",
        defaultScore: 24,
        superhuman: true,
      })
    ).toBe(24);
    expect(
      clampAttribute(18, {
        id: "zero",
        name: "Zero",
        abbrev: "ZER",
        description: "Permanently unavailable.",
        defaultScore: 0,
        lockedAtZero: true,
      })
    ).toBe(0);
  });
});
