# HANDOFF — current live state (the baton)

> Overwrite this file each time you stop. It always describes **now** and the **single next action**.
> History goes in [`WORKLOG.md`](WORKLOG.md). Protocol is in [`/AGENTS.md`](../AGENTS.md).

**Updated:** 2026-07-28
**Branch:** `main` (all work below committed)
**Suite:** green — **core 454 / 36 files, ui 133 / 25 files = 587 tests**; `npm run typecheck` clean.
**Active plan:** [`Plan/next-phase-internal-beta.md`](../Plan/next-phase-internal-beta.md) — Internal Beta exit.

## Where we are

All four Internal-Beta-exit **code** items are landed:

1. **CoreBridge drift guard** — `test/bridge/catalogParity.test.ts` locks the in-memory bridge's
   catalog to canonical core; caught + fixed real `MEMORY_KNOWN_MODELS` drift.
2. **Card import** — single path via Library's modal; dead `CardCreator` retired.
3. **Restart persistence** — `packages/core/test/store/persistence.test.ts` proves file-backed
   SQLite survives close + reopen.
4. **act() warnings** — cut 31 → 7 (residual noise only).

## Next action (pick one)

The phase's code work is done. Two things remain before declaring Internal Beta exit *met*:

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
