/**
 * The narrator's `RULING:` lines. An allowed ruling that needed no roll (a routine action, a toggle,
 * learning a skill, a status tick) happened; it must never be described as denied.
 */
import { describe, expect, it } from "vitest";
import { renderRuling, type Ruling } from "../../src/index.js";
import { makeStory } from "../fixtures.js";

const actionsById = new Map(makeStory().actions.map((action) => [action.id, action]));
const names = new Map([["kestrel", "Kestrel"], ["wight", "Grave-wight"]]);
const nameFor = (id: string) => names.get(id) ?? id;

describe("renderRuling", () => {
  it("tells the narrator an automatic ruling happened, with its effects", () => {
    const tick: Ruling = {
      turnId: "kestrel:status_poisoned:tick",
      actorId: "kestrel",
      actionId: "status_poisoned",
      actionLabel: "Poisoned",
      gate: { allowed: true },
      effectsApplied: { resourceDeltaSelf: { hp: -2 }, narrationHint: "the venom burns" },
    };
    const line = renderRuling(tick, actionsById, nameFor);
    expect(line).toBe(
      "RULING: Kestrel — Poisoned — happens automatically (no roll needed). Effects: Kestrel hp -2. Narrate this outcome."
    );
    expect(line).not.toMatch(/DENIED/);
    const search: Ruling = { ...tick, actionId: "search_room", actionLabel: undefined, targetId: "wight" };
    expect(renderRuling(search, actionsById, nameFor)).toContain(
      `RULING: Kestrel — ${actionsById.get("search_room")!.label} on Grave-wight — happens automatically`
    );
    const bare: Ruling = { ...tick, actionId: "mystery", actionLabel: undefined, effectsApplied: null };
    expect(renderRuling(bare, actionsById, nameFor)).toContain("Kestrel — mystery — happens automatically");
  });

  it("still reports a refusal as denied", () => {
    const denied: Ruling = {
      turnId: "kestrel:attack_melee",
      actorId: "kestrel",
      actionId: "attack_melee",
      gate: { allowed: false, reason: "Requires Blade — not learned.", code: "skill_required" },
      effectsApplied: null,
    };
    expect(renderRuling(denied, actionsById, nameFor)).toContain("DENIED (Requires Blade — not learned.)");
    expect(renderRuling({ ...denied, gate: { allowed: false } }, actionsById, nameFor)).toContain(
      "DENIED (not possible)"
    );
  });

  it("names statuses applied to the actor or the target", () => {
    const hex: Ruling = {
      turnId: "kestrel:hex",
      actorId: "kestrel",
      actionId: "hex",
      actionLabel: "Hex",
      targetId: "wight",
      gate: { allowed: true },
      effectsApplied: {
        statusSelf: { id: "focused", label: "Focused", durationTurns: 2, checkBonus: 1 },
        statusTarget: { id: "cursed", label: "Cursed", durationTurns: 3, checkBonus: -1 },
        narrationHint: "a hex takes",
      },
    };
    const line = renderRuling(hex, actionsById, nameFor);
    expect(line).toContain("Kestrel is Focused for 2 turns; Grave-wight is Cursed for 3 turns");
    const untargeted = renderRuling({ ...hex, targetId: undefined }, actionsById, nameFor);
    expect(untargeted).toContain("target is Cursed for 3 turns");
  });
});
