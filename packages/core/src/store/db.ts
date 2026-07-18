/**
 * Database driver, connection wrapper + migration runner (low-level-plan §3, M1 step 2 — async
 * seam added in the storage-bridge work, D10).
 *
 * WHY THIS IS ASYNC
 * -----------------
 * core originally spoke synchronous `better-sqlite3`. The packaged Tauri app has no Node runtime,
 * so storage there goes through a Rust-side SQLite connection reached over IPC — which is async.
 * To let ONE codebase serve both, every store operation is now a Promise. Two drivers implement
 * the same {@link SqlDriver} seam:
 *   • better-sqlite3 (Node + tests) — see `betterSqliteDriver.ts`, loaded lazily so the native
 *     addon never enters the browser/webview module graph.
 *   • the Tauri command bridge (packaged app) — injected by the UI façade via {@link openDbWith}.
 *
 * TRANSACTIONS
 * ------------
 * The drivers expose only raw single-statement exec/select plus BEGIN/COMMIT/ROLLBACK; atomicity
 * is orchestrated HERE. `transaction(fn)` takes an exclusive async lock for the whole callback and
 * issues one BEGIN…COMMIT (ROLLBACK on throw). Reads/writes performed *inside* the callback run on
 * the same locked connection, so the per-turn "message + rulings + hard-state commit together or
 * not at all" policy (§6) holds even though the Tauri driver pools connections underneath.
 * Single-user app: full serialization is correct and contention is a non-issue.
 *
 * This is the ONLY module that runs migrations or defines the connection wrapper. Repositories take
 * the returned {@link Db} handle and speak `?`-placeholder SQL (identical across both drivers).
 */

/** A value bindable to a `?` placeholder. SQLite stores these as its native column types. */
export type SqlParam = string | number | bigint | boolean | null | Uint8Array;

/** Result of a side-effecting statement. `changes` is the number of rows inserted/updated/deleted. */
export interface RunResult {
  changes: number;
}

/**
 * The low-level async driver both backends implement. Statements use `?` positional placeholders
 * (better-sqlite3 and rusqlite agree on this syntax). `exec`/`select` run a SINGLE statement;
 * `execBatch` runs multi-statement DDL with no params (migrations only).
 */
export interface SqlDriver {
  /**
   * Run one statement for its side effects (INSERT/UPDATE/DELETE/PRAGMA/BEGIN/COMMIT), returning
   * the number of rows the statement changed. Both backends can report this (better-sqlite3's
   * `info.changes`, rusqlite's `execute` return value); repos use it to detect no-op updates.
   */
  exec(sql: string, params: readonly SqlParam[]): Promise<RunResult>;
  /** Run one query and return every row as a plain object keyed by column name. */
  select<T>(sql: string, params: readonly SqlParam[]): Promise<T[]>;
  /** Run a multi-statement script (schema DDL). No parameters. */
  execBatch(sql: string): Promise<void>;
  /** Close the underlying connection. */
  close(): Promise<void>;
}

/** A live, fully-migrated database handle. Repositories take this. */
export interface Db {
  /** Run a statement for its side effects, returning the number of rows it changed. */
  run(sql: string, ...params: SqlParam[]): Promise<RunResult>;
  /** Return the first row, or undefined when the query matches nothing. */
  get<T>(sql: string, ...params: SqlParam[]): Promise<T | undefined>;
  /** Return every matching row in query order. */
  all<T>(sql: string, ...params: SqlParam[]): Promise<T[]>;
  /** Run `fn` inside a transaction; commits on return, rolls back if it throws. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  /** Close the connection. */
  close(): Promise<void>;
}

/** A migration: its numeric version, name, and SQL body. Embedded (no filesystem at runtime). */
interface Migration {
  version: number;
  name: string;
  sql: string;
}

/**
 * The embedded schema. Formerly loaded from `migrations/*.sql` via `node:fs`; inlined so the store
 * carries no filesystem dependency and runs identically in Node and the webview. To evolve the
 * schema, append a new entry with the next version — never edit an applied one.
 */
const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: "init",
    // Initial schema (low-level-plan §3). Byte-for-byte the former migrations/001_init.sql. Every
    // *_json column holds a Zod-validated payload; validation lives in the repositories, not here.
    sql: `
CREATE TABLE stories (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  schema_json TEXT NOT NULL,
  locked      INTEGER NOT NULL
);

CREATE TABLE characters (
  id         TEXT PRIMARY KEY,
  story_id   TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  is_player  INTEGER NOT NULL,
  hard_json  TEXT NOT NULL,
  soft_json  TEXT,
  soft_tier  TEXT
);
CREATE INDEX idx_characters_story ON characters(story_id);

CREATE TABLE messages (
  id         TEXT PRIMARY KEY,
  story_id   TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  idx        INTEGER NOT NULL,
  role       TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (story_id, idx)
);
CREATE INDEX idx_messages_story ON messages(story_id, idx);

CREATE TABLE rulings (
  id          TEXT PRIMARY KEY,
  story_id    TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  message_id  TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  ruling_json TEXT NOT NULL
);
CREATE INDEX idx_rulings_story ON rulings(story_id);
CREATE INDEX idx_rulings_message ON rulings(message_id);

CREATE TABLE chapters (
  id       TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  idx      INTEGER NOT NULL,
  msg_from INTEGER NOT NULL,
  msg_to   INTEGER NOT NULL,
  title    TEXT NOT NULL,
  summary  TEXT NOT NULL,
  UNIQUE (story_id, idx)
);
CREATE INDEX idx_chapters_story ON chapters(story_id, idx);

CREATE TABLE arcs (
  id           TEXT PRIMARY KEY,
  story_id     TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  idx          INTEGER NOT NULL,
  chapter_from INTEGER NOT NULL,
  chapter_to   INTEGER NOT NULL,
  title        TEXT NOT NULL,
  doc_json     TEXT NOT NULL,
  UNIQUE (story_id, idx)
);
CREATE INDEX idx_arcs_story ON arcs(story_id, idx);

CREATE TABLE world_soft (
  story_id  TEXT PRIMARY KEY REFERENCES stories(id) ON DELETE CASCADE,
  soft_json TEXT NOT NULL
);

CREATE TABLE lorebook (
  id       TEXT PRIMARY KEY,
  story_id TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  keys     TEXT NOT NULL,
  content  TEXT NOT NULL,
  enabled  INTEGER NOT NULL
);
CREATE INDEX idx_lorebook_story ON lorebook(story_id);

CREATE TABLE personas (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  is_default  INTEGER NOT NULL
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`,
  },
];

/**
 * Apply every migration whose version is greater than the highest already recorded in
 * `schema_migrations`. Each migration + its bookkeeping row commit together (own transaction), so a
 * failed migration leaves the DB at the last good version.
 */
async function migrate(driver: SqlDriver, migrations: readonly Migration[]): Promise<void> {
  await driver.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version    INTEGER PRIMARY KEY,
       name       TEXT NOT NULL,
       applied_at INTEGER NOT NULL
     )`,
    []
  );

  const rows = await driver.select<{ version: number }>(
    "SELECT version FROM schema_migrations",
    []
  );
  const applied = new Set(rows.map((r) => r.version));

  // Migrations are sorted ascending so versions apply in order.
  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  for (const m of ordered) {
    if (applied.has(m.version)) continue;
    await driver.exec("BEGIN", []);
    try {
      await driver.execBatch(m.sql);
      await driver.exec(
        "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
        [m.version, m.name, Date.now()]
      );
      await driver.exec("COMMIT", []);
    } catch (err) {
      await driver.exec("ROLLBACK", []).catch(() => {});
      throw err;
    }
  }
}

/** Build the {@link Db} wrapper over a driver, with the serialized-transaction lock. */
function makeDb(driver: SqlDriver): Db {
  // Exclusive async lock. `lock` is the tail of the queue; each transaction chains onto it so only
  // one runs at a time and its statements never interleave with another's BEGIN…COMMIT.
  let lock: Promise<unknown> = Promise.resolve();

  return {
    run(sql, ...params) {
      return driver.exec(sql, params);
    },
    async get<T>(sql: string, ...params: SqlParam[]): Promise<T | undefined> {
      const rows = await driver.select<T>(sql, params);
      return rows[0];
    },
    all<T>(sql: string, ...params: SqlParam[]): Promise<T[]> {
      return driver.select<T>(sql, params);
    },
    transaction<T>(fn: () => Promise<T>): Promise<T> {
      // Chain onto the lock: wait for any in-flight transaction, then run ours. The `.catch(()=>{})`
      // on the predecessor keeps one transaction's failure from poisoning the queue.
      const run = lock.catch(() => {}).then(async () => {
        await driver.exec("BEGIN", []);
        try {
          const result = await fn();
          await driver.exec("COMMIT", []);
          return result;
        } catch (err) {
          await driver.exec("ROLLBACK", []).catch(() => {});
          throw err;
        }
      });
      lock = run;
      return run;
    },
    close() {
      return driver.close();
    },
  };
}

/**
 * Open a store over an already-constructed driver and bring it fully up to date. This is the seam
 * the UI façade uses to inject the Tauri command driver; Node/tests use {@link openDb}.
 */
export async function openDbWith(driver: SqlDriver): Promise<Db> {
  await driver.exec("PRAGMA journal_mode = WAL", []);
  await driver.exec("PRAGMA foreign_keys = ON", []);
  await migrate(driver, MIGRATIONS);
  return makeDb(driver);
}

/**
 * Open (or create) a better-sqlite3-backed database at `path` and migrate it. Node + tests only:
 * the driver module is imported dynamically so the native addon never loads in the webview.
 *
 * @param path  A filesystem path, or `:memory:` for an ephemeral DB (used by tests).
 */
export async function openDb(path: string): Promise<Db> {
  const { makeBetterSqliteDriver } = await import("./betterSqliteDriver.js");
  return openDbWith(makeBetterSqliteDriver(path));
}
