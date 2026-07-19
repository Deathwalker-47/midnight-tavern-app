/**
 * Sampler surface + shipped defaults (low-level-plan-v2 §8).
 *
 * The full sampler profile is per-role — there is no global creativity control. Structured/
 * deterministic roles (classifier, analyzer, bootstrapper) run cold for reliable JSON; narration
 * runs warm. Three named presets (Precise / Balanced / Creative) set a whole profile in one tap;
 * each role also ships a default profile used by the wizard and "reset to recommended".
 *
 * Internal field names are camelCase (matching the existing binding samplers); the provider
 * adapters translate to the wire's snake_case (`top_p`, `max_tokens`, …) in `buildBody`.
 */
import { z } from "zod";
import type { Role } from "./roles.js";
import type { ProviderId } from "./providers/registry.js";

/**
 * One role's full sampler profile. Only `temperature`/`topP`/`maxTokens` are universally
 * honored; the rest are provider-dependent (see {@link SUPPORTED_SAMPLERS}) and omitted at the
 * wire when unsupported.
 */
export const SamplerProfileSchema = z.object({
  temperature: z.number().min(0).max(2),
  topP: z.number().min(0).max(1),
  topK: z.number().int().min(0).optional(), // 0 = off
  minP: z.number().min(0).max(1).optional(), // 0 = off
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  presencePenalty: z.number().min(-2).max(2).optional(),
  repetitionPenalty: z.number().min(0).max(2).optional(), // 1 = off
  maxTokens: z.number().int().positive(),
  stop: z.array(z.string()).optional(),
  seed: z.number().int().optional(), // optional determinism
});
export type SamplerProfile = z.infer<typeof SamplerProfileSchema>;

/** The named presets the UI offers as one-tap profiles. */
export type PresetName = "Precise" | "Balanced" | "Creative";

/**
 * The three named presets. Values follow the v2 prototype's sampler panel: Precise is cold and
 * penalty-free for deterministic JSON; Creative is warm with light penalties for prose.
 */
export const SAMPLER_PRESETS: Record<PresetName, SamplerProfile> = {
  Precise: {
    temperature: 0,
    topP: 1,
    topK: 0,
    minP: 0,
    frequencyPenalty: 0,
    presencePenalty: 0,
    repetitionPenalty: 1,
    maxTokens: 800,
  },
  Balanced: {
    temperature: 0.5,
    topP: 0.95,
    topK: 40,
    minP: 0.02,
    frequencyPenalty: 0,
    presencePenalty: 0,
    repetitionPenalty: 1.05,
    maxTokens: 1200,
  },
  Creative: {
    temperature: 0.8,
    topP: 0.98,
    topK: 60,
    minP: 0.05,
    frequencyPenalty: 0.2,
    presencePenalty: 0.2,
    repetitionPenalty: 1.1,
    maxTokens: 1600,
  },
};

/**
 * The shipped default profile per role (low-level-plan-v2 §8 "Default profiles by role").
 * Structured roles run cold; the narrator runs warm with light presence/frequency penalties.
 * These are what the wizard lands on and what "reset to recommended" restores.
 */
export const DEFAULT_SAMPLER_PROFILES: Record<Role, SamplerProfile> = {
  classifier: { temperature: 0, topP: 1, maxTokens: 500 },
  analyzer: { temperature: 0.2, topP: 1, maxTokens: 800 },
  bootstrapper: { temperature: 0.4, topP: 0.95, maxTokens: 3000 },
  summarizer: { temperature: 0.5, topP: 0.95, maxTokens: 1200 },
  narrator: { temperature: 0.8, topP: 0.95, presencePenalty: 0.3, frequencyPenalty: 0.3, maxTokens: 1200 },
};

/** The preset a role's default profile is closest to (drives the UI's initial preset chip). */
export const DEFAULT_PRESET_FOR_ROLE: Record<Role, PresetName> = {
  classifier: "Precise",
  analyzer: "Precise",
  bootstrapper: "Balanced",
  summarizer: "Balanced",
  narrator: "Creative",
};

/**
 * Which sampler fields each provider honors. Fields a provider doesn't support are rendered
 * disabled in the UI and dropped at the wire (the adapter logs what it dropped). `temperature`,
 * `topP`, `maxTokens`, `stop`, and `seed` are assumed universal; only the contested extras are
 * listed. A provider absent here (e.g. `custom`) is treated as supporting everything.
 */
export const SUPPORTED_SAMPLERS: Partial<Record<ProviderId, ReadonlySet<keyof SamplerProfile>>> = {
  // OpenAI's chat API has no top_k / min_p / repetition_penalty (it uses frequency/presence).
  openai: new Set(["temperature", "topP", "frequencyPenalty", "presencePenalty", "maxTokens", "stop", "seed"]),
  // Anthropic's OpenAI-compat layer omits penalties and min_p; top_k is supported.
  anthropic: new Set(["temperature", "topP", "topK", "maxTokens", "stop"]),
};

/** True if `provider` honors sampler `field` (unknown providers support everything). */
export function providerSupportsSampler(provider: ProviderId, field: keyof SamplerProfile): boolean {
  const set = SUPPORTED_SAMPLERS[provider];
  return set ? set.has(field) : true;
}

/** Return `profile` with any fields the provider doesn't support removed. */
export function pruneUnsupported(profile: SamplerProfile, provider: ProviderId): SamplerProfile {
  const set = SUPPORTED_SAMPLERS[provider];
  if (!set) return profile;
  const out = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(profile)) {
    if (set.has(k as keyof SamplerProfile)) out[k] = v;
  }
  return out as unknown as SamplerProfile;
}

/** Name the preset a profile exactly matches, else null (i.e. "Custom"). */
export function matchPreset(profile: SamplerProfile): PresetName | null {
  for (const name of Object.keys(SAMPLER_PRESETS) as PresetName[]) {
    const p = SAMPLER_PRESETS[name];
    const keys = Object.keys(p) as (keyof SamplerProfile)[];
    if (keys.every((k) => typeof p[k] === "number" && Math.abs((p[k] as number) - ((profile[k] as number) ?? NaN)) < 1e-6)) {
      return name;
    }
  }
  return null;
}
