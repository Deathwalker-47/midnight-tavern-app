/**
 * settingsStore — providers (+ per-key validation state), the role→model matrix, and the
 * license/trial standing that gates story creation and generation. Talks only to the bridge.
 *
 * The `keyStates` map holds each provider's live KeyField state (idle → validating → valid /
 * rejected) so the Settings/Wizard ProviderCards render the four states directly.
 */
import { create } from "zustand";
import { getBridge } from "../bridge/core.js";
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
} from "../bridge/core.js";

/** A provider key's UI state, including the idle (untested) case the store starts in. */
export type KeyState = { state: "idle" } | KeyValidation;

interface SettingsState {
  providerConfigs: ProviderConfigs;
  keyStates: Partial<Record<ProviderId, KeyState>>;
  roleMap?: RoleMap;
  knownModels: KnownModel[];
  providerIds: readonly ProviderId[];

  license: LicenseState;
  trial?: TrialStatus;
  entitlement?: Entitlement;

  loaded: boolean;

  /** Load providers, role map, catalog, and license/trial standing. */
  load: () => Promise<void>;
  setProviderConfig: (provider: ProviderId, config: ProviderConfigInput) => Promise<void>;
  removeProviderConfig: (provider: ProviderId) => Promise<void>;
  validateKey: (provider: ProviderId, apiKey: string, baseUrl?: string, signal?: AbortSignal) => Promise<void>;
  setRoleMap: (map: RoleMap) => Promise<void>;

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
  license: { status: "unlicensed" },
  trial: undefined,
  entitlement: undefined,
  loaded: false,

  load: async () => {
    const bridge = getBridge();
    const [providerConfigs, roleMap, license, trial, entitlement] = await Promise.all([
      bridge.getProviderConfigs(),
      bridge.getRoleMap(),
      bridge.evaluateLicense(),
      bridge.peekTrial(),
      bridge.resolveEntitlement(),
    ]);
    set({
      providerConfigs,
      roleMap,
      knownModels: bridge.knownModels(),
      providerIds: bridge.providerIds(),
      license,
      trial,
      entitlement,
      loaded: true,
    });
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
      return { providerConfigs: next, keyStates };
    });
  },

  validateKey: async (provider, apiKey, baseUrl, signal) => {
    set((s) => ({ keyStates: { ...s.keyStates, [provider]: { state: "validating" } } }));
    const result = await getBridge().validateProviderKey(provider, apiKey, baseUrl, signal);
    set((s) => ({ keyStates: { ...s.keyStates, [provider]: result } }));
  },

  setRoleMap: async (map) => {
    await getBridge().setRoleMap(map);
    set({ roleMap: map });
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
