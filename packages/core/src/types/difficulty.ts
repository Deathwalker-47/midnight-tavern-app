import { z } from "zod";

export const DifficultyPresetSchema = z.enum(["story", "standard", "hard", "brutal", "custom"]);
export type DifficultyPreset = z.infer<typeof DifficultyPresetSchema>;

export const DIFFICULTY_DC_OFFSET_MIN = -4;
export const DIFFICULTY_DC_OFFSET_MAX = 4;
export const DIFFICULTY_MULTIPLIER_MIN = 0.25;
export const DIFFICULTY_MULTIPLIER_MAX = 2.5;

export const DifficultyConfigSchema = z.object({
  preset: DifficultyPresetSchema,
  dcOffset: z.number().min(DIFFICULTY_DC_OFFSET_MIN).max(DIFFICULTY_DC_OFFSET_MAX),
  damageTakenMultiplier: z
    .number()
    .min(DIFFICULTY_MULTIPLIER_MIN)
    .max(DIFFICULTY_MULTIPLIER_MAX),
  damageDealtMultiplier: z
    .number()
    .min(DIFFICULTY_MULTIPLIER_MIN)
    .max(DIFFICULTY_MULTIPLIER_MAX),
});
export type DifficultyConfig = z.infer<typeof DifficultyConfigSchema>;

export const DIFFICULTY_PRESETS: Readonly<
  Record<Exclude<DifficultyPreset, "custom">, Omit<DifficultyConfig, "preset">>
> = Object.freeze({
  story: Object.freeze({
    dcOffset: -2,
    damageTakenMultiplier: 0.6,
    damageDealtMultiplier: 1.25,
  }),
  standard: Object.freeze({
    dcOffset: 0,
    damageTakenMultiplier: 1,
    damageDealtMultiplier: 1,
  }),
  hard: Object.freeze({
    dcOffset: 2,
    damageTakenMultiplier: 1.3,
    damageDealtMultiplier: 0.9,
  }),
  brutal: Object.freeze({
    dcOffset: 4,
    damageTakenMultiplier: 1.6,
    damageDealtMultiplier: 0.8,
  }),
});

export const STANDARD_DIFFICULTY: DifficultyConfig = Object.freeze({
  preset: "standard",
  ...DIFFICULTY_PRESETS.standard,
});

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Normalize player-provided difficulty values. Named presets always use the
 * canonical values; only `custom` consumes and clamps supplied fields.
 *
 * @param value - Persisted or player-provided values; null selects Standard.
 * @returns A complete, bounded configuration safe for deterministic resolution.
 *
 * @remarks Named presets ignore custom numeric fields so their behavior cannot drift.
 * @see {@link DifficultyConfigSchema} for the persisted validation contract.
 * @since 0.1.0
 */
export function normalizeDifficultyConfig(
  value: Partial<DifficultyConfig> | null | undefined
): DifficultyConfig {
  const preset = value?.preset ?? "standard";
  if (preset !== "custom") {
    const canonical = DIFFICULTY_PRESETS[preset];
    return { preset, ...canonical };
  }
  const custom = value ?? {};
  return {
    preset,
    dcOffset: clamp(
      Math.round(custom.dcOffset ?? 0),
      DIFFICULTY_DC_OFFSET_MIN,
      DIFFICULTY_DC_OFFSET_MAX
    ),
    damageTakenMultiplier: clamp(
      custom.damageTakenMultiplier ?? 1,
      DIFFICULTY_MULTIPLIER_MIN,
      DIFFICULTY_MULTIPLIER_MAX
    ),
    damageDealtMultiplier: clamp(
      custom.damageDealtMultiplier ?? 1,
      DIFFICULTY_MULTIPLIER_MIN,
      DIFFICULTY_MULTIPLIER_MAX
    ),
  };
}

// Immutable difficulty values copied onto each ruling when it is computed.
export const DifficultySnapshotSchema = DifficultyConfigSchema.readonly();
export type DifficultySnapshot = z.infer<typeof DifficultySnapshotSchema>;

/**
 * Scales one resource delta while preserving healing and a connected hit's minimum bite.
 *
 * @param baseDelta - Unscaled effect delta; negative values represent damage.
 * @param multiplier - Frozen difficulty multiplier for the recipient.
 * @returns The deterministically rounded delta committed by the ledger.
 *
 * @remarks Positive and zero deltas are returned unchanged.
 * @see {@link normalizeDifficultyConfig} for multiplier bounds.
 * @since 0.1.0
 */
export function scaleDamageDelta(baseDelta: number, multiplier: number): number {
  if (baseDelta >= 0) return baseDelta;
  const scaled = Math.round(baseDelta * multiplier);
  return scaled === 0 ? -1 : scaled;
}
