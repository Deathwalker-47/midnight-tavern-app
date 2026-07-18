# Midnight Tavern — Release, Signing, Notarization & Auto-Update

This is the authoritative guide for turning the source in this monorepo into
signed, auto-updating installers for Windows and macOS. It is milestone **M12**.

> **Status in this repo:** everything here is *configuration and scaffolding*.
> No `cargo` / `tauri build` has been (or can be) run in the current environment:
> there is no Rust toolchain, no signing certificates, and no Apple notarization
> credentials. The commands below are what a properly-equipped machine or CI
> runner must execute. See **"Blocked in this environment"** at the end for the
> exact list of human-supplied secrets and toolchain.

---

## 0. Architecture recap (why the shell is thin)

- `packages/ui` — React app. `npm run build` emits `packages/ui/dist`.
- `packages/core` — TypeScript game logic; uses `better-sqlite3` in Node/test.
- `packages/shell` (this package) — Tauri v2 native host. It mounts
  `../../ui/dist` and provides the real SQLite + filesystem.

### Storage seam (D10)

`core` is written against `better-sqlite3` (a synchronous Node-native addon).
Inside Tauri we do **not** ship a Node runtime. We chose **`tauri-plugin-sql`**
(bundled SQLite via `rusqlite`) over a `better-sqlite3` sidecar because it means
one signed binary and a smaller footprint (the reason D10 picked Tauri at all).

Consequence: the UI's core-façade must route storage through the plugin's async
SQL API rather than calling `better-sqlite3` directly in the packaged app. This
seam is a **known follow-up for the façade layer**, not something the shell
resolves. `packages/core` is unchanged by M12. (The alternative — a Node sidecar
running core + better-sqlite3 over IPC — is documented in `Cargo.toml` and was
rejected for footprint/second-binary reasons.)

### Privacy posture (v1)

- **Crash/error logging is local-file only** (`app_log_dir()/crash.log`), via a
  panic hook in `src-tauri/src/main.rs`. **No telemetry, no network crash
  reporting.**
- The only outbound calls the shell itself makes are the **updater manifest
  check** and provider API traffic initiated by the UI.
- The updater is intentionally **soft**: it points at a plain static file host
  and never force-installs. Hosting an update manifest is not content hosting.

---

## 1. Prerequisites (toolchain)

Install on the build machine / CI runner:

1. **Rust** (stable, >= 1.77) via [rustup]. Add targets as needed:
   - Windows: `x86_64-pc-windows-msvc` (default on Windows).
   - macOS universal: `rustup target add aarch64-apple-darwin x86_64-apple-darwin`.
2. **Node >= 20** and `npm` (this monorepo). Run `npm install` at the repo root.
3. **Tauri CLI** — provided as `@tauri-apps/cli` dev-dependency of this package
   (`npm run tauri -- ...`), or install globally.
4. Platform bundler deps:
   - Windows: WiX (MSI) and NSIS are fetched by Tauri on first build; the MSVC
     build tools must be present.
   - macOS: Xcode command-line tools (`xcode-select --install`).

---

## 2. Generate icons (one-time)

The bundle references icons that are not committed. From `packages/shell/`:

```
npx tauri icon path/to/source-1024.png
```

See `src-tauri/icons/README.md`. Without these, the bundle step fails.

---

## 3. Build the frontend, then bundle

Tauri's `beforeBuildCommand` (in `tauri.conf.json`) runs the UI build first, so a
single command produces installers:

```
# from packages/shell/
npm run build                 # -> tauri build  (host-OS installers)
npm run build:windows         # -> msi + nsis   (on Windows)
npm run build:mac-universal   # -> universal dmg (on macOS)
```

Artifacts land under `src-tauri/target/<triple>/release/bundle/`.

> Note: cross-OS bundling is not supported — build Windows artifacts on Windows
> and macOS artifacts on macOS (two CI jobs).

---

## 4. Windows code signing

Populate `tauri.conf.json > bundle.windows`:

| Field                 | Source                                                            |
| --------------------- | ----------------------------------------------------------------- |
| `certificateThumbprint` | SHA-1 thumbprint of your **OV or EV code-signing cert** in the runner's cert store. Currently `null`. |
| `digestAlgorithm`     | `sha256` (already set).                                           |
| `timestampUrl`        | RFC-3161 timestamp server (already set to DigiCert's).           |

The cert itself is supplied to CI as a secret (e.g. a base64 PFX imported into
the machine store, or an HSM/cloud-signing token for EV). Tauri invokes
`signtool` using the thumbprint. EV certs on hardware tokens require the token to
be attached to the runner (or a cloud KMS signing integration).

---

## 5. macOS signing + notarization

### 5a. Sign

Populate `tauri.conf.json > bundle.macOS`:

| Field             | Source                                                                 |
| ----------------- | ---------------------------------------------------------------------- |
| `signingIdentity` | Your **"Developer ID Application: Name (TEAMID)"** identity. Currently `null`. |
| `entitlements`    | `entitlements.plist` (already present, hardened-runtime minimal set).  |
| `hardenedRuntime` | `true` (already set — required for notarization).                      |

The Developer ID cert + private key must be imported into the runner keychain.

### 5b. Notarize (notarytool)

After signing, submit the `.app`/`.dmg` to Apple and staple the ticket:

```
xcrun notarytool submit "Midnight Tavern_universal.dmg" \
  --apple-id "$APPLE_ID" \
  --team-id "$APPLE_TEAM_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD" \
  --wait
xcrun stapler staple "Midnight Tavern_universal.dmg"
```

Tauri can run notarization automatically when these env vars are set at build
time: `APPLE_ID`, `APPLE_TEAM_ID`, `APPLE_PASSWORD` (app-specific password), or
`APPLE_API_KEY` / `APPLE_API_ISSUER` / `APPLE_API_KEY_PATH` for App Store Connect
API-key auth.

---

## 6. Auto-update pipeline

### 6a. Generate the updater signing keypair (one-time)

```
npx tauri signer generate -w ~/.tauri/midnight-tavern.key
```

This prints a **public key** and writes a password-protected **private key**.

- Put the **public key** into `tauri.conf.json > plugins.updater.pubkey`
  (currently `PLACEHOLDER_REPLACE_WITH_OUTPUT_OF_tauri_signer_generate`).
- Keep the **private key** + its password as CI secrets:
  `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

With `bundle.createUpdaterArtifacts: true` (already set), a signed build emits
`*.sig` files next to the update artifacts (the NSIS `.zip` on Windows, the
`.app.tar.gz` on macOS).

### 6b. Host the manifest + artifacts

The updater endpoint (in `tauri.conf.json`) is a placeholder:

```
https://updates.example.com/midnight-tavern/{{target}}/{{arch}}/{{current_version}}
```

Replace `updates.example.com` with your real static host (S3+CloudFront, GitHub
Releases, any plain file host). For each release:

1. Upload the update artifacts.
2. Update `updater/latest.json` (see the example in this package):
   - `version`, `notes`, `pub_date`.
   - For each platform: the `url` to the artifact and the `signature` = the
     **contents of the corresponding `.sig` file** produced in 6a.
3. Serve `latest.json` at the endpoint URL. (You can serve one static
   `latest.json` for all targets — Tauri picks its platform key from the map.)

The app checks this manifest on launch; if a newer `version` is present and its
signature verifies against the embedded `pubkey`, the update is offered.

---

## 7. Licensing cross-reference (M11)

Distribution ties into licensing (see `Plan/low-level-plan.md` §M11):

- **Lemon Squeezy** (merchant-of-record, first choice) hosts the purchase link
  and issues license keys. Human setup: a Lemon Squeezy account, a **product**,
  and the **license API key/store ID** used by `licensing/license.ts` to validate
  pasted keys (14-day offline grace, single check on launch, 14-day trial).
- These are **not** Tauri fields — they are consumed by `packages/core`'s
  licensing module and the UI's Advanced Settings license panel. Listed here so
  the release owner provisions them alongside the signing secrets.

---

## 8. Suggested CI shape

Two jobs (can't cross-compile bundles):

- **windows-latest:** `npm ci` → `npm run build:windows` with Windows cert
  secrets + `TAURI_SIGNING_*` → upload `msi`/`nsis` + `.sig` → update manifest.
- **macos-latest:** `npm ci` → add rust targets → `npm run build:mac-universal`
  with Developer ID keychain + notarytool creds + `TAURI_SIGNING_*` → notarize →
  upload `dmg`/`app.tar.gz` + `.sig` → update manifest.

---

## Blocked in this environment / requires human setup

None of the following exist in the current dev box; each must be supplied by a
human/CI before a real signed, auto-updating release is possible:

| # | Blocker | Populates / used by |
| - | ------- | ------------------- |
| 1 | **Rust toolchain** (rustup + stable Rust, macOS targets, MSVC/Xcode CLI) | ability to run `cargo` / `tauri build` at all |
| 2 | **App icons** — 1024×1024 source + `tauri icon` run | `bundle.icon` paths; `src-tauri/icons/` |
| 3 | **Windows OV/EV code-signing certificate** (SHA-1 thumbprint; cert in machine store or HSM/cloud token) | `bundle.windows.certificateThumbprint` |
| 4 | **Apple Developer ID Application certificate** (+ private key in keychain) | `bundle.macOS.signingIdentity` |
| 5 | **Apple notarization credentials** — `APPLE_ID`, `APPLE_TEAM_ID`, and an **app-specific password** (or App Store Connect API key/issuer) | `notarytool` / Tauri notarization env vars |
| 6 | **Updater signing keypair** via `tauri signer generate` — public key committed, private key + password as CI secrets | `plugins.updater.pubkey`; `TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)`; the `.sig` values in `updater/latest.json` |
| 7 | **Update manifest host** (static file host replacing `updates.example.com`) | `plugins.updater.endpoints`; where `latest.json` + artifacts live |
| 8 | **Lemon Squeezy account + product + license API key/store ID** (M11) | `packages/core` `licensing/license.ts`; not a Tauri field |

Until these are provided, this package delivers correct, parseable config and a
compilable-in-principle Rust entrypoint — but produces **no** installers, and
none should be claimed.
