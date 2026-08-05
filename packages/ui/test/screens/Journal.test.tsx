import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  makeMemoryBridge,
  setBridge,
  type StoryEvent,
  type StoryJournalQuery,
  type StoryRecord,
} from "../../src/bridge/core";
import { Journal, FILTERS, type JournalKind } from "../../src/screens/Journal";

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

  it("files classifier_recovery as interrupted, never as denied", async () => {
    const bridge = makeMemoryBridge();
    bridge.getStory = async () => story();
    bridge.listPresentCast = async () => [
      { characterId: "hero", name: "Kestrel", isPlayer: true, alive: true },
    ];
    bridge.listStoryJournal = async () => ({
      events: [
        { ...event("recovery-1", 3, 0, 3), kind: "classifier_recovery" },
        { ...event("denial-1", 4, 0, 4), kind: "denied" },
      ],
    });
    setBridge(bridge);

    render(<Journal storyId="story-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Denied" }));
    expect(screen.queryByText(/Classifier Recovery/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Interrupted" }));
    expect(screen.getByText(/Classifier Recovery/i)).toBeInTheDocument();
  });

  it("every JournalKind has a FILTERS entry", () => {
    const kinds: JournalKind[] = [
      "roll",
      "denied",
      "progression",
      "item-equipment",
      "milestone",
      "boundary",
      "interrupted",
    ];
    const filterKeys = FILTERS.filter((f) => f.key !== "all").map((f) => f.key);
    expect(filterKeys.sort()).toEqual([...kinds].sort());
  });

  it("keeps chapter and arc boundaries reachable from a filter chip", async () => {
    const bridge = makeMemoryBridge();
    bridge.getStory = async () => story();
    bridge.listPresentCast = async () => [
      { characterId: "hero", name: "Kestrel", isPlayer: true, alive: true },
    ];
    bridge.listStoryJournal = async () => ({
      events: [
        { ...event("boundary-1", 20, 1, 20), kind: "chapter_started", actorId: undefined },
        { ...event("roll-1", 21, 1, 21), kind: "roll" },
      ],
    });
    setBridge(bridge);

    render(<Journal storyId="story-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "Boundaries" }));
    expect(screen.getByText(/Chapter Started/i)).toBeInTheDocument();
    expect(screen.queryByText(/No matching events/i)).not.toBeInTheDocument();
  });

  it("renders dice as readable numbers and never dumps the raw payload", async () => {
    const bridge = makeMemoryBridge();
    bridge.getStory = async () => story();
    bridge.listPresentCast = async () => [
      { characterId: "hero", name: "Kestrel", isPlayer: true, alive: true },
    ];
    bridge.listStoryJournal = async () => ({
      events: [
        {
          ...event("roll-1", 5, 0, 5),
          kind: "roll",
          payload: {
            ruling: {
              turnId: "hero:strike",
              actorId: "hero",
              actionId: "strike",
              gate: { allowed: true },
              effectsApplied: null,
              roll: {
                d20: 14, dice: [14, 7], usedIndex: 0, rollMode: "advantage",
                modifier: 2, total: 16, dc: 12, outcome: "success",
              },
              loot: [
                {
                  itemInstanceId: "i1", itemDefinitionId: "d1", ownerCharacterId: "hero",
                  name: "Vale Saber", tier: "rare", quantity: 1,
                  provenanceSummary: "Encounter cleared",
                  effects: [{ type: "attribute_score", attributeId: "might", amount: 2 }],
                },
              ],
            },
          },
        },
      ],
    });
    setBridge(bridge);

    render(<Journal storyId="story-1" />);
    fireEvent.click(await screen.findByRole("button", { expanded: false }));
    // usedIndex: 0 → the 14 was kept, the 7 discarded — mirrors DieBlock's discard styling.
    expect(screen.getByText("14, 7 (discarded)")).toBeInTheDocument();
    expect(screen.getByText(/\+2 Might/)).toBeInTheDocument();
    expect(screen.queryByText("Record")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\{"/);
  });
});
