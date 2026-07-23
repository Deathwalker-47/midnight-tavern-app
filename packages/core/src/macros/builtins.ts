import { MacroRegistry } from "./registry.js";
import type { MacroCall, MacroContext, MacroRuntime, MacroScalar } from "./types.js";

function personName(value: MacroContext["user"] | MacroContext["char"]): string | undefined {
  return typeof value === "string" ? value : value?.name;
}

function userDescription(context: MacroContext): string | undefined {
  return typeof context.user === "string" ? undefined : context.user?.description;
}

function stringify(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function variable(
  runtime: MacroRuntime,
  scope: "local" | "global",
  name: string
): unknown {
  return runtime.variables[scope][name];
}

function setVariable(
  runtime: MacroRuntime,
  scope: "local" | "global",
  name: string,
  value: unknown
): void {
  runtime.variables[scope][name] = value;
}

function numeric(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function addValue(current: unknown, addition: string): unknown {
  const left = numeric(current);
  const right = numeric(addition);
  if (left !== undefined && right !== undefined) return left + right;
  return `${stringify(current)}${addition}`;
}

function direct(
  registry: MacroRegistry,
  name: string,
  read: (context: MacroContext, call: MacroCall) => MacroScalar,
  aliases?: readonly string[]
): void {
  registry.register({
    name,
    ...(aliases ? { aliases } : {}),
    resolve: (call, runtime) => read(runtime.context, call),
  });
}

function missing(
  runtime: MacroRuntime,
  call: MacroCall,
  description: string
): string {
  runtime.warn(
    {
      code: "missing-context",
      message: `${call.source} requires ${description}, but it is not available.`,
      severity: "error",
    },
    call
  );
  return "";
}

function messageAt(context: MacroContext, fromEnd: number): MacroMessageLike | undefined {
  const messages = context.messages ?? [];
  return messages[messages.length - 1 - fromEnd];
}

type MacroMessageLike = NonNullable<MacroContext["messages"]>[number];

function lastByRole(context: MacroContext, role: MacroMessageLike["role"]): MacroMessageLike | undefined {
  const messages = context.messages ?? [];
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message?.role === role) return message;
  }
  return undefined;
}

function localTime(date: Date, offset?: string): Date {
  if (!offset) return date;
  const matched = offset.match(/^UTC\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i);
  if (!matched) return date;
  const hours = Number(matched[2]);
  const minutes = Number(matched[3] ?? 0);
  const sign = matched[1] === "-" ? -1 : 1;
  return new Date(date.getTime() + sign * (hours * 60 + minutes) * 60_000);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatDateTime(date: Date, format: string): string {
  const replacements: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    MM: pad(date.getMonth() + 1),
    DD: pad(date.getDate()),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds()),
  };
  return format.replace(/YYYY|MM|DD|HH|mm|ss/g, (token) => replacements[token] ?? token);
}

function humanDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(Math.abs(milliseconds) / 1_000));
  if (totalSeconds < 60) return `${totalSeconds} second${totalSeconds === 1 ? "" : "s"}`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes} minute${totalMinutes === 1 ? "" : "s"}`;
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) return `${totalHours} hour${totalHours === 1 ? "" : "s"}`;
  const totalDays = Math.floor(totalHours / 24);
  return `${totalDays} day${totalDays === 1 ? "" : "s"}`;
}

function registerVariables(registry: MacroRegistry): void {
  const scopes = [
    ["var", "local"],
    ["globalvar", "global"],
  ] as const;

  for (const [suffix, scope] of scopes) {
    registry.register({
      name: `get${suffix}`,
      resolve: (call, runtime) => stringify(variable(runtime, scope, call.args[0] ?? "")),
    });
    registry.register({
      name: `set${suffix}`,
      resolve: (call, runtime) => {
        const name = call.args[0] ?? "";
        if (!name) return missing(runtime, call, "a variable name");
        setVariable(runtime, scope, name, call.args[1] ?? call.scoped ?? "");
        return "";
      },
    });
    registry.register({
      name: `add${suffix}`,
      resolve: (call, runtime) => {
        const name = call.args[0] ?? "";
        if (!name) return missing(runtime, call, "a variable name");
        setVariable(runtime, scope, name, addValue(variable(runtime, scope, name), call.args[1] ?? ""));
        return "";
      },
    });
    registry.register({
      name: `inc${suffix}`,
      resolve: (call, runtime) => {
        const name = call.args[0] ?? "";
        if (!name) return missing(runtime, call, "a variable name");
        const next = (numeric(variable(runtime, scope, name)) ?? 0) + 1;
        setVariable(runtime, scope, name, next);
        return next;
      },
    });
    registry.register({
      name: `dec${suffix}`,
      resolve: (call, runtime) => {
        const name = call.args[0] ?? "";
        if (!name) return missing(runtime, call, "a variable name");
        const next = (numeric(variable(runtime, scope, name)) ?? 0) - 1;
        setVariable(runtime, scope, name, next);
        return next;
      },
    });
    registry.register({
      name: `has${suffix}`,
      resolve: (call, runtime) =>
        Object.prototype.hasOwnProperty.call(runtime.variables[scope], call.args[0] ?? ""),
    });
    registry.register({
      name: `delete${suffix}`,
      resolve: (call, runtime) => {
        delete runtime.variables[scope][call.args[0] ?? ""];
        return "";
      },
    });
  }
}

function registerRandom(registry: MacroRegistry): void {
  registry.register({
    name: "random",
    resolve: (call, runtime) => {
      if (call.args.length === 0) return "";
      return call.args[Math.floor(runtime.random() * call.args.length)] ?? "";
    },
  });
  registry.register({
    name: "pick",
    resolve: (call, runtime) => {
      if (call.args.length === 0) return "";
      const key = `${call.offset}:${call.args.join("\u001f")}`;
      return call.args[Math.floor(runtime.stableRandom(key) * call.args.length)] ?? "";
    },
  });
  registry.register({
    name: "roll",
    resolve: (call, runtime) => {
      const expression = (call.args[0] ?? "1d20").replace(/\s+/g, "");
      const matched = expression.match(/^(\d{0,3})d(\d{1,6})([+-]\d{1,9})?$/i);
      if (!matched) {
        runtime.warn(
          {
            code: "invalid-argument",
            message: `Invalid dice expression "${expression}".`,
            severity: "error",
          },
          call
        );
        return "";
      }
      const count = Number(matched[1] || 1);
      const sides = Number(matched[2]);
      const modifier = Number(matched[3] ?? 0);
      if (count < 1 || count > 100 || sides < 2 || sides > 100_000) {
        runtime.warn(
          {
            code: "unsafe-roll",
            message: "Dice expressions are limited to 100 dice with 2-100000 sides.",
            severity: "error",
          },
          call
        );
        return "";
      }
      let total = modifier;
      for (let index = 0; index < count; index++) {
        total += Math.floor(runtime.random() * sides) + 1;
      }
      return total;
    },
  });
}

function registerRuntimeValues(registry: MacroRegistry): void {
  const keys: Record<string, string> = {
    maxPrompt: "maxPrompt",
    maxContextTokens: "maxContextTokens",
    maxResponseTokens: "maxResponseTokens",
    model: "model",
    isMobile: "isMobile",
    lastGenerationType: "lastGenerationType",
  };
  for (const [name, key] of Object.entries(keys)) {
    registry.register({
      name,
      resolve: (call, runtime) => {
        const value = runtime.context.runtime?.[key];
        return value === undefined ? missing(runtime, call, `runtime value "${key}"`) : value;
      },
    });
  }
  registry.register({
    name: "hasExtension",
    resolve: (call, runtime) => {
      const expected = (call.args[0] ?? "").toLowerCase();
      return (runtime.context.extensions ?? []).some(
        (extension) => extension.toLowerCase() === expected
      );
    },
  });
}

function registerPromptTemplates(registry: MacroRegistry): void {
  const names = [
    "systemPrompt",
    "defaultSystemPrompt",
    "authorsNote",
    "charAuthorsNote",
    "defaultAuthorsNote",
    "instructStoryStringPrefix",
    "instructStoryStringSuffix",
    "instructUserPrefix",
    "instructUserSuffix",
    "instructAssistantPrefix",
    "instructAssistantSuffix",
    "instructSeparator",
    "instructSystemPrefix",
    "instructSystemSuffix",
    "instructFirstAssistantPrefix",
    "instructLastAssistantPrefix",
    "instructFirstUserPrefix",
    "instructLastUserPrefix",
    "instructStop",
    "instructUserFiller",
    "instructSystemInstructionPrefix",
    "chatSeparator",
    "chatStart",
    "reasoningPrefix",
    "reasoningSuffix",
    "reasoningSeparator",
    "charPrefix",
    "charNegativePrefix",
  ];
  for (const name of names) {
    registry.register({
      name,
      resolve: (_call, runtime) => runtime.context.promptTemplates?.[name] ?? "",
    });
  }
}

/** Create the built-in, card-safe SillyTavern-compatible macro registry. */
export function createBuiltinMacroRegistry(): MacroRegistry {
  const registry = new MacroRegistry();

  registry.register({
    name: "user",
    resolve: (call, runtime) =>
      personName(runtime.context.user) ?? missing(runtime, call, "an attached persona"),
  });
  registry.register({
    name: "char",
    resolve: (call, runtime) =>
      personName(runtime.context.char) ?? missing(runtime, call, "a card/story character"),
  });
  registry.register({
    name: "group",
    resolve: (_call, runtime) => {
      const group = runtime.context.group ?? [];
      return group.length > 0
        ? group.map((member) => member.name).join(", ")
        : personName(runtime.context.char) ?? "";
    },
  });
  registry.register({
    name: "groupNotMuted",
    resolve: (_call, runtime) => {
      const group = runtime.context.group ?? [];
      return group.length > 0
        ? group.filter((member) => !member.muted).map((member) => member.name).join(", ")
        : personName(runtime.context.char) ?? "";
    },
  });
  registry.register({
    name: "charIfNotGroup",
    resolve: (_call, runtime) =>
      (runtime.context.group?.length ?? 0) > 0 ? "" : personName(runtime.context.char) ?? "",
  });
  registry.register({
    name: "notChar",
    resolve: (_call, runtime) => {
      const speaker = (runtime.context.currentSpeaker ?? personName(runtime.context.char) ?? "")
        .toLowerCase();
      const names = [
        personName(runtime.context.user),
        personName(runtime.context.char),
        ...(runtime.context.group ?? []).map((member) => member.name),
      ].filter((name): name is string => Boolean(name));
      return [...new Set(names)].filter((name) => name.toLowerCase() !== speaker).join(", ");
    },
  });
  direct(
    registry,
    "name",
    (context) => context.currentSpeaker ?? personName(context.char) ?? personName(context.user) ?? ""
  );

  direct(registry, "description", (context) => context.card?.description ?? "");
  direct(registry, "personality", (context) => context.card?.personality ?? "");
  direct(registry, "scenario", (context) => context.card?.scenario ?? "");
  direct(registry, "persona", (context) => userDescription(context) ?? "");
  direct(registry, "charPrompt", (context) => context.card?.prompt ?? "");
  direct(registry, "charInstruction", (context) => context.card?.instruction ?? "");
  direct(registry, "charDepthPrompt", (context) => context.card?.depthPrompt ?? "");
  direct(registry, "charCreatorNotes", (context) => context.card?.creatorNotes ?? "");
  direct(registry, "charVersion", (context) => context.card?.version ?? "");
  direct(registry, "mesExamples", (context) => context.card?.examples ?? "");
  direct(registry, "mesExamplesRaw", (context) => context.card?.examplesRaw ?? "");
  direct(registry, "original", (context) => context.original ?? "");
  registry.register({
    name: "charFirstMessage",
    resolve: (call, runtime) => {
      const index = Math.max(0, Number(call.args[0] ?? 0) || 0);
      return runtime.context.card?.firstMessages?.[index] ?? "";
    },
  });

  direct(registry, "lastMessage", (context) => messageAt(context, 0)?.content ?? "");
  direct(registry, "lastMessageId", (context) => messageAt(context, 0)?.id ?? Math.max(0, (context.messages?.length ?? 1) - 1));
  direct(registry, "lastUserMessage", (context) => lastByRole(context, "user")?.content ?? "");
  direct(registry, "lastCharMessage", (context) => lastByRole(context, "assistant")?.content ?? "");
  direct(registry, "firstIncludedMessageId", (context) => context.firstIncludedMessageId ?? 0);
  direct(registry, "firstDisplayedMessageId", (context) => context.firstDisplayedMessageId ?? 0);
  direct(registry, "lastSwipeId", (context) => messageAt(context, 0)?.swipeCount ?? 1);
  direct(registry, "currentSwipeId", (context) => messageAt(context, 0)?.currentSwipe ?? 1);
  direct(registry, "allChatRange", (context) => `0-${messageAt(context, 0)?.id ?? Math.max(0, (context.messages?.length ?? 1) - 1)}`);
  direct(registry, "summary", (context) => context.summary ?? "");

  registry.register({
    name: "time",
    resolve: (call, runtime) => localTime(runtime.context.now ?? new Date(), call.args[0]).toLocaleTimeString(),
  });
  direct(registry, "date", (context) => (context.now ?? new Date()).toLocaleDateString());
  direct(registry, "weekday", (context) => (context.now ?? new Date()).toLocaleDateString(undefined, { weekday: "long" }));
  direct(registry, "isotime", (context) => {
    const date = context.now ?? new Date();
    return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  });
  direct(registry, "isodate", (context) => {
    const date = context.now ?? new Date();
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  });
  registry.register({
    name: "datetimeformat",
    resolve: (call, runtime) =>
      formatDateTime(runtime.context.now ?? new Date(), call.args[0] ?? "YYYY-MM-DD HH:mm:ss"),
  });
  direct(registry, "idleDuration", (context) =>
    context.lastUserMessageAt === undefined
      ? ""
      : humanDuration((context.now ?? new Date()).getTime() - context.lastUserMessageAt)
  );
  registry.register({
    name: "timeDiff",
    resolve: (call, runtime) => {
      const left = Date.parse(call.args[0] ?? "");
      const right = Date.parse(call.args[1] ?? "");
      if (!Number.isFinite(left) || !Number.isFinite(right)) {
        runtime.warn(
          {
            code: "invalid-argument",
            message: "timeDiff requires two parseable date/time values.",
            severity: "error",
          },
          call
        );
        return "";
      }
      return humanDuration(left - right);
    },
  });

  registerVariables(registry);
  registerRandom(registry);
  registerRuntimeValues(registry);
  registerPromptTemplates(registry);

  registry.register({
    name: "newline",
    resolve: (call) => "\n".repeat(Math.min(100, Math.max(1, Number(call.args[0] ?? 1) || 1))),
  });
  registry.register({
    name: "space",
    resolve: (call) => " ".repeat(Math.min(100, Math.max(1, Number(call.args[0] ?? 1) || 1))),
  });
  direct(registry, "noop", () => "");
  registry.register({
    name: "trim",
    resolve: (call) => (call.scoped ?? call.args[0] ?? "").replace(/^\n+|\n+$/g, ""),
  });
  registry.register({
    name: "reverse",
    resolve: (call) => [...(call.scoped ?? call.args[0] ?? "")].reverse().join(""),
  });
  direct(registry, "input", (context) => context.input ?? "");
  registry.register({
    name: "banned",
    resolve: (call, runtime) => {
      const word = call.args[0]?.trim();
      if (word) runtime.bannedWords.add(word);
      return "";
    },
  });
  registry.register({
    name: "outlet",
    resolve: (call, runtime) => runtime.context.outlets?.[call.args[0]?.trim() ?? ""] ?? "",
  });

  // `if`, `else`, and comments are evaluated structurally by the engine.
  registry.register({ name: "if", resolve: () => "" });
  registry.register({ name: "else", resolve: () => "" });
  registry.register({ name: "//", resolve: () => "" });
  return registry;
}
