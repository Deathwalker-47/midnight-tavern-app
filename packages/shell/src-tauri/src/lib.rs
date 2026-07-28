// Midnight Tavern desktop shell - Tauri v2 app library.
//
// The native shell hosts the built UI and registers the plugins it needs. All game
// logic lives in packages/core (TypeScript), reached through the UI facade.
//
// PRIVACY: crash and error logging is local-file-only. There is no telemetry and no
// network reporting of logs. The log plugin keeps a bounded set of rotated files.

use std::fs::create_dir_all;
use std::panic;

use tauri::Manager;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

mod db;

/// Install a panic hook that writes through the bounded local logger while preserving
/// Rust's default stderr output. No panic details are sent over the network.
fn install_local_crash_logger() {
    let default_hook = panic::take_hook();
    panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|location| format!("{}:{}", location.file(), location.line()))
            .unwrap_or_else(|| "unknown".to_string());
        let payload = info
            .payload()
            .downcast_ref::<&str>()
            .map(|message| message.to_string())
            .or_else(|| info.payload().downcast_ref::<String>().cloned())
            .unwrap_or_else(|| "<non-string panic payload>".to_string());
        log::error!(target: "crash", "event=rust.panic location={location} message={payload}");
        default_hook(info);
    }));
}

/// Build and run the shared desktop application.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir {
                        file_name: Some("midnight-tavern".into()),
                    }),
                ])
                .level(log::LevelFilter::Info)
                .max_file_size(5_000_000)
                .rotation_strategy(RotationStrategy::KeepSome(3))
                .timezone_strategy(TimezoneStrategy::UseLocal)
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        // Native HTTP so model-provider calls bypass webview CORS (see Cargo.toml note).
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            db::db_exec,
            db::db_select,
            db::db_batch,
            db::tx_begin,
            db::tx_exec,
            db::tx_select,
            db::tx_batch,
            db::tx_commit,
            db::tx_rollback,
        ])
        .setup(|app| {
            install_local_crash_logger();
            log::info!(
                target: "app",
                "event=app.start version={}",
                app.package_info().version
            );

            let db_path = app.path().app_data_dir().map_err(|error| {
                log::error!(target: "storage", "event=db.path.error error={error}");
                format!("no app data dir: {error}")
            })?;
            create_dir_all(&db_path).map_err(|error| {
                log::error!(target: "storage", "event=db.directory.error error={error}");
                format!("create app data dir: {error}")
            })?;
            let db_file = db_path.join("midnight-tavern.db");
            let state =
                tauri::async_runtime::block_on(db::DbState::open(&db_file)).map_err(|error| {
                    log::error!(target: "storage", "event=db.open.error error={error}");
                    format!("open database: {error}")
                })?;
            app.manage(state);
            log::info!(target: "storage", "event=db.open.success");

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Midnight Tavern");
}
