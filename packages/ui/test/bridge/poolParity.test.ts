/**
 * Pool-enablement parity (plan 09 §7.2, S10b): the in-memory bridge and the SQLite bridge must enable,
 * list and refuse identically. Both share core's pure decisions (`catalogue/plan.ts`); this runs the
 * same sequence against each — the SQLite bridge over a real store and real core — and compares.
 */
import { describe, expect, it } from "vitest";
import * as core from "@midnight-tavern/core";
import { openStore } from "@midnight-tavern/core";
import { makeMemoryBridge, type CoreBridge, type PoolEnablementView } from "../../src/bridge/core";
import { buildSqliteBridge } from "../../src/bridge/sqliteBridge";

async function twinBridges(): Promise<{
  memory: CoreBridge;
  sqlite: CoreBridge;
  storyId: string;
  teach: (skillId: string) => Promise<void>;
}> {
  const memory = makeMemoryBridge();
  const created = await memory.createStory({
    storyId: "parity-story",
    title: "Parity",
    premise: "Two bridges, one truth.",
    playerName: "Ari",
    statMode: "full",
  });
  const store = await openStore(":memory:");
  await store.stories.insert({ ...created.story });
  const player = core.instantiatePlayer(created.story.schema, created.playerCharacterId);
  await store.characters.insert({
    id: created.playerCharacterId,
    storyId: created.story.id,
    name: "Ari",
    isPlayer: true,
    hard: player,
  });
  const sqlite = buildSqliteBridge(store, core);
  const teach = async (skillId: string) => {
    const card = (await memory.getLivingCard(created.story.id, created.playerCharacterId))!;
    card.skills.push({ skillId, name: skillId, rank: "novice" });
    await store.characters.updateHard(created.playerCharacterId, {
      ...player,
      skills: [{ skillId, rank: "novice", successCount: 0 }],
    });
  };
  return { memory, sqlite, storyId: created.story.id, teach };
}

const withoutTime = (rows: PoolEnablementView[]) => rows.map(({ enabledAt: _at, ...row }) => row);

describe("pool enablement parity across bridges", () => {
  it("enables, lists, refuses and disables identically", async () => {
    const { memory, sqlite, storyId, teach } = await twinBridges();
    const both = async <T>(call: (bridge: CoreBridge) => Promise<T>): Promise<T> => {
      const [fromMemory, fromSqlite] = await Promise.all([call(memory), call(sqlite)]);
      expect(fromMemory).toEqual(fromSqlite);
      return fromMemory;
    };

    expect(await both((bridge) => bridge.enablePoolEntry(storyId, "uni.social.persuasion.persuade"))).toEqual({
      ok: true,
      enabled: ["uni.social.persuasion.persuade"],
    });
    // Neither backend has completed a chapter, so an uncommon entry stays locked in both.
    expect(await both((bridge) => bridge.enablePoolEntry(storyId, "uni.social.leadership.rally_the_group"))).toEqual({
      ok: false,
      reason: "Rally the Group is uncommon; uncommon entries unlock once the story completes its first chapter.",
    });
    expect(await both((bridge) => bridge.enablePoolEntry(storyId, "uni.magic.fire_magic.fire_bolt"))).toEqual({
      ok: true,
      enabled: ["uni.magic.fire_magic.fire_bolt", "uni.magic.fire_magic.fire_magic"],
    });
    await both((bridge) => bridge.enablePoolEntry(storyId, "uni.social.insight.read_minds"));
    const [memoryRows, sqliteRows] = await Promise.all([
      memory.listPoolEnablements(storyId),
      sqlite.listPoolEnablements(storyId),
    ]);
    expect(withoutTime(memoryRows).map((row) => row.entryId).sort()).toEqual(
      withoutTime(sqliteRows).map((row) => row.entryId).sort()
    );
    for (const row of withoutTime(sqliteRows)) {
      expect(withoutTime(memoryRows)).toContainEqual(row);
    }
    expect(sqliteRows.find((row) => row.entryId === "uni.social.persuasion.persuade")).toMatchObject({
      kind: "action",
      name: "Persuade",
      source: "player",
      definition: { governingAttribute: "resolve" },
    });

    expect(await both((bridge) => bridge.mayDisablePoolEntry(storyId, "uni.magic.fire_magic.fire_magic"))).toEqual({
      allowed: false,
      reason: "Fire Bolt still needs it; disable that first.",
    });
    expect(await both((bridge) => bridge.disablePoolEntry(storyId, "uni.magic.fire_magic.fire_bolt"))).toEqual({
      allowed: true,
    });
    await teach("uni.magic.fire_magic.fire_magic");
    expect(await both((bridge) => bridge.disablePoolEntry(storyId, "uni.magic.fire_magic.fire_magic"))).toEqual({
      allowed: false,
      reason: "Ari has learned this, so it stays.",
    });
    expect(await both((bridge) => bridge.mayDisablePoolEntry(storyId, "uni.nope.nope.nope"))).toEqual({
      allowed: false,
      reason: "That entry is not enabled in this story.",
    });
  });

  it("browse the pool identically: sections, states, reasons, search and paging", async () => {
    const { memory, sqlite, storyId, teach } = await twinBridges();
    const both = async <T>(call: (bridge: CoreBridge) => Promise<T>): Promise<T> => {
      const [fromMemory, fromSqlite] = await Promise.all([call(memory), call(sqlite)]);
      expect(fromMemory).toEqual(fromSqlite);
      return fromMemory;
    };
    await both((bridge) => bridge.enablePoolEntry(storyId, "uni.magic.fire_magic.fire_bolt"));
    await teach("uni.magic.fire_magic.fire_magic");

    const sections = await both((bridge) => bridge.listPoolSections(storyId));
    expect(sections.find((section) => section.id === "fire_magic")).toMatchObject({ enabled: 2 });
    const fire = await both((bridge) => bridge.browsePool(storyId, { sectionId: "fire_magic" }));
    const state = (id: string) => fire.entries.find((entry) => entry.entryId === id);
    expect(state("uni.magic.fire_magic.fire_magic")).toMatchObject({
      state: "enabled",
      source: "player",
      reason: "Ari has learned this, so it stays.",
    });
    expect(state("uni.magic.fire_magic.fire_mastery")).toMatchObject({ state: "locked" });
    await both((bridge) => bridge.browsePool(storyId, { search: "persuade" }));
    await both((bridge) => bridge.browsePool(storyId, { offset: 40, limit: 25 }));
    await both((bridge) => bridge.browsePool(storyId));
  });
});
