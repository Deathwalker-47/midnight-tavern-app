/**
 * Phase-1 model-config spine tests (low-level-plan-v2 §1, §5, §8).
 *
 * Covers the sampler surface (presets, defaults, provider support, preset matching), the curated
 * catalog (schema validity + lookups), the recommendation ranking + default assignment, and that
 * the router forwards the widened sampler fields to the wire — pruning provider-unsupported ones.
 */
import { describe, it, expect } from "vitest";
import {
  SAMPLER_PRESETS,
  DEFAULT_SAMPLER_PROFILES,
  DEFAULT_PRESET_FOR_ROLE,
  SamplerProfileSchema,
  CatalogModelSchema,
  MODEL_CATALOG,
  allCatalogModels,
  catalogModel,
  catalogModelsForProvider,
  isJsonRisk,
  providerSupportsSampler,
  pruneUnsupported,
  matchPreset,
  modelsForRole,
  defaultAssignmentFor,
  roleMapForPrimary,
  samplerProfileFor,
  makeRouter,
  ROLES,
  ROLE_LABELS,
  MODEL_RECOMMENDATION_CONFIG,
  MODEL_RECOMMENDATION_CONFIG_VERSION,
  PROVIDER_IDS,
  makeProvider,
  type FetchLike,
  type ProviderConfigs,
  type SamplerProfile,
} from "../../src/router/index.js";

describe("provider discovery", () => {
  it("keeps Electron Hub and NanoGPT second and third in the provider order", () => {
    expect(PROVIDER_IDS.slice(0, 4)).toEqual(["openrouter", "electronhub", "nanogpt", "openai"]);
  });

  it("validates OpenRouter against the authenticated key endpoint and parses live models", async () => {
    const calls: { url: string; authorization?: string }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined;
      calls.push({ url, ...(headers?.["authorization"] ? { authorization: headers["authorization"] } : {}) });
      const body = url.endsWith("/models")
        ? { data: [{ id: "vendor/model-a", name: "Model A", context_length: 32_000 }] }
        : { data: { label: "test key" } };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as FetchLike;
    const provider = makeProvider("openrouter", fetchImpl);

    await provider.validateConfig?.({ apiKey: "sk-or-test" });
    const models = await provider.listModels?.({ apiKey: "sk-or-test" });

    expect(calls.map((call) => call.url)).toEqual([
      "https://openrouter.ai/api/v1/key",
      "https://openrouter.ai/api/v1/models",
    ]);
    expect(calls.every((call) => call.authorization === "Bearer sk-or-test")).toBe(true);
    expect(models).toEqual([{ id: "vendor/model-a", label: "Model A", contextLength: 32_000 }]);
  });
});

function cannedFetch(content: string): { fetch: FetchLike; calls: { body: any }[] } {
  const calls: { body: any }[] = [];
  const fetch = (async (_url: string, init: any) => {
    calls.push({ body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as FetchLike;
  return { fetch, calls };
}

describe("sampler presets & defaults", () => {
  it("every preset is a valid full profile", () => {
    for (const [name, profile] of Object.entries(SAMPLER_PRESETS)) {
      expect(SamplerProfileSchema.safeParse(profile).success, name).toBe(true);
    }
  });

  it("every role has a default profile and a default preset", () => {
    for (const role of ROLES) {
      expect(SamplerProfileSchema.safeParse(DEFAULT_SAMPLER_PROFILES[role]).success, role).toBe(true);
      expect(DEFAULT_PRESET_FOR_ROLE[role]).toBeTruthy();
    }
  });

  it("matchPreset names an exact preset and returns null for a custom profile", () => {
    expect(matchPreset(SAMPLER_PRESETS.Precise)).toBe("Precise");
    expect(matchPreset(SAMPLER_PRESETS.Creative)).toBe("Creative");
    const custom: SamplerProfile = { ...SAMPLER_PRESETS.Balanced, temperature: 1.234 };
    expect(matchPreset(custom)).toBeNull();
  });

  it("structured roles default cold, narrator runs warm", () => {
    expect(DEFAULT_SAMPLER_PROFILES.classifier.temperature).toBe(0);
    expect(DEFAULT_SAMPLER_PROFILES.narrator.temperature).toBeGreaterThan(0.5);
  });
});

describe("provider sampler support", () => {
  it("openai has no top_k / min_p; unknown providers support everything", () => {
    expect(providerSupportsSampler("openai", "topK")).toBe(false);
    expect(providerSupportsSampler("openai", "temperature")).toBe(true);
    expect(providerSupportsSampler("openrouter", "topK")).toBe(true); // not listed => supported
  });

  it("pruneUnsupported drops fields the provider can't honor", () => {
    const pruned = pruneUnsupported(SAMPLER_PRESETS.Balanced, "openai");
    expect(pruned).not.toHaveProperty("topK");
    expect(pruned).not.toHaveProperty("minP");
    expect(pruned).toHaveProperty("temperature");
    // Unknown provider keeps the profile intact.
    expect(pruneUnsupported(SAMPLER_PRESETS.Balanced, "openrouter")).toEqual(SAMPLER_PRESETS.Balanced);
  });
});

describe("model catalog", () => {
  it("loads recommendations, role defaults, and samplers from one versioned config", () => {
    expect(MODEL_RECOMMENDATION_CONFIG_VERSION).toBe(2);
    expect(MODEL_RECOMMENDATION_CONFIG.models).toHaveLength(MODEL_CATALOG.length);
    expect(MODEL_RECOMMENDATION_CONFIG.defaultRoleMap.narrator.model).toBe(
      DEFAULT_ROLE_MAP.narrator.model
    );
    expect(MODEL_RECOMMENDATION_CONFIG.samplerPresets.Creative.temperature).toBe(
      SAMPLER_PRESETS.Creative.temperature
    );
  });

  it("every catalog entry validates against the schema", () => {
    for (const m of MODEL_CATALOG) {
      expect(CatalogModelSchema.safeParse(m).success, m.id).toBe(true);
    }
  });

  it("has no duplicate ids", () => {
    const ids = MODEL_CATALOG.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ships a responsive narrator default and labels the explicit quality choice", () => {
    expect(DEFAULT_ROLE_MAP.narrator.model).toBe("google/gemini-2.0-flash-001");
    expect(catalogModel(DEFAULT_ROLE_MAP.narrator.model)).toMatchObject({
      label: expect.stringMatching(/fast/i),
      recommendedFor: expect.arrayContaining(["narrator"]),
    });
    expect(catalogModel("anthropic/claude-opus-4")?.label).toMatch(/quality/i);
  });

  it("lookups by id and provider work", () => {
    expect(allCatalogModels().length).toBe(MODEL_CATALOG.length);
    expect(catalogModel("anthropic/claude-sonnet-4")?.label).toBe("Claude Sonnet 4");
    expect(catalogModel("does/not-exist")).toBeUndefined();
    expect(catalogModelsForProvider("openai").every((m) => m.provider === "openai")).toBe(true);
  });

  it("flags non-JSON-mode models as a JSON risk; unknown ids are not flagged", () => {
    expect(isJsonRisk("meta-llama/llama-3.1-8b-instruct")).toBe(true);
    expect(isJsonRisk("anthropic/claude-sonnet-4")).toBe(false);
    expect(isJsonRisk("some/freetext-model")).toBe(false);
  });
});

describe("recommendations", () => {
  it("ranks by score monotonically: role-recommended first, then recommended tier, then advanced", () => {
    // Score mirrors recommend.ts: recommended-for-role (0) < recommended tier (1) < advanced (2).
    // Note some advanced-tier models are recommendedForRole (e.g. Llama for classifier), so they
    // correctly outrank recommended-tier models NOT recommended for this role — the score, not the
    // tier alone, defines order.
    const score = (m: { recommendedForRole: boolean; tier: string }) =>
      m.recommendedForRole ? 0 : m.tier === "recommended" ? 1 : 2;
    const ranked = modelsForRole("classifier", "openrouter");
    for (let i = 1; i < ranked.length; i++) {
      expect(score(ranked[i]!)).toBeGreaterThanOrEqual(score(ranked[i - 1]!));
    }
    expect(ranked[0]!.recommendedForRole).toBe(true);
  });

  it("ranks a free-text id as advanced, not recommended", () => {
    const ranked = modelsForRole("narrator", "openrouter", ["totally/made-up"]);
    expect(ranked[0]!.tier).toBe("advanced");
    expect(ranked[0]!.recommendedForRole).toBe(false);
  });

  it("defaultAssignmentFor returns a recommended, non-dirty binding for every role", () => {
    for (const role of ROLES) {
      const b = defaultAssignmentFor(role);
      expect(b.source).toBe("recommended");
      expect(b.samplersDirty).toBe(false);
      expect(b.model.length).toBeGreaterThan(0);
      expect(SamplerProfileSchema.safeParse(b.samplers).success, role).toBe(true);
    }
  });

  it("samplerProfileFor falls back to the role default for an unknown model", () => {
    expect(samplerProfileFor("narrator", "unknown/model")).toEqual(DEFAULT_SAMPLER_PROFILES.narrator);
  });

  it("moves recommended role bindings to the Primary provider without touching custom bindings", () => {
    const original: RoleMap = {
      ...DEFAULT_ROLE_MAP,
      narrator: {
        ...DEFAULT_ROLE_MAP.narrator,
        source: "custom",
      },
    };

    const effective = roleMapForPrimary(original, "electronhub");

    expect(effective.narrator).toEqual(original.narrator);
    for (const role of ROLES.filter((candidate) => candidate !== "narrator")) {
      expect(effective[role].provider).toBe("electronhub");
      expect(effective[role].model).toBe(original[role].model);
      expect(effective[role].source).toBe("recommended");
    }
    expect(original.classifier.provider).toBe("openrouter");
  });

  it("selects provider-native models and preserves user-edited samplers when Primary changes", () => {
    const customSamplers = { temperature: 1.1, maxTokens: 333 };
    const original: RoleMap = {
      ...DEFAULT_ROLE_MAP,
      classifier: {
        ...DEFAULT_ROLE_MAP.classifier,
        samplers: customSamplers,
        samplersDirty: true,
      },
    };

    const effective = roleMapForPrimary(original, "openai");

    expect(effective.narrator).toMatchObject({ provider: "openai", model: "gpt-4o" });
    expect(effective.classifier).toMatchObject({
      provider: "openai",
      model: "gpt-4o-mini",
      samplers: customSamplers,
      samplersDirty: true,
    });
  });

  it("returns the existing map when every binding already follows Primary or is custom", () => {
    const effective = roleMapForPrimary(DEFAULT_ROLE_MAP, "openrouter");
    expect(effective).toBe(DEFAULT_ROLE_MAP);
  });
});

describe("role labels", () => {
  it("surfaces bootstrapper as 'Story AI' and covers every role", () => {
    expect(ROLE_LABELS.bootstrapper).toBe("Story AI");
    for (const role of ROLES) expect(ROLE_LABELS[role]).toBeTruthy();
  });
});

describe("router forwards widened samplers to the wire", () => {
  const configs: ProviderConfigs = { openrouter: { apiKey: "sk-test" } };

  it("emits top_k / min_p / penalties in snake_case for a supporting provider", async () => {
    const { fetch, calls } = cannedFetch("{}");
    const router = makeRouter({
      providerConfigs: configs,
      fetchImpl: fetch,
      roleMap: {
        ...defaultRoleMapWith("narrator", {
          provider: "openrouter",
          model: "anthropic/claude-sonnet-4",
          samplers: {
            temperature: 0.7,
            topP: 0.9,
            topK: 40,
            minP: 0.05,
            frequencyPenalty: 0.2,
            presencePenalty: 0.1,
            repetitionPenalty: 1.1,
            maxTokens: 1000,
            seed: 123,
          },
          source: "custom",
          samplersDirty: true,
        }),
      },
    });
    await router.complete("narrator", { system: "s", user: "u" });
    const body = calls[0]!.body;
    expect(body.temperature).toBe(0.7);
    expect(body.top_p).toBe(0.9);
    expect(body.top_k).toBe(40);
    expect(body.min_p).toBe(0.05);
    expect(body.frequency_penalty).toBe(0.2);
    expect(body.presence_penalty).toBe(0.1);
    expect(body.repetition_penalty).toBe(1.1);
    expect(body.max_tokens).toBe(1000);
    expect(body.seed).toBe(123);
  });

  it("drops top_k / min_p / repetition_penalty for openai (unsupported)", async () => {
    const { fetch, calls } = cannedFetch("{}");
    const router = makeRouter({
      providerConfigs: { openai: { apiKey: "sk-openai" } },
      fetchImpl: fetch,
      roleMap: {
        ...defaultRoleMapWith("narrator", {
          provider: "openai",
          model: "gpt-4o",
          samplers: { temperature: 0.6, topK: 40, minP: 0.05, repetitionPenalty: 1.2, frequencyPenalty: 0.3, maxTokens: 900 },
          source: "custom",
          samplersDirty: true,
        }),
      },
    });
    await router.complete("narrator", { system: "s", user: "u" });
    const body = calls[0]!.body;
    expect(body.temperature).toBe(0.6);
    expect(body.frequency_penalty).toBe(0.3); // supported by openai
    expect(body).not.toHaveProperty("top_k");
    expect(body).not.toHaveProperty("min_p");
    expect(body).not.toHaveProperty("repetition_penalty");
  });
});

/**
 * Build a full role map from DEFAULT_ROLE_MAP with one role overridden. Imported lazily to keep
 * the wire tests self-contained without re-stating all five bindings.
 */
import { DEFAULT_ROLE_MAP, type RoleBinding, type Role, type RoleMap } from "../../src/router/index.js";
function defaultRoleMapWith(role: Role, binding: RoleBinding): RoleMap {
  return { ...DEFAULT_ROLE_MAP, [role]: binding };
}
