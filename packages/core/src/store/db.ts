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
  {
    version: 2,
    name: "story_blueprint",
    // Story Blueprint (low-level-plan-v2 §3): the author-facing identity/style/premise fields.
    // Nullable — legacy stories and bootstrap-only stories have no blueprint. Style-only; NEVER
    // carries mechanics (the schema_json wall is untouched). Validated in the stories repository.
    sql: `
ALTER TABLE stories ADD COLUMN blueprint_json TEXT;
`,
  },
  {
    version: 3,
    name: "global_lorebooks",
    // Global lorebooks (low-level-plan-v2 §2): lorebooks become first-class, story-independent
    // entities with a many-to-many link to stories, replacing the v1 per-story `lorebook` table.
    // DECISION (locked): fresh schema, NO data-copy — no shipped DBs exist pre-release, so we drop
    // the old table and create the new ones cleanly. `enabled` lives at BOTH the link level
    // (story_lorebooks.enabled) and the entry level (lorebook_entries.enabled); context assembly
    // requires both. `always_on` entries inject regardless of keyword match.
    sql: `
DROP TABLE IF EXISTS lorebook;

CREATE TABLE lorebooks (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  source      TEXT NOT NULL              -- "user" | "imported_card" | "migrated"
);

CREATE TABLE lorebook_entries (
  id              TEXT PRIMARY KEY,
  lorebook_id     TEXT NOT NULL REFERENCES lorebooks(id) ON DELETE CASCADE,
  keys            TEXT NOT NULL,          -- JSON string[]
  content         TEXT NOT NULL,
  enabled         INTEGER NOT NULL,
  always_on       INTEGER NOT NULL,
  priority        INTEGER NOT NULL,
  insertion_order INTEGER NOT NULL
);
CREATE INDEX idx_lorebook_entries_book ON lorebook_entries(lorebook_id);

CREATE TABLE story_lorebooks (
  story_id    TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  lorebook_id TEXT NOT NULL REFERENCES lorebooks(id) ON DELETE CASCADE,
  enabled     INTEGER NOT NULL,
  PRIMARY KEY (story_id, lorebook_id)
);
CREATE INDEX idx_story_lorebooks_story ON story_lorebooks(story_id);
`,
  },
  {
    version: 4,
    name: "story_persona",
    // Per-story active persona (low-level-plan-v2 §4). Personas are already global; this adds an
    // optional per-story selection. NULL ⇒ fall back to the global default persona.
    sql: `
ALTER TABLE stories ADD COLUMN active_persona_id TEXT;
`,
  },
  {
    version: 5,
    name: "checkpoints",
    // Swipe / delete / rewind support (low-level-plan-v2 §6). turn_checkpoints stores the pre-image
    // of ALL characters' hard + soft state and world soft BEFORE a turn's commits — because soft
    // state is model-derived and cannot be replayed, we snapshot rather than invert deltas. Written
    // at commit time inside the same per-turn transaction. messages gains a variants array (narrator
    // prose regenerations) and the active variant index; active_variant defaults to 0 (the original).
    sql: `
CREATE TABLE turn_checkpoints (
  id             TEXT PRIMARY KEY,
  story_id       TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  message_id     TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  turn_index     INTEGER NOT NULL,
  hard_pre_json  TEXT NOT NULL,
  soft_pre_json  TEXT NOT NULL,
  world_pre_json TEXT,
  created_at     INTEGER NOT NULL
);
CREATE INDEX idx_turn_checkpoints_story ON turn_checkpoints(story_id, turn_index);
CREATE INDEX idx_turn_checkpoints_message ON turn_checkpoints(message_id);

ALTER TABLE messages ADD COLUMN variants_json TEXT;
ALTER TABLE messages ADD COLUMN active_variant INTEGER NOT NULL DEFAULT 0;
`,
  },
  {
    version: 6,
    name: "variant_soft_states",
    // Swipe integrity (low-level-plan-v2 §6 steps 4-5). Each narrator variant produces its OWN
    // analyzer patch, so the soft/world memory that matches variant K differs from variant J. We
    // store, per variant, the post-analyzer soft+world snapshot (a JSON array parallel to
    // variants_json). Regenerating a variant re-runs the analyzer and appends its snapshot; cycling
    // ‹ › between existing variants just restores that variant's stored snapshot — no model call,
    // and the shown prose can never disagree with the stored soft state.
    sql: `
ALTER TABLE messages ADD COLUMN variant_states_json TEXT;
`,
  },
  {
    version: 7,
    name: "v7_story_runtime",
    // V7 story-scoped play controls. Difficulty is deliberately mutable from the next turn;
    // action_budget and the mechanical config snapshot are part of the sealed rulebook.
    sql: `
ALTER TABLE stories ADD COLUMN difficulty_json TEXT;
ALTER TABLE stories ADD COLUMN action_budget INTEGER NOT NULL DEFAULT 2;
ALTER TABLE stories ADD COLUMN rulebook_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE stories ADD COLUMN config_snapshot_json TEXT;
`,
  },
  {
    version: 8,
    name: "v7_turn_operations_and_journal",
    // A turn operation keeps already-rolled rulings stable across narrator retry, cancellation,
    // timeout, and app restart. story_events is the append-only, reader-facing mechanical journal.
    sql: `
CREATE TABLE turn_operations (
  id                   TEXT PRIMARY KEY,
  story_id             TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  player_message_id    TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  narrator_message_id  TEXT,
  state                TEXT NOT NULL,
  classified_json      TEXT,
  rulings_json         TEXT,
  staged_json          TEXT,
  prose                TEXT,
  error_kind           TEXT,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_turn_operations_player ON turn_operations(player_message_id);
CREATE INDEX idx_turn_operations_story ON turn_operations(story_id, updated_at);

CREATE TABLE story_events (
  id                TEXT PRIMARY KEY,
  story_id          TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  message_id        TEXT REFERENCES messages(id) ON DELETE CASCADE,
  turn_index        INTEGER NOT NULL,
  chapter_index     INTEGER,
  actor_id          TEXT,
  kind              TEXT NOT NULL,
  payload_json      TEXT NOT NULL,
  rulebook_version  INTEGER NOT NULL,
  created_at        INTEGER NOT NULL
);
CREATE INDEX idx_story_events_story ON story_events(story_id, turn_index, created_at);
CREATE INDEX idx_story_events_message ON story_events(message_id);
CREATE INDEX idx_story_events_kind ON story_events(story_id, kind);
`,
  },
  {
    version: 9,
    name: "v7_runtime_items_and_equipment",
    // Items are defined only when a validated DM loot proposal is awarded during play. They are
    // separate from the frozen StorySchema, and only item instances assigned to these seven slots
    // can contribute equipment effects.
    sql: `
CREATE TABLE item_definitions (
  id                   TEXT PRIMARY KEY,
  story_id             TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  description          TEXT NOT NULL,
  tier                 TEXT NOT NULL,
  kind                 TEXT NOT NULL,
  slot_compatibility_json TEXT NOT NULL,
  hands_required       INTEGER NOT NULL,
  unique_item          INTEGER NOT NULL,
  stacking_key         TEXT,
  requires_skill       TEXT,
  effects_json         TEXT NOT NULL,
  props_json           TEXT NOT NULL,
  tags_json            TEXT NOT NULL,
  config_version       INTEGER NOT NULL,
  created_at           TEXT NOT NULL
);
CREATE INDEX idx_item_definitions_story ON item_definitions(story_id, created_at);

CREATE TABLE item_instances (
  id                   TEXT PRIMARY KEY,
  story_id             TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  owner_character_id   TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  definition_id        TEXT NOT NULL REFERENCES item_definitions(id) ON DELETE CASCADE,
  quantity             INTEGER NOT NULL,
  acquired_at          TEXT NOT NULL,
  provenance_json      TEXT NOT NULL
);
CREATE INDEX idx_item_instances_owner ON item_instances(owner_character_id, acquired_at);
CREATE INDEX idx_item_instances_story ON item_instances(story_id, acquired_at);

CREATE TABLE equipment_assignments (
  character_id         TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  slot                 TEXT NOT NULL CHECK (
    slot IN ('primary','secondary','head','body','utility','accessory_1','accessory_2')
  ),
  item_instance_id     TEXT NOT NULL REFERENCES item_instances(id) ON DELETE CASCADE,
  PRIMARY KEY (character_id, slot)
);
CREATE INDEX idx_equipment_instance ON equipment_assignments(item_instance_id);
`,
  },
  {
    version: 10,
    name: "v7_rulebook_snapshots",
    // Direct rulebook regeneration is destructive, so retain a complete opaque mechanical
    // pre-image before installing the replacement. Restore tooling can be added without changing
    // the snapshot format because the payload is versioned JSON.
    sql: `
CREATE TABLE rulebook_snapshots (
  id                TEXT PRIMARY KEY,
  story_id          TEXT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  rulebook_version  INTEGER NOT NULL,
  snapshot_json     TEXT NOT NULL,
  created_at        INTEGER NOT NULL
);
CREATE INDEX idx_rulebook_snapshots_story
  ON rulebook_snapshots(story_id, rulebook_version, created_at);
`,
  },
  {
    version: 11,
    name: "character_scene_presence",
    // Registry membership and active-scene presence are separate facts. Existing characters remain
    // present by default so upgrading a story cannot silently empty its active cast.
    sql: `
ALTER TABLE characters ADD COLUMN present INTEGER NOT NULL DEFAULT 1;
CREATE INDEX idx_characters_story_present
  ON characters(story_id, present, is_player, name);
`,
  },
  {
    version: 12,
    name: "checkpoint_scene_presence",
    // Rewind/delete must restore scene membership independently from registry membership.
    sql: `
ALTER TABLE turn_checkpoints ADD COLUMN presence_pre_json TEXT NOT NULL DEFAULT '{}';
`,
  },
  {
    version: 13,
    name: "remove_false_nothing_character",
    // The former proper-name heuristic treated sentence-initial "Nothing moves ..." as an NPC.
    // Remove only that auto-promoted id when it never participated in mechanics, and scrub its
    // checkpoint keys so future rewind/delete cannot try to restore the deleted phantom.
    sql: `
UPDATE turn_checkpoints
SET hard_pre_json = json_remove(
      hard_pre_json,
      '$."' || story_id || ':scene:nothing"'
    ),
    soft_pre_json = json_remove(
      soft_pre_json,
      '$."' || story_id || ':scene:nothing"'
    ),
    presence_pre_json = json_remove(
      presence_pre_json,
      '$."' || story_id || ':scene:nothing"'
    )
WHERE EXISTS (
  SELECT 1
  FROM characters c
  WHERE c.story_id = turn_checkpoints.story_id
    AND c.id = c.story_id || ':scene:nothing'
    AND lower(c.name) = 'nothing'
    AND c.is_player = 0
    AND NOT EXISTS (SELECT 1 FROM story_events e WHERE e.actor_id = c.id)
    AND NOT EXISTS (SELECT 1 FROM item_instances i WHERE i.owner_character_id = c.id)
);

DELETE FROM characters
WHERE id = story_id || ':scene:nothing'
  AND lower(name) = 'nothing'
  AND is_player = 0
  AND NOT EXISTS (SELECT 1 FROM story_events e WHERE e.actor_id = characters.id)
  AND NOT EXISTS (
    SELECT 1 FROM item_instances i WHERE i.owner_character_id = characters.id
  );
`,
  },
  {
    version: 14,
    name: "turn_operation_stage_metrics",
    // Stage timings are persisted with the durable operation so restart/recovery diagnostics retain
    // the same bounded-provider evidence that the live callback observes.
    sql: `
ALTER TABLE turn_operations ADD COLUMN stage_metrics_json TEXT;
`,
  },
  {
    version: 15,
    name: "checkpoint_character_identity",
    // Identity enrichment is timeline state: rewind must restore the provisional name that was
    // known before a narrator-established canonical identity landed.
    sql: `
ALTER TABLE turn_checkpoints ADD COLUMN identity_pre_json TEXT NOT NULL DEFAULT '{}';
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
