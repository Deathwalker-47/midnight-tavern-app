export type MacroScalar = string | number | boolean | null | undefined;

export interface MacroParticipant {
  name: string;
  muted?: boolean;
}

export interface MacroMessage {
  id?: string | number;
  role: "user" | "assistant" | "system";
  content: string;
  name?: string;
  swipeCount?: number;
  currentSwipe?: number;
  createdAt?: number;
}

export interface MacroCardFields {
  description?: string;
  personality?: string;
  scenario?: string;
  prompt?: string;
  instruction?: string;
  depthPrompt?: string;
  creatorNotes?: string;
  version?: string;
  examples?: string;
  examplesRaw?: string;
  firstMessages?: readonly string[];
}

export interface MacroVariableStore {
  local: Record<string, unknown>;
  global: Record<string, unknown>;
}

export interface MacroContext {
  /** `{{user}}` is always the attached playing persona. */
  user?: { name: string; description?: string } | string;
  /** `{{char}}` is always the imported card/story character. */
  char?: { name: string } | string;
  group?: readonly MacroParticipant[];
  currentSpeaker?: string;
  card?: MacroCardFields;
  messages?: readonly MacroMessage[];
  firstIncludedMessageId?: string | number;
  firstDisplayedMessageId?: string | number;
  summary?: string;
  now?: Date;
  lastUserMessageAt?: number;
  variables?: Partial<MacroVariableStore>;
  runtime?: Readonly<Record<string, MacroScalar>>;
  promptTemplates?: Readonly<Record<string, string>>;
  outlets?: Readonly<Record<string, string>>;
  extensions?: readonly string[];
  input?: string;
  original?: string;
  random?: () => number;
  stableSeed?: string | number;
  maxDepth?: number;
  maxOutputLength?: number;
}

export type MacroWarningCode =
  | "unknown-macro"
  | "missing-context"
  | "malformed-macro"
  | "invalid-argument"
  | "unsafe-roll"
  | "recursion-limit"
  | "output-limit"
  | "resolver-error";

export interface MacroWarning {
  code: MacroWarningCode;
  message: string;
  source: string;
  offset: number;
  severity: "warning" | "error";
}

export interface MacroCall {
  name: string;
  args: readonly string[];
  source: string;
  offset: number;
  scoped?: string;
}

export interface MacroRuntime {
  readonly context: MacroContext;
  readonly variables: MacroVariableStore;
  readonly bannedWords: Set<string>;
  readonly invocationIndex: number;
  random(): number;
  stableRandom(key: string): number;
  warn(
    warning: Omit<MacroWarning, "source" | "offset">,
    call: Pick<MacroCall, "source" | "offset">
  ): void;
}

export type MacroResolver = (
  call: MacroCall,
  runtime: MacroRuntime
) => MacroScalar;

export interface MacroDefinition {
  name: string;
  aliases?: readonly string[];
  resolve: MacroResolver;
}

export interface MacroEvaluation {
  output: string;
  warnings: MacroWarning[];
  blocked: boolean;
  variables: MacroVariableStore;
  bannedWords: string[];
}
