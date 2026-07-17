/**
 * Database connection + migration runner (low-level-plan §3, M1 step 2).
 *
 * One SQLite file per install. `openDb` opens the connection, applies pragmas, and runs
 * any unapplied numbered migrations from `migrations/` inside a transaction — so the DB
 * is always fully migrated before any repository touches it.
 *
 * This is the ONLY module that opens a connection or reads migration SQL. Repositories
 * receive the returned `Db` handle; no other code constructs `better-sqlite3` directly.
 */
import Database from "better-sqlite3";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/** The underlying better-sqlite3 connection type (re-exported so callers stay decoupled). */
export type Sqlite = Database.Database;

/** A migration file discovered on disk: its numeric version, name, and SQL body. */
interface Migration {
  version: number;
  name: string;
  sql: string;
}

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

/** A live, fully-migrated database handle. Repositories take this. */
export interface Db {
  /** The raw connection. Only repositories (and this module) may use it. */
  readonly sqlite: Sqlite;
  /** Run `fn` inside a transaction; commits on return, rolls back if it throws. */
  transaction<T>(fn: () => T): T;
  /** Close the connection. */
  close(): void;
}

/** Read and sort migration files (`NNN_name.sql`) by their numeric prefix, ascending. */
function loadMigrations(dir: string): Migration[] {
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
  const migrations = files.map((file) => {
    const match = /^(\d+)_(.+)\.sql$/.exec(file);
    if (!match) {
      throw new Error(`Migration file "${file}" must be named <number>_<name>.sql`);
    }
    return {
      version: Number(match[1]),
      name: match[2]!,
      sql: readFileSync(join(dir, file), "utf8"),
    };
  });
  migrations.sort((a, b) => a.version - b.version);

  // Reject duplicate version numbers — an ambiguous migration order is a build error.
  for (let i = 1; i < migrations.length; i++) {
    if (migrations[i]!.version === migrations[i - 1]!.version) {
      throw new Error(`Duplicate migration version ${migrations[i]!.version}`);
    }
  }
  return migrations;
}

/**
 * Apply every migration whose version is greater than the highest already recorded in
 * `schema_migrations`. Each migration + its bookkeeping row commit together, so a failed
 * migration leaves the DB at the last good version.
 */
function migrate(sqlite: Sqlite, migrations: Migration[]): void {
  sqlite.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version    INTEGER PRIMARY KEY,
       name       TEXT NOT NULL,
       applied_at INTEGER NOT NULL
     )`
  );

  const applied = new Set<number>(
    sqlite
      .prepare("SELECT version FROM schema_migrations")
      .all()
      .map((r) => (r as { version: number }).version)
  );

  const record = sqlite.prepare(
    "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)"
  );

  for (const m of migrations) {
    if (applied.has(m.version)) continue;
    const runOne = sqlite.transaction(() => {
      sqlite.exec(m.sql);
      record.run(m.version, m.name, Date.now());
    });
    runOne();
  }
}

/**
 * Open (or create) the database at `path` and bring it fully up to date.
 *
 * @param path  A filesystem path, or `:memory:` for an ephemeral DB (used by tests).
 */
export function openDb(path: string): Db {
  const sqlite = new Database(path);
  // WAL for concurrent readers during writes; enforce FKs (cascade deletes rely on it).
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  migrate(sqlite, loadMigrations(MIGRATIONS_DIR));

  return {
    sqlite,
    transaction<T>(fn: () => T): T {
      return sqlite.transaction(fn)();
    },
    close() {
      sqlite.close();
    },
  };
}
