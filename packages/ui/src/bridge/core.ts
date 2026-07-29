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
  StoryEvent,
  StoryJournalPage,
  StoryJournalQuery,
  SuggestedAction,
  CharacterInventoryView,
  EquipmentAssignment,
  EquipmentSlot,
  ItemDefinition,
  ItemInstance,
  DifficultyConfig,
  BootstrapPhase,
  BootstrapProgressEvent,
  BootstrapResumeState,
  ImportedMechanics,
  ClassifierRecoveryMetadata,
  StageMetric,
  TurnOperationRecoveryInspection,
  UniversalActionConfig,
  EquipmentLootConfig,
  RulebookRegenerationImpact,
  AttributeAdvancementDecision,
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
  Samplers,
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
  StoryJournalPage,
  StoryJournalQuery,
  SuggestedAction,
  CharacterInventoryView,
  EquipmentAssignment,
  EquipmentSlot,
  ItemDefinition,
  ItemInstance,
  DifficultyConfig,
  BootstrapProgressEvent,
  BootstrapResumeState,
  ImportedMechanics,
  ClassifierRecoveryMetadata,
  StageMetric,
  TurnOperationRecoveryInspection,
  UniversalActionConfig,
  EquipmentLootConfig,
  RulebookRegenerationImpact,
  AttributeAdvancementDecision,
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
  /** Persona selected before forging; required identity context for player-sheet generation. */
  persona?: { id?: string; name: string; description: string };
  /** Sealed consequential-action limit; defaults to two. */
  actionBudget?: number;
  /** Initial play difficulty; defaults to Standard. */
  difficulty?: Partial<DifficultyConfig>;
  /** Full author-facing narrative configuration saved with the new story. */
  blueprint?: Blueprint;
  /** Optional chosen opening, persisted as the first narrator message. */
  openingMessage?: string;
  /** Imported character-book entries to create and attach after bootstrap. */
  lorebookSeeds?: LorebookSeed[];
  /** Lossless imported card source, retained until prompt-time macro evaluation. */
  sourceCard?: CharacterCard;
  /** Explicit mechanics parsed from the imported card and accepted on the review screen. */
  importedMechanics?: ImportedMechanics;
  acceptImportedMechanics?: boolean;
  /** Optional streaming sink for the forging interstitial's progress copy. */
  onProgress?: (phase: BootstrapPhase) => void;
  /** Truthful fragment/retry/elapsed progress for the V7 forging interstitial. */
  onProgressDetail?: (event: BootstrapProgressEvent) => void;
  /** Persist each validated fragment so cancellation or restart can resume truthfully. */
  onCheckpoint?: (checkpoint: BootstrapResumeState) => void;
  /** A prior matching checkpoint; core rejects it if the effective source fingerprint changed. */
  resume?: BootstrapResumeState;
  signal?: AbortSignal;
}

export interface ChangeStoryStatModeArgs {
  storyId: string;
  target: StatMode;
  onProgress?: (phase: BootstrapPhase) => void;
  onProgressDetail?: (event: BootstrapProgressEvent) => void;
  signal?: AbortSignal;
}

export interface RegenerateRulebookArgs {
  storyId: string;
  /** Duplicate is the safe default; in-place is available only after the stronger typed warning. */
  mode?: "duplicate" | "in-place";
  /** Must be true after the UI warning is explicitly accepted. */
  confirmMechanicalReset: true;
  statMode?: StatMode;
  actionBudget?: number;
  persona?: { id?: string; name: string; description: string };
  onProgress?: (phase: BootstrapPhase) => void;
  onProgressDetail?: (event: BootstrapProgressEvent) => void;
  /** Persist validated forge fragments so a safe cancellation can resume. */
  onCheckpoint?: (checkpoint: BootstrapResumeState) => void;
  /** Previously retained fragments for the same effective source. */
  resume?: BootstrapResumeState;
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
  /** Final deterministic rulings, delivered before the first narrator delta. */
  onRulings?: (rulings: Ruling[]) => void;
  /** Player persona + protagonist essentials block (§7.3). */
  personaBlock?: string;
  /** Persisted V7 operation state, mapped to reader-facing UI phases. */
  onPhase?: (phase: TurnOperationPhase) => void;
  /** Per-stage latency/outcome telemetry from the bounded turn pipeline. */
  onStageMetric?: (metric: StageMetric) => void;
  signal?: AbortSignal;
}

export type TurnOperationPhase =
  | "classifying"
  | "classifier-recovery"
  | "ruling"
  | "generating-loot"
  | "thinking"
  | "streaming"
  | "saving"
  | "idle"
  | "error"
  | "cancelled"
  | "timed-out"
  | "stale";

export interface SubmitTurnOutcome {
  /** Full narrator prose for the turn. */
  prose: string;
  /** Committed rulings in resolution order (dice toasts render from these). */
  rulings: Ruling[];
  /** idx of the persisted narrator message. */
  narratorIdx: number;
  classifierRecovered: boolean;
  classifierRecovery?: ClassifierRecoveryMetadata;
  refusedActionCount: number;
  usedNarratorFallback: boolean;
  /** Structured deterministic verdicts for DM-proposed attribute changes. */
  attributeAdvancements: AttributeAdvancementDecision[];
}

export interface RetryTurnOperationArgs {
  operationId: string;
  onDelta?: (delta: string) => void;
  onRulings?: (rulings: Ruling[]) => void;
  personaBlock?: string;
  onPhase?: (phase: TurnOperationPhase) => void;
  onStageMetric?: (metric: StageMetric) => void;
  signal?: AbortSignal;
}

/** Args for regenerating the last narrator turn's prose as a new variant (§6). */
export interface SwipeArgs {
  storyId: string;
  /** Live narrator deltas for the regenerated prose. */
  onDelta?: (delta: string) => void;
  /** Player persona + protagonist essentials block (§7.3). */
  personaBlock?: string;
  /** Optional feedback stored with this alternate telling. */
  feedback?: string;
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

export type ModelRecommendationPreset = "Precise" | "Balanced" | "Creative";
export type SamplerKey = keyof Samplers;

/** Data-only recommendation metadata exposed to browser-safe UI code. */
export interface ModelRecommendationConfigView {
  version: number;
  samplerPresets: Record<ModelRecommendationPreset, Samplers>;
  defaultPresetForRole: Record<Role, ModelRecommendationPreset>;
  providerSamplerSupport: Partial<Record<ProviderId, readonly SamplerKey[]>>;
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
  regenerateRulebook(args: RegenerateRulebookArgs): Promise<StoryRecord>;
  previewRulebookRegenerationImpact(
    storyId: string
  ): Promise<RulebookRegenerationImpact>;
  setStoryDifficulty(storyId: string, difficulty: Partial<DifficultyConfig>): Promise<StoryRecord>;
  /** Read a story's author-facing Story Blueprint (§3), or undefined if it has none. */
  getBlueprint(id: string): Promise<Blueprint | undefined>;
  /** Save (or clear, with `undefined`) a story's Story Blueprint. Style/identity only — the frozen mechanical schema is untouched. */
  saveBlueprint(id: string, blueprint: Blueprint | undefined): Promise<void>;

  // — Play —
  listMessages(storyId: string): Promise<MessageRecord[]>;
  submitTurn(args: SubmitTurnArgs): Promise<SubmitTurnOutcome>;
  /** Inspect the latest persisted non-terminal/failed turn without mutating transcript state. */
  inspectTurnRecovery(storyId: string): Promise<TurnOperationRecoveryInspection | undefined>;
  /** Resume the exact persisted player message; never inserts a duplicate player line. */
  retryTurnOperation(args: RetryTurnOperationArgs): Promise<SubmitTurnOutcome>;
  listPresentCast(storyId: string): Promise<CastMember[]>;
  getLivingCard(storyId: string, characterId: string): Promise<LivingCardView | undefined>;
  /** Deep read-only profile (v2 §7): full hard+soft join with reverse-resolved relationships. */
  getCharacterDossier(storyId: string, characterId: string): Promise<Dossier | undefined>;
  listRulings(storyId: string): Promise<Ruling[]>;
  suggestActions(storyId: string, signal?: AbortSignal): Promise<SuggestedAction[]>;
  listStoryJournal(storyId: string, query?: StoryJournalQuery): Promise<StoryJournalPage>;
  exportStoryJournal(storyId: string, format?: "markdown" | "csv"): Promise<string>;
  /** Versioned, upgradable global action catalog used by every Full Stats story. */
  universalActionsConfig(): Promise<UniversalActionConfig>;
  /** Universal seven-slot, tier-budget, and on-demand loot policy. */
  equipmentLootConfig(): Promise<EquipmentLootConfig>;
  getCharacterInventory(characterId: string): Promise<CharacterInventoryView>;
  equipItem(
    characterId: string,
    itemInstanceId: string,
    slot: EquipmentSlot
  ): Promise<EquipmentAssignment[]>;
  unequipSlot(characterId: string, slot: EquipmentSlot): Promise<EquipmentAssignment[]>;

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
  /** Exactly one configured provider is Primary; undefined only when no providers are connected. */
  getPrimaryProvider(): Promise<ProviderId | undefined>;
  /** Replaces the prior Primary provider. The target must already have saved credentials. */
  setPrimaryProvider(provider: ProviderId): Promise<void>;
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
  /** Versioned preset/profile data loaded from the shipped recommendation config. */
  modelRecommendationConfig(): ModelRecommendationConfigView;
  /** Config-derived recommended parameters for the selected model and role. */
  recommendedSamplerProfile(role: Role, modelId?: string): Samplers;
  /** Config-derived provider capability mask for one sampler field. */
  providerSupportsSampler(provider: ProviderId, field: SamplerKey): boolean;

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
  narrator: { provider: "openrouter", model: "google/gemini-2.0-flash-001", source: "recommended", samplersDirty: false, samplers: { temperature: 0.8, topP: 0.95, presencePenalty: 0.3, frequencyPenalty: 0.3, maxTokens: 1200 } },
  classifier: { provider: "openrouter", model: "openai/gpt-4o-mini", source: "recommended", samplersDirty: false, samplers: { temperature: 0, topP: 1, maxTokens: 500 } },
  analyzer: { provider: "openrouter", model: "openai/gpt-4o-mini", source: "recommended", samplersDirty: false, samplers: { temperature: 0.2, topP: 1, maxTokens: 800 } },
  summarizer: { provider: "openrouter", model: "openai/gpt-4o", source: "recommended", samplersDirty: false, samplers: { temperature: 0.5, topP: 0.95, maxTokens: 1200 } },
  bootstrapper: { provider: "openrouter", model: "anthropic/claude-sonnet-4", source: "recommended", samplersDirty: false, samplers: { temperature: 0.4, topP: 0.95, maxTokens: 8000 } },
};

function memoryRoleMapForPrimary(map: RoleMap, primary: ProviderId): RoleMap {
  return Object.fromEntries(
    Object.entries(map).map(([role, binding]) => [
      role,
      binding.source === "custom" || binding.provider === primary
        ? structuredCloneSafe(binding)
        : { ...structuredCloneSafe(binding), provider: primary },
    ])
  ) as RoleMap;
}

const MEMORY_MODEL_RECOMMENDATION_CONFIG: ModelRecommendationConfigView = {
  version: 2,
  samplerPresets: {
    Precise: {
      temperature: 0,
      topP: 1,
      topK: 0,
      minP: 0,
      frequencyPenalty: 0,
      presencePenalty: 0,
      repetitionPenalty: 1,
      maxTokens: 800,
    },
    Balanced: {
      temperature: 0.5,
      topP: 0.95,
      topK: 40,
      minP: 0.02,
      frequencyPenalty: 0,
      presencePenalty: 0,
      repetitionPenalty: 1.05,
      maxTokens: 1200,
    },
    Creative: {
      temperature: 0.8,
      topP: 0.98,
      topK: 60,
      minP: 0.05,
      frequencyPenalty: 0.2,
      presencePenalty: 0.2,
      repetitionPenalty: 1.1,
      maxTokens: 1600,
    },
  },
  defaultPresetForRole: {
    classifier: "Precise",
    analyzer: "Precise",
    bootstrapper: "Balanced",
    summarizer: "Balanced",
    narrator: "Creative",
  },
  providerSamplerSupport: {
    openai: [
      "temperature",
      "topP",
      "frequencyPenalty",
      "presencePenalty",
      "maxTokens",
      "stop",
      "seed",
    ],
    anthropic: ["temperature", "topP", "topK", "maxTokens", "stop"],
  },
};

/** Browser/dev fallback only; the packaged SQLite bridge reads the canonical core JSON config. */
const MEMORY_UNIVERSAL_ACTIONS_CONFIG: UniversalActionConfig = {
  version: 2,
  actions: [
    { id: "attack_melee", category: "combat", label: "Attack (melee)", description: "Strike a target at close range.", aliases: ["attack", "strike", "stab", "slash", "lunge", "punch", "kick"], defaultRequiresItemKind: "weapon", defaultTargetDamage: { success: 4, crit_success: 8 }, requiresCharacterTarget: true },
    { id: "attack_ranged", category: "combat", label: "Attack (ranged)", description: "Attack a target from a distance.", aliases: ["shoot", "fire", "throw", "snipe"], defaultRequiresItemKind: "weapon", defaultTargetDamage: { success: 4, crit_success: 8 }, requiresCharacterTarget: true },
    { id: "defend", category: "combat", label: "Defend", description: "Brace, block, or parry an incoming threat.", aliases: ["block", "parry", "guard", "brace"], requiresCharacterTarget: false },
    { id: "evade", category: "combat", label: "Evade", description: "Avoid a threat through movement or positioning.", aliases: ["dodge", "duck", "escape", "sidestep"], requiresCharacterTarget: false },
    { id: "move", category: "utility", label: "Move", description: "Change position in the current scene.", aliases: ["walk", "run", "sprint", "climb", "swim"], requiresCharacterTarget: false },
    { id: "observe", category: "exploration", label: "Observe", description: "Study immediately visible details.", aliases: ["look", "watch", "listen", "inspect"], requiresCharacterTarget: false },
    { id: "search", category: "exploration", label: "Search", description: "Examine a person or place for something concealed.", aliases: ["investigate", "loot", "scavenge", "examine"], requiresCharacterTarget: false },
    { id: "interact", category: "utility", label: "Interact", description: "Manipulate an object or environmental feature.", aliases: ["use", "open", "close", "pull", "push", "activate"], requiresCharacterTarget: false },
    { id: "influence", category: "social", label: "Influence", description: "Persuade, reassure, command, or negotiate with someone.", aliases: ["persuade", "convince", "charm", "command", "negotiate"], requiresCharacterTarget: true },
    { id: "deceive", category: "social", label: "Deceive", description: "Mislead someone through words or behavior.", aliases: ["lie", "bluff", "misdirect", "disguise"], requiresCharacterTarget: true },
    { id: "use_item", category: "utility", label: "Use item", description: "Use an owned item for its intended purpose.", aliases: ["drink", "consume", "equip", "apply"], requiresCharacterTarget: false },
    { id: "assist", category: "utility", label: "Assist", description: "Help another character with their immediate action.", aliases: ["help", "aid", "support"], requiresCharacterTarget: true },
    { id: "recover", category: "utility", label: "Recover", description: "Catch breath or tend to an immediate condition.", aliases: ["rest", "heal", "bandage", "regain"], requiresCharacterTarget: false },
    { id: "wait", category: "utility", label: "Wait", description: "Hold position and allow the scene to advance.", aliases: ["pause", "hold", "do nothing"], requiresCharacterTarget: false },
  ],
};

const MEMORY_EQUIPMENT_LOOT_CONFIG: EquipmentLootConfig = {
  version: 1,
  slots: [
    "primary",
    "secondary",
    "head",
    "body",
    "utility",
    "accessory_1",
    "accessory_2",
  ],
  tiers: {
    common: { maximumEffects: 1, maximumCheckBonus: 0, maximumAttributeBonus: 0, requiresMilestone: false },
    uncommon: { maximumEffects: 1, maximumCheckBonus: 1, maximumAttributeBonus: 0, requiresMilestone: false },
    rare: { maximumEffects: 2, maximumCheckBonus: 2, maximumAttributeBonus: 1, requiresMilestone: false },
    legendary: { maximumEffects: 3, maximumCheckBonus: 3, maximumAttributeBonus: 2, requiresMilestone: true },
    mythical: { maximumEffects: 4, maximumCheckBonus: 4, maximumAttributeBonus: 3, requiresMilestone: true },
  },
  loot: {
    maximumItemsPerEncounter: 3,
    routineMaximumTier: {
      combat: "rare",
      non_combat: "rare",
      milestone: "legendary",
      quest: "legendary",
    },
    mythicalRequiresExplicitAuthorization: true,
  },
};

// MIRRORS core `KNOWN_MODELS`, which core derives from `router/model-recommendations.config.json`
// (`models[]`). This browser stub can't value-import core (would pull the native graph into the
// eager bundle), so it carries a synced copy. Parity with canonical core is enforced by
// `test/bridge/catalogParity.test.ts` — if that test fails, resync this list from the JSON.
const MEMORY_KNOWN_MODELS: KnownModel[] = [
  { provider: "openrouter", model: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4", tier: "recommended", supportsJsonMode: true },
  { provider: "openrouter", model: "anthropic/claude-opus-4", label: "Claude Opus 4 · Quality", tier: "recommended", supportsJsonMode: true },
  { provider: "openrouter", model: "openai/gpt-4o", label: "GPT-4o", tier: "recommended", supportsJsonMode: true },
  { provider: "openrouter", model: "openai/gpt-4o-mini", label: "GPT-4o mini", tier: "recommended", supportsJsonMode: true },
  { provider: "openrouter", model: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash · Fast", tier: "recommended", supportsJsonMode: true },
  { provider: "openrouter", model: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro", tier: "recommended", supportsJsonMode: true },
  { provider: "openrouter", model: "deepseek/deepseek-chat", label: "DeepSeek V3", tier: "advanced", supportsJsonMode: true },
  { provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", tier: "advanced", supportsJsonMode: true },
  { provider: "openrouter", model: "meta-llama/llama-3.1-8b-instruct", label: "Llama 3.1 8B", tier: "advanced", supportsJsonMode: false },
  { provider: "openai", model: "gpt-4o", label: "GPT-4o (direct)", tier: "recommended", supportsJsonMode: true },
  { provider: "openai", model: "gpt-4o-mini", label: "GPT-4o mini (direct)", tier: "recommended", supportsJsonMode: true },
  { provider: "anthropic", model: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 (direct)", tier: "recommended", supportsJsonMode: false },
  { provider: "google", model: "gemini-2.0-flash-001", label: "Gemini 2.0 Flash (direct)", tier: "recommended", supportsJsonMode: true },
  { provider: "deepseek", model: "deepseek-chat", label: "DeepSeek V3 (direct)", tier: "advanced", supportsJsonMode: true },
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
  /** Runtime-only possessions owned by this story's characters. */
  runtimeItems: {
    definitions: ItemDefinition[];
    instances: ItemInstance[];
    assignments: EquipmentAssignment[];
  };
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

interface MemoryStartingGearSpec {
  pattern: RegExp;
  name: string;
  kind: ItemDefinition["kind"];
  slots: EquipmentSlot[];
  preferredSlot?: EquipmentSlot;
  handsRequired: 0 | 1 | 2;
}

const MEMORY_POSSESSION_CUE =
  /\b(?:carry|carries|carrying|wield|wields|wielding|wear|wears|wearing|armed with|equipped with|keeps?|owns?|has|have|holstered|strapped|packed)\b/i;
const MEMORY_STARTING_GEAR: readonly MemoryStartingGearSpec[] = [
  { pattern: /\blongbow\b/i, name: "Longbow", kind: "weapon", slots: ["primary"], preferredSlot: "primary", handsRequired: 2 },
  { pattern: /\b(?:shortbow|bow)\b/i, name: "Bow", kind: "weapon", slots: ["primary"], preferredSlot: "primary", handsRequired: 2 },
  { pattern: /\b(?:pistol|revolver|handgun)\b/i, name: "Pistol", kind: "weapon", slots: ["primary", "secondary"], preferredSlot: "primary", handsRequired: 1 },
  { pattern: /\b(?:rifle|shotgun|musket)\b/i, name: "Long Gun", kind: "weapon", slots: ["primary"], preferredSlot: "primary", handsRequired: 2 },
  { pattern: /\b(?:knife|dagger)\b/i, name: "Knife", kind: "weapon", slots: ["primary", "secondary"], preferredSlot: "secondary", handsRequired: 1 },
  { pattern: /\b(?:sword|blade|machete|axe)\b/i, name: "Blade", kind: "weapon", slots: ["primary", "secondary"], preferredSlot: "primary", handsRequired: 1 },
  { pattern: /\b(?:helmet|helm|hat)\b/i, name: "Headwear", kind: "armor", slots: ["head"], preferredSlot: "head", handsRequired: 0 },
  { pattern: /\b(?:armor|armour|breastplate|vest|coat|cloak|jacket|robes?)\b/i, name: "Protective Clothing", kind: "armor", slots: ["body"], preferredSlot: "body", handsRequired: 0 },
  { pattern: /\b(?:lockpicks?|toolkit|tools?|medkit|first aid kit|rope|lantern|torch|compass|radio|phone|binoculars|spellbook)\b/i, name: "Field Tool", kind: "tool", slots: ["utility"], preferredSlot: "utility", handsRequired: 0 },
  { pattern: /\b(?:ring|amulet|necklace|bracelet|watch|talisman)\b/i, name: "Personal Accessory", kind: "accessory", slots: ["accessory_1", "accessory_2"], preferredSlot: "accessory_1", handsRequired: 0 },
];

function makeMemoryStartingGear(
  args: CreateStoryArgs,
  storyId: string,
  characterId: string
): MemStory["runtimeItems"] {
  const sources = [
    args.sourceCard
      ? [
          args.sourceCard.data.description,
          args.sourceCard.data.personality,
          args.sourceCard.data.scenario,
          args.sourceCard.data.first_mes,
          args.sourceCard.data.creator_notes ?? "",
        ].filter(Boolean).join("\n")
      : "",
    args.persona?.description ?? "",
  ].filter((value) => value.trim().length > 0);
  const selected: MemoryStartingGearSpec[] = [];
  for (const text of sources) {
    for (const spec of MEMORY_STARTING_GEAR) {
      const match = spec.pattern.exec(text);
      if (!match) continue;
      const vicinity = text.slice(
        Math.max(0, match.index - 90),
        Math.min(text.length, match.index + match[0].length + 45)
      );
      if (!MEMORY_POSSESSION_CUE.test(vicinity)) continue;
      if (!selected.some((entry) => entry.name === spec.name)) selected.push(spec);
    }
  }
  if (selected.length === 0) {
    selected.push({
      pattern: /$^/,
      name: "Basic Personal Effects",
      kind: "misc",
      slots: [],
      handsRequired: 0,
    });
  }
  const createdAt = new Date().toISOString();
  const definitions: ItemDefinition[] = [];
  const instances: ItemInstance[] = [];
  const assignments: EquipmentAssignment[] = [];
  const usedSlots = new Set<EquipmentSlot>();
  for (const spec of selected.slice(0, 7)) {
    const definitionId = uid();
    const instanceId = uid();
    definitions.push({
      id: definitionId,
      storyId,
      name: spec.name,
      description: "An established starting possession.",
      kind: spec.kind,
      tier: "common",
      slotCompatibility: spec.slots,
      handsRequired: spec.handsRequired,
      unique: false,
      effects: [],
      props: {},
      tags: ["starting_gear"],
      createdAt,
      configVersion: MEMORY_EQUIPMENT_LOOT_CONFIG.version,
    });
    instances.push({
      id: instanceId,
      storyId,
      definitionId,
      ownerCharacterId: characterId,
      quantity: 1,
      acquiredAt: createdAt,
      provenance: {
        sourceType: "quest",
        sourceLabel: "Character creation",
        rulingId: `story_creation:${storyId}`,
        turnId: `story_creation:${storyId}`,
        tierBudget: "common",
        eligibilityReasons: ["Established starting possession"],
        policyVersion: MEMORY_EQUIPMENT_LOOT_CONFIG.version,
        grantedAt: createdAt,
      },
    });
    const slot = [spec.preferredSlot, ...spec.slots]
      .find((candidate): candidate is EquipmentSlot =>
        Boolean(candidate && spec.slots.includes(candidate) && !usedSlots.has(candidate))
      );
    if (slot) {
      assignments.push({ characterId, slot, itemInstanceId: instanceId });
      usedSlots.add(slot);
    }
  }
  return { definitions, instances, assignments };
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
  let primaryProvider: ProviderId | undefined;
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
        actionBudget: Math.max(1, Math.min(5, Math.round(args.actionBudget ?? 2))),
        rulebookVersion: 1,
        difficulty: {
          preset: args.difficulty?.preset ?? "standard",
          dcOffset: args.difficulty?.dcOffset ?? 0,
          damageTakenMultiplier: args.difficulty?.damageTakenMultiplier ?? 1,
          damageDealtMultiplier: args.difficulty?.damageDealtMultiplier ?? 1,
        },
        ...(args.blueprint ? { blueprint: args.blueprint } : {}),
      };
      const playerCharacterId = uid();
      const runtimeItems = makeMemoryStartingGear(args, storyId, playerCharacterId);
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
        inventory: runtimeItems.instances.map((instance) => ({
          itemId: instance.definitionId,
          name: runtimeItems.definitions.find(
            (definition) => definition.id === instance.definitionId
          )?.name ?? "Starting gear",
          qty: instance.quantity,
        })),
        skills: [],
      };
      const storyLorebookEntries: LorebookEntry[] = (args.lorebookSeeds ?? []).map(
        (seed, index) => ({
          id: uid(),
          lorebookId: storyId,
          keys: seed.keys,
          content: seed.content,
          enabled: seed.enabled,
          alwaysOn: false,
          priority: 0,
          insertionOrder: index,
        })
      );
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
        lorebook: storyLorebookEntries,
        ...(args.persona?.id ? { activePersonaId: args.persona.id } : {}),
        attachedLorebooks: [{ lorebookId: storyId, enabled: true }],
        runtimeItems,
      });
      lorebooks.set(storyId, {
        book: {
          id: storyId,
          name: `${args.title} lore`,
          description: "Story-specific lore",
          createdAt: record.createdAt,
          source: "user",
        },
        entries: storyLorebookEntries,
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

    async previewRulebookRegenerationImpact(storyId) {
      const story = requireStory(storyId);
      const cards = [...story.cards.values()];
      return {
        attributes: story.record.schema.attributes.length,
        skills: story.record.schema.skills.length,
        skillProgressions: cards.reduce(
          (total, card) => total + card.skills.length,
          0
        ),
        storyActions: story.record.schema.actions.length,
        universalActions: MEMORY_UNIVERSAL_ACTIONS_CONFIG.actions.length,
        resources: story.record.schema.resources.length,
        flags: 0,
        characters: story.cast.length,
        rulings: story.rulings.length,
        checkpoints: 0,
        journalEvents: 0,
        runtimeItemDefinitions: story.runtimeItems.definitions.length,
        runtimeItemInstances: story.runtimeItems.instances.length,
        equippedSlots: story.runtimeItems.assignments.length,
        actionBudget:
          story.record.actionBudget ??
          story.record.schema.actionBudget ??
          2,
      };
    },

    async regenerateRulebook(args) {
      if (args.confirmMechanicalReset !== true) {
        throw new Error("Rulebook regeneration requires explicit reset confirmation.");
      }
      let story = requireStory(args.storyId);
      let duplicateDraftId: string | undefined;
      if (args.mode !== "in-place") {
        const source = story;
        const storyId = uid();
        story = {
          record: {
            ...structuredCloneSafe(source.record),
            id: storyId,
            title: `${source.record.title} - Regenerated Copy`,
            createdAt: Date.now(),
            schema: { ...structuredCloneSafe(source.record.schema), storyId },
            rulebookVersion: 1,
          },
          messages: source.messages.map((message) => ({
            ...structuredCloneSafe(message),
            id: uid(),
            storyId,
          })),
          rulings: [],
          cast: structuredCloneSafe(source.cast),
          cards: new Map(
            [...source.cards.entries()].map(([id, card]) => [
              id,
              structuredCloneSafe(card),
            ])
          ),
          lorebook: source.lorebook.map((entry) => ({
            ...structuredCloneSafe(entry),
            id: uid(),
          })),
          ...(source.activePersonaId
            ? { activePersonaId: source.activePersonaId }
            : {}),
          attachedLorebooks: structuredCloneSafe(source.attachedLorebooks),
          runtimeItems: structuredCloneSafe(source.runtimeItems),
        };
        stories.set(storyId, story);
        duplicateDraftId = storyId;
      }
      try {
        args.onProgress?.("phase-a");
        await delay(120, args.signal);
        args.onProgress?.("phase-b");
        await delay(120, args.signal);
        const mode = args.statMode ?? story.record.schema.statMode;
        story.record.schema = stubSchema(
          story.record.id,
          story.record.title,
          story.record.schema.premise,
          mode
        );
        story.record.actionBudget = Math.max(
          1,
          Math.min(5, Math.round(args.actionBudget ?? story.record.actionBudget ?? 2))
        );
        story.record.rulebookVersion = (story.record.rulebookVersion ?? 1) + 1;
        story.rulings = [];
        args.onProgress?.("validate");
        args.onProgress?.("freeze");
        args.onProgress?.("install");
        return story.record;
      } catch (error) {
        if (duplicateDraftId) stories.delete(duplicateDraftId);
        throw error;
      }
    },

    async setStoryDifficulty(storyId, difficulty) {
      const story = requireStory(storyId);
      story.record.difficulty = {
        preset: difficulty.preset ?? "standard",
        dcOffset: difficulty.dcOffset ?? 0,
        damageTakenMultiplier: difficulty.damageTakenMultiplier ?? 1,
        damageDealtMultiplier: difficulty.damageDealtMultiplier ?? 1,
      };
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
      args.onPhase?.("classifying");
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
      args.onRulings?.([]);
      args.onPhase?.("thinking");
      args.onPhase?.("streaming");
      await streamProse(prose, args.onDelta, args.signal);

      const narratorIdx = playerIdx + 1;
      args.onPhase?.("saving");
      story.messages.push({
        id: uid(),
        storyId: args.storyId,
        idx: narratorIdx,
        role: "narrator",
        content: prose,
        createdAt: Date.now(),
      });
      const rulings: Ruling[] = [];
      args.onPhase?.("idle");
      return {
        prose,
        rulings,
        narratorIdx,
        classifierRecovered: false,
        refusedActionCount: 0,
        usedNarratorFallback: false,
        attributeAdvancements: [],
      };
    },

    async inspectTurnRecovery(_storyId) {
      return undefined;
    },

    async retryTurnOperation(_args) {
      throw new Error("No recoverable turn operation exists in design mode.");
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
      return {
        variants: variants.map((variant) =>
          typeof variant === "string" ? variant : variant.prose
        ),
        activeVariant,
      };
    },

    async selectVariant(storyId, messageIdx, variantIndex): Promise<SwipeOutcome> {
      const story = requireStory(storyId);
      const msg = story.messages.find((m) => m.idx === messageIdx);
      if (!msg || msg.role !== "narrator") throw new Error("selectVariant: not a narrator message.");
      const variants = msg.variants ?? [msg.content];
      const clamped = Math.max(0, Math.min(variantIndex, variants.length - 1));
      msg.variants = variants;
      msg.activeVariant = clamped;
      const selected = variants[clamped]!;
      msg.content = typeof selected === "string" ? selected : selected.prose;
      return {
        variants: variants.map((variant) =>
          typeof variant === "string" ? variant : variant.prose
        ),
        activeVariant: clamped,
      };
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
            xp: 0,
            toNext: null,
            nextRankXp: null,
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

    async suggestActions(storyId) {
      const story = requireStory(storyId);
      const actionSuggestions: SuggestedAction[] = story.record.schema.actions
        .slice(0, 4)
        .map((action) => ({
          id: uid(),
          kind: "action",
          text: action.label,
          actionId: action.id,
          rationale: action.description ?? "A valid action for this story.",
        }));
      return [
        ...actionSuggestions,
        {
          id: uid(),
          kind: "dialogue",
          text: "Ask what the nearest character knows.",
          rationale: "Learn more without assuming the outcome.",
        } as SuggestedAction,
        {
          id: uid(),
          kind: "move",
          text: "Observe the surroundings carefully.",
          rationale: "Gather context before committing.",
        } as SuggestedAction,
      ].slice(0, 6);
    },

    async listStoryJournal(_storyId, _query) {
      return { events: [] };
    },

    async exportStoryJournal(storyId, format = "markdown") {
      return format === "csv"
        ? '"turn_index","chapter","kind","actor","summary","details"\n'
        : `# ${requireStory(storyId).record.title} — Mechanical Journal\n\n_No mechanical events have been recorded in design mode._\n`;
    },

    async universalActionsConfig() {
      return structuredCloneSafe(MEMORY_UNIVERSAL_ACTIONS_CONFIG);
    },

    async equipmentLootConfig() {
      return structuredCloneSafe(MEMORY_EQUIPMENT_LOOT_CONFIG);
    },

    async getCharacterInventory(characterId) {
      const story = [...stories.values()].find((candidate) =>
        candidate.cards.has(characterId)
      );
      if (!story) return { definitions: [], instances: [], assignments: [] };
      const instances = story.runtimeItems.instances.filter(
        (instance) => instance.ownerCharacterId === characterId
      );
      const definitionIds = new Set(instances.map((instance) => instance.definitionId));
      return structuredCloneSafe({
        definitions: story.runtimeItems.definitions.filter((definition) =>
          definitionIds.has(definition.id)
        ),
        instances,
        assignments: story.runtimeItems.assignments.filter(
          (assignment) => assignment.characterId === characterId
        ),
      });
    },

    async equipItem(characterId, itemInstanceId, slot) {
      const story = [...stories.values()].find((candidate) =>
        candidate.cards.has(characterId)
      );
      if (!story) throw new Error("Unknown character.");
      const instance = story.runtimeItems.instances.find(
        (candidate) =>
          candidate.id === itemInstanceId &&
          candidate.ownerCharacterId === characterId
      );
      if (!instance) throw new Error("Only an owned item can be equipped.");
      const definition = story.runtimeItems.definitions.find(
        (candidate) => candidate.id === instance.definitionId
      );
      if (!definition?.slotCompatibility.includes(slot)) {
        throw new Error("That item is incompatible with this equipment slot.");
      }
      story.runtimeItems.assignments = story.runtimeItems.assignments.filter(
        (assignment) =>
          assignment.characterId !== characterId ||
          (assignment.slot !== slot && assignment.itemInstanceId !== itemInstanceId)
      );
      story.runtimeItems.assignments.push({ characterId, slot, itemInstanceId });
      return structuredCloneSafe(story.runtimeItems.assignments.filter(
        (assignment) => assignment.characterId === characterId
      ));
    },

    async unequipSlot(characterId, slot) {
      const story = [...stories.values()].find((candidate) =>
        candidate.cards.has(characterId)
      );
      if (!story) return [];
      story.runtimeItems.assignments = story.runtimeItems.assignments.filter(
        (assignment) =>
          assignment.characterId !== characterId || assignment.slot !== slot
      );
      return structuredCloneSafe(story.runtimeItems.assignments.filter(
        (assignment) => assignment.characterId === characterId
      ));
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
      if (!primaryProvider) {
        primaryProvider = provider;
        roleMap = memoryRoleMapForPrimary(roleMap, provider);
      }
    },
    async removeProviderConfig(provider) {
      const remaining = (Object.keys(providerConfigs) as ProviderId[]).filter(
        (candidate) => candidate !== provider && Boolean(providerConfigs[candidate]?.apiKey)
      );
      if (primaryProvider === provider && remaining.length > 0) {
        throw new Error("Choose a replacement Primary provider before disconnecting this one.");
      }
      delete providerConfigs[provider];
      if (primaryProvider === provider) primaryProvider = undefined;
      setupState = {
        ...setupState,
        validatedProviders: setupState.validatedProviders.filter((id) => id !== provider),
      };
    },
    async getPrimaryProvider() {
      if (primaryProvider && providerConfigs[primaryProvider]?.apiKey) return primaryProvider;
      primaryProvider = (Object.keys(providerConfigs) as ProviderId[]).find((provider) =>
        Boolean(providerConfigs[provider]?.apiKey)
      );
      return primaryProvider;
    },
    async setPrimaryProvider(provider) {
      if (!providerConfigs[provider]?.apiKey) {
        throw new Error("Connect and validate this provider before making it Primary.");
      }
      primaryProvider = provider;
      roleMap = memoryRoleMapForPrimary(roleMap, provider);
    },
    async getRoleMap() {
      if (primaryProvider) roleMap = memoryRoleMapForPrimary(roleMap, primaryProvider);
      return structuredCloneSafe(roleMap);
    },
    async setRoleMap(map) {
      roleMap = primaryProvider
        ? memoryRoleMapForPrimary(map, primaryProvider)
        : structuredCloneSafe(map);
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
    modelsForRole(role, provider, availableIds) {
      const ids = availableIds ?? MEMORY_KNOWN_MODELS.filter((m) => m.provider === provider).map((m) => m.model);
      return ids.map((id) => {
        const m = MEMORY_KNOWN_MODELS.find((known) => known.provider === provider && known.model === id);
        const recommendedForRole =
          MEMORY_DEFAULT_ROLE_MAP[role].provider === provider &&
          MEMORY_DEFAULT_ROLE_MAP[role].model === id;
        return {
          id,
          label: m?.label ?? id,
          provider,
          tier: m?.tier ?? "advanced",
          recommendedForRole,
          supportsJsonMode: m?.supportsJsonMode ?? false,
        };
      }).sort((a, b) =>
        Number(b.recommendedForRole) - Number(a.recommendedForRole) ||
        a.label.localeCompare(b.label)
      );
    },
    defaultAssignmentFor(role) {
      return structuredCloneSafe(MEMORY_DEFAULT_ROLE_MAP[role]);
    },
    modelRecommendationConfig() {
      return structuredCloneSafe(MEMORY_MODEL_RECOMMENDATION_CONFIG);
    },
    recommendedSamplerProfile(role) {
      return structuredCloneSafe(MEMORY_DEFAULT_ROLE_MAP[role].samplers ?? {});
    },
    providerSupportsSampler(provider, field) {
      const supported = MEMORY_MODEL_RECOMMENDATION_CONFIG.providerSamplerSupport[provider];
      return supported ? supported.includes(field) : true;
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
