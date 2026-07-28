/**
 * StorySettings screen — smoke tests for the no-story and error branches, plus the loaded render
 * with the sealed-rulebook banner and the read-only rulebook facts. Drives the stores directly; a
 * minimal frozen schema stands in for a bootstrapped story.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { StorySettings } from "../../src/screens/StorySettings";
import { useStoriesStore } from "../../src/state/storiesStore";
import { useSettingsStore } from "../../src/state/settingsStore";
import type { StoryRecord, RoleMap } from "../../src/bridge/core";

const roleMap = {
  narrator: { provider: "openrouter", model: "anthropic/claude-sonnet-4" },
  classifier: { provider: "openrouter", model: "openai/gpt-4o-mini" },
  analyzer: { provider: "openrouter", model: "openai/gpt-4o-mini" },
  summarizer: { provider: "openrouter", model: "openai/gpt-4o" },
  bootstrapper: { provider: "openrouter", model: "anthropic/claude-sonnet-4" },
} as unknown as RoleMap;

function story(id: string, locked = true): StoryRecord {
  return {
    id,
    title: "Embers of the Silent Vale",
    createdAt: 1,
    locked,
    schema: {
      statMode: "full",
      premise: "…",
      skills: [{ id: "blade", name: "Blade Adept", description: "Swordwork.", tier: "combat" }],
      actions: [{ id: "attack", label: "Strike", category: "combat", dc: 12 }],
    } as unknown as StoryRecord["schema"],
  };
}

beforeEach(() => {
  useStoriesStore.setState({ current: undefined, currentStatus: "idle" });
  useSettingsStore.setState({
    roleMap,
    knownModels: [
      {
        provider: "openrouter",
        model: "anthropic/claude-sonnet-4",
        label: "Claude Sonnet 4",
        tier: "recommended",
        supportsJsonMode: true,
      },
    ],
  });
});

describe("StorySettings", () => {
  // Each render mounts an effect that async-loads the global action/loot configs; flush it with a
  // trailing `act` so the settling setState doesn't fire outside `act` after the test ends.
  const flush = () => act(async () => {});

  it("with no storyId shows the no-story empty state", async () => {
    render(<StorySettings />);
    expect(screen.getByText("No story open")).toBeInTheDocument();
    await flush();
  });

  it("with an error status shows the error notice and retry", async () => {
    useStoriesStore.setState({ currentStatus: "error" });
    render(<StorySettings storyId="s1" />);
    expect(screen.getByTestId("storysettings-error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    await flush();
  });

  it("renders the sealed-rulebook banner and read-only catalog when loaded", async () => {
    useStoriesStore.setState({ current: story("s1"), currentStatus: "ready" });
    render(<StorySettings storyId="s1" />);
    expect(screen.getByTestId("storysettings-locked")).toBeInTheDocument();
    expect(screen.getByText("The rulebook is sealed")).toBeInTheDocument();
    // Read-only catalog surfaces the frozen schema's skill + action.
    expect(screen.getByText("Blade Adept")).toBeInTheDocument();
    expect(screen.getByText("Strike")).toBeInTheDocument();
    expect(screen.getByText("DC 12")).toBeInTheDocument();
    await flush();
  });

  it("offers a danger-zone delete when loaded", async () => {
    useStoriesStore.setState({ current: story("s1"), currentStatus: "ready" });
    render(<StorySettings storyId="s1" />);
    expect(screen.getByRole("button", { name: /delete story/i })).toBeInTheDocument();
    await flush();
  });
});
