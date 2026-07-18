/**
 * ResourceBar tests: fill coloring by fraction and the explicit wounded flag.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResourceBar, resourceFillColor } from "../../src/components/ResourceBar";

describe("resourceFillColor", () => {
  it("is success at high fraction", () => {
    expect(resourceFillColor(0.8, false, 0.25, 0.5)).toBe("var(--success)");
  });
  it("is caution gold in the mid band", () => {
    expect(resourceFillColor(0.4, false, 0.25, 0.5)).toBe("var(--crit-gold)");
  });
  it("is failure at or below the low threshold", () => {
    expect(resourceFillColor(0.2, false, 0.25, 0.5)).toBe("var(--failure)");
  });
  it("is failure when wounded regardless of fraction", () => {
    expect(resourceFillColor(0.95, true, 0.25, 0.5)).toBe("var(--failure)");
  });
});

describe("ResourceBar", () => {
  it("renders the label uppercased and the current/max value", () => {
    render(<ResourceBar label="Health" current={19} max={24} animate={false} />);
    expect(screen.getByTestId("resource-bar")).toHaveTextContent("HEALTH");
    expect(screen.getByTestId("resource-value")).toHaveTextContent("19 / 24");
  });

  it("uses the failure color at low fraction (wounded coloring)", () => {
    render(<ResourceBar label="Health" current={5} max={24} animate={false} />);
    expect(screen.getByTestId("resource-fill")).toHaveAttribute("data-fill", "var(--failure)");
  });

  it("uses success color at high fraction", () => {
    render(<ResourceBar label="Health" current={19} max={24} animate={false} />);
    expect(screen.getByTestId("resource-fill")).toHaveAttribute("data-fill", "var(--success)");
  });

  it("honors the explicit wounded flag even when full", () => {
    render(<ResourceBar label="Health" current={24} max={24} wounded animate={false} />);
    expect(screen.getByTestId("resource-bar")).toHaveAttribute("data-wounded", "true");
    expect(screen.getByTestId("resource-fill")).toHaveAttribute("data-fill", "var(--failure)");
  });

  it("exposes meter ARIA values", () => {
    render(<ResourceBar label="Stamina" current={10} max={14} animate={false} />);
    const meter = screen.getByRole("meter");
    expect(meter).toHaveAttribute("aria-valuenow", "10");
    expect(meter).toHaveAttribute("aria-valuemax", "14");
  });
});
