# @midnight-tavern/shell

The desktop host. A [Tauri v2](https://v2.tauri.app/) application that wraps the React UI in a native window and provides the SQLite database the core's store talks to.

## What's here

```
src-tauri/
├─ src/
│  ├─ main.rs     Tauri entry point
│  ├─ lib.rs      app setup, IPC command registration
│  └─ db.rs       the SQLite bridge exposed to the webview
├─ capabilities/
│  └─ default.json  Tauri capability/permission set
├─ tauri.conf.json  window, bundle, and updater configuration
├─ Cargo.toml       Rust dependencies
└─ icons/           app icons
updater/            update manifest scaffolding
```

## How it fits together

The UI runs inside the Tauri webview and, at startup, selects the **SQLite backend before React mounts** — if the database can't be opened it fails visibly rather than silently falling back to the in-memory store. `db.rs` exposes the SQLite operations the core's `sqliteDriver` calls over Tauri IPC. Because `@midnight-tavern/core` keeps its store path free of Node built-ins, the exact same core logic runs here as under the in-memory test driver.

## Running

```bash
# from this package
npm run tauri dev     # dev host + React UI with hot reload
npm run tauri build   # compile a release executable
```

Requires the [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform (a Rust toolchain plus the OS webview/build dependencies).

## Packaging status

Configured but **not yet complete**. The executable compiles, but production release requires work that is still outstanding:

- Windows installer bundling (WiX) — blocked in the audit environment by a proxy CA trust issue during WiX download;
- code signing and macOS notarization;
- a real auto-update host and signing keypair, plus a validated test update;
- a strict Content-Security-Policy and a credential-storage review.

See [`../../Audit/PROJECT_STATUS_AUDIT.md`](../../Audit/PROJECT_STATUS_AUDIT.md) for the full release-readiness checklist.
