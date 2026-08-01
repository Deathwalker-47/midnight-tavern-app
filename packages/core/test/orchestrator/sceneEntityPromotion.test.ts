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

  it("keeps Cyraeth pronouns and ordinal transitions out while retaining the actual creature", () => {
    const found = discoverNarratedSceneEntities({
      storyId: "story-1",
      schema: makeStory(),
      recentNarration: [
        "It stood on four legs and studied the clearing. The creature snuffled at the base of a different tree. Third, and perhaps most immediately useful, that the creature had left tracks.",
      ],
      roster: [],
    });

    expect(found.map((candidate) => candidate.name)).toEqual(["Creature"]);
  });

  it("registers each concrete village actor without turning He into another character", () => {
    const found = discoverNarratedSceneEntities({
      storyId: "story-1",
      schema: makeStory(),
      recentNarration: [
        "A younger man with a bow — not yet drawn but arrow nocked with practiced ease — stepped onto his threshold. An older woman appeared clutching a shawl, her other hand resting on the head of a large dog that looked reptilian. Daen lowered his makeshift weapon. He studied you more carefully now.",
      ],
      roster: [],
    });

    expect(found.map((candidate) => candidate.name).sort()).toEqual([
      "Daen",
      "Large dog",
      "Older woman",
      "Younger man",
    ]);
  });

  it("checks every caller-bounded recent narration entry when repairing missed actors", () => {
    const found = discoverNarratedSceneEntities({
      storyId: "story-1",
      schema: makeStory(),
      recentNarration: [
        "The creature lifted its head and loped into the undergrowth.",
        "The road climbed west through the quiet hills.",
        "Moonlight silvered the empty pasture.",
      ],
      roster: [],
    });

    expect(found).toEqual([
      expect.objectContaining({ name: "Creature", present: false }),
    ]);
  });

  it("does not register actor-shaped figures depicted by scenery", () => {
    const found = discoverNarratedSceneEntities({
      storyId: "story-1",
      schema: makeStory(),
      recentNarration: [
        "A mural showed a younger man with a bow who stepped into a painted grove. A statue of an older woman appeared beside the altar.",
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

  it("enriches the contextually identified provisional human when several are present", () => {
    const youngerId = "story-1:scene:younger-man";
    const olderId = "story-1:scene:older-woman";
    const found = discoverNarratedSceneEntities({
      storyId: "story-1",
      schema: makeStory(),
      recentNarration: [
        'The older woman waits by the door. The younger man lowers his bow. "I am Ewan," he said.',
      ],
      roster: [
        {
          id: youngerId,
          storyId: "story-1",
          name: "Younger man",
          isPlayer: false,
          present: true,
          hard: makeEnemy({ characterId: youngerId }),
        },
        {
          id: olderId,
          storyId: "story-1",
          name: "Older woman",
          isPlayer: false,
          present: true,
          hard: makeEnemy({ characterId: olderId }),
        },
      ],
    });

    expect(found).toEqual([
      {
        id: youngerId,
        name: "Ewan",
        skillIds: ["silver_tongue", "lockpicking", "blade"],
      },
    ]);
  });

  it("treats a narrative name explanation as an alias of an existing named villager", () => {
    const daenId = "story-1:scene:daen";
    const found = discoverNarratedSceneEntities({
      storyId: "story-1",
      schema: makeStory(),
      recentNarration: [
        'The first man raised his lantern. "Daen," the archer warned. Daen \u2014 apparently the first man\'s name \u2014 lowered his weapon.',
      ],
      roster: [
        {
          id: daenId,
          storyId: "story-1",
          name: "Daen",
          isPlayer: false,
          present: true,
          hard: makeEnemy({ characterId: daenId }),
        },
      ],
    });

    expect(found.map(({ id, name, aliases }) => ({ id, name, aliases }))).toEqual([
      {
        id: daenId,
        name: "Daen",
        aliases: ["first man"],
      },
    ]);
  });

  it("enriches overlapping provisional villagers from appositive and vocative name reveals", () => {
    const youngerId = "story-1:scene:younger-man";
    const olderId = "story-1:scene:older-woman";
    const womanId = "story-1:scene:woman";
    const found = discoverNarratedSceneEntities({
      storyId: "story-1",
      schema: makeStory(),
      recentNarration: [
        'The younger man \u2014 Daenin, apparently some relation \u2014 shook his head. The older woman drew closer. "He does not smell like blood," the woman said. "That does not mean he is safe, Mera." Daenin still had not lowered his bow.',
      ],
      roster: [
        {
          id: youngerId,
          storyId: "story-1",
          name: "Younger man",
          isPlayer: false,
          present: true,
          hard: makeEnemy({ characterId: youngerId }),
        },
        {
          id: olderId,
          storyId: "story-1",
          name: "Older woman",
          isPlayer: false,
          present: true,
          hard: makeEnemy({ characterId: olderId }),
        },
        {
          id: womanId,
          storyId: "story-1",
          name: "Woman",
          isPlayer: false,
          present: true,
          hard: makeEnemy({ characterId: womanId }),
        },
      ],
    });

    expect(found.map(({ id, name, aliases }) => ({ id, name, aliases }))).toEqual([
      {
        id: youngerId,
        name: "Daenin",
        aliases: ["younger man"],
      },
      {
        id: olderId,
        name: "Mera",
        aliases: ["older woman", "woman"],
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
