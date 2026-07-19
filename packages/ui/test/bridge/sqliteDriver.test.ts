/**
 * Tests for the Tauri SQLite driver's transaction-routing state machine (sqliteDriver.ts).
 *
 * The driver's job beyond plain pass-through is to translate core's separate BEGIN/COMMIT/ROLLBACK
 * calls into the shell's held-transaction commands (tx_begin → id, then tx_* while open). These
 * tests mock `invoke` and assert that routing, since getting it wrong silently breaks core's
 * per-turn atomicity (the whole reason the Rust held-transaction commands exist).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Tauri IPC entrypoint. `tx_begin` hands back an id; everything else records the call
// and returns a benign shape so the driver's own logic is what we're exercising.
const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (cmd: string, args?: unknown) => invokeMock(cmd, args),
}));

import { makeSqliteDriver } from "../../src/bridge/sqliteDriver.js";

/** Names of the commands invoked, in order — the concise assertion surface for routing. */
function calls(): string[] {
  return invokeMock.mock.calls.map((c) => c[0] as string);
}

beforeEach(() => {
  invokeMock.mockReset();
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "tx_begin") return 0; // the transaction id the Rust side would return
    if (cmd === "db_select" || cmd === "tx_select") return [];
    if (cmd === "db_exec" || cmd === "tx_exec") return { changes: 1 };
    return undefined; // db_batch / tx_batch / tx_commit / tx_rollback
  });
});

describe("makeSqliteDriver transaction routing", () => {
  it("routes plain statements to db_* when no transaction is open", async () => {
    const d = makeSqliteDriver();
    await d.exec("INSERT INTO t VALUES (?)", ["x"]);
    await d.select("SELECT * FROM t", []);
    await d.execBatch("CREATE TABLE t (a)");
    expect(calls()).toEqual(["db_exec", "db_select", "db_batch"]);
  });

  it("opens a held transaction on BEGIN and routes inner statements to tx_*", async () => {
    const d = makeSqliteDriver();
    await d.exec("BEGIN", []);
    await d.exec("UPDATE t SET a = ?", [1]);
    await d.select("SELECT * FROM t", []);
    await d.execBatch("CREATE TABLE u (a)");
    await d.exec("COMMIT", []);

    expect(calls()).toEqual(["tx_begin", "tx_exec", "tx_select", "tx_batch", "tx_commit"]);
    // The inner statements carry the id tx_begin returned.
    const txExec = invokeMock.mock.calls.find((c) => c[0] === "tx_exec");
    expect(txExec?.[1]).toMatchObject({ id: 0, sql: "UPDATE t SET a = ?", params: [1] });
    const commit = invokeMock.mock.calls.find((c) => c[0] === "tx_commit");
    expect(commit?.[1]).toEqual({ id: 0 });
  });

  it("returns to plain routing after COMMIT", async () => {
    const d = makeSqliteDriver();
    await d.exec("BEGIN", []);
    await d.exec("UPDATE t SET a = 1", []);
    await d.exec("COMMIT", []);
    await d.exec("INSERT INTO t VALUES (2)", []); // outside the tx again
    expect(calls()).toEqual(["tx_begin", "tx_exec", "tx_commit", "db_exec"]);
  });

  it("routes ROLLBACK to tx_rollback and clears the open transaction", async () => {
    const d = makeSqliteDriver();
    await d.exec("BEGIN", []);
    await d.exec("UPDATE t SET a = 1", []);
    await d.exec("ROLLBACK", []);
    await d.select("SELECT 1", []); // back to plain
    expect(calls()).toEqual(["tx_begin", "tx_exec", "tx_rollback", "db_select"]);
  });

  it("clears the transaction id even if COMMIT throws (no lingering tx state)", async () => {
    const d = makeSqliteDriver();
    await d.exec("BEGIN", []);
    invokeMock.mockImplementationOnce(async () => {
      throw new Error("commit failed");
    });
    await expect(d.exec("COMMIT", [])).rejects.toThrow("commit failed");
    // Next statement must route as plain (db_*), proving the id was cleared before the failed commit.
    await d.exec("INSERT INTO t VALUES (1)", []);
    expect(calls()).toEqual(["tx_begin", "tx_commit", "db_exec"]);
  });

  it("recognizes lowercase transaction keywords", async () => {
    const d = makeSqliteDriver();
    await d.exec("begin", []);
    await d.exec("commit", []);
    expect(calls()).toEqual(["tx_begin", "tx_commit"]);
  });

  it("maps params: bigint→number, Uint8Array→number[], null passes through", async () => {
    const d = makeSqliteDriver();
    await d.exec("INSERT INTO t VALUES (?, ?, ?)", [10n, new Uint8Array([1, 2]), null]);
    const call = invokeMock.mock.calls.find((c) => c[0] === "db_exec");
    expect(call?.[1]).toMatchObject({ params: [10, [1, 2], null] });
  });
});
