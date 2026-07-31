import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deriveRecentPlayerTargetId } from "../../src/orchestrator/targetFocus.js";
import { openStore, type Store } from "../../src/store/index.js";
import { makeEnemy, makePlayer, makeStory } from "../fixtures.js";

describe("deriveRecentPlayerTargetId", () => {
  let store: Store;

  beforeEach(async () => {
    store = await openStore(":memory:");
    const schema = makeStory({ storyId: "story" });
    await store.stories.insert({ id: "story", title: schema.title, createdAt: 0, schema, locked: true });
    await store.characters.insert({
      id: "player",
      storyId: "story",
      name: "Player",
      isPlayer: true,
      hard: makePlayer({ characterId: "player" }),
    });
    for (const [id, name] of [["old", "Old foe"], ["current", "Current foe"]] as const) {
      await store.characters.insert({
        id,
        storyId: "story",
        name,
        isPlayer: false,
        hard: makeEnemy({ characterId: id }),
      });
    }
  });

  afterEach(async () => {
    await store.close();
  });

  async function ruling(id: string, turnIndex: number, targetId: string, messageId: string) {
    if (!(await store.messages.get(messageId))) {
      await store.messages.insert({
        id: messageId,
        storyId: "story",
        idx: turnIndex,
        role: "narrator",
        content: "A prior ruling was narrated.",
        createdAt: turnIndex * 10,
      });
    }
    await store.events.insert({
      id,
      storyId: "story",
      messageId,
      turnIndex,
      actorId: "player",
      kind: "roll",
      payload: {
        ruling: {
          actorId: "player",
          targetId,
          actionId: "attack_melee",
          gate: { allowed: true },
          roll: { outcome: "success" },
        },
      },
      rulebookVersion: 1,
      createdAt: turnIndex * 10,
    });
  }

  it("keeps one target used by multiple allowed actions in the newest recent turn", async () => {
    await ruling("strike-1", 4, "current", "narrator-4");
    await ruling("strike-2", 4, "current", "narrator-4");
    const present = await store.characters.listPresentByStory("story");

    expect(
      await deriveRecentPlayerTargetId(store, "story", present, new Set(["narrator-4"]))
    ).toBe("current");
  });

  it("fails closed for multiple targets in the newest turn", async () => {
    await ruling("strike-old", 3, "current", "narrator-3");
    await ruling("strike-a", 4, "current", "narrator-4");
    await ruling("strike-b", 4, "old", "narrator-4");
    const present = await store.characters.listPresentByStory("story");

    expect(
      await deriveRecentPlayerTargetId(store, "story", present, new Set(["narrator-4"]))
    ).toBeUndefined();
  });

  it("does not fall back to an older target when the newest target is dead or absent", async () => {
    await ruling("older", 3, "old", "narrator-3");
    await ruling("newer", 4, "current", "narrator-4");
    const current = (await store.characters.get("current"))!;
    await store.characters.updateHard("current", { ...current.hard, alive: false });
    let present = await store.characters.listPresentByStory("story");
    expect(
      await deriveRecentPlayerTargetId(
        store,
        "story",
        present,
        new Set(["narrator-3", "narrator-4"])
      )
    ).toBeUndefined();

    await store.characters.updateHard("current", { ...current.hard, alive: true });
    await store.characters.setPresent("current", false);
    present = await store.characters.listPresentByStory("story");
    expect(
      await deriveRecentPlayerTargetId(
        store,
        "story",
        present,
        new Set(["narrator-3", "narrator-4"])
      )
    ).toBeUndefined();
  });

  it("ignores a targeted ruling outside the bounded recent transcript window", async () => {
    await ruling("stale", 1, "current", "narrator-1");
    const present = await store.characters.listPresentByStory("story");

    expect(
      await deriveRecentPlayerTargetId(store, "story", present, new Set(["narrator-9"]))
    ).toBeUndefined();
  });
});
