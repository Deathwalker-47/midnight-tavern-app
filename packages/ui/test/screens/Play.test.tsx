/**
 * Play screen tests. Covers the two states the contract calls out — empty (no messages) and an
 * error state — plus the composer's ambiguity nudge and the RulingArtifact-in-stream reveal, so the
 * load-bearing behavior of the screen is pinned. State is driven two ways:
 *   • a stubbed bridge via `setBridge` for the empty-transcript render (production path), and
 *   • the `debugState` view flag for the error/ruling states (which the in-memory bridge can't
 *     produce on its own).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { Play } from "../../src/screens/Play";
import {
  setBridge,
  getBridge,
  type CoreBridge,
  type StoryEvent,
} from "../../src/bridge/core";
import { usePlayStore } from "../../src/state/playStore";
import { useUiStore } from "../../src/state/uiStore";
import { useRoute } from "../../src/app/router";

/** The default bridge, captured so tests that swap it in can restore it afterward. */
const defaultBridge = getBridge();

/** A bridge whose Play methods return an empty story, letting the empty state render. */
function emptyBridge(): CoreBridge {
  const base = getBridge();
  return {
    ...base,
    listMessages: vi.fn(async () => []),
    listRulings: vi.fn(async () => []),
    listPresentCast: vi.fn(async () => []),
  };
}

beforeEach(() => {
  cleanup();
  usePlayStore.getState().reset();
  useUiStore.getState().closeDrawer();
});

afterEach(() => {
  // Restore the shared singleton so a swapped-in stub can't leak into other suites.
  setBridge(defaultBridge);
  useRoute.setState({ route: "library", params: {} });
});

describe("Play — empty state", () => {
  it("invites the first turn when the story has no messages", async () => {
    setBridge(emptyBridge());
    render(<Play storyId="s1" />);

    // The store loads on mount; once messages resolve to [], the inviting empty state shows.
    expect(await screen.findByText("Your story waits")).toBeInTheDocument();
    expect(
      screen.getByText(/Tell the storyteller what you do/i)
    ).toBeInTheDocument();

    // The composer is present and ready (not disabled) so the player can begin.
    const composer = screen.getByTestId("play-composer") as HTMLTextAreaElement;
    expect(composer).toBeInTheDocument();
    expect(composer.disabled).toBe(false);
  });
});

describe("Play — error states", () => {
  it("shows structured classifier recovery without claiming a mechanical result", () => {
    render(<Play storyId="s1" debugState="classifier-target" />);

    expect(screen.getByTestId("classifier-recovery")).toHaveTextContent(
      /unresolved target/i
    );
    expect(screen.getByText(/without a valid DM Ruling/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /retry saved turn/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /clarify target/i })
    ).toBeInTheDocument();
  });

  it("provider-auth names the fix and offers a Settings affordance", () => {
    render(<Play storyId="s1" debugState="error-provider-auth" />);

    const errorCard = screen.getByTestId("play-error");
    expect(errorCard).toHaveAttribute("data-error-kind", "provider-auth");
    expect(screen.getByText("Your provider key was rejected")).toBeInTheDocument();
    expect(screen.getByText(/Check your key in Settings/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open Settings/i })).toBeInTheDocument();
  });

  it("network error offers a retry and keeps the turn saved", () => {
    render(<Play storyId="s1" debugState="error-network" />);

    expect(screen.getByTestId("play-error")).toHaveAttribute("data-error-kind", "network");
    expect(screen.getByText("Couldn't reach the provider")).toBeInTheDocument();
    expect(screen.getByText(/your turn is saved/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retry turn/i })).toBeInTheDocument();
  });

  it("model-output error names the Narrator and links a recommended model", () => {
    render(<Play storyId="s1" debugState="error-model-output" />);

    expect(screen.getByTestId("play-error")).toHaveAttribute("data-error-kind", "model-output");
    expect(screen.getByText(/returned nothing/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /recommended model/i })).toBeInTheDocument();
  });
});

describe("Play — stream + composer", () => {
  it("renders rulings inline in the story stream (denied has no die)", () => {
    render(<Play storyId="s1" debugState="ruling" />);
    // The seeded demo transcript carries a denied ruling and a crit-success ruling.
    expect(screen.getAllByTestId("ruling-label").length).toBeGreaterThan(0);
    expect(screen.getByTestId("ruling-denied-glyph")).toHaveTextContent("⊘");
    // A rolled verdict stamps its outcome.
    expect(screen.getAllByTestId("ruling-stamp").length).toBeGreaterThan(0);
  });

  it("renders a persisted attribute advancement ruling before narrator prose", async () => {
    const narrator = {
      id: "narrator-1",
      storyId: "s1",
      idx: 1,
      role: "narrator" as const,
      content: "The portcullis rises after your impossible feat of strength.",
      createdAt: 2,
    };
    const advancement: StoryEvent = {
      id: "advancement-1",
      storyId: "s1",
      messageId: narrator.id,
      turnIndex: 1,
      actorId: "hero",
      kind: "attribute_advanced",
      payload: {
        decision: {
          approved: true,
          proposal: {
            characterId: "hero",
            attributeId: "might",
            source: "exceptional_action",
            delta: 1,
            evidenceRefs: ["ruling-gate"],
            rationale: "A specific high-stakes combat action changed the scene.",
          },
          proposalKey: "aa-v1-gate",
          band: "moderate",
          scoreBefore: 12,
          scoreAfter: 13,
          dc: 13,
          roll: 17,
          modifier: 4,
          effectiveChancePercent: 60,
          evidenceRefs: ["ruling-gate"],
          denialCodes: [],
          denialReasons: [],
          policyVersion: 1,
        },
      },
      rulebookVersion: 1,
      createdAt: 2,
    };
    const bridge = emptyBridge();
    bridge.listMessages = vi.fn(async () => [narrator]);
    bridge.listPresentCast = vi.fn(async () => [
      { characterId: "hero", name: "Kestrel", isPlayer: true, alive: true },
    ]);
    bridge.listStoryJournal = vi.fn(async () => ({ events: [advancement] }));
    setBridge(bridge);

    render(<Play storyId="s1" />);

    const artifact = await screen.findByTestId("attribute-advancement-ruling");
    const prose = screen.getByText(narrator.content);
    expect(artifact).toHaveTextContent("DM RULING · ATTRIBUTE ADVANCED");
    expect(artifact).toHaveTextContent(/Might advances from 12 to 13/i);
    expect(
      artifact.compareDocumentPosition(prose) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("nudges instead of sending when the input is too vague (<12 chars)", () => {
    render(<Play storyId="s1" debugState="normal" />);
    const composer = screen.getByTestId("play-composer") as HTMLTextAreaElement;

    fireEvent.change(composer, { target: { value: "hi" } });
    fireEvent.keyDown(composer, { key: "Enter" });

    expect(screen.getByTestId("play-ambiguity")).toBeInTheDocument();
    // The draft is not cleared — nothing was submitted.
    expect(composer.value).toBe("hi");
  });

  it("thinking state shows the indicator and the live prose buffer", () => {
    render(<Play storyId="s1" debugState="thinking" />);
    expect(screen.getByTestId("play-thinking")).toBeInTheDocument();
    expect(screen.getByTestId("play-prose-buffer")).toHaveTextContent(/the room leans in to listen/i);
    // Composer disables while the narrator writes.
    expect((screen.getByTestId("play-composer") as HTMLTextAreaElement).disabled).toBe(true);
  });
});

describe("Play — possible moves", () => {
  it("shows a retryable provider error without replacing the player's draft", async () => {
    const suggestActions = vi.fn(async () => {
      throw new Error("Classifier returned invalid scene-grounded suggestions");
    });
    setBridge({ ...emptyBridge(), suggestActions });
    render(<Play storyId="s1" />);

    const composer = await screen.findByTestId("play-composer") as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: "I keep my hand near the door." } });
    fireEvent.click(screen.getByRole("button", { name: /Possible moves/i }));

    expect(await screen.findByText("Suggestions are unavailable")).toBeInTheDocument();
    expect(screen.getByText(/five scene-grounded moves/i)).toBeInTheDocument();
    expect(composer.value).toBe("I keep my hand near the door.");

    fireEvent.click(screen.getByRole("button", { name: /Try suggestions again/i }));
    await waitFor(() => expect(suggestActions).toHaveBeenCalledTimes(2));
  });

  it("aborts an in-flight request when the suggestions panel closes", async () => {
    let capturedSignal: AbortSignal | undefined;
    const suggestActions = vi.fn((_storyId: string, signal?: AbortSignal) => {
      capturedSignal = signal;
      return new Promise<never>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    });
    setBridge({ ...emptyBridge(), suggestActions });
    render(<Play storyId="s1" />);

    await screen.findByTestId("play-composer");
    fireEvent.click(screen.getByRole("button", { name: /Possible moves/i }));
    await waitFor(() => expect(suggestActions).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: /Close suggestions/i }));

    expect(capturedSignal?.aborted).toBe(true);
    expect(screen.getByRole("button", { name: /Possible moves/i })).toBeInTheDocument();
  });
});

describe("Play — drawer", () => {
  it("opens a character's living card when a party member is selected", async () => {
    render(<Play storyId="s1" debugState="normal" />);

    // Selecting a party member opens the drawer via the uiStore. PartyStrip tiles carry
    // role="listitem" with the member name as their accessible label.
    const kestrelTile = screen.getByRole("listitem", { name: /Kestrel Vane/i });
    fireEvent.click(kestrelTile);

    await waitFor(() => expect(screen.getByTestId("play-drawer")).toBeInTheDocument());
    expect(screen.getByLabelText(/Close living cards/i)).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Open full profile →" }));
    expect(useRoute.getState()).toMatchObject({
      route: "dossier",
      params: { storyId: "s1", characterId: "kestrel" },
    });
  });
});
