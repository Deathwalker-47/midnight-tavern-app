/**
 * Library screen — state-matrix smoke tests (§02). Drives the stores directly (zustand exposes
 * setState) and asserts the empty, error, and trial-expired branches render the right copy. The
 * bridge is never called: we set the shelf status by hand so tests are deterministic.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Library } from "../../src/screens/Library";
import { useStoriesStore } from "../../src/state/storiesStore";
import { useSettingsStore } from "../../src/state/settingsStore";
import { makeMemoryBridge, setBridge, type TrialStatus } from "../../src/bridge/core";
import { useRoute } from "../../src/app/router";

const expiredTrial: TrialStatus = { startedAt: 0, expiresAt: 1, active: false, daysRemaining: 0 };

beforeEach(() => {
  setBridge(makeMemoryBridge());
  useRoute.setState({ route: "library", params: {} });
  useStoriesStore.setState({ stories: [], status: "ready", error: undefined });
  useSettingsStore.setState({ entitlement: { canCreateStory: true, via: "trial" } });
});

describe("Library", () => {
  it("empty shelf invites the first story", () => {
    useStoriesStore.setState({ stories: [], status: "ready" });
    render(<Library />);
    expect(screen.getByText("The shelf is empty")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /begin your first story/i })).toBeInTheDocument();
  });

  it("error status names the folder and offers a retry", () => {
    useStoriesStore.setState({ status: "error", error: "ENOENT" });
    render(<Library />);
    expect(screen.getByTestId("library-error")).toBeInTheDocument();
    expect(screen.getByText(/couldn.t read the library folder/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("loading status shows skeleton cards", () => {
    useStoriesStore.setState({ status: "loading" });
    render(<Library />);
    expect(screen.getByTestId("library-loading")).toBeInTheDocument();
  });

  it("shelf renders a StoryCard per story", () => {
    useStoriesStore.setState({
      status: "ready",
      stories: [
        { id: "a", title: "Embers of the Silent Vale", createdAt: 2, locked: true, messageCount: 58, statMode: "full", migrationPending: false },
        { id: "b", title: "The Tidewright’s Bargain", createdAt: 1, locked: true, messageCount: 34, statMode: "none", migrationPending: false },
      ],
    });
    render(<Library />);
    expect(screen.getByText("Embers of the Silent Vale")).toBeInTheDocument();
    expect(screen.getByText("The Tidewright’s Bargain")).toBeInTheDocument();
  });

  it("expired trial shows the upsell banner and disables New story", () => {
    useSettingsStore.setState({
      entitlement: { canCreateStory: false, reason: "trial-expired", trial: expiredTrial },
    });
    render(<Library />);
    expect(screen.getByTestId("library-trial-banner")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new story/i })).toBeDisabled();
  });

  it("opens a file picker and previews a parsed character card", async () => {
    const bridge = makeMemoryBridge();
    bridge.importCardFromBytes = async () => ({
      spec: "Card format V3",
      card: {} as never,
      mapped: {
        name: "Mara Voss",
        premise: "A navigator follows a drowned constellation.",
        identity: { traits: ["watchful"], likes: [], dislikes: [] },
        openings: ["The tide clock stops."],
        lorebook: [{ keys: ["tide clock"], content: "An illegal navigation engine.", enabled: true }],
        blueprint: { name: "Mara Voss", firstMessage: "The tide clock stops." },
      },
    });
    setBridge(bridge);
    render(<Library />);

    fireEvent.click(screen.getByRole("button", { name: /import card/i }));
    const input = screen.getByLabelText("Choose a character card file");
    fireEvent.change(input, { target: { files: [new File(["{}"], "mara.json", { type: "application/json" })] } });

    await screen.findByText("Mara Voss");
    expect(screen.getByText(/1 opening/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /use this card/i }));
    await waitFor(() => expect(useStoriesStore.getState().draft?.importedCard?.name).toBe("Mara Voss"));
    expect(useRoute.getState()).toMatchObject({ route: "blueprint", params: {} });
  });
});
