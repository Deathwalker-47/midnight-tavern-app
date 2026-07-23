import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../../src/app/App";
import { useRoute } from "../../src/app/router";
import { makeMemoryBridge, setBridge, type StoryRecord } from "../../src/bridge/core";
import { useSettingsStore } from "../../src/state/settingsStore";
import { useStoriesStore } from "../../src/state/storiesStore";

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
