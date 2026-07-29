/**
 * Overview screen — smoke tests for the no-story and error branches, plus the arc/timeline render
 * once a story + transcript are present. Uses a fresh in-memory bridge (setBridge) and drives the
 * stories store directly so the chapter derivation runs against a known message count.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
import { Overview } from "../../src/screens/Overview";
import { useStoriesStore } from "../../src/state/storiesStore";
import { makeMemoryBridge, setBridge } from "../../src/bridge/core";
import type { StoryRecord } from "../../src/bridge/core";

const originalConsoleError = console.error.bind(console);
let actWarnings: string[] = [];
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

function stubStory(id: string): StoryRecord {
  return {
    id,
    title: "Embers of the Silent Vale",
    createdAt: 1,
    locked: true,
    schema: { premise: "A courier crosses an ash-buried road." } as unknown as StoryRecord["schema"],
  };
}

beforeEach(() => {
  actWarnings = [];
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const message = args.map(String).join(" ");
    if (message.includes("not wrapped in act")) {
      actWarnings.push(message);
      return;
    }
    originalConsoleError(...args);
  });
  setBridge(makeMemoryBridge());
  useStoriesStore.setState({ current: undefined, currentStatus: "idle" });
});

afterEach(async () => {
  cleanup();
  await act(async () => {
    await Promise.resolve();
  });
  consoleErrorSpy.mockRestore();
  expect(actWarnings, "React updates must settle inside act before test cleanup").toEqual([]);
});

describe("Overview", () => {
  it("with no storyId shows the no-story empty state", () => {
    render(<Overview />);
    expect(screen.getByText("No story open")).toBeInTheDocument();
  });

  it("with a story-load error shows the error notice and retry", async () => {
    useStoriesStore.setState({ current: undefined, currentStatus: "error" });
    render(<Overview storyId="missing" />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("overview-error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("renders the persisted chapter timeline and arc document once summaries load", async () => {
    // Overview now reads PERSISTED chapters/arcs (audit #6). Seed one closed chapter + one arc so
    // the timeline shows a summarized node and the ArcDoc reader renders the persisted document.
    const bridge = makeMemoryBridge();
    const messages = Array.from({ length: 45 }, (_v, i) => ({
      id: `m${i}`,
      storyId: "s1",
      idx: i,
      role: "narrator" as const,
      content: "…",
      createdAt: i,
    }));
    bridge.listMessages = async () => messages;
    bridge.listChapters = async () => [
      { id: "c0", storyId: "s1", idx: 0, msgFrom: 0, msgTo: 19, title: "The Ash Road", summary: "A courier sets out." },
    ];
    bridge.listArcs = async () => [
      {
        id: "a0",
        storyId: "s1",
        idx: 0,
        chapterFrom: 0,
        chapterTo: 0,
        title: "Embers of the Silent Vale",
        doc: {
          plotSummary: "The courier crosses the ash-buried road under a silent sky.",
          characterDevelopment: [],
          relationshipDynamics: [],
          secretsRevealed: [],
          keyDialogue: [],
          promisesAndOaths: [],
          antagonists: [],
          worldLore: [],
          unresolvedThreads: [],
          stakes: [],
          keyItems: [],
          skillsAndPowers: [],
          limitations: [],
          timeline: [],
        },
      },
    ];
    setBridge(bridge);
    useStoriesStore.setState({ current: stubStory("s1"), currentStatus: "ready" });

    render(<Overview storyId="s1" />);

    await waitFor(() => expect(screen.getByText("CHAPTERS")).toBeInTheDocument());
    // The persisted chapter + arc render: the chapter title and the arc heading are both present.
    expect(screen.getByText("The Ash Road")).toBeInTheDocument();
    expect(screen.getByText("Embers of the Silent Vale")).toBeInTheDocument();
  });
});
