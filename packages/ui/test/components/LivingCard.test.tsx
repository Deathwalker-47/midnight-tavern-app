/**
 * LivingCard conditions (plan 08, S8b): timed statuses, actions still recovering, and how each skill
 * works (passive, toggle with its state, reaction), in both the compact and the full card.
 */
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { LivingCardView as CoreLivingCardView } from "@midnight-tavern/core";
import { LivingCard, LivingCardView } from "../../src/components/LivingCard";

const card = (overrides: Partial<CoreLivingCardView> = {}): CoreLivingCardView => ({
  characterId: "kestrel",
  name: "Kestrel",
  isPlayer: true,
  alive: true,
  attributes: [],
  resources: [{ id: "hp", label: "Health", current: 12, max: 20, playerVisible: true }],
  inventory: [],
  skills: [
    { skillId: "blade", name: "Blade", rank: "novice" },
    { skillId: "keen_eye", name: "Keen Eye", rank: "novice", kind: "passive" },
    { skillId: "trance", name: "Trance", rank: "novice", kind: "toggle", switchedOn: true },
    { skillId: "focus", name: "Focus", rank: "novice", kind: "toggle", switchedOn: false },
    { skillId: "riposte", name: "Riposte", rank: "novice", kind: "reaction" },
  ],
  statuses: [{ id: "poisoned", label: "Poisoned", remainingTurns: 2, summary: "Health -2/turn" }],
  cooldowns: [{ actionId: "flame_wave", label: "Flame Wave", turns: 3 }],
  ...overrides,
});

describe("LivingCard conditions", () => {
  it("show statuses with their effect and recovering actions on the full card", () => {
    render(<LivingCardView card={card()} animate={false} />);
    const conditions = screen.getByTestId("living-card-conditions");
    expect(within(conditions).getByText("CONDITIONS")).toBeInTheDocument();
    expect(conditions).toHaveTextContent("Poisoned · 2T · Health -2/turn");
    expect(conditions).toHaveTextContent("Flame Wave · recovering 3T");
    expect(screen.getAllByTestId("skill-kind").map((tag) => tag.textContent)).toEqual([
      "PASSIVE",
      "TOGGLE · ON",
      "TOGGLE · OFF",
      "REACTION",
    ]);
  });

  it("show the same facts more tersely on the compact card", () => {
    render(<LivingCard card={card()} animate={false} />);
    const conditions = screen.getByTestId("living-card-conditions");
    expect(within(conditions).queryByText("CONDITIONS")).toBeNull();
    expect(conditions).toHaveTextContent("Poisoned · 2T");
    expect(conditions).not.toHaveTextContent("Health -2/turn");
    // The compact card lists the first four skills.
    expect(screen.getAllByTestId("skill-kind").map((tag) => tag.textContent)).toEqual([
      "PASSIVE",
      "TOGGLE · ON",
      "TOGGLE · OFF",
    ]);
  });

  it("show nothing extra for a character without conditions or a card from an older bridge", () => {
    render(<LivingCardView card={card({ statuses: [], cooldowns: [] })} animate={false} />);
    expect(screen.queryByTestId("living-card-conditions")).toBeNull();
    const { unmount } = render(
      <LivingCard card={card({ statuses: undefined, cooldowns: undefined, skills: [] })} animate={false} />
    );
    expect(screen.queryByTestId("living-card-conditions")).toBeNull();
    unmount();
    render(
      <LivingCardView
        card={card({ statuses: [{ id: "marked", label: "Marked", remainingTurns: 1, summary: "" }], cooldowns: [] })}
        animate={false}
      />
    );
    expect(screen.getByTestId("living-card-conditions")).toHaveTextContent("Marked · 1T");
  });
});
