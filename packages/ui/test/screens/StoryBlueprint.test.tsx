import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  getBridge,
  makeMemoryBridge,
  setBridge,
  type CoreBridge,
  type MappedCard,
} from "../../src/bridge/core";
import { StoryBlueprint } from "../../src/screens/StoryBlueprint";
import { useStoriesStore } from "../../src/state/storiesStore";
import { useSettingsStore } from "../../src/state/settingsStore";
import { useRoute } from "../../src/app/router";

beforeEach(async () => {
  globalThis.localStorage?.clear();
  const bridge = makeMemoryBridge();
  await bridge.savePersona({
    id: "persona-kestrel",
    name: "Kestrel Vane",
    description: "A patient courier, practiced climber, and reluctant duelist.",
    isDefault: true,
  });
  setBridge(bridge);
  useRoute.setState({ route: "blueprint", params: {} });
  useStoriesStore.setState({
    stories: [],
    status: "ready",
    current: undefined,
    currentStatus: "idle",
    forging: false,
    draft: {
      title: "Ash Road",
      playerName: "Kestrel",
      premise: "A courier crosses a road where pilgrims vanish.",
      blueprint: {
        name: "The Bell Keeper",
        scenario: "A ruined monastery waits above the pass.",
        firstMessage: "The bell rings beneath a moonless sky.",
        systemPrompt: "Write restrained gothic prose.",
        postHistoryInstructions: "Keep the bell audible in quiet scenes.",
      },
    },
  });
  useSettingsStore.setState({
    setupState: { validatedProviders: ["openrouter"], rolesConfirmed: true, dismissed: false },
    entitlement: { canCreateStory: true, via: "trial" },
  });
});

describe("StoryBlueprint create flow", () => {
  it("exposes the full authoring fields before a story is forged", async () => {
    render(<StoryBlueprint />);
    await screen.findByRole("combobox", { name: "Persona for story creation" });
    expect(screen.getByRole("textbox", { name: "Story title" })).toHaveValue("Ash Road");
    expect(screen.getByRole("combobox", { name: "Point of view" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /narration control/i }));
    expect(screen.getByDisplayValue("Write restrained gothic prose.")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Keep the bell audible in quiet scenes.")).toBeInTheDocument();
  });

  it("persists the blueprint and selected opening when forging", async () => {
    render(<StoryBlueprint />);
    expect(
      await screen.findByRole("combobox", { name: "Persona for story creation" })
    ).toHaveValue("persona-kestrel");
    fireEvent.click(screen.getByRole("button", { name: /full stats/i }));
    fireEvent.click(screen.getByRole("button", { name: /forge this world/i }));
    await waitFor(() => expect(useStoriesStore.getState().current?.title).toBe("Ash Road"), { timeout: 2500 });
    expect(useStoriesStore.getState().current?.blueprint?.systemPrompt).toBe("Write restrained gothic prose.");
    const storyId = useStoriesStore.getState().current!.id;
    expect(await getBridge().getActivePersona(storyId)).toMatchObject({
      id: "persona-kestrel",
      name: "Kestrel Vane",
    });
  });

  it("propagates the reviewed persona and preserved card source into the forge", async () => {
    const sourceCard: NonNullable<MappedCard["sourceCard"]> = {
      spec: "chara_card_v2",
      specVersion: "2.0",
      data: {
        name: "The Bell Keeper",
        description: "{{char}} recognizes {{user}}.",
        personality: "Watchful",
        scenario: "{{user}} reaches the monastery.",
        first_mes: "A bell sounds.",
        mes_example: "",
        tags: [],
        alternate_greetings: [],
      },
    };
    const importedMechanics: NonNullable<MappedCard["importedMechanics"]> = {
      version: 1,
      accepted: false,
      reviewRequired: true,
      attributes: [],
      skills: [],
      actions: [],
      warnings: [],
    };
    const importedCard: MappedCard = {
      sourceCard,
      name: "The Bell Keeper",
      premise: "Imported preview",
      identity: { traits: ["Watchful"], likes: [], dislikes: [] },
      openings: ["A bell sounds."],
      lorebook: [],
      blueprint: { name: "The Bell Keeper" },
      importedMechanics,
    };
    useStoriesStore.setState((state) => ({
      draft: {
        ...state.draft!,
        playerName: "",
        importedCard,
      },
    }));
    const bridge = getBridge();
    const createStory = vi.fn(bridge.createStory.bind(bridge));
    setBridge({ ...bridge, createStory } as CoreBridge);

    render(<StoryBlueprint />);
    expect(
      await screen.findByRole("combobox", { name: "Persona for story creation" })
    ).toHaveValue("persona-kestrel");
    fireEvent.click(screen.getByRole("button", { name: /full stats/i }));
    fireEvent.click(screen.getByRole("button", { name: /forge this world/i }));

    await waitFor(() => expect(createStory).toHaveBeenCalledOnce(), { timeout: 2500 });
    expect(createStory.mock.calls[0]![0]).toMatchObject({
      playerName: "Kestrel Vane",
      persona: {
        id: "persona-kestrel",
        name: "Kestrel Vane",
        description: "A patient courier, practiced climber, and reluctant duelist.",
      },
      sourceCard,
      importedMechanics,
      acceptImportedMechanics: true,
    });
  });

  it("blocks forging without a persona until the warning is explicitly acknowledged", async () => {
    await getBridge().deletePersona("persona-kestrel");
    render(<StoryBlueprint />);

    expect(await screen.findByText("No persona is attached")).toBeInTheDocument();
    const forge = screen.getByRole("button", { name: /forge this world/i });
    expect(forge).toBeDisabled();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /continue without a persona/i,
      })
    );
    expect(forge).not.toBeDisabled();
  });

  it("lets the user cancel a stalled forge without losing the draft", async () => {
    const bridge = makeMemoryBridge();
    await bridge.savePersona({
      id: "persona-kestrel",
      name: "Kestrel Vane",
      description: "A patient courier, practiced climber, and reluctant duelist.",
      isDefault: true,
    });
    setBridge({
      ...bridge,
      createStory: async (args) => new Promise((_resolve, reject) => {
        args.onProgress?.("phase-a");
        args.signal?.addEventListener("abort", () => {
          const error = new Error("cancelled");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      }),
    });
    render(<StoryBlueprint />);
    await screen.findByRole("combobox", { name: "Persona for story creation" });
    fireEvent.click(screen.getByRole("button", { name: /full stats/i }));
    fireEvent.click(screen.getByRole("button", { name: /forge this world/i }));
    const cancel = await screen.findByRole("button", { name: /cancel forge/i });
    fireEvent.click(cancel);
    await waitFor(() => expect(screen.getByText(/forging was cancelled/i)).toBeInTheDocument());
    expect(useStoriesStore.getState().draft?.title).toBe("Ash Road");
    expect(useStoriesStore.getState().forging).toBe(false);
  });

  it("restores a durable retained forge after leaving and re-entering creation", async () => {
    const bridge = getBridge();
    await (bridge as any).saveForgeOperation({
      version: 1,
      operationId: "story-blueprint-resume",
      kind: "story-create",
      storyId: "story-blueprint-resume",
      status: "cancelled",
      phase: "phase-b",
      attempt: 1,
      elapsedMs: 8_000,
      detail: "Mechanics core retained.",
      startedAt: 1_000,
      updatedAt: 9_000,
      checkpoint: {
        startedAt: 1_000,
        sourceFingerprint: "bootstrap-v1-blueprint-resume",
        latestCompletedFragment: "mechanics-core",
      },
      request: {
        storyId: "story-blueprint-resume",
        title: "Recovered Blueprint",
        premise: "A courier returns to a monastery that vanished at dawn.",
        playerName: "Kestrel Vane",
        statMode: "full",
        persona: {
          id: "persona-kestrel",
          name: "Kestrel Vane",
          description: "A patient courier, practiced climber, and reluctant duelist.",
        },
        blueprint: { name: "The Vanished Bell" },
      },
    });
    useStoriesStore.setState({ draft: undefined });

    render(<StoryBlueprint />);

    expect(await screen.findByDisplayValue("Recovered Blueprint")).toBeInTheDocument();
    expect(screen.getAllByText(/mechanics core retained/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /resume retained forge/i })).toBeInTheDocument();
  });
});
