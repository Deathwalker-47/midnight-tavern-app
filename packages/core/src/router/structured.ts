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
import type { ZodType, ZodTypeDef } from "zod";
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
  maxTokens?: number;
  maxRepairTokens?: number;
  signal?: AbortSignal;
  onRepair?: (attempt: number, maxRepairs: number, error: string) => void;
}

/**
 * @internal
 * Finds a balanced object or array beginning at a candidate offset.
 *
 * @param text - Text containing the candidate JSON span.
 * @param start - Offset of an opening object or array delimiter.
 * @returns Balanced span or `null` when delimiters are incomplete or mismatched.
 */
function balancedJsonSpan(text: string, start: number): string | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") {
      const expected = ch === "}" ? "{" : "[";
      if (stack.pop() !== expected) return null;
      if (stack.length === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Extracts an object or array from raw model text.
 *
 * @remarks
 * Supports raw JSON, fenced JSON, JSON strings, and prose containing later JSON values.
 *
 * @param text - Raw assistant response text.
 * @returns First parseable object/array span, a balanced malformed span for diagnostics,
 * or `null` when no complete span exists.
 */
export function extractJson(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    const direct = JSON.parse(trimmed) as unknown;
    if (direct !== null && typeof direct === "object") return trimmed;
    if (typeof direct === "string") return extractJson(direct);
  } catch {}

  for (const fence of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const nested = extractJson(fence[1] ?? "");
    if (nested) return nested;
  }

  let firstBalanced: string | null = null;
  for (let start = 0; start < trimmed.length; start++) {
    const ch = trimmed[start];
    if (ch !== "{" && ch !== "[") continue;
    const candidate = balancedJsonSpan(trimmed, start);
    if (!candidate) continue;
    firstBalanced ??= candidate;
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed !== null && typeof parsed === "object") return candidate;
    } catch {}
  }
  return firstBalanced;
}

/** Appended to the system prompt so models that ignore json-mode still return bare JSON. */
const JSON_INSTRUCTION =
  "\n\nRespond with ONLY one compact JSON value: no reasoning, prose, markdown fences, or commentary.";

const MAX_REPAIR_ECHO_CHARS = 12_000;

/** Build a repair prompt that shows the model exactly what failed. */
function repairUser(originalUser: string, raw: string, errorText: string): string {
  const previousOutput = raw.length <= MAX_REPAIR_ECHO_CHARS
    ? raw
    : `[Previous output omitted because it was ${raw.length} characters. Regenerate it more compactly.]`;
  return (
    originalUser +
    "\n\n---\nYour previous response could not be used. " +
    "It must be a single valid JSON value matching the required schema.\n" +
    `Validation error:\n${errorText}\n\n` +
    `Your previous output was:\n${previousOutput}\n\n` +
    "Return corrected JSON only."
  );
}

/**
 * Request typed output for a role. Validates against `schema`; on parse or validation
 * failure, re-prompts with the error up to `maxRepairs` times, then throws.
 *
 * @template T - Validated structured result type.
 * @param router - Configured model router.
 * @param role - Model role used for routing and error attribution.
 * @param prompt - System and user prompt pair.
 * @param schema - Zod schema for validation and normalization.
 * @param options - Repair, output-budget, progress, and cancellation options.
 * @returns Validated structured model output.
 * @throws {@link ModelOutputError} When every repair attempt fails.
 */
export async function callStructured<T>(
  router: Router,
  role: Role,
  prompt: RolePrompt,
  schema: ZodType<T, ZodTypeDef, unknown>,
  options: StructuredOptions = {}
): Promise<T> {
  const maxRepairs = options.maxRepairs ?? 3;
  const system = prompt.system + JSON_INSTRUCTION;

  let user = prompt.user;
  let lastError = "";
  let lastRaw = "";
  let requestMaxTokens = options.maxTokens;

  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    const res = await router.complete(
      role,
      { system, user },
      {
        jsonMode: true,
        signal: options.signal,
        ...(requestMaxTokens === undefined ? {} : { maxTokens: requestMaxTokens }),
      }
    );
    lastRaw = res.content;

    const jsonText = extractJson(res.content);
    const incompleteJson = jsonText === null && /[{[]/.test(res.content);
    if (jsonText === null) {
      lastError = res.finishReason === "length"
        ? `The provider truncated the JSON at the ${requestMaxTokens ?? "configured"}-token output limit.`
        : incompleteJson
          ? "The response contained incomplete or unbalanced JSON; the provider may have truncated it despite reporting a normal stop."
          : "No JSON value found in the response.";
    } else {
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonText);
      } catch (e) {
        lastError = `JSON parse error: ${(e as Error).message}`;
      }
      if (parsed !== undefined) {
        const result = schema.safeParse(parsed);
        if (result.success) return result.data;
        lastError = result.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ");
      }
    }
    if ((res.finishReason === "length" || incompleteJson) && requestMaxTokens !== undefined) {
      const ceiling = options.maxRepairTokens ?? requestMaxTokens * 2;
      requestMaxTokens = Math.min(requestMaxTokens * 2, ceiling);
    }
    if (attempt < maxRepairs) options.onRepair?.(attempt + 1, maxRepairs, lastError);
    user = repairUser(prompt.user, lastRaw, lastError);
  }

  throw new ModelOutputError(role, maxRepairs + 1, lastError, lastRaw);
}
