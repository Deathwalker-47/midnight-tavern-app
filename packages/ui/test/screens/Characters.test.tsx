/**
 * Characters screen tests. A partial fake bridge (only the two methods the screen calls) drives
 * precise cast scenarios: no-story, empty, a full party + a fallen figure, and a load failure.
 * We assert through the rendered LivingCardView (names, FALLEN marker, section grouping).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Characters } from "../../src/screens/Characters";
import { setBridge, type CoreBridge, type CastMember, type LivingCardView } from "../../src/bridge/core";
import { useRoute } from "../../src/app/router";

function card(over: Partial<LivingCardView> & Pick<LivingCardView, "characterId" | "name">): LivingCardView {
  return {
    isPlayer: false,
    alive: true,
    resources: [{ id: "hp", label: "Health", current: 20, max: 20, playerVisible: true }],
    inventory: [],
    skills: [],
    ...over,
    attributes: over.attributes ?? [],
  };
}

/** A bridge with just the methods Characters uses; the rest throw if ever touched. */
function fakeBridge(
  members: CastMember[],
  cards: Map<string, LivingCardView>,
  statMode: "none" | "full" = "full"
): CoreBridge {
  return {
    async listPresentCast() {
      return members;
    },
    async getLivingCard(_storyId: string, characterId: string) {
      return cards.get(characterId);
    },
    async getStory() {
      return { schema: { statMode } };
    },
  } as unknown as CoreBridge;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => {
    useRoute.setState({ route: "library", params: {} });
  });
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

  it("renders XP thresholds and the latest award from the living-card projection", async () => {
    const kestrel = card({
      characterId: "p1",
      name: "Kestrel Vane",
      isPlayer: true,
      skills: [
        {
          skillId: "blade",
          name: "Blade",
          definition: "Swordplay.",
          rank: "adept",
          successCount: 99,
          xp: 145,
          nextRankXp: 300,
          toNext: 155,
          latestAward: {
            xp: 15,
            reason: "Critical success against a difficult foe.",
            turnIdx: 12,
            rankUp: { from: "novice", to: "adept" },
          },
        },
      ],
    });
    setBridge(
      fakeBridge(
        [{ characterId: "p1", name: "Kestrel Vane", isPlayer: true, alive: true }],
        new Map([["p1", kestrel]])
      )
    );

    render(<Characters storyId="s-xp" />);

    expect(await screen.findByText("145 / 300 XP · 155 to next rank")).toBeInTheDocument();
    expect(
      screen.getByText(
        "+15 XP · Critical success against a difficult foe. · T12 · NOVICE → ADEPT"
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/99 successes/)).not.toBeInTheDocument();
  });

  it("drills from a roster card into the dossier and Full Stats loadout", async () => {
    const kestrel = card({ characterId: "p1", name: "Kestrel Vane", isPlayer: true });
    setBridge(
      fakeBridge(
        [{ characterId: "p1", name: "Kestrel Vane", isPlayer: true, alive: true }],
        new Map([["p1", kestrel]])
      )
    );
    useRoute.setState({ route: "characters", params: { storyId: "s1" } });

    render(<Characters storyId="s1" />);

    fireEvent.click(await screen.findByRole("button", { name: "Open full profile →" }));
    expect(useRoute.getState()).toMatchObject({
      route: "dossier",
      params: { storyId: "s1", characterId: "p1" },
    });

    await act(async () => {
      useRoute.setState({ route: "characters", params: { storyId: "s1" } });
    });
    fireEvent.click(screen.getByRole("button", { name: "Equipment & loadout" }));
    expect(useRoute.getState()).toMatchObject({
      route: "loadout",
      params: { storyId: "s1", characterId: "p1" },
    });
  });

  it("opens the selected registry member when several character cards are visible", async () => {
    const kestrel = card({ characterId: "p1", name: "Kestrel Vane", isPlayer: true });
    const wren = card({ characterId: "a1", name: "Wren Callow" });
    setBridge(
      fakeBridge(
        [
          { characterId: "p1", name: "Kestrel Vane", isPlayer: true, alive: true },
          { characterId: "a1", name: "Wren Callow", isPlayer: false, alive: true },
        ],
        new Map([
          ["p1", kestrel],
          ["a1", wren],
        ])
      )
    );
    useRoute.setState({ route: "characters", params: { storyId: "s1" } });

    render(<Characters storyId="s1" />);

    const wrenCard = (await screen.findByText("Wren Callow")).closest(
      '[data-testid="living-card"]'
    );
    expect(wrenCard).not.toBeNull();
    fireEvent.click(within(wrenCard as HTMLElement).getByRole("button", { name: /Open full profile/ }));
    expect(useRoute.getState()).toMatchObject({
      route: "dossier",
      params: { storyId: "s1", characterId: "a1" },
    });

    await act(async () => {
      useRoute.setState({ route: "characters", params: { storyId: "s1" } });
    });
    fireEvent.click(within(wrenCard as HTMLElement).getByRole("button", { name: "Equipment & loadout" }));
    expect(useRoute.getState()).toMatchObject({
      route: "loadout",
      params: { storyId: "s1", characterId: "a1" },
    });
  });

  it("keeps equipment navigation hidden for No Stats stories", async () => {
    const kestrel = card({ characterId: "p1", name: "Kestrel Vane", isPlayer: true });
    setBridge(
      fakeBridge(
        [{ characterId: "p1", name: "Kestrel Vane", isPlayer: true, alive: true }],
        new Map([["p1", kestrel]]),
        "none"
      )
    );

    render(<Characters storyId="s-prose" />);

    expect(await screen.findByRole("button", { name: "Open full profile →" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Equipment & loadout" })).not.toBeInTheDocument();
  });

  it("surfaces a load failure as an error notice", async () => {
    const bridge = {
      async listPresentCast() {
        throw new Error("cast folder unreadable");
      },
      async getLivingCard() {
        return undefined;
      },
      async getStory() {
        return { schema: { statMode: "full" } };
      },
    } as unknown as CoreBridge;
    setBridge(bridge);

    render(<Characters storyId="s-broken" />);
    await waitFor(() => expect(screen.getByText("Couldn't reach the story's cast")).toBeInTheDocument());
    expect(screen.getByText("cast folder unreadable")).toBeInTheDocument();
  });
});
