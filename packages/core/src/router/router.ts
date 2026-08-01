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
import {
  NOOP_DIAGNOSTIC_LOGGER,
  type DiagnosticData,
  type DiagnosticLogger,
} from "../observability/logger.js";
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

/** Raised when a provider request exceeds the router's bounded request window. */
export class ProviderTimeoutError extends Error {
  constructor(
    readonly provider: ProviderId,
    readonly model: string,
    readonly timeoutMs: number
  ) {
    super(`The ${provider} request timed out after ${Math.round(timeoutMs / 1_000)} seconds. Try again or choose another model.`);
    this.name = "ProviderTimeoutError";
  }
}

export interface Router {
  /** The binding backing a role (provider, model, samplers). */
  bindingFor(role: Role): RoleBinding;
  /** Non-streaming completion for any role. */
  complete(
    role: Role,
    prompt: RolePrompt,
    opts?: { jsonMode?: boolean; signal?: AbortSignal; maxTokens?: number }
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
  /** Local diagnostic sink. Request bodies, prompts, responses, and credentials are never passed. */
  logger?: DiagnosticLogger;
  /** Per-provider request deadline. Defaults to 90 seconds. */
  requestTimeoutMs?: number;
  /** Injectable bounded wait used by retry tests; production uses an abort-aware timer. */
  retryDelay?: (delayMs: number, signal: AbortSignal) => Promise<void>;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 180_000;
const MAX_PROVIDER_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 250;
const MAX_RETRY_DELAY_MS = 2_000;

type RequestGuard = {
  signal: AbortSignal;
  run<T>(request: Promise<T>): Promise<T>;
  timedOut(): boolean;
  dispose(): void;
};

function cancellationError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error("The request was cancelled.");
  error.name = "AbortError";
  return error;
}

function requestGuard(
  parent: AbortSignal | undefined,
  timeoutError: ProviderTimeoutError
): RequestGuard {
  const controller = new AbortController();
  let didTimeout = false;
  let rejectCancellation: (reason: Error) => void = () => undefined;
  const cancellation = new Promise<never>((_resolve, reject) => {
    rejectCancellation = reject;
  });
  const cancelFromParent = () => {
    const error = parent ? cancellationError(parent) : cancellationError(controller.signal);
    controller.abort(error);
    rejectCancellation(error);
  };
  if (parent?.aborted) cancelFromParent();
  else parent?.addEventListener("abort", cancelFromParent, { once: true });

  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort(timeoutError);
    rejectCancellation(timeoutError);
  }, timeoutError.timeoutMs);

  return {
    signal: controller.signal,
    run<T>(request: Promise<T>): Promise<T> {
      return Promise.race([request, cancellation]);
    },
    timedOut: () => didTimeout,
    dispose() {
      clearTimeout(timer);
      parent?.removeEventListener("abort", cancelFromParent);
    },
  };
}

function errorMetadata(error: unknown): DiagnosticData {
  if (!(error instanceof Error)) return { errorName: "UnknownError" };
  const status = "status" in error && typeof error.status === "number" ? error.status : undefined;
  return { errorName: error.name, ...(status === undefined ? {} : { status }) };
}

function isRetryableProviderError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (!error || typeof error !== "object") return false;
  const status = "status" in error && typeof error.status === "number" ? error.status : undefined;
  return status === 408 || status === 409 || status === 425 || status === 429 || (status !== undefined && status >= 500 && status <= 599);
}

function providerRetryDelayMs(error: unknown, attempt: number): number {
  const backoff = RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1);
  const requested =
    error &&
    typeof error === "object" &&
    "retryAfterMs" in error &&
    typeof error.retryAfterMs === "number" &&
    Number.isFinite(error.retryAfterMs)
      ? Math.max(0, error.retryAfterMs)
      : 0;
  return Math.min(MAX_RETRY_DELAY_MS, Math.max(backoff, requested));
}

function abortAwareDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(cancellationError(signal));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(cancellationError(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
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
  const logger = deps.logger ?? NOOP_DIAGNOSTIC_LOGGER;
  const requestTimeoutMs = deps.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const retryDelay = deps.retryDelay ?? abortAwareDelay;
  let requestSequence = 0;

  function log(level: keyof DiagnosticLogger, event: string, data?: DiagnosticData): void {
    try {
      logger[level](event, data);
    } catch {
      // Diagnostics must never alter application behavior.
    }
  }

  function resolve(role: Role): { binding: RoleBinding; config: ProviderConfig } {
    const binding = roleMap[role];
    const config = deps.providerConfigs[binding.provider];
    if (!config || !config.apiKey) {
      throw new MissingCredentialsError(role, binding.provider);
    }
    return { binding, config };
  }

  async function runProviderRequest(
    operation: "complete" | "stream",
    role: Role,
    signal: AbortSignal | undefined,
    jsonMode: boolean,
    request: (binding: RoleBinding, config: ProviderConfig, signal: AbortSignal) => Promise<ChatResponse>,
    canRetry: () => boolean = () => true
  ): Promise<ChatResponse> {
    const startedAt = Date.now();
    const requestId = `llm-${startedAt.toString(36)}-${++requestSequence}`;
    let binding: RoleBinding;
    let config: ProviderConfig;
    try {
      ({ binding, config } = resolve(role));
    } catch (error) {
      log("error", "llm.request.rejected", { requestId, role, ...errorMetadata(error) });
      throw error;
    }

    const timeoutError = new ProviderTimeoutError(binding.provider, binding.model, requestTimeoutMs);
    const guard = requestGuard(signal, timeoutError);
    const common = {
      requestId,
      operation,
      role,
      provider: binding.provider,
      model: binding.model,
      jsonMode,
    };
    log("info", "llm.request.started", common);
    try {
      for (let attempt = 1; attempt <= MAX_PROVIDER_ATTEMPTS; attempt += 1) {
        try {
          const response = await guard.run(request(binding, config, guard.signal));
          log("info", "llm.request.completed", {
            ...common,
            attempt,
            durationMs: Date.now() - startedAt,
            responseChars: response.content.length,
            ...(response.finishReason ? { finishReason: response.finishReason } : {}),
            ...(response.usage?.completionTokens === undefined
              ? {}
              : { completionTokens: response.usage.completionTokens }),
          });
          return response;
        } catch (error) {
          const shouldRetry =
            attempt < MAX_PROVIDER_ATTEMPTS &&
            !guard.signal.aborted &&
            canRetry() &&
            isRetryableProviderError(error);
          if (!shouldRetry) throw error;
          const delayMs = providerRetryDelayMs(error, attempt);
          log("warn", "llm.request.retrying", {
            ...common,
            attempt,
            nextAttempt: attempt + 1,
            delayMs,
            ...errorMetadata(error),
          });
          await guard.run(retryDelay(delayMs, guard.signal));
        }
      }
      throw new Error("Provider retry loop ended unexpectedly.");
    } catch (error) {
      log("error", "llm.request.failed", {
        ...common,
        durationMs: Date.now() - startedAt,
        timedOut: guard.timedOut(),
        cancelled: signal?.aborted ?? false,
        ...errorMetadata(error),
      });
      throw error;
    } finally {
      guard.dispose();
    }
  }

  return {
    bindingFor(role) {
      return roleMap[role];
    },

    async complete(role, prompt, opts) {
      return runProviderRequest(
        "complete",
        role,
        opts?.signal,
        opts?.jsonMode ?? false,
        async (binding, config, signal) => {
          const provider = makeProvider(binding.provider, fetchImpl);
          return provider.chat(
            {
              model: binding.model,
              messages: toMessages(prompt),
              ...samplerRequestFields(binding),
              ...(opts?.maxTokens === undefined ? {} : { maxTokens: opts.maxTokens }),
              jsonMode: opts?.jsonMode ?? false,
              signal,
            },
            config
          );
        }
      );
    },

    async stream(role, prompt, onDelta, opts) {
      let emittedDelta = false;
      return runProviderRequest(
        "stream",
        role,
        opts?.signal,
        false,
        async (binding, config, signal) => {
          const provider = makeProvider(binding.provider, fetchImpl);
          return provider.chatStream(
            {
              model: binding.model,
              messages: toMessages(prompt),
              ...samplerRequestFields(binding),
              signal,
            },
            config,
            (delta) => {
              emittedDelta = true;
              onDelta(delta);
            }
          );
        },
        () => !emittedDelta
      );
    },
  };
}

/** All known provider ids (re-exported for settings UIs). */
export { PROVIDER_IDS };
