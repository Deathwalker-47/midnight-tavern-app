import { describe, expect, it } from "vitest";
import {
  exportStoryJournalCsv,
  exportStoryJournalMarkdown,
  listStoryJournal,
} from "../../src/orchestrator/index.js";
import { openStore, type StoryEventCursor } from "../../src/store/index.js";
import { makeStory } from "../fixtures.js";

describe("Mechanical Journal read model", () => {
  it("paginates without gaps, resolves chapters, and exports every event", async () => {
    const store = await openStore(":memory:");
    const schema = makeStory();
    await store.stories.insert({
      id: schema.storyId,
      title: schema.title,
      createdAt: 0,
      schema,
      locked: true,
      rulebookVersion: 1,
    });
    await store.chapters.insert({
      id: "chapter-0",
      storyId: schema.storyId,
      idx: 0,
      msgFrom: 0,
      msgTo: 49,
      title: "First watch",
      summary: "The first closed chapter.",
    });
    await store.chapters.insert({
      id: "chapter-1",
      storyId: schema.storyId,
      idx: 1,
      msgFrom: 50,
      msgTo: 99,
      title: "Second watch",
      summary: "The second closed chapter.",
    });

    // More than the old 500-row export cap. Several events deliberately share both a turn and
    // timestamp so the cursor's id tie-breaker is exercised at page boundaries.
    for (let index = 0; index < 505; index++) {
      await store.events.insert({
        id: `event-${String(index).padStart(4, "0")}`,
        storyId: schema.storyId,
        turnIndex: Math.floor(index / 4),
        kind: "item_gained",
        payload: { ordinal: index },
        rulebookVersion: 1,
        createdAt: Math.floor(index / 3) + 1,
      });
    }

    const collected = [];
    let before: StoryEventCursor | undefined;
    do {
      const page = await listStoryJournal(store, schema.storyId, {
        limit: 100,
        ...(before ? { before } : {}),
      });
      expect(page.events.length).toBeLessThanOrEqual(100);
      collected.push(...page.events);
      before = page.nextCursor;
    } while (before);

    expect(collected).toHaveLength(505);
    expect(new Set(collected.map((event) => event.id)).size).toBe(505);
    expect(collected.find((event) => event.id === "event-0000")?.chapterIndex).toBe(0);
    expect(collected.find((event) => event.id === "event-0200")?.chapterIndex).toBe(1);
    expect(collected.find((event) => event.id === "event-0400")?.chapterIndex).toBe(2);

    const markdown = await exportStoryJournalMarkdown(store, schema.storyId);
    expect(markdown.match(/^- Item Gained/gm) ?? []).toHaveLength(505);
    expect(markdown).toContain("## Chapter 1");
    expect(markdown).toContain("## Chapter 2");
    expect(markdown).toContain("## Chapter 3");

    const csv = await exportStoryJournalCsv(store, schema.storyId);
    expect(csv.trimEnd().split("\n")).toHaveLength(506);
    expect(await exportStoryJournalCsv(store, schema.storyId)).toBe(csv);
    await store.close();
  });
});
