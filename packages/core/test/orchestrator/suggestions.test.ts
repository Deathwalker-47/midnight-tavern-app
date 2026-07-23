import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ChatResponse,
  Role,
  RoleBinding,
  RolePrompt,
  Router,
  StreamHandler,
} from "../../src/router/index.js";
import {
  SuggestionGenerationError,
  suggestPlayerActions,
} from "../../src/orchestrator/suggestions.js";
import { assemblePlayerSuggestionContext } from "../../src/orchestrator/context.js";
import { openStore, type Store } from "../../src/store/index.js";
import type { CharacterSoftState, StoryRecord } from "../../src/types/index.js";
import { makePlayer, makeStory } from "../fixtures.js";

const STORY_ID = "story-suggestions";

function soft(
  characterId: string,
  name: string,
  current: CharacterSoftState["current"] = {}
): CharacterSoftState {
  return {
    characterId,
    name,
    tier: "primary",
    identity: { traits: [], likes: [], dislikes: [] },
    behavioralSignatures: [],
    current,
    relationships: [],
    observations: [],
  };
}

class SuggestionRouter implements Router {
  readonly prompts: RolePrompt[] = [];
  private index = 0;

  constructor(private readonly responses: string[]) {}

  bindingFor(_role: Role): RoleBinding {
    return {
      provider: "openrouter",
      model: "test",
      source: "recommended",
      samplersDirty: false,
    };
  }

  async complete(_role: Role, prompt: RolePrompt): Promise<ChatResponse> {
    this.prompts.push(prompt);
    const content =
      this.responses[Math.min(this.index, this.responses.length - 1)] ?? "";
    this.index += 1;
    return { content };
  }

  async stream(
    _role: Role,
    _prompt: RolePrompt,
    _onDelta: StreamHandler
  ): Promise<ChatResponse> {
    throw new Error("Suggestions never stream.");
  }
}

async function seedStory(statMode: "full" | "none" = "full"): Promise<{
  store: Store;
  story: StoryRecord;
}> {
  const store = await openStore(":memory:");
  const schema = makeStory({ storyId: STORY_ID, statMode });
  const story: StoryRecord = {
    id: STORY_ID,
    title: "Deadweight",
    createdAt: 0,
    schema,
    locked: true,
    actionBudget: 2,
  };
  await store.stories.insert(story);
  await store.characters.insert({
    id: "kestrel",
    storyId: STORY_ID,
    name: "Kestrel",
    isPlayer: true,
    hard: makePlayer(),
    soft: soft("kestrel", "Kestrel", {
      location: "mill",
      mood: "wary",
      goal: "understand the burden",
    }),
    softTier: "primary",
  });
  await store.characters.insert({
    id: "sorel",
    storyId: STORY_ID,
    name: "Sorel",
    isPlayer: false,
    hard: {
      characterId: "sorel",
      isPlayer: false,
      attributes: {},
      resources: { hp: { current: 10, max: 10 } },
      skills: [],
      inventory: [],
      flags: {},
      alive: true,
    },
    soft: soft("sorel", "Sorel", {
      location: "mill",
      mood: "suspicious",
      goal: "learn what happened",
    }),
    softTier: "primary",
  });
  const oldOpening =
    "ANCIENT_CARAVAN_PROLOGUE " +
    "Old road history and distant armies. ".repeat(180);
  await store.messages.insert({
    id: "opening",
    storyId: STORY_ID,
    idx: 0,
    role: "narrator",
    content:
      `${oldOpening}\n` +
      "Sorel braces against the mill door and demands to know why absorbing the burden healed Kestrel.",
    createdAt: 0,
  });
  return { store, story };
}

const groundedResponse = JSON.stringify({
  suggestions: [
    { kind: "dialogue", text: "Ask Sorel why the burden healed you." },
    { kind: "move", text: "Step away from the mill door while watching Sorel." },
    {
      kind: "action",
      text: "Search the room near Sorel for signs of the burden.",
      actionId: "search_room",
    },
    { kind: "dialogue", text: "Tell Sorel the burden changed inside the mill." },
    { kind: "move", text: "Examine the mill door beside Sorel." },
  ],
});

describe("context-grounded possible moves", () => {
  const stores: Store[] = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(stores.splice(0).map((store) => store.close()));
  });

  it("uses the live tail of a long opening and filters actions through the real gate", async () => {
    const { store, story } = await seedStory();
    stores.push(store);

    const context = await assemblePlayerSuggestionContext(store, story);

    expect(context.latestNarrator).toContain("Sorel braces against the mill door");
    expect(context.latestNarrator).not.toContain("ANCIENT_CARAVAN_PROLOGUE");
    expect(context.sceneAnchors).toContain("sorel");
    expect(context.sceneAnchors).toContain("burden");
    expect(context.availableActions.map((action) => action.id)).toContain("search_room");
    expect(context.availableActions.map((action) => action.id)).not.toContain("master_strike");
    expect(context.availableActions.map((action) => action.id)).not.toContain("phantom_rite");
  });

  it("does not load equipment or offer mechanical actions in No Stats stories", async () => {
    const { store, story } = await seedStory("none");
    stores.push(store);
    const definitions = vi.spyOn(store.runtimeItems, "listDefinitions");
    const inventory = vi.spyOn(store.runtimeItems, "listInventory");
    const loadout = vi.spyOn(store.runtimeItems, "listLoadout");

    const context = await assemblePlayerSuggestionContext(store, story);

    expect(context.availableActions).toEqual([]);
    expect(definitions).not.toHaveBeenCalled();
    expect(inventory).not.toHaveBeenCalled();
    expect(loadout).not.toHaveBeenCalled();
  });

  it("accepts context-specific output without the formerly required rationale field", async () => {
    const { store } = await seedStory();
    stores.push(store);
    const router = new SuggestionRouter([groundedResponse]);

    const suggestions = await suggestPlayerActions(router, store, STORY_ID);

    expect(suggestions).toHaveLength(5);
    expect(suggestions[0]).toMatchObject({
      kind: "dialogue",
      text: "Ask Sorel why the burden healed you.",
    });
    expect(suggestions[0]?.rationale).toBeUndefined();
    expect(router.prompts).toHaveLength(1);
    expect(router.prompts[0]?.user).toContain("Sorel braces against the mill door");
    expect(router.prompts[0]?.user).not.toContain("ANCIENT_CARAVAN_PROLOGUE");
  });

  it("repairs then reports generic fallback output instead of silently showing it", async () => {
    const { store } = await seedStory();
    stores.push(store);
    const generic = JSON.stringify({
      suggestions: [
        { kind: "dialogue", text: "Ask the nearest character about the immediate situation." },
        { kind: "move", text: "Observe the surroundings before committing." },
        { kind: "move", text: "Pause and carefully observe the surroundings." },
        { kind: "dialogue", text: "Ask Sorel what to do." },
        { kind: "move", text: "Wait beside Sorel." },
      ],
    });
    const router = new SuggestionRouter([generic]);

    await expect(
      suggestPlayerActions(router, store, STORY_ID)
    ).rejects.toBeInstanceOf(SuggestionGenerationError);
    expect(router.prompts).toHaveLength(3);
  });

  it("rejects an action id paired with unrelated prose", async () => {
    const { store } = await seedStory();
    stores.push(store);
    const mismatched = JSON.stringify({
      suggestions: [
        { kind: "dialogue", text: "Ask Sorel why the burden healed you." },
        { kind: "move", text: "Step away from the mill door beside Sorel." },
        {
          kind: "action",
          text: "Talk to Sorel about the burden.",
          actionId: "search_room",
        },
        { kind: "dialogue", text: "Tell Sorel the mill changed." },
        { kind: "move", text: "Examine the mill door beside Sorel." },
      ],
    });
    const router = new SuggestionRouter([mismatched]);

    await expect(
      suggestPlayerActions(router, store, STORY_ID)
    ).rejects.toBeInstanceOf(SuggestionGenerationError);
    expect(router.prompts).toHaveLength(3);
  });
});
