/**
 * Known-provider registry (low-level-plan §M3.1, D9).
 *
 * All eleven providers speak OpenAI-compatible chat, so each is just a `ProviderSpec`
 * (base URL, auth style, JSON-mode support). `openrouter` is the recommended default
 * aggregator; `custom` requires the user to supply a base URL.
 */
import type { FetchLike, Provider } from "./types.js";
import { makeOpenAiCompatProvider, type ProviderSpec } from "./openaiCompat.js";

/** The provider ids the router understands. */
export const PROVIDER_IDS = [
  "openrouter",
  "electronhub",
  "nanogpt",
  "openai",
  "anthropic",
  "google",
  "mistral",
  "deepseek",
  "xai",
  "groq",
  "custom",
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

/** Static specs for every known provider. */
export const PROVIDER_SPECS: Record<ProviderId, ProviderSpec> = {
  openrouter: {
    id: "openrouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    supportsJsonMode: true,
    auth: "bearer",
    credentialProbePath: "/key",
  },
  electronhub: {
    id: "electronhub",
    defaultBaseUrl: "https://api.electronhub.ai/v1",
    supportsJsonMode: true,
    auth: "bearer",
  },
  nanogpt: {
    id: "nanogpt",
    defaultBaseUrl: "https://nano-gpt.com/api/v1",
    supportsJsonMode: true,
    auth: "bearer",
  },
  openai: {
    id: "openai",
    defaultBaseUrl: "https://api.openai.com/v1",
    supportsJsonMode: true,
    auth: "bearer",
  },
  anthropic: {
    // Anthropic exposes an OpenAI-compatible endpoint under /v1.
    id: "anthropic",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    supportsJsonMode: false,
    auth: "x-api-key",
    extraHeaders: { "anthropic-version": "2023-06-01" },
  },
  google: {
    // Gemini's OpenAI-compatibility layer.
    id: "google",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    supportsJsonMode: true,
    auth: "bearer",
  },
  mistral: {
    id: "mistral",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    supportsJsonMode: true,
    auth: "bearer",
  },
  deepseek: {
    id: "deepseek",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    supportsJsonMode: true,
    auth: "bearer",
  },
  xai: {
    id: "xai",
    defaultBaseUrl: "https://api.x.ai/v1",
    supportsJsonMode: true,
    auth: "bearer",
  },
  groq: {
    id: "groq",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    supportsJsonMode: true,
    auth: "bearer",
  },
  custom: {
    // The user must supply a base URL via ProviderConfig; JSON mode assumed off until known.
    id: "custom",
    defaultBaseUrl: "",
    supportsJsonMode: false,
    auth: "bearer",
  },
};

/** True for a string that names a known provider. */
export function isProviderId(id: string): id is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(id);
}

/** Build the provider adapter for a known id, sharing the injected `fetch`. */
export function makeProvider(id: ProviderId, fetchImpl: FetchLike = fetch): Provider {
  return makeOpenAiCompatProvider(PROVIDER_SPECS[id], fetchImpl);
}
