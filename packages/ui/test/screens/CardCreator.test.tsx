/**
 * CardCreator screen tests: the idle/empty first state and an import error state (a failed
 * URL import surfaces the error notice). Both use a stubbed bridge via setBridge.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { CardCreator } from "../../src/screens/CardCreator";
import { setBridge, makeMemoryBridge } from "../../src/bridge/core";
import type { CoreBridge, CardImportResult } from "../../src/bridge/core";

function stubBridge(overrides: Partial<CoreBridge>): CoreBridge {
  return Object.assign(makeMemoryBridge(), overrides);
}

afterEach(cleanup);

describe("CardCreator — idle/empty state", () => {
  beforeEach(() => {
    setBridge(makeMemoryBridge());
  });

  it("starts idle with the import affordances and no preview", () => {
    render(<CardCreator />);
    expect(screen.getByTestId("cardcreator-screen")).toHaveAttribute("data-phase", "idle");
    expect(screen.getByTestId("choose-file")).toBeInTheDocument();
    expect(screen.getByTestId("url-input")).toBeInTheDocument();
    expect(screen.queryByTestId("card-preview")).not.toBeInTheDocument();
  });
});

describe("CardCreator — import error state", () => {
  beforeEach(() => {
    setBridge(
      stubBridge({
        importCardFromUrl: async (): Promise<CardImportResult> => {
          throw new Error("network request failed");
        },
      })
    );
  });

  it("surfaces the error notice when a URL import fails", async () => {
    render(<CardCreator />);
    fireEvent.change(screen.getByTestId("url-input"), {
      target: { value: "https://example.com/character.json" },
    });
    fireEvent.click(screen.getByTestId("import-url"));

    await waitFor(() => expect(screen.getByTestId("cardcreator-screen")).toHaveAttribute("data-phase", "error"));
    expect(screen.getByTestId("import-error")).toBeInTheDocument();
    expect(screen.getByText("Couldn't reach that URL")).toBeInTheDocument();
    expect(screen.getByTestId("import-retry")).toBeInTheDocument();
  });
});
