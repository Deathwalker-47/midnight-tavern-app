/**
 * Restart persistence — the beta gate the audits flagged as unproven: browser in-memory tests
 * cannot show that packaged SQLite data survives a process restart. This exercises the real
 * on-disk path — `openStore(<file>)` (better-sqlite3, fully migrated) — writes a story, a message,
 * and a setting, CLOSES the connection (simulating app shutdown), then opens a FRESH connection to
 * the same file (simulating relaunch) and asserts everything is still there and readable.
 *
 * The packaged desktop app swaps better-sqlite3 for the Tauri command driver via `openStoreWith`,
 * but the durability contract — data written before close is present after reopen — is identical,
 * and this proves it against a genuine file-backed SQLite database.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { openStore } from "../../src/store/index.js";
import { makeStory } from "../fixtures.js";
import type { StoryRecord, MessageRecord } from "../../src/types/index.js";

const STORY_ID = "restart-story";
const PLAYER_NAME_KEY = "player-name";

describe("SQLite restart persistence (file-backed)", () => {
  it("restores story, messages, and settings after close + reopen", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mt-persist-"));
    const dbPath = join(dir, "midnight.db");

    const story: StoryRecord = {
      id: STORY_ID,
      title: "Embers of the Silent Vale",
      createdAt: 1,
      schema: makeStory({ storyId: STORY_ID, locked: true }),
      locked: true,
    };
    const message: MessageRecord = {
      id: "opening",
      storyId: STORY_ID,
      idx: 0,
      role: "narrator",
      content: "The tide clock stops, and the tavern falls silent.",
      createdAt: 2,
    };

    try {
      // ── Session 1: write, then "close the app". ──────────────────────────────
      const first = await openStore(dbPath);
      await first.stories.insert(story);
      await first.messages.insert(message);
      await first.settings.set(PLAYER_NAME_KEY, z.string(), "Kestrel");
      await first.close();

      // ── Session 2: "relaunch" against the same file. ─────────────────────────
      const second = await openStore(dbPath);
      try {
        const restoredStory = await second.stories.get(STORY_ID);
        expect(restoredStory?.title).toBe("Embers of the Silent Vale");
        expect(restoredStory?.schema.storyId).toBe(STORY_ID);

        const restoredMessages = await second.messages.listByStory(STORY_ID);
        expect(restoredMessages.map((m) => m.content)).toEqual([message.content]);

        expect(await second.settings.get(PLAYER_NAME_KEY, z.string())).toBe("Kestrel");

        // A fresh story list also sees exactly the one persisted story.
        expect((await second.stories.list()).map((s) => s.id)).toEqual([STORY_ID]);
      } finally {
        await second.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
