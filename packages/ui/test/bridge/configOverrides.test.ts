/**
 * Rulebook config overrides through the bridges (plan 09 §4c). The SQLite bridge runs real core over a
 * real store with an in-memory stand-in for the Tauri config folder; the memory bridge (browser build)
 * reports that there is no folder. Both lock or release a story the same way.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import * as core from "@midnight-tavern/core";
import { openStore } from "@midnight-tavern/core";
import { makeMemoryBridge } from "../../src/bridge/core";
import { buildSqliteBridge } from "../../src/bridge/sqliteBridge";
import type { ConfigFileAccess } from "../../src/bridge/configFiles";

const harder = JSON.stringify({ archetypes: [{ id: "arch.social.sway", dc: 18 }, { id: "arch.social.nope", kind: "action" }] });

function folder(files: core.ConfigOverrideTexts): ConfigFileAccess & { files: core.ConfigOverrideTexts; failing: boolean } {
  const access = {
    files,
    failing: false,
    folder: vi.fn(async () => "/data/config"),
    read: vi.fn(async () => {
      if (access.failing) throw new Error("permission denied");
      return { ...access.files };
    }),
    restore: vi.fn(async (file: core.ConfigFileKey) => {
      delete access.files[file];
    }),
    reveal: vi.fn(async () => {}),
  };
  return access;
}

afterEach(() => {
  core.installConfigOverrides({});
});

describe("config overrides through the SQLite bridge", () => {
  it("loads, reports, restores and survives an unreadable folder", async () => {
    const store = await openStore(":memory:");
    const files = folder({ archetypes: harder });
    const bridge = buildSqliteBridge(store, core, files);
    expect(await bridge.configOverrideStatus()).toEqual({ supported: true, overridden: [], issues: [] });

    const loaded = await bridge.reloadConfigOverrides();
    expect(loaded).toMatchObject({ supported: true, folder: "/data/config", overridden: ["universal-archetypes.json"] });
    expect(loaded.issues).toContainEqual(
      expect.objectContaining({ severity: "error", file: "universal-archetypes.json", id: "arch.social.nope" })
    );
    expect(core.activeConfig().archetypes.archetypes.find((archetype) => archetype.id === "arch.social.sway")).toMatchObject({ dc: 18 });

    files.failing = true;
    const failed = await bridge.reloadConfigOverrides();
    expect(failed.error).toBe("The config folder could not be read: permission denied");
    expect(failed.overridden).toEqual(["universal-archetypes.json"]);
    expect(core.activeConfig().hash).not.toBe("");

    files.failing = false;
    const restored = await bridge.restoreConfigDefaults("archetypes");
    expect(files.restore).toHaveBeenCalledWith("archetypes");
    expect(restored).toEqual({ supported: true, folder: "/data/config", overridden: [], issues: [] });
    expect(core.activeConfig()).toBe(core.SHIPPED_CONFIG);

    await bridge.openConfigFolder();
    expect(files.reveal).toHaveBeenCalledTimes(1);
    await store.close();
  });

  it("does nothing with the folder when built without one", async () => {
    const store = await openStore(":memory:");
    const bridge = buildSqliteBridge(store, core);
    expect(await bridge.reloadConfigOverrides()).toEqual({ supported: false, overridden: [], issues: [] });
    expect(await bridge.restoreConfigDefaults("pool")).toEqual({ supported: false, overridden: [], issues: [] });
    await bridge.openConfigFolder();
    await store.close();
  });
});

describe("locking a story to its config", () => {
  it("is the same in both bridges, and a following story's catalogue shows the edited numbers", async () => {
    const memory = makeMemoryBridge();
    const created = await memory.createStory({
      storyId: "config-story",
      title: "Config",
      premise: "Two bridges.",
      playerName: "Ari",
      statMode: "full",
    });
    const store = await openStore(":memory:");
    await store.stories.insert({ ...created.story });
    const sqlite = buildSqliteBridge(store, core, folder({ archetypes: harder }));
    for (const bridge of [memory, sqlite]) await bridge.enablePoolEntry(created.story.id, "uni.social.persuasion.persuade");
    await sqlite.reloadConfigOverrides();

    const dc = async (bridge: typeof memory | typeof sqlite) =>
      (await bridge.listPoolEnablements(created.story.id)).find((row) => row.entryId === "uni.social.persuasion.persuade")
        ?.definition as { dc?: number } | undefined;
    expect((await dc(sqlite))?.dc).toBe(12);

    const [fromMemory, fromSqlite] = await Promise.all([
      memory.setRulebookConfigMode(created.story.id, "follow"),
      sqlite.setRulebookConfigMode(created.story.id, "follow"),
    ]);
    expect(fromMemory.configSnapshot?.["rulebookConfig"]).toBe("follow");
    expect(fromSqlite.configSnapshot?.["rulebookConfig"]).toBe("follow");
    expect((await store.stories.get(created.story.id))?.configSnapshot?.["rulebookConfig"]).toBe("follow");
    expect((await dc(sqlite))?.dc).toBe(18);
    // The browser build plays the shipped defaults whatever the mode.
    expect((await dc(memory))?.dc).toBe(12);
    expect(await memory.reloadConfigOverrides()).toEqual({ supported: false, overridden: [], issues: [] });
    expect(await memory.restoreConfigDefaults("items")).toEqual({ supported: false, overridden: [], issues: [] });
    await memory.openConfigFolder();
    await store.close();
  });
});
