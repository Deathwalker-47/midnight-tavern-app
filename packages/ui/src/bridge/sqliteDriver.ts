/**
 * Tauri SQLite driver — storage-bridge work (D10).
 *
 * Implements core's async {@link SqlDriver} seam (exec / select / execBatch / close) by invoking
 * the shell's Rust storage commands (see packages/shell/src-tauri/src/db.rs). This is the packaged
 * app's counterpart to core's better-sqlite3 driver; the UI façade injects it via `openStoreWith`.
 *
 * TRANSACTION ROUTING
 * -------------------
 * core orchestrates atomicity by issuing BEGIN … COMMIT (ROLLBACK on throw) as separate driver
 * calls, with reads/writes in between (see db.ts `transaction`). tauri-plugin-sql's pooled commands
 * can't hold a transaction across calls, so the Rust side exposes `tx_begin` (returns an id) plus
 * `tx_exec/tx_select/tx_batch/tx_commit/tx_rollback` bound to that one held connection.
 *
 * This driver watches for BEGIN/COMMIT/ROLLBACK: on BEGIN it opens a Rust transaction and remembers
 * the id; while a transaction is open, every exec/select/execBatch routes to the `tx_*` commands;
 * COMMIT/ROLLBACK closes it and clears the id. core serializes transactions with an exclusive async
 * lock, so at most one is ever open — a single `currentTxId` field is sufficient and race-free.
 *
 * sqlx-sqlite takes `?` positional placeholders (same as better-sqlite3), so core's SQL passes
 * through unchanged — no placeholder rewriting here.
 */
import { invoke } from "@tauri-apps/api/core";
import type { RunResult, SqlDriver, SqlParam } from "@midnight-tavern/core";

/** JSON-safe params for IPC. core's live schema uses only string/number/bool/null (no BLOB/bigint),
 * but bigint is coerced to number and bytes to a number[] defensively so the seam stays total. */
type JsonParam = string | number | boolean | null | number[];

function toJsonParam(p: SqlParam): JsonParam {
  if (p === null) return null;
  if (typeof p === "bigint") return Number(p);
  if (p instanceof Uint8Array) return Array.from(p);
  return p;
}

function toJsonParams(params: readonly SqlParam[]): JsonParam[] {
  return params.map(toJsonParam);
}

/** Matches the leading keyword of a transaction-control statement, case-insensitively. */
function txControl(sql: string): "begin" | "commit" | "rollback" | null {
  const head = sql.trimStart().slice(0, 8).toUpperCase();
  if (head.startsWith("BEGIN")) return "begin";
  if (head.startsWith("COMMIT")) return "commit";
  if (head.startsWith("ROLLBACK")) return "rollback";
  return null;
}

/** Build a driver that reaches the shell's Rust SQLite commands over Tauri IPC. */
export function makeSqliteDriver(): SqlDriver {
  // The id of the currently open Rust transaction, or null when none is open.
  let currentTxId: number | null = null;

  return {
    async exec(sql: string, params: readonly SqlParam[]): Promise<RunResult> {
      const control = txControl(sql);

      if (control === "begin") {
        // Open a held transaction; subsequent statements route to it. No rows changed.
        currentTxId = await invoke<number>("tx_begin");
        return { changes: 0 };
      }

      if (control === "commit" || control === "rollback") {
        const id = currentTxId;
        currentTxId = null; // clear first so a failed commit can't leave us "in" a dead tx
        if (id !== null) {
          await invoke(control === "commit" ? "tx_commit" : "tx_rollback", { id });
        }
        return { changes: 0 };
      }

      if (currentTxId !== null) {
        return invoke<RunResult>("tx_exec", {
          id: currentTxId,
          sql,
          params: toJsonParams(params),
        });
      }
      return invoke<RunResult>("db_exec", { sql, params: toJsonParams(params) });
    },

    async select<T>(sql: string, params: readonly SqlParam[]): Promise<T[]> {
      if (currentTxId !== null) {
        return invoke<T[]>("tx_select", {
          id: currentTxId,
          sql,
          params: toJsonParams(params),
        });
      }
      return invoke<T[]>("db_select", { sql, params: toJsonParams(params) });
    },

    async execBatch(sql: string): Promise<void> {
      // Migrations run execBatch INSIDE a BEGIN…COMMIT, so honor the open transaction.
      if (currentTxId !== null) {
        await invoke("tx_batch", { id: currentTxId, sql });
        return;
      }
      await invoke("db_batch", { sql });
    },

    async close(): Promise<void> {
      // The pool lives for the app's lifetime and is dropped on exit; nothing to close per-handle.
    },
  };
}
