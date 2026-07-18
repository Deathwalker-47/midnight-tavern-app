/**
 * Wizard screen — smoke tests for the premise-entry and trial-gate branches (§02 + flagship flow
 * 1). Drives the stores directly; no bridge call is made (the forge path is exercised via the
 * store's own tests, not here — these cover the two non-forging renders and the forge-disabled
 * gate on a short premise).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Wizard } from "../../src/screens/Wizard";
import { useStoriesStore } from "../../src/state/storiesStore";
import { useSettingsStore } from "../../src/state/settingsStore";
import type { TrialStatus } from "../../src/bridge/core";

const expiredTrial: TrialStatus = { startedAt: 0, expiresAt: 1, active: false, daysRemaining: 0 };

beforeEach(() => {
  useStoriesStore.setState({ forging: false });
  useSettingsStore.setState({ entitlement: { canCreateStory: true, via: "trial" } });
});

describe("Wizard", () => {
  it("renders the premise entry with name field and seed chips", () => {
    render(<Wizard />);
    expect(screen.getByText("What world shall we forge?")).toBeInTheDocument();
    expect(screen.getByLabelText(/your name in the story/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ash-buried pilgrim road/i })).toBeInTheDocument();
  });

  it("keeps Forge disabled until the premise is long enough", () => {
    render(<Wizard />);
    const forge = screen.getByRole("button", { name: /forge this world/i });
    expect(forge).toBeDisabled();

    // A seed chip fills a full premise → forge enables.
    fireEvent.click(screen.getByRole("button", { name: /drowned city returns/i }));
    expect(screen.getByRole("button", { name: /forge this world/i })).not.toBeDisabled();
  });

  it("shows the trial-gate upsell instead of the form when creation is blocked", () => {
    useSettingsStore.setState({
      entitlement: { canCreateStory: false, reason: "trial-expired", trial: expiredTrial },
    });
    render(<Wizard />);
    expect(screen.getByText(/your trial has ended/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /enter a license key/i })).toBeInTheDocument();
    expect(screen.queryByText("What world shall we forge?")).toBeNull();
  });

  it("shows the forging interstitial while a forge is in flight", () => {
    useStoriesStore.setState({ forging: true });
    render(<Wizard />);
    expect(screen.getByText("Forging your story")).toBeInTheDocument();
  });
});
