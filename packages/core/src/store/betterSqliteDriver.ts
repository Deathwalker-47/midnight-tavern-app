/**
 * better-sqlite3 driver (Node + tests only) — storage-bridge work, D10.
 *
 * Adapts the synchronous better-sqlite3 addon to the async {@link SqlDriver} seam by resolving its
 * results into Promises. This is the ONLY module that imports `better-sqlite3`, and `db.ts` loads
 * it via dynamic `import()` so the native addon never enters the webview module graph (the packaged
 * app uses the Tauri command driver instead).
 *
 * The connection is a single better-sqlite3 handle, so the BEGIN…COMMIT that `db.ts` issues around
 * a transaction all run on the same connection — the atomicity guarantee the store relies on.
 */
import Database from "better-sqlite3";
import type { RunResult, SqlDriver, SqlParam } from "./db.js";

/** Build a driver over a new better-sqlite3 connection at `path` (`:memory:` for tests). */
export function makeBetterSqliteDriver(path: string): SqlDriver {
  const sqlite = new Database(path);

  return {
    async exec(sql: string, params: readonly SqlParam[]): Promise<RunResult> {
      const info = sqlite.prepare(sql).run(...(params as SqlParam[]));
      return { changes: info.changes };
    },
    async select<T>(sql: string, params: readonly SqlParam[]): Promise<T[]> {
      return sqlite.prepare(sql).all(...(params as SqlParam[])) as T[];
    },
    async execBatch(sql: string): Promise<void> {
      sqlite.exec(sql);
    },
    async close(): Promise<void> {
      sqlite.close();
    },
  };
}
