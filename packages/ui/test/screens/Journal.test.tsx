import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  makeMemoryBridge,
  setBridge,
  type StoryEvent,
  type StoryJournalQuery,
  type StoryRecord,
} from "../../src/bridge/core";
import { Journal } from "../../src/screens/Journal";

function story(): StoryRecord {
  return {
    id: "story-1",
    title: "The Midnight Ledger",
    createdAt: 1,
    locked: true,
    schema: {
      statMode: "full",
      premise: "A test story with mechanics.",
    } as StoryRecord["schema"],
  };
}

function event(
  id: string,
  turnIndex: number,
  chapterIndex: number,
  createdAt: number
): StoryEvent {
  return {
    id,
    storyId: "story-1",
    turnIndex,
    chapterIndex,
    actorId: "hero",
    kind: "item_gained",
    payload: { item: id },
    rulebookVersion: 1,
    createdAt,
  };
}

beforeEach(() => {
  setBridge(makeMemoryBridge());
});

describe("Mechanical Journal", () => {
  it("loads older cursor pages and keeps their resolved chapter membership", async () => {
    const bridge = makeMemoryBridge();
    const queries: Array<StoryJournalQuery | undefined> = [];
    bridge.getStory = async () => story();
    bridge.listPresentCast = async () => [
      { characterId: "hero", name: "Kestrel", isPlayer: true, alive: true },
    ];
    bridge.listStoryJournal = async (_storyId, query) => {
      queries.push(query);
      if (query?.before) {
        return {
          events: [event("older-event", 12, 0, 12)],
        };
      }
      return {
        events: [event("newer-event", 62, 1, 62)],
        nextCursor: { turnIndex: 62, createdAt: 62, id: "newer-event" },
      };
    };
    setBridge(bridge);

    render(<Journal storyId="story-1" />);

    expect(await screen.findByText("CHAPTER 2")).toBeInTheDocument();
    expect(screen.queryByText("CHAPTER 1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("journal-load-more"));

    expect(await screen.findByText("CHAPTER 1")).toBeInTheDocument();
    expect(screen.getByText("CHAPTER 2")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByTestId("journal-load-more")).not.toBeInTheDocument()
    );
    expect(queries).toHaveLength(2);
    expect(queries[1]?.before).toEqual({
      turnIndex: 62,
      createdAt: 62,
      id: "newer-event",
    });
  });
});
