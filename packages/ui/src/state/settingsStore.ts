/**
 * settingsStore — providers (+ per-key validation state), the role→model matrix, and the
 * license/trial standing that gates story creation and generation. Talks only to the bridge.
 *
 * The `keyStates` map holds each provider's live KeyField state (idle → validating → valid /
 * rejected) so the Settings/Wizard ProviderCards render the four states directly.
 */
import { create } from "zustand";
import { getBridge } from "../bridge/core.js";
import { diagnosticError, diagnosticsLogger } from "../observability/logger.js";
import type {
  ProviderConfigs,
  ProviderId,
  RoleMap,
  KnownModel,
  KeyValidation,
  LicenseState,
  Entitlement,
  TrialStatus,
  ProviderConfigInput,
  ProviderModel,
  RankedModel,
  Role,
  SetupState,
} from "../bridge/core.js";

/** A provider key's UI state, including the idle (untested) case the store starts in. */
export type KeyState = { state: "idle" } | KeyValidation;
export type ModelListState =
  | { state: "idle" }
  | { state: "loading" }
  | { state: "ready" }
  | { state: "error"; reason: string };

const EMPTY_SETUP: SetupState = { validatedProviders: [], rolesConfirmed: false, dismissed: false };
const ROLE_IDS: readonly Role[] = ["narrator", "classifier", "analyzer", "summarizer", "bootstrapper"];

/** A role binding that cannot currently be used for a provider request. */
export type RoleConfigurationIssue = {
  role: Role;
  reason: "missing-provider" | "missing-model";
};

/** Return role bindings that reference missing credentials or a missing live model. */
export function roleConfigurationIssues(
  roleMap: RoleMap | undefined,
  providerConfigs: ProviderConfigs,
  providerModels: Partial<Record<ProviderId, ProviderModel[]>>,
  modelStates: Partial<Record<ProviderId, ModelListState>>
): RoleConfigurationIssue[] {
  if (!roleMap) return ROLE_IDS.map((role) => ({ role, reason: "missing-provider" }));
  return ROLE_IDS.flatMap((role): RoleConfigurationIssue[] => {
    const binding = roleMap[role];
    if (!providerConfigs[binding.provider]?.apiKey) return [{ role, reason: "missing-provider" }];
    const live = providerModels[binding.provider];
    if (
      modelStates[binding.provider]?.state === "ready" &&
      live &&
      live.length > 0 &&
      !live.some((model) => model.id === binding.model)
    ) {
      return [{ role, reason: "missing-model" }];
    }
    return [];
  });
}

export function setupIsComplete(state: SetupState): boolean {
  return state.validatedProviders.length > 0;
}

/** No Stats needs only a working Narrator; Full Stats also needs the supporting role matrix. */
export function setupSupportsStatMode(state: SetupState, mode: "none" | "full" | undefined): boolean {
  return setupIsComplete(state) && (mode !== "full" || state.rolesConfirmed);
}

interface SettingsState {
  providerConfigs: ProviderConfigs;
  keyStates: Partial<Record<ProviderId, KeyState>>;
  roleMap?: RoleMap;
  knownModels: KnownModel[];
  providerIds: readonly ProviderId[];
  providerModels: Partial<Record<ProviderId, ProviderModel[]>>;
  modelStates: Partial<Record<ProviderId, ModelListState>>;
  setupState: SetupState;

  license: LicenseState;
  trial?: TrialStatus;
  entitlement?: Entitlement;

  loaded: boolean;

  /** Load providers, role map, catalog, and license/trial standing. */
  load: () => Promise<void>;
  setProviderConfig: (provider: ProviderId, config: ProviderConfigInput) => Promise<void>;
  removeProviderConfig: (provider: ProviderId) => Promise<void>;
  validateKey: (provider: ProviderId, apiKey: string, baseUrl?: string, signal?: AbortSignal) => Promise<KeyValidation>;
  refreshModels: (provider: ProviderId, config?: ProviderConfigInput, signal?: AbortSignal) => Promise<void>;
  modelsForRole: (role: Role, provider: ProviderId) => RankedModel[];
  setRoleMap: (map: RoleMap) => Promise<void>;
  repairInvalidRoleBindings: (preferredProvider?: ProviderId) => Promise<Role[]>;
  confirmRoles: () => Promise<void>;
  dismissSetup: () => Promise<void>;

  validateLicense: (key: string) => Promise<LicenseState>;
  clearLicense: () => Promise<void>;
  refreshEntitlement: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  providerConfigs: {},
  keyStates: {},
  roleMap: undefined,
  knownModels: [],
  providerIds: [],
  providerModels: {},
  modelStates: {},
  setupState: EMPTY_SETUP,
  license: { status: "unlicensed" },
  trial: undefined,
  entitlement: undefined,
  loaded: false,

  load: async () => {
    const startedAt = Date.now();
    diagnosticsLogger.info("settings.load.started");
    try {
      const bridge = getBridge();
      const [providerConfigs, roleMap, setupState, license, trial, entitlement] = await Promise.all([
        bridge.getProviderConfigs(),
        bridge.getRoleMap(),
        bridge.getSetupState(),
        bridge.evaluateLicense(),
        bridge.peekTrial(),
        bridge.resolveEntitlement(),
      ]);
      set({
        providerConfigs,
        roleMap,
        knownModels: bridge.knownModels(),
        providerIds: bridge.providerIds(),
        setupState,
        license,
        trial,
        entitlement,
      });
      const configured = (Object.entries(providerConfigs) as [ProviderId, ProviderConfigInput][])
        .filter((entry): entry is [ProviderId, ProviderConfigInput] => Boolean(entry[1]?.apiKey));
      await Promise.all(configured.map(([provider, config]) => get().refreshModels(provider, config)));
      const repairedRoles = await get().repairInvalidRoleBindings();
      const current = get();
      const remainingIssues = roleConfigurationIssues(
        current.roleMap,
        current.providerConfigs,
        current.providerModels,
        current.modelStates
      );
      let effectiveSetupState = setupState;
      if (remainingIssues.length > 0 && setupState.rolesConfirmed) {
        effectiveSetupState = { ...setupState, rolesConfirmed: false };
        await bridge.setSetupState(effectiveSetupState);
        set({ setupState: effectiveSetupState });
        diagnosticsLogger.warn("roles.confirmation.invalidated", { issues: remainingIssues });
      }
      set({ loaded: true });
      diagnosticsLogger.info("settings.load.completed", {
        durationMs: Date.now() - startedAt,
        configuredProviderCount: configured.length,
        setupComplete: setupIsComplete(effectiveSetupState),
        repairedRoleCount: repairedRoles.length,
      });
    } catch (error) {
      diagnosticsLogger.error("settings.load.failed", {
        durationMs: Date.now() - startedAt,
        error: diagnosticError(error),
      });
      throw error;
    }
  },

  setProviderConfig: async (provider, config) => {
    await getBridge().setProviderConfig(provider, config);
    set((s) => ({ providerConfigs: { ...s.providerConfigs, [provider]: config } }));
  },

  removeProviderConfig: async (provider) => {
    await getBridge().removeProviderConfig(provider);
    set((s) => {
      const next = { ...s.providerConfigs };
      delete next[provider];
      const keyStates = { ...s.keyStates };
      delete keyStates[provider];
      const providerModels = { ...s.providerModels };
      delete providerModels[provider];
      const modelStates = { ...s.modelStates };
      delete modelStates[provider];
      const validatedProviders = s.setupState.validatedProviders.filter((id) => id !== provider);
      return {
        providerConfigs: next,
        keyStates,
        providerModels,
        modelStates,
        setupState: {
          ...s.setupState,
          validatedProviders,
          rolesConfirmed: validatedProviders.length > 0 && s.setupState.rolesConfirmed,
        },
      };
    });
    await get().repairInvalidRoleBindings();
  },

  validateKey: async (provider, apiKey, baseUrl, signal) => {
    const startedAt = Date.now();
    diagnosticsLogger.info("provider.validation.started", {
      provider,
      customEndpoint: provider === "custom",
    });
    set((s) => ({ keyStates: { ...s.keyStates, [provider]: { state: "validating" } } }));
    let result: KeyValidation;
    try {
      result = await getBridge().validateProviderKey(provider, apiKey, baseUrl, signal);
    } catch (error) {
      diagnosticsLogger.error("provider.validation.failed", {
        provider,
        durationMs: Date.now() - startedAt,
        error: diagnosticError(error),
      });
      throw error;
    }
    set((s) => ({ keyStates: { ...s.keyStates, [provider]: result } }));
    diagnosticsLogger.info("provider.validation.completed", {
      provider,
      durationMs: Date.now() - startedAt,
      accepted: result.state === "valid",
    });
    if (result.state === "valid") {
      const config = { apiKey, ...(baseUrl?.trim() ? { baseUrl: baseUrl.trim() } : {}) };
      await get().setProviderConfig(provider, config);
      const current = get().setupState;
      const next: SetupState = {
        ...current,
        dismissed: false,
        validatedProviders: current.validatedProviders.includes(provider)
          ? current.validatedProviders
          : [...current.validatedProviders, provider],
      };
      await getBridge().setSetupState(next);
      set({ setupState: next });
      await get().refreshModels(provider, config, signal);
      await get().repairInvalidRoleBindings(provider);
    }
    return result;
  },

  refreshModels: async (provider, config, signal) => {
    const selected = config ?? get().providerConfigs[provider];
    if (!selected?.apiKey) return;
    set((s) => ({ modelStates: { ...s.modelStates, [provider]: { state: "loading" } } }));
    const startedAt = Date.now();
    diagnosticsLogger.info("provider.models.started", { provider });
    try {
      const models = await getBridge().listProviderModels(
        provider,
        selected.apiKey,
        selected.baseUrl,
        signal
      );
      set((s) => ({
        providerModels: { ...s.providerModels, [provider]: models },
        modelStates: { ...s.modelStates, [provider]: { state: "ready" } },
      }));
      diagnosticsLogger.info("provider.models.completed", {
        provider,
        durationMs: Date.now() - startedAt,
        modelCount: models.length,
      });
    } catch (err) {
      set((s) => ({
        modelStates: {
          ...s.modelStates,
          [provider]: {
            state: "error",
            reason: err instanceof Error ? err.message : "Couldn't load models.",
          },
        },
      }));
      diagnosticsLogger.error("provider.models.failed", {
        provider,
        durationMs: Date.now() - startedAt,
        error: diagnosticError(err),
      });
    }
  },

  modelsForRole: (role, provider) => {
    const live = get().providerModels[provider];
    return getBridge().modelsForRole(role, provider, live?.map((model) => model.id));
  },

  setRoleMap: async (map) => {
    const bridge = getBridge();
    await bridge.setRoleMap(map);
    set({ roleMap: await bridge.getRoleMap() });
    diagnosticsLogger.info("roles.updated");
  },

  repairInvalidRoleBindings: async (preferredProvider) => {
    const state = get();
    if (!state.roleMap) return [];
    const configured = state.providerIds.filter((id) => Boolean(state.providerConfigs[id]?.apiKey));
    const fallback = preferredProvider && configured.includes(preferredProvider)
      ? preferredProvider
      : configured[0];
    if (!fallback) return [];

    const next: RoleMap = { ...state.roleMap };
    const repairedRoles: Role[] = [];
    for (const role of ROLE_IDS) {
      const current = next[role];
      const providerMissing = !state.providerConfigs[current.provider]?.apiKey;
      const liveModels = state.providerModels[current.provider];
      const appManagedModelUnavailable =
        !providerMissing &&
        current.source !== "custom" &&
        state.modelStates[current.provider]?.state === "ready" &&
        Boolean(liveModels?.length) &&
        !liveModels!.some((model) => model.id === current.model);
      if (!providerMissing && !appManagedModelUnavailable) continue;

      const replacementProvider = providerMissing ? fallback : current.provider;
      const replacement = get().modelsForRole(role, replacementProvider)[0];
      if (!replacement) continue;
      next[role] = {
        ...current,
        provider: replacementProvider,
        model: replacement.id,
        // This repair is app-owned even when the live aggregator model has no catalog entry.
        // Explicit custom models on a still-connected provider are deliberately left untouched.
        source: "recommended",
      };
      repairedRoles.push(role);
    }
    if (repairedRoles.length === 0) return repairedRoles;
    await get().setRoleMap(next);
    diagnosticsLogger.info("roles.repaired", { provider: fallback, roles: repairedRoles });
    return repairedRoles;
  },

  confirmRoles: async () => {
    const state = get();
    const issues = roleConfigurationIssues(
      state.roleMap,
      state.providerConfigs,
      state.providerModels,
      state.modelStates
    );
    if (issues.length > 0) {
      diagnosticsLogger.warn("roles.confirmation.rejected", { issues });
      throw new Error("Every role must use a configured provider and a model from its live inventory.");
    }
    const next = { ...get().setupState, rolesConfirmed: true, dismissed: false };
    await getBridge().setSetupState(next);
    set({ setupState: next });
    diagnosticsLogger.info("roles.confirmed", { validatedProviderCount: next.validatedProviders.length });
  },

  dismissSetup: async () => {
    const next = { ...get().setupState, dismissed: true };
    await getBridge().setSetupState(next);
    set({ setupState: next });
  },

  validateLicense: async (key) => {
    const license = await getBridge().validateLicense(key);
    set({ license });
    await get().refreshEntitlement();
    return license;
  },

  clearLicense: async () => {
    await getBridge().clearLicense();
    set({ license: { status: "unlicensed" } });
    await get().refreshEntitlement();
  },

  refreshEntitlement: async () => {
    const bridge = getBridge();
    const [entitlement, trial] = await Promise.all([bridge.resolveEntitlement(), bridge.peekTrial()]);
    set({ entitlement, trial });
  },
}));
