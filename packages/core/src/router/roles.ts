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

/** The five model-consuming roles (D9). */
export const ROLES = ["narrator", "classifier", "analyzer", "summarizer", "bootstrapper"] as const;
export type Role = (typeof ROLES)[number];

export const RoleSchema = z.enum(ROLES);
export const ProviderIdSchema = z.enum(PROVIDER_IDS);

/** Sampler settings for one role binding. */
export const SamplersSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
  topP: z.number().min(0).max(1).optional(),
  maxTokens: z.number().int().positive().optional(),
});
export type Samplers = z.infer<typeof SamplersSchema>;

/** One role's binding: which provider, which model, and how to sample. */
export const RoleBindingSchema = z.object({
  provider: ProviderIdSchema,
  model: z.string().min(1),
  samplers: SamplersSchema.optional(),
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
    samplers: { temperature: 0.8, maxTokens: 1200 },
  },
  classifier: {
    provider: "openrouter",
    model: "openai/gpt-4o-mini",
    samplers: { temperature: 0, maxTokens: 800 },
  },
  analyzer: {
    provider: "openrouter",
    model: "openai/gpt-4o-mini",
    samplers: { temperature: 0.2, maxTokens: 1000 },
  },
  summarizer: {
    provider: "openrouter",
    model: "openai/gpt-4o",
    samplers: { temperature: 0.3, maxTokens: 1500 },
  },
  bootstrapper: {
    provider: "openrouter",
    model: "anthropic/claude-sonnet-4",
    samplers: { temperature: 0.6, maxTokens: 4000 },
  },
};
