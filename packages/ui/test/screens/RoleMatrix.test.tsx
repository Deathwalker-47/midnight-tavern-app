import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
});
