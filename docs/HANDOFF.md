# HANDOFF — current live state (the baton)

> Overwrite this file each time you stop. It always describes **now** and the **single next action**.
> History goes in [`WORKLOG.md`](WORKLOG.md). Protocol is in [`/AGENTS.md`](../AGENTS.md).

**Updated:** 2026-07-28
**Branch:** `main` (v0.2.7 fix committed locally; not pushed)
**Suite:** green — **core 460 / 36 files, UI 135 / 25 files = 595 tests**; typecheck and production
Windows build clean.
**Active plan:** [`Plan/next-phase-internal-beta.md`](../Plan/next-phase-internal-beta.md) — Internal
Beta exit.

## Where we are

The packaged Jerusalem Man test exposed three related Play problems; all are now covered by
regression tests:

- Re-entering the same Play route no longer invalidates an active turn/regeneration. The global
  Zustand operation continues streaming and publishes its authoritative snapshot when complete.
- Classifier intents now carry scene stakes. Valid unopposed narration-only actions auto-succeed
  without a die or XP; attacks, deception, opposition, concrete danger, deadlines, scarcity, costs,
  and any tracked mechanical effect still roll. Gates remain authoritative.
- Authority auditing now rejects only an exact conflict with a ruling. If both narrator drafts truly
  fail, the deterministic fallback uses readable prose and never exposes UUIDs, actor IDs, or raw
  “DM resolves” diagnostics.
- Automatic rulings are journaled distinctly from denials and rolls.
- Fresh unsigned Windows installers built as **v0.2.7**:
  - NSIS: `packages/shell/src-tauri/target/release/bundle/nsis/Midnight Tavern_0.2.7_x64-setup.exe`
    — SHA-256 `F4ADCC8C602514A08AA1C7E9D485F490FD286788AC2920ECCE25F8E5ED9312A7`
  - MSI: `packages/shell/src-tauri/target/release/bundle/msi/Midnight Tavern_0.2.7_x64_en-US.msi`
    — SHA-256 `4C522431E64159FF03F3E82093E11BEBA76E4F0A76F79D561A47FAB464D295DA`

## Single next action

**Human: install v0.2.7 and test one long turn while navigating away from Play and back.** Confirm:

1. the turn remains visible/running and completes without being resent;
2. ordinary prayer, conversation, maintenance, or safe travel does not produce gratuitous failure
   rolls; and
3. an attack or genuinely dangerous/opposed action still produces a DM ruling.

If any case fails, preserve Settings → Open Logs immediately after the turn. After manual acceptance,
the remaining Internal-Beta task is the seven pre-existing React `act(...)` warnings. Do not start
signing/updater/CSP work until the human explicitly starts the release phase.

## Watch-outs

- A missing `MechanicalIntent.stakes` deliberately preserves legacy conservative roll behavior.
  Live classifier output defaults it to `none`, while deterministic attack/deception/consequence
  checks prevent understated stakes from bypassing mechanics.
- Routine automatic success grants no XP, preventing safe-action grinding.
- In-memory bridge catalog remains a deliberate hand-synced copy; `catalogParity.test.ts` guards it.
- GateGuard fact-gates the first edit of each file; follow `AGENTS.md`.
