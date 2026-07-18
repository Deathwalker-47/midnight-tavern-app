/**
 * PNG card parser (low-level-plan §M9.1).
 *
 * Character cards ship as PNGs with the JSON payload stashed in a `tEXt` chunk keyed
 * `chara` (base64-encoded JSON), per the Character Card V2/V3 convention. Some V3 exporters
 * use the key `ccv3` instead. We walk the PNG chunk structure by hand (no image decoding, no
 * deps): validate the signature, iterate `length|type|data|crc` records, and pull the text
 * chunk's value. `zTXt`/`iTXt` are not supported in v1 — cards in the wild use `tEXt`.
 */
import { parseCardObject, CardParseError, type CharacterCard } from "./cardTypes.js";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** True if `bytes` starts with the 8-byte PNG signature. */
export function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIGNATURE.length) return false;
  return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
}

/** Read a big-endian uint32 at `offset`. */
function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>>
    0
  );
}

/**
 * Extract the raw text value of the first `tEXt` chunk whose keyword is in `keywords`
 * (case-insensitive), or undefined if none is present. A `tEXt` chunk's data is
 * `keyword\0text`, both Latin-1.
 */
function readTextChunk(bytes: Uint8Array, keywords: string[]): string | undefined {
  const wanted = keywords.map((k) => k.toLowerCase());
  let offset = PNG_SIGNATURE.length;
  const decoder = new TextDecoder("latin1");

  while (offset + 8 <= bytes.length) {
    const length = readUint32BE(bytes, offset);
    const type = decoder.decode(bytes.subarray(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) break; // truncated chunk

    if (type === "tEXt") {
      const data = bytes.subarray(dataStart, dataEnd);
      const nul = data.indexOf(0);
      if (nul !== -1) {
        const keyword = decoder.decode(data.subarray(0, nul)).toLowerCase();
        if (wanted.includes(keyword)) {
          return decoder.decode(data.subarray(nul + 1));
        }
      }
    }
    if (type === "IEND") break;
    offset = dataEnd + 4; // skip data + 4-byte CRC
  }
  return undefined;
}

/** Decode a base64 string (card `tEXt` values are base64-encoded JSON). */
function decodeBase64(value: string): string {
  const trimmed = value.trim();
  // Node Buffer if available, else atob (browser/electron renderer).
  if (typeof Buffer !== "undefined") return Buffer.from(trimmed, "base64").toString("utf-8");
  const binary = atob(trimmed);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8").decode(out);
}

/**
 * Parse a character card out of PNG bytes. Looks for a `chara` (V2) or `ccv3` (V3) `tEXt`
 * chunk, base64-decodes it to JSON, and validates it. Throws `CardParseError` when the bytes
 * aren't a PNG or carry no recognizable card chunk.
 */
export function parsePngCard(bytes: Uint8Array): CharacterCard {
  if (!isPng(bytes)) throw new CardParseError("File is not a PNG (bad signature).");

  const raw = readTextChunk(bytes, ["ccv3", "chara"]);
  if (raw === undefined) {
    throw new CardParseError('PNG has no "chara"/"ccv3" tEXt chunk — not a character card.');
  }

  let json: string;
  try {
    json = decodeBase64(raw);
  } catch (err) {
    throw new CardParseError(`Card chunk is not valid base64: ${(err as Error).message}`);
  }

  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch (err) {
    throw new CardParseError(`Card chunk JSON is not valid: ${(err as Error).message}`);
  }
  return parseCardObject(value);
}
