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

describe("memory bridge Primary provider routing", () => {
  it("moves recommended roles with Primary and preserves explicit bindings", async () => {
    const bridge = makeMemoryBridge();
    await bridge.setProviderConfig("electronhub", { apiKey: "eh-key" });

    const initial = await bridge.getRoleMap();
    expect(Object.values(initial).every((binding) => binding.provider === "electronhub")).toBe(true);

    await bridge.setRoleMap({
      ...initial,
      narrator: {
        ...initial.narrator,
        provider: "openrouter",
        source: "custom",
      },
    });
    await bridge.setProviderConfig("nanogpt", { apiKey: "ng-key" });
    await bridge.setPrimaryProvider("nanogpt");

    const updated = await bridge.getRoleMap();
    expect(updated.narrator.provider).toBe("openrouter");
    for (const [role, binding] of Object.entries(updated)) {
      if (role !== "narrator") expect(binding.provider).toBe("nanogpt");
    }
  });
});

describe("memory bridge starting possessions", () => {
  it("installs only card/persona gear and assigns compatible slots", async () => {
    const bridge = makeMemoryBridge();
    const created = await bridge.createStory({
      storyId: "starting-gear",
      title: "The Ranger",
      premise: "A ranger crosses the old border.",
      playerName: "Ari",
      statMode: "none",
      sourceCard: {
        spec: "chara_card_v2",
        specVersion: "2.0",
        data: {
          name: "Border Story",
          description: "The protagonist carries a silver pistol.",
          personality: "",
          scenario: "",
          first_mes: "",
          mes_example: "",
          tags: [],
          alternate_greetings: [],
        },
      },
      persona: {
        id: "persona-ranger",
        name: "Ari",
        description: "A ranger carrying a longbow and wearing a green cloak.",
      },
    });

    const inventory = await bridge.getCharacterInventory(created.playerCharacterId);
    expect(inventory.definitions.map((definition) => definition.name)).toEqual(
      expect.arrayContaining(["Pistol", "Longbow", "Protective Clothing"])
    );
    expect(inventory.definitions).toHaveLength(3);
    expect(inventory.instances).toHaveLength(3);
    expect(new Set(inventory.assignments.map((assignment) => assignment.slot)).size)
      .toBe(inventory.assignments.length);
    expect(inventory.assignments.length).toBeLessThanOrEqual(7);
    expect(created.story.schema.items).toEqual([]);
  });
});
