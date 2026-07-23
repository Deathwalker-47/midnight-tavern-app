/**
 * Lorebook screen tests: the no-story branch (no storyId → the global lorebook library, v2 §2) and
 * a per-story load-error state driven through a stubbed bridge.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { Lorebook, parseLorebookJson } from "../../src/screens/Lorebook";
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

describe("lorebook JSON compatibility", () => {
  it("imports object maps, character books, and top-level entry arrays", () => {
    const worldInfo = parseLorebookJson(JSON.stringify({
      name: "Ash Archive",
      entries: { 0: { key: ["ash", "road"], keysecondary: ["pilgrim"], content: "The road remembers.", constant: true, order: 4 } },
    }), "fallback");
    expect(worldInfo.name).toBe("Ash Archive");
    expect(worldInfo.entries[0]).toMatchObject({ keys: ["ash", "road", "pilgrim"], alwaysOn: true, priority: 4 });

    const characterBook = parseLorebookJson(JSON.stringify({ character_book: {
      name: "Keeper lore",
      entries: [{ keys: ["bell"], content: "It rings below.", enabled: true }],
    } }), "fallback");
    expect(characterBook.name).toBe("Keeper lore");

    const array = parseLorebookJson(JSON.stringify([{ key: "moon,pass", content: "No moon rises." }]), "Loose lore");
    expect(array.entries[0]?.keys).toEqual(["moon", "pass"]);
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
