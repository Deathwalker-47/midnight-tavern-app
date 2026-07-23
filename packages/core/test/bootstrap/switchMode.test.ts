import { describe, expect, it } from "vitest";
import type { Router } from "../../src/router/index.js";
import { changeStoryStatMode } from "../../src/bootstrap/index.js";
import { openStore } from "../../src/store/index.js";
import { makePlayer, makeStory } from "../fixtures.js";
import { StorySchemaSchema } from "../../src/types/index.js";

describe("story stat-mode switching", () => {
  it("loads legacy light stories as a pending Full Stats migration, never a third runtime mode", () => {
    const legacy = StorySchemaSchema.parse({ ...makeStory(), statMode: "light" });
    expect(legacy.statMode).toBe("full");
    expect(legacy.legacyStatMode).toBe("light");
    expect(legacy.migrationPending).toBe(true);
  });

  it("pauses and resumes a sealed Full Stats rulebook without rewriting state", async () => {
    const store = await openStore(":memory:");
    const schema = makeStory();
    await store.stories.insert({ id: schema.storyId, title: schema.title, createdAt: 0, schema, locked: true });
    const player = makePlayer();
    await store.characters.insert({
      id: player.characterId,
      storyId: schema.storyId,
      name: "Kestrel",
      isPlayer: true,
      hard: player,
    });
    const before = (await store.characters.get(player.characterId))!.hard;
    const unusedRouter = {} as Router;

    const paused = await changeStoryStatMode(unusedRouter, store, schema.storyId, "none");
    expect(paused.schema.statMode).toBe("none");
    expect(paused.schema.actions).toEqual(schema.actions);
    expect((await store.characters.get(player.characterId))!.hard).toEqual(before);

    const resumed = await changeStoryStatMode(unusedRouter, store, schema.storyId, "full");
    expect(resumed.schema.statMode).toBe("full");
    expect(resumed.schema.actions).toEqual(schema.actions);
    expect((await store.characters.get(player.characterId))!.hard).toEqual(before);
    expect((await store.messages.listByStory(schema.storyId)).map((message) => message.role)).toEqual([
      "system",
      "system",
    ]);
  });
});
