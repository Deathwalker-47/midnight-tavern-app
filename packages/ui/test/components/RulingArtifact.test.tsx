/**
 * RulingArtifact state tests. Animation is disabled (`animate={false}`) so final values render
 * immediately and are assertable without fake timers.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RulingArtifact } from "../../src/components/RulingArtifact";
import type { RulingRoll } from "../../src/components/RulingArtifact";

function roll(overrides: Partial<RulingRoll> = {}): RulingRoll {
  return { title: "Persuade the warden", outcome: "success", d20: 14, modifier: 3, total: 17, dc: 15, ...overrides };
}

describe("RulingArtifact", () => {
  it("denied renders no die and shows the reason + hint", () => {
    render(
      <RulingArtifact
        variant="denied"
        reason="Requires Lockpicking — not learned."
        hint="Find a trainer in the market."
        animate={false}
      />
    );
    expect(screen.queryByTestId("ruling-die")).toBeNull();
    expect(screen.getByTestId("ruling-denied-glyph")).toHaveTextContent("⊘");
    expect(screen.getByTestId("ruling-reason")).toHaveTextContent("Requires Lockpicking");
    expect(screen.getByTestId("ruling-hint")).toHaveTextContent("trainer");
  });

  it("success renders the SUCCESS verdict and the success color", () => {
    render(<RulingArtifact variant="success" roll={roll()} animate={false} />);
    expect(screen.getByTestId("ruling-stamp")).toHaveTextContent("SUCCESS");
    const stamp = screen.getByTestId("ruling-stamp");
    expect(stamp).toHaveStyle({ color: "var(--success)" });
    // Total renders immediately when animation is off.
    expect(screen.getByTestId("ruling-total")).toHaveTextContent("17");
  });

  it("failure renders the FAILURE verdict and the failure color", () => {
    render(<RulingArtifact variant="failure" roll={roll({ outcome: "failure", d20: 6, modifier: 1, total: 7, dc: 13 })} animate={false} />);
    const stamp = screen.getByTestId("ruling-stamp");
    expect(stamp).toHaveTextContent("FAILURE");
    expect(stamp).toHaveStyle({ color: "var(--failure)" });
  });

  it("crit-success renders CRITICAL, crit-gold, and a ring only when animating", () => {
    const { rerender } = render(
      <RulingArtifact variant="crit-success" roll={roll({ outcome: "crit-success", d20: 20, total: 23, dc: 13 })} animate={false} />
    );
    const stamp = screen.getByTestId("ruling-stamp");
    expect(stamp).toHaveTextContent("CRITICAL");
    expect(stamp).toHaveStyle({ color: "var(--crit-gold)" });
    // No ring burst when animation disabled.
    expect(screen.queryByTestId("ruling-ring")).toBeNull();

    // With animation on (and matchMedia defaulting to no-reduced-motion), the ring appears.
    rerender(
      <RulingArtifact variant="crit-success" roll={roll({ outcome: "crit-success", d20: 20, total: 23, dc: 13 })} animate />
    );
    expect(screen.getByTestId("ruling-ring")).toBeTruthy();
  });

  it("crit-failure uses the crimson color and CRIT FAIL stamp", () => {
    render(<RulingArtifact variant="crit-failure" roll={roll({ outcome: "crit-failure", d20: 1, modifier: 2, total: 3, dc: 15 })} animate={false} />);
    const stamp = screen.getByTestId("ruling-stamp");
    expect(stamp).toHaveTextContent("CRIT FAIL");
    expect(stamp).toHaveStyle({ color: "var(--crit-crimson)" });
  });

  it("opposed renders the two-sided contest line instead of the flat math", () => {
    render(
      <RulingArtifact
        variant="opposed"
        roll={roll({ outcome: "success", opposed: { attacker: "Stealth 16", defender: "Perception 12" } })}
        animate={false}
      />
    );
    expect(screen.getByTestId("ruling-math")).toHaveTextContent("Stealth 16 vs Perception 12");
  });

  it("stacked renders two rolls (two dice, two stamps)", () => {
    render(
      <RulingArtifact
        variant="stacked"
        rolls={[
          roll({ title: "Bandit strikes", outcome: "success", d20: 15, total: 18, dc: 14, stamp: "HIT" }),
          roll({ title: "Kestrel ripostes", outcome: "crit-success", d20: 20, total: 24, dc: 13, stamp: "CRITICAL" }),
        ]}
        animate={false}
      />
    );
    expect(screen.getAllByTestId("ruling-die")).toHaveLength(2);
    const stamps = screen.getAllByTestId("ruling-stamp");
    expect(stamps).toHaveLength(2);
    expect(stamps[0]).toHaveTextContent("HIT");
    expect(stamps[1]).toHaveTextContent("CRITICAL");
  });

  it("animation-disabled renders the final total immediately (no count-up from 0)", () => {
    render(<RulingArtifact variant="success" roll={roll({ total: 21 })} animate={false} />);
    expect(screen.getByTestId("ruling-total")).toHaveTextContent("21");
  });

  it("renders the register label and optional result + effect lines", () => {
    render(
      <RulingArtifact
        variant="success"
        roll={roll()}
        resultLine="The warden steps aside."
        effectLine="Persuasion → adept"
        animate={false}
      />
    );
    expect(screen.getByTestId("ruling-label")).toHaveTextContent("RULING · SUCCESS");
    expect(screen.getByTestId("ruling-result")).toHaveTextContent("steps aside");
    expect(screen.getByTestId("ruling-effect")).toHaveTextContent("adept");
  });

  it("offers a non-sending edit route for an action-budget refusal", () => {
    const onEditRetry = vi.fn();
    render(
      <RulingArtifact
        variant="budget-exceeded"
        reason="This turn allows 2 actions; the extra action was refused."
        onEditRetry={onEditRetry}
        animate={false}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Edit original turn" }));
    expect(onEditRetry).toHaveBeenCalledOnce();
  });
});
