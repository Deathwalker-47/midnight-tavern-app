/**
 * Migration runner + connection tests (store/db.ts).
 *
 * Proves the DB opens fully migrated, migrations are idempotent across reopens, and the
 * pragmas the store relies on (FK cascade) are actually in force. Everything goes through the
 * async {@link Db} facade (`run`/`get`/`all`/`transaction`) — the raw connection is no longer
 * exposed, and `db.ts` orchestrates transactions itself.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb, type Db } from "../../src/store/db.js";

/** The 10 tables from §3, plus the runner's bookkeeping table. */
const EXPECTED_TABLES = [
  "arcs",
  "chapters",
  "characters",
  "equipment_assignments",
  "item_definitions",
  "item_instances",
  "lorebook_entries",
  "lorebooks",
  "messages",
  "personas",
  "rulebook_snapshots",
  "rulings",
  "schema_migrations",
  "settings",
  "stories",
  "story_events",
  "story_lorebooks",
  "turn_checkpoints",
  "turn_operations",
  "world_soft",
];

/** Number of embedded migrations. Bump when adding one. */
const MIGRATION_COUNT = 16;

async function tableNames(db: Db): Promise<string[]> {
  const rows = await db.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  );
  return rows.map((r) => r.name);
}

describe("openDb / migrations", () => {
  it("creates every §3 table on a fresh in-memory DB", async () => {
    const db = await openDb(":memory:");
    expect(await tableNames(db)).toEqual(EXPECTED_TABLES);
    await db.close();
  });

  it("records the applied migration exactly once", async () => {
    const db = await openDb(":memory:");
    const rows = await db.all("SELECT version, name FROM schema_migrations ORDER BY version");
    expect(rows).toEqual([
      { version: 1, name: "init" },
      { version: 2, name: "story_blueprint" },
      { version: 3, name: "global_lorebooks" },
      { version: 4, name: "story_persona" },
      { version: 5, name: "checkpoints" },
      { version: 6, name: "variant_soft_states" },
      { version: 7, name: "v7_story_runtime" },
      { version: 8, name: "v7_turn_operations_and_journal" },
      { version: 9, name: "v7_runtime_items_and_equipment" },
      { version: 10, name: "v7_rulebook_snapshots" },
      { version: 11, name: "character_scene_presence" },
      { version: 12, name: "checkpoint_scene_presence" },
      { version: 13, name: "remove_false_nothing_character" },
      { version: 14, name: "turn_operation_stage_metrics" },
      { version: 15, name: "checkpoint_character_identity" },
      { version: 16, name: "remove_false_pronoun_characters" },
    ]);
    await db.close();
  });

  it("defaults character rows to present", async () => {
    const db = await openDb(":memory:");
    await db.run(
      "INSERT INTO stories (id, title, created_at, schema_json, locked) VALUES (?,?,?,?,?)",
      "s1",
      "S",
      0,
      "{}",
      1
    );
    await db.run(
      `INSERT INTO characters (id, story_id, name, is_player, hard_json)
       VALUES (?, ?, ?, ?, ?)`,
      "c1",
      "s1",
      "Character",
      0,
      "{}"
    );

    const row = await db.get<{ present: number }>(
      "SELECT present FROM characters WHERE id = ?",
      "c1"
    );
    expect(row?.present).toBe(1);
    await db.close();
  });

  it("removes the auto-promoted Nothing phantom on upgrade", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mt-db-"));
    const path = join(dir, "nothing-upgrade.db");
    try {
      const seeded = await openDb(path);
      await seeded.run(
        "INSERT INTO stories (id, title, created_at, schema_json, locked) VALUES (?,?,?,?,?)",
        "s1",
        "S",
        0,
        "{}",
        1
      );
      await seeded.run(
        `INSERT INTO characters (id, story_id, name, is_player, hard_json)
         VALUES (?, ?, ?, ?, ?)`,
        "s1:scene:nothing",
        "s1",
        "Nothing",
        0,
        "{}"
      );
      await seeded.run(
        "INSERT INTO messages (id, story_id, idx, role, content, created_at) VALUES (?,?,?,?,?,?)",
        "m1",
        "s1",
        0,
        "narrator",
        "Nothing moves in the vast quiet.",
        0
      );
      await seeded.run(
        `INSERT INTO turn_checkpoints (
           id, story_id, message_id, turn_index, hard_pre_json, soft_pre_json,
           world_pre_json, presence_pre_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        "cp1",
        "s1",
        "m1",
        0,
        '{"s1:scene:nothing":{},"keep":{}}',
        '{"s1:scene:nothing":null}',
        null,
        '{"s1:scene:nothing":true,"keep":true}',
        0
      );
      // Recreate the exact v12-to-v13 upgrade boundary.
      await seeded.run("DELETE FROM schema_migrations WHERE version = 13");
      await seeded.close();

      const upgraded = await openDb(path);
      expect(
        await upgraded.get("SELECT id FROM characters WHERE id = ?", "s1:scene:nothing")
      ).toBeUndefined();
      const checkpoint = await upgraded.get<{
        hard_pre_json: string;
        soft_pre_json: string;
        presence_pre_json: string;
      }>("SELECT hard_pre_json, soft_pre_json, presence_pre_json FROM turn_checkpoints");
      expect(JSON.parse(checkpoint!.hard_pre_json)).toEqual({ keep: {} });
      expect(JSON.parse(checkpoint!.soft_pre_json)).toEqual({});
      expect(JSON.parse(checkpoint!.presence_pre_json)).toEqual({ keep: true });
      await upgraded.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Windows may hold the native SQLite handle briefly; OS temp cleanup will reclaim it.
      }
    }
  });

  it("removes unreferenced pronoun and ordinal phantoms without deleting a mechanical actor", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mt-db-"));
    const path = join(dir, "pronoun-upgrade.db");
    try {
      const seeded = await openDb(path);
      for (const storyId of ["s1", "s2"]) {
        await seeded.run(
          "INSERT INTO stories (id, title, created_at, schema_json, locked) VALUES (?,?,?,?,?)",
          storyId,
          storyId,
          0,
          "{}",
          1
        );
      }
      for (const name of ["He", "It", "Third"]) {
        await seeded.run(
          `INSERT INTO characters (id, story_id, name, is_player, hard_json)
           VALUES (?, ?, ?, ?, ?)`,
          `s1:scene:${name.toLocaleLowerCase("en-US")}`,
          "s1",
          name,
          0,
          "{}"
        );
      }
      await seeded.run(
        `INSERT INTO characters (id, story_id, name, is_player, hard_json)
         VALUES (?, ?, ?, ?, ?)`,
        "s2:scene:he",
        "s2",
        "He",
        0,
        "{}"
      );
      await seeded.run(
        "INSERT INTO messages (id, story_id, idx, role, content, created_at) VALUES (?,?,?,?,?,?)",
        "m1",
        "s1",
        0,
        "narrator",
        "It moved. Third, the creature left tracks. He studied you.",
        0
      );
      await seeded.run(
        `INSERT INTO story_events (
           id, story_id, turn_index, actor_id, kind, payload_json, rulebook_version, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        "e1",
        "s2",
        0,
        "s2:scene:he",
        "automatic",
        "{}",
        1,
        0
      );
      const ghostMap =
        '{"s1:scene:he":{},"s1:scene:it":{},"s1:scene:third":{},"keep":{}}';
      await seeded.run(
        `INSERT INTO turn_checkpoints (
           id, story_id, message_id, turn_index, hard_pre_json, soft_pre_json,
           world_pre_json, presence_pre_json, identity_pre_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        "cp1",
        "s1",
        "m1",
        0,
        ghostMap,
        ghostMap,
        null,
        ghostMap,
        ghostMap,
        0
      );
      await seeded.run("DELETE FROM schema_migrations WHERE version = 16");
      await seeded.close();

      const upgraded = await openDb(path);
      expect(
        await upgraded.all<{ name: string }>(
          "SELECT name FROM characters WHERE story_id = ? ORDER BY name",
          "s1"
        )
      ).toEqual([]);
      expect(
        await upgraded.get("SELECT id FROM characters WHERE id = ?", "s2:scene:he")
      ).toBeDefined();
      const checkpoint = await upgraded.get<{
        hard_pre_json: string;
        soft_pre_json: string;
        presence_pre_json: string;
        identity_pre_json: string;
      }>(
        `SELECT hard_pre_json, soft_pre_json, presence_pre_json, identity_pre_json
         FROM turn_checkpoints WHERE id = ?`,
        "cp1"
      );
      for (const value of [
        checkpoint!.hard_pre_json,
        checkpoint!.soft_pre_json,
        checkpoint!.presence_pre_json,
        checkpoint!.identity_pre_json,
      ]) {
        expect(JSON.parse(value)).toEqual({ keep: {} });
      }
      await upgraded.close();
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // Windows may hold the native SQLite handle briefly; OS temp cleanup will reclaim it.
      }
    }
  });

  it("is idempotent: reopening a file DB re-applies nothing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mt-db-"));
    const path = join(dir, "test.db");
    try {
      const first = await openDb(path);
      await first.close();
      const second = await openDb(path);
      const count = await second.get<{ n: number }>(
        "SELECT COUNT(*) AS n FROM schema_migrations"
      );
      // One row per migration; reopening applies nothing new. Track the full migration set.
      expect(count?.n).toBe(MIGRATION_COUNT);
      await second.close();
    } finally {
      // On Windows the DB file handle can linger a tick after close(); retry the unlink.
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        await new Promise((r) => setTimeout(r, 50));
        try {
          rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
        } catch {
          // Windows can retain a native SQLite handle beyond the test process tick. The database
          // assertions have already completed; OS temp cleanup will reclaim this directory.
        }
      }
    }
  });

  it("enforces foreign keys: deleting a story cascades to its children", async () => {
    const db = await openDb(":memory:");
    await db.run(
      "INSERT INTO stories (id, title, created_at, schema_json, locked) VALUES (?,?,?,?,?)",
      "s1",
      "S",
      0,
      "{}",
      1
    );
    await db.run(
      "INSERT INTO messages (id, story_id, idx, role, content, created_at) VALUES (?,?,?,?,?,?)",
      "m1",
      "s1",
      0,
      "player",
      "hi",
      0
    );

    await db.run("DELETE FROM stories WHERE id = ?", "s1");

    const remaining = await db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM messages WHERE story_id = ?",
      "s1"
    );
    expect(remaining?.n).toBe(0);
    await db.close();
  });

  it("rejects an orphan child insert (FK violation)", async () => {
    const db = await openDb(":memory:");
    await expect(
      db.run(
        "INSERT INTO messages (id, story_id, idx, role, content, created_at) VALUES (?,?,?,?,?,?)",
        "m1",
        "nope",
        0,
        "player",
        "hi",
        0
      )
    ).rejects.toThrow(/FOREIGN KEY/i);
    await db.close();
  });

  it("runs work inside a transaction and rolls back on throw", async () => {
    const db = await openDb(":memory:");
    await db.run("CREATE TABLE t (x INTEGER)");
    await expect(
      db.transaction(async () => {
        await db.run("INSERT INTO t VALUES (1)");
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    const count = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM t");
    expect(count?.n).toBe(0);
    await db.close();
  });
});
