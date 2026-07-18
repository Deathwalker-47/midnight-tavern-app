/**
 * Lorebook screen tests: the no-story empty state (no storyId → nothing to scope entries to) and
 * a load-error state driven through a stubbed bridge.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { Lorebook } from "../../src/screens/Lorebook";
import { setBridge, makeMemoryBridge } from "../../src/bridge/core";
import type { CoreBridge, LorebookEntry } from "../../src/bridge/core";

function stubBridge(overrides: Partial<CoreBridge>): CoreBridge {
  return Object.assign(makeMemoryBridge(), overrides);
}

afterEach(cleanup);

describe("Lorebook — no story", () => {
  beforeEach(() => {
    setBridge(makeMemoryBridge());
  });

  it("shows the open-a-story empty state when no storyId is provided", () => {
    render(<Lorebook />);
    const root = screen.getByTestId("lorebook-screen");
    expect(root).toHaveAttribute("data-nostory", "true");
    expect(screen.getByText("Open a story to tend its lore")).toBeInTheDocument();
  });
});

describe("Lorebook — load error state", () => {
  beforeEach(() => {
    setBridge(
      stubBridge({
        listLorebook: async (): Promise<LorebookEntry[]> => {
          throw new Error("network unreachable");
        },
      })
    );
  });

  it("shows an error notice with retry when a story's lorebook fails to load", async () => {
    render(<Lorebook storyId="story-1" />);
    await waitFor(() => expect(screen.getByTestId("lorebook-screen")).toHaveAttribute("data-status", "error"));
    expect(screen.getByText("Couldn't load this story's lorebook")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again/i })).toBeInTheDocument();
  });
});
