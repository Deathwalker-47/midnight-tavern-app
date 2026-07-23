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
import { MODEL_RECOMMENDATION_CONFIG } from "./modelConfig.js";

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
export type PresetName = keyof typeof MODEL_RECOMMENDATION_CONFIG.samplerPresets;

/**
 * The three named presets. Values follow the v2 prototype's sampler panel: Precise is cold and
 * penalty-free for deterministic JSON; Creative is warm with light penalties for prose.
 */
export const SAMPLER_PRESETS: Record<PresetName, SamplerProfile> = Object.fromEntries(
  Object.entries(MODEL_RECOMMENDATION_CONFIG.samplerPresets).map(([name, profile]) => [
    name,
    SamplerProfileSchema.parse(profile),
  ])
) as Record<PresetName, SamplerProfile>;

/**
 * The shipped default profile per role (low-level-plan-v2 §8 "Default profiles by role").
 * Structured roles run cold; the narrator runs warm with light presence/frequency penalties.
 * These are what the wizard lands on and what "reset to recommended" restores.
 */
export const DEFAULT_SAMPLER_PROFILES: Record<Role, SamplerProfile> = Object.fromEntries(
  Object.entries(MODEL_RECOMMENDATION_CONFIG.defaultRoleMap).map(([role, binding]) => [
    role,
    SamplerProfileSchema.parse(binding.samplers),
  ])
) as Record<Role, SamplerProfile>;

/** The preset a role's default profile is closest to (drives the UI's initial preset chip). */
export const DEFAULT_PRESET_FOR_ROLE: Record<Role, PresetName> = {
  ...MODEL_RECOMMENDATION_CONFIG.defaultPresetForRole,
} as Record<Role, PresetName>;

/**
 * Which sampler fields each provider honors. Fields a provider doesn't support are rendered
 * disabled in the UI and dropped at the wire (the adapter logs what it dropped). `temperature`,
 * `topP`, `maxTokens`, `stop`, and `seed` are assumed universal; only the contested extras are
 * listed. A provider absent here (e.g. `custom`) is treated as supporting everything.
 */
export const SUPPORTED_SAMPLERS: Partial<
  Record<ProviderId, ReadonlySet<keyof SamplerProfile>>
> = Object.fromEntries(
  Object.entries(MODEL_RECOMMENDATION_CONFIG.providerSamplerSupport).map(
    ([provider, fields]) => [
      provider,
      new Set(fields as Array<keyof SamplerProfile>),
    ]
  )
) as Partial<Record<ProviderId, ReadonlySet<keyof SamplerProfile>>>;

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
