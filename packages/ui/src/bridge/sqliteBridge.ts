/**
 * Real (SQLite) CoreBridge backend — the packaged app's persistence, wiring UI intents to core.
 *
 * WHY A SEPARATE MODULE FROM core.ts
 * ----------------------------------
 * core.ts is the browser-safe façade: it imports core as TYPES ONLY, so `vite dev`/jsdom never
 * pulls core's runtime graph. This module is the opposite — it VALUE-imports core to actually run
 * it. It is reached exclusively through a dynamic `import()` in core.ts (`loadSqliteBridge`), so it
 * is only ever evaluated inside the Tauri shell, where storage commands and `fetch` exist.
 *
 * Everything here delegates to the opened {@link Store} + core functions. The in-memory bridge in
 * core.ts is the behavioral contract each method mirrors; where core can't supply something the
 * stub faked (per-phase bootstrap progress, provider-key balance), the divergence is called out
 * inline rather than papered over.
 */
import type {
  BootstrapPhase,
  Role,
  Store,
  TurnOperationState,
} from "@midnight-tavern/core";
import type {
  CastMember,
  CardImportResult,
  CoreBridge,
  CreateStoryArgs,
  CreateStoryResult,
  KeyValidation,
  ProviderConfigInput,
  StorySummary,
  SubmitTurnArgs,
  SubmitTurnOutcome,
  TurnOperationPhase,
} from "./core.js";
import { diagnosticError, diagnosticsLogger } from "../observability/logger.js";

const PRIMARY_PROVIDER_SETTING_KEY = "primaryProvider";

/**
 * Build the real bridge over an already-opened, migrated {@link Store}. `core` is the live core
 * module namespace (passed in so this file never re-imports it — core.ts owns the single dynamic
 * import). Returns a fully-wired {@link CoreBridge}.
 */
export function buildSqliteBridge(
  store: Store,
  core: typeof import("@midnight-tavern/core")
): CoreBridge {
  const toUiPhase = (phase: TurnOperationState): TurnOperationPhase => {
    if (phase === "classifier_error") return "classifier-recovery";
    if (phase === "generating_loot") return "generating-loot";
    if (phase === "timed_out") return "timed-out";
    return phase;
  };

  // Router deps come from stored settings. We rebuild the router per operation that needs it
  // (createStory / submitTurn / validateProviderKey) rather than caching, so a settings change
  // mid-session is picked up without a bridge reload. Reads are cheap (two settings rows).
  async function currentRouter(requiredRoles: readonly Role[] = core.ROLES) {
    const providerConfigs =
      (await store.settings.get(core.PROVIDER_CONFIGS_SETTING_KEY, core.ProviderConfigsSchema)) ?? {};
    const roleMap =
      (await store.settings.get(core.ROLE_MAP_SETTING_KEY, core.RoleMapSchema)) ?? core.DEFAULT_ROLE_MAP;
    for (const role of requiredRoles) {
      const binding = roleMap[role];
      if (!providerConfigs[binding.provider]?.apiKey) {
        diagnosticsLogger.error("router.configuration.rejected", {
          role,
          provider: binding.provider,
          reason: "missing-credentials",
        });
        throw new core.MissingCredentialsError(role, binding.provider);
      }
    }
    return core.makeRouter({ providerConfigs, roleMap, logger: diagnosticsLogger });
  }

  async function requireStory(storyId: string) {
    const record = await store.stories.get(storyId);
    if (!record) throw new Error(`No story with id ${storyId}.`);
    return record;
  }

  // The per-story Lorebook screen edits ONE lorebook (v2 §2's global library is a separate surface).
  // We adopt the first lorebook already attached to the story as its "default"; when the screen first
  // saves an entry and none exists, we lazily create one (source "user") and attach it. `create=false`
  // (reads) returns undefined rather than materializing an empty book.
  async function defaultLorebookId(storyId: string, create: boolean): Promise<string>;
  async function defaultLorebookId(storyId: string, create: false): Promise<string | undefined>;
  async function defaultLorebookId(storyId: string, create: boolean): Promise<string | undefined> {
    const attached = await store.lorebook.listAttached(storyId);
    if (attached.length > 0) return attached[0]!.id;
    if (!create) return undefined;
    const story = await requireStory(storyId);
    const id = crypto.randomUUID();
    await store.lorebook.createLorebook({
      id,
      name: `${story.title} lore`,
      description: "",
      createdAt: Date.now(),
      source: "user",
    });
    await store.lorebook.attach(storyId, id);
    return id;
  }

  return {
    // ── Stories ──────────────────────────────────────────────────────────────────────────────
    async listStories(): Promise<StorySummary[]> {
      const stories = await store.stories.list();
      const summaries = await Promise.all(
        stories.map(async (record) => ({
          id: record.id,
          title: record.title,
          createdAt: record.createdAt,
          locked: record.locked,
          messageCount: (await store.messages.listByStory(record.id)).length,
          statMode: record.schema.statMode,
          migrationPending: Boolean(record.schema.migrationPending),
        }))
      );
      return summaries.sort((a, b) => b.createdAt - a.createdAt);
    },

    async getStory(id) {
      return store.stories.get(id);
    },

    async createStory(args: CreateStoryArgs): Promise<CreateStoryResult> {
      const storyId = args.storyId ?? crypto.randomUUID();
      const startedAt = Date.now();
      diagnosticsLogger.info("story.forge.started", {
        operationId: storyId,
        hasBlueprint: Boolean(args.blueprint),
        hasOpening: Boolean(args.openingMessage?.trim()),
        loreEntryCount: args.lorebookSeeds?.length ?? 0,
      });
      try {
        const mode = args.statMode ?? "full";
        const router = await currentRouter(mode === "none" ? ["narrator"] : core.ROLES);
        const result = await core.bootstrapStory(
          router,
          store,
          {
            storyId,
            title: args.title,
            premise: args.premise,
            statMode: args.statMode ?? "full",
            actionBudget: args.actionBudget ?? 2,
            ...(args.persona ? { persona: args.persona } : {}),
            ...(args.sourceCard ? { sourceCard: args.sourceCard } : {}),
            ...(args.importedMechanics ? { importedMechanics: args.importedMechanics } : {}),
            ...(args.acceptImportedMechanics !== undefined
              ? { acceptImportedMechanics: args.acceptImportedMechanics }
              : {}),
          },
          { name: args.playerName },
          {
            ...(args.signal ? { signal: args.signal } : {}),
            onProgress: (phase) => {
              diagnosticsLogger.info("story.forge.progress", { operationId: storyId, phase });
              args.onProgress?.(phase);
            },
            ...(args.onProgressDetail ? { onProgressDetail: args.onProgressDetail } : {}),
            ...(args.onCheckpoint ? { onCheckpoint: args.onCheckpoint } : {}),
            ...(args.resume ? { resume: args.resume } : {}),
          }
        );
        if (args.persona?.id) {
          await store.personas.setActiveForStory(storyId, args.persona.id);
        }
        if (args.blueprint) {
          await store.stories.setBlueprint(storyId, args.blueprint);
          result.story.blueprint = args.blueprint;
        }
        if (args.difficulty) {
          result.story = await core.setStoryDifficulty(store, storyId, args.difficulty);
        }
        if (args.openingMessage?.trim()) {
          await store.messages.insert({
            id: crypto.randomUUID(),
            storyId,
            idx: 0,
            role: "narrator",
            content: args.openingMessage.trim(),
            createdAt: Date.now(),
          });
        }
        if (args.lorebookSeeds?.length) {
          const lorebookId = crypto.randomUUID();
          await store.lorebook.createLorebook({
            id: lorebookId,
            name: `${args.title} imported lore`,
            description: "Imported from a character card.",
            createdAt: Date.now(),
            source: "imported_card",
          });
          await store.lorebook.attach(storyId, lorebookId);
          for (const [index, seed] of args.lorebookSeeds.entries()) {
            await store.lorebook.insertEntry({
              id: crypto.randomUUID(),
              lorebookId,
              keys: seed.keys,
              content: seed.content,
              enabled: seed.enabled,
              alwaysOn: false,
              priority: 0,
              insertionOrder: index,
            });
          }
        }
        diagnosticsLogger.info("story.forge.completed", {
          operationId: storyId,
          durationMs: Date.now() - startedAt,
        });
        return { story: result.story, playerCharacterId: result.playerCharacterId };
      } catch (error) {
        diagnosticsLogger.error("story.forge.failed", {
          operationId: storyId,
          durationMs: Date.now() - startedAt,
          cancelled: args.signal?.aborted ?? false,
          error: diagnosticError(error),
        });
        throw error;
      }
    },

    async renameStory(id, title) {
      const record = await requireStory(id);
      await store.stories.update({ ...record, title });
    },

    async deleteStory(id) {
      await store.stories.delete(id);
    },

    async changeStoryStatMode(args) {
      const router = await currentRouter(args.target === "none" ? ["narrator"] : core.ROLES);
      return core.changeStoryStatMode(router, store, args.storyId, args.target, {
        ...(args.signal ? { signal: args.signal } : {}),
        onProgress: (phase) => {
          diagnosticsLogger.info("story.stat_mode.progress", { operationId: args.storyId, phase, target: args.target });
          args.onProgress?.(phase);
        },
      });
    },

    async previewRulebookRegenerationImpact(storyId) {
      return core.previewRulebookRegenerationImpact(store, storyId);
    },

    async regenerateRulebook(args) {
      const target = args.statMode ?? (await requireStory(args.storyId)).schema.statMode;
      const router = await currentRouter(target === "none" ? ["narrator"] : core.ROLES);
      const options = {
        ...(args.statMode ? { statMode: args.statMode } : {}),
        ...(args.actionBudget ? { actionBudget: args.actionBudget } : {}),
        ...(args.persona ? { persona: args.persona } : {}),
        ...(args.signal ? { signal: args.signal } : {}),
        ...(args.resume ? { resume: args.resume } : {}),
        onProgress: (phase: BootstrapPhase) => args.onProgress?.(phase),
        ...(args.onProgressDetail ? { onProgressDetail: args.onProgressDetail } : {}),
        ...(args.onCheckpoint ? { onCheckpoint: args.onCheckpoint } : {}),
      };
      return args.mode === "in-place"
        ? core.regenerateRulebook(router, store, args.storyId, {
            ...options,
            confirmMechanicalReset: args.confirmMechanicalReset,
          })
        : core.duplicateAndRegenerateRulebook(router, store, args.storyId, options);
    },

    async setStoryDifficulty(storyId, difficulty) {
      return core.setStoryDifficulty(store, storyId, difficulty);
    },

    async getBlueprint(id) {
      return (await requireStory(id)).blueprint;
    },

    async saveBlueprint(id, blueprint) {
      // Dedicated blueprint write — style/identity only, never the frozen mechanical schema (§3).
      await requireStory(id); // 404s a missing story before we touch the column
      await store.stories.setBlueprint(id, blueprint);
    },

    // ── Play ─────────────────────────────────────────────────────────────────────────────────
    async listMessages(storyId) {
      return store.messages.listByStory(storyId);
    },

    async submitTurn(args: SubmitTurnArgs): Promise<SubmitTurnOutcome> {
      const startedAt = Date.now();
      diagnosticsLogger.info("turn.submit.started", { operationId: args.storyId });
      try {
        const story = await requireStory(args.storyId);
        const router = await currentRouter(story.schema.statMode === "none" ? ["narrator"] : core.ROLES);
        const result = await core.submitTurn(router, store, args.storyId, args.playerText, {
          ...(args.onDelta ? { onDelta: args.onDelta } : {}),
          ...(args.personaBlock ? { personaBlock: args.personaBlock } : {}),
          ...(args.onPhase
            ? { onPhase: (phase: TurnOperationState) => args.onPhase!(toUiPhase(phase)) }
            : {}),
          ...(args.signal ? { signal: args.signal } : {}),
        });
        diagnosticsLogger.info("turn.submit.completed", {
          operationId: args.storyId,
          durationMs: Date.now() - startedAt,
          rulingCount: result.rulings.length,
        });
        // Analyzer + summaries continue after prose. Keep the UI responsive while recording their
        // terminal state and preventing an unhandled rejection.
        void result.background.then(
          () => diagnosticsLogger.info("turn.background.completed", { operationId: args.storyId }),
          (error: unknown) => diagnosticsLogger.error("turn.background.failed", {
            operationId: args.storyId,
            error: diagnosticError(error),
          })
        );
        return {
          prose: result.prose,
          rulings: result.rulings,
          narratorIdx: result.narratorIdx,
          classifierRecovered: result.classifierRecovered,
          ...(result.classifierRecovery
            ? { classifierRecovery: result.classifierRecovery }
            : {}),
          refusedActionCount: result.refusedActionCount,
          usedNarratorFallback: result.usedNarratorFallback,
        };
      } catch (error) {
        diagnosticsLogger.error("turn.submit.failed", {
          operationId: args.storyId,
          durationMs: Date.now() - startedAt,
          cancelled: args.signal?.aborted ?? false,
          error: diagnosticError(error),
        });
        throw error;
      }
    },

    async inspectTurnRecovery(storyId) {
      return core.inspectTurnOperationRecovery(store, storyId);
    },

    async retryTurnOperation(args) {
      const operation = await store.turnOperations.get(args.operationId);
      if (!operation) {
        throw new core.TurnOperationRecoveryError("operation_not_found");
      }
      const story = await requireStory(operation.storyId);
      const router = await currentRouter(
        story.schema.statMode === "none" ? ["narrator"] : core.ROLES
      );
      const result = await core.retryTurnOperation(router, store, args.operationId, {
        ...(args.onDelta ? { onDelta: args.onDelta } : {}),
        ...(args.personaBlock ? { personaBlock: args.personaBlock } : {}),
        ...(args.onPhase
          ? {
              onPhase: (phase: TurnOperationState) =>
                args.onPhase!(toUiPhase(phase)),
            }
          : {}),
        ...(args.signal ? { signal: args.signal } : {}),
      });
      void result.background.then(
        () =>
          diagnosticsLogger.info("turn.background.completed", {
            operationId: args.operationId,
          }),
        (error: unknown) =>
          diagnosticsLogger.error("turn.background.failed", {
            operationId: args.operationId,
            error: diagnosticError(error),
          })
      );
      return {
        prose: result.prose,
        rulings: result.rulings,
        narratorIdx: result.narratorIdx,
        classifierRecovered: result.classifierRecovered,
        ...(result.classifierRecovery
          ? { classifierRecovery: result.classifierRecovery }
          : {}),
        refusedActionCount: result.refusedActionCount,
        usedNarratorFallback: result.usedNarratorFallback,
      };
    },

    async listPresentCast(storyId): Promise<CastMember[]> {
      const story = await requireStory(storyId);
      const roster = await store.characters.listByStory(storyId);
      // Reuse core's hard/soft join (getLivingCard) rather than reimplementing it; the strip only
      // needs a condensed slice (name/alive, the player-visible resource as hp, and soft.mood).
      const cards = await Promise.all(
        roster.map((r) => core.getLivingCard(store, story.schema, r.id))
      );
      const cast: CastMember[] = [];
      for (const card of cards) {
        if (!card) continue;
        const visible = card.resources.find((r) => r.playerVisible);
        cast.push({
          characterId: card.characterId,
          name: card.name,
          isPlayer: card.isPlayer,
          alive: card.alive,
          ...(visible
            ? { hp: { current: visible.current, max: visible.max, label: visible.label } }
            : {}),
          ...(card.soft?.mood ? { mood: card.soft.mood } : {}),
        });
      }
      return cast;
    },

    async getLivingCard(storyId, characterId) {
      const story = await requireStory(storyId);
      return core.getLivingCard(store, story.schema, characterId);
    },

    async getCharacterDossier(storyId, characterId) {
      const story = await requireStory(storyId);
      return core.getCharacterDossier(store, story.schema, characterId);
    },

    // ── Play: turn history (v2 §6) ───────────────────────────────────────────────────────────────
    async swipeLastTurn(args) {
      const story = await requireStory(args.storyId);
      const router = await currentRouter(story.schema.statMode === "none" ? ["narrator"] : ["narrator", "analyzer"]);
      return core.swipeLastTurn(router, store, args.storyId, {
        ...(args.onDelta ? { onDelta: args.onDelta } : {}),
        ...(args.personaBlock ? { personaBlock: args.personaBlock } : {}),
        ...(args.feedback ? { feedback: args.feedback } : {}),
        ...(args.signal ? { signal: args.signal } : {}),
      });
    },

    async selectVariant(storyId, messageIdx, variantIndex) {
      return core.selectVariant(store, storyId, messageIdx, variantIndex);
    },

    async deleteLastTurn(storyId) {
      await core.deleteLastTurn(store, storyId);
    },

    async rewindTo(storyId, fromIdx) {
      await core.rewindTo(store, storyId, fromIdx);
    },

    async deleteFromExchange(storyId, fromIdx) {
      await core.deleteFromExchange(store, storyId, fromIdx);
    },

    async listRulings(storyId) {
      const records = await store.rulings.listByStory(storyId);
      return records.map((r) => ({ ...r.ruling, messageId: r.messageId }));
    },

    async suggestActions(storyId, signal) {
      const router = await currentRouter(["classifier"]);
      return core.suggestPlayerActions(router, store, storyId, signal);
    },

    async listStoryJournal(storyId, query) {
      return core.listStoryJournal(store, storyId, query);
    },

    async exportStoryJournal(storyId, format = "markdown") {
      return core.exportStoryJournal(store, storyId, format);
    },

    async universalActionsConfig() {
      return structuredClone(core.UNIVERSAL_ACTIONS_CONFIG);
    },

    async equipmentLootConfig() {
      return structuredClone(core.EQUIPMENT_LOOT_CONFIG);
    },

    async getCharacterInventory(characterId) {
      return core.getCharacterInventory(store, characterId);
    },

    async equipItem(characterId, itemInstanceId, slot) {
      return core.equipRuntimeItem(store, characterId, itemInstanceId, slot);
    },

    async unequipSlot(characterId, slot) {
      return core.unequipRuntimeSlot(store, characterId, slot);
    },

    async listChapters(storyId) {
      return store.chapters.listByStory(storyId);
    },
    async listArcs(storyId) {
      return store.arcs.listByStory(storyId);
    },

    // ── Settings: providers + role map ─────────────────────────────────────────────────────────
    async getProviderConfigs() {
      return (await store.settings.get(core.PROVIDER_CONFIGS_SETTING_KEY, core.ProviderConfigsSchema)) ?? {};
    },

    async setProviderConfig(provider, config: ProviderConfigInput) {
      const configs =
        (await store.settings.get(core.PROVIDER_CONFIGS_SETTING_KEY, core.ProviderConfigsSchema)) ?? {};
      configs[provider] = { apiKey: config.apiKey, ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}) };
      await store.settings.set(core.PROVIDER_CONFIGS_SETTING_KEY, core.ProviderConfigsSchema, configs);
      const primary = await store.settings.get(
        PRIMARY_PROVIDER_SETTING_KEY,
        core.ProviderIdSchema
      );
      if (!primary || !configs[primary]?.apiKey) {
        await store.settings.set(PRIMARY_PROVIDER_SETTING_KEY, core.ProviderIdSchema, provider);
      }
    },

    async removeProviderConfig(provider) {
      const configs =
        (await store.settings.get(core.PROVIDER_CONFIGS_SETTING_KEY, core.ProviderConfigsSchema)) ?? {};
      const primary = await store.settings.get(
        PRIMARY_PROVIDER_SETTING_KEY,
        core.ProviderIdSchema
      );
      const remaining = (Object.keys(configs) as Array<keyof typeof configs>).filter(
        (candidate) => candidate !== provider && Boolean(configs[candidate]?.apiKey)
      );
      if (primary === provider && remaining.length > 0) {
        throw new Error("Choose a replacement Primary provider before disconnecting this one.");
      }
      delete configs[provider];
      await store.settings.set(core.PROVIDER_CONFIGS_SETTING_KEY, core.ProviderConfigsSchema, configs);
      if (primary === provider || (primary && !configs[primary]?.apiKey)) {
        await store.settings.delete(PRIMARY_PROVIDER_SETTING_KEY);
      }
      if (core.SETUP_STATE_SETTING_KEY && core.SetupStateSchema) {
        const setup =
          (await store.settings.get(core.SETUP_STATE_SETTING_KEY, core.SetupStateSchema)) ??
          core.DEFAULT_SETUP_STATE ??
          { validatedProviders: [], rolesConfirmed: false, dismissed: false };
        await store.settings.set(core.SETUP_STATE_SETTING_KEY, core.SetupStateSchema, {
          ...setup,
          validatedProviders: setup.validatedProviders.filter((id) => id !== provider),
        });
      }
    },

    async getPrimaryProvider() {
      const configs =
        (await store.settings.get(core.PROVIDER_CONFIGS_SETTING_KEY, core.ProviderConfigsSchema)) ?? {};
      const saved = await store.settings.get(
        PRIMARY_PROVIDER_SETTING_KEY,
        core.ProviderIdSchema
      );
      if (saved && configs[saved]?.apiKey) return saved;
      const fallback = (Object.keys(configs) as Array<keyof typeof configs>).find((provider) =>
        Boolean(configs[provider]?.apiKey)
      );
      if (fallback) {
        await store.settings.set(PRIMARY_PROVIDER_SETTING_KEY, core.ProviderIdSchema, fallback);
        return fallback;
      }
      if (saved) await store.settings.delete(PRIMARY_PROVIDER_SETTING_KEY);
      return undefined;
    },

    async setPrimaryProvider(provider) {
      const configs =
        (await store.settings.get(core.PROVIDER_CONFIGS_SETTING_KEY, core.ProviderConfigsSchema)) ?? {};
      if (!configs[provider]?.apiKey) {
        throw new Error("Connect and validate this provider before making it Primary.");
      }
      await store.settings.set(PRIMARY_PROVIDER_SETTING_KEY, core.ProviderIdSchema, provider);
    },

    async getRoleMap() {
      return (await store.settings.get(core.ROLE_MAP_SETTING_KEY, core.RoleMapSchema)) ?? core.DEFAULT_ROLE_MAP;
    },

    async setRoleMap(map) {
      await store.settings.set(core.ROLE_MAP_SETTING_KEY, core.RoleMapSchema, map);
    },

    defaultRoleMap() {
      return core.DEFAULT_ROLE_MAP;
    },

    knownModels() {
      return core.KNOWN_MODELS;
    },

    providerIds() {
      return core.PROVIDER_IDS;
    },

    async validateProviderKey(provider, apiKey, baseUrl, signal): Promise<KeyValidation> {
      const trimmed = apiKey.trim();
      if (!trimmed) return { state: "rejected", reason: "Enter a key to validate." };
      // core has no dedicated key-probe endpoint (providers expose only chat/chatStream), and no
      // balance surface, so we do a minimal real chat call: success ⇒ valid, failure ⇒ rejected.
      // Balance is intentionally omitted rather than faked (the stub showed a placeholder "$4.20").
      const chatProvider = core.makeProvider(provider);
      try {
        await chatProvider.validateConfig?.(
          { apiKey: trimmed, ...(baseUrl ? { baseUrl } : {}) },
          signal
        );
        if (chatProvider.listModels) {
          const models = await chatProvider.listModels(
            { apiKey: trimmed, ...(baseUrl ? { baseUrl } : {}) },
            signal
          );
          return { state: "valid", label: `Key accepted · ${models.length} models` };
        }
        const model = core.KNOWN_MODELS.find((candidate) => candidate.provider === provider)?.model;
        if (!model) return { state: "rejected", reason: `No known model for provider ${provider}.` };
        await chatProvider.chat(
          {
            model,
            messages: [{ role: "user", content: "ping" }],
            maxTokens: 1,
            ...(signal ? { signal } : {}),
          },
          { apiKey: trimmed, ...(baseUrl ? { baseUrl } : {}) }
        );
        return { state: "valid", label: "Key accepted" };
      } catch (err) {
        return { state: "rejected", reason: (err as Error).message || "The provider rejected this key." };
      }
    },

    async listProviderModels(provider, apiKey, baseUrl, signal) {
      const providerClient = core.makeProvider(provider);
      if (!providerClient.listModels) throw new Error(`${provider} does not expose model discovery.`);
      return providerClient.listModels(
        { apiKey: apiKey.trim(), ...(baseUrl ? { baseUrl } : {}) },
        signal
      );
    },

    async getSetupState() {
      if (!core.SETUP_STATE_SETTING_KEY || !core.SetupStateSchema) {
        return { validatedProviders: [], rolesConfirmed: false, dismissed: false };
      }
      return (
        (await store.settings.get(core.SETUP_STATE_SETTING_KEY, core.SetupStateSchema)) ??
        core.DEFAULT_SETUP_STATE ??
        { validatedProviders: [], rolesConfirmed: false, dismissed: false }
      );
    },

    async setSetupState(state) {
      if (!core.SETUP_STATE_SETTING_KEY || !core.SetupStateSchema) return;
      await store.settings.set(core.SETUP_STATE_SETTING_KEY, core.SetupStateSchema, state);
    },

    // ── Licensing / trial ──────────────────────────────────────────────────────────────────────
    async evaluateLicense() {
      return core.evaluateCachedLicense(store);
    },

    async validateLicense(key) {
      return core.validateLicenseKey(key, { store });
    },

    async clearLicense() {
      await core.clearLicense(store);
    },

    async peekTrial() {
      return core.peekTrial(store);
    },

    async resolveEntitlement() {
      const license = await core.evaluateCachedLicense(store);
      return core.resolveEntitlement(license, store);
    },

    // ── Personas / lorebook ──────────────────────────────────────────────────────────────────
    async listPersonas() {
      return store.personas.list();
    },

    async savePersona(persona) {
      // upsert: personas.update throws on a missing row, so branch on existence. setDefault (when
      // requested) clears the flag on the others, mirroring the stub's single-default invariant.
      const existing = await store.personas.get(persona.id);
      if (existing) await store.personas.update(persona);
      else await store.personas.insert(persona);
      if (persona.isDefault) await store.personas.setDefault(persona.id);
    },

    async deletePersona(id) {
      await store.personas.delete(id);
    },

    async listLorebook(storyId) {
      const bookId = await defaultLorebookId(storyId, false);
      if (!bookId) return [];
      return store.lorebook.listEntries(bookId);
    },

    async saveLorebookEntry(storyId, entry) {
      const bookId = await defaultLorebookId(storyId, true);
      const record = { ...entry, lorebookId: bookId };
      const existing = await store.lorebook.getEntry(record.id);
      if (existing) await store.lorebook.updateEntry(record);
      else {
        record.insertionOrder = await store.lorebook.nextInsertionOrder(bookId);
        await store.lorebook.insertEntry(record);
      }
    },

    async deleteLorebookEntry(id) {
      await store.lorebook.deleteEntry(id);
    },

    // ── Global lorebook library (v2 §2) ──────────────────────────────────────────────────────────
    async listLorebooks() {
      const books = await store.lorebook.listLorebooks();
      return Promise.all(
        books.map(async (book) => ({
          ...book,
          entryCount: (await store.lorebook.listEntries(book.id)).length,
          attachmentCount: await store.lorebook.attachmentCount(book.id),
        }))
      );
    },

    async createLorebook(name, description) {
      const book = {
        id: crypto.randomUUID(),
        name,
        description: description ?? "",
        createdAt: Date.now(),
        source: "user" as const,
      };
      await store.lorebook.createLorebook(book);
      return book;
    },

    async renameLorebook(id, name, description) {
      await store.lorebook.renameLorebook(id, name, description);
    },

    async deleteLorebook(id) {
      await store.lorebook.deleteLorebook(id);
    },

    async listLorebookEntries(lorebookId) {
      return store.lorebook.listEntries(lorebookId);
    },

    async saveLorebookEntryIn(lorebookId, entry) {
      const record = { ...entry, lorebookId };
      const existing = await store.lorebook.getEntry(record.id);
      if (existing) await store.lorebook.updateEntry(record);
      else {
        record.insertionOrder = await store.lorebook.nextInsertionOrder(lorebookId);
        await store.lorebook.insertEntry(record);
      }
    },

    async listAttachedLorebooks(storyId) {
      return store.lorebook.listAttached(storyId);
    },

    async attachLorebook(storyId, lorebookId) {
      await store.lorebook.attach(storyId, lorebookId);
    },

    async detachLorebook(storyId, lorebookId) {
      await store.lorebook.detach(storyId, lorebookId);
    },

    async setLorebookAttachedEnabled(storyId, lorebookId, enabled) {
      await store.lorebook.setAttachedEnabled(storyId, lorebookId, enabled);
    },

    // ── Persona attach (v2 §4) ───────────────────────────────────────────────────────────────────
    async getActivePersona(storyId) {
      return store.personas.getActivePersona(storyId);
    },

    async setActivePersona(storyId, personaId) {
      await store.personas.setActiveForStory(storyId, personaId);
    },

    // ── Model recommendations (v2 §1/§5) ─────────────────────────────────────────────────────────
    modelsForRole(role, provider, availableIds) {
      return core.modelsForRole(role, provider, availableIds);
    },

    defaultAssignmentFor(role) {
      return core.defaultAssignmentFor(role);
    },

    modelRecommendationConfig() {
      return {
        version: core.MODEL_RECOMMENDATION_CONFIG_VERSION,
        samplerPresets: structuredClone(core.SAMPLER_PRESETS),
        defaultPresetForRole: { ...core.DEFAULT_PRESET_FOR_ROLE },
        providerSamplerSupport: Object.fromEntries(
          Object.entries(core.SUPPORTED_SAMPLERS).map(([provider, fields]) => [
            provider,
            [...(fields ?? [])],
          ])
        ),
      };
    },

    recommendedSamplerProfile(role, modelId) {
      return { ...core.samplerProfileFor(role, modelId) };
    },

    providerSupportsSampler(provider, field) {
      return core.providerSupportsSampler(provider, field);
    },

    // ── Importer ───────────────────────────────────────────────────────────────────────────────
    async importCardFromBytes(bytes): Promise<CardImportResult> {
      // PNG (embedded tEXt chunk) vs JSON: sniff the 8-byte PNG signature, else parse as JSON.
      const isPng =
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47;
      const card = isPng ? core.parsePngCard(bytes) : core.parseJsonCardBytes(bytes);
      return { card, mapped: core.mapCardToImport(card), spec: `Card format ${card.spec} ${card.specVersion}` };
    },

    async importCardFromUrl(url, signal): Promise<CardImportResult> {
      const card = await core.importCardFromUrl(url, signal ? { signal } : {});
      return { card, mapped: core.mapCardToImport(card), spec: `Card format ${card.spec} ${card.specVersion}` };
    },
  };
}
