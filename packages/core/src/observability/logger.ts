/** Metadata that is safe to attach to a diagnostic event. */
export type DiagnosticData = Readonly<Record<string, unknown>>;

/**
 * Minimal logging contract used by core without coupling it to a desktop, browser,
 * console, or telemetry implementation. Implementations must not throw.
 */
export interface DiagnosticLogger {
  debug(event: string, data?: DiagnosticData): void;
  info(event: string, data?: DiagnosticData): void;
  warn(event: string, data?: DiagnosticData): void;
  error(event: string, data?: DiagnosticData): void;
}

/** Default logger for core consumers that do not install an observability sink. */
export const NOOP_DIAGNOSTIC_LOGGER: DiagnosticLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};
