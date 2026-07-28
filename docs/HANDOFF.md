# HANDOFF — current live state (the baton)

> Overwrite this file each time you stop. It always describes **now** and the **single next action**.
> History goes in [`WORKLOG.md`](WORKLOG.md). Protocol is in [`/AGENTS.md`](../AGENTS.md).

**Updated:** 2026-07-28
**Branch:** `main` (v0.2.8 fix committed locally; not pushed)
**Suite:** green — **core 463 / 37 files, UI 136 / 25 files = 599 tests**; typecheck,
production Windows build, and `cargo check` clean.
**Active plan:** [`Plan/next-phase-internal-beta.md`](../Plan/next-phase-internal-beta.md) — Internal
Beta exit.

## Where we are

Packaged logs and persisted Jerusalem Man turn operations established the v0.2.7 regression:

- The visible “Invalid response” card followed a safely recovered sealed action. Provider-only
  diagnostics are now silent when valid mechanics were recovered; unresolved or ambiguous
  mechanics still show the recovery controls.
- Classifier output repair is bounded to one retry (two total requests), down from four requests,
  before deterministic catalog recovery.
- The apparent missing narrator prose was the authority wall's emergency fallback. A full narrator
  draft was generated, but harmless JSON-mode variations from the auditor failed schema validation,
  causing a second full narrator generation and then fallback. The audit now normalizes string
  booleans and null contradiction lists.
- If the authority auditor is genuinely unavailable, the app fails closed after the first audit
  instead of paying for another narrator generation. Its emergency result now includes readable
  roll resolution details. A real ruling contradiction still triggers the bounded narrator rewrite.
- Fresh unsigned Windows installers built as **v0.2.8**:
  - NSIS: `packages/shell/src-tauri/target/release/bundle/nsis/Midnight Tavern_0.2.8_x64-setup.exe`
    — SHA-256 `F747FDEADD5CE1EC38151445BE6FB74F52DF4A2851BAF579B547C62DB9680AC1`
  - MSI: `packages/shell/src-tauri/target/release/bundle/msi/Midnight Tavern_0.2.8_x64_en-US.msi`
    — SHA-256 `8D3C1C5D863FF9D359CA9B5A1213DFD5CDDA71789B8CC21F00234381CBF774BF`

## Single next action

**Human: install v0.2.8 and repeat the two Jerusalem Man turns from the screenshots.**

1. “Whisper a prayer under your breath for guidance then Press the Ride” should resolve the sealed
   action without the stale classifier warning.
2. “Both Pistols shoot, then once more” should produce two DM rulings followed by actual narrator
   prose. It must not launch a second full narrator generation merely because the auditor returned
   harmless JSON-mode variants.

If fallback text still appears, open Settings → Open Logs immediately after that turn; the remaining
live provider shape can then be normalized without weakening DM authority. After manual acceptance,
the remaining Internal-Beta task is the seven pre-existing React `act(...)` warnings. Do not start
signing/updater/CSP work until the human explicitly starts the release phase.

## Watch-outs

- Narrator drafts stay buffered until the authority audit passes; unsafe prose is never flashed to
  the player.
- An unavailable authority auditor still fails closed. The faster path removes duplicate narrator
  work but never treats an unaudited draft as authoritative.
- Routine automatic success grants no XP, preventing safe-action grinding.
- In-memory bridge catalog remains a deliberate hand-synced copy; `catalogParity.test.ts` guards it.
- GateGuard fact-gates the first edit of each file; follow `AGENTS.md`.
