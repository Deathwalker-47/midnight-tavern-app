/**
 * Migration runner + connection tests (store/db.ts).
 *
 * Proves the DB opens fully migrated, migrations are idempotent across reopens, and the
 * pragmas the store relies on (FK cascade) are actually in force.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../../src/store/db.js";

/** The 10 tables from §3, plus the runner's bookkeeping table. */
const EXPECTED_TABLES = [
  "arcs",
  "chapters",
  "characters",
  "lorebook",
  "messages",
  "personas",
  "rulings",
  "schema_migrations",
  "settings",
  "stories",
  "world_soft",
];

function tableNames(db: ReturnType<typeof openDb>): string[] {
  return (
    db.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[]
  ).map((r) => r.name);
}

describe("openDb / migrations", () => {
  it("creates every §3 table on a fresh in-memory DB", () => {
    const db = openDb(":memory:");
    expect(tableNames(db)).toEqual(EXPECTED_TABLES);
    db.close();
  });

  it("records the applied migration exactly once", () => {
    const db = openDb(":memory:");
    const rows = db.sqlite.prepare("SELECT version, name FROM schema_migrations").all();
    expect(rows).toEqual([{ version: 1, name: "init" }]);
    db.close();
  });

  it("is idempotent: reopening a file DB re-applies nothing", () => {
    const dir = mkdtempSync(join(tmpdir(), "mt-db-"));
    const path = join(dir, "test.db");
    try {
      const first = openDb(path);
      first.close();
      const second = openDb(path);
      const count = second.sqlite
        .prepare("SELECT COUNT(*) AS n FROM schema_migrations")
        .get() as { n: number };
      expect(count.n).toBe(1);
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("enforces foreign keys: deleting a story cascades to its children", () => {
    const db = openDb(":memory:");
    db.sqlite
      .prepare("INSERT INTO stories (id, title, created_at, schema_json, locked) VALUES (?,?,?,?,?)")
      .run("s1", "S", 0, "{}", 1);
    db.sqlite
      .prepare(
        "INSERT INTO messages (id, story_id, idx, role, content, created_at) VALUES (?,?,?,?,?,?)"
      )
      .run("m1", "s1", 0, "player", "hi", 0);

    db.sqlite.prepare("DELETE FROM stories WHERE id = ?").run("s1");

    const remaining = db.sqlite
      .prepare("SELECT COUNT(*) AS n FROM messages WHERE story_id = ?")
      .get("s1") as { n: number };
    expect(remaining.n).toBe(0);
    db.close();
  });

  it("rejects an orphan child insert (FK violation)", () => {
    const db = openDb(":memory:");
    expect(() =>
      db.sqlite
        .prepare(
          "INSERT INTO messages (id, story_id, idx, role, content, created_at) VALUES (?,?,?,?,?,?)"
        )
        .run("m1", "nope", 0, "player", "hi", 0)
    ).toThrow(/FOREIGN KEY/i);
    db.close();
  });

  it("runs work inside a transaction and rolls back on throw", () => {
    const db = openDb(":memory:");
    db.sqlite.exec("CREATE TABLE t (x INTEGER)");
    expect(() =>
      db.transaction(() => {
        db.sqlite.prepare("INSERT INTO t VALUES (1)").run();
        throw new Error("boom");
      })
    ).toThrow("boom");
    const count = db.sqlite.prepare("SELECT COUNT(*) AS n FROM t").get() as { n: number };
    expect(count.n).toBe(0);
    db.close();
  });
});
