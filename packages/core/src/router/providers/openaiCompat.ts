/**
 * OpenAI-compatible chat adapter (low-level-plan §M3.1).
 *
 * Every provider in the registry speaks the OpenAI `/chat/completions` dialect, so a
 * single adapter — parameterized by base URL and auth header — covers all of them. The
 * only per-provider variation is the endpoint, the credential header, and whether the
 * provider honors JSON mode; those come from the `ProviderSpec` the adapter is built with.
 *
 * `fetch` is injected (defaults to the global) so the router and its tests never touch
 * the network unless a real `fetch` is supplied.
 */
import type {
  ChatRequest,
  ChatResponse,
  FetchLike,
  Provider,
  ProviderConfig,
  ProviderModel,
  StreamHandler,
} from "./types.js";

/** Static description of a known provider: how to reach it and how to authenticate. */
export interface ProviderSpec {
  id: string;
  /** Default API base (no trailing slash), e.g. `https://openrouter.ai/api/v1`. */
  defaultBaseUrl: string;
  /** Whether the provider honors OpenAI-style `response_format: json_object`. */
  supportsJsonMode: boolean;
  /**
   * How the API key is attached. `bearer` → `Authorization: Bearer <key>` (OpenAI,
   * OpenRouter, most). `x-api-key` → Anthropic-style header + version.
   */
  auth: "bearer" | "x-api-key";
  /** Extra static headers (e.g. Anthropic's `anthropic-version`). */
  extraHeaders?: Record<string, string>;
  /** Authenticated GET path used when the public model list cannot validate a key. */
  credentialProbePath?: string;
}

/** Raised when a provider returns a non-2xx HTTP status. Carries the status for the router. */
export class ProviderHttpError extends Error {
  constructor(
    readonly providerId: string,
    readonly status: number,
    readonly body: string,
    readonly retryAfterMs?: number
  ) {
    super(`${providerId}: HTTP ${status}`);
    this.name = "ProviderHttpError";
  }
}

/** Parse the standard Retry-After header without allowing an unbounded provider-controlled wait. */
function retryAfterMs(response: Response): number | undefined {
  const value = response.headers.get("retry-after")?.trim();
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return undefined;
  return Math.max(0, at - Date.now());
}

function resolveBaseUrl(spec: ProviderSpec, config: ProviderConfig): string {
  const base = (config.baseUrl ?? spec.defaultBaseUrl).replace(/\/+$/, "");
  if (!base) throw new Error(`${spec.id}: no base URL configured`);
  return base;
}

function buildHeaders(spec: ProviderSpec, config: ProviderConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...spec.extraHeaders,
  };
  if (spec.auth === "bearer") headers["authorization"] = `Bearer ${config.apiKey}`;
  else headers["x-api-key"] = config.apiKey;
  return headers;
}

function extractModels(json: unknown): ProviderModel[] {
  const data = (json as { data?: unknown })?.data;
  const rows = Array.isArray(data) ? data : Array.isArray(json) ? json : [];
  const seen = new Set<string>();
  const models: ProviderModel[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const value = row as Record<string, unknown>;
    const id = typeof value["id"] === "string" ? value["id"].trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name = typeof value["name"] === "string" ? value["name"].trim() : "";
    const contextLength =
      typeof value["context_length"] === "number"
        ? value["context_length"]
        : typeof value["context_window"] === "number"
          ? value["context_window"]
          : undefined;
    models.push({ id, label: name || id, ...(contextLength ? { contextLength } : {}) });
  }
  return models.sort((a, b) => a.label.localeCompare(b.label));
}

/** Translate our neutral ChatRequest into the OpenAI request body. */
function buildBody(req: ChatRequest, spec: ProviderSpec, stream: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
    stream,
  };
  if (req.temperature !== undefined) body["temperature"] = req.temperature;
  if (req.topP !== undefined) body["top_p"] = req.topP;
  if (req.topK !== undefined) body["top_k"] = req.topK;
  if (req.minP !== undefined) body["min_p"] = req.minP;
  if (req.frequencyPenalty !== undefined) body["frequency_penalty"] = req.frequencyPenalty;
  if (req.presencePenalty !== undefined) body["presence_penalty"] = req.presencePenalty;
  if (req.repetitionPenalty !== undefined) body["repetition_penalty"] = req.repetitionPenalty;
  if (req.maxTokens !== undefined) body["max_tokens"] = req.maxTokens;
  if (req.seed !== undefined) body["seed"] = req.seed;
  if (req.stop && req.stop.length > 0) body["stop"] = req.stop;
  if (req.jsonMode && spec.supportsJsonMode) body["response_format"] = { type: "json_object" };
  if (req.jsonMode && spec.id === "electronhub") body["reasoning"] = { exclude: true };
  return body;
}

/** Pull the assistant text out of a non-streaming OpenAI response body. */
function extractContent(json: unknown): string {
  const choice = (json as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (typeof block === "string") return block;
      if (!block || typeof block !== "object") return "";
      const candidate = block as { text?: unknown; content?: unknown };
      if (typeof candidate.text === "string") return candidate.text;
      return typeof candidate.content === "string" ? candidate.content : "";
    })
    .join("");
}

function extractFinishReason(json: unknown): string | undefined {
  const reason = (json as { choices?: { finish_reason?: unknown }[] })?.choices?.[0]?.finish_reason;
  return typeof reason === "string" ? reason : undefined;
}

function extractUsage(json: unknown): ChatResponse["usage"] {
  const u = (json as { usage?: { prompt_tokens?: number; completion_tokens?: number } })?.usage;
  if (!u) return undefined;
  const usage: { promptTokens?: number; completionTokens?: number } = {};
  if (typeof u.prompt_tokens === "number") usage.promptTokens = u.prompt_tokens;
  if (typeof u.completion_tokens === "number") usage.completionTokens = u.completion_tokens;
  return usage;
}

/** Parse one SSE `data:` payload's JSON into a streamed content delta, if any. */
function extractDelta(json: unknown): string {
  const choice = (json as { choices?: { delta?: { content?: unknown } }[] })?.choices?.[0];
  const content = choice?.delta?.content;
  return typeof content === "string" ? content : "";
}

/**
 * Consume an OpenAI SSE stream, forwarding each content delta to `onDelta` and
 * resolving with the aggregated text. Tolerates split chunks by buffering to newlines.
 */
async function consumeSseStream(
  stream: ReadableStream<Uint8Array>,
  onDelta: StreamHandler
): Promise<ChatResponse> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      // SSE events are newline-delimited; process each complete line.
      while ((nl = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const delta = extractDelta(JSON.parse(data));
          if (delta) {
            full += delta;
            onDelta(delta);
          }
        } catch {
          // Ignore keep-alive comments and unparseable partials.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
  return { content: full };
}

/**
 * Build an OpenAI-compatible provider from a spec. The returned `Provider` is stateless;
 * credentials arrive per call via `ProviderConfig`.
 */
export function makeOpenAiCompatProvider(spec: ProviderSpec, fetchImpl: FetchLike = fetch): Provider {
  async function post(req: ChatRequest, config: ProviderConfig, stream: boolean): Promise<Response> {
    const url = `${resolveBaseUrl(spec, config)}/chat/completions`;
    const init: RequestInit = {
      method: "POST",
      headers: buildHeaders(spec, config),
      body: JSON.stringify(buildBody(req, spec, stream)),
    };
    if (req.signal) init.signal = req.signal;
    const res = await fetchImpl(url, init);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ProviderHttpError(spec.id, res.status, body, retryAfterMs(res));
    }
    return res;
  }

  return {
    id: spec.id,
    supportsJsonMode: spec.supportsJsonMode,

    ...(spec.credentialProbePath
      ? {
          async validateConfig(config: ProviderConfig, signal?: AbortSignal) {
            const url = `${resolveBaseUrl(spec, config)}${spec.credentialProbePath}`;
            const headers = buildHeaders(spec, config);
            delete headers["content-type"];
            const res = await fetchImpl(url, { method: "GET", headers, ...(signal ? { signal } : {}) });
            if (!res.ok) {
              const body = await res.text().catch(() => "");
              throw new ProviderHttpError(spec.id, res.status, body, retryAfterMs(res));
            }
          },
        }
      : {}),

    async listModels(config, signal) {
      const url = `${resolveBaseUrl(spec, config)}/models`;
      const headers = buildHeaders(spec, config);
      delete headers["content-type"];
      const res = await fetchImpl(url, { method: "GET", headers, ...(signal ? { signal } : {}) });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new ProviderHttpError(spec.id, res.status, body, retryAfterMs(res));
      }
      return extractModels(await res.json());
    },

    async chat(req, config) {
      const res = await post(req, config, false);
      const json = await res.json();
      const usage = extractUsage(json);
      const finishReason = extractFinishReason(json);
      return {
        content: extractContent(json),
        ...(usage ? { usage } : {}),
        ...(finishReason ? { finishReason } : {}),
      };
    },

    async chatStream(req, config, onDelta) {
      const res = await post(req, config, true);
      if (!res.body) {
        // No stream body (e.g. a mocked non-stream response): forward the whole text once.
        const text = await res.text();
        let full = text;
        try {
          full = extractContent(JSON.parse(text)) || text;
        } catch {
          // keep raw text
        }
        if (full) onDelta(full);
        return { content: full };
      }
      return consumeSseStream(res.body, onDelta);
    },
  };
}
