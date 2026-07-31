import { afterEach, describe, expect, it } from "vitest";
import { runAnalyzer } from "../../src/memory/analyzer.js";
import { createCharacterSoftState } from "../../src/types/index.js";
import { openStore, type Store } from "../../src/store/index.js";
import type {
  ChatResponse,
  Role,
  RoleBinding,
  RolePrompt,
  Router,
  StreamHandler,
} from "../../src/router/index.js";
import { makeEnemy, makePlayer, makeStory } from "../fixtures.js";

class AnalyzerRouter implements Router {
  bindingFor(_role: Role): RoleBinding {
    return { provider: "openrouter", model: "test", source: "recommended", samplersDirty: false };
  }

  async complete(_role: Role, _prompt: RolePrompt): Promise<ChatResponse> {
    return {
      content: JSON.stringify({
        characterOps: [
          {
            characterId: "player",
            ops: [
              { op: "set", path: "mood", value: "focused" },
              {
                op: "adjust_relationship",
                toCharacterId: "ghost",
                trustDelta: 0.5,
                powerDelta: 0,
              },
            ],
          },
          { characterId: "absent", ops: [{ op: "set", path: "goal", value: "intrude" }] },
          { characterId: "ghost", ops: [{ op: "observe", text: "invented" }] },
        ],
        worldOps: [],
      }),
    };
  }

  async stream(_role: Role, _prompt: RolePrompt, _onDelta: StreamHandler): Promise<ChatResponse> {
    throw new Error("not used");
  }
}

describe("runAnalyzer registry and presence boundary", () => {
  let store: Store | undefined;

  afterEach(async () => {
    await store?.close();
  });

  it("applies ops only to supplied present registry ids and rejects unknown relationships", async () => {
    store = await openStore(":memory:");
    const schema = makeStory({ storyId: "story" });
    await store.stories.insert({ id: "story", title: schema.title, createdAt: 0, schema, locked: true });
    await store.characters.insert({
      id: "player",
      storyId: "story",
      name: "Player",
      isPlayer: true,
      hard: makePlayer({ characterId: "player" }),
    });
    await store.characters.insert({
      id: "absent",
      storyId: "story",
      name: "Absent",
      isPlayer: false,
      present: false,
      hard: makeEnemy({ characterId: "absent" }),
    });

    const applied = await runAnalyzer(new AnalyzerRouter(), store, {
      storyId: "story",
      turnIdx: 3,
      playerText: "I watch the door.",
      narratorText: "You wait, focused on the entrance.",
      presentSoft: [createCharacterSoftState("player", "Player", "primary")],
    });

    expect(applied).toBe(true);
    expect((await store.characters.get("player"))?.soft?.current.mood).toBe("focused");
    expect((await store.characters.get("player"))?.soft?.relationships).toEqual([]);
    expect((await store.characters.get("absent"))?.soft?.current.goal).toBeUndefined();
    expect(await store.characters.get("ghost")).toBeUndefined();
  });
});
