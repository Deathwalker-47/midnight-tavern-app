import { beforeEach, describe, expect, it } from "vitest";
import { makeMemoryBridge, setBridge, type StoryRecord } from "../../src/bridge/core";
import { useSettingsStore } from "../../src/state/settingsStore";
import { useStoriesStore } from "../../src/state/storiesStore";

describe("trial chip after the first story", () => {
  beforeEach(() => {
    useSettingsStore.setState({ trial: undefined });
  });

  it("picks up the trial the first forge starts, without a restart", async () => {
    // Live v0.3.0 (2026-10-18, bug B11): the sidebar read "Trial · –d" all session because the
    // trial starts with the first story and nothing re-read it afterwards.
    const story = { id: "s1", title: "Kingdom", createdAt: 1, locked: true, schema: {} } as StoryRecord;
    let trialStarted = false;
    const bridge = makeMemoryBridge();
    bridge.createStory = async () => {
      trialStarted = true;
      return { story, playerCharacterId: "hero" };
    };
    bridge.listStories = async () => [];
    bridge.peekTrial = async () =>
      trialStarted ? { startedAt: 1, expiresAt: 2, active: true, daysRemaining: 14 } : undefined;
    setBridge(bridge);

    await useStoriesStore.getState().create({ title: "Kingdom", premise: "A war." } as never);

    expect(useSettingsStore.getState().trial?.daysRemaining).toBe(14);
  });
});
