/**
 * Column codecs shared by every repository. The single place that turns validated
 * domain objects into storable primitives and back — so JSON columns always round-trip
 * through their Zod schema and booleans always map to SQLite's 0/1 integers.
 */
import type { ZodType } from "zod";

/** Encode a value as a JSON column string after validating it against `schema`. */
export function encodeJson<T>(schema: ZodType<T>, value: T): string {
  return JSON.stringify(schema.parse(value));
}

/**
 * Decode a JSON column string and validate it against `schema`. Throws (via Zod) if the
 * stored payload has drifted from the current shape — we never hand back an unvalidated row.
 */
export function decodeJson<T>(schema: ZodType<T>, text: string): T {
  return schema.parse(JSON.parse(text));
}

/** SQLite has no boolean type: store as 0/1. */
export const toInt = (b: boolean): number => (b ? 1 : 0);
export const toBool = (n: number): boolean => n !== 0;
