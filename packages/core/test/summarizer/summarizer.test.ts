/**
 * Summarizer tests (low-level-plan §M8, Milestone D, §10 "memory"/context-budget).
 *
 * Covers the three summarizer surfaces against a real in-memory store with a scripted
 * `summarizer`-role router:
 *   • chapter.ts — fires only at threshold, summarizes the OLDEST unsummarized block, tiles
 *     the transcript by index with no gaps/overlaps across successive calls, and never throws
 *     (a model failure is swallowed and reported via onError).
 *   • arc.ts — fires only when enough chapters have accrued beyond the last arc, feeds the
 *     prior arc doc forward, and covers chapters by index.
 *   • injector.ts — condenses the latest arc + since-arc chapters + present soft slices,
 *     omitting empty arc sections and empty stories.
 *
 * Thresholds are set low via settings so tests stay small.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";
import { openStore, type Store } from "../../src/store/index.js";
import type { Router, RolePrompt, ChatResponse } from "../../src/router/index.js";
import { maybeSummarizeChapter, MESSAGES_PER_CHAPTER_KEY } from "../../src/summarizer/chapter.js";
import { maybeSummarizeArc, CHAPTERS_PER_ARC_KEY } from "../../src/summarizer/arc.js";
import { buildMemoryBlock, condenseArcDoc, condenseSoftSlice } from "../../src/summarizer/injector.js";
import { newSoftState, applySoftPatch } from "../../src/memory/softStore.js";
import { makeStory } from "../fixtures.js";
import type { ArcDoc, ArcRecord } from "../../src/index.js";

const STORY_ID = "story-1";

/** A router that returns a scripted JSON string per summarizer call (repeats the last). */
function scriptedRouter(responses: string[]): { router: Router; seen: RolePrompt[] } {
  const seen: RolePrompt[] = [];
  let i = 0;
  const router: Router = {
    bindingFor: () => ({ provider: "openrouter", model: "test", source: "recommended", samplersDirty: false }),
    async complete(_role, prompt: RolePrompt): Promise<ChatResponse> {
      seen.push(prompt);
      const content = responses[Math.min(i, responses.length - 1)] ?? "";
      i++;
      return { content };
    },
    async stream() {
      throw new Error("summarizer never streams");
    },
  };
  return { router, seen };
}

async function seedStory(store: Store): Promise<void> {
  const schema = makeStory({ storyId: STORY_ID });
  await store.stories.insert({ id: STORY_ID, title: schema.title, createdAt: 0, schema, locked: true });
}

/** Seed `n` messages (alternating player/narrator) starting at idx 0. */
async function seedMessages(store: Store, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await store.messages.insert({
      id: `m${i}`,
      storyId: STORY_ID,
      idx: i,
      role: i % 2 === 0 ? "player" : "narrator",
      content: `line ${i}`,
      createdAt: i,
    });
  }
}

/** A complete arc doc (all 14 fields), with a couple populated for injector assertions. */
function fullArcDoc(overrides: Partial<ArcDoc> = {}): ArcDoc {
  return {
    plotSummary: "The vale fell silent.",
    characterDevelopment: ["Kestrel hardened"],
    relationshipDynamics: [],
    secretsRevealed: ["The mayor lied"],
    keyDialogue: [],
    promisesAndOaths: [],
    antagonists: [],
    worldLore: [],
    unresolvedThreads: [],
    stakes: [],
    keyItems: [],
    skillsAndPowers: [],
    limitations: [],
    timeline: [],
    ...overrides,
  };
}

describe("maybeSummarizeChapter", () => {
  let store: Store;
  beforeEach(async () => {
    store = await openStore(":memory:");
    await seedStory(store);
    await store.settings.set(MESSAGES_PER_CHAPTER_KEY, z.number().int().positive(), 4);
  });

  it("does nothing below the threshold", async () => {
    await seedMessages(store, 3);
    const { router } = scriptedRouter(['{"title":"T","summary":"S"}']);
    const chapter = await maybeSummarizeChapter(router, store, STORY_ID);
    expect(chapter).toBeUndefined();
    expect(await store.chapters.listByStory(STORY_ID)).toHaveLength(0);
  });

  it("summarizes exactly one block of `threshold` messages at the threshold", async () => {
    await seedMessages(store, 4);
    const { router, seen } = scriptedRouter(['{"title":"Arrival","summary":"They arrived."}']);
    const chapter = await maybeSummarizeChapter(router, store, STORY_ID);
    expect(chapter).toMatchObject({ idx: 0, msgFrom: 0, msgTo: 3, title: "Arrival" });
    expect(await store.chapters.listByStory(STORY_ID)).toHaveLength(1);
    // The prompt saw exactly the first 4 lines.
    expect(seen[0]!.user).toContain("line 0");
    expect(seen[0]!.user).toContain("line 3");
    expect(seen[0]!.user).not.toContain("line 4");
  });

  it("tiles successive blocks with no gaps or overlaps", async () => {
    await seedMessages(store, 8);
    const { router } = scriptedRouter(['{"title":"A","summary":"a"}', '{"title":"B","summary":"b"}']);
    const c1 = await maybeSummarizeChapter(router, store, STORY_ID);
    const c2 = await maybeSummarizeChapter(router, store, STORY_ID);
    expect(c1).toMatchObject({ idx: 0, msgFrom: 0, msgTo: 3 });
    expect(c2).toMatchObject({ idx: 1, msgFrom: 4, msgTo: 7 });
    // Third call has nothing left.
    expect(await maybeSummarizeChapter(router, store, STORY_ID)).toBeUndefined();
  });

  it("never throws on a model failure; reports via onError and persists nothing", async () => {
    await seedMessages(store, 4);
    const { router } = scriptedRouter(["not json at all"]); // always invalid
    let captured: unknown;
    const chapter = await maybeSummarizeChapter(router, store, STORY_ID, {
      onError: (e) => (captured = e),
    });
    expect(chapter).toBeUndefined();
    expect(captured).toBeDefined();
    expect(await store.chapters.listByStory(STORY_ID)).toHaveLength(0);
  });
});

describe("maybeSummarizeArc", () => {
  let store: Store;
  beforeEach(async () => {
    store = await openStore(":memory:");
    await seedStory(store);
    await store.settings.set(CHAPTERS_PER_ARC_KEY, z.number().int().positive(), 2);
  });

  /** Insert `n` chapters at indices [from, from+n). */
  async function seedChapters(from: number, n: number): Promise<void> {
    for (let i = from; i < from + n; i++) {
      await store.chapters.insert({
        id: `c${i}`,
        storyId: STORY_ID,
        idx: i,
        msgFrom: i * 4,
        msgTo: i * 4 + 3,
        title: `Chapter ${i}`,
        summary: `Summary ${i}`,
      });
    }
  }

  it("does nothing below the chapter threshold", async () => {
    await seedChapters(0, 1);
    const { router } = scriptedRouter([JSON.stringify(fullArcDoc())]);
    expect(await maybeSummarizeArc(router, store, STORY_ID)).toBeUndefined();
    expect(await store.arcs.listByStory(STORY_ID)).toHaveLength(0);
  });

  it("produces an arc doc covering the oldest chapter block at threshold", async () => {
    await seedChapters(0, 2);
    const { router, seen } = scriptedRouter([JSON.stringify(fullArcDoc())]);
    const arc = await maybeSummarizeArc(router, store, STORY_ID);
    expect(arc).toMatchObject({ idx: 0, chapterFrom: 0, chapterTo: 1 });
    expect(arc!.doc.plotSummary).toBe("The vale fell silent.");
    // Prompt included both chapters, no prior arc.
    expect(seen[0]!.user).toContain("Chapter 0");
    expect(seen[0]!.user).toContain("Chapter 1");
    expect(seen[0]!.user).not.toContain("PRIOR ARC DOCUMENT");
  });

  it("feeds the prior arc doc forward into the next arc's prompt", async () => {
    await seedChapters(0, 2);
    const { router: r1 } = scriptedRouter([JSON.stringify(fullArcDoc({ plotSummary: "Arc one." }))]);
    await maybeSummarizeArc(r1, store, STORY_ID);
    // Two more chapters accrue beyond the first arc.
    await seedChapters(2, 2);
    const { router: r2, seen } = scriptedRouter([JSON.stringify(fullArcDoc({ plotSummary: "Arc two." }))]);
    const arc2 = await maybeSummarizeArc(r2, store, STORY_ID);
    expect(arc2).toMatchObject({ idx: 1, chapterFrom: 2, chapterTo: 3 });
    expect(seen[0]!.user).toContain("PRIOR ARC DOCUMENT");
    expect(seen[0]!.user).toContain("Arc one.");
  });

  it("never throws on a model failure", async () => {
    await seedChapters(0, 2);
    const { router } = scriptedRouter(["garbage"]);
    let captured: unknown;
    const arc = await maybeSummarizeArc(router, store, STORY_ID, { onError: (e) => (captured = e) });
    expect(arc).toBeUndefined();
    expect(captured).toBeDefined();
    expect(await store.arcs.listByStory(STORY_ID)).toHaveLength(0);
  });
});

describe("injector — condensing", () => {
  it("condenseArcDoc includes plot and omits empty sections", () => {
    const text = condenseArcDoc(fullArcDoc());
    expect(text).toContain("Plot: The vale fell silent.");
    expect(text).toContain("Secrets: The mayor lied");
    expect(text).toContain("Character development: Kestrel hardened");
    expect(text).not.toContain("Stakes:"); // empty section omitted
    expect(text).not.toContain("Timeline:");
  });

  it("condenseSoftSlice renders name, tier, and top relationships by |trust|", () => {
    let soft = newSoftState("mara", "Mara");
    soft = {
      ...soft,
      current: { mood: "wary", goal: "escape" },
      identity: { ...soft.identity, traits: ["cunning", "quiet"] },
      relationships: [
        { toCharacterId: "kestrel", trust: 0.2, power: 0 },
        { toCharacterId: "warden", trust: -0.9, power: 0.5, feeling: "fears" },
      ],
    };
    const line = condenseSoftSlice(soft);
    expect(line).toContain("Mara [secondary]");
    expect(line).toContain("mood: wary");
    expect(line).toContain("goal: escape");
    // Strongest |trust| (warden, -0.9) must come before the weaker (kestrel, 0.2).
    expect(line.indexOf("warden")).toBeLessThan(line.indexOf("kestrel"));
    expect(line).toContain("fears");
  });

  it("condenseSoftSlice handles a profile with no notable observations", () => {
    const line = condenseSoftSlice(newSoftState("x", "Nobody"));
    expect(line).toContain("Nobody [secondary]");
    expect(line).toContain("no notable observations");
  });

  it("condenseSoftSlice renders relationship names, never raw ids", () => {
    let soft = newSoftState("mara", "Mara");
    soft = {
      ...soft,
      relationships: [
        { toCharacterId: "story-1:scene:warden", trust: -0.9, power: 0.5, feeling: "fears" },
      ],
    };
    const nameOf = (id: string) => (id === "story-1:scene:warden" ? "The Warden" : undefined);
    const line = condenseSoftSlice(soft, nameOf);
    expect(line).toContain("The Warden");
    expect(line).not.toContain("story-1:scene:warden");
  });

  it("condenseSoftSlice falls back to a humanised label for unresolvable ids", () => {
    let soft = newSoftState("mara", "Mara");
    soft = {
      ...soft,
      relationships: [{ toCharacterId: "story-1:scene:unknown-xyz", trust: 0.3, power: 0 }],
    };
    const line = condenseSoftSlice(soft, () => undefined);
    expect(line).not.toMatch(/story-1:scene:/);
  });

  it("condenseSoftSlice surfaces the most recent observations, newest first", () => {
    let soft = newSoftState("mara", "Mara");
    soft = {
      ...soft,
      observations: [
        { turnIdx: 1, text: "found a rusted key" },
        { turnIdx: 2, text: "lied about the fire" },
        { turnIdx: 3, text: "drew a dagger" },
      ],
    };
    const line = condenseSoftSlice(soft);
    expect(line).toContain("drew a dagger");
    // Newest first: the most recent observation appears before an older one.
    expect(line.indexOf("drew a dagger")).toBeLessThan(line.indexOf("lied about the fire"));
  });

  it("condenseSoftSlice caps observations to the most recent few, not the whole capped log", () => {
    let soft = newSoftState("mara", "Mara");
    soft = {
      ...soft,
      observations: Array.from({ length: 50 }, (_, i) => ({ turnIdx: i, text: `event ${i}` })),
    };
    const line = condenseSoftSlice(soft);
    expect(line).toContain("event 49");
    expect(line).not.toContain("event 0");
  });
});

describe("buildMemoryBlock", () => {
  let store: Store;
  beforeEach(async () => {
    store = await openStore(":memory:");
    await seedStory(store);
  });

  it("returns chapters since the latest arc and the condensed arc doc", async () => {
    // Arc covers chapters 0–1; chapter 2 is newer and should appear in the block.
    const arc: ArcRecord = {
      id: "a0",
      storyId: STORY_ID,
      idx: 0,
      chapterFrom: 0,
      chapterTo: 1,
      title: "Arc",
      doc: fullArcDoc(),
    };
    await store.arcs.insert(arc);
    for (let i = 0; i <= 2; i++) {
      await store.chapters.insert({
        id: `c${i}`,
        storyId: STORY_ID,
        idx: i,
        msgFrom: i * 4,
        msgTo: i * 4 + 3,
        title: `Chapter ${i}`,
        summary: `Summary ${i}`,
      });
    }
    const block = await buildMemoryBlock(store, STORY_ID, []);
    expect(block.arc).toContain("Plot: The vale fell silent.");
    expect(block.chapters).toHaveLength(1); // only chapter 2 (after the arc)
    expect(block.chapters[0]).toContain("Chapter 2");
  });

  it("includes soft slices only for present characters that have a soft profile", async () => {
    await store.characters.insert({
      id: "mara",
      storyId: STORY_ID,
      name: "Mara",
      isPlayer: false,
      hard: { characterId: "mara", isPlayer: false, attributes: {}, resources: {}, skills: [], inventory: [], flags: {}, alive: true },
      soft: newSoftState("mara", "Mara"),
      softTier: "secondary",
    });
    const block = await buildMemoryBlock(store, STORY_ID, ["mara", "ghost"]); // ghost has no row
    expect(block.softSlices).toHaveLength(1);
    expect(block.softSlices[0]).toContain("Mara");
  });

  it("has no arc and empty lists for a fresh story", async () => {
    const block = await buildMemoryBlock(store, STORY_ID, []);
    expect(block.arc).toBeUndefined();
    expect(block.chapters).toEqual([]);
    expect(block.softSlices).toEqual([]);
  });

  it("includes world overview when set", async () => {
    await applySoftPatch(
      store,
      STORY_ID,
      { characterOps: [], worldOps: [{ op: "set_overview_hint", text: "war looms in the north" }] },
      1
    );
    const block = await buildMemoryBlock(store, STORY_ID, []);
    expect(block.worldOverview).toBe("war looms in the north");
  });

  it("includes unresolved threads", async () => {
    await applySoftPatch(
      store,
      STORY_ID,
      { characterOps: [], worldOps: [{ op: "add_thread", title: "The debt", note: "owed to a fence" }] },
      1
    );
    const block = await buildMemoryBlock(store, STORY_ID, []);
    expect(block.unresolvedThreads).toHaveLength(1);
    expect(block.unresolvedThreads[0]).toContain("The debt");
  });
});
