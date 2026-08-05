/**
 * Character dossier tests (memory/dossier.ts, low-level-plan-v2 §7).
 *
 * The dossier is a pure hard+soft projection. These cover the parts with real logic:
 *   • reverse-resolved relationships (incoming edges assembled from OTHER characters' soft state),
 *   • the player-convenience edge,
 *   • skill progress (toNext) from hard successCount + schema successesPerRank,
 *   • involved-thread matching against world soft state,
 *   • the hard/soft wall: a character with hard state but no soft profile still yields a sheet.
 */
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { openStore, type Store } from "../../src/store/index.js";
import { getCharacterDossier } from "../../src/memory/dossier.js";
import type {
  CharacterSoftState,
  StoryRecord,
  WorldSoftState,
} from "../../src/types/index.js";
import { makePlayer, makeEnemy, makeStory } from "../fixtures.js";

const STORY_ID = "story-fixture";

function storyRecord(): StoryRecord {
  const schema = makeStory({ storyId: STORY_ID, locked: true });
  const blade = schema.skills.find((skill) => skill.id === "blade");
  if (blade) {
    blade.advancedUses = [
      { minRank: "expert", description: "Perform a measured counter-strike." },
    ];
  }
  for (const action of schema.actions.filter((candidate) => candidate.requiresSkill === "blade")) {
    action.governingAttribute = "dex";
    action.description = `${action.label} using trained blade work.`;
  }
  return {
    id: STORY_ID,
    title: "The Silent Vale",
    createdAt: 1000,
    schema,
    locked: true,
  };
}

/** A soft profile for a character, with sensible defaults and shallow overrides. */
function soft(
  characterId: string,
  name: string,
  over: Partial<CharacterSoftState> = {}
): CharacterSoftState {
  return {
    characterId,
    name,
    tier: "primary",
    identity: { traits: [], likes: [], dislikes: [] },
    behavioralSignatures: [],
    current: {},
    relationships: [],
    observations: [],
    ...over,
  };
}

describe("getCharacterDossier", () => {
  let store: Store;

  beforeEach(async () => {
    store = await openStore(":memory:");
    await store.stories.insert(storyRecord());
    // Player Kestrel, NPC Wight, NPC Mira — a small graph.
    await store.characters.insert({
      id: "kestrel",
      storyId: STORY_ID,
      name: "Kestrel",
      isPlayer: true,
      hard: makePlayer({
        skills: [{ skillId: "blade", rank: "adept", successCount: 1, xp: 120 }],
      }),
      soft: soft("kestrel", "Kestrel", {
        identity: {
          traits: ["stoic"],
          likes: [],
          dislikes: [],
          appearance: "A weathered swordhand. Scarred.",
        },
        current: { mood: "wary", location: "the vale", goal: "survive" },
      }),
      softTier: "primary",
    });
    await store.characters.insert({
      id: "wight",
      storyId: STORY_ID,
      name: "Grave-wight",
      isPlayer: false,
      hard: makeEnemy(),
      soft: soft("wight", "Grave-wight", {
        // The wight fears Kestrel and looms over Mira.
        relationships: [
          { toCharacterId: "kestrel", trust: -0.8, power: -0.3, feeling: "fears" },
          { toCharacterId: "mira", trust: 0, power: 0.5 },
        ],
      }),
      softTier: "secondary",
    });
    await store.characters.insert({
      id: "mira",
      storyId: STORY_ID,
      name: "Mira",
      isPlayer: false,
      hard: makeEnemy({ characterId: "mira" }),
      soft: soft("mira", "Mira", {
        relationships: [{ toCharacterId: "kestrel", trust: 0.6, power: -0.2, feeling: "trusts" }],
      }),
      softTier: "secondary",
    });
    await store.events.insert({
      id: "xp-kestrel-blade",
      storyId: STORY_ID,
      turnIndex: 7,
      actorId: "kestrel",
      kind: "xp",
      payload: {
        award: {
          skillId: "blade",
          amount: 20,
          previousXp: 100,
          newXp: 120,
          rankBefore: "adept",
          rankAfter: "adept",
          reason: "Defeated the grave-wight in a close duel.",
        },
      },
      rulebookVersion: 1,
      createdAt: 1700,
    });
  });

  afterEach(async () => {
    await store.close();
  });

  it("returns undefined for an unknown character", async () => {
    const d = await getCharacterDossier(store, storyRecord().schema, "nobody");
    expect(d).toBeUndefined();
  });

  it("resolves reverse (incoming) relationships from other characters' soft state", async () => {
    const d = await getCharacterDossier(store, storyRecord().schema, "kestrel");
    expect(d).toBeDefined();
    // Kestrel authored no outgoing edges.
    expect(d!.relationships.outgoing).toEqual([]);
    // Both the wight and Mira point at Kestrel — assembled from THEIR edges, name-resolved.
    const incoming = d!.relationships.incoming.sort((a, b) => a.fromName.localeCompare(b.fromName));
    expect(incoming).toEqual([
      { fromCharacterId: "wight", fromName: "Grave-wight", trust: -0.8, power: -0.3, feeling: "fears" },
      { fromCharacterId: "mira", fromName: "Mira", trust: 0.6, power: -0.2, feeling: "trusts" },
    ]);
  });

  it("exposes the convenience edge toward the player for an NPC", async () => {
    const d = await getCharacterDossier(store, storyRecord().schema, "wight");
    expect(d!.relationships.toPlayer).toEqual({ trust: -0.8, power: -0.3, feeling: "fears" });
    // Outgoing carries both of the wight's edges, name-resolved.
    expect(d!.relationships.outgoing.map((e) => e.toName).sort()).toEqual(["Kestrel", "Mira"]);
  });

  it("omits toPlayer for the player themselves", async () => {
    const d = await getCharacterDossier(store, storyRecord().schema, "kestrel");
    expect(d!.isPlayer).toBe(true);
    expect(d!.relationships.toPlayer).toBeUndefined();
  });

  it("builds character history only from that character's evidence, never the global plot", async () => {
    const kestrel = (await store.characters.get("kestrel"))!;
    const wight = (await store.characters.get("wight"))!;
    await store.characters.updateSoft(
      "kestrel",
      soft("kestrel", "Kestrel", {
        ...kestrel.soft,
        identity: {
          traits: ["stoic"],
          likes: [],
          dislikes: [],
          backstory: "Kestrel survived the winter road.",
        },
        observations: [{ turnIdx: 4, text: "Kestrel shielded Mira from falling stone." }],
      }),
      "primary"
    );
    await store.characters.updateSoft(
      "wight",
      soft("wight", "Grave-wight", {
        ...wight.soft,
        identity: {
          traits: ["relentless"],
          likes: [],
          dislikes: [],
          backstory: "The wight woke beneath the ridge.",
        },
        observations: [{ turnIdx: 5, text: "The wight stalked the ruined chapel." }],
      }),
      "secondary"
    );
    await store.chapters.insert({
      id: "global-chapter",
      storyId: STORY_ID,
      idx: 0,
      msgFrom: 0,
      msgTo: 5,
      title: "Everyone's chapter",
      summary: "GLOBAL PLOT SUMMARY THAT MUST NOT APPEAR IN A DOSSIER.",
    });
    await store.events.insert({
      id: "ruling-targeting-wight",
      storyId: STORY_ID,
      turnIndex: 6,
      actorId: "kestrel",
      kind: "roll",
      payload: {
        ruling: {
          actorId: "kestrel",
          targetId: "wight",
          actionId: "attack_melee",
          gate: { allowed: true },
          roll: { outcome: "success" },
        },
      },
      rulebookVersion: 1,
      createdAt: 1800,
    });

    const playerDossier = (await getCharacterDossier(store, storyRecord().schema, "kestrel"))!;
    const wightDossier = (await getCharacterDossier(store, storyRecord().schema, "wight"))!;

    expect(playerDossier.storySoFar?.summary).toContain("Kestrel survived the winter road.");
    expect(playerDossier.storySoFar?.summary).toContain("Kestrel shielded Mira");
    expect(playerDossier.storySoFar?.summary).not.toContain("wight stalked");
    expect(playerDossier.storySoFar?.summary).not.toContain("GLOBAL PLOT");
    expect(wightDossier.storySoFar?.summary).toContain("The wight woke beneath the ridge.");
    expect(wightDossier.storySoFar?.summary).toContain("The wight stalked");
    expect(wightDossier.storySoFar?.summary).not.toContain("Kestrel shielded");
    expect(wightDossier.storySoFar?.summary).not.toContain("GLOBAL PLOT");
    expect(wightDossier.storySoFar?.keyEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "Attack (melee) — success",
          detail: expect.stringContaining("against Grave-wight"),
        }),
      ])
    );
  });

  it("computes skill progress from cumulative XP and the V7 progression config", async () => {
    // blade: successesPerRank = 3; Kestrel is adept with successCount 1 → 2 to go.
    const d = await getCharacterDossier(store, storyRecord().schema, "kestrel");
    const blade = d!.sheet.skills.find((s) => s.skillId === "blade");
    expect(blade).toMatchObject({
      name: "Blade",
      definition: "Swordplay.",
      tier: "common",
      rank: "adept",
      successCount: 1,
      xp: 120,
      toNext: 180,
      nextRankXp: 300,
      permits: ["Expert+: Perform a measured counter-strike."],
      linkedAttribute: "Dexterity",
      latestAward: {
        xp: 20,
        reason: "Defeated the grave-wight in a close duel.",
        turnIdx: 7,
      },
    });
    expect(blade!.linkedActions?.map((action) => action.label)).toEqual([
      "Attack (melee)",
      "Duel (opposed)",
      "Master strike",
    ]);
    expect(blade!.linkedActions?.[0]).toMatchObject({
      category: "combat",
      governingAttribute: "Dexterity",
      description: "Attack (melee) using trained blade work.",
    });
  });

  it("projects chronological attribute advancement with score and evidence context", async () => {
    await store.events.insert({
      id: "attribute-kestrel-dex",
      storyId: STORY_ID,
      turnIndex: 9,
      actorId: "kestrel",
      kind: "attribute_advanced",
      payload: {
        decision: {
          approved: true,
          proposal: {
            characterId: "kestrel",
            attributeId: "dex",
            source: "repeated_high_stakes_use",
            delta: 1,
            evidenceRefs: ["ruling-4", "ruling-7", "ruling-9"],
            rationale: "Three precise combat actions succeeded across separate scenes.",
          },
          proposalKey: "aa-v1-dex",
          band: "moderate",
          scoreBefore: 10,
          scoreAfter: 11,
          dc: 13,
          roll: 14,
          modifier: 2,
          effectiveChancePercent: 50,
          evidenceRefs: ["ruling-4", "ruling-7", "ruling-9"],
          denialCodes: [],
          denialReasons: [],
          policyVersion: 1,
        },
      },
      rulebookVersion: 1,
      createdAt: 1900,
    });

    const d = await getCharacterDossier(store, storyRecord().schema, "kestrel");

    expect(d!.attributeAdvancementHistory).toEqual([
      expect.objectContaining({
        attributeId: "dex",
        attributeName: "Dexterity",
        approved: true,
        scoreBefore: 10,
        scoreAfter: 11,
        source: "repeated_high_stakes_use",
        rationale: "Three precise combat actions succeeded across separate scenes.",
        evidenceRefs: ["ruling-4", "ruling-7", "ruling-9"],
        turnIdx: 9,
        recent: true,
      }),
    ]);
  });

  it("reports toNext=null at master rank", async () => {
    await store.characters.updateHard(
      "kestrel",
      makePlayer({ skills: [{ skillId: "blade", rank: "master", successCount: 0 }] })
    );
    const d = await getCharacterDossier(store, storyRecord().schema, "kestrel");
    const blade = d!.sheet.skills.find((s) => s.skillId === "blade");
    expect(blade!.toNext).toBeNull();
  });

  it("derives a 'what they are' descriptor from the first clause of appearance", async () => {
    const d = await getCharacterDossier(store, storyRecord().schema, "kestrel");
    expect(d!.identity.whatTheyAre).toBe("A weathered swordhand");
    expect(d!.identity.appearance).toBe("A weathered swordhand. Scarred.");
  });

  it("surfaces unresolved world threads that name the character (and skips resolved ones)", async () => {
    const world: WorldSoftState = {
      overview: "A haunted valley.",
      locations: [],
      arcs: [],
      unresolvedThreads: [
        { id: "t1", title: "The Grave-wight stirs", note: "It hunts the ridge.", resolved: false },
        { id: "t2", title: "Mira's debt", note: "Owed to the Grave-wight.", resolved: false },
        { id: "t3", title: "An old, resolved grudge", note: "Grave-wight laid to rest.", resolved: true },
        { id: "t4", title: "Unrelated", note: "Weather turns cold.", resolved: false },
      ],
    };
    await store.worldSoft.set(STORY_ID, world);
    const d = await getCharacterDossier(store, storyRecord().schema, "wight");
    // Matches by title OR note, unresolved only. Two threads name the wight.
    expect(d!.involvedThreads.map((t) => t.title).sort()).toEqual([
      "Mira's debt",
      "The Grave-wight stirs",
    ]);
  });

  it("still yields a sheet for a character with hard state but no soft profile (the wall)", async () => {
    await store.characters.insert({
      id: "husk",
      storyId: STORY_ID,
      name: "Husk",
      isPlayer: false,
      hard: makeEnemy({ characterId: "husk" }),
      // no soft
    });
    // Simulate a pre-envelope legacy/checkpoint row. New insertions are normalized automatically.
    await store.characters.clearSoft("husk");
    const d = await getCharacterDossier(store, storyRecord().schema, "husk");
    expect(d).toBeDefined();
    expect(d!.identity.tier).toBeUndefined();
    expect(d!.mentality.traits).toEqual([]);
    expect(d!.relationships.outgoing).toEqual([]);
    // Hard side is intact.
    expect(d!.sheet.alive).toBe(true);
    expect(d!.sheet.skills.map((s) => s.skillId)).toContain("blade");
  });
});
