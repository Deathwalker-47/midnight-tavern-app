import { z } from "zod";
import { ProviderIdSchema } from "./roles.js";

/** Persisted progress for the provider and model-role setup flow. */
export const SetupStateSchema = z.object({
  validatedProviders: z.array(ProviderIdSchema).default([]),
  rolesConfirmed: z.boolean().default(false),
  dismissed: z.boolean().default(false),
});

export type SetupState = z.infer<typeof SetupStateSchema>;

export const DEFAULT_SETUP_STATE: SetupState = {
  validatedProviders: [],
  rolesConfirmed: false,
  dismissed: false,
};

export const SETUP_STATE_SETTING_KEY = "onboarding.setup.v1";

/** Setup is complete only after a working provider and an explicit role-map confirmation. */
export function isSetupComplete(state: SetupState): boolean {
  return state.validatedProviders.length > 0 && state.rolesConfirmed;
}
