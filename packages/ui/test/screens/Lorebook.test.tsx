/**
 * Lorebook screen tests: the no-story branch (no storyId → the global lorebook library, v2 §2) and
 * a per-story load-error state driven through a stubbed bridge.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { Lorebook, parseLorebookJson } from "../../src/screens/Lorebook";
import { setBridge, makeMemoryBridge } from "../../src/bridge/core";
import type { CoreBridge, LorebookEntry, LorebookLibraryEntry } from "../../src/bridge/core";

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

describe("Lorebook — book hierarchy", () => {
  const counts = [15, 17, 71, 21, 76, 1];
  const books: LorebookLibraryEntry[] = counts.map((entryCount, index) => ({
    id: `book-${index + 1}`,
    name: index === 1 ? "NEN Archive" : `Lorebook ${index + 1}`,
    description: "",
    createdAt: index + 1,
    source: "user",
    entryCount,
    attachmentCount: index < 2 ? 1 : 0,
  }));

  it("lists all lorebooks first and fetches only the selected book's entries", async () => {
    const listStoryEntries = vi.fn(async (): Promise<LorebookEntry[]> => []);
    const listEntries = vi.fn(async (lorebookId: string): Promise<LorebookEntry[]> => [
      {
        id: "entry-nen",
        lorebookId,
        keys: ["NEN"],
        content: "NEN detail is scoped to this book.",
        enabled: true,
        alwaysOn: false,
        priority: 0,
        insertionOrder: 0,
      },
    ]);
    setBridge(
      stubBridge({
        listLorebooks: vi.fn(async () => books),
        listAttachedLorebooks: vi.fn(async () => [
          { ...books[0]!, linkEnabled: true },
          { ...books[1]!, linkEnabled: true },
        ]),
        listLorebook: listStoryEntries,
        listLorebookEntries: listEntries,
      })
    );

    render(<Lorebook storyId="story-1" />);

    await waitFor(() => expect(screen.getByText("Lorebook 6")).toBeInTheDocument());
    for (const book of books) {
      expect(screen.getByText(book.name)).toBeInTheDocument();
    }
    expect(screen.getByText("NEN Archive")).toBeInTheDocument();
    expect(screen.getByText("17 entries")).toBeInTheDocument();
    expect(screen.getAllByText("ATTACHED")).toHaveLength(2);
    expect(listStoryEntries).not.toHaveBeenCalled();
    expect(listEntries).not.toHaveBeenCalled();
    expect(screen.queryByText("NEN detail is scoped to this book.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /NEN Archive/i }));

    await waitFor(() => expect(listEntries).toHaveBeenCalledTimes(1));
    expect(listEntries).toHaveBeenCalledWith("book-2");
    expect(await screen.findByText("NEN")).toBeInTheDocument();
    expect(screen.getByTestId("lorebook-book-editor")).toBeInTheDocument();
  });

  it("keeps an unsaved entry draft visible and retries the same draft after a save failure", async () => {
    const book = books[0]!;
    let saved: LorebookEntry | undefined;
    const saveEntry = vi.fn(async (_bookId: string, entry: LorebookEntry) => {
      if (saveEntry.mock.calls.length === 1) {
        throw new Error("lorebook drive temporarily unavailable");
      }
      saved = { ...entry, lorebookId: book.id };
    });
    setBridge(
      stubBridge({
        listLorebooks: vi.fn(async () => [book]),
        listAttachedLorebooks: vi.fn(async () => [{ ...book, linkEnabled: true }]),
        listLorebookEntries: vi.fn(async () => saved ? [saved] : []),
        saveLorebookEntryIn: saveEntry,
      })
    );

    render(<Lorebook storyId="story-1" />);
    fireEvent.click(await screen.findByRole("button", { name: /Lorebook 1/i }));
    await waitFor(() =>
      expect(screen.getByTestId("lorebook-book-editor")).toBeInTheDocument()
    );
    fireEvent.click(screen.getByRole("button", { name: /New entry/i }));
    fireEvent.change(screen.getByLabelText("Content"), {
      target: { value: "The drowned bell rings only for oathbreakers." },
    });
    fireEvent.change(screen.getByLabelText("Add trigger keyword"), {
      target: { value: "drowned bell" },
    });
    fireEvent.keyDown(screen.getByLabelText("Add trigger keyword"), {
      key: "Enter",
    });
    fireEvent.click(screen.getByRole("button", { name: "Save entry" }));

    expect(await screen.findByText("Couldn't save entry")).toBeInTheDocument();
    expect(screen.getByLabelText("Content")).toHaveValue(
      "The drowned bell rings only for oathbreakers."
    );
    expect(screen.getByText("drowned bell")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try saving again" }));

    await waitFor(() => expect(saveEntry).toHaveBeenCalledTimes(2));
    expect(saveEntry.mock.calls[1]?.[1]).toMatchObject({
      content: "The drowned bell rings only for oathbreakers.",
      keys: ["drowned bell"],
    });
    expect(
      await screen.findByText(/The drowned bell rings only for oathbreak/)
    ).toBeInTheDocument();
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
        listLorebooks: async (): Promise<LorebookLibraryEntry[]> => {
          throw new Error("network unreachable");
        },
        listAttachedLorebooks: async () => [],
      })
    );
  });

  it("shows an error notice when the lorebook shelf fails to load", async () => {
    render(<Lorebook storyId="story-1" />);
    await waitFor(() => expect(screen.getByTestId("lorebook-screen")).toHaveAttribute("data-status", "error"));
    expect(screen.getByText("Couldn't load your lorebooks")).toBeInTheDocument();
  });
});
