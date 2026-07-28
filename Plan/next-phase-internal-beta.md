# Next phase — Internal Beta exit

**Chosen:** 2026-07-28. Goal: satisfy the Internal-Beta exit criteria. Release/sellable work
(signing, updater, CSP, live-model acceptance) is explicitly a **later** phase.

Baseline when the phase started (HEAD `f6e9622`): **579 tests** (core 453 / ui 126). Tauri `0.2.5`.

Source of the gap list: `Audit/PROJECT_STATUS_AUDIT.md` and `Audit/V5_IMPLEMENTATION_STATUS_2026-07-23.md`,
re-grounded against current HEAD (most audit gaps had already been closed by later commits).

## Checklist

- [x] **2. Card-import consolidation.** Retire orphaned `CardCreator` screen; enrich Library's
  import modal (drag-drop, trait chips, sparse-card warning); prove import → Blueprint with tests.
  _Landed 2026-07-28._
- [ ] **1. De-duplicate the CoreBridge.** `bridge/core.ts` (in-memory) and `bridge/sqliteBridge.ts`
  (native) hand-mirror every capability and have drifted (JSON-capability bug in the audit). Extract
  browser-safe shared modules (catalog, capability/sampler metadata, recommendations) so both
  backends read one source of truth. Highest leverage; guarded entirely by the test suite.
- [ ] **3. Packaged SQLite restart-persistence proof.** Automated where possible: create story →
  (simulate close) → reopen → same story/messages/settings restored. Browser-memory tests cannot
  prove packaged SQLite behavior, so target the sqlite bridge path.
- [ ] **4. Remove React `act(...)` warnings** and add missing screen suites (Play at least emits
  them; Character Dossier / Story Blueprint / Design System historically lacked dedicated suites —
  re-check current state, some may now exist).

## Internal-Beta exit criteria (the finish line for this phase)

- A user can create **or import** a story, play it, close the app, reopen it, and continue.
- Tauri restart persistence is tested.
- typecheck + tests + coverage stay green.
- Role Matrix implements the full provider/model/sampler workflow. _(Largely done — verify.)_
- No history op desynchronizes transcript / rulings / hard state / soft state / summaries. _(Done in V2.)_
- UI tests run without `act(...)` warnings.

## Explicitly out of scope this phase (later)

Windows/macOS code signing, updater keypair + host, strict Tauri CSP, live-model acceptance harness,
collapsing the 7 `Design/handoff-*` duplicate trees.
