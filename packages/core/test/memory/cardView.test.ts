import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getLivingCard } from "../../src/memory/cardView.js";
import { openStore, type Store } from "../../src/store/index.js";
import type { StoryRecord } from "../../src/types/index.js";
import { makePlayer, makeStory } from "../fixtures.js";

const STORY_ID = "living-card-xp";

describe("getLivingCard skill progression", () => {
  let store: Store;
  let story: StoryRecord;

  beforeEach(async () => {
    store = await openStore(":memory:");
    story = {
      id: STORY_ID,
      title: "XP Story",
      createdAt: 1,
      schema: makeStory({ storyId: STORY_ID, locked: true }),
      locked: true,
    };
    await store.stories.insert(story);
    await store.characters.insert({
      id: "player",
      storyId: STORY_ID,
      name: "Kestrel",
      isPlayer: true,
      hard: makePlayer({
        characterId: "player",
        skills: [{ skillId: "blade", rank: "adept", successCount: 99, xp: 145 }],
      }),
    });
    await store.events.insert({
      id: "xp-award",
      storyId: STORY_ID,
      turnIndex: 12,
      actorId: "player",
      kind: "xp",
      payload: {
        award: {
          skillId: "blade",
          amount: 15,
          previousXp: 130,
          newXp: 145,
          rankBefore: "novice",
          rankAfter: "adept",
          reason: "Critical success against a difficult foe.",
        },
      },
      rulebookVersion: 1,
      createdAt: 1200,
    });
  });

  afterEach(async () => {
    await store.close();
  });

  it("projects configured XP thresholds and the newest persisted award, not success counts", async () => {
    const card = await getLivingCard(store, story.schema, "player");
    const blade = card?.skills.find((skill) => skill.skillId === "blade");

    expect(blade).toMatchObject({
      name: "Blade",
      definition: "Swordplay.",
      tier: "common",
      rank: "adept",
      successCount: 99,
      xp: 145,
      nextRankXp: 300,
      toNext: 155,
      latestAward: {
        xp: 15,
        reason: "Critical success against a difficult foe.",
        turnIdx: 12,
        rankUp: { from: "novice", to: "adept" },
      },
    });
  });
});
