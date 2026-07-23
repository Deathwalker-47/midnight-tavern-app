import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { makeMemoryBridge, setBridge } from "../../src/bridge/core";
import { StoryBlueprint } from "../../src/screens/StoryBlueprint";
import { useStoriesStore } from "../../src/state/storiesStore";
import { useSettingsStore } from "../../src/state/settingsStore";
import { useRoute } from "../../src/app/router";

beforeEach(() => {
  setBridge(makeMemoryBridge());
  useRoute.setState({ route: "blueprint", params: {} });
  useStoriesStore.setState({
    stories: [],
    status: "ready",
    current: undefined,
    currentStatus: "idle",
    forging: false,
    draft: {
      title: "Ash Road",
      playerName: "Kestrel",
      premise: "A courier crosses a road where pilgrims vanish.",
      blueprint: {
        name: "The Bell Keeper",
        scenario: "A ruined monastery waits above the pass.",
        firstMessage: "The bell rings beneath a moonless sky.",
        systemPrompt: "Write restrained gothic prose.",
        postHistoryInstructions: "Keep the bell audible in quiet scenes.",
      },
    },
  });
  useSettingsStore.setState({
    setupState: { validatedProviders: ["openrouter"], rolesConfirmed: true, dismissed: false },
    entitlement: { canCreateStory: true, via: "trial" },
  });
});

describe("StoryBlueprint create flow", () => {
  it("exposes the full authoring fields before a story is forged", () => {
    render(<StoryBlueprint />);
    expect(screen.getByRole("textbox", { name: "Story title" })).toHaveValue("Ash Road");
    expect(screen.getByRole("combobox", { name: "Point of view" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /narration control/i }));
    expect(screen.getByDisplayValue("Write restrained gothic prose.")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Keep the bell audible in quiet scenes.")).toBeInTheDocument();
  });

  it("persists the blueprint and selected opening when forging", async () => {
    render(<StoryBlueprint />);
    fireEvent.click(screen.getByRole("button", { name: /full stats/i }));
    fireEvent.click(screen.getByRole("button", { name: /forge this world/i }));
    await waitFor(() => expect(useStoriesStore.getState().current?.title).toBe("Ash Road"), { timeout: 2500 });
    expect(useStoriesStore.getState().current?.blueprint?.systemPrompt).toBe("Write restrained gothic prose.");
  });

  it("lets the user cancel a stalled forge without losing the draft", async () => {
    const bridge = makeMemoryBridge();
    setBridge({
      ...bridge,
      createStory: async (args) => new Promise((_resolve, reject) => {
        args.onProgress?.("phase-a");
        args.signal?.addEventListener("abort", () => {
          const error = new Error("cancelled");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      }),
    });
    render(<StoryBlueprint />);
    fireEvent.click(screen.getByRole("button", { name: /full stats/i }));
    fireEvent.click(screen.getByRole("button", { name: /forge this world/i }));
    const cancel = await screen.findByRole("button", { name: /cancel forge/i });
    fireEvent.click(cancel);
    await waitFor(() => expect(screen.getByText(/forging was cancelled/i)).toBeInTheDocument());
    expect(useStoriesStore.getState().draft?.title).toBe("Ash Road");
    expect(useStoriesStore.getState().forging).toBe(false);
  });
});
