/**
 * Lorebook screen tests: the no-story branch (no storyId → the global lorebook library, v2 §2) and
 * a per-story load-error state driven through a stubbed bridge.
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

  it("shows the global lorebook library when no storyId is provided", async () => {
    render(<Lorebook />);
    const root = screen.getByTestId("lorebook-screen");
    expect(root).toHaveAttribute("data-nostory", "true");
    // The library shelf offers a create affordance and settles into its empty state.
    expect(screen.getByTestId("new-lorebook")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("No lorebooks yet")).toBeInTheDocument());
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
