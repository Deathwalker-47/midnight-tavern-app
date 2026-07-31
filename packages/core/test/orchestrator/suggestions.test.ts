import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ChatResponse,
  Role,
  RoleBinding,
  RolePrompt,
  Router,
  StreamHandler,
} from "../../src/router/index.js";
import { suggestPlayerActions } from "../../src/orchestrator/suggestions.js";
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

  constructor(private readonly responses: Array<string | Error>) {}

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
    const response =
      this.responses[Math.min(this.index, this.responses.length - 1)] ?? "";
    this.index += 1;
    if (response instanceof Error) throw response;
    return { content: response };
  }

  async stream(
    _role: Role,
    _prompt: RolePrompt,
    _onDelta: StreamHandler
  ): Promise<ChatResponse> {
    throw new Error("Suggestions never stream.");
  }
}

async function seedStory(
  statMode: "full" | "none" = "full",
  emptyCatalog = false
): Promise<{
  store: Store;
  story: StoryRecord;
}> {
  const store = await openStore(":memory:");
  const schema = makeStory({ storyId: STORY_ID, statMode });
  if (emptyCatalog) schema.actions = [];
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

  it("accepts natural scene paraphrases without requiring exact anchor tokens", async () => {
    const { store } = await seedStory();
    stores.push(store);
    const paraphrased = JSON.stringify({
      suggestions: [
        { kind: "dialogue", text: "Ask him why taking it into yourself restored your strength." },
        { kind: "move", text: "Keep a measured distance from the doorway." },
        { kind: "dialogue", text: "Explain that the transfer felt deliberate, not accidental." },
        { kind: "move", text: "Check the threshold for signs that someone recently forced it." },
        { kind: "dialogue", text: "Press him on what he expected the transfer to do." },
      ],
    });
    const router = new SuggestionRouter([paraphrased]);

    const suggestions = await suggestPlayerActions(router, store, STORY_ID);

    expect(suggestions).toHaveLength(5);
    expect(router.prompts).toHaveLength(1);
  });

  it("repairs suggestions that name a registered character who is absent from the live scene", async () => {
    const { store } = await seedStory();
    stores.push(store);
    await store.characters.insert({
      id: "marrow",
      storyId: STORY_ID,
      name: "Marrow",
      isPlayer: false,
      present: false,
      hard: {
        characterId: "marrow",
        isPlayer: false,
        attributes: {},
        resources: { hp: { current: 10, max: 10 } },
        skills: [],
        inventory: [],
        flags: {},
        alive: true,
      },
    });
    const absentCharacterResponse = JSON.stringify({
      suggestions: [
        { kind: "dialogue", text: "Ask Marrow why the burden healed you." },
        { kind: "move", text: "Step away from the mill door while watching Sorel." },
        { kind: "dialogue", text: "Tell Sorel the burden changed inside the mill." },
        { kind: "move", text: "Examine the mill door beside Sorel." },
        { kind: "dialogue", text: "Ask Sorel what the transfer was meant to do." },
      ],
    });
    const router = new SuggestionRouter([absentCharacterResponse, groundedResponse]);

    const suggestions = await suggestPlayerActions(router, store, STORY_ID);

    expect(router.prompts).toHaveLength(2);
    expect(suggestions).toHaveLength(5);
    expect(suggestions.every((suggestion) => !suggestion.text.includes("Marrow"))).toBe(true);
  });

  it("uses five deterministic scene-grounded fallbacks after malformed repair output", async () => {
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

    const suggestions = await suggestPlayerActions(router, store, STORY_ID);

    expect(suggestions).toHaveLength(5);
    expect(new Set(suggestions.map((suggestion) => suggestion.text)).size).toBe(5);
    expect(
      suggestions.every((suggestion) =>
        /sorel|mill|burden|door/i.test(suggestion.text)
      )
    ).toBe(true);
    expect(
      suggestions.every((suggestion) => !/\b(success|succeed|defeat|kill|find)\b/i.test(suggestion.text))
    ).toBe(true);
    expect(router.prompts).toHaveLength(3);
  });

  it("uses grounded fallbacks after structurally malformed responses exhaust repairs", async () => {
    const { store } = await seedStory();
    stores.push(store);
    const router = new SuggestionRouter(["not json"]);

    const suggestions = await suggestPlayerActions(router, store, STORY_ID);

    expect(suggestions).toHaveLength(5);
    expect(router.prompts).toHaveLength(3);
    expect(suggestions.every((suggestion) => /sorel|mill|burden|door/i.test(suggestion.text)))
      .toBe(true);
  });

  it("uses the same deterministic grounded fallback when the provider fails", async () => {
    const { store, story } = await seedStory();
    stores.push(store);
    const first = await suggestPlayerActions(
      new SuggestionRouter([new Error("HTTP 429")]),
      store,
      STORY_ID
    );
    const second = await suggestPlayerActions(
      new SuggestionRouter([new Error("network unavailable")]),
      store,
      STORY_ID
    );

    expect(first).toHaveLength(5);
    expect(first.map(({ id: _id, ...suggestion }) => suggestion)).toEqual(
      second.map(({ id: _id, ...suggestion }) => suggestion)
    );
    const context = await assemblePlayerSuggestionContext(store, story);
    for (const suggestion of first.filter((candidate) => candidate.kind === "action")) {
      const action = context.availableActions.find(
        (candidate) => candidate.id === suggestion.actionId
      );
      expect(action).toBeDefined();
      expect(suggestion.text.toLowerCase()).toContain(action!.label.toLowerCase());
    }
  });

  it("never falls back when the caller has aborted", async () => {
    const { store } = await seedStory();
    stores.push(store);
    const controller = new AbortController();
    controller.abort();
    const providerError = new Error("Aborted");
    providerError.name = "AbortError";

    await expect(
      suggestPlayerActions(
        new SuggestionRouter([providerError]),
        store,
        STORY_ID,
        controller.signal
      )
    ).rejects.toBe(providerError);
  });

  it("excludes absent and dead registered characters from degraded suggestions", async () => {
    const { store, story } = await seedStory();
    stores.push(store);
    await store.characters.insert({
      id: "marrow",
      storyId: STORY_ID,
      name: "Marrow",
      isPlayer: false,
      present: false,
      hard: {
        characterId: "marrow",
        isPlayer: false,
        attributes: {},
        resources: { hp: { current: 10, max: 10 } },
        skills: [],
        inventory: [],
        flags: {},
        alive: true,
      },
    });
    await store.characters.insert({
      id: "husk",
      storyId: STORY_ID,
      name: "Husk",
      isPlayer: false,
      present: true,
      hard: {
        characterId: "husk",
        isPlayer: false,
        attributes: {},
        resources: { hp: { current: 0, max: 10 } },
        skills: [],
        inventory: [],
        flags: {},
        alive: false,
      },
      soft: soft("husk", "Husk", { location: "mill" }),
    });
    await store.messages.insert({
      id: "latest-with-unavailable-cast",
      storyId: story.id,
      idx: 1,
      role: "narrator",
      content:
        "Sorel guards the mill door while the burden hums. Marrow is elsewhere, and Husk lies dead.",
      createdAt: 1,
    });

    const suggestions = await suggestPlayerActions(
      new SuggestionRouter([new Error("HTTP 429")]),
      store,
      STORY_ID
    );
    const context = await assemblePlayerSuggestionContext(store, story);

    expect(context.visibleCharacters.map((character) => character.name)).not.toContain("Husk");
    expect(suggestions).toHaveLength(5);
    expect(suggestions.every((suggestion) => !/marrow|husk/i.test(suggestion.text))).toBe(true);
  });

  it("uses no mechanical suggestion when the sealed action catalog is empty", async () => {
    const { store } = await seedStory("full", true);
    stores.push(store);

    const suggestions = await suggestPlayerActions(
      new SuggestionRouter([new Error("HTTP 429")]),
      store,
      STORY_ID
    );

    expect(suggestions).toHaveLength(5);
    expect(
      suggestions.every(
        (suggestion) => suggestion.kind !== "action" && suggestion.actionId === undefined
      )
    ).toBe(true);
  });

  it("returns no fallback when committed scene context is too sparse", async () => {
    const store = await openStore(":memory:");
    stores.push(store);
    const schema = makeStory({ storyId: STORY_ID, statMode: "none" });
    await store.stories.insert({
      id: STORY_ID,
      title: "Sparse",
      createdAt: 0,
      schema,
      locked: true,
      actionBudget: 2,
    });
    await store.characters.insert({
      id: "kestrel",
      storyId: STORY_ID,
      name: "Kestrel",
      isPlayer: true,
      hard: makePlayer(),
    });
    await store.messages.insert({
      id: "sparse",
      storyId: STORY_ID,
      idx: 0,
      role: "narrator",
      content: "Dark.",
      createdAt: 0,
    });

    await expect(
      suggestPlayerActions(
        new SuggestionRouter([new Error("HTTP 429")]),
        store,
        STORY_ID
      )
    ).resolves.toEqual([]);
  });

  it("drops invalid mechanical metadata without discarding useful prose", async () => {
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

    const suggestions = await suggestPlayerActions(router, store, STORY_ID);

    expect(suggestions).toHaveLength(5);
    expect(suggestions[2]).toMatchObject({
      kind: "move",
      text: "Talk to Sorel about the burden.",
    });
    expect(suggestions[2]?.actionId).toBeUndefined();
    expect(router.prompts).toHaveLength(1);
  });
});
