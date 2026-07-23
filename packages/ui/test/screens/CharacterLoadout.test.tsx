import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CharacterLoadout } from "../../src/screens/CharacterLoadout";
import {
  setBridge,
  type CharacterInventoryView,
  type CoreBridge,
  type Dossier,
} from "../../src/bridge/core";
import { useRoute } from "../../src/app/router";

function dossier(): Dossier {
  return {
    characterId: "kestrel",
    isPlayer: true,
    identity: { name: "Kestrel Vane", whatTheyAre: "A courier turned swordhand" },
    mentality: { traits: [], behavioralSignatures: [] },
    currentState: {},
    past: { observations: [] },
    relationships: { outgoing: [], incoming: [] },
    sheet: {
      attributes: [],
      resources: [],
      skills: [],
      inventory: [],
      alive: true,
    },
    involvedThreads: [],
  };
}

function inventory(): CharacterInventoryView {
  return {
    definitions: [
      {
        id: "vale-saber",
        storyId: "story",
        name: "Vale saber",
        description: "A courier's working blade, balanced for the road.",
        kind: "weapon",
        tier: "rare",
        slotCompatibility: ["primary"],
        handsRequired: 1,
        unique: false,
        effects: [{ type: "skill_check", skillId: "blade", amount: 2 }],
        props: {},
        tags: ["blade"],
        createdAt: "2026-07-24T00:00:00.000Z",
        configVersion: 1,
      },
    ],
    instances: [
      {
        id: "saber-instance",
        storyId: "story",
        definitionId: "vale-saber",
        ownerCharacterId: "kestrel",
        quantity: 1,
        acquiredAt: "2026-07-24T00:00:00.000Z",
        provenance: {
          sourceType: "combat",
          sourceLabel: "Crypt duel",
          rulingId: "ruling-1",
          turnId: "turn-1",
          tierBudget: "rare",
          eligibilityReasons: ["Defeated the grave-wight."],
          policyVersion: 1,
          grantedAt: "2026-07-24T00:00:00.000Z",
        },
      },
    ],
    assignments: [
      {
        characterId: "kestrel",
        slot: "primary",
        itemInstanceId: "saber-instance",
      },
    ],
  };
}

afterEach(async () => {
  await act(async () => {
    useRoute.setState({ route: "library", params: {} });
  });
});

describe("CharacterLoadout", () => {
  it("shows the seven-slot loadout and selected item details, with a route back to the dossier", async () => {
    const bridge = {
      async getStory() {
        return { schema: { statMode: "full" } };
      },
      async getCharacterInventory() {
        return inventory();
      },
      async getCharacterDossier() {
        return dossier();
      },
      async equipItem() {
        return [];
      },
      async unequipSlot() {
        return [];
      },
    } as unknown as CoreBridge;
    setBridge(bridge);
    useRoute.setState({
      route: "loadout",
      params: { storyId: "story", characterId: "kestrel" },
    });

    await act(async () => {
      render(<CharacterLoadout storyId="story" />);
    });

    expect(await screen.findByText("7 UNIVERSAL SLOTS")).toBeInTheDocument();
    expect(screen.getByText("ACCESSORY I")).toBeInTheDocument();
    expect(screen.getByText("ACCESSORY II")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Vale saber/ }));
    expect(screen.getByText("A courier's working blade, balanced for the road.")).toBeInTheDocument();
    expect(screen.getByText("blade checks +2")).toBeInTheDocument();
    expect(screen.getByText("RARE")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "← Full profile" }));
    expect(useRoute.getState()).toMatchObject({
      route: "dossier",
      params: { storyId: "story", characterId: "kestrel" },
    });
  });
});
