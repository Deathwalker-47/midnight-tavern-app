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
  Blueprint,
  StoryStyleSettings,
  StatMode,
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
  Dossier,
  DossierSkill,
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
  Lorebook,
  AttachedLorebook,
  RankedModel,
  ProviderModel,
  SetupState,
} from "@midnight-tavern/core";

import type {
  StoryRecord,
  Blueprint,
  MessageRecord,
  Ruling,
  Role,
  RoleMap,
  RoleBinding,
  KnownModel,
  ProviderId,
  ProviderConfigs,
  LicenseState,
  Entitlement,
  TrialStatus,
  LivingCardView,
  Dossier,
  PersonaRecord,
  LorebookEntry,
  Lorebook,
  AttachedLorebook,
  RankedModel,
  ProviderModel,
  SetupState,
  MappedCard,
  LorebookSeed,
  CharacterCard,
  ChapterRecord,
  ArcRecord,
  Store,
  BootstrapPhase,
  StatMode,
} from "@midnight-tavern/core";

// Value import: the Tauri storage driver. Browser-safe — it only pulls `@tauri-apps/api/core`
// (inert until `invoke` is called) and type-only core symbols, so it does NOT load core's runtime.
import { makeSqliteDriver } from "./sqliteDriver.js";

// ── Bridge-local contract types (the shared vocabulary screens/stores speak) ──────────────────

/** Lightweight story row for the Library shelf (avoids shipping the whole frozen schema). */
export interface StorySummary {
  id: string;
  title: string;
  createdAt: number;
  locked: boolean;
  messageCount: number;
  statMode: StatMode;
  migrationPending: boolean;
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
  /** User-selected v5 stat system. The UI must ask; the bridge defaults only for old callers. */
  statMode?: StatMode;
  /** The protagonist's display name. */
  playerName: string;
  /** Full author-facing narrative configuration saved with the new story. */
  blueprint?: Blueprint;
  /** Optional chosen opening, persisted as the first narrator message. */
  openingMessage?: string;
  /** Imported character-book entries to create and attach after bootstrap. */
  lorebookSeeds?: LorebookSeed[];
  /** Optional streaming sink for the forging interstitial's progress copy. */
  onProgress?: (phase: BootstrapPhase) => void;
  signal?: AbortSignal;
}

export interface ChangeStoryStatModeArgs {
  storyId: string;
  target: StatMode;
  onProgress?: (phase: BootstrapPhase) => void;
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

/** Args for regenerating the last narrator turn's prose as a new variant (§6). */
export interface SwipeArgs {
  storyId: string;
  /** Live narrator deltas for the regenerated prose. */
  onDelta?: (delta: string) => void;
  /** Player persona + protagonist essentials block (§7.3). */
  personaBlock?: string;
  signal?: AbortSignal;
}

/** The variant state after a swipe / variant-select (§6). */
export interface SwipeOutcome {
  /** The full variant list after the operation. */
  variants: string[];
  /** Index of the active variant. */
  activeVariant: number;
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

/** One row on the global lorebook library shelf (v2 §2): the book plus usage/count metadata. */
export interface LorebookLibraryEntry extends Lorebook {
  /** Number of entries in the book. */
  entryCount: number;
  /** Number of stories this book is attached to ("used in N stories"). */
  attachmentCount: number;
}

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
  changeStoryStatMode(args: ChangeStoryStatModeArgs): Promise<StoryRecord>;
  /** Read a story's author-facing Story Blueprint (§3), or undefined if it has none. */
  getBlueprint(id: string): Promise<Blueprint | undefined>;
  /** Save (or clear, with `undefined`) a story's Story Blueprint. Style/identity only — the frozen mechanical schema is untouched. */
  saveBlueprint(id: string, blueprint: Blueprint | undefined): Promise<void>;

  // — Play —
  listMessages(storyId: string): Promise<MessageRecord[]>;
  submitTurn(args: SubmitTurnArgs): Promise<SubmitTurnOutcome>;
  listPresentCast(storyId: string): Promise<CastMember[]>;
  getLivingCard(storyId: string, characterId: string): Promise<LivingCardView | undefined>;
  /** Deep read-only profile (v2 §7): full hard+soft join with reverse-resolved relationships. */
  getCharacterDossier(storyId: string, characterId: string): Promise<Dossier | undefined>;
  listRulings(storyId: string): Promise<Ruling[]>;

  // — Overview: persisted summaries (audit #6) —
  /** Chapters the summarizer has written for a story, in turn order. */
  listChapters(storyId: string): Promise<ChapterRecord[]>;
  /** Arc documents the summarizer has folded, in order (latest last). */
  listArcs(storyId: string): Promise<ArcRecord[]>;

  // — Play: turn history (v2 §6) —
  /**
   * Regenerate the last narrator turn's prose as a new variant. The turn's committed rulings are
   * re-used verbatim, so the mechanical outcome is stable across swipes — only the prose changes.
   * Streams the new prose via `onDelta`; returns the full variant list and the new active index.
   */
  swipeLastTurn(args: SwipeArgs): Promise<SwipeOutcome>;
  /** Switch which stored variant of a narrator message is shown. No model call. */
  selectVariant(storyId: string, messageIdx: number, variantIndex: number): Promise<SwipeOutcome>;
  /** Delete the last narrator turn and its player message, rolling state back to the turn's checkpoint. */
  deleteLastTurn(storyId: string): Promise<void>;
  /** Rewind to just before the message at `fromIdx`, truncating every message/ruling/checkpoint at idx ≥ fromIdx. */
  rewindTo(storyId: string, fromIdx: number): Promise<void>;
  /** Remove the selected completed exchange itself and every later exchange. */
  deleteFromExchange(storyId: string, fromIdx: number): Promise<void>;

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
  /** Fetch the provider's current model inventory with the supplied credentials. */
  listProviderModels(
    provider: ProviderId,
    apiKey: string,
    baseUrl?: string,
    signal?: AbortSignal
  ): Promise<ProviderModel[]>;
  getSetupState(): Promise<SetupState>;
  setSetupState(state: SetupState): Promise<void>;

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
  /**
   * Entries of the story's default lorebook (v2 §2). Each story gets one auto-created, auto-attached
   * lorebook; this screen edits it. The global multi-lorebook library is a separate surface.
   */
  listLorebook(storyId: string): Promise<LorebookEntry[]>;
  /** Upsert an entry into the story's default lorebook. `entry.lorebookId` is resolved by the bridge. */
  saveLorebookEntry(storyId: string, entry: LorebookEntry): Promise<void>;
  deleteLorebookEntry(id: string): Promise<void>;

  // — Global lorebook library (v2 §2) —
  /** Every lorebook in the app (the library shelf). */
  listLorebooks(): Promise<LorebookLibraryEntry[]>;
  createLorebook(name: string, description?: string): Promise<Lorebook>;
  renameLorebook(id: string, name: string, description?: string): Promise<void>;
  /** Delete a lorebook and its entries/attachments (cascade). */
  deleteLorebook(id: string): Promise<void>;
  listLorebookEntries(lorebookId: string): Promise<LorebookEntry[]>;
  /** Upsert an entry into a specific lorebook (the library editor path). */
  saveLorebookEntryIn(lorebookId: string, entry: LorebookEntry): Promise<void>;
  /** Lorebooks attached to a story, each with its link-level enabled flag. */
  listAttachedLorebooks(storyId: string): Promise<AttachedLorebook[]>;
  attachLorebook(storyId: string, lorebookId: string): Promise<void>;
  detachLorebook(storyId: string, lorebookId: string): Promise<void>;
  setLorebookAttachedEnabled(storyId: string, lorebookId: string, enabled: boolean): Promise<void>;

  // — Persona attach (v2 §4) —
  /** The persona active for a story (its own pick, or the global default), or undefined if none. */
  getActivePersona(storyId: string): Promise<PersonaRecord | undefined>;
  /** Set (or clear, with null) a story's active persona. Null ⇒ fall back to the default. */
  setActivePersona(storyId: string, personaId: string | null): Promise<void>;

  // — Model recommendations (v2 §1/§5) —
  /** Ranked models for a role on a provider — recommended-for-role first, then a free-text affordance in the UI. */
  modelsForRole(role: Role, provider: ProviderId, availableIds?: readonly string[]): RankedModel[];
  /** The app's shipped recommended assignment for a role (wizard + "reset to recommended"). */
  defaultAssignmentFor(role: Role): RoleBinding;

  // — Importer —
  importCardFromBytes(bytes: Uint8Array): Promise<CardImportResult>;
  importCardFromUrl(url: string, signal?: AbortSignal): Promise<CardImportResult>;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// In-memory stub backend. Runs today under `vite dev`/jsdom. It mirrors core's shapes and the
// two-register data (system numbers vs story prose) so screens render believably before the
// SQLite sidecar exists. It does NOT import core at runtime.
// ─────────────────────────────────────────────────────────────────────────────────────────────

// NOTE: these three constants MIRROR core's `DEFAULT_ROLE_MAP`, `KNOWN_MODELS`, and `PROVIDER_IDS`.
// The real (SQLite) backend reads the canonical values straight from core (see sqliteBridge.ts);
// this browser stub can't value-import them (would pull core's native graph), so it carries a
// synced copy. Keep in step with core/src/router/roles.ts when those defaults change.
const MEMORY_PROVIDER_IDS: readonly ProviderId[] = [
  "openrouter",
  "electronhub",
  "nanogpt",
  "openai",
  "anthropic",
  "google",
  "mistral",
  "deepseek",
  "xai",
  "groq",
  "custom",
];

const MEMORY_DEFAULT_ROLE_MAP: RoleMap = {
  narrator: { provider: "openrouter", model: "anthropic/claude-sonnet-4", source: "recommended", samplersDirty: false, samplers: { temperature: 0.8, maxTokens: 1200 } },
  classifier: { provider: "openrouter", model: "openai/gpt-4o-mini", source: "recommended", samplersDirty: false, samplers: { temperature: 0, maxTokens: 800 } },
  analyzer: { provider: "openrouter", model: "openai/gpt-4o-mini", source: "recommended", samplersDirty: false, samplers: { temperature: 0.2, maxTokens: 1000 } },
  summarizer: { provider: "openrouter", model: "openai/gpt-4o", source: "recommended", samplersDirty: false, samplers: { temperature: 0.3, maxTokens: 1500 } },
  bootstrapper: { provider: "openrouter", model: "anthropic/claude-sonnet-4", source: "recommended", samplersDirty: false, samplers: { temperature: 0.6, maxTokens: 4000 } },
};

const MEMORY_KNOWN_MODELS: KnownModel[] = [
  {
    provider: "openrouter",
    model: "anthropic/claude-sonnet-4",
    label: "Claude Sonnet 4",
    tier: "recommended",
    supportsJsonMode: true,
  },
  {
    provider: "openrouter",
    model: "openai/gpt-4o",
    label: "GPT-4o",
    tier: "recommended",
    supportsJsonMode: true,
  },
  {
    provider: "openrouter",
    model: "google/gemini-2.0-flash-001",
    label: "Gemini 2.0 Flash",
    tier: "recommended",
    supportsJsonMode: true,
  },
  {
    provider: "openrouter",
    model: "openai/gpt-4o-mini",
    label: "GPT-4o mini",
    tier: "recommended",
    supportsJsonMode: true,
  },
  { provider: "openrouter", model: "deepseek/deepseek-chat", label: "DeepSeek V3", tier: "advanced", supportsJsonMode: true },
  { provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", tier: "advanced", supportsJsonMode: true },
  { provider: "openai", model: "gpt-4o", label: "GPT-4o (direct)", tier: "advanced", supportsJsonMode: true },
  { provider: "anthropic", model: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 (direct)", tier: "advanced", supportsJsonMode: false },
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
  /** Story's active persona pick (v2 §4); undefined ⇒ fall back to the global default. */
  activePersonaId?: string;
  /** Global lorebooks attached to this story, with link-level enabled flag (v2 §2). */
  attachedLorebooks: { lorebookId: string; enabled: boolean }[];
}

/** One global lorebook in the stub library (v2 §2). */
interface MemLorebook {
  book: Lorebook;
  entries: LorebookEntry[];
}

function uid(): string {
  // crypto.randomUUID exists in modern browsers, jsdom, and node; fall back for safety.
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `id-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

/** A minimal frozen-schema shell so `StoryRecord` typechecks without a live bootstrapper. */
function stubSchema(
  storyId: string,
  title: string,
  premise: string,
  statMode: StatMode
): StoryRecord["schema"] {
  // The stub only needs the shape to satisfy the type; the real schema is produced by core's
  // bootstrapper. Cast keeps us honest to the field names without duplicating every sub-schema.
  return {
    schemaVersion: 1,
    storyId,
    title,
    premise,
    statMode,
    attributes: statMode === "full"
      ? [{ id: "resolve", name: "Resolve", abbrev: "RES", description: "Force of will.", defaultScore: 10 }]
      : [],
    resources: statMode === "full"
      ? [{ id: "hp", label: "Health", start: 20, max: 20, playerVisible: true, lethal: true }]
      : [],
    tiers: [],
    skills: [],
    items: [],
    actions: [],
    startingState: { attributes: statMode === "full" ? { resolve: 10 } : {}, resources: {}, skills: [], inventory: [] },
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
  const lorebooks = new Map<string, MemLorebook>();
  const providerConfigs: ProviderConfigs = {};
  let roleMap: RoleMap = structuredCloneSafe(MEMORY_DEFAULT_ROLE_MAP);
  let setupState: SetupState = { validatedProviders: [], rolesConfirmed: false, dismissed: false };
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
          statMode: s.record.schema.statMode,
          migrationPending: Boolean(s.record.schema.migrationPending),
        }))
        .sort((a, b) => b.createdAt - a.createdAt);
    },

    async getStory(id) {
      return stories.get(id)?.record;
    },

    async createStory(args) {
      const statMode = args.statMode ?? "full";
      if (statMode === "full") {
        args.onProgress?.("phase-a");
        await delay(120, args.signal);
        args.onProgress?.("phase-b");
        await delay(120, args.signal);
      }
      if (args.signal?.aborted) throw abortError(args.signal);
      args.onProgress?.("validate");
      args.onProgress?.("freeze");
      args.onProgress?.("install");

      const storyId = args.storyId ?? uid();
      const record: StoryRecord = {
        id: storyId,
        title: args.title,
        createdAt: Date.now(),
        schema: stubSchema(storyId, args.title, args.premise, statMode),
        locked: true,
        ...(args.blueprint ? { blueprint: args.blueprint } : {}),
      };
      const playerCharacterId = uid();
      const card: LivingCardView = {
        characterId: playerCharacterId,
        name: args.playerName,
        isPlayer: true,
        alive: true,
        attributes: statMode === "full"
          ? [{ attributeId: "resolve", name: "Resolve", abbrev: "RES", score: 10, modifier: 0, description: "Force of will." }]
          : [],
        resources: statMode === "full"
          ? [{ id: "hp", label: "Health", current: 20, max: 20, playerVisible: true }]
          : [],
        inventory: [],
        skills: [],
      };
      stories.set(storyId, {
        record,
        messages: args.openingMessage?.trim()
          ? [{
              id: uid(),
              storyId,
              idx: 0,
              role: "narrator",
              content: args.openingMessage.trim(),
              createdAt: Date.now(),
            }]
          : [],
        rulings: [],
        cast: [
          {
            characterId: playerCharacterId,
            name: args.playerName,
            isPlayer: true,
            alive: true,
            ...(statMode === "full" ? { hp: { current: 20, max: 20, label: "Health" } } : {}),
          },
        ],
        cards: new Map([[playerCharacterId, card]]),
        lorebook: (args.lorebookSeeds ?? []).map((seed, index) => ({
          id: uid(),
          lorebookId: storyId,
          keys: seed.keys,
          content: seed.content,
          enabled: seed.enabled,
          alwaysOn: false,
          priority: 0,
          insertionOrder: index,
        })),
        attachedLorebooks: [],
      });
      return { story: record, playerCharacterId };
    },

    async renameStory(id, title) {
      requireStory(id).record.title = title;
    },

    async deleteStory(id) {
      stories.delete(id);
    },

    async changeStoryStatMode(args) {
      const story = requireStory(args.storyId);
      if (args.signal?.aborted) throw abortError(args.signal);
      if (args.target === "full" && story.record.schema.actions.length === 0) {
        args.onProgress?.("phase-a");
        await delay(120, args.signal);
        args.onProgress?.("phase-b");
        await delay(120, args.signal);
        story.record.schema = stubSchema(story.record.id, story.record.title, story.record.schema.premise, "full");
      } else {
        story.record.schema = { ...story.record.schema, statMode: args.target };
      }
      delete story.record.schema.legacyStatMode;
      delete story.record.schema.migrationPending;
      args.onProgress?.("validate");
      args.onProgress?.("freeze");
      args.onProgress?.("install");
      story.messages.push({
        id: uid(),
        storyId: story.record.id,
        idx: story.messages.length,
        role: "system",
        content: args.target === "none"
          ? "Stat system changed to No Stats. Mechanics are paused; earlier exchanges are preserved."
          : "Stat system changed to Full Stats. Mechanics begin from this boundary; earlier exchanges are unchanged.",
        createdAt: Date.now(),
      });
      return story.record;
    },

    async getBlueprint(id) {
      return requireStory(id).record.blueprint;
    },

    async saveBlueprint(id, blueprint) {
      const s = requireStory(id);
      // Style/identity only; the frozen mechanical `schema` is never touched here.
      if (blueprint) s.record.blueprint = blueprint;
      else delete s.record.blueprint;
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

    async swipeLastTurn(args): Promise<SwipeOutcome> {
      const story = requireStory(args.storyId);
      const last = story.messages[story.messages.length - 1];
      if (!last || last.role !== "narrator") {
        throw new Error("swipeLastTurn: last message is not a narrator turn.");
      }
      // Canned alternate prose so swipe UX is exercisable; the real backend re-runs the narrator
      // with the turn's committed rulings held fixed (only prose changes).
      const variantProse =
        "You try the words a different way, and the shadows answer differently — " +
        "the same truth, wearing another face.";
      await streamProse(variantProse, args.onDelta, args.signal);
      const variants = [...(last.variants ?? [last.content]), variantProse];
      const activeVariant = variants.length - 1;
      last.variants = variants;
      last.activeVariant = activeVariant;
      last.content = variantProse;
      return { variants, activeVariant };
    },

    async selectVariant(storyId, messageIdx, variantIndex): Promise<SwipeOutcome> {
      const story = requireStory(storyId);
      const msg = story.messages.find((m) => m.idx === messageIdx);
      if (!msg || msg.role !== "narrator") throw new Error("selectVariant: not a narrator message.");
      const variants = msg.variants ?? [msg.content];
      const clamped = Math.max(0, Math.min(variantIndex, variants.length - 1));
      msg.variants = variants;
      msg.activeVariant = clamped;
      msg.content = variants[clamped]!;
      return { variants, activeVariant: clamped };
    },

    async deleteLastTurn(storyId) {
      const story = requireStory(storyId);
      const last = story.messages[story.messages.length - 1];
      if (!last || last.role !== "narrator") return;
      // Drop the narrator turn plus its opening player message (if present). The stub has no
      // checkpoints, so hard/soft rollback is a no-op here (the SQLite backend restores state).
      story.messages.pop();
      const prev = story.messages[story.messages.length - 1];
      if (prev?.role === "player") story.messages.pop();
    },

    async rewindTo(storyId, fromIdx) {
      const story = requireStory(storyId);
      const selected = story.messages.find((message) => message.idx === fromIdx);
      if (!selected) return;
      const cutoff = selected.role === "player" ? fromIdx + 2 : fromIdx + 1;
      story.messages = story.messages.filter((m) => m.idx < cutoff);
      story.rulings = story.rulings.filter((r) => {
        const attached = r.messageId
          ? story.messages.find((message) => message.id === r.messageId)
          : undefined;
        return attached !== undefined;
      });
    },

    async deleteFromExchange(storyId, fromIdx) {
      const story = requireStory(storyId);
      const selected = story.messages.find((message) => message.idx === fromIdx);
      if (!selected) return;
      const narratorIdx = selected.role === "player" ? fromIdx + 1 : fromIdx;
      const narrator = story.messages.find((message) => message.idx === narratorIdx && message.role === "narrator");
      if (!narrator) throw new Error("deleteFromExchange: selected message is not part of a completed exchange.");
      const previous = story.messages.find((message) => message.idx === narrator.idx - 1);
      const cutoff = previous?.role === "player" ? previous.idx : narrator.idx;
      story.messages = story.messages.filter((message) => message.idx < cutoff);
      story.rulings = story.rulings.filter((ruling) =>
        ruling.messageId ? story.messages.some((message) => message.id === ruling.messageId) : false
      );
    },

    async listPresentCast(storyId) {
      return [...requireStory(storyId).cast];
    },

    async getLivingCard(storyId, characterId) {
      return requireStory(storyId).cards.get(characterId);
    },

    async getCharacterDossier(storyId, characterId) {
      // The in-memory bridge stores only the compact living card (no full soft state), so we
      // synthesize a dossier from it. The SQLite bridge does the real hard+soft join via core.
      const card = requireStory(storyId).cards.get(characterId);
      if (!card) return undefined;
      const soft = card.soft;
      return {
        characterId: card.characterId,
        isPlayer: card.isPlayer,
        identity: {
          name: card.name,
          whatTheyAre: soft?.appearance?.split(/[.;]/)[0]?.trim() ?? "",
          ...(soft?.appearance !== undefined ? { appearance: soft.appearance } : {}),
          ...(soft ? { tier: soft.tier } : {}),
        },
        mentality: {
          traits: soft?.traits ?? [],
          behavioralSignatures: [],
          ...(soft?.mood !== undefined ? { mood: soft.mood } : {}),
          ...(soft?.speechStyle !== undefined ? { speechStyle: soft.speechStyle } : {}),
        },
        currentState: {
          ...(soft?.mood !== undefined ? { mood: soft.mood } : {}),
          ...(soft?.location !== undefined ? { location: soft.location } : {}),
          ...(soft?.goal !== undefined ? { goal: soft.goal } : {}),
        },
        past: { observations: (soft?.recentObservations ?? []).map((text, i) => ({ turnIdx: i, text })) },
        relationships: {
          outgoing: (soft?.relationships ?? []).map((r) => ({
            toCharacterId: r.toCharacterId,
            toName: requireStory(storyId).cards.get(r.toCharacterId)?.name ?? r.toCharacterId,
            trust: r.trust,
            power: r.power,
            ...(r.feeling !== undefined ? { feeling: r.feeling } : {}),
          })),
          incoming: [],
        },
        sheet: {
          attributes: card.attributes,
          resources: card.resources.map((b) => ({
            id: b.id,
            label: b.label,
            current: b.current,
            max: b.max,
          })),
          skills: card.skills.map((s) => ({
            skillId: s.skillId,
            name: s.name,
            rank: s.rank,
            successCount: 0,
            toNext: null,
          })),
          inventory: card.inventory.map((e) => ({
            itemId: e.itemId,
            name: e.name,
            qty: e.qty,
            kind: "misc",
          })),
          alive: card.alive,
        },
        involvedThreads: [],
      };
    },

    async listRulings(storyId) {
      return [...requireStory(storyId).rulings];
    },

    // The in-memory backend runs no summarizer, so there are never persisted chapters/arcs to read.
    // Overview treats an empty result as "no summaries yet" (the honest state for dev/design mode).
    async listChapters(_storyId) {
      return [];
    },
    async listArcs(_storyId) {
      return [];
    },

    async getProviderConfigs() {
      return { ...providerConfigs };
    },
    async setProviderConfig(provider, config) {
      providerConfigs[provider] = { apiKey: config.apiKey, ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}) };
    },
    async removeProviderConfig(provider) {
      delete providerConfigs[provider];
      setupState = {
        ...setupState,
        validatedProviders: setupState.validatedProviders.filter((id) => id !== provider),
      };
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
    async listProviderModels(provider, apiKey, baseUrl) {
      if (!apiKey.trim()) throw new Error("Enter a key to load models.");
      if (provider === "custom" && !baseUrl?.trim()) throw new Error("Enter a base URL to load models.");
      const known = MEMORY_KNOWN_MODELS.filter((model) => model.provider === provider);
      return (known.length > 0 ? known : [{ model: `${provider}/default-model`, label: "Default model" }]).map(
        (model) => ({ id: model.model, label: model.label })
      );
    },
    async getSetupState() {
      return structuredCloneSafe(setupState);
    },
    async setSetupState(state) {
      setupState = structuredCloneSafe(state);
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
    async saveLorebookEntry(storyId, entry) {
      const book = requireStory(storyId).lorebook;
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
      for (const b of lorebooks.values()) {
        const i = b.entries.findIndex((e) => e.id === id);
        if (i >= 0) {
          b.entries.splice(i, 1);
          return;
        }
      }
    },

    // — Global lorebook library (v2 §2) —
    async listLorebooks() {
      return [...lorebooks.values()].map((b) => ({
        ...b.book,
        entryCount: b.entries.length,
        attachmentCount: [...stories.values()].filter((s) =>
          s.attachedLorebooks.some((a) => a.lorebookId === b.book.id)
        ).length,
      }));
    },
    async createLorebook(name, description) {
      const book: Lorebook = { id: uid(), name, description: description ?? "", createdAt: Date.now(), source: "user" };
      lorebooks.set(book.id, { book, entries: [] });
      return { ...book };
    },
    async renameLorebook(id, name, description) {
      const b = lorebooks.get(id);
      if (!b) throw new Error(`memory bridge: unknown lorebook ${id}`);
      b.book.name = name;
      if (description !== undefined) b.book.description = description;
    },
    async deleteLorebook(id) {
      lorebooks.delete(id);
      for (const s of stories.values()) {
        s.attachedLorebooks = s.attachedLorebooks.filter((a) => a.lorebookId !== id);
      }
    },
    async listLorebookEntries(lorebookId) {
      return [...(lorebooks.get(lorebookId)?.entries ?? [])];
    },
    async saveLorebookEntryIn(lorebookId, entry) {
      const b = lorebooks.get(lorebookId);
      if (!b) throw new Error(`memory bridge: unknown lorebook ${lorebookId}`);
      const record = { ...entry, lorebookId };
      const i = b.entries.findIndex((e) => e.id === record.id);
      if (i >= 0) b.entries[i] = record;
      else b.entries.push(record);
    },
    async listAttachedLorebooks(storyId) {
      const s = requireStory(storyId);
      return s.attachedLorebooks
        .map((a) => {
          const b = lorebooks.get(a.lorebookId);
          return b ? { ...b.book, linkEnabled: a.enabled } : undefined;
        })
        .filter((x): x is AttachedLorebook => x !== undefined);
    },
    async attachLorebook(storyId, lorebookId) {
      const s = requireStory(storyId);
      if (!s.attachedLorebooks.some((a) => a.lorebookId === lorebookId)) {
        s.attachedLorebooks.push({ lorebookId, enabled: true });
      }
    },
    async detachLorebook(storyId, lorebookId) {
      const s = requireStory(storyId);
      s.attachedLorebooks = s.attachedLorebooks.filter((a) => a.lorebookId !== lorebookId);
    },
    async setLorebookAttachedEnabled(storyId, lorebookId, enabled) {
      const s = requireStory(storyId);
      const link = s.attachedLorebooks.find((a) => a.lorebookId === lorebookId);
      if (link) link.enabled = enabled;
    },

    // — Persona attach (v2 §4) —
    async getActivePersona(storyId) {
      const s = requireStory(storyId);
      const pick = s.activePersonaId ? personas.find((p) => p.id === s.activePersonaId) : undefined;
      return pick ? { ...pick } : personas.find((p) => p.isDefault) ? { ...personas.find((p) => p.isDefault)! } : undefined;
    },
    async setActivePersona(storyId, personaId) {
      const s = requireStory(storyId);
      if (personaId === null) delete s.activePersonaId;
      else s.activePersonaId = personaId;
    },

    // — Model recommendations (v2 §1/§5) — stub ranks from the mirrored known-models list.
    modelsForRole(_role, provider, availableIds) {
      const ids = availableIds ?? MEMORY_KNOWN_MODELS.filter((m) => m.provider === provider).map((m) => m.model);
      return ids.map((id) => {
        const m = MEMORY_KNOWN_MODELS.find((known) => known.provider === provider && known.model === id);
        return {
          id,
          label: m?.label ?? id,
          provider,
          tier: m?.tier ?? "advanced",
          recommendedForRole: m?.tier === "recommended",
          supportsJsonMode: m?.supportsJsonMode ?? false,
        };
      });
    },
    defaultAssignmentFor(role) {
      return structuredCloneSafe(MEMORY_DEFAULT_ROLE_MAP[role]);
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

function abortError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  const error = new Error("The request was cancelled.");
  error.name = "AbortError";
  return error;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    const cancel = () => {
      clearTimeout(timer);
      reject(signal ? abortError(signal) : new Error("The request was cancelled."));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    signal?.addEventListener("abort", cancel, { once: true });
  });
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
 * Open the real SQLite-backed store for the packaged app.
 *
 * Storage runs through the Tauri storage driver ({@link makeSqliteDriver}): core's async `SqlDriver`
 * seam over the shell's Rust SQLite commands (packages/shell/src-tauri/src/db.rs). `openStoreWith`
 * runs migrations and returns the migrated {@link Store}. This must only be called inside the Tauri
 * shell, where `invoke` reaches those commands; in browser dev the in-memory backend is used instead.
 *
 * Note: this replaced the originally-envisioned better-sqlite3 sidecar (rejected in the shell's
 * Cargo.toml, D10). core is no longer synchronous — the store API is fully async.
 */
export async function openSqliteStore(): Promise<Store> {
  const { openStoreWith } = await import("@midnight-tavern/core");
  return openStoreWith(makeSqliteDriver());
}

/**
 * Load the SQLite `CoreBridge`: the packaged app's real backend. Opens the migrated store over the
 * Tauri storage driver, then builds the façade (see sqliteBridge.ts) whose methods delegate to core
 * (stories → store.stories.*, submitTurn → core.submitTurn, createStory → core.bootstrapStory,
 * licensing → core.evaluateCachedLicense/validateLicenseKey/…, living card → core.getLivingCard,
 * importer → core.parse*Card/importCardFromUrl + mapCardToImport).
 *
 * The single dynamic `import("@midnight-tavern/core")` lives here — core's runtime is loaded once
 * and its namespace handed to `buildSqliteBridge`, so this whole graph stays out of the browser
 * bundle (it's only ever reached inside the Tauri shell). `_path` is accepted for signature parity
 * with the memory backend; the actual DB path is owned by the Rust side (app data dir).
 */
export async function loadSqliteBridge(_path: string): Promise<CoreBridge> {
  const core = await import("@midnight-tavern/core");
  const store = await core.openStoreWith(makeSqliteDriver());
  const { buildSqliteBridge } = await import("./sqliteBridge.js");
  return buildSqliteBridge(store, core);
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
