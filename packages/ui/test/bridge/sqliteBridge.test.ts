/**
 * Tests for buildSqliteBridge — the real CoreBridge over an opened Store.
 *
 * The façade is mostly thin delegation, so these tests target where delegation can go wrong (right
 * core fn, right argument order/shape) plus the methods carrying real local logic: listStories
 * (sort + per-story message count), submitTurn (background rejection is swallowed, not leaked),
 * listPresentCast (condensing a LivingCardView to the strip slice), validateProviderKey (chat probe
 * success/failure), persona upsert (insert vs update branch), and importCardFromBytes (PNG-signature
 * sniff → parsePngCard vs parseJsonCardBytes).
 *
 * Both the Store and the core namespace are fakes: buildSqliteBridge takes `core` as a parameter and
 * imports it only as a type, so no real core runtime (or native module) is needed here.
 */
import { describe, expect, it, vi } from "vitest";
import { buildSqliteBridge } from "../../src/bridge/sqliteBridge.js";
import { diagnosticsLogger } from "../../src/observability/logger.js";

// A permissive fake core namespace. Individual tests override the members they exercise; the rest
// are present so `buildSqliteBridge` can close over them without throwing on unrelated paths.
function fakeCore(overrides: Record<string, unknown> = {}) {
  return {
    PROVIDER_CONFIGS_SETTING_KEY: "providerConfigs",
    ROLE_MAP_SETTING_KEY: "roleMap",
    ProviderConfigsSchema: {},
    ProviderIdSchema: {},
    RoleMapSchema: {},
    DEFAULT_ROLE_MAP: { narrator: { provider: "openrouter", model: "m" } },
    ROLES: [],
    MissingCredentialsError: class MissingCredentialsError extends Error {},
    KNOWN_MODELS: [{ provider: "openrouter", model: "openrouter/x", label: "X", tier: "recommended" }],
    PROVIDER_IDS: ["openrouter", "openai", "anthropic"],
    makeRouter: vi.fn(() => ({ router: true })),
    bootstrapStory: vi.fn(),
    submitTurn: vi.fn(),
    getLivingCard: vi.fn(),
    makeProvider: vi.fn(),
    evaluateCachedLicense: vi.fn(),
    validateLicenseKey: vi.fn(),
    clearLicense: vi.fn(),
    peekTrial: vi.fn(),
    resolveEntitlement: vi.fn(),
    parsePngCard: vi.fn(),
    parseJsonCardBytes: vi.fn(),
    importCardFromUrl: vi.fn(),
    mapCardToImport: vi.fn(() => ({ mapped: true })),
    ...overrides,
  } as unknown as typeof import("@midnight-tavern/core");
}

// A fake Store with just the repos the façade touches; tests populate what they need.
function fakeStore(parts: Record<string, unknown> = {}) {
  const settingsData = new Map<string, unknown>();
  return {
    settings: {
      get: vi.fn(async (key: string) => settingsData.get(key)),
      set: vi.fn(async (key: string, _schema: unknown, value: unknown) => void settingsData.set(key, value)),
      delete: vi.fn(async (key: string) => void settingsData.delete(key)),
    },
    stories: { list: vi.fn(async () => []), get: vi.fn(), update: vi.fn(), delete: vi.fn() },
    messages: { listByStory: vi.fn(async () => []) },
    characters: { listByStory: vi.fn(async () => []) },
    rulings: { listByStory: vi.fn(async () => []) },
    personas: { list: vi.fn(async () => []), get: vi.fn(), insert: vi.fn(), update: vi.fn(), setDefault: vi.fn(), delete: vi.fn() },
    lorebook: { get: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), listByStory: vi.fn(async () => []) },
    ...parts,
  } as any;
}

describe("buildSqliteBridge", () => {
  it("listStories sorts by createdAt desc and counts messages per story", async () => {
    const store = fakeStore({
      stories: {
        list: vi.fn(async () => [
          { id: "a", title: "A", createdAt: 100, locked: true, schema: { statMode: "none" } },
          { id: "b", title: "B", createdAt: 300, locked: false, schema: { statMode: "full" } },
        ]),
      },
      messages: {
        listByStory: vi.fn(async (id: string) => (id === "b" ? [{}, {}, {}] : [{}])),
      },
    });
    const bridge = buildSqliteBridge(store, fakeCore());
    const out = await bridge.listStories();
    expect(out.map((s) => s.id)).toEqual(["b", "a"]); // newest first
    expect(out.find((s) => s.id === "b")?.messageCount).toBe(3);
    expect(out.find((s) => s.id === "a")?.messageCount).toBe(1);
  });

  it("createStory delegates to bootstrapStory with mapped args and fires progress phases", async () => {
    const bootstrapStory = vi.fn(async (_router, _store, _input, _player, options) => {
      for (const phase of ["phase-a", "phase-b", "validate", "freeze", "install"] as const) {
        options.onProgress?.(phase);
      }
      return {
        story: { id: "s1", title: "T" },
        playerCharacterId: "pc1",
      };
    });
    const store = fakeStore();
    const bridge = buildSqliteBridge(store, fakeCore({ bootstrapStory }));
    const phases: string[] = [];
    const res = await bridge.createStory({
      storyId: "s1",
      title: "T",
      premise: "P",
      playerName: "Hero",
      onProgress: (p) => phases.push(p),
    });
    expect(res).toEqual({ story: { id: "s1", title: "T" }, playerCharacterId: "pc1" });
    // input object + player seed shapes
    expect(bootstrapStory).toHaveBeenCalledWith(
      expect.anything(),
      store,
      { storyId: "s1", title: "T", premise: "P", statMode: "full", actionBudget: 2 },
      { name: "Hero" },
      { onProgress: expect.any(Function) }
    );
    expect(phases).toEqual(["phase-a", "phase-b", "validate", "freeze", "install"]);
  });

  it("rejects a role map that points at a provider without stored credentials", async () => {
    const bootstrapStory = vi.fn();
    const roleMap = { bootstrapper: { provider: "openrouter", model: "m" } };
    const store = fakeStore({
      settings: {
        get: vi.fn(async (key: string) => key === "roleMap" ? roleMap : {}),
      },
    });
    const bridge = buildSqliteBridge(store, fakeCore({
      ROLES: ["bootstrapper"],
      DEFAULT_ROLE_MAP: roleMap,
      bootstrapStory,
    }));

    await expect(bridge.createStory({
      storyId: "s1",
      title: "T",
      premise: "P",
      playerName: "Hero",
    })).rejects.toThrow();
    expect(bootstrapStory).not.toHaveBeenCalled();
  });

  it("submitTurn returns the outcome and swallows a rejected background promise", async () => {
    const errSpy = vi.spyOn(diagnosticsLogger, "error").mockImplementation(() => {});
    const background = Promise.reject(new Error("analyzer boom"));
    const submitTurn = vi.fn(async () => ({ prose: "text", rulings: [], narratorIdx: 5, background }));
    const bridge = buildSqliteBridge(fakeStore({
      stories: { get: vi.fn(async () => ({ id: "s1", schema: { statMode: "full" } })) },
    }), fakeCore({ submitTurn }));
    const out = await bridge.submitTurn({ storyId: "s1", playerText: "hi" });
    expect(out).toEqual({ prose: "text", rulings: [], narratorIdx: 5 });
    await new Promise((r) => setTimeout(r, 0)); // let the .catch run
    expect(errSpy).toHaveBeenCalledWith("turn.background.failed", expect.objectContaining({ operationId: "s1" }));
    errSpy.mockRestore();
  });

  it("listPresentCast condenses each LivingCardView to name/alive/hp/mood", async () => {
    const store = fakeStore({
      stories: { get: vi.fn(async () => ({ id: "s1", schema: { schema: true } })) },
      characters: { listByStory: vi.fn(async () => [{ id: "c1" }, { id: "c2" }]) },
    });
    const getLivingCard = vi.fn(async (_s: unknown, _sch: unknown, id: string) =>
      id === "c1"
        ? {
            characterId: "c1",
            name: "Hero",
            isPlayer: true,
            alive: true,
            resources: [{ id: "hp", label: "Health", current: 8, max: 10, playerVisible: true }],
            inventory: [],
            skills: [],
            soft: { mood: "wary" },
          }
        : {
            characterId: "c2",
            name: "Ghost",
            isPlayer: false,
            alive: false,
            resources: [{ id: "mana", label: "Mana", current: 3, max: 5, playerVisible: false }],
            inventory: [],
            skills: [],
          }
    );
    const bridge = buildSqliteBridge(store, fakeCore({ getLivingCard }));
    const cast = await bridge.listPresentCast("s1");
    expect(cast).toEqual([
      { characterId: "c1", name: "Hero", isPlayer: true, alive: true, hp: { current: 8, max: 10, label: "Health" }, mood: "wary" },
      { characterId: "c2", name: "Ghost", isPlayer: false, alive: false }, // no visible resource ⇒ no hp; no soft ⇒ no mood
    ]);
  });

  it("getProviderConfigs / setProviderConfig round-trip through settings", async () => {
    const store = fakeStore();
    const bridge = buildSqliteBridge(store, fakeCore());
    expect(await bridge.getProviderConfigs()).toEqual({}); // unset ⇒ {}
    await bridge.setProviderConfig("openrouter", { apiKey: "k", baseUrl: "https://x" });
    expect(await bridge.getProviderConfigs()).toEqual({ openrouter: { apiKey: "k", baseUrl: "https://x" } });
    await bridge.removeProviderConfig("openrouter");
    expect(await bridge.getProviderConfigs()).toEqual({});
  });

  it("persists one Primary provider and requires explicit replacement before removal", async () => {
    const bridge = buildSqliteBridge(fakeStore(), fakeCore());
    await bridge.setProviderConfig("openrouter", { apiKey: "or-key" });
    await bridge.setProviderConfig("openai", { apiKey: "ai-key" });

    expect(await bridge.getPrimaryProvider()).toBe("openrouter");
    await expect(bridge.removeProviderConfig("openrouter")).rejects.toThrow(
      /replacement Primary/i
    );

    await bridge.setPrimaryProvider("openai");
    await bridge.removeProviderConfig("openrouter");
    expect(await bridge.getPrimaryProvider()).toBe("openai");
    await expect(bridge.setPrimaryProvider("anthropic")).rejects.toThrow(/connect and validate/i);
  });

  it("exposes versioned recommendation parameters and provider capability masks", () => {
    const samplerProfileFor = vi.fn(() => ({
      temperature: 0.25,
      topP: 1,
      maxTokens: 700,
    }));
    const providerSupportsSampler = vi.fn(() => false);
    const bridge = buildSqliteBridge(
      fakeStore(),
      fakeCore({
        MODEL_RECOMMENDATION_CONFIG_VERSION: 7,
        SAMPLER_PRESETS: {
          Precise: { temperature: 0, topP: 1, maxTokens: 800 },
          Balanced: { temperature: 0.5, topP: 0.95, maxTokens: 1200 },
          Creative: { temperature: 0.8, topP: 0.98, maxTokens: 1600 },
        },
        DEFAULT_PRESET_FOR_ROLE: {
          narrator: "Creative",
          classifier: "Precise",
          analyzer: "Precise",
          summarizer: "Balanced",
          bootstrapper: "Balanced",
        },
        SUPPORTED_SAMPLERS: { openai: new Set(["temperature", "topP", "maxTokens"]) },
        samplerProfileFor,
        providerSupportsSampler,
      })
    );

    expect(bridge.modelRecommendationConfig()).toMatchObject({
      version: 7,
      defaultPresetForRole: { narrator: "Creative" },
      providerSamplerSupport: { openai: ["temperature", "topP", "maxTokens"] },
    });
    expect(bridge.recommendedSamplerProfile("classifier", "model-x")).toEqual({
      temperature: 0.25,
      topP: 1,
      maxTokens: 700,
    });
    expect(bridge.providerSupportsSampler("openai", "topK")).toBe(false);
    expect(samplerProfileFor).toHaveBeenCalledWith("classifier", "model-x");
  });

  it("validateProviderKey: empty ⇒ rejected, chat success ⇒ valid, chat throw ⇒ rejected", async () => {
    const chat = vi.fn();
    const makeProvider = vi.fn(() => ({ chat }));
    const bridge = buildSqliteBridge(fakeStore(), fakeCore({ makeProvider }));

    expect(await bridge.validateProviderKey("openrouter", "  ")).toEqual({
      state: "rejected",
      reason: "Enter a key to validate.",
    });

    chat.mockResolvedValueOnce({ content: "pong" });
    expect(await bridge.validateProviderKey("openrouter", "good-key")).toEqual({
      state: "valid",
      label: "Key accepted",
    });
    // probe used the known model + passed the key as config
    expect(chat).toHaveBeenCalledWith(
      expect.objectContaining({ model: "openrouter/x", maxTokens: 1 }),
      { apiKey: "good-key" }
    );

    chat.mockRejectedValueOnce(new Error("401 Unauthorized"));
    expect(await bridge.validateProviderKey("openrouter", "bad-key")).toEqual({
      state: "rejected",
      reason: "401 Unauthorized",
    });
  });

  it("resolveEntitlement threads the evaluated license into core.resolveEntitlement", async () => {
    const license = { status: "valid", source: "online", cache: {} };
    const evaluateCachedLicense = vi.fn(async () => license);
    const resolveEntitlement = vi.fn(async () => ({ canCreateStory: true, via: "license" }));
    const store = fakeStore();
    const bridge = buildSqliteBridge(store, fakeCore({ evaluateCachedLicense, resolveEntitlement }));
    const out = await bridge.resolveEntitlement();
    expect(out).toEqual({ canCreateStory: true, via: "license" });
    expect(resolveEntitlement).toHaveBeenCalledWith(license, store);
  });

  it("savePersona inserts when absent, updates when present, and sets default when flagged", async () => {
    const get = vi.fn(async (id: string) => (id === "existing" ? { id } : undefined));
    const insert = vi.fn();
    const update = vi.fn();
    const setDefault = vi.fn();
    const store = fakeStore({ personas: { get, insert, update, setDefault } });
    const bridge = buildSqliteBridge(store, fakeCore());

    await bridge.savePersona({ id: "new", isDefault: false } as any);
    expect(insert).toHaveBeenCalledOnce();
    expect(update).not.toHaveBeenCalled();
    expect(setDefault).not.toHaveBeenCalled();

    await bridge.savePersona({ id: "existing", isDefault: true } as any);
    expect(update).toHaveBeenCalledOnce();
    expect(setDefault).toHaveBeenCalledWith("existing");
  });

  it("importCardFromBytes sniffs the PNG signature to pick the parser", async () => {
    const parsePngCard = vi.fn(() => ({ spec: "chara_card_v2", specVersion: "2.0", data: {} }));
    const parseJsonCardBytes = vi.fn(() => ({ spec: "chara_card_v3", specVersion: "3.0", data: {} }));
    const bridge = buildSqliteBridge(fakeStore(), fakeCore({ parsePngCard, parseJsonCardBytes }));

    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
    const pngRes = await bridge.importCardFromBytes(png);
    expect(parsePngCard).toHaveBeenCalledOnce();
    expect(parseJsonCardBytes).not.toHaveBeenCalled();
    expect(pngRes.spec).toBe("Card format chara_card_v2 2.0");

    const json = new TextEncoder().encode('{"spec":"chara_card_v3"}');
    await bridge.importCardFromBytes(json);
    expect(parseJsonCardBytes).toHaveBeenCalledOnce();
  });
});
