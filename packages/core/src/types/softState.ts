/**
 * Soft state (low-level-plan §2.4; high-level-plan §7.3) — observed narrative memory.
 *
 * Sole writer: the memory analyzer (via `softStore.applyPatch`). Persisted as
 * `characters.soft_json` and `world_soft.soft_json`.
 *
 * CRITICAL — "the wall": soft state contains NO mechanical fields (no resources,
 * skills, inventory, or health). The SoftStatePatch contract below can only express
 * narrative operations, so the analyzer physically cannot corrupt hard state.
 */
import { z } from "zod";

/** How deeply a character is tracked. */
export const SoftTierSchema = z.enum(["primary", "secondary"]);
export type SoftTier = z.infer<typeof SoftTierSchema>;

/** A directional relationship from one character toward another. */
export const RelationshipSchema = z.object({
  toCharacterId: z.string(),
  trust: z.number().min(-1).max(1), // clamped to [-1, 1]
  power: z.number().min(-1).max(1), // clamped to [-1, 1]
  feeling: z.string().optional(),
});
export type Relationship = z.infer<typeof RelationshipSchema>;

/** A timestamped observation extracted from prose. */
export const ObservationSchema = z.object({
  turnIdx: z.number().int().nonnegative(),
  text: z.string(),
});
export type Observation = z.infer<typeof ObservationSchema>;

/** A fuzzy "right now" snapshot. */
export const CurrentSnapshotSchema = z.object({
  mood: z.string().optional(),
  location: z.string().optional(),
  goal: z.string().optional(),
});
export type CurrentSnapshot = z.infer<typeof CurrentSnapshotSchema>;

/** Observed identity — everything narrative about who a character is. */
export const SoftIdentitySchema = z.object({
  traits: z.array(z.string()),
  likes: z.array(z.string()),
  dislikes: z.array(z.string()),
  appearance: z.string().optional(),
  speechStyle: z.string().optional(),
  backstory: z.string().optional(),
});
export type SoftIdentity = z.infer<typeof SoftIdentitySchema>;

/** A behavioral pattern with a confidence score. */
export const BehavioralSignatureSchema = z.object({
  pattern: z.string(),
  confidence: z.number().min(0).max(1),
});
export type BehavioralSignature = z.infer<typeof BehavioralSignatureSchema>;

/** A character's complete observed narrative state. NO mechanical fields. */
export const CharacterSoftStateSchema = z.object({
  characterId: z.string(),
  name: z.string(),
  tier: SoftTierSchema,
  identity: SoftIdentitySchema,
  behavioralSignatures: z.array(BehavioralSignatureSchema),
  current: CurrentSnapshotSchema,
  relationships: z.array(RelationshipSchema),
  observations: z.array(ObservationSchema), // capped FIFO (softStore enforces)
});
export type CharacterSoftState = z.infer<typeof CharacterSoftStateSchema>;

/** A named place in the world. */
export const WorldLocationSchema = z.object({
  name: z.string(),
  description: z.string(),
});
export type WorldLocation = z.infer<typeof WorldLocationSchema>;

/** An unresolved narrative thread. */
export const StoryThreadSchema = z.object({
  title: z.string(),
  note: z.string(),
  resolved: z.boolean(),
});
export type StoryThread = z.infer<typeof StoryThreadSchema>;

/** World-level observed state. */
export const WorldSoftStateSchema = z.object({
  overview: z.string(),
  locations: z.array(WorldLocationSchema),
  arcs: z.array(z.string()),
  unresolvedThreads: z.array(StoryThreadSchema),
});
export type WorldSoftState = z.infer<typeof WorldSoftStateSchema>;

/**
 * D5 — the analyzer's output contract. Typed patch-ops the core merges into soft
 * state. This is "the wall": there is no operation that can express a mechanical
 * field, so a well-formed patch can never touch hard state. A test proves that an
 * attempt to smuggle one in fails Zod validation (M7 tests).
 */

/** A per-character narrative op. */
export const CharacterOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("set"),
    path: z.enum(["mood", "location", "goal", "appearance", "speechStyle"]),
    value: z.string(),
  }),
  z.object({
    op: z.literal("append"),
    path: z.enum(["traits", "likes", "dislikes"]),
    value: z.string(),
  }),
  z.object({ op: z.literal("observe"), text: z.string() }),
  z.object({
    op: z.literal("adjust_relationship"),
    toCharacterId: z.string(),
    trustDelta: z.number(),
    powerDelta: z.number(),
    feeling: z.string().optional(),
  }),
]);
export type CharacterOp = z.infer<typeof CharacterOpSchema>;

/** A world-level narrative op. */
export const WorldOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set_overview_hint"), text: z.string() }),
  z.object({ op: z.literal("add_location"), name: z.string(), description: z.string() }),
  z.object({ op: z.literal("add_thread"), title: z.string(), note: z.string() }),
  z.object({ op: z.literal("resolve_thread"), title: z.string() }),
]);
export type WorldOp = z.infer<typeof WorldOpSchema>;

/** The full analyzer output. `.strict()` ensures no extra (mechanical) keys sneak in. */
export const SoftStatePatchSchema = z
  .object({
    characterOps: z.array(
      z
        .object({
          characterId: z.string(), // analyzer may propose NEW secondary characters
          ops: z.array(CharacterOpSchema),
        })
        .strict()
    ),
    worldOps: z.array(WorldOpSchema),
  })
  .strict();
export type SoftStatePatch = z.infer<typeof SoftStatePatchSchema>;
