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

  it("classifies attribute advancement as progression and exposes its scene evidence", async () => {
    const bridge = makeMemoryBridge();
    bridge.getStory = async () => story();
    bridge.listPresentCast = async () => [
      { characterId: "hero", name: "Kestrel", isPlayer: true, alive: true },
    ];
    bridge.listStoryJournal = async () => ({
      events: [
        {
          ...event("attribute-event", 18, 1, 18),
          kind: "attribute_advanced",
          payload: {
            decision: {
              approved: true,
              proposal: {
                characterId: "hero",
                attributeId: "might",
                source: "exceptional_action",
                delta: 1,
                evidenceRefs: ["ruling-dragon"],
                rationale: "Held the gate alone during the dragon assault.",
              },
              proposalKey: "aa-v1-dragon",
              band: "hard",
              scoreBefore: 16,
              scoreAfter: 17,
              dc: 17,
              roll: 18,
              modifier: 4,
              effectiveChancePercent: 40,
              evidenceRefs: ["ruling-dragon"],
              denialCodes: [],
              denialReasons: [],
              policyVersion: 1,
            },
          },
        },
      ],
    });
    setBridge(bridge);

    render(<Journal storyId="story-1" />);

    expect(
      await screen.findByText("Kestrel - Might advanced: 16 → 17")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("Kestrel - Might advanced: 16 → 17"));
    expect(screen.getByText("Exceptional Action")).toBeInTheDocument();
    expect(
      screen.getByText("Held the gate alone during the dragon assault.")
    ).toBeInTheDocument();
    expect(screen.getByText("ruling-dragon")).toBeInTheDocument();
  });
});
