/**
 * Per-role recommendations (low-level-plan-v2 §1 & §5).
 *
 * Ranks the models available for a role so the UI can show "Recommended for <role>" first
 * (badged), then everything else, then a free-text affordance; and computes the app's shipped
 * default assignment per role (used by the wizard and "reset to recommended").
 *
 * Availability comes from the caller (a provider's live model list, or the catalog, or free
 * text); this module only layers curated ranking + metadata on top by model id.
 */
import { DEFAULT_ROLE_MAP, type Role, type RoleBinding } from "./roles.js";
import type { ProviderId } from "./providers/registry.js";
import { catalogModel, catalogModelsForProvider, type CatalogModel } from "./modelCatalog.js";
import { DEFAULT_SAMPLER_PROFILES, type SamplerProfile } from "./samplers.js";

/** One ranked candidate for a role's model dropdown. */
export interface RankedModel {
  id: string;
  label: string;
  provider: ProviderId;
  tier: "recommended" | "advanced";
  /** True when the catalog marks this model as recommended for THIS role. */
  recommendedForRole: boolean;
  supportsJsonMode: boolean;
  /** Curated entry if one exists (absent for free-text/unknown ids). */
  catalog?: CatalogModel;
}

/**
 * Rank the models available for `role` on `provider`. `availableIds` is the provider's actual
 * offering (live list or catalog fallback); when omitted we fall back to the catalog's entries
 * for that provider. Recommended-for-role models sort first, then other recommended-tier, then
 * advanced; ties break on label.
 */
export function modelsForRole(role: Role, provider: ProviderId, availableIds?: readonly string[]): RankedModel[] {
  const ids = availableIds ?? catalogModelsForProvider(provider).map((m) => m.id);
  const ranked = ids.map<RankedModel>((id) => {
    const cat = catalogModel(id);
    return {
      id,
      label: cat?.label ?? id,
      provider,
      tier: cat?.tier ?? "advanced",
      recommendedForRole: cat ? cat.recommendedFor.includes(role) : false,
      supportsJsonMode: cat?.supportsJsonMode ?? false,
      ...(cat ? { catalog: cat } : {}),
    };
  });
  return ranked.sort((a, b) => rankScore(a) - rankScore(b) || a.label.localeCompare(b.label));
}

/** Lower is earlier: recommended-for-role (0) < recommended tier (1) < advanced (2). */
function rankScore(m: RankedModel): number {
  if (m.recommendedForRole) return 0;
  if (m.tier === "recommended") return 1;
  return 2;
}

/**
 * The app's shipped default assignment for a role: the first catalog model recommended for it,
 * with its per-role sampler override if the catalog supplies one, else the role's default
 * profile. Marked `source: "recommended"` and `samplersDirty: false`.
 */
export function defaultAssignmentFor(role: Role): RoleBinding {
  const configured = DEFAULT_ROLE_MAP[role];
  return {
    ...configured,
    ...(configured.samplers ? { samplers: { ...configured.samplers } } : {}),
  };
}

/**
 * The sampler profile to apply when `modelId` is chosen for `role`: the catalog model's per-role
 * override if present, otherwise the role's shipped default profile.
 */
export function samplerProfileFor(role: Role, modelId?: string): SamplerProfile {
  const cat = modelId ? catalogModel(modelId) : undefined;
  const override = cat?.samplerDefaults?.[role];
  return override ?? DEFAULT_SAMPLER_PROFILES[role];
}
