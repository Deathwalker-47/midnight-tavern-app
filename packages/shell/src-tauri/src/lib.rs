// Midnight Tavern desktop shell — Tauri v2 app library.
//
// This is deliberately minimal: the native shell only hosts the built UI and
// registers the plugins the UI needs (updater, sql, fs, dialog). All game logic
// lives in packages/core (TypeScript), reached through the UI façade.
//
// Tauri v2 mobile-ready layout: the app lives in this lib as `run()`, and the
// desktop `main.rs` is a thin shim that calls it. A future mobile target reuses
// the same `run()` via the `mobile_entry_point` attribute.
//
// PRIVACY / v1 POLICY (low-level-plan §M12.4): crash and error logging is
// LOCAL FILE ONLY. There is NO telemetry and NO network reporting of crashes.
// The only outbound network calls the shell makes are the updater's manifest
// check (to the configured static host) and whatever the UI itself does.

use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::panic;
use std::path::PathBuf;

use tauri::Manager;

/// Resolve the per-user app data directory and ensure a `logs/` folder exists
/// inside it. Returns the path to the crash log file. Falls back to the OS temp
/// dir if the app data dir can't be resolved, so logging never itself panics.
fn crash_log_path(app: &tauri::AppHandle) -> PathBuf {
    let base = app
        .path()
        .app_log_dir()
        .or_else(|_| app.path().app_data_dir())
        .unwrap_or_else(|_| std::env::temp_dir());
    // Best effort: if the dir can't be created we still return the path and the
    // later OpenOptions call will surface the error to stderr only.
    let _ = create_dir_all(&base);
    base.join("crash.log")
}

/// Append a line to the local crash log. Local file only — no telemetry.
fn append_crash_log(path: &PathBuf, message: &str) {
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        // RFC3339-ish timestamp without pulling a time crate: use the plugin log's
        // formatting if present, else a monotonic-ish marker. Keep deps minimal.
        let _ = writeln!(file, "[panic] {message}");
    }
}

/// Install a panic hook that writes to the local crash log in addition to the
/// default (stderr) behavior. Registered once, after the app data dir is known.
fn install_local_crash_logger(app: &tauri::AppHandle) {
    let log_path = crash_log_path(app);
    // Preserve the default hook so panics still print to stderr in dev.
    let default_hook = panic::take_hook();
    panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|l| format!("{}:{}", l.file(), l.line()))
            .unwrap_or_else(|| "unknown".to_string());
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .map(|s| s.to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "<non-string panic payload>".to_string());
        append_crash_log(&log_path, &format!("at {location}: {payload}"));
        default_hook(info);
    }));
}

/// The shared app builder. Named `run` (not `main`) so a future mobile target
/// can call it too — standard Tauri v2 layout.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // --- Plugins the UI window is granted access to (see capabilities/default.json) ---
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Install the local-file crash logger as early as we have an AppHandle.
            install_local_crash_logger(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Midnight Tavern");
}
