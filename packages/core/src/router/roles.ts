/**
 * Role → model routing (low-level-plan §M3.2, D9).
 *
 * Five roles each map to a (provider, model, samplers) binding, persisted in `settings`
 * under one key. The router reads this map to dispatch a call for a given role. A
 * recommended-defaults table ships so a first-run install is usable the moment keys are
 * entered; each known model carries a `tier` so the UI can badge recommended vs advanced.
 */
import { z } from "zod";
import { PROVIDER_IDS } from "./providers/registry.js";
import { MODEL_RECOMMENDATION_CONFIG } from "./modelConfig.js";

/** The five model-consuming roles (D9). "bootstrapper" is surfaced to users as "Story AI". */
export const ROLES = ["narrator", "classifier", "analyzer", "summarizer", "bootstrapper"] as const;
export type Role = (typeof ROLES)[number];

export const RoleSchema = z.enum(ROLES);
export const ProviderIdSchema = z.enum(PROVIDER_IDS);

/**
 * Sampler settings for one role binding. Widened for v2 (§8): the full sampler surface, all
 * fields optional so older 3-field bindings still validate. The canonical/complete profile shape
 * lives in `samplers.ts` (`SamplerProfileSchema`); this permissive schema is what gets persisted
 * on a binding, since some fields are provider-dependent and may be absent.
 */
export const SamplersSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  topK: z.number().int().min(0).optional(),
  minP: z.number().min(0).max(1).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  repetitionPenalty: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  stop: z.array(z.string()).optional(),
  seed: z.number().int().optional(),
});
export type Samplers = z.infer<typeof SamplersSchema>;

/**
 * Where a binding's samplers/model came from — drives the UI's "Recommended"/"Advanced" badge and
 * the "reset to recommended" affordance. `samplersDirty` is set once the user hand-edits any
 * sampler away from the preset/recommended value (shows the "● overridden" marker).
 */
export const RoleBindingSourceSchema = z.enum(["recommended", "custom"]);
export type RoleBindingSource = z.infer<typeof RoleBindingSourceSchema>;

/** One role's binding: which provider, which model, and how to sample. */
export const RoleBindingSchema = z.object({
  provider: ProviderIdSchema,
  model: z.string().min(1),
  samplers: SamplersSchema.optional(),
  source: RoleBindingSourceSchema.optional().default("recommended"),
  samplersDirty: z.boolean().optional().default(false),
});
export type RoleBinding = z.infer<typeof RoleBindingSchema>;

/** The full role→binding map, one entry per role. */
export const RoleMapSchema = z.object({
  narrator: RoleBindingSchema,
  classifier: RoleBindingSchema,
  analyzer: RoleBindingSchema,
  summarizer: RoleBindingSchema,
  bootstrapper: RoleBindingSchema,
});
export type RoleMap = z.infer<typeof RoleMapSchema>;

/** Settings key under which the role map is persisted. */
export const ROLE_MAP_SETTING_KEY = "roleMap";

/** Settings key for the connected provider that recommended/default role bindings should follow. */
export const PRIMARY_PROVIDER_SETTING_KEY = "primaryProvider";

/** A model the UI can offer, with a tier badge. */
export interface KnownModel {
  provider: (typeof PROVIDER_IDS)[number];
  model: string;
  label: string;
  tier: "recommended" | "advanced";
  /** Whether the model reliably honors JSON/structured output. Structured roles warn when false. */
  supportsJsonMode: boolean;
}

/**
 * Curated model catalog for the wizard. `recommended` models are the safe first-run
 * picks (strong instruction-following + JSON reliability); `advanced` are exposed for
 * users who know what they want. Model ids are the OpenRouter-style slugs.
 */
export const KNOWN_MODELS: KnownModel[] = MODEL_RECOMMENDATION_CONFIG.models.map((entry) => ({
  provider: ProviderIdSchema.parse(entry.provider),
  model: entry.id,
  label: entry.label,
  tier: entry.tier as KnownModel["tier"],
  supportsJsonMode: entry.supportsJsonMode,
}));

/**
 * Recommended default role map for a fresh install: OpenRouter throughout, a strong
 * generalist for narration/bootstrap and cheaper fast models for the mechanical roles.
 * Narrator runs warmer for prose; structured roles run cold for reliable JSON.
 */
export const DEFAULT_ROLE_MAP: RoleMap = RoleMapSchema.parse(
  MODEL_RECOMMENDATION_CONFIG.defaultRoleMap
);

/**
 * User-facing role labels (low-level-plan-v2 §5). The internal id `bootstrapper` is shown as
 * "Story AI" everywhere in the UI; the rest match their ids title-cased. Keep the internal enum
 * unchanged so persisted role maps and the router need no migration.
 */
export const ROLE_LABELS: Record<Role, string> = {
  narrator: "Narrator",
  classifier: "Classifier",
  analyzer: "Analyzer",
  summarizer: "Summarizer",
  bootstrapper: "Story AI",
};
