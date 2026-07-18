// Midnight Tavern desktop shell — Tauri v2 desktop entrypoint.
//
// Thin shim: all app setup lives in the library crate's `run()` (see lib.rs) so a
// future mobile target can share it. Standard Tauri v2 layout.

// On Windows release builds, prevent a console window from opening behind the app.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    midnight_tavern_lib::run();
}
