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
  RoleMapSchema,
  ROLE_MAP_SETTING_KEY,
  KNOWN_MODELS,
  DEFAULT_ROLE_MAP,
  type Role,
  type Samplers,
  type RoleBinding,
  type RoleMap,
  type KnownModel,
} from "./roles.js";
export {
  makeRouter,
  MissingCredentialsError,
  ProviderConfigSchema,
  ProviderConfigsSchema,
  PROVIDER_CONFIGS_SETTING_KEY,
  type Router,
  type RouterDeps,
  type RolePrompt,
  type ProviderConfigs,
} from "./router.js";
export {
  callStructured,
  extractJson,
  ModelOutputError,
  type StructuredOptions,
} from "./structured.js";
