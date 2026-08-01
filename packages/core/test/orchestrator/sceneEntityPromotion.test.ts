import { describe, expect, it } from "vitest";
import { discoverNarratedSceneEntities } from "../../src/orchestrator/sceneEntityPromotion.js";
import { makeEnemy, makeStory } from "../fixtures.js";

describe("discoverNarratedSceneEntities", () => {
  it("does not promote sentence-initial quantifiers into characters", () => {
    const found = discoverNarratedSceneEntities({
      storyId: "story-1",
      schema: makeStory(),
      recentNarration: [
        "Nothing moves in the vast quiet. Something watches from beyond the gate.",
      ],
      roster: [],
    });

    expect(found).toEqual([]);
  });

  it("still promotes a genuinely named narrated actor", () => {
    const found = discoverNarratedSceneEntities({
      storyId: "story-1",
      schema: makeStory(),
      recentNarration: ["Ashara steps from the ruined arch and speaks."],
      roster: [],
    });

    expect(found).toEqual([
      {
        id: "story-1:scene:ashara",
        name: "Ashara",
        skillIds: ["silver_tongue", "lockpicking", "blade"],
      },
    ]);
  });

  it("recognizes a named actor with an appositive description and gives it sealed usable skills", () => {
    const found = discoverNarratedSceneEntities({
      storyId: "story-1",
      schema: makeStory(),
      recentNarration: [
        "Marta Hearthwright, a broad-shouldered innkeeper in a flour-dusted apron, steps into the road and says she can help.",
      ],
      roster: [],
    });

    expect(found).toEqual([
      {
        id: "story-1:scene:marta-hearthwright",
        name: "Marta Hearthwright",
        skillIds: ["silver_tongue", "lockpicking", "blade"],
      },
    ]);
  });

  it("promotes concrete unnamed and named actors written with ordinary past-tense narration", () => {
    const found = discoverNarratedSceneEntities({
      storyId: "story-1",
      schema: makeStory(),
      recentNarration: [
        'The man called from the farmhouse. "Bess here does not bite," he said. Bess made a low sound, and the man glanced down at her.',
      ],
      roster: [],
    });

    expect(found.map((candidate) => candidate.name).sort()).toEqual(["Bess", "Man"]);
  });

  it("repairs recent prose-only history with revealed identities instead of creating a duplicate Man", () => {
    const found = discoverNarratedSceneEntities({
      storyId: "story-1",
      schema: makeStory(),
      recentNarration: [
        'The man called from the farmhouse. "Bess here does not bite," he said. Bess made a low sound.',
        'Bram repeated your name. "I am Bram Kelder. This is Bess," he said.',
      ],
      roster: [],
    });

    expect(found.map((candidate) => candidate.name).sort()).toEqual(["Bess", "Bram Kelder"]);
  });

  it("enriches one existing generic man with his revealed name rather than adding a second person", () => {
    const genericId = "story-1:scene:man";
    const found = discoverNarratedSceneEntities({
      storyId: "story-1",
      schema: makeStory(),
      recentNarration: ['Bram repeated your name. "I am Bram Kelder. This is Bess," he said.'],
      roster: [
        {
          id: genericId,
          storyId: "story-1",
          name: "Man",
          isPlayer: false,
          present: true,
          hard: makeEnemy({ characterId: genericId }),
        },
        {
          id: "story-1:scene:bess",
          storyId: "story-1",
          name: "Bess",
          isPlayer: false,
          present: true,
          hard: makeEnemy({ characterId: "story-1:scene:bess" }),
        },
      ],
    });

    expect(found).toEqual([
      {
        id: genericId,
        name: "Bram Kelder",
        skillIds: ["silver_tongue", "lockpicking", "blade"],
      },
    ]);
  });

  it("does not rename a generic NPC when narration repeats the player's own introduction", () => {
    const genericId = "story-1:scene:man";
    const found = discoverNarratedSceneEntities({
      storyId: "story-1",
      schema: makeStory(),
      recentNarration: ['"I am Kestrel," you say. The man watches in silence.'],
      roster: [
        {
          id: "kestrel",
          storyId: "story-1",
          name: "Kestrel",
          isPlayer: true,
          present: true,
          hard: makeEnemy({ characterId: "kestrel" }),
        },
        {
          id: genericId,
          storyId: "story-1",
          name: "Man",
          isPlayer: false,
          present: true,
          hard: makeEnemy({ characterId: genericId }),
        },
      ],
    });

    expect(found).toEqual([]);
  });
});
