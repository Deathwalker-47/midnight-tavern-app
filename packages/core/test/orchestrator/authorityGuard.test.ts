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

describe("generateGuardedNarration", () => {
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
    expect(result.prose).toContain("16 vs DC 15");
    expect(counts).toEqual({ narrator: 1, auditor: 1 });
  });
});
