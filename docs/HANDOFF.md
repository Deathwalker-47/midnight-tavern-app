# HANDOFF — current live state (the baton)

> Overwrite this file each time you stop. It always describes **now** and the **single next action**.
> History goes in [`WORKLOG.md`](WORKLOG.md). Protocol is in [`/AGENTS.md`](../AGENTS.md).

**Updated:** 2026-07-28
**Branch:** `main` (all work below committed + pushed)
**Suite:** green — **core 454 / 36 files, ui 133 / 25 files = 587 tests**; `npm run typecheck` clean.
**Active plan:** [`Plan/next-phase-internal-beta.md`](../Plan/next-phase-internal-beta.md) — Internal Beta exit.

## Where we are

All four Internal-Beta-exit **code** items landed (bridge drift guard, card import, restart
persistence, act() 31→7). **Plus a critical packaged-app fix from the human's first test:**

- **Forge "Failed to fetch" → fixed.** Provider HTTP now runs natively (Rust) via
  `tauri-plugin-http`, injected into `core.makeRouter`/`makeProvider` on the sqlite path — browser
  CORS no longer blocks provider calls. Browser-dev bridge unchanged.
- **Player name** now derives from the persona (removed the separate Blueprint field).
- **Build reproducibility:** `.cargo/config.toml` sets `http.check-revoke=false` (proxy's TLS
  revocation endpoint is unreachable; new crates otherwise fail to fetch).
- Fresh installers built: **v0.2.5**, NSIS `b9a8cca0…`, MSI `84364cb4…` under
  `packages/shell/src-tauri/target/release/bundle/`.

## Next action (pick one)

**FIRST: the human must confirm forging actually works end-to-end** in the new build (live provider
call). The transport fix compiles + tests pass, but a real provider round-trip is unverified here.
If it still fails, get Settings → Open Logs (role + error) — could be key/endpoint/model config.

Then, before declaring Internal Beta exit *met*:

- **(human) manual packaged-app pass** — follow the acceptance sequence in
  `Audit/V5_IMPLEMENTATION_STATUS_2026-07-23.md` §"Recommended packaged-app acceptance sequence":
  create/import → play → close → reopen → resume; verify rulings, rewind/delete, logs.
- **(optional polish) last 7 act() warnings** — all in `Play.test.tsx` ruling-reveal
  (`RulingBlock`/`RulingArtifact` reveal timer, 5) and `Overview.test.tsx` load (1) + 1 Play. Fix by
  flushing the reveal timer / awaiting the Overview load in those tests (same pattern used in
  `StorySettings.test.tsx`).

Do **not** start the next (release/sellable) phase — signing, updater keypair+host, strict Tauri CSP,
and the live-model acceptance harness are explicitly deferred. Only begin them if the human says so.

## Watch-outs

- In-memory bridge catalog is a deliberate hand-synced copy; keep it in step and let
  `catalogParity.test.ts` enforce it. `CardImportResult.spec` already includes the `"Card format …"`
  prefix — don't double it.
- `core.ts` has CRLF/LF churn in git history (no `.gitattributes`); harmless but noisy.
- GateGuard hook fact-gates the first edit of each file (see AGENTS.md → Rules of the road).
