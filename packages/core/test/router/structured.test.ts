/**
 * callStructured + extractJson tests (M3.3, §6).
 *
 * A fake Router returns scripted responses so the repair loop, Zod validation, JSON
 * extraction, and the terminal ModelOutputError are all exercised deterministically.
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { callStructured, extractJson, ModelOutputError } from "../../src/router/index.js";
import type { Router, RolePrompt } from "../../src/router/index.js";

const Schema = z.object({ name: z.string(), count: z.number().int() });

/** A Router whose `complete` returns the next scripted content each call. */
function scriptedRouter(responses: string[]): { router: Router; seen: string[] } {
  const seen: string[] = [];
  let i = 0;
  const router: Router = {
    bindingFor: () => ({ provider: "openrouter", model: "test", source: "recommended", samplersDirty: false }),
    async complete(_role, prompt: RolePrompt) {
      seen.push(prompt.user);
      const content = responses[Math.min(i, responses.length - 1)] ?? "";
      i++;
      return { content };
    },
    async stream() {
      throw new Error("not used");
    },
  };
  return { router, seen };
}

describe("extractJson", () => {
  it("reads raw JSON", () => {
    expect(extractJson('{"a":1}')).toBe('{"a":1}');
  });
  it("reads a fenced ```json block", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it("reads JSON embedded in prose", () => {
    expect(extractJson('Sure! {"a": 1, "b": [2,3]} done')).toBe('{"a": 1, "b": [2,3]}');
  });
  it("handles braces inside strings", () => {
    expect(extractJson('{"s":"a}b"}')).toBe('{"s":"a}b"}');
  });
  it("skips an unmatched prose brace before a later valid object", () => {
    expect(extractJson('Draft { unfinished\nFinal: {"a":1}')).toBe('{"a":1}');
  });
  it("unwraps a JSON object encoded inside a JSON string", () => {
    expect(extractJson(JSON.stringify('{"a":1}'))).toBe('{"a":1}');
  });
  it("returns null for an incomplete object", () => {
    expect(extractJson('{"a":1')).toBeNull();
  });
  it("returns null when there is no JSON", () => {
    expect(extractJson("no json here")).toBeNull();
  });
});

describe("callStructured", () => {
  it("returns the validated object on a first-attempt success", async () => {
    const { router, seen } = scriptedRouter(['{"name":"orc","count":3}']);
    const out = await callStructured(router, "classifier", { system: "s", user: "u" }, Schema);
    expect(out).toEqual({ name: "orc", count: 3 });
    expect(seen).toHaveLength(1); // no repair needed
  });

  it("repairs after invalid output and succeeds, re-prompting with the error", async () => {
    const { router, seen } = scriptedRouter([
      '{"name":"orc"}', // missing count → invalid
      '{"name":"orc","count":2}', // repaired
    ]);
    const repairs: Array<{ attempt: number; maxRepairs: number; error: string }> = [];
    const out = await callStructured(router, "classifier", { system: "s", user: "u" }, Schema, {
      onRepair: (attempt, maxRepairs, error) => repairs.push({ attempt, maxRepairs, error }),
    });
    expect(out).toEqual({ name: "orc", count: 2 });
    expect(seen).toHaveLength(2);
    expect(repairs).toEqual([{ attempt: 1, maxRepairs: 3, error: expect.stringContaining("count") }]);
    // The repair prompt must include the exact validation error and the prior output.
    expect(seen[1]).toContain("count");
    expect(seen[1]).toContain('{"name":"orc"}');
  });

  it("recovers from non-JSON then valid JSON", async () => {
    const { router } = scriptedRouter(["I cannot help", '{"name":"x","count":1}']);
    const out = await callStructured(router, "analyzer", { system: "s", user: "u" }, Schema);
    expect(out).toEqual({ name: "x", count: 1 });
  });

  it("retries a length-truncated response with a larger output budget", async () => {
    const budgets: Array<number | undefined> = [];
    let call = 0;
    const router: Router = {
      bindingFor: () => ({ provider: "electronhub", model: "test", source: "recommended", samplersDirty: false }),
      async complete(_role, _prompt, options) {
        budgets.push(options?.maxTokens);
        call++;
        return call === 1
          ? { content: '{"name":"unfinished', finishReason: "length" }
          : { content: '{"name":"orc","count":2}', finishReason: "stop" };
      },
      async stream() {
        throw new Error("not used");
      },
    };
    const repairs: string[] = [];
    const out = await callStructured(router, "bootstrapper", { system: "s", user: "u" }, Schema, {
      maxTokens: 3000,
      maxRepairTokens: 8000,
      onRepair: (_attempt, _max, error) => repairs.push(error),
    });
    expect(out).toEqual({ name: "orc", count: 2 });
    expect(budgets).toEqual([3000, 6000]);
    expect(repairs[0]).toMatch(/truncated.*3000-token/i);
  });

  it("treats unbalanced JSON with a normal stop as truncation and keeps repairs compact", async () => {
    const budgets: Array<number | undefined> = [];
    const seen: string[] = [];
    let call = 0;
    const oversized = `{"payload":"${"x".repeat(13_000)}`;
    const router: Router = {
      bindingFor: () => ({ provider: "electronhub", model: "test", source: "recommended", samplersDirty: false }),
      async complete(_role, prompt, options) {
        seen.push(prompt.user);
        budgets.push(options?.maxTokens);
        call++;
        return call === 1
          ? { content: oversized, finishReason: "stop" }
          : { content: '{"name":"orc","count":2}', finishReason: "stop" };
      },
      async stream() {
        throw new Error("not used");
      },
    };

    const out = await callStructured(router, "bootstrapper", { system: "s", user: "u" }, Schema, {
      maxTokens: 3_000,
      maxRepairTokens: 8_000,
    });
    expect(out).toEqual({ name: "orc", count: 2 });
    expect(budgets).toEqual([3_000, 6_000]);
    expect(seen[1]).toMatch(/incomplete or unbalanced JSON/i);
    expect(seen[1]).toMatch(/previous output omitted/i);
    expect(seen[1]).not.toContain("x".repeat(100));
  });

  it("throws ModelOutputError naming the role after exhausting repairs", async () => {
    const { router, seen } = scriptedRouter(["nope"]); // always invalid (repeats)
    const attempts: number[] = [];
    await expect(
      callStructured(router, "bootstrapper", { system: "s", user: "u" }, Schema, {
        maxRepairs: 2,
        onRepair: (attempt) => attempts.push(attempt),
      })
    ).rejects.toMatchObject({ name: "ModelOutputError", role: "bootstrapper", attempts: 3 });
    // 1 initial + 2 repairs = 3 attempts.
    expect(seen).toHaveLength(3);
    expect(attempts).toEqual([1, 2]);
  });

  it("surfaces a malformed-JSON parse error into the repair prompt", async () => {
    const { router, seen } = scriptedRouter(['{"name":"x","count":1', '{"name":"x","count":1}']);
    const out = await callStructured(router, "summarizer", { system: "s", user: "u" }, Schema);
    expect(out).toEqual({ name: "x", count: 1 });
    expect(seen[1]).toMatch(/parse error|could not be used/i);
  });

  it("the thrown error is an instance of ModelOutputError", async () => {
    const { router } = scriptedRouter(["garbage"]);
    const err = await callStructured(router, "classifier", { system: "s", user: "u" }, Schema, {
      maxRepairs: 0,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(ModelOutputError);
    expect((err as ModelOutputError).attempts).toBe(1);
  });
});
