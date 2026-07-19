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

/** A model the UI can offer, with a tier badge. */
export interface KnownModel {
  provider: (typeof PROVIDER_IDS)[number];
  model: string;
  label: string;
  tier: "recommended" | "advanced";
}

/**
 * Curated model catalog for the wizard. `recommended` models are the safe first-run
 * picks (strong instruction-following + JSON reliability); `advanced` are exposed for
 * users who know what they want. Model ids are the OpenRouter-style slugs.
 */
export const KNOWN_MODELS: KnownModel[] = [
  { provider: "openrouter", model: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4", tier: "recommended" },
  { provider: "openrouter", model: "openai/gpt-4o", label: "GPT-4o", tier: "recommended" },
  { provider: "openrouter", model: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash", tier: "recommended" },
  { provider: "openrouter", model: "openai/gpt-4o-mini", label: "GPT-4o mini", tier: "recommended" },
  { provider: "openrouter", model: "deepseek/deepseek-chat", label: "DeepSeek V3", tier: "advanced" },
  { provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", tier: "advanced" },
  { provider: "openai", model: "gpt-4o", label: "GPT-4o (direct)", tier: "advanced" },
  { provider: "anthropic", model: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 (direct)", tier: "advanced" },
];

/**
 * Recommended default role map for a fresh install: OpenRouter throughout, a strong
 * generalist for narration/bootstrap and cheaper fast models for the mechanical roles.
 * Narrator runs warmer for prose; structured roles run cold for reliable JSON.
 */
export const DEFAULT_ROLE_MAP: RoleMap = {
  narrator: {
    provider: "openrouter",
    model: "anthropic/claude-sonnet-4",
    samplers: { temperature: 0.8, topP: 0.95, presencePenalty: 0.3, frequencyPenalty: 0.3, maxTokens: 1200 },
    source: "recommended",
    samplersDirty: false,
  },
  classifier: {
    provider: "openrouter",
    model: "openai/gpt-4o-mini",
    samplers: { temperature: 0, topP: 1, maxTokens: 500 },
    source: "recommended",
    samplersDirty: false,
  },
  analyzer: {
    provider: "openrouter",
    model: "openai/gpt-4o-mini",
    samplers: { temperature: 0.2, topP: 1, maxTokens: 800 },
    source: "recommended",
    samplersDirty: false,
  },
  summarizer: {
    provider: "openrouter",
    model: "openai/gpt-4o",
    samplers: { temperature: 0.5, topP: 0.95, maxTokens: 1200 },
    source: "recommended",
    samplersDirty: false,
  },
  bootstrapper: {
    provider: "openrouter",
    model: "anthropic/claude-sonnet-4",
    samplers: { temperature: 0.4, topP: 0.95, maxTokens: 3000 },
    source: "recommended",
    samplersDirty: false,
  },
};

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
