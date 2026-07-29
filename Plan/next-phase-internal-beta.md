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
  narration-only. Reproduced the Jerusalem Man two-action turn in tests. Classifier repair is
  bounded to one retry, and a provider-only diagnostic is silent when sealed mechanics were fully
  recovered; unresolved actions/targets still surface. Live testing showed two malformed responses
  can occur consecutively, so the bounded structured path now permits a second repair before local
  recovery. _Landed 2026-07-28; hardened again 2026-07-29._
- [x] **6. Persistent in-flight play + low-friction rulings.** Re-entering the same Play route now
  reuses its active global turn/regeneration operation instead of invalidating it. The classifier
  records scene stakes; valid unopposed narration-only actions auto-succeed without dice or XP,
  while attacks, deception, opposition, concrete danger, deadlines, scarcity, costs, and tracked
  effects still roll. Authority-auditor false positives were narrowed and the deterministic fallback
  now reads as story prose without UUIDs. The auditor accepts harmless JSON-mode boolean/null
  variants; an unavailable auditor can no longer trigger a second full narrator generation, and its
  last-resort summary includes the exact human-readable resolution. _Landed 2026-07-28; hardened in
  v0.2.8._
- [~] **7. Same-turn NPC agency + progressive authority-safe narration.** Packaged v0.2.8 testing
  confirmed that NPC mechanics are only extracted from prior prose for persisted present characters,
  so prose-only entities remain passive and same-turn reactions are absent. Mechanical turns also
  buffer the whole narrator draft until a whole-response audit succeeds, preventing visible
  streaming and compounding 48–113 second live turn latency. Add engine-approved scene-entity
  promotion, deterministic-first NPC decisions after player resolution, separate NPC action budget,
  immutable narrative contracts, progressively verified paragraph/beat delivery, bounded stage
  deadlines/fallbacks, and first-safe-chunk telemetry. _Partial 2026-07-29: deterministic
  counter-reactions, bounded narrated-NPC registration/promotion, separate NPC budget, and safe
  narrative-prefix streaming landed. _Task 1 completed 2026-07-29:_ registry membership and active
  scene presence are now separate persisted facts (`characters.present`) with filtered repository
  access and safe default migration behavior. _Task 2 completed 2026-07-29:_ presence is now
  authoritative across active consumers and rollback-safe through checkpoint pre-images. Live DM
  rulings are delivered to Play before the first narrator delta. The sentence-initial “Nothing
  moves…” false-positive is rejected, and migration 13 removes the existing unused phantom.
  Still open: responsive default models._

  _Tasks 3–4 completed 2026-07-29 (`350f805`): one bounded, engine-validated NPC
  introduction/presence stage now runs before classification and narration; transitions commit
  atomically, narrator-only prose cannot create characters, and a pre-existing undocumented
  creature can be registered and targeted instead of misrouting attacks to an older NPC. Player
  intents are normalized to the active player, and denied ruling cards identify their actor.
  Engine-owned universal attack defaults now damage the lethal resource; death remains authoritative
  only when that resource reaches zero._

  _Tasks 5-9 completed 2026-07-29 (`04e83b7` through `a803f76`): present NPCs can pursue validated
  sealed goals under a separate budget; sealed non-combat provocation is deterministic; safe prose
  reaches Play before provider completion; verified mechanical prose releases beat-by-beat; and all
  five provider-backed turn stages are deadline-bounded with authority-safe fallbacks and persisted
  latency/outcome telemetry. Genuine cancellation wins even when a provider ignores abort._

## Internal-Beta exit criteria (the finish line for this phase)

- A user can create **or import** a story, play it, close the app, reopen it, and continue.
- Tauri restart persistence is tested.
- typecheck + tests + coverage stay green.
- Role Matrix implements the full provider/model/sampler workflow. _(Largely done — verify.)_
- No history op desynchronizes transcript / rulings / hard state / soft state / summaries. _(Done in V2.)_
- Consequential NPCs can react or pursue goals in the same turn through authoritative DM rulings;
  prose-only entities cannot bypass persistence, presence, catalogs, or gates.
- Mechanical turns deliver progressively verified prose without exposing narrator text that
  contradicts an immutable DM ruling.
- UI tests run without `act(...)` warnings.

## Explicitly out of scope this phase (later)

Windows/macOS code signing, updater keypair + host, strict Tauri CSP, live-model acceptance harness,
collapsing the 7 `Design/handoff-*` duplicate trees.
