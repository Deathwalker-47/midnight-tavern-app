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
  "lorebook_entries",
  "lorebooks",
  "messages",
  "personas",
  "rulings",
  "schema_migrations",
  "settings",
  "stories",
  "story_lorebooks",
  "turn_checkpoints",
  "world_soft",
];

/** Number of embedded migrations. Bump when adding one. */
const MIGRATION_COUNT = 5;

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
    ]);
    await db.close();
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
        rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
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
