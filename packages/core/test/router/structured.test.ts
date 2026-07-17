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
    bindingFor: () => ({ provider: "openrouter", model: "test" }),
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
    const out = await callStructured(router, "classifier", { system: "s", user: "u" }, Schema);
    expect(out).toEqual({ name: "orc", count: 2 });
    expect(seen).toHaveLength(2);
    // The repair prompt must include the exact validation error and the prior output.
    expect(seen[1]).toContain("count");
    expect(seen[1]).toContain('{"name":"orc"}');
  });

  it("recovers from non-JSON then valid JSON", async () => {
    const { router } = scriptedRouter(["I cannot help", '{"name":"x","count":1}']);
    const out = await callStructured(router, "analyzer", { system: "s", user: "u" }, Schema);
    expect(out).toEqual({ name: "x", count: 1 });
  });

  it("throws ModelOutputError naming the role after exhausting repairs", async () => {
    const { router, seen } = scriptedRouter(["nope"]); // always invalid (repeats)
    await expect(
      callStructured(router, "bootstrapper", { system: "s", user: "u" }, Schema, { maxRepairs: 2 })
    ).rejects.toMatchObject({ name: "ModelOutputError", role: "bootstrapper", attempts: 3 });
    // 1 initial + 2 repairs = 3 attempts.
    expect(seen).toHaveLength(3);
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
