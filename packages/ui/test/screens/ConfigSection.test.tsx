/**
 * ConfigSection (plan 09 §4c.6–4c.11): what the config load found, errors before warnings; the
 * folder and per-file restore; and the per-story lock, with a warning before following edits.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ConfigSection } from "../../src/screens/storySettings/ConfigSection";
import { makeMemoryBridge, setBridge } from "../../src/bridge/core";
import type { ConfigOverrideStatus, CoreBridge, StoryRecord } from "../../src/bridge/core";

const story = (rulebookConfig?: "follow") =>
  ({
    id: "s1",
    title: "Story",
    createdAt: 0,
    locked: true,
    schema: { statMode: "full" },
    ...(rulebookConfig ? { configSnapshot: { rulebookConfig } } : {}),
  }) as unknown as StoryRecord;

const loaded: ConfigOverrideStatus = {
  supported: true,
  folder: "/data/config",
  overridden: ["universal-pool.json"],
  issues: [
    { file: "universal-pool.json", severity: "warning", id: "uni.a.b.c", message: "Unbalanced." },
    { file: "universal-pool.json", severity: "error", id: "uni.x.y.z", field: "name", message: "Required; this new entry was left out." },
  ],
};

let bridge: CoreBridge;
beforeEach(() => {
  bridge = Object.assign(makeMemoryBridge(), {
    configOverrideStatus: vi.fn(async () => loaded),
    reloadConfigOverrides: vi.fn(async () => ({ ...loaded, issues: [] })),
    restoreConfigDefaults: vi.fn(async () => ({ ...loaded, overridden: [], issues: [] })),
    openConfigFolder: vi.fn(async () => {}),
    setRulebookConfigMode: vi.fn(async () => story("follow")),
  } satisfies Partial<CoreBridge>);
  setBridge(bridge);
});

describe("ConfigSection", () => {
  it("lists what was skipped before what is only a warning, naming file, id and field", async () => {
    render(<ConfigSection story={story()} onModeChanged={() => {}} />);
    const issues = within(await screen.findByTestId("config-issues")).getAllByRole("listitem");
    expect(issues.map((issue) => issue.textContent)).toEqual([
      "SKIPPEDuniversal-pool.json · uni.x.y.z · nameRequired; this new entry was left out.",
      "WARNINGuniversal-pool.json · uni.a.b.cUnbalanced.",
    ]);
    expect(screen.getByText("/data/config")).toBeInTheDocument();
    expect(screen.getByText("applied")).toBeInTheDocument();
  });

  it("opens the folder, reloads, and restores one file's defaults", async () => {
    render(<ConfigSection story={story()} onModeChanged={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Open config folder" }));
    await waitFor(() => expect(bridge.openConfigFolder).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Reload files" }));
    await waitFor(() => expect(screen.queryByTestId("config-issues")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Restore defaults for universal-pool.json" }));
    await waitFor(() => expect(bridge.restoreConfigDefaults).toHaveBeenCalledWith("pool"));
    expect(await screen.findByText("No override files — every story is using the shipped defaults.")).toBeInTheDocument();
  });

  it("warns before following edits, and locks again without asking", async () => {
    const onModeChanged = vi.fn();
    const { rerender } = render(<ConfigSection story={story()} onModeChanged={onModeChanged} />);
    expect(await screen.findByRole("radio", { name: /Locked to creation/ })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /Follow my edits/ }));
    expect(screen.getByText("Let this story follow your config edits?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Keep it locked" }));
    expect(bridge.setRulebookConfigMode).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("radio", { name: /Follow my edits/ }));
    fireEvent.click(screen.getByRole("button", { name: "Follow my edits" }));
    await waitFor(() => expect(bridge.setRulebookConfigMode).toHaveBeenCalledWith("s1", "follow"));
    expect(onModeChanged).toHaveBeenCalledTimes(1);

    rerender(<ConfigSection story={story("follow")} onModeChanged={onModeChanged} />);
    expect(screen.getByRole("radio", { name: /Follow my edits/ })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /Locked to creation/ }));
    await waitFor(() => expect(bridge.setRulebookConfigMode).toHaveBeenCalledWith("s1", "locked"));
  });

  it("says when files are desktop-only, when the folder failed, and when an action failed", async () => {
    setBridge(
      Object.assign(makeMemoryBridge(), {
        setRulebookConfigMode: vi.fn(async () => Promise.reject(new Error("disk full"))),
      })
    );
    const { unmount } = render(<ConfigSection story={story("follow")} onModeChanged={() => {}} />);
    expect(await screen.findByText("Config files are available in the desktop app.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open config folder" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Locked to creation/ }));
    expect(await screen.findByText("disk full")).toBeInTheDocument();
    unmount();

    setBridge(
      Object.assign(makeMemoryBridge(), {
        configOverrideStatus: vi.fn(async () => ({ ...loaded, issues: [], overridden: [], error: "The config folder could not be read: denied" })),
      })
    );
    render(<ConfigSection story={story()} onModeChanged={() => {}} />);
    expect(await screen.findByText("The config folder could not be read: denied")).toBeInTheDocument();
  });
});
