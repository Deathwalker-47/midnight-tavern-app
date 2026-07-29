import { describe, expect, it } from "vitest";
import { generateGuardedNarration } from "../../src/orchestrator/authorityGuard.js";
import type { Router } from "../../src/router/index.js";
import type { Ruling } from "../../src/types/index.js";

const ruling: Ruling = {
  turnId: "player:both-pistols",
  actorId: "player",
  actionId: "both-pistols",
  actionLabel: "Both Pistols",
  gate: { allowed: true },
  roll: {
    d20: 16,
    dice: [16],
    usedIndex: 0,
    natural: 16,
    rollMode: "normal",
    advantageSources: [],
    disadvantageSources: [],
    modifier: 0,
    attributeId: "iron",
    attributeScore: 8,
    attributeModifier: -1,
    equipmentAttributeBonus: 0,
    masterySkillId: "quickdraw",
    masteryModifier: 1,
    equipmentModifier: 0,
    total: 16,
    dc: 15,
    dcBase: 15,
    dcEffective: 15,
    outcome: "success",
  },
  effectsApplied: { narrationHint: "Twin shots land, threats stagger back." },
};

function routerFor(auditResponse: string): {
  router: Router;
  counts: { narrator: number; auditor: number };
} {
  const counts = { narrator: 0, auditor: 0 };
  return {
    counts,
    router: {
      bindingFor: () => ({
        provider: "electronhub",
        model: "test",
        source: "recommended",
        samplersDirty: false,
      }),
      async complete() {
        counts.auditor += 1;
        return { content: auditResponse };
      },
      async stream() {
        counts.narrator += 1;
        return {
          content:
            "Shannow's pistols spoke together. The nearer gunman folded behind the trough while the second shot drove the others into cover.",
        };
      },
    },
  };
}

/**
 * A router whose narrator actually streams two paragraphs (a safe narrative beat, then a beat that
 * asserts a mechanic), so we can prove progressive verified release: the safe leading paragraph is
 * emitted before the draft finishes, and the mechanical paragraph is never exposed when the audit
 * rejects it.
 */
function streamingRouterFor(
  paragraphs: readonly string[],
  auditResponse: string
): { router: Router; counts: { narrator: number; auditor: number } } {
  const counts = { narrator: 0, auditor: 0 };
  const full = paragraphs.join("\n\n");
  return {
    counts,
    router: {
      bindingFor: () => ({
        provider: "electronhub",
        model: "test",
        source: "recommended",
        samplersDirty: false,
      }),
      async complete() {
        counts.auditor += 1;
        return { content: auditResponse };
      },
      async stream(_role: unknown, _prompt: unknown, onDelta: (delta: string) => void) {
        counts.narrator += 1;
        // Emit paragraph-by-paragraph, boundary included, like a real provider stream.
        paragraphs.forEach((paragraph, index) => {
          onDelta(index === 0 ? paragraph : `\n\n${paragraph}`);
        });
        return { content: full };
      },
    } as unknown as Router,
  };
}

const SAFE_PARAGRAPH =
  "Shannow eased between the shattered pews, boots silent on the ash. The wind carried the smell of cordite and old rain.";
const MECHANICAL_LIE =
  "He rolled a natural 20 and the DC 30 check crushed the creature for 45 damage, awarding him a legendary rifle.";

describe("generateGuardedNarration — progressive verified streaming", () => {
  it("releases a verified leading paragraph before the draft finishes", async () => {
    const { router } = streamingRouterFor(
      [SAFE_PARAGRAPH, "The second gunman broke and ran for the treeline."],
      JSON.stringify({ obeysRulings: true, contradictions: [] })
    );
    const deltas: string[] = [];
    const result = await generateGuardedNarration(
      router,
      { system: "Narrate.", user: "Advance." },
      [ruling],
      { onDelta: (delta) => deltas.push(delta) }
    );
    // Progressive, not one final dump: at least two deltas, and the first carries only the safe
    // leading beat (the second paragraph must not ride along in the first delta).
    expect(deltas.length).toBeGreaterThanOrEqual(2);
    expect(deltas[0]).toContain("eased between the shattered pews");
    expect(deltas[0]).not.toContain("broke and ran");
    expect(result.usedSafeFallback).toBe(false);
    expect(result.prose).toContain("eased between the shattered pews");
    expect(result.prose).toContain("broke and ran");
  });

  it("delivers the first safe paragraph before the narrator stream promise resolves", async () => {
    // The provider emits two safe deltas, then its stream promise HANGS on a gate. If the release
    // point buffered until completion, the sink would still be empty here.
    let releaseStream!: () => void;
    const streamGate = new Promise<void>((resolve) => {
      releaseStream = resolve;
    });
    const deltas: string[] = [];
    const router: Router = {
      bindingFor: () => ({
        provider: "electronhub",
        model: "test",
        source: "recommended",
        samplersDirty: false,
      }),
      async complete() {
        return { content: JSON.stringify({ obeysRulings: true, contradictions: [] }) };
      },
      async stream(_role: unknown, _prompt: unknown, onDelta: (delta: string) => void) {
        onDelta(SAFE_PARAGRAPH);
        onDelta("\n\nThe second gunman broke and ran for the treeline.");
        await streamGate; // provider promise stays pending after the deltas are emitted
        return { content: `${SAFE_PARAGRAPH}\n\nThe second gunman broke and ran for the treeline.` };
      },
    } as unknown as Router;

    const pending = generateGuardedNarration(
      router,
      { system: "Narrate.", user: "Advance." },
      [ruling],
      { onDelta: (delta) => deltas.push(delta) }
    );
    await new Promise((resolve) => setTimeout(resolve, 0)); // drain microtasks, not the gate

    expect(deltas.join(""), "safe beat should reach the UI before the stream resolves").toContain(
      "eased between the shattered pews"
    );

    releaseStream();
    const result = await pending;
    expect(result.usedSafeFallback).toBe(false);
    expect(result.prose).toContain("broke and ran");
  });

  it("releases accepted mechanical beats incrementally rather than as one dump", async () => {
    const beats = [
      SAFE_PARAGRAPH,
      "The strike lands for solid damage and he reels back.",
      "A second success drives the last man behind the pillar.",
    ];
    const { router } = streamingRouterFor(
      beats,
      JSON.stringify({ obeysRulings: true, contradictions: [] })
    );
    const deltas: string[] = [];
    const result = await generateGuardedNarration(
      router,
      { system: "Narrate.", user: "Advance." },
      [ruling],
      { onDelta: (delta) => deltas.push(delta) }
    );
    expect(result.usedSafeFallback).toBe(false);
    // Safe lead + each verified mechanical beat arrives as its own delta — not one concatenated blob.
    expect(deltas.length).toBeGreaterThanOrEqual(3);
    expect(result.prose).toContain("solid damage");
    expect(result.prose).toContain("behind the pillar");
  });

  it("keeps earlier verified beats but replaces a later beat that asserts an unrecorded death", async () => {
    // The model auditor permissively accepts, but the deterministic per-beat death guard catches the
    // fabricated death — WITHOUT discarding the earlier verified beat (the old whole-draft guard did).
    const beats = [
      "The blow lands for heavy damage and he buckles against the rail.",
      "He falls dead at your feet, a lifeless heap.",
    ];
    const { router } = streamingRouterFor(
      beats,
      JSON.stringify({ obeysRulings: true, contradictions: [] })
    );
    const deltas: string[] = [];
    const result = await generateGuardedNarration(
      router,
      { system: "Narrate.", user: "Advance." },
      [ruling], // ruling records no causedDeathOf
      { onDelta: (delta) => deltas.push(delta) }
    );
    const shown = deltas.join("");
    expect(shown).toContain("heavy damage"); // earlier verified beat is preserved…
    expect(shown).not.toContain("falls dead"); // …and the fabricated death is never exposed
    expect(shown).not.toContain("lifeless heap");
    expect(result.prose).toContain("heavy damage");
    expect(result.prose).not.toContain("falls dead");
    expect(result.usedSafeFallback).toBe(true);
  });

  it("never exposes a mechanical paragraph the auditor rejects", async () => {
    const { router } = streamingRouterFor(
      [SAFE_PARAGRAPH, MECHANICAL_LIE],
      JSON.stringify({
        obeysRulings: false,
        contradictions: [{ rulingIndex: 0, reason: "fabricated DC 30 / 45 damage / legendary loot" }],
      })
    );
    const released: string[] = [];
    const result = await generateGuardedNarration(
      router,
      { system: "Narrate.", user: "Advance." },
      [ruling],
      { onDelta: (delta) => released.push(delta) }
    );
    const shown = released.join("");
    // The safe beat is released early (deterministic, ruling-agnostic), but the fabricated mechanics
    // must never reach the UI or the final prose — the rejected remainder is replaced.
    expect(shown).toContain("eased between the shattered pews");
    expect(shown).not.toContain("45 damage");
    expect(shown).not.toContain("legendary rifle");
    expect(result.prose).toContain("eased between the shattered pews");
    expect(result.prose).not.toContain("45 damage");
    expect(result.prose).not.toContain("legendary rifle");
    expect(result.usedSafeFallback).toBe(true);
  });
});

describe("generateGuardedNarration", () => {
  it("rejects a narrated kill when no lethal resource reached zero", async () => {
    const falseKillRouter: Router = {
      bindingFor: () => ({
        provider: "electronhub",
        model: "test",
        source: "recommended",
        samplersDirty: false,
      }),
      async complete() {
        // Even a permissive model auditor cannot override the deterministic death guard.
        return { content: JSON.stringify({ obeysRulings: true, contradictions: [] }) };
      },
      async stream() {
        return { content: "The creature falls dead. You finally kill it." };
      },
    };

    const result = await generateGuardedNarration(
      falseKillRouter,
      { system: "Narrate.", user: "I try to kill it." },
      [ruling],
      { maxNarratorRepairs: 0 }
    );

    expect(result.usedSafeFallback).toBe(true);
    expect(result.prose).not.toMatch(/\b(?:falls dead|kill it)\b/i);
    expect(result.prose).toContain("Twin shots land");
  });

  it("accepts harmless JSON-mode variants from the authority auditor", async () => {
    const { router, counts } = routerFor(
      JSON.stringify({ obeysRulings: "true", contradictions: null })
    );

    const result = await generateGuardedNarration(
      router,
      { system: "Narrate.", user: "Both pistols fire." },
      [ruling]
    );

    expect(result.prose).toContain("Shannow's pistols spoke together");
    expect(result.usedSafeFallback).toBe(false);
    expect(counts).toEqual({ narrator: 1, auditor: 1 });
  });

  it("does not regenerate a full narrator draft when the auditor is unavailable", async () => {
    const { router, counts } = routerFor("not json");

    const result = await generateGuardedNarration(
      router,
      { system: "Narrate.", user: "Both pistols fire." },
      [ruling]
    );

    expect(result.usedSafeFallback).toBe(true);
    expect(result.prose).toContain("Twin shots land");
    expect(result.prose).not.toMatch(/\b(?:d20|DC|modifier|resolves as)\b/i);
    expect(counts).toEqual({ narrator: 1, auditor: 1 });
  });
});
