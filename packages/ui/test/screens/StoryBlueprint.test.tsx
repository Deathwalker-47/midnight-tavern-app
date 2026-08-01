import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  getBridge,
  makeMemoryBridge,
  setBridge,
  type CoreBridge,
  type ForgeOperationRecord,
  type MappedCard,
} from "../../src/bridge/core";
import { StoryBlueprint } from "../../src/screens/StoryBlueprint";
import { useStoriesStore } from "../../src/state/storiesStore";
import { useSettingsStore } from "../../src/state/settingsStore";
import { useRoute } from "../../src/app/router";

function retainedForgeOperation(): ForgeOperationRecord {
  return {
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
  };
}

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
    expect(screen.getByRole("button", { name: /start new forge/i })).toBeInTheDocument();
  });

  it("restores a durable retained forge after leaving and re-entering creation", async () => {
    const bridge = getBridge();
    await bridge.saveForgeOperation(retainedForgeOperation());
    const createStory = vi.fn(bridge.createStory.bind(bridge));
    setBridge({ ...bridge, createStory } as CoreBridge);
    useStoriesStore.setState({ draft: undefined });

    render(<StoryBlueprint />);

    expect(await screen.findByDisplayValue("Recovered Blueprint")).toBeInTheDocument();
    expect(screen.getAllByText(/mechanics core retained/i).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /resume saved forge/i }));
    await waitFor(() => expect(createStory).toHaveBeenCalledOnce(), { timeout: 2_500 });
    expect(createStory.mock.calls[0]![0]).toMatchObject({
      storyId: "story-blueprint-resume",
      resume: {
        sourceFingerprint: "bootstrap-v1-blueprint-resume",
        latestCompletedFragment: "mechanics-core",
      },
    });
  });

  it("keeps a freshly imported card and does not let a stale retained Forge hijack it", async () => {
    // A previous "Recovered Blueprint" create failed and left a retained Forge in storage. The user
    // then imports a different card. The import is the deliberate intent and must win; the stale
    // retained Forge must not overwrite the form (the reported "always shows the old story" bug).
    const bridge = getBridge();
    await bridge.saveForgeOperation(retainedForgeOperation());
    setBridge(bridge);
    const importedCard: MappedCard = {
      name: "The Mojave",
      premise: "The Mojave Wasteland — 2281 AD. A dying stretch of desert caught between empires.",
      identity: { traits: [], likes: [], dislikes: [] },
      openings: ["A courier wakes with two bullets dug out of their skull."],
      lorebook: [],
      blueprint: {
        name: "The Mojave",
        firstMessage: "A courier wakes with two bullets dug out of their skull.",
      },
    };
    useStoriesStore.setState({
      draft: {
        title: "The Mojave",
        playerName: "",
        premise: "The Mojave Wasteland — 2281 AD. A dying stretch of desert caught between empires.",
        blueprint: {
          name: "The Mojave",
          firstMessage: "A courier wakes with two bullets dug out of their skull.",
        },
        selectedOpening: "A courier wakes with two bullets dug out of their skull.",
        importedCard,
      },
    });

    render(<StoryBlueprint />);

    await screen.findByRole("combobox", { name: "Persona for story creation" });
    expect(screen.getByRole("textbox", { name: "Story title" })).toHaveValue("The Mojave");
    expect(screen.getByRole("textbox", { name: "Premise" })).toHaveValue(
      "The Mojave Wasteland — 2281 AD. A dying stretch of desert caught between empires."
    );
    // The stale retained Forge must not have overwritten the imported fields, nor turned the
    // primary action into a resume of the old story.
    expect(screen.queryByDisplayValue("Recovered Blueprint")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /forge this world/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /resume saved forge/i })).not.toBeInTheDocument();
  });

  it("starts a genuinely new Forge without reusing the retained request or checkpoint", async () => {
    const bridge = getBridge();
    await bridge.saveForgeOperation(retainedForgeOperation());
    const createStory = vi.fn(bridge.createStory.bind(bridge));
    setBridge({ ...bridge, createStory } as CoreBridge);
    useStoriesStore.setState({ draft: undefined });

    render(<StoryBlueprint />);

    await screen.findByDisplayValue("Recovered Blueprint");
    fireEvent.click(screen.getByRole("button", { name: /start new forge/i }));

    await waitFor(() => expect(createStory).toHaveBeenCalledOnce(), { timeout: 2_500 });
    const request = createStory.mock.calls[0]![0];
    expect(request.storyId).not.toBe("story-blueprint-resume");
    expect(request.resume).toBeUndefined();
  });

  it("clears the retained operation before saving the fresh Forge operation", async () => {
    const bridge = getBridge();
    await bridge.saveForgeOperation(retainedForgeOperation());
    const order: string[] = [];
    let releaseClear!: () => void;
    const clearGate = new Promise<void>((resolve) => {
      releaseClear = resolve;
    });
    const clearForgeOperation = vi.fn(async (operationId: string) => {
      order.push(`clear:${operationId}:started`);
      if (operationId === "story-blueprint-resume") await clearGate;
      await bridge.clearForgeOperation(operationId);
      order.push(`clear:${operationId}:finished`);
    });
    const saveForgeOperation = vi.fn(async (operation: ForgeOperationRecord) => {
      order.push(`save:${operation.operationId}`);
      await bridge.saveForgeOperation(operation);
    });
    setBridge({ ...bridge, clearForgeOperation, saveForgeOperation } as CoreBridge);
    useStoriesStore.setState({ draft: undefined });

    render(<StoryBlueprint />);

    await screen.findByDisplayValue("Recovered Blueprint");
    fireEvent.click(screen.getByRole("button", { name: /start new forge/i }));
    await waitFor(() => expect(clearForgeOperation).toHaveBeenCalledWith("story-blueprint-resume"));
    expect(saveForgeOperation).not.toHaveBeenCalled();

    releaseClear();
    await waitFor(() => expect(saveForgeOperation).toHaveBeenCalledOnce());
    expect(order[0]).toBe("clear:story-blueprint-resume:started");
    expect(order[1]).toBe("clear:story-blueprint-resume:finished");
    expect(order[2]).toMatch(/^save:(?!story-blueprint-resume$).+/);
  });
});
