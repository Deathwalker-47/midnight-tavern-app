/**
 * Play screen tests. Covers the two states the contract calls out — empty (no messages) and an
 * error state — plus the composer's ambiguity nudge and the RulingArtifact-in-stream reveal, so the
 * load-bearing behavior of the screen is pinned. State is driven two ways:
 *   • a stubbed bridge via `setBridge` for the empty-transcript render (production path), and
 *   • the `debugState` view flag for the error/ruling states (which the in-memory bridge can't
 *     produce on its own).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
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
const originalConsoleError = console.error.bind(console);
let actWarnings: string[] = [];
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

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
  actWarnings = [];
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const message = args.map(String).join(" ");
    if (message.includes("not wrapped in act")) {
      actWarnings.push(message);
      return;
    }
    originalConsoleError(...args);
  });
  usePlayStore.getState().reset();
  useUiStore.getState().closeDrawer();
});

afterEach(async () => {
  cleanup();
  // Restore the shared singleton so a swapped-in stub can't leak into other suites.
  setBridge(defaultBridge);
  await act(async () => {
    useRoute.setState({ route: "library", params: {} });
    await Promise.resolve();
  });
  consoleErrorSpy.mockRestore();
  vi.unstubAllGlobals();
  expect(actWarnings, "React updates must settle inside act before test cleanup").toEqual([]);
});

function installScrollMetrics(element: HTMLElement, initialHeight = 1_200) {
  let scrollHeight = initialHeight;
  let scrollTop = 0;
  Object.defineProperties(element, {
    clientHeight: { configurable: true, get: () => 300 },
    scrollHeight: { configurable: true, get: () => scrollHeight },
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => { scrollTop = value; },
    },
  });
  return {
    get top() { return scrollTop; },
    set top(value: number) { scrollTop = value; },
    set height(value: number) { scrollHeight = value; },
  };
}

describe("Play — stable transcript anchoring", () => {
  it("lands at latest when the initial transcript finishes loading", async () => {
    let releaseMessages!: (messages: Awaited<ReturnType<CoreBridge["listMessages"]>>) => void;
    const messagesGate = new Promise<Awaited<ReturnType<CoreBridge["listMessages"]>>>((resolve) => {
      releaseMessages = resolve;
    });
    const bridge = emptyBridge();
    bridge.listMessages = vi.fn(() => messagesGate);
    setBridge(bridge);
    render(<Play storyId="scroll-story" />);
    const scroll = screen.getByTestId("play-scroll");
    const metrics = installScrollMetrics(scroll);

    await act(async () => {
      releaseMessages([
        {
          id: "narrator-1",
          storyId: "scroll-story",
          idx: 0,
          role: "narrator",
          content: "The latest scene settles into view.",
          createdAt: 1,
        },
      ]);
      await messagesGate;
    });

    expect(metrics.top).toBe(1_200);
  });

  it("follows resize growth near latest but preserves a historical reader position", async () => {
    let notifyResize: (() => void) | undefined;
    class TestResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        notifyResize = () => callback([], this as unknown as ResizeObserver);
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    const bridge = emptyBridge();
    bridge.listMessages = vi.fn(async () => [
      {
        id: "narrator-1",
        storyId: "scroll-story",
        idx: 0,
        role: "narrator" as const,
        content: "A long scene fills the transcript.",
        createdAt: 1,
      },
    ]);
    setBridge(bridge);
    render(<Play storyId="scroll-story" />);
    await screen.findByText("A long scene fills the transcript.");
    const scroll = screen.getByTestId("play-scroll");
    const metrics = installScrollMetrics(scroll);

    metrics.top = 850;
    fireEvent.scroll(scroll);
    metrics.height = 1_500;
    act(() => notifyResize?.());
    expect(metrics.top).toBe(1_500);

    metrics.top = 400;
    fireEvent.scroll(scroll);
    expect(await screen.findByTestId("play-anchor")).toBeInTheDocument();
    metrics.height = 1_800;
    act(() => notifyResize?.());
    expect(metrics.top).toBe(400);

    fireEvent.click(screen.getByTestId("play-anchor"));
    expect(metrics.top).toBe(1_800);
    metrics.height = 2_000;
    act(() => notifyResize?.());
    expect(metrics.top).toBe(2_000);
  });

  it("does not move a historical viewport during streaming or drawer layout changes", async () => {
    const bridge = emptyBridge();
    bridge.listMessages = vi.fn(async () => [
      {
        id: "narrator-1",
        storyId: "scroll-story",
        idx: 0,
        role: "narrator" as const,
        content: "The archived scene remains readable.",
        createdAt: 1,
      },
    ]);
    bridge.listPresentCast = vi.fn(async () => [
      { characterId: "hero", name: "Kestrel", isPlayer: true, alive: true },
    ]);
    setBridge(bridge);
    render(<Play storyId="scroll-story" />);
    await screen.findByText("The archived scene remains readable.");
    const scroll = screen.getByTestId("play-scroll");
    const metrics = installScrollMetrics(scroll);
    metrics.top = 350;
    fireEvent.scroll(scroll);

    metrics.height = 1_500;
    await act(async () => {
      usePlayStore.setState({ operationPhase: "streaming", proseBuffer: "New prose arrives below." });
      useUiStore.getState().openCharacterDrawer("hero");
      await Promise.resolve();
    });

    expect(metrics.top).toBe(350);
  });
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

describe("Play — verified streaming end to end", () => {
  it("renders the first streamed paragraph before the turn's promise resolves", async () => {
    // The bridge enters the streaming phase, emits one safe paragraph, then HANGS on a gate. If any
    // boundary buffered the stream, the live prose would not be on screen yet.
    let releaseTurn!: () => void;
    const turnGate = new Promise<void>((resolve) => {
      releaseTurn = resolve;
    });
    const bridge = emptyBridge();
    bridge.submitTurn = vi.fn(async (args: Parameters<CoreBridge["submitTurn"]>[0]) => {
      args.onPhase?.("streaming");
      args.onDelta?.("Shannow eased between the shattered pews.");
      await turnGate; // the turn promise stays pending after the delta is emitted
      return {
        prose: "Shannow eased between the shattered pews.",
        rulings: [],
        narratorIdx: 1,
        classifierRecovered: false,
        refusedActionCount: 0,
        usedNarratorFallback: false,
        attributeAdvancements: [],
      };
    });
    setBridge(bridge);
    render(<Play storyId="s1" />);
    await screen.findByText("Your story waits"); // mount load done → storyId is set in the store

    await act(async () => {
      void usePlayStore.getState().submit("fire both pistols");
      await Promise.resolve();
    });

    // The provider promise is still gated, yet the first safe paragraph is already on screen.
    const buffer = await screen.findByTestId("play-prose-buffer");
    expect(buffer).toHaveTextContent("eased between the shattered pews");

    // Let the turn settle so the operation completes cleanly (no act warnings / dangling promise).
    await act(async () => {
      releaseTurn();
      await Promise.resolve();
    });
  });
});

describe("Play — narrator degradation notice", () => {
  it("surfaces the fallback reason when the narrator degraded to the safe summary", async () => {
    const bridge = emptyBridge();
    const prose = "Jinwoo's Weapon Strike succeeds.";
    bridge.listMessages = vi.fn(async (storyId: string) => [
      { id: "p1", storyId, idx: 0, role: "player" as const, content: "attack with your dagger", createdAt: 1 },
      { id: "n1", storyId, idx: 1, role: "narrator" as const, content: prose, createdAt: 2 },
    ]);
    bridge.submitTurn = vi.fn(async (args: Parameters<CoreBridge["submitTurn"]>[0]) => {
      args.onPhase?.("streaming");
      args.onDelta?.(prose);
      return {
        prose,
        rulings: [],
        narratorIdx: 1,
        classifierRecovered: false,
        refusedActionCount: 0,
        usedNarratorFallback: true,
        narratorFallbackReason: "the AI provider is rate-limiting requests (HTTP 429)",
        attributeAdvancements: [],
      };
    });
    setBridge(bridge);
    render(<Play storyId="s1" />);
    await screen.findByTestId("play-composer"); // mount load settled

    await act(async () => {
      await usePlayStore.getState().submit("attack with your dagger");
    });

    const notice = await screen.findByTestId("narrator-notice");
    expect(notice).toHaveTextContent(/rate-limiting requests \(HTTP 429\)/i);
    expect(screen.getByRole("button", { name: /retry narration/i })).toBeInTheDocument();
  });
});

describe("Play — narration retry state", () => {
  it("clears the stale fallback notice as soon as narration retry begins and settles idle", async () => {
    let finishSwipe!: () => void;
    const bridge = emptyBridge();
    bridge.swipeLastTurn = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<CoreBridge["swipeLastTurn"]>>>((resolve) => {
          finishSwipe = () => resolve({ variants: ["A full scene."], activeVariant: 0 });
        })
    );
    setBridge(bridge);
    usePlayStore.setState({
      storyId: "s1",
      narratorNotice: "the AI provider rejected the request (HTTP 401)",
      thinking: false,
      operationPhase: "idle",
    });

    const pending = usePlayStore.getState().swipeLast();
    expect(usePlayStore.getState()).toMatchObject({
      narratorNotice: undefined,
      thinking: true,
      operationPhase: "thinking",
    });

    finishSwipe();
    await pending;
    expect(usePlayStore.getState()).toMatchObject({
      narratorNotice: undefined,
      thinking: false,
      operationPhase: "idle",
    });
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

  it("does not show a provider warning when sealed mechanics were recovered", async () => {
    const bridge = emptyBridge();
    bridge.listMessages = vi.fn(async () => [
      {
        id: "player-1",
        storyId: "s1",
        idx: 0,
        role: "player" as const,
        content: "Press the Ride.",
        createdAt: 1,
      },
    ]);
    bridge.inspectTurnRecovery = vi.fn(async () => ({
      operation: {
        id: "operation-1",
        storyId: "s1",
        playerMessageId: "player-1",
        state: "idle" as const,
        classifierRecovery: {
          policy: "partial_mechanics" as const,
          issues: [
            {
              kind: "invalid_output" as const,
              message: "The classifier returned invalid structured output.",
              retryable: true,
            },
          ],
        },
        createdAt: 1,
        updatedAt: 2,
      },
      playerText: "Press the Ride.",
      playerMessageIdx: 0,
      stale: false,
      recoverable: false,
    }));
    setBridge(bridge);

    render(<Play storyId="s1" />);

    expect(await screen.findByText("Press the Ride.")).toBeInTheDocument();
    expect(screen.queryByTestId("classifier-recovery")).not.toBeInTheDocument();
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
  it("shows the DM ruling before the first streamed narrator prose", async () => {
    const bridge = emptyBridge();
    bridge.listPresentCast = vi.fn(async () => [
      { characterId: "hero", name: "Jinwoo", isPlayer: true, alive: true },
    ]);
    bridge.submitTurn = vi.fn(async (args) => {
      const liveArgs = args as typeof args & {
        onRulings?: (rulings: Array<{
          turnId: string;
          actorId: string;
          actionId: string;
          actionLabel: string;
          gate: { allowed: boolean; reason: string };
        }>) => void;
      };
      liveArgs.onRulings?.([
        {
          turnId: "turn-1",
          actorId: "hero",
          actionId: "leap_chasm",
          actionLabel: "Leap the chasm",
          gate: { allowed: false, reason: "The far ledge is beyond reach." },
        },
      ]);
      args.onPhase?.("streaming");
      args.onDelta?.("The darkness rises");
      return new Promise<never>(() => {});
    });
    setBridge(bridge);

    render(<Play storyId="s1" />);
    await screen.findByText("Your story waits");
    const composer = screen.getByTestId("play-composer");
    fireEvent.change(composer, {
      target: { value: "I leap across the impossible chasm." },
    });
    fireEvent.click(screen.getByTestId("play-send"));

    const ruling = await screen.findByText("The far ledge is beyond reach.");
    const prose = screen.getByTestId("play-prose-buffer");
    expect(
      ruling.compareDocumentPosition(prose) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("keeps an in-flight turn alive when Play is left and reopened", async () => {
    let finishTurn!: (value: Awaited<ReturnType<CoreBridge["submitTurn"]>>) => void;
    const pendingTurn = new Promise<Awaited<ReturnType<CoreBridge["submitTurn"]>>>(
      (resolve) => {
        finishTurn = resolve;
      }
    );
    const narrator = {
      id: "narrator-after-return",
      storyId: "s1",
      idx: 1,
      role: "narrator" as const,
      content: "The answer arrives while you are elsewhere.",
      createdAt: 2,
    };
    const bridge = emptyBridge();
    bridge.submitTurn = vi.fn(async (args) => {
      args.onPhase?.("streaming");
      args.onDelta?.("The answer arrives");
      return pendingTurn;
    });
    bridge.listMessages = vi.fn(async () => [narrator]);
    bridge.listStoryJournal = vi.fn(async () => ({ events: [] }));
    bridge.inspectTurnRecovery = vi.fn(async () => undefined);
    setBridge(bridge);
    usePlayStore.setState({ storyId: "s1" });

    const submitPromise = usePlayStore.getState().submit("I wait for the answer.");
    expect(usePlayStore.getState().thinking).toBe(true);
    expect(usePlayStore.getState().proseBuffer).toContain("The answer arrives");

    await usePlayStore.getState().load("s1");
    expect(bridge.listMessages).not.toHaveBeenCalled();
    expect(usePlayStore.getState().thinking).toBe(true);

    finishTurn({
      prose: narrator.content,
      rulings: [],
      narratorIdx: 1,
      classifierRecovered: false,
      refusedActionCount: 0,
      usedNarratorFallback: false,
      attributeAdvancements: [],
    });
    await submitPromise;

    expect(bridge.listMessages).toHaveBeenCalledTimes(1);
    expect(usePlayStore.getState().thinking).toBe(false);
    expect(usePlayStore.getState().messages).toEqual([narrator]);
  });

  it("routes feedback regeneration through the persistent Play operation", async () => {
    const swipeLastTurn = vi.fn(async () => ({
      variants: ["A more reflective telling."],
      activeVariant: 0,
    }));
    const bridge = emptyBridge();
    bridge.swipeLastTurn = swipeLastTurn;
    bridge.listStoryJournal = vi.fn(async () => ({ events: [] }));
    bridge.inspectTurnRecovery = vi.fn(async () => undefined);
    setBridge(bridge);
    usePlayStore.setState({ storyId: "s1" });

    await usePlayStore.getState().swipeLast({ feedback: "Make the moment more reflective." });

    expect(swipeLastTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        storyId: "s1",
        feedback: "Make the moment more reflective.",
      })
    );
  });

  it("renders rulings inline in the story stream (denied has no die)", () => {
    render(<Play storyId="s1" debugState="ruling" />);
    // The seeded demo transcript carries a denied ruling and a crit-success ruling.
    const labels = screen.getAllByTestId("ruling-label");
    expect(labels.length).toBeGreaterThan(0);
    expect(labels.some((label) => label.textContent?.includes("KESTREL"))).toBe(true);
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
  it("shows degraded grounded moves as insert-only choices instead of an unavailable warning", async () => {
    const suggestActions = vi.fn(async () => [
      {
        id: "fallback-1",
        kind: "move" as const,
        text: "Examine the mill door for signs of the burden.",
      },
      {
        id: "fallback-2",
        kind: "move" as const,
        text: "Keep the burden in view near the mill.",
      },
      {
        id: "fallback-3",
        kind: "dialogue" as const,
        text: "Call out about the burden beside the mill.",
      },
      {
        id: "fallback-4",
        kind: "move" as const,
        text: "Check whether the mill and burden are connected.",
      },
      {
        id: "fallback-5",
        kind: "move" as const,
        text: "Move toward the mill while watching the door.",
      },
    ]);
    setBridge({ ...emptyBridge(), suggestActions });
    render(<Play storyId="s1" />);

    const composer = await screen.findByTestId("play-composer") as HTMLTextAreaElement;
    fireEvent.change(composer, { target: { value: "I stay ready." } });
    fireEvent.click(screen.getByRole("button", { name: /Possible moves/i }));

    const fallback = await screen.findByRole("button", {
      name: /Examine the mill door for signs of the burden/i,
    });
    expect(screen.queryByText("Suggestions are unavailable")).not.toBeInTheDocument();
    fireEvent.click(fallback);

    expect(composer.value).toBe(
      "I stay ready. Examine the mill door for signs of the burden."
    );
    expect(screen.getByRole("button", { name: /Possible moves/i })).toBeInTheDocument();
  });

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
