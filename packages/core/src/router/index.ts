/**
 * Router barrel (low-level-plan §M3).
 *
 * The single import surface for all LLM traffic: provider registry, role map, the router
 * itself, and the structured-call layer. Nothing outside `router/` imports a provider
 * adapter directly.
 */
export * from "./providers/types.js";
export { makeOpenAiCompatProvider, ProviderHttpError, type ProviderSpec } from "./providers/openaiCompat.js";
export {
  PROVIDER_IDS,
  PROVIDER_SPECS,
  isProviderId,
  makeProvider,
  type ProviderId,
} from "./providers/registry.js";
export {
  ROLES,
  RoleSchema,
  ProviderIdSchema,
  SamplersSchema,
  RoleBindingSchema,
  RoleBindingSourceSchema,
  RoleMapSchema,
  ROLE_MAP_SETTING_KEY,
  ROLE_LABELS,
  KNOWN_MODELS,
  DEFAULT_ROLE_MAP,
  type Role,
  type Samplers,
  type RoleBinding,
  type RoleBindingSource,
  type RoleMap,
  type KnownModel,
} from "./roles.js";
export {
  SamplerProfileSchema,
  SAMPLER_PRESETS,
  DEFAULT_SAMPLER_PROFILES,
  DEFAULT_PRESET_FOR_ROLE,
  SUPPORTED_SAMPLERS,
  providerSupportsSampler,
  pruneUnsupported,
  matchPreset,
  type SamplerProfile,
  type PresetName,
} from "./samplers.js";
export {
  MODEL_RECOMMENDATION_CONFIG,
  MODEL_RECOMMENDATION_CONFIG_VERSION,
} from "./modelConfig.js";
export {
  CatalogModelSchema,
  MODEL_CATALOG,
  allCatalogModels,
  catalogModel,
  catalogModelsForProvider,
  isJsonRisk,
  type CatalogModel,
} from "./modelCatalog.js";
export {
  modelsForRole,
  defaultAssignmentFor,
  samplerProfileFor,
  type RankedModel,
} from "./recommend.js";
export {
  SetupStateSchema,
  DEFAULT_SETUP_STATE,
  SETUP_STATE_SETTING_KEY,
  isSetupComplete,
  type SetupState,
} from "./setup.js";
export {
  makeRouter,
  MissingCredentialsError,
  ProviderTimeoutError,
  ProviderConfigSchema,
  ProviderConfigsSchema,
  PROVIDER_CONFIGS_SETTING_KEY,
  type Router,
  type RouterDeps,
  type RolePrompt,
  type ProviderConfigs,
} from "./router.js";
export {
  NOOP_DIAGNOSTIC_LOGGER,
  type DiagnosticData,
  type DiagnosticLogger,
} from "../observability/logger.js";
export {
  callStructured,
  extractJson,
  ModelOutputError,
  type StructuredOptions,
} from "./structured.js";
