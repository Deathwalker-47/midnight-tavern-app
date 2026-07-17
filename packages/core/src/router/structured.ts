/**
 * Structured model calls (low-level-plan §M3.3, §6).
 *
 * `callStructured` is how every non-narrator role gets typed output. It asks the model
 * for JSON (native json-mode where the provider supports it, plus an explicit fenced-free
 * instruction), extracts and parses the JSON, and validates it against a Zod schema. On
 * any failure it re-prompts with the *exact* Zod/parse error text, up to `maxRepairs`
 * attempts, then throws `ModelOutputError` — never a silent fake-success fallback.
 *
 * The error names the failing role so the UI can surface the honest "try a recommended
 * model" message (§6).
 */
import type { ZodType } from "zod";
import type { Router, RolePrompt } from "./router.js";
import type { Role } from "./roles.js";

/** Thrown after the repair loop is exhausted. Carries the role and the last error text. */
export class ModelOutputError extends Error {
  constructor(
    readonly role: Role,
    readonly attempts: number,
    readonly lastError: string,
    readonly lastRaw: string
  ) {
    super(`Model role "${role}" failed to produce valid output after ${attempts} attempt(s): ${lastError}`);
    this.name = "ModelOutputError";
  }
}

export interface StructuredOptions {
  maxRepairs?: number; // default 3
  signal?: AbortSignal;
}

/**
 * Extract a JSON object/array from model text. Handles: raw JSON, ```json fenced blocks,
 * and JSON embedded in prose (first balanced object/array). Returns the substring or null.
 */
export function extractJson(text: string): string | null {
  const trimmed = text.trim();

  // 1. Fenced code block (```json ... ``` or ``` ... ```).
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) {
    const inner = fence[1].trim();
    if (inner) return inner;
  }

  // 2. First balanced { } or [ ] span (handles leading/trailing prose).
  const start = trimmed.search(/[{[]/);
  if (start === -1) return null;
  const open = trimmed[start]!;
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < trimmed.length; i++) {
    const ch = trimmed[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return trimmed.slice(start, i + 1);
    }
  }
  return null;
}

/** Appended to the system prompt so models that ignore json-mode still return bare JSON. */
const JSON_INSTRUCTION =
  "\n\nRespond with ONLY a single JSON value — no prose, no markdown fences, no commentary.";

/** Build a repair prompt that shows the model exactly what failed. */
function repairUser(originalUser: string, raw: string, errorText: string): string {
  return (
    originalUser +
    "\n\n---\nYour previous response could not be used. " +
    "It must be a single valid JSON value matching the required schema.\n" +
    `Validation error:\n${errorText}\n\n` +
    `Your previous output was:\n${raw}\n\n` +
    "Return corrected JSON only."
  );
}

/**
 * Request typed output for a role. Validates against `schema`; on parse or validation
 * failure, re-prompts with the error up to `maxRepairs` times, then throws.
 */
export async function callStructured<T>(
  router: Router,
  role: Role,
  prompt: RolePrompt,
  schema: ZodType<T>,
  options: StructuredOptions = {}
): Promise<T> {
  const maxRepairs = options.maxRepairs ?? 3;
  const system = prompt.system + JSON_INSTRUCTION;

  let user = prompt.user;
  let lastError = "";
  let lastRaw = "";

  // 1 initial attempt + up to `maxRepairs` repairs.
  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    const res = await router.complete(role, { system, user }, { jsonMode: true, signal: options.signal });
    lastRaw = res.content;

    const jsonText = extractJson(res.content);
    if (jsonText === null) {
      lastError = "No JSON value found in the response.";
    } else {
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonText);
      } catch (e) {
        lastError = `JSON parse error: ${(e as Error).message}`;
        user = repairUser(prompt.user, lastRaw, lastError);
        continue;
      }
      const result = schema.safeParse(parsed);
      if (result.success) return result.data;
      lastError = result.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
    }
    user = repairUser(prompt.user, lastRaw, lastError);
  }

  throw new ModelOutputError(role, maxRepairs + 1, lastError, lastRaw);
}
