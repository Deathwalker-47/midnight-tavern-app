/**
 * Plan 08 surfacing (S8b): the ruling card for automatic rulings, the new gate codes, and the extra
 * facts a rolled ruling now carries (reaction, multi-target spread, cooldown, statuses, modifiers).
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Ruling } from "@midnight-tavern/core";
import { restoresLine, rulingToArtifact } from "../../src/screens/Play";
import { RulingArtifact } from "../../src/components/RulingArtifact";

const names: Record<string, string> = { kestrel: "Kestrel", wight: "Grave-wight" };
const nameOf = (id: string) => names[id] ?? id;
const automatic = (overrides: Partial<Ruling>): Ruling => ({
  turnId: "kestrel:take_rest",
  actorId: "kestrel",
  actionId: "take_rest",
  actionLabel: "Rest",
  gate: { allowed: true },
  effectsApplied: { resourceDeltaSelf: { hp: 10, stamina: 8 }, narrationHint: "a proper rest restores strength" },
  ...overrides,
});

describe("automatic rulings", () => {
  it("stamp what the engine applied without a roll", () => {
    const vm = rulingToArtifact(automatic({ cooldownApplied: 3 }), nameOf)!;
    expect(vm).toMatchObject({
      variant: "automatic",
      label: "RULING · KESTREL · REST",
      resultLine: "a proper rest restores strength",
      effectLine: "Kestrel Hp +10 · Kestrel Stamina +8 · Recovers in 3T",
    });
    expect(vm.detailRows).toContainEqual({ label: "ROLL", value: "None — the engine applied this automatically." });
  });

  it("cover status ticks, used items, learned skills, statuses, deaths and switched toggles", () => {
    const tick = rulingToArtifact(
      automatic({
        actionId: "status_poisoned",
        actionLabel: "Poisoned",
        effectsApplied: { resourceDeltaSelf: { hp: -2 }, narrationHint: "the venom burns" },
        causedDeathOf: ["kestrel"],
      }),
      nameOf
    )!;
    expect(tick.effectLine).toBe("Kestrel Hp -2 · Death · Kestrel");
    const tonic = rulingToArtifact(
      automatic({
        actionId: "consume_item",
        actionLabel: "Use Tonic",
        effectsApplied: { resourceDeltaSelf: { aether: 4 }, narrationHint: "the Tonic is used up" },
        costsPaid: { items: [{ itemId: "tonic", qty: 1 }] },
      }),
      nameOf
    )!;
    expect(tonic.effectLine).toBe("Kestrel Aether +4 · Used 1 Tonic");
    const draught = rulingToArtifact(
      automatic({
        actionId: "consume_item",
        actionLabel: "Use Red Draught",
        effectsApplied: { resourceDeltaSelf: { hp: 6 }, narrationHint: "the Red Draught is used up" },
        itemConsumed: { itemInstanceId: "i1", itemDefinitionId: "d1", name: "Red Draught", quantityBefore: 2 },
      }),
      nameOf
    )!;
    expect(draught.effectLine).toBe("Kestrel Hp +6 · Used 1 Red Draught");
    expect(restoresLine({ health: 13, mana: 2 })).toBe("Restores 13 health, 2 mana when used");
    const learned = rulingToArtifact(
      automatic({
        actionId: "learn_skill",
        actionLabel: undefined,
        effectsApplied: null,
        masteryAdvance: { skillId: "riposte", fromRank: "untrained", toRank: "novice" },
      }),
      nameOf
    )!;
    expect(learned).toMatchObject({ label: "RULING · KESTREL · LEARN SKILL", effectLine: "Riposte → NOVICE" });
    const hexed = rulingToArtifact(
      automatic({
        targetId: "wight",
        effectsApplied: {
          resourceDeltaTarget: { hp: -1 },
          attributeDeltaSelf: { str: 1 },
          attributeDeltaTarget: { dex: -1 },
          grantItem: { itemId: "charm", qty: 1 },
          statusSelf: { id: "focused", label: "Focused", durationTurns: 2 },
          statusTarget: { id: "cursed", label: "Cursed", durationTurns: 3 },
          narrationHint: "a hex takes",
        },
      }),
      nameOf
    )!;
    expect(hexed.effectLine).toBe(
      "Grave-wight Hp -1 · Kestrel Str +1 · Grave-wight Dex -1 · +1 Charm · Kestrel Focused 2T · Grave-wight Cursed 3T"
    );
    expect(hexed.detailRows).toContainEqual({ label: "TARGET", value: "Grave-wight" });
    const untargeted = rulingToArtifact(
      automatic({
        effectsApplied: {
          resourceDeltaTarget: { hp: -1 },
          statusTarget: { id: "cursed", label: "Cursed", durationTurns: 3 },
          narrationHint: "x",
        },
      }),
      nameOf
    )!;
    expect(untargeted.effectLine).toBe("Target Hp -1 · Target Cursed 3T");
    const toggled = rulingToArtifact(
      automatic({ actionId: "toggle_skill", actionLabel: "Activate Battle Trance", effectsApplied: { narrationHint: "it takes hold" } }),
      nameOf
    )!;
    expect(toggled).toMatchObject({ variant: "automatic", label: "RULING · KESTREL · ACTIVATE BATTLE TRANCE" });
    expect(toggled.effectLine).toBeUndefined();
    const lapse = rulingToArtifact(automatic({ actionId: "toggle_skill", effectsApplied: null }), nameOf)!;
    expect(lapse.resultLine).toBeUndefined();
  });

  it("leave a routine narration-only success unstamped", () => {
    expect(
      rulingToArtifact(automatic({ actionId: "open_door", effectsApplied: { narrationHint: "it opens" } }), nameOf)
    ).toBeUndefined();
    expect(rulingToArtifact(automatic({ actionId: "open_door", effectsApplied: null }), nameOf)).toBeUndefined();
  });

  it("render in the system register with no die", () => {
    render(<RulingArtifact variant="automatic" effectLine="Kestrel Hp +10" animate={false} />);
    expect(screen.queryByTestId("ruling-die")).toBeNull();
    expect(screen.getByTestId("ruling-automatic-glyph")).toHaveTextContent("◆");
    expect(screen.getByTestId("ruling-label")).toHaveTextContent("RULING · AUTOMATIC");
    expect(screen.getByText("AUTOMATIC")).toBeInTheDocument();
  });
});

describe("refusals by the economy's gate codes", () => {
  const refused = (code: NonNullable<Ruling["gate"]["code"]> | undefined) =>
    rulingToArtifact(
      {
        turnId: "kestrel:flame_wave",
        actorId: "kestrel",
        actionId: "flame_wave",
        gate: { allowed: false, reason: "Flame Wave is still recovering.", ...(code ? { code } : {}) },
        effectsApplied: null,
      },
      nameOf
    )!.label;

  it("name what stopped the attempt", () => {
    expect(refused("on_cooldown")).toBe("RULING · KESTREL · RECOVERING");
    expect(refused("insufficient_resource")).toBe("RULING · KESTREL · TOO SPENT");
    expect(refused("cannot_afford")).toBe("RULING · KESTREL · CANNOT AFFORD");
    expect(refused("not_invocable")).toBe("RULING · KESTREL · NOT USABLE AT WILL");
    expect(refused("no_target")).toBe("RULING · KESTREL · NO ONE IN REACH");
    expect(refused("in_combat")).toBe("RULING · KESTREL · NOT SAFE TO REST");
    expect(refused("skill_required")).toBe("RULING · KESTREL · DENIED");
    expect(refused(undefined)).toBe("RULING · KESTREL · DENIED");
  });
});

describe("rolled rulings carry the economy's facts", () => {
  it("show a reaction, a multi-target spread, a cooldown, statuses and the new modifier terms", () => {
    const vm = rulingToArtifact(
      {
        turnId: "kestrel:riposte_strike",
        actorId: "kestrel",
        actionId: "riposte_strike",
        actionLabel: "Riposte",
        targetId: "wight",
        gate: { allowed: true },
        roll: { d20: 15, modifier: 4, total: 19, dc: 10, outcome: "success", statusModifier: 1, passiveModifier: 2 },
        effectsApplied: {
          resourceDeltaTarget: { hp: -2 },
          statusTarget: { id: "bleeding", label: "Bleeding", durationTurns: 2 },
          narrationHint: "the counter lands",
        },
        cooldownApplied: 2,
        reaction: { skillId: "riposte", skillName: "Riposte", trigger: "attacked", sourceActorId: "wight" },
        targeting: { scope: "area", index: 0, count: 3 },
      },
      nameOf
    )!;
    expect(vm.effectLine).toBe(
      "Grave-wight Bleeding 2T · Riposte reaction to Grave-wight · Target 1 of 3 · Recovers in 2T"
    );
    expect(vm.roll!.modifierTerms).toEqual([
      { label: "Conditions", value: 1 },
      { label: "Passive skills", value: 2 },
    ]);
    const single = rulingToArtifact(
      {
        turnId: "kestrel:strike",
        actorId: "kestrel",
        actionId: "strike",
        gate: { allowed: true },
        roll: { d20: 15, modifier: 4, total: 19, dc: 10, outcome: "success" },
        effectsApplied: { narrationHint: "a hit" },
        targeting: { scope: "self", index: 0, count: 1 },
      },
      nameOf
    )!;
    expect(single.effectLine).toBeUndefined();
    expect(single.roll!.modifierTerms).toEqual([]);
  });
});
