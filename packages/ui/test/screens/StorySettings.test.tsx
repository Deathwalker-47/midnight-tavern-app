/**
 * StorySettings screen — smoke tests for the no-story and error branches, plus the loaded render
 * with the sealed-rulebook banner and the read-only rulebook facts. Drives the stores directly; a
 * minimal frozen schema stands in for a bootstrapped story.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act, fireEvent, waitFor, within } from "@testing-library/react";
import { StorySettings } from "../../src/screens/StorySettings";
import { useStoriesStore } from "../../src/state/storiesStore";
import { useSettingsStore } from "../../src/state/settingsStore";
import { makeMemoryBridge, setBridge } from "../../src/bridge/core";
import type {
  BootstrapResumeState,
  CoreBridge,
  StoryRecord,
  RoleMap,
} from "../../src/bridge/core";

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
  setBridge(makeMemoryBridge());
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
    expect(screen.getByText("combat · DC 12")).toBeInTheDocument();
    expect(screen.getAllByText("written for this story")).toHaveLength(2);
    await flush();
  });

  it("catalogues forged and enabled entries with provenance, filters and a detail view", async () => {
    const bridge = makeMemoryBridge();
    setBridge(bridge);
    const { story: created } = await bridge.createStory({
      storyId: "pool",
      title: "Pool",
      premise: "A fading kingdom.",
      playerName: "Ari",
      statMode: "full",
    });
    await bridge.enablePoolEntry("pool", "uni.social.persuasion.persuade");
    await bridge.enablePoolEntry("pool", "uni.magic.fire_magic.fire_bolt");
    useStoriesStore.setState({ current: created, currentStatus: "ready" });
    render(<StorySettings storyId="pool" />);

    const catalogue = within(await screen.findByTestId("rulebook-catalogue"));
    expect(await catalogue.findByText("Persuade")).toBeInTheDocument();
    expect(catalogue.getAllByText("added by you")).toHaveLength(3);
    const visible = () => catalogue.getAllByRole("button", { expanded: false }).map((button) => button.textContent);

    fireEvent.change(catalogue.getByLabelText("Filter by kind"), { target: { value: "skill" } });
    expect(visible()).toEqual([expect.stringContaining("Fire Magic")]);
    fireEvent.change(catalogue.getByLabelText("Filter by kind"), { target: { value: "all" } });
    fireEvent.change(catalogue.getByLabelText("Filter by category"), { target: { value: "social" } });
    expect(visible()).toEqual([expect.stringContaining("Persuade")]);
    fireEvent.change(catalogue.getByLabelText("Filter by category"), { target: { value: "all" } });
    fireEvent.change(catalogue.getByLabelText("Filter by tier"), { target: { value: "common" } });
    expect(visible()).toEqual([expect.stringContaining("Fire Magic")]);
    fireEvent.change(catalogue.getByLabelText("Filter by tier"), { target: { value: "all" } });
    fireEvent.change(catalogue.getByLabelText("Search the rulebook catalogue"), { target: { value: "zzz" } });
    expect(catalogue.getByText("Nothing in this story's catalogue matches.")).toBeInTheDocument();
    fireEvent.change(catalogue.getByLabelText("Search the rulebook catalogue"), { target: { value: "bolt" } });
    expect(visible()).toEqual([expect.stringContaining("Fire Bolt")]);

    fireEvent.click(catalogue.getByRole("button", { name: /Fire Bolt/ }));
    const bolt = within(catalogue.getByTestId("catalogue-detail-uni.magic.fire_magic.fire_bolt"));
    expect(bolt.getByText("Skill: Fire Magic")).toBeInTheDocument();
    expect(bolt.getByText("2 Mana per attempt")).toBeInTheDocument();
    expect(bolt.getByText("One target")).toBeInTheDocument();
    expect(bolt.getByText("OUTCOME TABLE")).toBeInTheDocument();
    const success = within(bolt.getByText("SUCCESS").closest("tr")!);
    expect(success.getByText(/^Target -\d+ Health/)).toBeInTheDocument();
    expect(success.getByText(/^“.+”$/)).toBeInTheDocument();

    fireEvent.change(catalogue.getByLabelText("Search the rulebook catalogue"), { target: { value: "" } });
    fireEvent.click(catalogue.getByRole("button", { name: /Fire Magic/ }));
    const magic = within(catalogue.getByTestId("catalogue-detail-uni.magic.fire_magic.fire_magic"));
    expect(magic.getByText("Active — unlocks and improves actions")).toBeInTheDocument();
    expect(magic.getByText("Fire Bolt")).toBeInTheDocument();

    // Disabling in the pool browser drops the entry from the catalogue.
    fireEvent.click(await screen.findByRole("button", { name: /^Persuasion & Negotiation/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Disable Persuade" }));
    await waitFor(() => expect(catalogue.queryByText("Persuade")).toBeNull());
    await flush();
  });

  it("offers a danger-zone delete when loaded", async () => {
    useStoriesStore.setState({ current: story("s1"), currentStatus: "ready" });
    render(<StorySettings storyId="s1" />);
    expect(screen.getByRole("button", { name: /delete story/i })).toBeInTheDocument();
    await flush();
  });

  it("keeps the current rulebook visible after a failed replacement and retries from its checkpoint", async () => {
    const checkpoint: BootstrapResumeState = {
      startedAt: 77,
      sourceFingerprint: "sealed-source-v1",
    };
    const regenerateRulebook = vi.fn(
      async (args: Parameters<CoreBridge["regenerateRulebook"]>[0]) => {
        if (regenerateRulebook.mock.calls.length === 1) {
          args.onCheckpoint?.(checkpoint);
          throw new Error("replacement provider unavailable");
        }
        return { ...story("s1-copy"), title: "Embers of the Silent Vale — regenerated" };
      }
    );
    setBridge(
      Object.assign(makeMemoryBridge(), {
        previewRulebookRegenerationImpact: vi.fn(async () => ({
          attributes: 2,
          skills: 1,
          skillProgressions: 1,
          storyActions: 1,
          universalActions: 1,
          resources: 1,
          flags: 0,
          runtimeItemDefinitions: 1,
          runtimeItemInstances: 1,
          equippedSlots: 1,
          actionBudget: 2,
          rulings: 3,
          journalEvents: 2,
          checkpoints: 1,
          characters: 1,
        })),
        regenerateRulebook,
      })
    );
    useStoriesStore.setState({ current: story("s1"), currentStatus: "ready" });

    render(<StorySettings storyId="s1" />);

    fireEvent.change(screen.getByLabelText("Story title"), {
      target: { value: "Unsaved working title" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Regenerate rulebook/ }));
    fireEvent.click(
      await screen.findByRole("button", { name: /Duplicate & regenerate/ })
    );

    expect(await screen.findByText("Replacement rolled back")).toBeInTheDocument();
    expect(screen.getByText("Blade Adept")).toBeInTheDocument();
    expect(screen.getByText("Strike")).toBeInTheDocument();
    expect(screen.getByLabelText("Story title")).toHaveValue("Unsaved working title");
    expect(regenerateRulebook.mock.calls[0]?.[0].resume).toBeUndefined();

    fireEvent.click(screen.getByRole("button", { name: "Retry failed fragment" }));

    await waitFor(() => expect(regenerateRulebook).toHaveBeenCalledTimes(2));
    expect(regenerateRulebook.mock.calls[1]?.[0]).toMatchObject({
      storyId: "s1",
      mode: "duplicate",
      resume: checkpoint,
    });
    expect(await screen.findByText("Rulebook replacement installed")).toBeInTheDocument();
  });
});
