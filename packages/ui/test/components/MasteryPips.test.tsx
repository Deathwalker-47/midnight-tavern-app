/**
 * MasteryPips tests: filled-count per rank and the recently-advanced gold dot.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MasteryPips, pipsForRank } from "../../src/components/MasteryPips";

describe("MasteryPips", () => {
  it("fills the right number of pips per rank", () => {
    expect(pipsForRank("novice")).toBe(1);
    expect(pipsForRank("adept")).toBe(3);
    expect(pipsForRank("expert")).toBe(5);
    expect(pipsForRank("master")).toBe(5);
  });

  it("novice renders 1 filled + 4 empty pips of 5", () => {
    render(<MasteryPips rank="novice" />);
    expect(screen.getAllByTestId("pip-filled")).toHaveLength(1);
    expect(screen.getAllByTestId("pip-empty")).toHaveLength(4);
  });

  it("adept renders 3 filled + 2 empty", () => {
    render(<MasteryPips rank="adept" />);
    expect(screen.getAllByTestId("pip-filled")).toHaveLength(3);
    expect(screen.getAllByTestId("pip-empty")).toHaveLength(2);
  });

  it("expert renders all 5 filled", () => {
    render(<MasteryPips rank="expert" />);
    expect(screen.getAllByTestId("pip-filled")).toHaveLength(5);
    expect(screen.queryAllByTestId("pip-empty")).toHaveLength(0);
  });

  it("shows a gold advanced dot on the newest pip when recentlyAdvanced", () => {
    render(<MasteryPips rank="adept" recentlyAdvanced animate={false} />);
    const dot = screen.getByTestId("pip-advanced-dot");
    expect(dot).toBeTruthy();
    // The advanced pip is the 3rd (index 2) for adept.
    const advancedPip = document.querySelector('[data-advanced="true"]');
    expect(advancedPip).not.toBeNull();
    expect(advancedPip).toHaveStyle({ color: "var(--crit-gold)" });
  });

  it("shows no advanced dot when not recentlyAdvanced", () => {
    render(<MasteryPips rank="adept" />);
    expect(screen.queryByTestId("pip-advanced-dot")).toBeNull();
  });

  it("renders the modifier when showModifier is set", () => {
    render(<MasteryPips rank="master" showModifier />);
    expect(screen.getByTestId("mastery-pips")).toHaveTextContent("+7");
  });
});
