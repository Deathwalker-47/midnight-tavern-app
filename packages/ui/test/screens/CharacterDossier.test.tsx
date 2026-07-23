import { afterEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { CharacterDossier } from "../../src/screens/CharacterDossier";
import { setBridge, type CoreBridge, type Dossier } from "../../src/bridge/core";
import { useRoute } from "../../src/app/router";

function dossier(): Dossier {
  return {
    characterId: "kestrel",
    isPlayer: true,
    identity: { name: "Kestrel Vane", whatTheyAre: "A weathered swordhand" },
    mentality: { traits: [], behavioralSignatures: [] },
    currentState: {},
    past: { observations: [] },
    relationships: { outgoing: [], incoming: [] },
    sheet: {
      attributes: [],
      resources: [],
      skills: [
        {
          skillId: "blade",
          name: "Blade",
          definition: "Swordplay guided by timing and trained footwork.",
          tier: "common",
          rank: "adept",
          successCount: 99,
          xp: 120,
          toNext: 180,
          nextRankXp: 300,
          permits: ["Expert+: Perform a measured counter-strike."],
          linkedAttribute: "Dexterity",
          linkedActions: [
            {
              actionId: "master_strike",
              label: "Master strike",
              category: "combat",
              description: "A precise high-rank blade attack.",
              minRank: "expert",
              governingAttribute: "Dexterity",
            },
          ],
          latestAward: {
            xp: 20,
            reason: "Defeated the grave-wight in a close duel.",
            turnIdx: 7,
          },
        },
      ],
      inventory: [],
      alive: true,
    },
    involvedThreads: [],
  };
}

afterEach(async () => {
  await act(async () => {
    useRoute.setState({ route: "library", params: {} });
  });
});

describe("CharacterDossier skill progression", () => {
  it("renders schema-backed definitions and actions with cumulative XP thresholds", async () => {
    const bridge = {
      async getCharacterDossier() {
        return dossier();
      },
      async getStory() {
        return { schema: { statMode: "full" } };
      },
    } as unknown as CoreBridge;
    setBridge(bridge);
    useRoute.setState({
      route: "dossier",
      params: { storyId: "story", characterId: "kestrel" },
    });

    await act(async () => {
      render(<CharacterDossier storyId="story" />);
    });

    expect(
      await screen.findByText("Swordplay guided by timing and trained footwork.")
    ).toBeInTheDocument();
    expect(screen.getByText("120 / 300 XP")).toBeInTheDocument();
    expect(screen.getByText(/Expert\+: Perform a measured counter-strike/)).toBeInTheDocument();
    expect(screen.getByText(/Master strike — A precise high-rank blade attack/)).toBeInTheDocument();
    expect(screen.getByText("+20 XP")).toBeInTheDocument();
    expect(screen.getByText("Defeated the grave-wight in a close duel.")).toBeInTheDocument();
    expect(screen.getByText("Turn 7")).toBeInTheDocument();
    expect(screen.queryByText(/99 \/ 279 XP/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open loadout →" }));
    expect(useRoute.getState()).toMatchObject({
      route: "loadout",
      params: { storyId: "story", characterId: "kestrel" },
    });
  });
});
