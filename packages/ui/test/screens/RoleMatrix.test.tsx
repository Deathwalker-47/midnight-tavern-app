import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { makeMemoryBridge, setBridge } from "../../src/bridge/core";
import { RoleMatrix } from "../../src/screens/RoleMatrix";
import { useSettingsStore } from "../../src/state/settingsStore";

beforeEach(() => {
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

describe("RoleMatrix", () => {
  it("warns for a structured role using a model without JSON mode, but not for the narrator", async () => {
    const bridge = makeMemoryBridge();
    const roleMap = await bridge.getRoleMap();
    const jsonRiskModel = {
      provider: "anthropic" as const,
      model: "claude-sonnet-4-20250514",
      source: "custom" as const,
    };

    await bridge.setRoleMap({
      ...roleMap,
      narrator: { ...roleMap.narrator, ...jsonRiskModel },
      classifier: { ...roleMap.classifier, ...jsonRiskModel },
    });
    setBridge(bridge);

    render(<RoleMatrix />);

    const classifierWarning = await screen.findByTestId("json-risk-classifier");
    expect(within(classifierWarning).getByRole("status")).toHaveAttribute("data-severity", "warn");
    expect(screen.queryByTestId("json-risk-narrator")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByTestId("rolematrix-loading")).not.toBeInTheDocument());
  });

  it("shows config-versioned recommended parameters instead of screen-local defaults", async () => {
    const bridge = makeMemoryBridge();
    setBridge(bridge);
    render(<RoleMatrix />);

    await waitFor(() => expect(screen.queryByTestId("rolematrix-loading")).not.toBeInTheDocument());
    fireEvent.click(screen.getAllByRole("button", { name: /Samplers/i })[0]!);
    expect(screen.getByText(/Recommended parameters · config v1/i)).toHaveTextContent(
      "temperature 0.8"
    );
    expect(screen.getByText(/Recommended parameters · config v1/i)).toHaveTextContent(
      "maxTokens 1200"
    );
  });

  it("marks an unavailable custom selection and resets it from the recommendation config", async () => {
    const bridge = makeMemoryBridge();
    await bridge.setProviderConfig("openrouter", { apiKey: "sk-or-connected" });
    const roleMap = await bridge.getRoleMap();
    await bridge.setRoleMap({
      ...roleMap,
      narrator: {
        ...roleMap.narrator,
        model: "custom/not-live",
        source: "custom",
        samplersDirty: true,
      },
    });
    setBridge(bridge);

    render(<RoleMatrix />);
    expect(await screen.findByTestId("model-unavailable-narrator")).toBeInTheDocument();
    expect(screen.getByTestId("model-fit-state-narrator")).toHaveTextContent("Custom selection");

    fireEvent.click(
      within(screen.getByTestId("model-fit-state-narrator")).getByRole("button", {
        name: "Reset role to recommended",
      })
    );
    await waitFor(() =>
      expect(useSettingsStore.getState().roleMap?.narrator).toMatchObject({
        provider: "openrouter",
        model: "anthropic/claude-sonnet-4",
        source: "recommended",
        samplersDirty: false,
      })
    );
  });
});
