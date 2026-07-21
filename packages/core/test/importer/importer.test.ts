/**
 * Card importer tests (low-level-plan §M9).
 *
 * Exercises every parse path plus THE WALL (§M9.4 — a card can seed only narrative content,
 * never mechanics):
 *   • pngCard — hand-built PNG with a `chara`/`ccv3` tEXt chunk (base64 JSON); bad signature
 *     and missing-chunk errors.
 *   • jsonCard — V2 envelope, V3 spec, bare (envelope-less) card, and unrecognized payloads.
 *   • mapToSchema — premise assembly, trait splitting, opening ordering, lorebook filtering,
 *     and the wall: MappedCard exposes no mechanical channel (items/skills/resources).
 *   • urlImport — content-type/magic-byte parser selection and the 10 MB streaming cap.
 *
 * The PNG byte layout is built by hand (signature + length|type|data|crc records). The
 * parser does not verify CRCs, so a zeroed CRC is fine for a fixture.
 */
import { describe, it, expect } from "vitest";
import {
  parsePngCard,
  parseJsonCard,
  mapCardToImport,
  importCardFromUrl,
  CardParseError,
  type CharacterCard,
} from "../../src/importer/index.js";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Encode a uint32 big-endian into 4 bytes. */
function u32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

/** Build a PNG carrying one tEXt chunk `keyword\0<value>` plus a trailing IEND. */
function pngWithTextChunk(keyword: string, value: string): Uint8Array {
  const enc = new TextEncoder();
  const textData = [...enc.encode(keyword), 0, ...enc.encode(value)];
  const bytes: number[] = [...PNG_SIGNATURE];
  // tEXt chunk: length | "tEXt" | data | crc(zeroed).
  bytes.push(...u32(textData.length), ...enc.encode("tEXt"), ...textData, ...u32(0));
  // IEND chunk: length 0 | "IEND" | crc(zeroed).
  bytes.push(...u32(0), ...enc.encode("IEND"), ...u32(0));
  return new Uint8Array(bytes);
}

/** Base64-encode a UTF-8 string (Node Buffer available in the test runtime). */
function b64(s: string): string {
  return Buffer.from(s, "utf-8").toString("base64");
}

const V2_CARD = {
  spec: "chara_card_v2",
  spec_version: "2.0",
  data: {
    name: "Mara",
    description: "A wary smuggler with a scarred jaw.",
    personality: "cunning, quiet, loyal",
    scenario: "You meet Mara in a dockside tavern.",
    first_mes: "You looking for passage?",
    alternate_greetings: ["The docks are no place to linger.", ""],
    character_book: {
      entries: [
        { keys: ["dock", "harbor"], content: "The docks are run by the Kessler family.", enabled: true },
        { keys: ["secret"], content: "This should be dropped.", enabled: false },
        { keys: [], content: "No keys — dropped.", enabled: true },
      ],
    },
  },
};

describe("parsePngCard", () => {
  it("extracts a V2 card from a `chara` tEXt chunk", () => {
    const png = pngWithTextChunk("chara", b64(JSON.stringify(V2_CARD)));
    const card = parsePngCard(png);
    expect(card.spec).toBe("chara_card_v2");
    expect(card.data.name).toBe("Mara");
  });

  it("extracts a V3 card from a `ccv3` tEXt chunk", () => {
    const v3 = { ...V2_CARD, spec: "chara_card_v3", spec_version: "3.0" };
    const png = pngWithTextChunk("ccv3", b64(JSON.stringify(v3)));
    const card = parsePngCard(png);
    expect(card.spec).toBe("chara_card_v3");
    expect(card.specVersion).toBe("3.0");
  });

  it("rejects bytes without a PNG signature", () => {
    expect(() => parsePngCard(new Uint8Array([1, 2, 3, 4]))).toThrow(CardParseError);
  });

  it("rejects a PNG with no chara/ccv3 chunk", () => {
    const png = pngWithTextChunk("Comment", b64("irrelevant"));
    expect(() => parsePngCard(png)).toThrow(/no "chara"\/"ccv3"/);
  });
});

describe("parseJsonCard", () => {
  it("parses a V2 envelope", () => {
    const card = parseJsonCard(JSON.stringify(V2_CARD));
    expect(card.spec).toBe("chara_card_v2");
    expect(card.data.personality).toBe("cunning, quiet, loyal");
  });

  it("parses a V3 spec", () => {
    const card = parseJsonCard(JSON.stringify({ ...V2_CARD, spec: "chara_card_v3" }));
    expect(card.spec).toBe("chara_card_v3");
  });

  it("accepts a bare (envelope-less) card, defaulting to V2", () => {
    const card = parseJsonCard(JSON.stringify({ name: "Bare", first_mes: "hi" }));
    expect(card.spec).toBe("chara_card_v2");
    expect(card.data.name).toBe("Bare");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseJsonCard("{not json")).toThrow(CardParseError);
  });

  it("throws on an unrecognized object", () => {
    expect(() => parseJsonCard(JSON.stringify({ foo: "bar" }))).toThrow(/Unrecognized card format/);
  });
});

describe("mapCardToImport", () => {
  const card: CharacterCard = parseJsonCard(JSON.stringify(V2_CARD));

  it("assembles a premise from name/description/personality/scenario", () => {
    const m = mapCardToImport(card);
    expect(m.premise).toContain("Character: Mara");
    expect(m.premise).toContain("Description: A wary smuggler");
    expect(m.premise).toContain("Personality: cunning");
    expect(m.premise).toContain("Scenario: You meet Mara");
  });

  it("splits personality into deduped traits", () => {
    const m = mapCardToImport(card);
    expect(m.identity.traits).toEqual(["cunning", "quiet", "loyal"]);
  });

  it("orders openings first_mes-first and drops empties", () => {
    const m = mapCardToImport(card);
    expect(m.openings[0]).toBe("You looking for passage?");
    expect(m.openings).toContain("The docks are no place to linger.");
    expect(m.openings).not.toContain(""); // blank alternate dropped
  });

  it("keeps only enabled lorebook entries with keys and content", () => {
    const m = mapCardToImport(card);
    expect(m.lorebook).toHaveLength(1);
    expect(m.lorebook[0]!.keys).toEqual(["dock", "harbor"]);
  });

  it("THE WALL: the mapped result exposes no mechanical channel", () => {
    const m = mapCardToImport(card);
    // The only path to mechanics is the premise string (→ bootstrapper). The mapped shape
    // carries no items/skills/resources/actions of its own.
    const keys = Object.keys(m);
    expect(keys.sort()).toEqual(["blueprint", "identity", "lorebook", "name", "openings", "premise"]);
    expect(m).not.toHaveProperty("items");
    expect(m).not.toHaveProperty("skills");
    expect(m).not.toHaveProperty("resources");
    expect(m).not.toHaveProperty("actions");
    // identity is narrative-only: traits/likes/dislikes (+ optional appearance/backstory).
    expect(m.identity).not.toHaveProperty("skills");
    expect(m.identity).not.toHaveProperty("resources");
    // The blueprint (§3) is style/identity/premise only — it can carry no mechanical channel either.
    expect(m.blueprint).not.toHaveProperty("items");
    expect(m.blueprint).not.toHaveProperty("skills");
    expect(m.blueprint).not.toHaveProperty("resources");
    expect(m.blueprint).not.toHaveProperty("actions");
  });

  it("falls back to a default name when the card has none", () => {
    const anon = parseJsonCard(JSON.stringify({ description: "no name here" }));
    expect(mapCardToImport(anon).name).toBe("Imported Character");
  });
});

describe("importCardFromUrl", () => {
  /** A fetch stub returning `bytes` with the given content type. */
  function stubFetch(bytes: Uint8Array, contentType: string): typeof fetch {
    return (async () =>
      new Response(bytes, { status: 200, headers: { "content-type": contentType } })) as unknown as typeof fetch;
  }

  it("selects the JSON parser for an application/json response", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify(V2_CARD));
    const card = await importCardFromUrl("https://example.test/card.json", {
      fetchImpl: stubFetch(bytes, "application/json"),
    });
    expect(card.data.name).toBe("Mara");
  });

  it("selects the PNG parser by magic bytes even when mislabeled", async () => {
    const png = pngWithTextChunk("chara", b64(JSON.stringify(V2_CARD)));
    const card = await importCardFromUrl("https://example.test/card", {
      fetchImpl: stubFetch(png, "application/octet-stream"),
    });
    expect(card.data.name).toBe("Mara");
  });

  it("throws on a non-OK response", async () => {
    const fetchImpl = (async () => new Response("nope", { status: 404 })) as unknown as typeof fetch;
    await expect(importCardFromUrl("https://example.test/missing", { fetchImpl })).rejects.toThrow(
      /HTTP 404/
    );
  });

  it("enforces the byte cap on an oversized body", async () => {
    const big = new Uint8Array(1024); // 1 KB
    await expect(
      importCardFromUrl("https://example.test/big.json", {
        fetchImpl: stubFetch(big, "application/json"),
        maxBytes: 512,
      })
    ).rejects.toThrow(/exceeds 512-byte limit/);
  });
});
