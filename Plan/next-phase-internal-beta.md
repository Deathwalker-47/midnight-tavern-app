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
- [x] **1. De-duplicate the CoreBridge (drift guard).** The eager/lazy import boundary in
  `bridge/core.ts` is deliberate (keeps core's native runtime out of the webview bundle), so instead
  of breaking it, `test/bridge/catalogParity.test.ts` now locks the in-memory catalog to canonical
  core — it caught + fixed real `MEMORY_KNOWN_MODELS` drift. Drift now fails CI. _Landed 2026-07-28._
- [x] **3. Packaged SQLite restart-persistence proof.** `packages/core/test/store/persistence.test.ts`
  opens a real file-backed store, writes story/message/setting, closes, reopens, asserts survival.
  _Landed 2026-07-28._
- [~] **4. React `act(...)` warnings 31 → 7.** Play mount-loads guarded under `debugState`;
  StorySettings tests flush the mount effect. Residual 7 (5 `RulingBlock` reveal-timer in the Play
  ruling test + 1 Play + 1 Overview) remain — flush the reveal timer / await the Overview load to
  finish. Screen suites for CharacterDossier + StoryBlueprint already exist; DesignSystem still lacks
  a dedicated one (optional). _Partial 2026-07-28._
- [x] **5. Packaged classifier structured-output recovery.** Normalize harmless JSON-mode
  variations (`null` optional fields, missing conservative containers, numeric confidence strings)
  while retaining sealed actor/action/skill enums. If structured repair still fails, recover only
  exact, uniquely named catalog labels/ids/aliases; unknown actions and ambiguous targets remain
  narration-only. Reproduced the Jerusalem Man two-action turn in tests. _Landed 2026-07-28._
- [x] **6. Persistent in-flight play + low-friction rulings.** Re-entering the same Play route now
  reuses its active global turn/regeneration operation instead of invalidating it. The classifier
  records scene stakes; valid unopposed narration-only actions auto-succeed without dice or XP,
  while attacks, deception, opposition, concrete danger, deadlines, scarcity, costs, and tracked
  effects still roll. Authority-auditor false positives were narrowed and the deterministic fallback
  now reads as story prose without UUIDs or debug arithmetic. _Landed 2026-07-28._

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
