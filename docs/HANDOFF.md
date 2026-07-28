# HANDOFF — current live state (the baton)

> Overwrite this file each time you stop. It always describes **now** and the **single next action**.
> History goes in [`WORKLOG.md`](WORKLOG.md). Protocol is in [`/AGENTS.md`](../AGENTS.md).

**Updated:** 2026-07-28
**Branch:** `main` (classifier fix committed locally; not pushed)
**Suite:** green — **core 458 / 36 files, UI 133 / 25 files = 591 tests**; typecheck and production
build clean.
**Active plan:** [`Plan/next-phase-internal-beta.md`](../Plan/next-phase-internal-beta.md) — Internal
Beta exit.

## Where we are

The human confirmed v0.2.5 can forge through the native provider transport, then exposed a packaged
classifier failure on the first Jerusalem Man turn.

- The provider returned non-empty classifier JSON on all four attempts; strict structure validation
  rejected every response, so the app correctly paused mechanics and narrated conservatively.
- Classifier validation now accepts harmless JSON-mode shape variations while sealed enum validation
  remains authoritative.
- After exhausted structured repair, exact uniquely owned sealed labels/ids/aliases can recover one
  or more player actions deterministically. Unknown actions and ambiguous targets still fail closed.
- The reported sentence names `Reload and Clean` and `Press the Ride`; a regression test now proves
  both survive an invalid provider response in player order.
- Fresh unsigned Windows installers built as **v0.2.6**:
  - NSIS: `packages/shell/src-tauri/target/release/bundle/nsis/Midnight Tavern_0.2.6_x64-setup.exe`
    — SHA-256 `E3B0B867DCCEAE3ABCFA21C4E0D9CADB35BE2014C29DD758D72643B3F866ED6C`
  - MSI: `packages/shell/src-tauri/target/release/bundle/msi/Midnight Tavern_0.2.6_x64_en-US.msi`
    — SHA-256 `715C7C4986BB91DA2C1C80BB73F60619A099A110259D39298487863CA21821E3`

## Single next action

**Human: install v0.2.6 and submit a new turn in Jerusalem Man**, ideally the same two-action
sentence. Confirm that the turn produces DM rulings instead of the invalid-response pause. The old
failed v0.2.5 message remains narration-only intentionally; it is not retroactively rerun.

If the new turn still pauses, immediately use Settings → Open Logs and preserve the latest log. The
next agent should inspect the final structured validation paths before changing provider/model
configuration.

After that, complete the packaged-app acceptance sequence (play → close → reopen → resume, history
operations, logs) and optionally remove the seven remaining React `act(...)` test warnings. Do not
start signing/updater/CSP work until the human explicitly starts the release phase.

## Watch-outs

- `ClassifierRecoveryMetadata` deliberately distinguishes narration-only from partial mechanics.
  Do not surface provider output as a successful ruling unless sealed-id validation or the exact
  deterministic fallback accepted it.
- In-memory bridge catalog remains a deliberate hand-synced copy; `catalogParity.test.ts` guards it.
- GateGuard fact-gates the first edit of each file; follow `AGENTS.md`.
