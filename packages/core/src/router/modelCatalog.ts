/**
 * Curated model catalog (low-level-plan-v2 §1).
 *
 * A bundled, updatable list of models with the metadata the UI layers onto whatever a provider
 * actually offers: a recommendation badge, a tier, JSON-mode support, and optional per-role
 * sampler tuning. The bundle is NOT the source of truth for availability — the UI populates a
 * provider's dropdown from its live model list (or free-text) and then decorates entries by `id`
 * from this catalog. A model the user types that isn't here is allowed and treated as `advanced`.
 *
 * WHY INLINED (not a bundled .json): core runs in both Node and the Tauri webview, and the store's
 * migrations were deliberately inlined for the same reason — no filesystem/JSON-asset dependency,
 * identical behavior in every host. The tsc build only emits TypeScript sources, so a sibling .json
 * would not reach dist. Keep this list as a typed TS constant.
 */
import { z } from "zod";
import { RoleSchema, ProviderIdSchema } from "./roles.js";
import { SamplerProfileSchema } from "./samplers.js";
import { MODEL_RECOMMENDATION_CONFIG } from "./modelConfig.js";

/** One catalog entry: a model id plus the curated metadata we layer on by id. */
export const CatalogModelSchema = z.object({
  id: z.string().min(1),
  provider: ProviderIdSchema,
  label: z.string().min(1),
  recommendedFor: z.array(RoleSchema),
  tier: z.enum(["recommended", "advanced"]),
  contextTokens: z.number().int().positive(),
  supportsJsonMode: z.boolean(),
  /** Optional per-role sampler overrides applied when this model is picked for that role. */
  samplerDefaults: z.record(RoleSchema, SamplerProfileSchema).optional(),
  notes: z.string().optional(),
});
export type CatalogModel = z.infer<typeof CatalogModelSchema>;

/**
 * The shipped catalog. Model ids are OpenRouter-style slugs (or the provider's native id for
 * direct-provider entries). Update this list to refresh recommendations; the schema is validated
 * by a test so a malformed entry fails CI, not production.
 */
export const MODEL_CATALOG: readonly CatalogModel[] = z
  .array(CatalogModelSchema)
  .parse(MODEL_RECOMMENDATION_CONFIG.models);

/** Every catalog entry. */
export function allCatalogModels(): readonly CatalogModel[] {
  return MODEL_CATALOG;
}

/** The catalog entry for a model id, if curated metadata exists for it. */
export function catalogModel(id: string): CatalogModel | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}

/** Catalog entries a given provider carries (used to seed a dropdown when there's no live list). */
export function catalogModelsForProvider(provider: CatalogModel["provider"]): readonly CatalogModel[] {
  return MODEL_CATALOG.filter((m) => m.provider === provider);
}

/** True when a catalog model is a poor fit for a structured (JSON) role. */
export function isJsonRisk(id: string): boolean {
  const m = catalogModel(id);
  // Unknown (free-text) models are unknown-risk; known models are risky only if they lack JSON mode.
  return m ? !m.supportsJsonMode : false;
}
