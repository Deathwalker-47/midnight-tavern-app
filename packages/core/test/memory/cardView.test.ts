import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getLivingCard } from "../../src/memory/cardView.js";
import { REST_ACTION_ID, type SkillDef } from "../../src/index.js";
import { openStore, type Store } from "../../src/store/index.js";
import type { StoryRecord } from "../../src/types/index.js";
import { makePlayer, makeStory } from "../fixtures.js";

const STORY_ID = "living-card-xp";

describe("getLivingCard skill progression", () => {
  let store: Store;
  let story: StoryRecord;

  beforeEach(async () => {
    store = await openStore(":memory:");
    story = {
      id: STORY_ID,
      title: "XP Story",
      createdAt: 1,
      schema: makeStory({ storyId: STORY_ID, locked: true }),
      locked: true,
    };
    await store.stories.insert(story);
    await store.characters.insert({
      id: "player",
      storyId: STORY_ID,
      name: "Kestrel",
      isPlayer: true,
      hard: makePlayer({
        characterId: "player",
        skills: [{ skillId: "blade", rank: "adept", successCount: 99, xp: 145 }],
      }),
    });
    await store.events.insert({
      id: "xp-award",
      storyId: STORY_ID,
      turnIndex: 12,
      actorId: "player",
      kind: "xp",
      payload: {
        award: {
          skillId: "blade",
          amount: 15,
          previousXp: 130,
          newXp: 145,
          rankBefore: "novice",
          rankAfter: "adept",
          reason: "Critical success against a difficult foe.",
        },
      },
      rulebookVersion: 1,
      createdAt: 1200,
    });
  });

  afterEach(async () => {
    await store.close();
  });

  it("projects configured XP thresholds and the newest persisted award, not success counts", async () => {
    const card = await getLivingCard(store, story.schema, "player");
    const blade = card?.skills.find((skill) => skill.skillId === "blade");

    expect(blade).toMatchObject({
      name: "Blade",
      definition: "Swordplay.",
      tier: "common",
      rank: "adept",
      successCount: 99,
      xp: 145,
      nextRankXp: 300,
      toNext: 155,
      latestAward: {
        xp: 15,
        reason: "Critical success against a difficult foe.",
        turnIdx: 12,
        rankUp: { from: "novice", to: "adept" },
      },
    });
  });
});

describe("getLivingCard economy state (plan 08, S8)", () => {
  let store: Store;
  const base = makeStory();
  const blade = base.skills.find((skill) => skill.id === "blade")!;
  const extra: SkillDef[] = [
    { ...blade, id: "keen_eye", name: "Keen Eye", skillType: "passive", passive: { checkBonus: { amount: 1 } } },
    { ...blade, id: "trance", name: "Trance", skillType: "toggle", toggle: { upkeep: { stamina: 1 }, bonus: {} } },
    { ...blade, id: "focus", name: "Focus", skillType: "toggle", toggle: { upkeep: { stamina: 1 }, bonus: {} } },
    { ...blade, id: "riposte", name: "Riposte", skillType: "reaction", reaction: { trigger: "attacked", actionId: "attack_wild" } },
  ];
  const schema = makeStory({ storyId: "economy-card", locked: true, skills: [...base.skills, ...extra] });
  const learned = (skillId: string) => ({ skillId, rank: "novice" as const, successCount: 0 });

  beforeEach(async () => {
    store = await openStore(":memory:");
    await store.stories.insert({ id: "economy-card", title: "Economy", createdAt: 1, schema, locked: true });
    await store.characters.insert({
      id: "kestrel",
      storyId: "economy-card",
      name: "Kestrel",
      isPlayer: true,
      hard: makePlayer({
        skills: [learned("blade"), learned("keen_eye"), learned("trance"), learned("focus"), learned("riposte")],
        toggledOn: ["trance"],
        cooldowns: { attack_melee: 2, [REST_ACTION_ID]: 1, forgotten_action: 3 },
        activeEffects: [
          {
            id: "blessed",
            label: "Blessed",
            remainingTurns: 2,
            checkBonus: 2,
            attributeBonus: { str: 1, luck: -1 },
            resourcePerTurn: { hp: -2, mystery: 1 },
            sourceActorId: "kestrel",
            sourceActionId: "pray",
          },
          { id: "marked", label: "Marked", remainingTurns: 1, sourceActorId: "wight", sourceActionId: "mark" },
        ],
      }),
    });
  });

  afterEach(async () => {
    await store.close();
  });

  it("shows running cooldowns, statuses in words, and how each skill works", async () => {
    const card = (await getLivingCard(store, schema, "kestrel"))!;
    expect(card.cooldowns).toEqual([
      { actionId: "attack_melee", label: "Attack (melee)", turns: 2 },
      { actionId: REST_ACTION_ID, label: "Rest", turns: 1 },
      { actionId: "forgotten_action", label: "forgotten_action", turns: 3 },
    ]);
    expect(card.statuses).toEqual([
      { id: "blessed", label: "Blessed", remainingTurns: 2, summary: "+2 to checks · STR +1 · luck -1 · Health -2/turn · mystery +1/turn" },
      { id: "marked", label: "Marked", remainingTurns: 1, summary: "" },
    ]);
    const skill = (id: string) => card.skills.find((line) => line.skillId === id)!;
    expect(skill("blade").kind).toBeUndefined();
    expect(skill("keen_eye")).toMatchObject({ kind: "passive" });
    expect(skill("keen_eye").switchedOn).toBeUndefined();
    expect(skill("trance")).toMatchObject({ kind: "toggle", switchedOn: true });
    expect(skill("focus")).toMatchObject({ kind: "toggle", switchedOn: false });
    expect(skill("riposte")).toMatchObject({ kind: "reaction" });
  });

  it("shows nothing for a character carrying no economy state", async () => {
    await store.characters.updateHard("kestrel", makePlayer());
    const card = (await getLivingCard(store, schema, "kestrel"))!;
    expect(card.cooldowns).toEqual([]);
    expect(card.statuses).toEqual([]);
    expect(card.skills.find((line) => line.skillId === "blade")!.switchedOn).toBeUndefined();
  });

  it("shows no economy state in a no-stats story", async () => {
    const card = (await getLivingCard(store, { ...schema, statMode: "none" }, "kestrel"))!;
    expect(card.cooldowns).toEqual([]);
    expect(card.statuses).toEqual([]);
  });
});
