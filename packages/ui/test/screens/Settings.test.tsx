/**
 * Settings screen tests. Uses the real in-memory bridge (its stub validators are deterministic:
 * a "sk-bad…" key is rejected, others are accepted; an "MT-…" license validates). We reset the
 * bridge and the settings store between tests so each starts from a fresh, unlicensed install.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { Settings } from "../../src/screens/Settings";
import { setBridge, makeMemoryBridge } from "../../src/bridge/core";
import { useSettingsStore } from "../../src/state/settingsStore";

beforeEach(() => {
  setBridge(makeMemoryBridge());
  // Reset the store to its initial (unloaded) shape so `load()` runs fresh each test.
  useSettingsStore.setState({
    providerConfigs: {},
    keyStates: {},
    roleMap: undefined,
    knownModels: [],
    providerIds: [],
    license: { status: "unlicensed" },
    trial: undefined,
    entitlement: undefined,
    loaded: false,
  });
});

describe("Settings screen", () => {
  it("renders the settings and local diagnostics sections once loaded", async () => {
    render(<Settings />);
    await waitFor(() => expect(screen.getByText("Providers & keys")).toBeInTheDocument());
    expect(screen.getByText("Model roles")).toBeInTheDocument();
    expect(screen.getByText("License")).toBeInTheDocument();
    expect(screen.getByText("Diagnostics")).toBeInTheDocument();
    expect(screen.getByText(/Nothing is uploaded/i)).toBeInTheDocument();
    // A provider card per known provider id (OpenRouter is present + recommended).
    expect(screen.getByText("OpenRouter")).toBeInTheDocument();
  });

  it("renders a row for each of the five model roles", async () => {
    render(<Settings />);
    await waitFor(() => expect(screen.getByText("Model roles")).toBeInTheDocument());
    for (const label of ["Narrator", "Classifier", "Analyzer", "Summarizer", "Bootstrapper"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("validates a good key to the valid state (check + balance)", async () => {
    render(<Settings />);
    await waitFor(() => expect(screen.getByText("OpenRouter")).toBeInTheDocument());

    const orCard = screen.getByText("OpenRouter").closest("section")!;
    const input = within(orCard).getByPlaceholderText("sk-or-…") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "sk-or-good-key" } });

    const validateBtn = within(orCard).getByRole("button", { name: /validate/i });
    fireEvent.click(validateBtn);

    // The stub validator resolves after a short delay → valid, with a balance readout.
    await waitFor(() => expect(within(orCard).getByText(/balance/i)).toBeInTheDocument(), { timeout: 2000 });
    expect(orCard).toHaveAttribute("data-state", "valid");
  });

  it("shows the rejected state + reason for a bad key", async () => {
    render(<Settings />);
    await waitFor(() => expect(screen.getByText("OpenRouter")).toBeInTheDocument());

    const orCard = screen.getByText("OpenRouter").closest("section")!;
    const input = within(orCard).getByPlaceholderText("sk-or-…") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "sk-bad-key" } });
    fireEvent.click(within(orCard).getByRole("button", { name: /validate/i }));

    await waitFor(() => expect(orCard).toHaveAttribute("data-state", "rejected"), { timeout: 2000 });
    expect(within(orCard).getByText(/rejected this key/i)).toBeInTheDocument();
  });

  it("accepts a license key and flips the panel to Licensed", async () => {
    render(<Settings />);
    await waitFor(() => expect(screen.getByText("License")).toBeInTheDocument());

    const input = screen.getByPlaceholderText("MT-…") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "MT-ABC-123" } });
    fireEvent.click(screen.getByRole("button", { name: /license key/i }));

    await waitFor(() => expect(screen.getByText("Licensed")).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByRole("button", { name: /remove license/i })).toBeInTheDocument();
  });

  it("rejects a bad license key with an error notice", async () => {
    render(<Settings />);
    await waitFor(() => expect(screen.getByText("License")).toBeInTheDocument());

    const input = screen.getByPlaceholderText("MT-…") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "not-a-license" } });
    fireEvent.click(screen.getByRole("button", { name: /license key/i }));

    await waitFor(() => expect(screen.getByText("That key was rejected")).toBeInTheDocument(), { timeout: 2000 });
  });

  it("requires and persists an explicit Primary replacement before disconnecting", async () => {
    const bridge = makeMemoryBridge();
    await bridge.setProviderConfig("openrouter", { apiKey: "sk-or-connected" });
    await bridge.setProviderConfig("openai", { apiKey: "sk-openai-connected" });
    setBridge(bridge);

    render(<Settings />);
    const openRouterCard = (await screen.findByText("OpenRouter")).closest("section")!;
    const openAiCard = screen.getByText("OpenAI").closest("section")!;
    await waitFor(() => expect(within(openRouterCard).getByText("PRIMARY")).toBeInTheDocument());

    fireEvent.click(within(openRouterCard).getByRole("button", { name: "Disconnect" }));
    expect(screen.getByTestId("primary-replacement-openrouter")).toBeInTheDocument();
    expect(screen.getByLabelText("Replacement Primary provider")).toHaveValue("openai");

    fireEvent.click(screen.getByRole("button", { name: "Replace & disconnect" }));
    await waitFor(() => expect(within(openAiCard).getByText("PRIMARY")).toBeInTheDocument());
    expect(await bridge.getPrimaryProvider()).toBe("openai");
    expect((await bridge.getProviderConfigs()).openrouter).toBeUndefined();
  });
});
