import { describe, expect, it } from "vitest";
import { discoverNarratedSceneEntities } from "../../src/orchestrator/sceneEntityPromotion.js";
import { makeStory } from "../fixtures.js";

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
      },
    ]);
  });
});
