/**
 * Which config a story plays by (plan 09 §4c.9–4c.12): stories snapshot the override texts they were
 * created with and stay locked to them by default; a story set to follow the user's edits plays by the
 * active config, its enabled entries re-materialized; and no committed ruling is ever recomputed —
 * swipe included.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  activeConfig,
  catalogueOf,
  configForStory,
  d20Sequence,
  determineLootAwards,
  enablePoolEntry,
  enablementsForPlay,
  installConfigOverrides,
  loadEffectiveSchema,
  loadPoolBrowseContext,
  rulebookConfigMode,
  setRulebookConfigMode,
  SHIPPED_CONFIG,
  snapshotConfig,
  submitTurn,
  swipeLastTurn,
  type ChatResponse,
  type ClassifiedTurn,
  type ResourceDef,
  type Role,
  type RoleBinding,
  type RolePrompt,
  type Router,
  type StorySchema,
  type StreamHandler,
} from "../../src/index.js";
import { openStore, type Store } from "../../src/store/index.js";
import { makeEnemy, makePlayer, makeStory } from "../fixtures.js";

const PERSUADE = "uni.social.persuasion.persuade";
const harder = { archetypes: JSON.stringify({ archetypes: [{ id: "arch.social.sway", dc: 18 }] }) };
const pool = (overrides: Partial<ResourceDef> & Pick<ResourceDef, "id">): ResourceDef => ({
  label: overrides.id,
  start: 10,
  max: 10,
  playerVisible: true,
  ...overrides,
});
const base = makeStory();
const story: StorySchema = makeStory({
  schemaVersion: 3,
  attributes: [...base.attributes, { id: "cha", name: "Charisma", abbrev: "CHA", description: "Presence.", defaultScore: 10 }],
  resources: [
    pool({ id: "hp", label: "Health", start: 20, max: 20, lethal: true, role: "health" }),
    pool({ id: "stamina", label: "Stamina", role: "stamina" }),
    pool({ id: "mana", label: "Mana", role: "mana" }),
  ],
});
const dcOf = (schema: StorySchema) => schema.actions.find((action) => action.id === PERSUADE)?.dc;

afterEach(() => {
  installConfigOverrides({});
});

describe("the active config and a story's snapshot", () => {
  it("installs override texts, snapshots them into a story, and keeps the rest of the snapshot", () => {
    expect(activeConfig()).toBe(SHIPPED_CONFIG);
    expect(snapshotConfig({ mechanics: 1, configOverrides: { pool: "{}" }, configHash: "x" })).toEqual({ mechanics: 1 });
    const installed = installConfigOverrides(harder);
    expect(activeConfig()).toBe(installed);
    expect(installConfigOverrides(harder)).toBe(installed);
    const snapshot = snapshotConfig({ mechanics: 1 });
    expect(snapshot).toEqual({ mechanics: 1, configOverrides: harder, configHash: installed.hash });

    const locked = { configSnapshot: snapshot };
    expect(rulebookConfigMode(locked)).toBe("locked");
    installConfigOverrides({});
    // Locked: the snapshot still resolves to the harder DC after the user's files change.
    const sway = configForStory(locked).archetypes.archetypes.find((archetype) => archetype.id === "arch.social.sway");
    expect(sway).toMatchObject({ dc: 18 });
    expect(configForStory({ configSnapshot: { ...snapshot, rulebookConfig: "follow" } })).toBe(SHIPPED_CONFIG);
    expect(configForStory({})).toBe(SHIPPED_CONFIG);
    expect(configForStory({ configSnapshot: { configOverrides: { pool: 7 } } })).toBe(SHIPPED_CONFIG);
  });

  it("re-materializes a following story's enablements, keeping any the config can no longer express", () => {
    const enablements = [{ entryId: PERSUADE, kind: "action" as const, definition: { ...story.actions[0]!, id: PERSUADE, dc: 12 } }];
    installConfigOverrides({
      ...harder,
      pool: JSON.stringify({ entries: [{ id: "uni.social.empathy.reassure", remove: true }] }),
    });
    const following = { schema: story, configSnapshot: { rulebookConfig: "follow" } };
    expect(enablementsForPlay(following, enablements)[0]!.definition).toMatchObject({ dc: 18, label: "Persuade" });
    expect(enablementsForPlay({ schema: story }, enablements)).toEqual(enablements);
    const gone = [{ entryId: "uni.social.empathy.reassure", kind: "action" as const, definition: { ...story.actions[0]!, id: "x" } }];
    expect(enablementsForPlay(following, gone)).toEqual(gone);
    expect(catalogueOf(activeConfig()).pool.entries.some((entry) => entry.id === "uni.social.empathy.reassure")).toBe(false);
  });
});

class PersuadingRouter implements Router {
  constructor(private readonly classified: ClassifiedTurn) {}
  bindingFor(_role: Role): RoleBinding {
    return { provider: "openrouter", model: "test", source: "recommended", samplersDirty: false };
  }
  async complete(role: Role, prompt: RolePrompt): Promise<ChatResponse> {
    if (role === "classifier" && prompt.system.includes("NPC action planner")) return { content: JSON.stringify({ actions: [] }) };
    if (role === "classifier" && prompt.system.includes("strict consistency auditor")) {
      return { content: JSON.stringify({ obeysRulings: true, contradictions: [] }) };
    }
    if (role === "classifier" && prompt.system.includes("DM loot adjudicator")) return { content: JSON.stringify({ award: false, reason: "None." }) };
    if (role === "classifier" && prompt.system.includes("registrar")) return { content: JSON.stringify({ transitions: [] }) };
    if (role === "classifier") return { content: JSON.stringify(this.classified) };
    if (role === "analyzer") return { content: JSON.stringify({ characterOps: [], worldOps: [] }) };
    return { content: JSON.stringify({ actions: [] }) };
  }
  async stream(_role: Role, _prompt: RolePrompt, onDelta: StreamHandler): Promise<ChatResponse> {
    const content = "They listen.";
    onDelta(content);
    return { content };
  }
}

describe("a stored story under config edits", () => {
  let store: Store;
  const storyId = "configured";
  const persuade = { actorId: "kestrel", actionId: PERSUADE, targetId: "mira", stakes: "uncertain" as const, confidence: 1 };
  const router = new PersuadingRouter({ playerIntents: [persuade], npcIntents: [], freeText: "" });
  const turn = async () => {
    const result = await submitTurn(router, store, storyId, "I persuade them.", { rng: d20Sequence([10]) });
    await result.background;
    return result;
  };
  const record = async () => (await store.stories.get(storyId))!;
  const pastDcs = async () => (await store.rulings.listByStory(storyId)).map((row) => row.ruling.roll?.dcBase);

  beforeEach(async () => {
    store = await openStore(":memory:");
    await store.stories.insert({ id: storyId, title: "Config", createdAt: 0, schema: { ...story, storyId }, locked: true });
    await store.characters.insert({ id: "kestrel", storyId, name: "Kestrel", isPlayer: true, hard: makePlayer() });
    await store.characters.insert({ id: "mira", storyId, name: "Mira", isPlayer: false, hard: makeEnemy({ characterId: "mira", attributes: {} }) });
    await enablePoolEntry(store, storyId, PERSUADE, { source: "forge" });
  });

  it("stays locked to creation by default, follows edits when asked, and never recomputes a ruling", async () => {
    expect((await turn()).rulings[0]!.roll).toMatchObject({ dcBase: 12 });

    installConfigOverrides(harder);
    expect(dcOf(await loadEffectiveSchema(store, await record()))).toBe(12);
    expect((await turn()).rulings[0]!.roll).toMatchObject({ dcBase: 12 });

    const following = await setRulebookConfigMode(store, storyId, "follow");
    expect(rulebookConfigMode(following)).toBe("follow");
    expect(rulebookConfigMode(await record())).toBe("follow");
    expect(dcOf(await loadEffectiveSchema(store, await record()))).toBe(18);
    expect((await turn()).rulings[0]!.roll).toMatchObject({ dcBase: 18 });

    // History is immutable: earlier rulings keep their DC, and a swipe reuses its turn's ruling verbatim.
    expect(await pastDcs()).toEqual([12, 12, 18]);
    installConfigOverrides({ archetypes: JSON.stringify({ archetypes: [{ id: "arch.social.sway", dc: 5 }] }) });
    await swipeLastTurn(router, store, storyId);
    expect(await pastDcs()).toEqual([12, 12, 18]);

    await setRulebookConfigMode(store, storyId, "locked");
    expect(dcOf(await loadEffectiveSchema(store, await record()))).toBe(12);
    await expect(setRulebookConfigMode(store, "missing", "follow")).rejects.toThrow('Unknown story "missing".');
  });

  it("enables and browses from the story's own config", async () => {
    await store.stories.setRuntimeConfig(storyId, {
      ...(await record()),
      configSnapshot: snapshotConfig({}, installConfigOverrides({ pool: JSON.stringify({ entries: [{ id: "uni.social.empathy.reassure", remove: true }] }) })),
    });
    installConfigOverrides({});
    expect(await enablePoolEntry(store, storyId, "uni.social.empathy.reassure", { source: "player" })).toEqual({
      ok: false,
      reason: 'Unknown pool entry "uni.social.empathy.reassure".',
    });
    const context = await loadPoolBrowseContext(store, storyId);
    expect(context.catalogue?.pool.entries.some((entry) => entry.id === "uni.social.empathy.reassure")).toBe(false);
  });

  it("shapes loot from the story's own item archetypes", async () => {
    await store.stories.setRuntimeConfig(storyId, {
      ...(await record()),
      configSnapshot: snapshotConfig(
        {},
        installConfigOverrides({
          items: JSON.stringify({ archetypes: [{ id: "item.melee.light_weapon", props: { damage: { common: 3 } } }] }),
        })
      ),
    });
    installConfigOverrides({});
    const adjudicator: Router = {
      bindingFor: () => ({ provider: "openrouter", model: "test", source: "recommended", samplersDirty: false }),
      complete: async () => ({
        content: JSON.stringify({
          award: true,
          sourceType: "combat",
          sourceLabel: "Won",
          recipientCharacterId: "kestrel",
          reason: "Earned.",
          proposal: {
            name: "Knife",
            description: "Sharp.",
            kind: "weapon",
            tier: "common",
            archetypeId: "item.melee.light_weapon",
            tags: [],
          },
        }),
      }),
      stream: async () => ({ content: "" }),
    };
    const won = {
      turnId: "t",
      actorId: "kestrel",
      actionId: "attack_wild",
      gate: { allowed: true },
      roll: { d20: 15, attributeModifier: 0, skillModifier: 0, total: 15, dc: 10, outcome: "success" },
      effectsApplied: { narrationHint: "a hit" },
    } as unknown as Parameters<typeof determineLootAwards>[4][number];
    const [award] = await determineLootAwards(adjudicator, store, await record(), "I win.", [won]);
    expect(award?.definition.props).toEqual({ damage: 3 });
  });
});
