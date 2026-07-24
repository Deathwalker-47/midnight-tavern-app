import { describe, expect, it } from "vitest";
import {
  duplicateAndRegenerateRulebook,
  exportStoryJournalCsv,
  exportStoryJournalMarkdown,
  previewRulebookRegenerationImpact,
  regenerateRulebook,
} from "../../src/orchestrator/index.js";
import { bootstrapStory } from "../../src/bootstrap/index.js";
import { parseCardObject } from "../../src/importer/index.js";
import type { Role, RoleBinding, Router } from "../../src/router/index.js";
import { openStore } from "../../src/store/index.js";
import type { ItemDefinition, ItemInstance } from "../../src/types/index.js";
import { makePlayer, makeStory } from "../fixtures.js";

const inertRouter: Router = {
  bindingFor(_role: Role): RoleBinding {
    return { provider: "openrouter", model: "test", source: "recommended", samplersDirty: false };
  },
  async complete() {
    throw new Error("No model call expected.");
  },
  async stream() {
    throw new Error("No model call expected.");
  },
};

describe("V7 persistence repositories", () => {
  it("preserves the unexpanded card and persona for later rulebook regeneration", async () => {
    const store = await openStore(":memory:");
    const sourceCard = parseCardObject({
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: "Mara",
        description: "{{char}} remembers {{user}}.",
        scenario: "{{user}} reaches the midnight gate.",
      },
    });
    const storyId = "preserved-source";

    const created = await bootstrapStory(
      inertRouter,
      store,
      {
        storyId,
        title: "Preserved source",
        premise: "Import preview",
        statMode: "none",
        sourceCard,
        persona: {
          id: "persona-ari",
          name: "Ari",
          description: "A deliberate investigator.",
        },
      },
      { name: "Ari" }
    );

    expect(created.story.configSnapshot?.creationSource).toMatchObject({
      sourceCard: {
        data: { description: "{{char}} remembers {{user}}." },
      },
      persona: { id: "persona-ari", name: "Ari" },
    });

    const regenerated = await regenerateRulebook(inertRouter, store, storyId, {
      confirmMechanicalReset: true,
      statMode: "none",
    });
    expect(regenerated.configSnapshot?.creationSource).toMatchObject({
      sourceCard: {
        data: { description: "{{char}} remembers {{user}}." },
      },
      persona: { id: "persona-ari", name: "Ari" },
    });
  });

  it("installs only card/persona starting possessions in runtime inventory", async () => {
    const store = await openStore(":memory:");
    const sourceCard = parseCardObject({
      spec: "chara_card_v2",
      spec_version: "2.0",
      data: {
        name: "Border Story",
        description: "The protagonist carries a silver pistol.",
      },
    });
    const created = await bootstrapStory(
      inertRouter,
      store,
      {
        storyId: "starting-possessions",
        title: "Starting possessions",
        premise: "A ranger crosses the old border.",
        statMode: "none",
        sourceCard,
        persona: {
          id: "persona-ranger",
          name: "Ari",
          description: "A ranger carrying a longbow and wearing a green cloak.",
        },
      },
      { name: "Ari" }
    );

    const definitions = await store.runtimeItems.listDefinitions(created.story.id);
    const instances = await store.runtimeItems.listInventory(created.playerCharacterId);
    const loadout = await store.runtimeItems.listLoadout(created.playerCharacterId);
    expect(definitions.map((definition) => definition.name)).toEqual(
      expect.arrayContaining(["Silver Pistol", "Longbow", "Green Cloak"])
    );
    expect(definitions).toHaveLength(3);
    expect(instances).toHaveLength(3);
    expect(new Set(loadout.map((assignment) => assignment.slot)).size).toBe(loadout.length);
    expect(loadout.length).toBeLessThanOrEqual(7);
    expect(created.story.schema.items).toEqual([]);
    const player = await store.characters.get(created.playerCharacterId);
    expect(player?.hard.equipment).toHaveLength(loadout.length);
    expect(player?.hard.equipment).toEqual(expect.arrayContaining(loadout));
    await regenerateRulebook(inertRouter, store, created.story.id, {
      confirmMechanicalReset: true,
      statMode: "none",
    });
    expect(
      (await store.runtimeItems.listDefinitions(created.story.id))
        .map((definition) => definition.name)
    ).toEqual(expect.arrayContaining(["Silver Pistol", "Longbow", "Green Cloak"]));
    await store.close();
  });

  it("installs one neutral basic possession when no gear is described", async () => {
    const store = await openStore(":memory:");
    const created = await bootstrapStory(
      inertRouter,
      store,
      {
        storyId: "basic-starting-possession",
        title: "Basic starting possession",
        premise: "A stranger wakes beside the road.",
        statMode: "none",
      },
      { name: "Ari" }
    );
    const definitions = await store.runtimeItems.listDefinitions(created.story.id);
    expect(definitions.map((definition) => definition.name)).toEqual([
      "Basic Personal Effects",
    ]);
    expect(created.story.schema.items).toEqual([]);
    await store.close();
  });

  it("round-trips runtime loot, loadout assignments, operations, and journal events", async () => {
    const store = await openStore(":memory:");
    const schema = makeStory();
    await store.stories.insert({
      id: schema.storyId,
      title: schema.title,
      createdAt: 0,
      schema,
      locked: true,
    });
    const player = makePlayer();
    await store.characters.insert({
      id: player.characterId,
      storyId: schema.storyId,
      name: "Kestrel",
      isPlayer: true,
      hard: player,
    });
    await store.messages.insert({
      id: "player-message",
      storyId: schema.storyId,
      idx: 0,
      role: "player",
      content: "Search the chamber.",
      createdAt: 1,
    });

    const definition: ItemDefinition = {
      id: "runtime-blade",
      storyId: schema.storyId,
      name: "Wightglass Knife",
      description: "A deserved encounter reward.",
      kind: "weapon",
      tier: "rare",
      slotCompatibility: ["primary", "secondary"],
      handsRequired: 1,
      unique: true,
      effects: [{ type: "skill_check", skillId: "blade", amount: 2 }],
      props: { damage: 2 },
      tags: ["wight"],
      createdAt: new Date(1).toISOString(),
      configVersion: 1,
    };
    const instance: ItemInstance = {
      id: "runtime-blade-instance",
      storyId: schema.storyId,
      definitionId: definition.id,
      ownerCharacterId: player.characterId,
      quantity: 1,
      acquiredAt: new Date(2).toISOString(),
      provenance: {
        sourceType: "combat",
        sourceLabel: "Defeated the wight",
        rulingId: "r1",
        turnId: "t1",
        tierBudget: "rare",
        eligibilityReasons: ["Encounter completed"],
        policyVersion: 1,
        grantedAt: new Date(2).toISOString(),
      },
    };
    await store.runtimeItems.insertDefinition(definition);
    await store.runtimeItems.insertInstance(instance);
    await store.runtimeItems.setSlot({
      characterId: player.characterId,
      slot: "primary",
      itemInstanceId: instance.id,
    });
    await store.turnOperations.upsert({
      id: "op1",
      storyId: schema.storyId,
      playerMessageId: "player-message",
      state: "ruling",
      classifierRecovery: {
        policy: "narration_only",
        issues: [
          {
            kind: "no_content",
            message: "The classifier returned no content.",
            retryable: true,
          },
        ],
      },
      createdAt: 1,
      updatedAt: 2,
    });
    await store.events.insert({
      id: "event1",
      storyId: schema.storyId,
      messageId: "player-message",
      turnIndex: 0,
      actorId: player.characterId,
      kind: "item_gained",
      payload: { instanceId: instance.id },
      rulebookVersion: 1,
      createdAt: 2,
    });

    expect(await store.runtimeItems.getDefinition(definition.id)).toEqual(definition);
    expect(await store.runtimeItems.listInventory(player.characterId)).toEqual([instance]);
    expect(await store.runtimeItems.listLoadout(player.characterId)).toEqual([
      {
        characterId: player.characterId,
        slot: "primary",
        itemInstanceId: instance.id,
      },
    ]);
    expect((await store.turnOperations.latestIncomplete(schema.storyId))?.id).toBe("op1");
    expect((await store.turnOperations.get("op1"))?.classifierRecovery).toMatchObject({
      issues: [{ kind: "no_content" }],
    });
    expect((await store.turnOperations.latestRecoverable(schema.storyId))?.id).toBe("op1");
    expect(await store.turnOperations.claimRetry("op1", 2, 3)).toBe(true);
    expect(await store.turnOperations.claimRetry("op1", 2, 4)).toBe(false);
    expect((await store.turnOperations.get("op1"))?.state).toBe("classifying");
    expect((await store.turnOperations.get("op1"))?.classifierRecovery).toBeUndefined();
    expect((await store.events.listByStory(schema.storyId))[0]?.kind).toBe("item_gained");
    const markdown = await exportStoryJournalMarkdown(store, schema.storyId);
    expect(markdown).toContain("Item Gained");
    const csv = await exportStoryJournalCsv(store, schema.storyId);
    expect(csv).toContain('"turn_index","chapter","kind"');
    expect(csv).toContain('"item_gained"');
    expect(await exportStoryJournalCsv(store, schema.storyId)).toBe(csv);
  });

  it("regenerates only after confirmation and clears mechanical derivatives atomically", async () => {
    const store = await openStore(":memory:");
    const schema = makeStory();
    await store.stories.insert({
      id: schema.storyId,
      title: schema.title,
      createdAt: 0,
      schema,
      locked: true,
      rulebookVersion: 1,
    });
    const player = makePlayer();
    await store.characters.insert({
      id: player.characterId,
      storyId: schema.storyId,
      name: "Kestrel",
      isPlayer: true,
      hard: player,
    });
    await store.messages.insert({
      id: "kept-message",
      storyId: schema.storyId,
      idx: 0,
      role: "narrator",
      content: "The existing narrative remains.",
      createdAt: 1,
    });
    await store.events.insert({
      id: "old-event",
      storyId: schema.storyId,
      messageId: "kept-message",
      turnIndex: 0,
      kind: "roll",
      payload: {},
      rulebookVersion: 1,
      createdAt: 1,
    });

    const impact = await previewRulebookRegenerationImpact(store, schema.storyId);
    expect(impact).toMatchObject({
      attributes: schema.attributes.length,
      skills: schema.skills.length,
      storyActions: schema.actions.length,
      characters: 1,
      rulings: 0,
      checkpoints: 0,
      journalEvents: 1,
      runtimeItemDefinitions: 0,
      runtimeItemInstances: 0,
      equippedSlots: 0,
    });

    const regenerated = await regenerateRulebook(inertRouter, store, schema.storyId, {
      confirmMechanicalReset: true,
      statMode: "none",
      actionBudget: 3,
    });
    expect(regenerated.schema.statMode).toBe("none");
    expect(regenerated.actionBudget).toBe(3);
    expect(regenerated.rulebookVersion).toBe(2);
    expect((await store.messages.listByStory(schema.storyId))[0]?.content).toContain(
      "existing narrative"
    );
    expect((await store.characters.get(player.characterId))!.hard.skills).toEqual([]);
    const events = await store.events.listByStory(schema.storyId);
    expect(events.map((event) => event.kind)).toEqual(["rulebook_regenerated"]);
    const snapshot = await store.rulebookSnapshots.latest(schema.storyId);
    expect(snapshot?.rulebookVersion).toBe(1);
    expect(snapshot?.snapshot).toMatchObject({
      characterHardStates: [{ characterId: player.characterId }],
      events: [{ id: "old-event" }],
    });
  });

  it("duplicates narrative before regeneration and leaves the source story untouched", async () => {
    const store = await openStore(":memory:");
    const schema = makeStory();
    await store.stories.insert({
      id: schema.storyId,
      title: schema.title,
      createdAt: 0,
      schema,
      locked: true,
    });
    const player = makePlayer();
    await store.characters.insert({
      id: player.characterId,
      storyId: schema.storyId,
      name: "Kestrel",
      isPlayer: true,
      hard: player,
    });
    await store.messages.insert({
      id: "source-message",
      storyId: schema.storyId,
      idx: 0,
      role: "narrator",
      content: "This history must be preserved.",
      createdAt: 1,
    });

    const copy = await duplicateAndRegenerateRulebook(inertRouter, store, schema.storyId, {
      statMode: "none",
      title: "Safe regenerated copy",
    });

    expect(copy.id).not.toBe(schema.storyId);
    expect(copy.title).toBe("Safe regenerated copy");
    expect(copy.schema.statMode).toBe("none");
    expect(await store.messages.listByStory(copy.id)).toMatchObject([
      { content: "This history must be preserved." },
    ]);
    expect((await store.stories.get(schema.storyId))?.schema.statMode).toBe("full");
    expect(await store.messages.listByStory(schema.storyId)).toMatchObject([
      { id: "source-message" },
    ]);
  });

  it("removes a half-forged duplicate when regeneration is cancelled or fails", async () => {
    const store = await openStore(":memory:");
    const schema = makeStory();
    await store.stories.insert({
      id: schema.storyId,
      title: schema.title,
      createdAt: 0,
      schema,
      locked: true,
    });

    await expect(
      duplicateAndRegenerateRulebook(inertRouter, store, schema.storyId, {
        statMode: "full",
      })
    ).rejects.toThrow("No model call expected");

    expect((await store.stories.list()).map((story) => story.id)).toEqual([
      schema.storyId,
    ]);
  });
});
