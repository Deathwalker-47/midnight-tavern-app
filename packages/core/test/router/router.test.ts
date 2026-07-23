/**
 * Router + provider-adapter tests (M3).
 *
 * A canned `fetch` returns real `Response` objects, so the OpenAI-compatible adapter,
 * the role→provider dispatch, credential resolution, and streaming are exercised with
 * zero network traffic. `callStructured` is covered in structured.test.ts.
 */
import { describe, it, expect } from "vitest";
import {
  makeRouter,
  makeProvider,
  MissingCredentialsError,
  ProviderTimeoutError,
  ProviderHttpError,
  PROVIDER_SPECS,
  DEFAULT_ROLE_MAP,
  type FetchLike,
  type ProviderConfigs,
  type DiagnosticLogger,
} from "../../src/router/index.js";

/** A fetch stub that records each request and returns a canned chat completion. */
function cannedFetch(content: string): {
  fetch: FetchLike;
  calls: { url: string; body: any; headers: any }[];
} {
  const calls: { url: string; body: any; headers: any }[] = [];
  const fetch = (async (url: string, init: any) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    return new Response(
      JSON.stringify({
        choices: [{ message: { content }, finish_reason: "stop" }],
        usage: { prompt_tokens: 5, completion_tokens: 7 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as unknown as FetchLike;
  return { fetch, calls };
}

const configs: ProviderConfigs = { openrouter: { apiKey: "sk-test" } };

describe("router.complete", () => {
  it("dispatches to the role's provider and returns content", async () => {
    const { fetch, calls } = cannedFetch("hello world");
    const router = makeRouter({ providerConfigs: configs, fetchImpl: fetch });
    const res = await router.complete("narrator", { system: "sys", user: "usr" });
    expect(res.content).toBe("hello world");
    expect(res.usage).toEqual({ promptTokens: 5, completionTokens: 7 });
    expect(res.finishReason).toBe("stop");
    expect(calls[0]!.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(calls[0]!.body.model).toBe(DEFAULT_ROLE_MAP.narrator.model);
    expect(calls[0]!.headers.authorization).toBe("Bearer sk-test");
  });

  it("sends system + user messages in order with samplers applied", async () => {
    const { fetch, calls } = cannedFetch("{}");
    const router = makeRouter({ providerConfigs: configs, fetchImpl: fetch });
    await router.complete("classifier", { system: "S", user: "U" }, { jsonMode: true });
    const body = calls[0]!.body;
    expect(body.messages).toEqual([
      { role: "system", content: "S" },
      { role: "user", content: "U" },
    ]);
    expect(body.temperature).toBe(DEFAULT_ROLE_MAP.classifier.samplers!.temperature);
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("allows a task-specific output budget to override the role sampler", async () => {
    const { fetch, calls } = cannedFetch("{}");
    const router = makeRouter({ providerConfigs: configs, fetchImpl: fetch });
    await router.complete("bootstrapper", { system: "S", user: "U" }, { maxTokens: 8000 });
    expect(calls[0]!.body.max_tokens).toBe(8000);
  });

  it("logs response size, finish reason, and token count without response content", async () => {
    const events: Array<{ event: string; data?: Readonly<Record<string, unknown>> }> = [];
    const logger: DiagnosticLogger = {
      debug: (event, data) => events.push({ event, data }),
      info: (event, data) => events.push({ event, data }),
      warn: (event, data) => events.push({ event, data }),
      error: (event, data) => events.push({ event, data }),
    };
    const { fetch } = cannedFetch("private model output");
    const router = makeRouter({ providerConfigs: configs, fetchImpl: fetch, logger });
    await router.complete("narrator", { system: "S", user: "U" });
    expect(events.at(-1)).toMatchObject({
      event: "llm.request.completed",
      data: { responseChars: 20, finishReason: "stop", completionTokens: 7 },
    });
    expect(JSON.stringify(events)).not.toContain("private model output");
  });

  it("throws MissingCredentialsError when the provider has no key", async () => {
    const { fetch } = cannedFetch("x");
    const router = makeRouter({ providerConfigs: {}, fetchImpl: fetch });
    await expect(router.complete("narrator", { system: "s", user: "u" })).rejects.toBeInstanceOf(
      MissingCredentialsError
    );
  });

  it("times out a provider that never settles and records metadata without prompt or credentials", async () => {
    const events: Array<{ level: string; event: string; data?: Readonly<Record<string, unknown>> }> = [];
    const logger: DiagnosticLogger = {
      debug: (event, data) => events.push({ level: "debug", event, data }),
      info: (event, data) => events.push({ level: "info", event, data }),
      warn: (event, data) => events.push({ level: "warn", event, data }),
      error: (event, data) => events.push({ level: "error", event, data }),
    };
    const stalledFetch = (() => new Promise<Response>(() => undefined)) as unknown as FetchLike;
    const router = makeRouter({
      providerConfigs: configs,
      fetchImpl: stalledFetch,
      logger,
      requestTimeoutMs: 10,
    });

    await expect(
      router.complete("narrator", { system: "private system prompt", user: "private user prompt" })
    ).rejects.toBeInstanceOf(ProviderTimeoutError);

    expect(events.map((entry) => entry.event)).toEqual([
      "llm.request.started",
      "llm.request.failed",
    ]);
    expect(events[1]?.data).toMatchObject({ timedOut: true, provider: "openrouter" });
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("private system prompt");
    expect(serialized).not.toContain("private user prompt");
    expect(serialized).not.toContain("sk-test");
  });
});

describe("provider adapter", () => {
  it("excludes ElectronHub reasoning from structured responses", async () => {
    const { fetch, calls } = cannedFetch("{}");
    const provider = makeProvider("electronhub", fetch);
    await provider.chat(
      { model: "claude-sonnet-4-20250514", messages: [{ role: "user", content: "json" }], jsonMode: true },
      { apiKey: "key" }
    );
    expect(calls[0]!.body.response_format).toEqual({ type: "json_object" });
    expect(calls[0]!.body.reasoning).toEqual({ exclude: true });
  });

  it("joins text blocks returned by an OpenAI-compatible proxy", async () => {
    const fetch = (async () =>
      new Response(JSON.stringify({
        choices: [{
          message: { content: [{ type: "text", text: "{\"ok\":" }, { type: "text", text: "true}" }] },
          finish_reason: "stop",
        }],
      }), { status: 200, headers: { "content-type": "application/json" } })) as unknown as FetchLike;
    const provider = makeProvider("electronhub", fetch);
    const response = await provider.chat(
      { model: "claude-sonnet-4-20250514", messages: [{ role: "user", content: "json" }] },
      { apiKey: "key" }
    );
    expect(response).toMatchObject({ content: '{"ok":true}', finishReason: "stop" });
  });

  it("omits response_format for providers without json-mode (anthropic)", async () => {
    const { fetch, calls } = cannedFetch("ok");
    const provider = makeProvider("anthropic", fetch);
    await provider.chat(
      { model: "claude-x", messages: [{ role: "user", content: "hi" }], jsonMode: true },
      { apiKey: "key" }
    );
    expect(calls[0]!.headers["x-api-key"]).toBe("key");
    expect(calls[0]!.headers["anthropic-version"]).toBe("2023-06-01");
    expect(calls[0]!.body.response_format).toBeUndefined();
  });

  it("raises ProviderHttpError on non-2xx", async () => {
    const fetch = (async () =>
      new Response("nope", { status: 429, statusText: "Too Many Requests" })) as unknown as FetchLike;
    const provider = makeProvider("openai", fetch);
    await expect(
      provider.chat({ model: "gpt", messages: [{ role: "user", content: "x" }] }, { apiKey: "k" })
    ).rejects.toBeInstanceOf(ProviderHttpError);
  });

  it("resolves a custom base URL from config", async () => {
    const { fetch, calls } = cannedFetch("y");
    const provider = makeProvider("custom", fetch);
    await provider.chat(
      { model: "m", messages: [{ role: "user", content: "x" }] },
      { apiKey: "k", baseUrl: "https://my.host/v1/" }
    );
    expect(calls[0]!.url).toBe("https://my.host/v1/chat/completions");
  });
});

describe("router.stream (narrator)", () => {
  it("aggregates SSE deltas and forwards each to the handler", async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"Once "}}]}',
      'data: {"choices":[{"delta":{"content":"upon "}}]}',
      'data: {"choices":[{"delta":{"content":"a time"}}]}',
      "data: [DONE]",
      "",
    ].join("\n");
    const fetch = (async () =>
      new Response(sse, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      })) as unknown as FetchLike;
    const router = makeRouter({ providerConfigs: configs, fetchImpl: fetch });
    const deltas: string[] = [];
    const res = await router.stream("narrator", { system: "s", user: "u" }, (d) => deltas.push(d));
    expect(deltas).toEqual(["Once ", "upon ", "a time"]);
    expect(res.content).toBe("Once upon a time");
  });
});

describe("PROVIDER_SPECS", () => {
  it("has an entry for every provider id; only custom lacks a default url", () => {
    for (const [id, spec] of Object.entries(PROVIDER_SPECS)) {
      expect(spec.id).toBe(id);
      if (id !== "custom") expect(spec.defaultBaseUrl).toMatch(/^https:\/\//);
    }
  });
});
