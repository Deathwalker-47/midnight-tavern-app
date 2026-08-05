import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { makeMemoryBridge, setBridge } from "../../src/bridge/core";
import { Diagnostics } from "../../src/screens/Diagnostics";

beforeEach(() => {
  setBridge(makeMemoryBridge());
});

describe("Diagnostics", () => {
  it("explains the opt-in and shows no counters while diagnostics are disabled", async () => {
    render(<Diagnostics />);

    await screen.findByText(/currently off/i);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders one row per persisted counter once diagnostics are enabled", async () => {
    const bridge = makeMemoryBridge();
    await bridge.setDiagnosticsEnabled(true);
    bridge.__seedDiagnosticCounters({
      "turn.completed": 3,
      "gate.denied.cannot_afford": 1,
    });
    setBridge(bridge);

    render(<Diagnostics />);

    const rows = await screen.findAllByRole("row");
    // One header row + one row per counter key.
    expect(rows.length).toBe(3);
    expect(screen.getByText("turn.completed")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("gate.denied.cannot_afford")).toBeInTheDocument();
  });
});
