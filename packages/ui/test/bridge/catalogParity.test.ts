/**
 * Catalog parity — the in-memory (browser/dev) bridge in `bridge/core.ts` carries hand-synced
 * copies of core's model/provider/config catalog (the `MEMORY_*` constants) because it must not
 * value-import core's native runtime into the eager webview bundle. The SQLite bridge, by contrast,
 * reads the canonical values straight from `@midnight-tavern/core`.
 *
 * That duplication is deliberate (a bundle-boundary constraint), but it has drifted before — the
 * audit found real JSON-capability drift. This suite makes drift impossible to merge: it asserts the
 * in-memory bridge's public catalog surface is byte-identical to canonical core. If core's catalog
 * changes and the memory copy is not updated, THIS test fails. Keep the copies in step; don't relax
 * the assertions.
 */
import { describe, it, expect } from "vitest";
import * as core from "@midnight-tavern/core";
import { makeMemoryBridge } from "../../src/bridge/core";

const bridge = makeMemoryBridge();

describe("in-memory bridge catalog stays in sync with canonical core", () => {
  it("provider IDs match core.PROVIDER_IDS", () => {
    expect(bridge.providerIds()).toEqual(core.PROVIDER_IDS);
  });

  it("default role map matches core.DEFAULT_ROLE_MAP", () => {
    expect(bridge.defaultRoleMap()).toEqual(core.DEFAULT_ROLE_MAP);
  });

  it("known models match core.KNOWN_MODELS", () => {
    expect(bridge.knownModels()).toEqual(core.KNOWN_MODELS);
  });

  it("universal actions config matches core.UNIVERSAL_ACTIONS_CONFIG", async () => {
    expect(await bridge.universalActionsConfig()).toEqual(core.UNIVERSAL_ACTIONS_CONFIG);
  });

  it("equipment loot config matches core.EQUIPMENT_LOOT_CONFIG", async () => {
    expect(await bridge.equipmentLootConfig()).toEqual(core.EQUIPMENT_LOOT_CONFIG);
  });

  it("model recommendation config matches the view core exposes", () => {
    const expected = {
      version: core.MODEL_RECOMMENDATION_CONFIG_VERSION,
      samplerPresets: core.SAMPLER_PRESETS,
      defaultPresetForRole: core.DEFAULT_PRESET_FOR_ROLE,
      providerSamplerSupport: Object.fromEntries(
        Object.entries(core.SUPPORTED_SAMPLERS).map(([provider, fields]) => [provider, [...(fields ?? [])]])
      ),
    };
    expect(bridge.modelRecommendationConfig()).toEqual(expected);
  });

  it("providerSupportsSampler agrees with core for every configured provider/field", () => {
    const fields = [
      "temperature",
      "topP",
      "topK",
      "minP",
      "frequencyPenalty",
      "presencePenalty",
      "repetitionPenalty",
      "maxTokens",
      "stop",
      "seed",
    ] as const;
    for (const provider of Object.keys(core.SUPPORTED_SAMPLERS) as core.ProviderId[]) {
      for (const field of fields) {
        expect(bridge.providerSupportsSampler(provider, field)).toBe(
          core.providerSupportsSampler(provider, field)
        );
      }
    }
  });
});
