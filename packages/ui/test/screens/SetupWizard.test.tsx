import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { makeMemoryBridge, setBridge } from "../../src/bridge/core";
import { SetupWizard } from "../../src/screens/SetupWizard";
import { useSettingsStore } from "../../src/state/settingsStore";
import { useRoute } from "../../src/app/router";

beforeEach(() => {
  setBridge(makeMemoryBridge());
  useRoute.setState({ route: "setup", params: {} });
  useSettingsStore.setState({
    providerConfigs: {},
    keyStates: {},
    roleMap: undefined,
    knownModels: [],
    providerIds: [],
    providerModels: {},
    modelStates: {},
    setupState: { validatedProviders: [], rolesConfirmed: false, dismissed: false },
    license: { status: "unlicensed" },
    trial: undefined,
    entitlement: undefined,
    loaded: false,
  });
});

describe("SetupWizard", () => {
  it("starts with OpenRouter and keeps the V3 provider order", async () => {
    render(<SetupWizard />);
    const provider = await screen.findByRole("combobox", { name: "Provider" });
    expect(Array.from((provider as HTMLSelectElement).options).slice(0, 4).map((option) => option.value)).toEqual([
      "openrouter",
      "electronhub",
      "nanogpt",
      "openai",
    ]);
  });

  it("shows separate URL and API-key fields for a custom endpoint", async () => {
    render(<SetupWizard />);
    const provider = await screen.findByRole("combobox", { name: "Provider" });
    fireEvent.change(provider, { target: { value: "custom" } });
    expect(screen.getByRole("textbox", { name: "Custom endpoint base URL" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Paste your API key")).toBeInTheDocument();
  });

  it("requires a validated provider and explicit model confirmation", async () => {
    render(<SetupWizard />);
    await screen.findByRole("combobox", { name: "Provider" });
    fireEvent.change(screen.getByPlaceholderText("Paste your API key"), { target: { value: "sk-or-good" } });
    fireEvent.click(screen.getByRole("button", { name: /connect and load models/i }));

    await screen.findByText("Narrator", {}, { timeout: 2500 });
    expect(useSettingsStore.getState().setupState.validatedProviders).toEqual(["openrouter"]);
    expect(useSettingsStore.getState().setupState.rolesConfirmed).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: /confirm models and finish/i }));
    await waitFor(() => expect(useSettingsStore.getState().setupState.rolesConfirmed).toBe(true));
  });

  it("rebinds every untouched default role to Electron Hub after it is the first connected provider", async () => {
    render(<SetupWizard />);
    const provider = await screen.findByRole("combobox", { name: "Provider" });
    fireEvent.change(provider, { target: { value: "electronhub" } });
    fireEvent.change(screen.getByPlaceholderText("Paste your API key"), { target: { value: "ek-good" } });
    fireEvent.click(screen.getByRole("button", { name: /connect and load models/i }));

    await screen.findByText("Narrator", {}, { timeout: 2500 });
    const roleMap = useSettingsStore.getState().roleMap!;
    expect(Object.values(roleMap).every((binding) => binding.provider === "electronhub")).toBe(true);
    expect(Object.values(roleMap).every((binding) => binding.model === "electronhub/default-model")).toBe(true);
    expect(screen.getByRole("button", { name: /confirm models and finish/i })).toBeEnabled();
  });

  it("repairs an existing confirmed install whose saved roles reference an unconfigured provider", async () => {
    const bridge = makeMemoryBridge();
    await bridge.setProviderConfig("electronhub", { apiKey: "ek-existing" });
    await bridge.setSetupState({ validatedProviders: ["electronhub"], rolesConfirmed: true, dismissed: false });
    setBridge(bridge);

    await useSettingsStore.getState().load();

    const state = useSettingsStore.getState();
    expect(Object.values(state.roleMap!).every((binding) => binding.provider === "electronhub")).toBe(true);
    expect(state.setupState.rolesConfirmed).toBe(true);
  });

  it("blocks confirmation while any role still lacks configured credentials", async () => {
    const bridge = makeMemoryBridge();
    await bridge.setSetupState({ validatedProviders: ["electronhub"], rolesConfirmed: false, dismissed: false });
    setBridge(bridge);
    useSettingsStore.setState({
      setupState: { validatedProviders: ["electronhub"], rolesConfirmed: false, dismissed: false },
    });

    render(<SetupWizard />);

    expect(await screen.findByText("Finish configuring the model roles")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm models and finish/i })).toBeDisabled();
  });
});
