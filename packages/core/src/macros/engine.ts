import { createBuiltinMacroRegistry } from "./builtins.js";
import { MacroRegistry } from "./registry.js";
import type {
  MacroCall,
  MacroContext,
  MacroEvaluation,
  MacroRuntime,
  MacroVariableStore,
  MacroWarning,
} from "./types.js";

interface LiteralToken {
  kind: "literal";
  value: string;
  offset: number;
}

interface TagToken {
  kind: "tag";
  value: string;
  raw: string;
  offset: number;
}

type Token = LiteralToken | TagToken;

interface LiteralNode {
  kind: "literal";
  value: string;
  offset: number;
}

interface MacroNode {
  kind: "macro";
  invocation: ParsedInvocation;
  children?: Node[];
}

type Node = LiteralNode | MacroNode;

interface ParsedInvocation {
  name: string;
  rawArgs: string[];
  raw: string;
  /** Exact scoped source, including its closing tag, when this invocation owns a block. */
  rawBlock?: string;
  offset: number;
  preserveWhitespace: boolean;
  closing: boolean;
}

interface EvaluationState {
  registry: MacroRegistry;
  context: MacroContext;
  variables: MacroVariableStore;
  warnings: MacroWarning[];
  bannedWords: Set<string>;
  invocationIndex: number;
  escaped: string[];
}

const LEGACY_MARKERS: Readonly<Record<string, string>> = {
  "<USER>": "{{user}}",
  "<BOT>": "{{char}}",
  "<CHAR>": "{{char}}",
  "<GROUP>": "{{group}}",
  "<CHARIFNOTGROUP>": "{{charIfNotGroup}}",
};

function protectEscaped(input: string, escaped: string[]): string {
  return input.replace(/\\\{\\\{([\s\S]*?)\\\}\\\}/g, (_match, inner: string) => {
    const index = escaped.push(`{{${inner}}}`) - 1;
    return `\uE000${index}\uE001`;
  });
}

function restoreEscaped(input: string, escaped: readonly string[]): string {
  return input.replace(/\uE000(\d+)\uE001/g, (_match, rawIndex: string) =>
    escaped[Number(rawIndex)] ?? ""
  );
}

function replaceLegacyMarkers(input: string): string {
  let result = input;
  for (const [legacy, macro] of Object.entries(LEGACY_MARKERS)) {
    result = result.replace(new RegExp(legacy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), macro);
  }
  return result;
}

function findTagEnd(input: string, start: number): number {
  let depth = 1;
  for (let index = start + 2; index < input.length - 1; index++) {
    const pair = input.slice(index, index + 2);
    if (pair === "{{") {
      depth++;
      index++;
    } else if (pair === "}}") {
      depth--;
      if (depth === 0) return index;
      index++;
    }
  }
  return -1;
}

function tokenize(input: string, state: EvaluationState): Token[] {
  const tokens: Token[] = [];
  let cursor = 0;
  while (cursor < input.length) {
    const open = input.indexOf("{{", cursor);
    if (open < 0) {
      tokens.push({ kind: "literal", value: input.slice(cursor), offset: cursor });
      break;
    }
    if (open > cursor) {
      tokens.push({ kind: "literal", value: input.slice(cursor, open), offset: cursor });
    }
    const close = findTagEnd(input, open);
    if (close < 0) {
      state.warnings.push({
        code: "malformed-macro",
        message: "Unclosed macro token was preserved verbatim.",
        source: input.slice(open),
        offset: open,
        severity: "error",
      });
      tokens.push({ kind: "literal", value: input.slice(open), offset: open });
      break;
    }
    const raw = input.slice(open, close + 2);
    tokens.push({
      kind: "tag",
      value: input.slice(open + 2, close),
      raw,
      offset: open,
    });
    cursor = close + 2;
  }
  return tokens;
}

function parseInvocation(token: TagToken): ParsedInvocation {
  let value = token.value.trim();
  if (value === "///") {
    return {
      name: "//",
      rawArgs: [],
      raw: token.raw,
      offset: token.offset,
      preserveWhitespace: false,
      closing: true,
    };
  }
  if (value.startsWith("//")) {
    return {
      name: "//",
      rawArgs: value.length > 2 ? [value.slice(2).trim()] : [],
      raw: token.raw,
      offset: token.offset,
      preserveWhitespace: false,
      closing: false,
    };
  }
  let closing = false;
  let preserveWhitespace = false;
  while (value.startsWith("/") || value.startsWith("#")) {
    if (value[0] === "/") closing = true;
    if (value[0] === "#") preserveWhitespace = true;
    value = value.slice(1).trimStart();
  }

  const nameMatch = value.match(/^([.$]?[A-Za-z][A-Za-z0-9_-]*|else)\b/);
  const name = nameMatch?.[1] ?? value.split(/\s|:/, 1)[0] ?? "";
  const remainder = value.slice(name.length);
  return {
    name,
    rawArgs: splitArguments(remainder),
    raw: token.raw,
    offset: token.offset,
    preserveWhitespace,
    closing,
  };
}

function splitArguments(remainder: string): string[] {
  const trimmed = remainder.trim();
  if (!trimmed) return [];
  const normalized = trimmed.startsWith("::")
    ? trimmed.slice(2)
    : trimmed.startsWith(":")
      ? trimmed.slice(1)
      : trimmed;
  if (!trimmed.startsWith("::")) return [normalized.trim()];

  const args: string[] = [];
  let cursor = 0;
  let depth = 0;
  for (let index = 0; index < normalized.length; index++) {
    const pair = normalized.slice(index, index + 2);
    if (pair === "{{") {
      depth++;
      index++;
    } else if (pair === "}}") {
      depth = Math.max(0, depth - 1);
      index++;
    } else if (pair === "::" && depth === 0) {
      args.push(normalized.slice(cursor, index).trim());
      cursor = index + 2;
      index++;
    }
  }
  args.push(normalized.slice(cursor).trim());
  return args;
}

function pairScopedTokens(tokens: readonly Token[]): Map<number, number> {
  const stacks = new Map<string, number[]>();
  const pairs = new Map<number, number>();
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token?.kind !== "tag") continue;
    const invocation = parseInvocation(token);
    const key = invocation.name.toLowerCase();
    if (!key || key === "else") continue;
    if (invocation.closing) {
      const stack = stacks.get(key);
      const openIndex = stack?.pop();
      if (openIndex !== undefined) pairs.set(openIndex, index);
    } else {
      const stack = stacks.get(key) ?? [];
      stack.push(index);
      stacks.set(key, stack);
    }
  }
  return pairs;
}

function buildNodes(
  tokens: readonly Token[],
  pairs: ReadonlyMap<number, number>,
  state: EvaluationState,
  start = 0,
  end = tokens.length
): Node[] {
  const nodes: Node[] = [];
  for (let index = start; index < end; index++) {
    const token = tokens[index];
    if (!token) continue;
    if (token.kind === "literal") {
      nodes.push({ kind: "literal", value: token.value, offset: token.offset });
      continue;
    }
    const invocation = parseInvocation(token);
    if (invocation.closing) {
      state.warnings.push({
        code: "malformed-macro",
        message: "Unmatched closing macro token was preserved verbatim.",
        source: invocation.raw,
        offset: invocation.offset,
        severity: "error",
      });
      nodes.push({ kind: "literal", value: invocation.raw, offset: invocation.offset });
      continue;
    }
    const closeIndex = pairs.get(index);
    if (closeIndex !== undefined && closeIndex < end) {
      const rawBlock = tokens
        .slice(index, closeIndex + 1)
        .map((part) => part.kind === "literal" ? part.value : part.raw)
        .join("");
      nodes.push({
        kind: "macro",
        invocation: { ...invocation, rawBlock },
        children: buildNodes(tokens, pairs, state, index + 1, closeIndex),
      });
      index = closeIndex;
    } else {
      nodes.push({ kind: "macro", invocation });
    }
  }
  return nodes;
}

function cloneVariables(context: MacroContext): MacroVariableStore {
  return {
    local: { ...(context.variables?.local ?? {}) },
    global: { ...(context.variables?.global ?? {}) },
  };
}

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function seededUnit(value: string): number {
  let state = hash(value) || 0x6d2b79f5;
  state += 0x6d2b79f5;
  let mixed = state;
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
}

function runtimeFor(state: EvaluationState, call: MacroCall): MacroRuntime {
  const invocationIndex = state.invocationIndex++;
  return {
    context: state.context,
    variables: state.variables,
    bannedWords: state.bannedWords,
    invocationIndex,
    random: () => state.context.random?.() ?? seededUnit(
      `${state.context.stableSeed ?? "midnight-tavern"}:${invocationIndex}`
    ),
    stableRandom: (key) => seededUnit(`${state.context.stableSeed ?? "midnight-tavern"}:${key}`),
    warn: (warning, source) => {
      state.warnings.push({ ...warning, source: source.source, offset: source.offset });
    },
  };
}

function isTruthy(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return !["", "false", "0", "off", "no", "null", "undefined"].includes(normalized);
}

function dedent(value: string): string {
  const trimmed = value.replace(/^\s*\n|\n\s*$/g, "");
  const lines = trimmed.split("\n");
  const nonEmpty = lines.filter((line) => line.trim().length > 0);
  const indentation = nonEmpty.length === 0
    ? 0
    : Math.min(...nonEmpty.map((line) => line.match(/^\s*/)?.[0].length ?? 0));
  return lines.map((line) => line.slice(Math.min(indentation, line.length))).join("\n").trim();
}

function splitIfChildren(children: readonly Node[]): { truthy: Node[]; falsy: Node[] } {
  const elseIndex = children.findIndex(
    (child) =>
      child.kind === "macro" &&
      child.invocation.name.toLowerCase() === "else" &&
      child.children === undefined
  );
  if (elseIndex < 0) return { truthy: [...children], falsy: [] };
  return {
    truthy: children.slice(0, elseIndex),
    falsy: children.slice(elseIndex + 1),
  };
}

function renderArgument(
  value: string,
  state: EvaluationState,
  depth: number
): string {
  return renderTextInternal(value, state, depth + 1);
}

function variableOperation(raw: string): {
  scope: "local" | "global";
  name: string;
  operator: string;
  value: string;
} | undefined {
  const matched = raw.trim().match(
    /^([.$])([A-Za-z][A-Za-z0-9_-]*[A-Za-z0-9]|[A-Za-z])\s*(\+\+|--|\|\|=|\?\?=|\+=|-=|==|!=|>=|<=|>|<|\|\||\?\?|=)?\s*([\s\S]*)$/
  );
  if (!matched) return undefined;
  return {
    scope: matched[1] === "$" ? "global" : "local",
    name: matched[2]!,
    operator: matched[3] ?? "",
    value: matched[4] ?? "",
  };
}

function comparable(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function renderVariableShorthand(
  invocation: ParsedInvocation,
  state: EvaluationState,
  depth: number
): string {
  const rawInside = invocation.raw.slice(2, -2).trim().replace(/^#\s*/, "");
  const operation = variableOperation(rawInside);
  if (!operation) {
    state.warnings.push({
      code: "malformed-macro",
      message: "Invalid variable shorthand was preserved verbatim.",
      source: invocation.raw,
      offset: invocation.offset,
      severity: "error",
    });
    return invocation.rawBlock ?? invocation.raw;
  }
  const store = state.variables[operation.scope];
  const current = store[operation.name];
  const hasCurrent = Object.prototype.hasOwnProperty.call(store, operation.name);
  const currentText = comparable(current);

  if (!operation.operator) return renderTextInternal(currentText, state, depth + 1);
  if (operation.operator === "++" || operation.operator === "--") {
    const next = (Number(currentText) || 0) + (operation.operator === "++" ? 1 : -1);
    store[operation.name] = next;
    return String(next);
  }

  if (operation.operator === "||") {
    return isTruthy(currentText)
      ? renderTextInternal(currentText, state, depth + 1)
      : renderArgument(operation.value, state, depth);
  }
  if (operation.operator === "??") {
    return hasCurrent
      ? renderTextInternal(currentText, state, depth + 1)
      : renderArgument(operation.value, state, depth);
  }
  if (operation.operator === "||=" || operation.operator === "??=") {
    const shouldAssign = operation.operator === "||=" ? !isTruthy(currentText) : !hasCurrent;
    if (shouldAssign) store[operation.name] = renderArgument(operation.value, state, depth);
    return comparable(store[operation.name]);
  }

  const right = renderArgument(operation.value, state, depth);
  if (operation.operator === "=") {
    store[operation.name] = right;
    return "";
  }
  if (operation.operator === "+=") {
    const leftNumber = Number(currentText);
    const rightNumber = Number(right);
    store[operation.name] = Number.isFinite(leftNumber) && Number.isFinite(rightNumber)
      ? leftNumber + rightNumber
      : `${currentText}${right}`;
    return "";
  }
  if (operation.operator === "-=") {
    const leftNumber = Number(currentText);
    const rightNumber = Number(right);
    if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) {
      state.warnings.push({
        code: "invalid-argument",
        message: "Variable subtraction requires numeric values.",
        source: invocation.raw,
        offset: invocation.offset,
        severity: "error",
      });
      return "";
    }
    store[operation.name] = leftNumber - rightNumber;
    return "";
  }
  if (operation.operator === "==" || operation.operator === "!=") {
    const equal = currentText === right;
    return String(operation.operator === "==" ? equal : !equal);
  }
  const leftNumber = Number(currentText);
  const rightNumber = Number(right);
  if (!Number.isFinite(leftNumber) || !Number.isFinite(rightNumber)) return "false";
  if (operation.operator === ">") return String(leftNumber > rightNumber);
  if (operation.operator === ">=") return String(leftNumber >= rightNumber);
  if (operation.operator === "<") return String(leftNumber < rightNumber);
  if (operation.operator === "<=") return String(leftNumber <= rightNumber);
  return "";
}

function evaluateCondition(
  raw: string,
  state: EvaluationState,
  depth: number
): boolean {
  let condition = raw.trim();
  let inverted = false;
  if (condition.startsWith("!")) {
    inverted = true;
    condition = condition.slice(1).trim();
  }

  let value: string;
  if (/^[.$][A-Za-z]/.test(condition)) {
    const token: TagToken = {
      kind: "tag",
      value: condition,
      raw: `{{${condition}}}`,
      offset: 0,
    };
    value = renderVariableShorthand(parseInvocation(token), state, depth);
  } else if (!condition.includes("{{") && state.registry.has(condition)) {
    value = invoke(
      {
        name: condition,
        rawArgs: [],
        raw: `{{${condition}}}`,
        offset: 0,
        preserveWhitespace: false,
        closing: false,
      },
      undefined,
      state,
      depth
    );
  } else {
    value = renderArgument(condition, state, depth);
  }
  return inverted ? !isTruthy(value) : isTruthy(value);
}

function invoke(
  invocation: ParsedInvocation,
  children: readonly Node[] | undefined,
  state: EvaluationState,
  depth: number
): string {
  const lower = invocation.name.toLowerCase();
  if (lower === "//") return "";
  if (invocation.name.startsWith(".") || invocation.name.startsWith("$")) {
    return renderVariableShorthand(invocation, state, depth);
  }

  if (lower === "if") {
    const { truthy, falsy } = splitIfChildren(children ?? []);
    const condition = invocation.rawArgs[0] ?? "";
    return renderNodes(
      evaluateCondition(condition, state, depth) ? truthy : falsy,
      state,
      depth + 1
    );
  }
  if (lower === "else") return "";

  const definition = state.registry.get(invocation.name);
  if (!definition) {
    const malformed = invocation.name.length === 0;
    state.warnings.push({
      code: malformed ? "malformed-macro" : "unknown-macro",
      message: malformed
        ? "Malformed macro token was preserved verbatim."
        : `Unknown macro "${invocation.name}" was preserved verbatim.`,
      source: invocation.raw,
      offset: invocation.offset,
      severity: "error",
    });
    return invocation.rawBlock ?? invocation.raw;
  }

  const args: string[] = [];
  for (const raw of invocation.rawArgs) args.push(renderArgument(raw, state, depth));
  let scoped: string | undefined;
  if (children) {
    scoped = renderNodes(children, state, depth + 1);
    if (!invocation.preserveWhitespace) scoped = dedent(scoped);
  }
  const call: MacroCall = {
    name: definition.name,
    args,
    source: invocation.raw,
    offset: invocation.offset,
    ...(scoped === undefined ? {} : { scoped }),
  };

  try {
    const resolved = definition.resolve(call, runtimeFor(state, call));
    const text = resolved === undefined || resolved === null ? "" : String(resolved);
    return text.includes("{{") ? renderTextInternal(text, state, depth + 1) : text;
  } catch (error) {
    state.warnings.push({
      code: "resolver-error",
      message: `Macro "${invocation.name}" failed: ${(error as Error).message}`,
      source: invocation.raw,
      offset: invocation.offset,
      severity: "error",
    });
    return "";
  }
}

function renderNodes(
  nodes: readonly Node[],
  state: EvaluationState,
  depth: number
): string {
  if (depth > (state.context.maxDepth ?? 20)) {
    state.warnings.push({
      code: "recursion-limit",
      message: "Macro recursion limit reached.",
      source: "",
      offset: 0,
      severity: "error",
    });
    return "";
  }
  let output = "";
  const limit = state.context.maxOutputLength ?? 1_000_000;
  for (const node of nodes) {
    output += node.kind === "literal"
      ? node.value
      : invoke(node.invocation, node.children, state, depth);
    if (output.length > limit) {
      state.warnings.push({
        code: "output-limit",
        message: `Macro output exceeded the ${limit}-character safety limit.`,
        source: "",
        offset: node.kind === "literal" ? node.offset : node.invocation.offset,
        severity: "error",
      });
      return output.slice(0, limit);
    }
  }
  return output;
}

function renderTextInternal(
  input: string,
  state: EvaluationState,
  depth: number
): string {
  const tokens = tokenize(input, state);
  return renderNodes(buildNodes(tokens, pairScopedTokens(tokens), state), state, depth);
}

/**
 * Resolve a macro-bearing string while preserving unsupported or malformed source verbatim.
 *
 * Unknown and malformed macros remain visible to callers and are returned as diagnostics,
 * allowing the importing surface to decide whether the containing field is required.
 * Explicitly escaped `\{\{literal\}\}` text is restored as a literal.
 */
export function evaluateMacros(
  input: string,
  context: MacroContext,
  registry: MacroRegistry = createBuiltinMacroRegistry()
): MacroEvaluation {
  const escaped: string[] = [];
  const state: EvaluationState = {
    registry,
    context,
    variables: cloneVariables(context),
    warnings: [],
    bannedWords: new Set(),
    invocationIndex: 0,
    escaped,
  };
  const protectedInput = protectEscaped(replaceLegacyMarkers(input), escaped);
  const output = restoreEscaped(renderTextInternal(protectedInput, state, 0), escaped);
  return {
    output,
    warnings: state.warnings,
    blocked: state.warnings.some((warning) => warning.severity === "error"),
    variables: state.variables,
    bannedWords: [...state.bannedWords],
  };
}

/** Return true when a string contains a non-escaped macro or supported legacy marker. */
export function hasResolvableMacros(input: string): boolean {
  const withoutEscapes = input.replace(/\\\{\\\{[\s\S]*?\\\}\\\}/g, "");
  return /\{\{/.test(withoutEscapes) || /<(?:USER|BOT|CHAR|GROUP|CHARIFNOTGROUP)>/i.test(input);
}
