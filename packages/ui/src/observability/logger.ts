import {
  debug as writeDebug,
  error as writeError,
  info as writeInfo,
  warn as writeWarn,
} from "@tauri-apps/plugin-log";
import { appLogDir, join } from "@tauri-apps/api/path";
import { revealItemInDir } from "@tauri-apps/plugin-opener";

/** Supported application diagnostic levels. */
export type DiagnosticLevel = "debug" | "info" | "warn" | "error";

/** Structured metadata accepted by the local diagnostic logger. */
export type DiagnosticData = Readonly<Record<string, unknown>>;

const MAX_DEPTH = 5;
const MAX_ARRAY_ITEMS = 50;
const MAX_STRING_LENGTH = 2_000;
const LOG_FILE_NAME = "midnight-tavern.log";
const SENSITIVE_KEY = /api[-_]?key|authorization|auth[-_]?header|token|secret|password|credential|license[-_]?key/i;
const NUMERIC_TOKEN_METRIC = /(?:max|input|output|prompt|completion|total)?tokens?$/i;
const SECRET_IN_TEXT = /\b(?:sk|ek|pk|key|token)-[a-z0-9._-]{6,}\b/gi;
const BEARER_IN_TEXT = /(bearer\s+)[^\s,;"']+/gi;
const SECRET_QUERY = /([?&](?:api[-_]?key|token|secret|key)=)[^&\s]+/gi;

function desktopRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const candidate = window as unknown as Record<string, unknown>;
  return "__TAURI_INTERNALS__" in candidate || "__TAURI__" in candidate;
}

function sessionIdentifier(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `session-${Date.now().toString(36)}`;
  }
}

const sessionId = sessionIdentifier();

function redactText(value: string): string {
  const shortened = value.length > MAX_STRING_LENGTH
    ? `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]`
    : value;
  return shortened
    .replace(BEARER_IN_TEXT, "$1[REDACTED]")
    .replace(SECRET_QUERY, "$1[REDACTED]")
    .replace(SECRET_IN_TEXT, "[REDACTED]");
}

function sanitize(value: unknown, key: string, depth: number, seen: WeakSet<object>): unknown {
  if (SENSITIVE_KEY.test(key) && !(typeof value === "number" && NUMERIC_TOKEN_METRIC.test(key))) {
    return "[REDACTED]";
  }
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return redactText(value);
  if (typeof value === "undefined") return undefined;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return `[${typeof value}]`;
  if (depth >= MAX_DEPTH) return "[TRUNCATED]";
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactText(value.message),
      ...(value.stack ? { stack: redactText(value.stack) } : {}),
    };
  }
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((entry) => sanitize(entry, "", depth + 1, seen));
  }
  const clean: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value)) {
    clean[childKey] = sanitize(childValue, childKey, depth + 1, seen);
  }
  return clean;
}

/**
 * Return a JSON-safe, depth-bounded copy with credential-shaped keys and common
 * authorization/key patterns removed. Exported so the privacy contract is testable.
 */
export function redactForDiagnostics(value: unknown): unknown {
  return sanitize(value, "", 0, new WeakSet<object>());
}

/** Convert an unknown failure into safe diagnostic fields. */
export function diagnosticError(error: unknown): DiagnosticData {
  const sanitized = redactForDiagnostics(error);
  if (sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)) {
    return sanitized as DiagnosticData;
  }
  return { name: "UnknownError", message: String(sanitized) };
}

const pluginWriters: Record<DiagnosticLevel, (message: string) => Promise<void>> = {
  debug: writeDebug,
  info: writeInfo,
  warn: writeWarn,
  error: writeError,
};

function emit(level: DiagnosticLevel, event: string, data?: DiagnosticData): void {
  const message = JSON.stringify({
    timestamp: new Date().toISOString(),
    sessionId,
    level,
    event,
    ...(data ? { data: redactForDiagnostics(data) } : {}),
  });

  if (desktopRuntime()) {
    void pluginWriters[level](message).catch((error: unknown) => {
      console.error("[diagnostics] local log write failed", error);
    });
    return;
  }
  if (import.meta.env.MODE !== "test") console[level](message);
}

/** Local structured logger used by the UI and injected into core's model router. */
export const diagnosticsLogger = {
  debug(event: string, data?: DiagnosticData): void {
    emit("debug", event, data);
  },
  info(event: string, data?: DiagnosticData): void {
    emit("info", event, data);
  },
  warn(event: string, data?: DiagnosticData): void {
    emit("warn", event, data);
  },
  error(event: string, data?: DiagnosticData): void {
    emit("error", event, data);
  },
};

let globalHandlersInstalled = false;

/** Install one session's uncaught-error hooks and record the UI runtime start. */
export function initializeDiagnostics(): void {
  if (globalHandlersInstalled) return;
  globalHandlersInstalled = true;
  diagnosticsLogger.info("ui.session.started", { runtime: desktopRuntime() ? "desktop" : "browser" });
  if (typeof window === "undefined") return;
  window.addEventListener("error", (event) => {
    diagnosticsLogger.error("ui.error.uncaught", { error: diagnosticError(event.error ?? event.message) });
  });
  window.addEventListener("unhandledrejection", (event) => {
    diagnosticsLogger.error("ui.promise.unhandled", { error: diagnosticError(event.reason) });
  });
}

/** Resolve the OS-specific local folder used by the Tauri log plugin. */
export async function diagnosticsDirectory(): Promise<string | undefined> {
  if (!desktopRuntime()) return undefined;
  return appLogDir();
}

/** Reveal the current application log in the operating system's file explorer. */
export async function revealDiagnostics(): Promise<string> {
  const directory = await diagnosticsDirectory();
  if (!directory) throw new Error("Diagnostics are available in the installed desktop app.");
  const logFile = await join(directory, LOG_FILE_NAME);
  await revealItemInDir(logFile);
  return directory;
}
