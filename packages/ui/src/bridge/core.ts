/**
 * bridge/core.ts — the single typed façade between the React UI and `@midnight-tavern/core`.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `core` is imported ONLY here, and ONLY as TYPES (`import type` / `export type`). Those are
 * erased at compile time, so importing this module never pulls core's runtime graph into the
 * browser — which matters because core's store layer imports `better-sqlite3`, a NATIVE module
 * that cannot load under `vite dev`/jsdom.
 *
 *   TODO(shell): real SQLite comes from the Tauri sidecar; browser dev uses an in-memory stub.
 *
 * So the bridge defines one interface — {@link CoreBridge} — with two implementations:
 *   • {@link makeMemoryBridge} — a pure-JS in-memory stub that runs today in dev/tests.
 *   • {@link loadSqliteBridge} — the real backend, dynamically imported (never evaluated in the
 *     browser) so it can wire core's `openStore` + `makeRouter` + orchestrator + licensing.
 *
 * Stores and screens import the TYPES and the async methods from here — never from core directly.
 * This module is the shared contract; the signatures below are what the screen wave builds on.
 */

// ── Types re-exported from core (erased — safe, no native load) ──────────────────────────────
export type {
  StoryRecord,
  StorySchema,
  MessageRecord,
  MessageRole,
  Ruling,
  RollRecord,
  GateVerdict,
  MasteryAdvance,
  MechanicalIntent,
  CharacterHardState,
  CharacterSoftState,
  LorebookEntry,
  PersonaRecord,
  ChapterRecord,
  ArcRecord,
  ArcDoc,
} from "@midnight-tavern/core";
export type {
  CharacterRecord,
  LivingCardView,
  ResourceBar,
  InventoryLine,
  SkillLine,
  Role,
  RoleMap,
  RoleBinding,
  Samplers,
  KnownModel,
  ProviderId,
  ProviderConfigs,
  LicenseState,
  LicenseCache,
  Entitlement,
  TrialStatus,
  CharacterCard,
  MappedCard,
  LorebookSeed,
} from "@midnight-tavern/core";

import type {
  StoryRecord,
  MessageRecord,
  Ruling,
  RoleMap,
  KnownModel,
  ProviderId,
  ProviderConfigs,
  LicenseState,
  Entitlement,
  TrialStatus,
  LivingCardView,
  PersonaRecord,
  LorebookEntry,
  MappedCard,
  CharacterCard,
} from "@midnight-tavern/core";

// ── Bridge-local contract types (the shared vocabulary screens/stores speak) ──────────────────

/** Lightweight story row for the Library shelf (avoids shipping the whole frozen schema). */
export interface StorySummary {
  id: string;
  title: string;
  createdAt: number;
  locked: boolean;
  messageCount: number;
}

/** One present-cast entry for the PartyStrip (soft state condensed to what the strip renders). */
export interface CastMember {
  characterId: string;
  name: string;
  isPlayer: boolean;
  alive: boolean;
  /** Player-visible HP-style bar, or undefined when the character has no visible resource. */
  hp?: { current: number; max: number; label: string };
  /** Mood glyph/word from soft state, if analyzed. */
  mood?: string;
}

/** Arguments for creating a story (drives `bootstrapStory`). */
export interface CreateStoryArgs {
  /** Explicit id, else the bridge mints one. */
  storyId?: string;
  title: string;
  premise: string;
  /** The protagonist's display name. */
  playerName: string;
  /** Optional streaming sink for the forging interstitial's progress copy. */
  onProgress?: (phase: "phase-a" | "phase-b" | "validate" | "freeze" | "install") => void;
  signal?: AbortSignal;
}

export interface CreateStoryResult {
  story: StoryRecord;
  playerCharacterId: string;
}

/** Arguments for one player turn (drives the orchestrator's `submitTurn`). */
export interface SubmitTurnArgs {
  storyId: string;
  playerText: string;
  /** Live narrator deltas for word-by-word render; the store buffers these. */
  onDelta?: (delta: string) => void;
  /** Player persona + protagonist essentials block (§7.3). */
  personaBlock?: string;
  signal?: AbortSignal;
}

export interface SubmitTurnOutcome {
  /** Full narrator prose for the turn. */
  prose: string;
  /** Committed rulings in resolution order (dice toasts render from these). */
  rulings: Ruling[];
  /** idx of the persisted narrator message. */
  narratorIdx: number;
}

/** One provider's stored credentials as the Settings/Wizard forms edit them. */
export interface ProviderConfigInput {
  apiKey: string;
  /** Optional base-URL override (OpenAI-compatible endpoints). */
  baseUrl?: string;
}

/** The four key states the ProviderCard/KeyField renders (idle handled by the UI). */
export type KeyValidation =
  | { state: "validating" }
  | { state: "valid"; label?: string; balance?: string }
  | { state: "rejected"; reason: string };

/** Result of importing a character card (feeds the Library import-preview → new-story flow). */
export interface CardImportResult {
  card: CharacterCard;
  mapped: MappedCard;
  /** Provenance for the preview ("Card format V2/V3"). */
  spec: string;
}

/**
 * The full façade. Every method is async so the two backends (in-memory now, SQLite via the
 * Tauri sidecar later) are interchangeable behind one Promise-returning contract.
 */
export interface CoreBridge {
  // — Stories —
  listStories(): Promise<StorySummary[]>;
  getStory(id: string): Promise<StoryRecord | undefined>;
  createStory(args: CreateStoryArgs): Promise<CreateStoryResult>;
  renameStory(id: string, title: string): Promise<void>;
  deleteStory(id: string): Promise<void>;

  // — Play —
  listMessages(storyId: string): Promise<MessageRecord[]>;
  submitTurn(args: SubmitTurnArgs): Promise<SubmitTurnOutcome>;
  listPresentCast(storyId: string): Promise<CastMember[]>;
  getLivingCard(storyId: string, characterId: string): Promise<LivingCardView | undefined>;
  listRulings(storyId: string): Promise<Ruling[]>;

  // — Settings: providers + role map —
  getProviderConfigs(): Promise<ProviderConfigs>;
  setProviderConfig(provider: ProviderId, config: ProviderConfigInput): Promise<void>;
  removeProviderConfig(provider: ProviderId): Promise<void>;
  getRoleMap(): Promise<RoleMap>;
  setRoleMap(map: RoleMap): Promise<void>;
  /** Canonical role→model defaults (a fresh install's map). */
  defaultRoleMap(): RoleMap;
  /** The curated catalog the Wizard/Settings pickers render, with recommended/advanced tiers. */
  knownModels(): KnownModel[];
  /** Every provider id the settings UI can offer. */
  providerIds(): readonly ProviderId[];
  /** Live key validation for the KeyField states (validating → valid+balance / rejected+reason). */
  validateProviderKey(
    provider: ProviderId,
    apiKey: string,
    baseUrl?: string,
    signal?: AbortSignal
  ): Promise<KeyValidation>;

  // — Licensing / trial —
  evaluateLicense(): Promise<LicenseState>;
  validateLicense(key: string): Promise<LicenseState>;
  clearLicense(): Promise<void>;
  peekTrial(): Promise<TrialStatus | undefined>;
  resolveEntitlement(): Promise<Entitlement>;

  // — Personas / lorebook (authoring surfaces) —
  listPersonas(): Promise<PersonaRecord[]>;
  savePersona(persona: PersonaRecord): Promise<void>;
  deletePersona(id: string): Promise<void>;
  listLorebook(storyId: string): Promise<LorebookEntry[]>;
  saveLorebookEntry(entry: LorebookEntry): Promise<void>;
  deleteLorebookEntry(id: string): Promise<void>;

  // — Importer —
  importCardFromBytes(bytes: Uint8Array): Promise<CardImportResult>;
  importCardFromUrl(url: string, signal?: AbortSignal): Promise<CardImportResult>;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// In-memory stub backend. Runs today under `vite dev`/jsdom. It mirrors core's shapes and the
// two-register data (system numbers vs story prose) so screens render believably before the
// SQLite sidecar exists. It does NOT import core at runtime.
// ─────────────────────────────────────────────────────────────────────────────────────────────

// TODO(shell): these three constants MIRROR core's `DEFAULT_ROLE_MAP`, `KNOWN_MODELS`, and
// `PROVIDER_IDS`. The real (SQLite) backend reads the canonical values straight from core; the
// browser stub can't value-import them (native module), so it carries a synced copy. Keep in step.
const MEMORY_PROVIDER_IDS = ["openrouter", "openai", "anthropic"] as const;

const MEMORY_DEFAULT_ROLE_MAP: RoleMap = {
  narrator: { provider: "openrouter", model: "anthropic/claude-sonnet-4", samplers: { temperature: 0.8, maxTokens: 1200 } },
  classifier: { provider: "openrouter", model: "openai/gpt-4o-mini", samplers: { temperature: 0, maxTokens: 800 } },
  analyzer: { provider: "openrouter", model: "openai/gpt-4o-mini", samplers: { temperature: 0.2, maxTokens: 1000 } },
  summarizer: { provider: "openrouter", model: "openai/gpt-4o", samplers: { temperature: 0.3, maxTokens: 1500 } },
  bootstrapper: { provider: "openrouter", model: "anthropic/claude-sonnet-4", samplers: { temperature: 0.6, maxTokens: 4000 } },
};

const MEMORY_KNOWN_MODELS: KnownModel[] = [
  { provider: "openrouter", model: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4", tier: "recommended" },
  { provider: "openrouter", model: "openai/gpt-4o", label: "GPT-4o", tier: "recommended" },
  { provider: "openrouter", model: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash", tier: "recommended" },
  { provider: "openrouter", model: "openai/gpt-4o-mini", label: "GPT-4o mini", tier: "recommended" },
  { provider: "openrouter", model: "deepseek/deepseek-chat", label: "DeepSeek V3", tier: "advanced" },
  { provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", tier: "advanced" },
  { provider: "openai", model: "gpt-4o", label: "GPT-4o (direct)", tier: "advanced" },
  { provider: "anthropic", model: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 (direct)", tier: "advanced" },
];

const TRIAL_DURATION_MS = 14 * 24 * 60 * 60 * 1000;

/** One in-memory story with the rows the stub tracks. */
interface MemStory {
  record: StoryRecord;
  messages: MessageRecord[];
  rulings: Ruling[];
  cast: CastMember[];
  cards: Map<string, LivingCardView>;
  lorebook: LorebookEntry[];
}

function uid(): string {
  // crypto.randomUUID exists in modern browsers, jsdom, and node; fall back for safety.
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

/** A minimal frozen-schema shell so `StoryRecord` typechecks without a live bootstrapper. */
function stubSchema(storyId: string, title: string, premise: string): StoryRecord["schema"] {
  // The stub only needs the shape to satisfy the type; the real schema is produced by core's
  // bootstrapper. Cast keeps us honest to the field names without duplicating every sub-schema.
  return {
    schemaVersion: 1,
    storyId,
    title,
    premise,
    statMode: "narrative",
    resources: [{ id: "hp", label: "Health", min: 0, max: 20, playerVisible: true, lethal: true }],
    tiers: [],
    skills: [],
    items: [],
    actions: [],
    startingState: { resources: {}, skills: [], inventory: [] },
    npcTemplates: [],
    locked: true,
  } as unknown as StoryRecord["schema"];
}

/** Split prose into word-sized deltas so the stub can simulate the narrator stream. */
async function streamProse(prose: string, onDelta?: (d: string) => void, signal?: AbortSignal): Promise<void> {
  if (!onDelta) return;
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const words = prose.split(/(\s+)/);
  for (const w of words) {
    if (signal?.aborted) return;
    onDelta(w);
    if (!reduced) await new Promise((r) => setTimeout(r, 16));
  }
}

export function makeMemoryBridge(): CoreBridge {
  const stories = new Map<string, MemStory>();
  const providerConfigs: ProviderConfigs = {};
  let roleMap: RoleMap = structuredCloneSafe(MEMORY_DEFAULT_ROLE_MAP);
  const personas: PersonaRecord[] = [];
  let licenseState: LicenseState = { status: "unlicensed" };
  let trialStartedAt: number | undefined;

  function trialStatus(now = Date.now()): TrialStatus | undefined {
    if (trialStartedAt === undefined) return undefined;
    const expiresAt = trialStartedAt + TRIAL_DURATION_MS;
    const remaining = Math.max(0, expiresAt - now);
    return {
      startedAt: trialStartedAt,
      expiresAt,
      active: now < expiresAt,
      daysRemaining: Math.ceil(remaining / 86_400_000),
    };
  }
  function startTrial(now = Date.now()): TrialStatus {
    if (trialStartedAt === undefined) trialStartedAt = now;
    return trialStatus(now)!;
  }

  function requireStory(id: string): MemStory {
    const s = stories.get(id);
    if (!s) throw new Error(`memory bridge: unknown story ${id}`);
    return s;
  }

  return {
    async listStories() {
      return [...stories.values()]
        .map((s) => ({
          id: s.record.id,
          title: s.record.title,
          createdAt: s.record.createdAt,
          locked: s.record.locked,
          messageCount: s.messages.length,
        }))
        .sort((a, b) => b.createdAt - a.createdAt);
    },

    async getStory(id) {
      return stories.get(id)?.record;
    },

    async createStory(args) {
      args.onProgress?.("phase-a");
      await delay(120);
      args.onProgress?.("phase-b");
      await delay(120);
      args.onProgress?.("validate");
      args.onProgress?.("freeze");
      args.onProgress?.("install");

      const storyId = args.storyId ?? uid();
      const record: StoryRecord = {
        id: storyId,
        title: args.title,
        createdAt: Date.now(),
        schema: stubSchema(storyId, args.title, args.premise),
        locked: true,
      };
      const playerCharacterId = uid();
      const card: LivingCardView = {
        characterId: playerCharacterId,
        name: args.playerName,
        isPlayer: true,
        alive: true,
        resources: [{ id: "hp", label: "Health", current: 20, max: 20, playerVisible: true }],
        inventory: [],
        skills: [],
      };
      stories.set(storyId, {
        record,
        messages: [],
        rulings: [],
        cast: [
          {
            characterId: playerCharacterId,
            name: args.playerName,
            isPlayer: true,
            alive: true,
            hp: { current: 20, max: 20, label: "Health" },
          },
        ],
        cards: new Map([[playerCharacterId, card]]),
        lorebook: [],
      });
      return { story: record, playerCharacterId };
    },

    async renameStory(id, title) {
      requireStory(id).record.title = title;
    },

    async deleteStory(id) {
      stories.delete(id);
    },

    async listMessages(storyId) {
      return [...requireStory(storyId).messages];
    },

    async submitTurn(args) {
      const story = requireStory(args.storyId);
      const now = Date.now();
      const playerIdx = story.messages.length;
      story.messages.push({
        id: uid(),
        storyId: args.storyId,
        idx: playerIdx,
        role: "player",
        content: args.playerText,
        createdAt: now,
      });

      // Canned narration so the stream/thinking states are exercisable. The real backend
      // returns core's Narrator output + engine-committed rulings.
      const prose =
        "The lamp gutters as you speak, and the room leans in to listen. " +
        "Somewhere below the floorboards, something old turns over in its sleep.";
      await streamProse(prose, args.onDelta, args.signal);

      const narratorIdx = playerIdx + 1;
      story.messages.push({
        id: uid(),
        storyId: args.storyId,
        idx: narratorIdx,
        role: "narrator",
        content: prose,
        createdAt: Date.now(),
      });
      const rulings: Ruling[] = [];
      return { prose, rulings, narratorIdx };
    },

    async listPresentCast(storyId) {
      return [...requireStory(storyId).cast];
    },

    async getLivingCard(storyId, characterId) {
      return requireStory(storyId).cards.get(characterId);
    },

    async listRulings(storyId) {
      return [...requireStory(storyId).rulings];
    },

    async getProviderConfigs() {
      return { ...providerConfigs };
    },
    async setProviderConfig(provider, config) {
      providerConfigs[provider] = { apiKey: config.apiKey, ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}) };
    },
    async removeProviderConfig(provider) {
      delete providerConfigs[provider];
    },
    async getRoleMap() {
      return structuredCloneSafe(roleMap);
    },
    async setRoleMap(map) {
      roleMap = structuredCloneSafe(map);
    },
    defaultRoleMap() {
      return structuredCloneSafe(MEMORY_DEFAULT_ROLE_MAP);
    },
    knownModels() {
      return MEMORY_KNOWN_MODELS.map((m) => ({ ...m }));
    },
    providerIds() {
      return MEMORY_PROVIDER_IDS;
    },
    async validateProviderKey(_provider, apiKey) {
      await delay(500);
      if (!apiKey.trim()) return { state: "rejected", reason: "Enter a key to validate." };
      // Stub heuristic only: a key beginning with "sk-bad" fails, everything else passes.
      if (apiKey.startsWith("sk-bad")) return { state: "rejected", reason: "The provider rejected this key." };
      return { state: "valid", label: "Stub credentials", balance: "$4.20" };
    },

    async evaluateLicense() {
      return licenseState;
    },
    async validateLicense(key) {
      await delay(400);
      const trimmed = key.trim();
      if (!trimmed) {
        licenseState = { status: "unlicensed" };
      } else if (trimmed.startsWith("MT-")) {
        licenseState = {
          status: "valid",
          source: "online",
          cache: { key: trimmed, valid: true, lastCheckedAt: Date.now(), label: "Stub license" },
        };
      } else {
        licenseState = { status: "invalid", reason: "The licensing server rejected this key." };
      }
      return licenseState;
    },
    async clearLicense() {
      licenseState = { status: "unlicensed" };
    },
    async peekTrial() {
      return trialStatus();
    },
    async resolveEntitlement() {
      if (licenseState.status === "valid") return { canCreateStory: true, via: "license" };
      const trial = startTrial();
      return trial.active
        ? { canCreateStory: true, via: "trial", trial }
        : { canCreateStory: false, reason: "trial-expired", trial };
    },

    async listPersonas() {
      return personas.map((p) => ({ ...p }));
    },
    async savePersona(persona) {
      const i = personas.findIndex((p) => p.id === persona.id);
      if (persona.isDefault) personas.forEach((p) => (p.isDefault = false));
      if (i >= 0) personas[i] = { ...persona };
      else personas.push({ ...persona });
    },
    async deletePersona(id) {
      const i = personas.findIndex((p) => p.id === id);
      if (i >= 0) personas.splice(i, 1);
    },
    async listLorebook(storyId) {
      return [...requireStory(storyId).lorebook];
    },
    async saveLorebookEntry(entry) {
      const book = requireStory(entry.storyId).lorebook;
      const i = book.findIndex((e) => e.id === entry.id);
      if (i >= 0) book[i] = { ...entry };
      else book.push({ ...entry });
    },
    async deleteLorebookEntry(id) {
      for (const s of stories.values()) {
        const i = s.lorebook.findIndex((e) => e.id === id);
        if (i >= 0) {
          s.lorebook.splice(i, 1);
          return;
        }
      }
    },

    async importCardFromBytes() {
      throw new Error(
        "Card import from bytes is unavailable in the in-memory stub. " +
          "TODO(shell): the SQLite backend wires core's parsePngCard/parseJsonCard + mapCardToImport."
      );
    },
    async importCardFromUrl() {
      throw new Error(
        "Card import from URL is unavailable in the in-memory stub. " +
          "TODO(shell): the SQLite backend wires core's importCardFromUrl + mapCardToImport."
      );
    },
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function structuredCloneSafe<T>(value: T): T {
  const sc = (globalThis as { structuredClone?: <U>(v: U) => U }).structuredClone;
  return sc ? sc(value) : (JSON.parse(JSON.stringify(value)) as T);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Real (SQLite) backend seam. Dynamically imported so core's native `better-sqlite3` graph is
// NEVER evaluated in the browser. Wiring lives here so the store/screen layers stay backend-blind.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * TODO(shell): real SQLite comes from the Tauri sidecar; browser dev uses an in-memory stub.
 *
 * Load the real backend. This dynamically imports core (so it's inert until called on a host that
 * actually has the native module — the Tauri sidecar / node), opens the store, and builds a
 * `CoreBridge` whose methods delegate to core:
 *
 *   const core = await import("@midnight-tavern/core");
 *   const store = core.openStore(path);                              // owns the singleton Store
 *   const router = core.makeRouter({                                 // built from stored configs
 *     providerConfigs: store.settings.get(core.PROVIDER_CONFIGS_SETTING_KEY, core.ProviderConfigsSchema) ?? {},
 *     roleMap: store.settings.get(core.ROLE_MAP_SETTING_KEY, core.RoleMapSchema) ?? core.DEFAULT_ROLE_MAP,
 *   });
 *   // stories → store.stories.*        · submitTurn → core.submitTurn(router, store, …)
 *   // createStory → core.bootstrapStory(router, store, …)
 *   // licensing → core.evaluateCachedLicense / validateLicenseKey / resolveEntitlement / peekTrial
 *   // living card → core.getLivingCard(store, schema, characterId)
 *   // importer → core.parsePngCard/parseJsonCard/importCardFromUrl + core.mapCardToImport
 *
 * Kept as an explicit throw until the sidecar exists so a mis-selected backend fails loudly rather
 * than silently loading a native module the browser can't provide.
 */
export async function loadSqliteBridge(_path: string): Promise<CoreBridge> {
  throw new Error(
    "The SQLite backend is not available in this environment. " +
      "TODO(shell): real SQLite comes from the Tauri sidecar; browser dev uses the in-memory stub."
  );
}

// ── Singleton wiring ──────────────────────────────────────────────────────────────────────────

export type BridgeBackend = "memory" | "sqlite";

let singleton: CoreBridge | undefined;

/**
 * Initialize (or replace) the process-wide bridge. Defaults to the in-memory backend so the app
 * boots in `vite dev`/jsdom; pass `{ backend: "sqlite" }` inside the Tauri shell once wired.
 */
export async function initBridge(opts: { backend?: BridgeBackend; path?: string } = {}): Promise<CoreBridge> {
  const backend = opts.backend ?? "memory";
  singleton = backend === "sqlite" ? await loadSqliteBridge(opts.path ?? ":memory:") : makeMemoryBridge();
  return singleton;
}

/** The current bridge, lazily creating the in-memory backend on first use. */
export function getBridge(): CoreBridge {
  if (!singleton) singleton = makeMemoryBridge();
  return singleton;
}

/** Test helper: swap in a bridge (e.g. a fake) and get it back. */
export function setBridge(bridge: CoreBridge): CoreBridge {
  singleton = bridge;
  return bridge;
}
