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

  it("names forge pool enablements and folds them into one boundary entry", async () => {
    // Live v0.3.0 (2026-10-18): a fresh story opened on 28 identical "Pool Enabled" rows with empty
    // bodies, starred and filed under Milestones.
    const pool = (id: string, turnIndex: number, createdAt: number, payload: Record<string, unknown>): StoryEvent => ({
      ...event(id, turnIndex, 0, createdAt),
      actorId: undefined,
      kind: "pool_enabled",
      payload,
    });
    const bridge = makeMemoryBridge();
    bridge.getStory = async () => story();
    bridge.listPresentCast = async () => [
      { characterId: "hero", name: "Kestrel", isPlayer: true, alive: true },
    ];
    bridge.listStoryJournal = async () => ({
      events: [
        pool("p1", 0, 1, { entryId: "uni.combat.melee.strike", kind: "action", name: "Strike", source: "forge" }),
        pool("p2", 0, 2, { entryId: "uni.combat.melee.power_attack", kind: "action", name: "Power Attack", source: "forge" }),
        pool("p3", 0, 3, { entryId: "uni.combat.melee.weapon_mastery", kind: "skill", name: "Weapon Mastery", source: "forge" }),
        pool("p4", 4, 4, { entryId: "uni.magic.fire.fire_magic", kind: "skill", name: "Fire Magic", source: "analyzer" }),
      ],
    });
    setBridge(bridge);

    render(<Journal storyId="story-1" />);

    const forged = await screen.findByText("The forge enabled 3 universal-pool entries (2 actions, 1 skill)");
    expect(screen.getByText("Enabled Fire Magic (skill) - by the story")).toBeInTheDocument();
    expect(screen.queryByText("Pool Enabled")).not.toBeInTheDocument();
    expect(screen.getByText("2 events")).toBeInTheDocument();
    fireEvent.click(forged);
    expect(screen.getByText("Strike, Power Attack")).toBeInTheDocument();
    expect(screen.getByText("Weapon Mastery")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Milestones" }));
    expect(screen.getByText(/No matching events/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Boundaries" }));
    expect(screen.getByText(/The forge enabled 3/)).toBeInTheDocument();
    expect(screen.getByText(/Enabled Fire Magic/)).toBeInTheDocument();
  });

  it("reads recovery and disabled pool entries as sentences with real names", async () => {
    const bridge = makeMemoryBridge();
    bridge.getStory = async () => ({
      ...story(),
      schema: {
        ...story().schema,
        resources: [
          { id: "hp", label: "Health", start: 20, max: 20, playerVisible: true, lethal: true },
          { id: "grit", label: "Grit", start: 10, max: 10, playerVisible: true },
        ],
      } as StoryRecord["schema"],
    });
    bridge.listPresentCast = async () => [
      { characterId: "hero", name: "Kestrel", isPlayer: true, alive: true },
    ];
    bridge.listStoryJournal = async () => ({
      events: [
        { ...event("rec-1", 6, 0, 6), kind: "recovery", payload: { characterId: "hero", gains: { grit: 3, hp: 1 } } },
        { ...event("dis-1", 7, 0, 7), actorId: undefined, kind: "pool_disabled", payload: { entryId: "uni.combat.melee.strike" } },
      ],
    });
    setBridge(bridge);

    render(<Journal storyId="story-1" />);

    expect(await screen.findByText("Kestrel - recovered Grit +3, Health +1")).toBeInTheDocument();
    expect(screen.getByText("Disabled Strike")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Recovery" }));
    expect(screen.getByText("Kestrel - recovered Grit +3, Health +1")).toBeInTheDocument();
    expect(screen.queryByText("Disabled Strike")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\{"/);
  });

  it("every JournalKind has a FILTERS entry", () => {
    const kinds: JournalKind[] = [
      "roll",
      "denied",
      "progression",
      "item-equipment",
      "recovery",
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
