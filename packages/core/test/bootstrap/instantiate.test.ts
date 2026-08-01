import { describe, expect, it } from "vitest";
import { instantiateGeneric } from "../../src/bootstrap/instantiate.js";
import { makeStory } from "../fixtures.js";

describe("generic NPC encounter durability", () => {
  it("sizes a generic creature for six baseline natural hits instead of player-scale health", () => {
    const story = makeStory();
    story.resources = [
      { id: "hp", label: "Health", start: 100, max: 100, playerVisible: true, lethal: true },
    ];
    story.actions.push({
      id: "universal_natural_attack",
      universalFamily: "attack_natural",
      category: "combat",
      label: "Natural Attack",
      governingAttribute: "str",
      dc: 10,
      effects: {
        crit_success: { resourceDeltaTarget: { hp: -8 }, narrationHint: "A crushing hit." },
        success: { resourceDeltaTarget: { hp: -4 }, narrationHint: "The strike lands." },
        failure: { narrationHint: "The strike misses." },
        crit_failure: { narrationHint: "The attacker overextends." },
      },
    });

    const creature = instantiateGeneric(story, "unnamed_creature");

    expect(creature.resources.hp).toEqual({ current: 24, max: 24 });
  });
});
