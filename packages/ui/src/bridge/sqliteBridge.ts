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
import type { Store } from "@midnight-tavern/core";
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
} from "./core.js";

/**
 * Build the real bridge over an already-opened, migrated {@link Store}. `core` is the live core
 * module namespace (passed in so this file never re-imports it — core.ts owns the single dynamic
 * import). Returns a fully-wired {@link CoreBridge}.
 */
export function buildSqliteBridge(
  store: Store,
  core: typeof import("@midnight-tavern/core")
): CoreBridge {
  // Router deps come from stored settings. We rebuild the router per operation that needs it
  // (createStory / submitTurn / validateProviderKey) rather than caching, so a settings change
  // mid-session is picked up without a bridge reload. Reads are cheap (two settings rows).
  async function currentRouter() {
    const providerConfigs =
      (await store.settings.get(core.PROVIDER_CONFIGS_SETTING_KEY, core.ProviderConfigsSchema)) ?? {};
    const roleMap =
      (await store.settings.get(core.ROLE_MAP_SETTING_KEY, core.RoleMapSchema)) ?? core.DEFAULT_ROLE_MAP;
    return core.makeRouter({ providerConfigs, roleMap });
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
        }))
      );
      return summaries.sort((a, b) => b.createdAt - a.createdAt);
    },

    async getStory(id) {
      return store.stories.get(id);
    },

    async createStory(args: CreateStoryArgs): Promise<CreateStoryResult> {
      // core's bootstrapStory exposes no per-phase progress hook; the interstitial's phase copy is
      // driven coarsely here — "phase-a" before the generate+freeze call, the remaining phases once
      // it resolves. If finer progress is wanted later, bootstrapStory must expose an onPhase cb.
      args.onProgress?.("phase-a");
      const router = await currentRouter();
      const storyId = args.storyId ?? crypto.randomUUID();
      const result = await core.bootstrapStory(
        router,
        store,
        { storyId, title: args.title, premise: args.premise },
        { name: args.playerName },
        args.signal ? { signal: args.signal } : {}
      );
      args.onProgress?.("phase-b");
      args.onProgress?.("validate");
      args.onProgress?.("freeze");
      args.onProgress?.("install");
      return { story: result.story, playerCharacterId: result.playerCharacterId };
    },

    async renameStory(id, title) {
      const record = await requireStory(id);
      await store.stories.update({ ...record, title });
    },

    async deleteStory(id) {
      await store.stories.delete(id);
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
      const router = await currentRouter();
      const result = await core.submitTurn(router, store, args.storyId, args.playerText, {
        ...(args.onDelta ? { onDelta: args.onDelta } : {}),
        ...(args.personaBlock ? { personaBlock: args.personaBlock } : {}),
        ...(args.signal ? { signal: args.signal } : {}),
      });
      // core resolves `background` (analyzer + summaries) after the prose. We don't block the UI on
      // it, but must not let an unhandled rejection escape — swallow after logging.
      void result.background.catch((err) => {
        console.error("submitTurn background post-processing failed:", err);
      });
      return { prose: result.prose, rulings: result.rulings, narratorIdx: result.narratorIdx };
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
      const router = await currentRouter();
      return core.swipeLastTurn(router, store, args.storyId, {
        ...(args.onDelta ? { onDelta: args.onDelta } : {}),
        ...(args.personaBlock ? { personaBlock: args.personaBlock } : {}),
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

    async listRulings(storyId) {
      const records = await store.rulings.listByStory(storyId);
      return records.map((r) => r.ruling);
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
    },

    async removeProviderConfig(provider) {
      const configs =
        (await store.settings.get(core.PROVIDER_CONFIGS_SETTING_KEY, core.ProviderConfigsSchema)) ?? {};
      delete configs[provider];
      await store.settings.set(core.PROVIDER_CONFIGS_SETTING_KEY, core.ProviderConfigsSchema, configs);
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
      const model = core.KNOWN_MODELS.find((m) => m.provider === provider)?.model;
      if (!model) return { state: "rejected", reason: `No known model for provider ${provider}.` };
      const chatProvider = core.makeProvider(provider);
      try {
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
