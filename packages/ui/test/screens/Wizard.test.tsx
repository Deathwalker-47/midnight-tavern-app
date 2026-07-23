/**
 * Wizard screen — smoke tests for the premise-entry and trial-gate branches (§02 + flagship flow
 * 1). Drives the stores directly; no bridge call is made (the forge path is exercised via the
 * store's own tests, not here — these cover the two non-forging renders and the forge-disabled
 * gate on a short premise).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Wizard } from "../../src/screens/Wizard";
import { useStoriesStore } from "../../src/state/storiesStore";
import { useSettingsStore } from "../../src/state/settingsStore";
import {
  makeMemoryBridge,
  setBridge,
  type TrialStatus,
} from "../../src/bridge/core";

const expiredTrial: TrialStatus = { startedAt: 0, expiresAt: 1, active: false, daysRemaining: 0 };

beforeEach(() => {
  setBridge(makeMemoryBridge());
  useStoriesStore.setState({ forging: false, draft: undefined });
  useSettingsStore.setState({ entitlement: { canCreateStory: true, via: "trial" } });
});

async function renderWizard(): Promise<void> {
  await act(async () => {
    render(<Wizard />);
  });
}

describe("Wizard", () => {
  it("renders the premise entry with name field and seed chips", async () => {
    await renderWizard();
    expect(screen.getByText("What world shall we forge?")).toBeInTheDocument();
    expect(screen.getByLabelText(/your name in the story/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ash-buried pilgrim road/i })).toBeInTheDocument();
  });

  it("requires a sufficient premise and explicit persona review before Forge", async () => {
    await renderWizard();
    const review = screen.getByRole("button", { name: /review before forge/i });
    expect(review).toBeDisabled();

    // A seed chip fills a full premise → review enables.
    fireEvent.click(screen.getByRole("button", { name: /drowned city returns/i }));
    expect(review).not.toBeDisabled();
    fireEvent.click(review);

    // Persona context is a deliberate safeguard; the user must attach one or acknowledge absence.
    const forge = screen.getByRole("button", { name: /forge this world/i });
    expect(forge).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /continue without a persona/i,
      })
    );
    expect(forge).not.toBeDisabled();
  });

  it("defaults to the saved persona and retains the reviewed selection in the creation draft", async () => {
    const bridge = makeMemoryBridge();
    await bridge.savePersona({
      id: "persona-ari",
      name: "Ari Vale",
      description: "An observant infiltrator who avoids unnecessary violence.",
      isDefault: true,
    });
    setBridge(bridge);

    await renderWizard();

    expect(await screen.findByLabelText(/play as - persona/i)).toHaveValue("persona-ari");
    expect(screen.getByText("Ari Vale is attached")).toBeInTheDocument();
    await waitFor(() =>
      expect(useStoriesStore.getState().draft?.personaId).toBe("persona-ari")
    );
  });

  it("shows the trial-gate upsell instead of the form when creation is blocked", async () => {
    useSettingsStore.setState({
      entitlement: { canCreateStory: false, reason: "trial-expired", trial: expiredTrial },
    });
    await renderWizard();
    expect(screen.getByText(/your trial has ended/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /enter a license key/i })).toBeInTheDocument();
    expect(screen.queryByText("What world shall we forge?")).toBeNull();
  });

  it("shows the forging interstitial while a forge is in flight", async () => {
    useStoriesStore.setState({ forging: true });
    await renderWizard();
    expect(screen.getByText("Forging your story")).toBeInTheDocument();
  });
});
