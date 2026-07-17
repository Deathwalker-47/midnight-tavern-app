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
import type { ChatMessage, ChatResponse, FetchLike, ProviderConfig, StreamHandler } from "./providers/types.js";
import { makeProvider, PROVIDER_IDS, type ProviderId } from "./providers/registry.js";
import { DEFAULT_ROLE_MAP, ProviderIdSchema, type Role, type RoleBinding, type RoleMap } from "./roles.js";

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
          temperature: binding.samplers?.temperature,
          topP: binding.samplers?.topP,
          maxTokens: binding.samplers?.maxTokens,
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
          temperature: binding.samplers?.temperature,
          topP: binding.samplers?.topP,
          maxTokens: binding.samplers?.maxTokens,
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
