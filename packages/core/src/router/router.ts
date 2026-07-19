/**
 * Model router (low-level-plan §M3, D9).
 *
 * The single choke point for all LLM traffic. Given a role, it resolves the role→binding
 * map, builds the matching provider adapter, attaches the stored credentials, and runs
 * the chat (streaming for the narrator only). Everything above the router speaks in roles
 * and prompts; nothing above it knows a base URL or an API key.
 *
 * Credentials and the role map live in `settings` (validated on read). The router is
 * constructed with a `providerConfigs` lookup and a `roleMap` so callers — including the
 * structured-call layer and tests — can inject canned config without a live database.
 */
import { z } from "zod";
import type { ChatMessage, ChatRequest, ChatResponse, FetchLike, ProviderConfig, StreamHandler } from "./providers/types.js";
import { makeProvider, PROVIDER_IDS, type ProviderId } from "./providers/registry.js";
import { DEFAULT_ROLE_MAP, ProviderIdSchema, type Role, type RoleBinding, type RoleMap } from "./roles.js";
import { providerSupportsSampler } from "./samplers.js";

/**
 * Build the sampler slice of a chat request from a binding, dropping any field the binding's
 * provider does not honor (v2 §8). Keeps `undefined` out of the request so `buildBody` omits it.
 */
function samplerRequestFields(binding: RoleBinding): Partial<ChatRequest> {
  const s = binding.samplers;
  if (!s) return {};
  const p = binding.provider;
  const out: Partial<ChatRequest> = {};
  if (s.temperature !== undefined && providerSupportsSampler(p, "temperature")) out.temperature = s.temperature;
  if (s.topP !== undefined && providerSupportsSampler(p, "topP")) out.topP = s.topP;
  if (s.topK !== undefined && providerSupportsSampler(p, "topK")) out.topK = s.topK;
  if (s.minP !== undefined && providerSupportsSampler(p, "minP")) out.minP = s.minP;
  if (s.frequencyPenalty !== undefined && providerSupportsSampler(p, "frequencyPenalty")) out.frequencyPenalty = s.frequencyPenalty;
  if (s.presencePenalty !== undefined && providerSupportsSampler(p, "presencePenalty")) out.presencePenalty = s.presencePenalty;
  if (s.repetitionPenalty !== undefined && providerSupportsSampler(p, "repetitionPenalty")) out.repetitionPenalty = s.repetitionPenalty;
  if (s.maxTokens !== undefined && providerSupportsSampler(p, "maxTokens")) out.maxTokens = s.maxTokens;
  if (s.seed !== undefined && providerSupportsSampler(p, "seed")) out.seed = s.seed;
  if (s.stop && s.stop.length > 0 && providerSupportsSampler(p, "stop")) out.stop = s.stop;
  return out;
}

/** Per-provider stored credentials, keyed by provider id. Persisted in settings. */
export const ProviderConfigSchema = z.object({
  apiKey: z.string(),
  baseUrl: z.string().url().optional(),
});
export const ProviderConfigsSchema = z.record(ProviderIdSchema, ProviderConfigSchema);
export type ProviderConfigs = z.infer<typeof ProviderConfigsSchema>;

/** Settings key under which provider credentials are persisted. */
export const PROVIDER_CONFIGS_SETTING_KEY = "providerConfigs";

/** A prompt handed to the router: a system instruction plus the user content. */
export interface RolePrompt {
  system: string;
  user: string;
}

/** Raised when a role's provider has no stored credentials. */
export class MissingCredentialsError extends Error {
  constructor(
    readonly role: Role,
    readonly provider: ProviderId
  ) {
    super(`No API key configured for provider "${provider}" (role "${role}").`);
    this.name = "MissingCredentialsError";
  }
}

export interface Router {
  /** The binding backing a role (provider, model, samplers). */
  bindingFor(role: Role): RoleBinding;
  /** Non-streaming completion for any role. */
  complete(
    role: Role,
    prompt: RolePrompt,
    opts?: { jsonMode?: boolean; signal?: AbortSignal }
  ): Promise<ChatResponse>;
  /** Streaming completion — intended for the narrator role only. */
  stream(
    role: Role,
    prompt: RolePrompt,
    onDelta: StreamHandler,
    opts?: { signal?: AbortSignal }
  ): Promise<ChatResponse>;
}

export interface RouterDeps {
  roleMap?: RoleMap;
  providerConfigs: ProviderConfigs;
  fetchImpl?: FetchLike;
}

function toMessages(prompt: RolePrompt): ChatMessage[] {
  return [
    { role: "system", content: prompt.system },
    { role: "user", content: prompt.user },
  ];
}

/** Build a router over injected role map + credentials. */
export function makeRouter(deps: RouterDeps): Router {
  const roleMap = deps.roleMap ?? DEFAULT_ROLE_MAP;
  const fetchImpl = deps.fetchImpl ?? fetch;

  function resolve(role: Role): { binding: RoleBinding; config: ProviderConfig } {
    const binding = roleMap[role];
    const config = deps.providerConfigs[binding.provider];
    if (!config || !config.apiKey) {
      throw new MissingCredentialsError(role, binding.provider);
    }
    return { binding, config };
  }

  return {
    bindingFor(role) {
      return roleMap[role];
    },

    async complete(role, prompt, opts) {
      const { binding, config } = resolve(role);
      const provider = makeProvider(binding.provider, fetchImpl);
      return provider.chat(
        {
          model: binding.model,
          messages: toMessages(prompt),
          ...samplerRequestFields(binding),
          jsonMode: opts?.jsonMode ?? false,
          signal: opts?.signal,
        },
        config
      );
    },

    async stream(role, prompt, onDelta, opts) {
      const { binding, config } = resolve(role);
      const provider = makeProvider(binding.provider, fetchImpl);
      return provider.chatStream(
        {
          model: binding.model,
          messages: toMessages(prompt),
          ...samplerRequestFields(binding),
          signal: opts?.signal,
        },
        config,
        onDelta
      );
    },
  };
}

/** All known provider ids (re-exported for settings UIs). */
export { PROVIDER_IDS };
