import rawConfig from "./model-recommendations.config.json";

/**
 * Single shipped source for model recommendations, default role bindings, sampler
 * parameters, presets, and provider capability masks.
 *
 * The JSON file is intentionally data-only and versioned so recommendations can be
 * refreshed without editing routing logic.
 */
export const MODEL_RECOMMENDATION_CONFIG = rawConfig;
export const MODEL_RECOMMENDATION_CONFIG_VERSION = rawConfig.configVersion;
