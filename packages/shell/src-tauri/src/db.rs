// SQLite storage driver for the packaged app — storage-bridge work (D10).
//
// WHY THIS EXISTS (and why not tauri-plugin-sql alone)
// ----------------------------------------------------
// packages/core speaks an async `SqlDriver` seam (exec / select / execBatch / close) and
// orchestrates atomicity itself: `store.transaction(fn)` issues BEGIN … COMMIT (ROLLBACK on
// throw) as SEPARATE calls, running arbitrary reads/writes in between. tauri-plugin-sql is
// backed by an sqlx connection POOL, so those separate calls could land on different pooled
// connections — the BEGIN and COMMIT would not share a session and atomicity would silently
// break (the per-turn "message + rulings + hard-state commit together or not at all" policy,
// §6). So instead of routing storage through the plugin, this module owns a dedicated pool and
// exposes commands that HOLD a single sqlx transaction handle across calls, keyed by id. Every
// statement for a given transaction runs on that one held connection.
//
// sqlx-sqlite accepts `?` positional placeholders directly (same as better-sqlite3), so the
// JS driver passes core's SQL through verbatim — no placeholder translation needed.
//
// This is the ONLY module that opens the packaged app's database connection.

use serde_json::{Map, Value as JsonValue};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions, SqliteRow};
use sqlx::{Column, Executor, Pool, Row, Sqlite, Transaction, TypeInfo, ValueRef};
use std::path::Path;
use std::str::FromStr;
use tauri::async_runtime::Mutex;
use tauri::State;

/// Side-effect result mirrored to core's `RunResult` (`{ changes }`).
#[derive(serde::Serialize)]
pub struct RunResult {
    changes: i64,
}

/// Process-wide database state: one pool plus the live transactions, each parked in a slot and
/// referenced by its index id. `Mutex` is the async (tokio) mutex so a guard may be held across
/// `.await` while a transaction statement runs.
pub struct DbState {
    pool: Pool<Sqlite>,
    txs: Mutex<Vec<Option<Transaction<'static, Sqlite>>>>,
}

impl DbState {
    /// Open (creating if absent) the SQLite database at `path` and build the state. Called once
    /// during app setup; migrations run later, driven by core through these commands.
    pub async fn open(path: &Path) -> Result<Self, String> {
        let url = format!("sqlite://{}", path.to_string_lossy());
        let opts = SqliteConnectOptions::from_str(&url)
            .map_err(|e| e.to_string())?
            .create_if_missing(true);
        let pool = SqlitePoolOptions::new()
            .connect_with(opts)
            .await
            .map_err(|e| e.to_string())?;
        Ok(Self {
            pool,
            txs: Mutex::new(Vec::new()),
        })
    }
}

/// Bind a JSON param array onto a query. core's live schema uses only TEXT/INTEGER/REAL columns,
/// so params are string/number/bool/null in practice; arrays/objects (should not occur) fall back
/// to JSON text defensively. Owned values are moved in, so the bound query carries no borrows.
fn build_query(
    sql: &str,
    params: Vec<JsonValue>,
) -> sqlx::query::Query<'_, Sqlite, sqlx::sqlite::SqliteArguments<'_>> {
    let mut q = sqlx::query(sql);
    for p in params {
        q = match p {
            JsonValue::Null => q.bind(Option::<String>::None),
            JsonValue::Bool(b) => q.bind(b),
            JsonValue::Number(n) => {
                if let Some(i) = n.as_i64() {
                    q.bind(i)
                } else {
                    q.bind(n.as_f64().unwrap_or(0.0))
                }
            }
            JsonValue::String(s) => q.bind(s),
            other => q.bind(other.to_string()),
        };
    }
    q
}

/// Decode one column to JSON by its SQLite storage class. Mirrors what the UI expects back:
/// TEXT→string, INTEGER/NUMERIC/BOOLEAN→number, REAL→number, BLOB→byte array, NULL→null.
fn decode_col(row: &SqliteRow, i: usize) -> JsonValue {
    // Inspect the raw value's type first; the borrow ends before the typed get below.
    let type_name = match row.try_get_raw(i) {
        Ok(raw) => {
            if raw.is_null() {
                return JsonValue::Null;
            }
            raw.type_info().name().to_string()
        }
        Err(_) => return JsonValue::Null,
    };

    match type_name.as_str() {
        "TEXT" => row
            .try_get::<String, _>(i)
            .map(JsonValue::String)
            .unwrap_or(JsonValue::Null),
        "REAL" => row
            .try_get::<f64, _>(i)
            .ok()
            .and_then(serde_json::Number::from_f64)
            .map(JsonValue::Number)
            .unwrap_or(JsonValue::Null),
        "INTEGER" | "NUMERIC" | "BOOLEAN" => row
            .try_get::<i64, _>(i)
            .map(|v| JsonValue::Number(v.into()))
            .unwrap_or(JsonValue::Null),
        "BLOB" => row
            .try_get::<Vec<u8>, _>(i)
            .map(|b| JsonValue::Array(b.into_iter().map(|n| JsonValue::Number(n.into())).collect()))
            .unwrap_or(JsonValue::Null),
        _ => JsonValue::Null,
    }
}

/// Turn a result row into a `{ column: value }` object, matching the plain-object rows core's
/// `select<T>` expects.
fn row_to_object(row: &SqliteRow) -> JsonValue {
    let mut obj = Map::new();
    for (i, col) in row.columns().iter().enumerate() {
        obj.insert(col.name().to_string(), decode_col(row, i));
    }
    JsonValue::Object(obj)
}

// ── Plain (pooled) statements — used outside a transaction ──────────────────────────────────────

#[tauri::command]
pub async fn db_exec(
    state: State<'_, DbState>,
    sql: String,
    params: Vec<JsonValue>,
) -> Result<RunResult, String> {
    let res = build_query(&sql, params)
        .execute(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(RunResult {
        changes: res.rows_affected() as i64,
    })
}

#[tauri::command]
pub async fn db_select(
    state: State<'_, DbState>,
    sql: String,
    params: Vec<JsonValue>,
) -> Result<Vec<JsonValue>, String> {
    let rows = build_query(&sql, params)
        .fetch_all(&state.pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows.iter().map(row_to_object).collect())
}

#[tauri::command]
pub async fn db_batch(state: State<'_, DbState>, sql: String) -> Result<(), String> {
    // Multi-statement DDL script (migrations). `execute` on a &str runs every statement.
    state
        .pool
        .execute(sql.as_str())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Transaction-scoped statements — all bound to one held connection ─────────────────────────────

/// Open a transaction and park it in a free slot, returning that slot's id. core's async lock
/// guarantees at most one transaction is live at a time, but slots are reused defensively.
#[tauri::command]
pub async fn tx_begin(state: State<'_, DbState>) -> Result<usize, String> {
    let tx = state.pool.begin().await.map_err(|e| e.to_string())?;
    let mut txs = state.txs.lock().await;
    if let Some(idx) = txs.iter().position(|t| t.is_none()) {
        txs[idx] = Some(tx);
        Ok(idx)
    } else {
        txs.push(Some(tx));
        Ok(txs.len() - 1)
    }
}

#[tauri::command]
pub async fn tx_exec(
    state: State<'_, DbState>,
    id: usize,
    sql: String,
    params: Vec<JsonValue>,
) -> Result<RunResult, String> {
    let mut txs = state.txs.lock().await;
    let tx = txs
        .get_mut(id)
        .and_then(|t| t.as_mut())
        .ok_or_else(|| format!("no open transaction with id {id}"))?;
    let res = build_query(&sql, params)
        .execute(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;
    Ok(RunResult {
        changes: res.rows_affected() as i64,
    })
}

#[tauri::command]
pub async fn tx_select(
    state: State<'_, DbState>,
    id: usize,
    sql: String,
    params: Vec<JsonValue>,
) -> Result<Vec<JsonValue>, String> {
    let mut txs = state.txs.lock().await;
    let tx = txs
        .get_mut(id)
        .and_then(|t| t.as_mut())
        .ok_or_else(|| format!("no open transaction with id {id}"))?;
    let rows = build_query(&sql, params)
        .fetch_all(&mut **tx)
        .await
        .map_err(|e| e.to_string())?;
    Ok(rows.iter().map(row_to_object).collect())
}

#[tauri::command]
pub async fn tx_batch(state: State<'_, DbState>, id: usize, sql: String) -> Result<(), String> {
    let mut txs = state.txs.lock().await;
    let tx = txs
        .get_mut(id)
        .and_then(|t| t.as_mut())
        .ok_or_else(|| format!("no open transaction with id {id}"))?;
    (&mut **tx)
        .execute(sql.as_str())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn tx_commit(state: State<'_, DbState>, id: usize) -> Result<(), String> {
    let mut txs = state.txs.lock().await;
    let tx = txs
        .get_mut(id)
        .and_then(|t| t.take())
        .ok_or_else(|| format!("no open transaction with id {id}"))?;
    tx.commit().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn tx_rollback(state: State<'_, DbState>, id: usize) -> Result<(), String> {
    let mut txs = state.txs.lock().await;
    // Rollback is best-effort cleanup: if the slot is already empty, treat it as done.
    if let Some(tx) = txs.get_mut(id).and_then(|t| t.take()) {
        tx.rollback().await.map_err(|e| e.to_string())?;
    }
    Ok(())
}
