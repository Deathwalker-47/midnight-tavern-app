import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../../src/app/App";
import { useRoute } from "../../src/app/router";
import {
  makeMemoryBridge,
  setBridge,
  type MessageRecord,
  type StoryRecord,
} from "../../src/bridge/core";
import { useSettingsStore } from "../../src/state/settingsStore";
import { useStoriesStore } from "../../src/state/storiesStore";
import { usePlayStore } from "../../src/state/playStore";

function storyRecord(id: string): StoryRecord {
  return {
    id,
    title: "The Ash Road",
    createdAt: 1,
    locked: true,
    schema: { statMode: "full", premise: "A test story." } as StoryRecord["schema"],
  } as unknown as StoryRecord;
}

function message(): MessageRecord {
  return { id: "m1", storyId: "s1", idx: 0, role: "narrator", content: "…", createdAt: 1 };
}

beforeEach(async () => {
  window.history.replaceState({}, "", "#blueprint");
  useRoute.setState({ route: "blueprint", params: {} });
  useStoriesStore.setState({
    stories: [],
    status: "ready",
    current: {
      id: "active-story",
      title: "NEN CHRONICLE",
      createdAt: 1,
      locked: true,
      blueprint: { name: "NEN CHRONICLE", description: "The currently active story." },
    } as unknown as StoryRecord,
    currentStatus: "ready",
    forging: false,
    draft: {
      title: "The Mojave",
      playerName: "Courier",
      premise: "A courier wakes in the Mojave with a debt to collect.",
      blueprint: {
        name: "The Mojave",
        description: "The imported Mojave Wasteland card.",
        scenario: "2281 AD, between the NCR and Caesar's Legion.",
      },
    },
  });
  useSettingsStore.setState({
    setupState: { validatedProviders: ["openrouter"], rolesConfirmed: true, dismissed: false },
    loaded: true,
  });
});

describe("App blueprint routing", () => {
  it("keeps a card-import draft in create mode when another story is active", async () => {
    const bridge = makeMemoryBridge();
    await bridge.setSetupState({ validatedProviders: ["openrouter"], rolesConfirmed: true, dismissed: false });
    const getBlueprint = vi.fn(async () => ({
      name: "NEN CHRONICLE",
      description: "The currently active story.",
    }));
    bridge.getBlueprint = getBlueprint;
    setBridge(bridge);

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Begin your story" }, { timeout: 5_000 })
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Story title" })).toHaveValue("The Mojave");
    expect(screen.getByDisplayValue("The imported Mojave Wasteland card.")).toBeInTheDocument();
    expect(getBlueprint).not.toHaveBeenCalled();
  });
});

describe("App header — chapter label", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "#play");
    useRoute.setState({ route: "play", params: { storyId: "s1" } });
  });

  it("shows the engine's chapter count in the header, not a message-count guess", async () => {
    const bridge = makeMemoryBridge();
    await bridge.setSetupState({ validatedProviders: ["openrouter"], rolesConfirmed: true, dismissed: false });
    bridge.getStory = async () => storyRecord("s1");
    bridge.listChapters = async () => [
      { id: "c0", storyId: "s1", idx: 0, msgFrom: 0, msgTo: 19, title: "The Ash Road", summary: "…" },
      { id: "c1", storyId: "s1", idx: 1, msgFrom: 20, msgTo: 39, title: "The Glass Gate", summary: "…" },
      { id: "c2", storyId: "s1", idx: 2, msgFrom: 40, msgTo: 59, title: "The Debt", summary: "…" },
    ];
    setBridge(bridge);
    useStoriesStore.setState({ current: storyRecord("s1"), currentStatus: "ready" });
    usePlayStore.setState({ messages: [] }); // 0 messages: the old formula would say CH 1

    render(<App />);
    expect(await screen.findByText("CH 3")).toBeInTheDocument();
  });

  it("says the chapter is in progress when the summarizer has written none", async () => {
    const bridge = makeMemoryBridge();
    await bridge.setSetupState({ validatedProviders: ["openrouter"], rolesConfirmed: true, dismissed: false });
    bridge.getStory = async () => storyRecord("s1");
    bridge.listChapters = async () => [];
    setBridge(bridge);
    useStoriesStore.setState({ current: storyRecord("s1"), currentStatus: "ready" });
    usePlayStore.setState({ messages: new Array(45).fill(message()) }); // old formula: CH 3

    render(<App />);
    expect(await screen.findByText("Chapter in progress")).toBeInTheDocument();
    expect(screen.queryByText(/^CH \d/)).not.toBeInTheDocument();
  });
});
