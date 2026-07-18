/**
 * Characters screen tests. A partial fake bridge (only the two methods the screen calls) drives
 * precise cast scenarios: no-story, empty, a full party + a fallen figure, and a load failure.
 * We assert through the rendered LivingCardView (names, FALLEN marker, section grouping).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Characters } from "../../src/screens/Characters";
import { setBridge, type CoreBridge, type CastMember, type LivingCardView } from "../../src/bridge/core";

function card(over: Partial<LivingCardView> & Pick<LivingCardView, "characterId" | "name">): LivingCardView {
  return {
    isPlayer: false,
    alive: true,
    resources: [{ id: "hp", label: "Health", current: 20, max: 20, playerVisible: true }],
    inventory: [],
    skills: [],
    ...over,
  };
}

/** A bridge with just the methods Characters uses; the rest throw if ever touched. */
function fakeBridge(members: CastMember[], cards: Map<string, LivingCardView>): CoreBridge {
  return {
    async listPresentCast() {
      return members;
    },
    async getLivingCard(_storyId: string, characterId: string) {
      return cards.get(characterId);
    },
  } as unknown as CoreBridge;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Characters screen", () => {
  it("shows a no-story invite when no storyId is provided", () => {
    render(<Characters />);
    expect(screen.getByText("No story open")).toBeInTheDocument();
  });

  it("renders the party and figures with names, and marks the fallen", async () => {
    const kestrel = card({ characterId: "p1", name: "Kestrel Vane", isPlayer: true, alive: true });
    const wren = card({ characterId: "a1", name: "Wren Callow", alive: true });
    const aldric = card({
      characterId: "x1",
      name: "Brother Aldric",
      alive: false,
      resources: [{ id: "hp", label: "Health", current: 0, max: 30, playerVisible: true }],
    });
    const members: CastMember[] = [
      { characterId: "p1", name: "Kestrel Vane", isPlayer: true, alive: true },
      { characterId: "a1", name: "Wren Callow", isPlayer: false, alive: true },
      { characterId: "x1", name: "Brother Aldric", isPlayer: false, alive: false },
    ];
    const cards = new Map([
      ["p1", kestrel],
      ["a1", wren],
      ["x1", aldric],
    ]);
    setBridge(fakeBridge(members, cards));

    render(<Characters storyId="s1" />);

    await waitFor(() => expect(screen.getByText("Kestrel Vane")).toBeInTheDocument());
    expect(screen.getByText("Wren Callow")).toBeInTheDocument();
    expect(screen.getByText("Brother Aldric")).toBeInTheDocument();

    // Grouping headers.
    expect(screen.getByText("THE PARTY")).toBeInTheDocument();
    expect(screen.getByText("ANTAGONISTS & FIGURES")).toBeInTheDocument();

    // The fallen ally carries the FALLEN treatment; the living ones do not.
    const fallenCards = document.querySelectorAll('[data-testid="living-card"][data-fallen="true"]');
    expect(fallenCards).toHaveLength(1);
  });

  it("shows the empty invite when the cast is empty", async () => {
    setBridge(fakeBridge([], new Map()));
    render(<Characters storyId="s-empty" />);
    await waitFor(() => expect(screen.getByText("No one has entered the story yet")).toBeInTheDocument());
  });

  it("surfaces a load failure as an error notice", async () => {
    const bridge = {
      async listPresentCast() {
        throw new Error("cast folder unreadable");
      },
      async getLivingCard() {
        return undefined;
      },
    } as unknown as CoreBridge;
    setBridge(bridge);

    render(<Characters storyId="s-broken" />);
    await waitFor(() => expect(screen.getByText("Couldn't reach the story's cast")).toBeInTheDocument());
    expect(screen.getByText("cast folder unreadable")).toBeInTheDocument();
  });
});
