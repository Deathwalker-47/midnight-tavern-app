/**
 * Personas screen tests: the empty first-run state and a load-error state. Both drive the screen
 * through a stubbed bridge (setBridge) so the render is deterministic and offline.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { Personas } from "../../src/screens/Personas";
import { setBridge, makeMemoryBridge } from "../../src/bridge/core";
import type { CoreBridge, PersonaRecord } from "../../src/bridge/core";

/** Build a bridge whose persona methods are overridable; everything else falls back to the memory stub. */
function stubBridge(overrides: Partial<CoreBridge>): CoreBridge {
  return Object.assign(makeMemoryBridge(), overrides);
}

afterEach(cleanup);

describe("Personas — empty state", () => {
  beforeEach(() => {
    setBridge(stubBridge({ listPersonas: async (): Promise<PersonaRecord[]> => [] }));
  });

  it("invites the user to create their first persona", async () => {
    render(<Personas />);
    await waitFor(() => expect(screen.getByTestId("personas-screen")).toHaveAttribute("data-status", "ready"));
    expect(screen.getByText("No personas yet")).toBeInTheDocument();
    // The empty state offers a primary create action.
    expect(screen.getByRole("button", { name: /Create a persona/i })).toBeInTheDocument();
  });
});

describe("Personas — load error state", () => {
  beforeEach(() => {
    setBridge(
      stubBridge({
        listPersonas: async (): Promise<PersonaRecord[]> => {
          throw new Error("network unreachable");
        },
      })
    );
  });

  it("shows a network error notice with a retry affordance", async () => {
    render(<Personas />);
    await waitFor(() => expect(screen.getByTestId("personas-screen")).toHaveAttribute("data-status", "error"));
    expect(screen.getByText("Couldn't load your personas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Try again/i })).toBeInTheDocument();
  });
});
