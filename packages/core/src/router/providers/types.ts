/**
 * Provider transport types (low-level-plan §M3.1).
 *
 * Every provider speaks the OpenAI-compatible chat shape, so this is the single request/
 * response contract the router and structured-call layer build on. Adapters translate
 * these into HTTP and back; nothing above the router sees provider-specific wire formats.
 */

/** One chat turn. `system` is collapsed to a single leading message by callers. */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** A single non-streaming or streaming chat completion request. */
export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  topP?: number;
  /** Extended sampler surface (v2 §8). Provider-dependent; dropped at the wire when unsupported. */
  topK?: number;
  minP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  repetitionPenalty?: number;
  maxTokens?: number;
  /** Deterministic sampling seed, when the provider honors it. */
  seed?: number;
  /** Ask the provider to emit strict JSON (only honored when `supportsJsonMode`). */
  jsonMode?: boolean;
  stop?: string[];
  /** Abort in-flight requests (turn cancellation). */
  signal?: AbortSignal;
}

/** The text a completion produced, plus best-effort token accounting. */
export interface ChatResponse {
  content: string;
  usage?: { promptTokens?: number; completionTokens?: number };
  /** Provider stop signal, such as `stop`, `length`, or `content_filter`. */
  finishReason?: string;
}

/** Per-provider credentials/endpoint, resolved from settings at router construction. */
export interface ProviderConfig {
  apiKey: string;
  /** Overrides the provider's default base URL (required for `custom`). */
  baseUrl?: string;
}

/** A model advertised by a provider's live model-list endpoint. */
export type ProviderModel = {
  id: string;
  label: string;
  contextLength?: number;
};

/** Called with each incremental text delta during a streaming completion. */
export type StreamHandler = (delta: string) => void;

/** An OpenAI-compatible chat provider. */
export interface Provider {
  readonly id: string;
  /** Whether the provider honors `jsonMode` (drives structured-call strategy). */
  readonly supportsJsonMode: boolean;
  /** Probe an authenticated account endpoint when model listing alone is public. */
  validateConfig?(config: ProviderConfig, signal?: AbortSignal): Promise<void>;
  /** Fetch the models currently available to these credentials. */
  listModels?(config: ProviderConfig, signal?: AbortSignal): Promise<ProviderModel[]>;
  chat(req: ChatRequest, config: ProviderConfig): Promise<ChatResponse>;
  /** Streams deltas to `onDelta` and resolves with the full aggregated response. */
  chatStream(req: ChatRequest, config: ProviderConfig, onDelta: StreamHandler): Promise<ChatResponse>;
}

/** Injectable `fetch` (global by default) so adapters are testable without network. */
export type FetchLike = typeof fetch;
