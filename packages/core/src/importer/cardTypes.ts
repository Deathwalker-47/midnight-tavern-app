/**
 * Character-card payload schema (low-level-plan §M9).
 *
 * The Character Card V2/V3 spec wraps card fields in `{ spec, spec_version, data: {...} }`.
 * We validate the `data` object leniently — real cards in the wild omit or mistype fields —
 * so parsing tolerates junk while `mapToSchema` only reads the handful of fields we map. A
 * malformed `character_book.entries` entry is dropped rather than failing the whole import.
 *
 * This schema deliberately captures ONLY narrative/presentation fields. Nothing here can
 * carry mechanics: the card seeds the bootstrapper's premise and the soft/lorebook layers,
 * and the bootstrapper alone produces the mechanical StorySchema (the wall, §M9.4).
 */
import { z } from "zod";

/** One character-book (lorebook) entry as stored on a card. */
export const CardBookEntrySchema = z
  .object({
    keys: z.array(z.string()).default([]),
    content: z.string().default(""),
    enabled: z.boolean().default(true),
  })
  .passthrough();
export type CardBookEntry = z.infer<typeof CardBookEntrySchema>;

/** A character book (embedded lorebook) on a card. */
export const CardBookSchema = z
  .object({
    entries: z.array(CardBookEntrySchema).catch([]).default([]),
  })
  .passthrough();

/** The `data` object of a V2/V3 card (all fields optional; unknown keys preserved). */
export const CardDataSchema = z
  .object({
    name: z.string().default(""),
    description: z.string().default(""),
    personality: z.string().default(""),
    scenario: z.string().default(""),
    first_mes: z.string().default(""),
    mes_example: z.string().default(""),
    creator_notes: z.string().optional(),
    system_prompt: z.string().optional(),
    tags: z.array(z.string()).catch([]).default([]),
    creator: z.string().optional(),
    character_version: z.string().optional(),
    alternate_greetings: z.array(z.string()).catch([]).default([]),
    character_book: CardBookSchema.optional(),
  })
  .passthrough();
export type CardData = z.infer<typeof CardDataSchema>;

/** Recognized card spec versions. */
export const CardSpecSchema = z.enum(["chara_card_v2", "chara_card_v3"]);
export type CardSpec = z.infer<typeof CardSpecSchema>;

/** A parsed, validated character card. */
export interface CharacterCard {
  spec: CardSpec;
  specVersion: string;
  data: CardData;
}

/** Raised when a payload isn't a recognizable V2/V3 character card. */
export class CardParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CardParseError";
  }
}

/**
 * Validate an already-parsed JSON value as a character card. Accepts the canonical
 * `{ spec, spec_version, data }` envelope; also accepts a bare `data`-shaped object from
 * older exporters, defaulting it to the V2 spec.
 */
export function parseCardObject(value: unknown): CharacterCard {
  if (value === null || typeof value !== "object") {
    throw new CardParseError("Card payload is not a JSON object.");
  }
  const obj = value as Record<string, unknown>;

  // Canonical envelope.
  const specResult = CardSpecSchema.safeParse(obj.spec);
  if (specResult.success) {
    const data = CardDataSchema.parse(obj.data ?? {});
    return {
      spec: specResult.data,
      specVersion: typeof obj.spec_version === "string" ? obj.spec_version : "2.0",
      data,
    };
  }

  // Bare card (no envelope): accept if it has the shape of card data.
  if ("name" in obj || "first_mes" in obj || "description" in obj) {
    return { spec: "chara_card_v2", specVersion: "2.0", data: CardDataSchema.parse(obj) };
  }

  throw new CardParseError(
    'Unrecognized card format: expected spec "chara_card_v2" or "chara_card_v3".'
  );
}
