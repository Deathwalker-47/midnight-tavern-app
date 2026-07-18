/**
 * URL card import (low-level-plan §M9.3).
 *
 * Fetch a user-supplied URL and parse whatever card it yields. Plain fetch only — no
 * site-specific scraping in v1. Redirects follow by default (fetch's `redirect: "follow"`).
 * We enforce a 10 MB cap by streaming the body and aborting once the cap is exceeded, so a
 * hostile or mistaken URL can't exhaust memory. Content type picks the parser, with a
 * magic-byte fallback (the PNG signature) when the server mislabels the response.
 */
import { isPng, parsePngCard } from "./pngCard.js";
import { parseJsonCardBytes } from "./jsonCard.js";
import { CardParseError, type CharacterCard } from "./cardTypes.js";

/** Maximum download size for an imported card (§M9.3). */
export const MAX_CARD_BYTES = 10 * 1024 * 1024;

export interface UrlImportOptions {
  signal?: AbortSignal;
  /** Injectable fetch for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
  maxBytes?: number;
}

/** Read a response body into a single Uint8Array, aborting if it exceeds `maxBytes`. */
async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  const body = res.body;
  if (!body) {
    // No stream (e.g., a mock): fall back to arrayBuffer with a post-hoc cap check.
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new CardParseError(`Card exceeds ${maxBytes}-byte limit.`);
    return buf;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel();
        throw new CardParseError(`Card exceeds ${maxBytes}-byte limit.`);
      }
      chunks.push(value);
    }
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/**
 * Fetch and parse a character card from a URL. Chooses the PNG or JSON parser by content
 * type, falling back to the PNG magic bytes, then to JSON. Throws `CardParseError` on a
 * non-OK response, an oversized body, or an unrecognizable payload.
 */
export async function importCardFromUrl(
  url: string,
  opts: UrlImportOptions = {}
): Promise<CharacterCard> {
  const doFetch = opts.fetchImpl ?? fetch;
  const maxBytes = opts.maxBytes ?? MAX_CARD_BYTES;

  let res: Response;
  try {
    res = await doFetch(url, { redirect: "follow", signal: opts.signal });
  } catch (err) {
    throw new CardParseError(`Failed to fetch card URL: ${(err as Error).message}`);
  }
  if (!res.ok) throw new CardParseError(`Card URL returned HTTP ${res.status}.`);

  const bytes = await readCapped(res, maxBytes);
  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();

  if (contentType.includes("png") || isPng(bytes)) return parsePngCard(bytes);
  if (contentType.includes("json") || contentType.includes("text")) return parseJsonCardBytes(bytes);

  // Unknown content type: last-ditch attempt as JSON (parser throws a clear error if not).
  return parseJsonCardBytes(bytes);
}
