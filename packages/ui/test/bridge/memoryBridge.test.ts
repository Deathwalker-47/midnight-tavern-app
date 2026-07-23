import { describe, expect, it } from "vitest";
import { makeMemoryBridge } from "../../src/bridge/core";

describe("memory bridge lorebook hierarchy", () => {
  it("installs a new story's lore as a selectable attached lorebook", async () => {
    const bridge = makeMemoryBridge();

    await bridge.createStory({
      storyId: "story-lore",
      title: "Ashen Vale",
      premise: "A road under falling ash.",
      playerName: "Kestrel",
      statMode: "none",
      lorebookSeeds: [
        {
          keys: ["ash", "vale"],
          content: "The ash remembers every footstep.",
          enabled: true,
        },
      ],
    });

    expect(await bridge.listLorebooks()).toEqual([
      expect.objectContaining({
        id: "story-lore",
        name: "Ashen Vale lore",
        entryCount: 1,
        attachmentCount: 1,
      }),
    ]);
    expect(await bridge.listAttachedLorebooks("story-lore")).toEqual([
      expect.objectContaining({ id: "story-lore", linkEnabled: true }),
    ]);
    expect(await bridge.listLorebookEntries("story-lore")).toEqual([
      expect.objectContaining({
        lorebookId: "story-lore",
        keys: ["ash", "vale"],
      }),
    ]);
  });
});
