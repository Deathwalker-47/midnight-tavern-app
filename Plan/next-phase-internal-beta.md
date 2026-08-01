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
- [x] **4. React `act(...)` warnings 31 → 0.** Play tests explicitly unmount before shared
  store/route reset and wrap subscribed route updates in `act`; Overview awaits its pending mount
  work inside `act`. Both suites fail if the warning class returns, and the complete UI suite is
  clean on stderr. Screen suites for CharacterDossier + StoryBlueprint already exist; DesignSystem
  still lacks a dedicated one (optional). _Completed 2026-07-29 in `f1d8a4a`._
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
  Remaining in this phase: import/starting-gear and UX acceptance, warning cleanup, and the final
  packaged Internal Beta gate._

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

  _Task 10 completed 2026-07-29 (`a2656e4`): recommendation config v2 uses Gemini Flash as the
  responsive narrator default and labels the retained Opus option as the explicit quality choice.
  Native and browser bridge catalogs remain parity-tested._

  _Task 11 completed 2026-07-29 (`80e3b44`): Forge uses one bounded structured repair and a
  per-fragment deadline, distinguishes immediate caller cancellation from timeout even when a
  provider ignores abort, and retains validated checkpoints in a durable Forge operation. Wizard
  and Blueprint creation rehydrate, resume, or explicitly discard retained work after navigation
  or restart. Native SQLite and browser storage paths are parity-tested, and failed replacement
  generation leaves the installed rulebook untouched._

  _Task 12 completed 2026-07-29 (`b348f83`): three literal V2/V3 card/persona acceptance fixtures
  now lock prompt-time `{{user}}` / `{{char}}` resolution, accepted attribute terminology, exact
  named possessions, source immutability, and runtime inventory. Forge refreshes mechanics from the
  preserved card instead of a stale import preview, preserves the raw creation source for future
  reevaluation, and installs only deterministically verified carried/worn gear when card/persona
  prose is attached. Scenery and model-proposed display gear are excluded._

  _Task 13 completed 2026-07-29 (`3ebd58d` through `75dfe6c`): action suggestions reject absent
  registry characters; lorebook save failures retain the exact draft and offer a safe retry;
  multi-character roster tests lock dossier/loadout selection to the clicked registry id; and
  rulebook regeneration tests prove failed replacement leaves installed mechanics and unsaved UI
  context intact before resuming from the retained checkpoint. Lorebook hierarchy and
  dossier-to-loadout navigation are acceptance-tested. Core 528 + UI 147 = 675 tests pass._

  _Tasks 14-15 automated gate completed 2026-07-31 (`f1d8a4a`, `4237735`): React test stderr is
  clean and guarded; core engine coverage is 100% for statements, branches, functions, and lines;
  typecheck, 693 tests, direct core/UI builds, native `cargo check`, and the unsigned v0.2.8 package
  build pass. MSI and NSIS installers were hashed, and the packaged release survived an isolated
  startup smoke test. The only remaining Internal-Beta evidence is the human visual/provider-backed
  packaged journey for create/import, play, close/reopen/continue, NPC behavior, ruling-before-prose,
  verified streaming, Forge recovery, suggestions, macros, and cross-card gear._

  _Packaged acceptance reopened source work on 2026-07-31. Seven defects were observed in the
  provider-backed installed app: inverted Overview hierarchy, shared/empty character memory,
  retained-Forge restart friction, unavailable suggestions under provider degradation, lost
  pronoun attack focus, provider-dependent hostile NPC agency, and unstable Play scroll anchoring.
  These are tracked as Task 15A below and in
  `docs/superpowers/plans/2026-07-31-packaged-beta-remediation.md`. The earlier artifacts are now
  stale for acceptance and must not be rebuilt until all Task 15A source slices are complete._

## Task 15A: Packaged Acceptance Remediation

- [x] Capture all seven observations and trace each to its runtime owner/root cause.
- [x] Write the dependency-ordered detailed remediation plan and refresh the active baton.
- [x] Make cancelled/failed Forge offer both reliable resume and a genuinely fresh operation.
- [x] Make dossier history character-specific and ensure every registry character participates in
  evidence-backed soft-memory updates.
- [x] Preserve a unique recent living target for pronoun continuation attacks without guessing.
- [x] Provide scene-grounded deterministic Possible Moves when the suggestion provider degrades.
- [x] Persist engine-validated hostility and let living hostile NPCs select legal sealed actions
  when the planner provider degrades.
- [x] Preserve reader scroll position and keep follow-latest mode stable through content/layout
  changes.
- [x] Make the latest automatic chapter summary primary when no arc synthesis exists; keep the
  static premise as compact context.
- [x] Run the full automated/native gate, update baton documents, then rebuild one combined unsigned
  installer for the next human acceptance pass.

## Task 15B: Live Combat and Rulebook Breadth Remediation

Detailed execution plan:
`docs/superpowers/plans/2026-08-01-live-combat-remediation.md`.

- [x] Guarantee one engine-resolved, gate-legal natural attack in every full-stat story, including
  runtime compatibility for already-frozen catalogues.
- [x] Give emergent NPCs bounded story-grounded capability loadouts selected only from sealed skill
  ids; show those capabilities to the NPC planner without allowing invented mechanics.
- [ ] Expand the versioned universal family registry with balanced combat, social, exploration,
  crafting, and utility coverage.
- [ ] Increase forge-time action and skill breadth while retaining premise relevance, validation,
  repair, resume, and provider deadline guarantees.
- [ ] Scale baseline attack damage / encounter health into a meaningful range.
- [ ] Retry transient provider failures and provide richer authority-safe fallback prose.
- [ ] Apply recent-target continuity to degraded classifier recovery and retire stale scene presence.
- [ ] Run the full automated/native gate and refresh WORKLOG, HANDOFF, and next-agent prompt. Do not
  rebuild an installer until the human asks.

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

Automated evidence is green for all criteria above. Final phase sign-off remains intentionally open
until the packaged visual/provider-backed journey is performed by the human; the local harness does
not have their provider credentials and must not claim that manual observation occurred.

## Explicitly out of scope this phase (later)

Windows/macOS code signing, updater keypair + host, strict Tauri CSP, live-model acceptance harness,
collapsing the 7 `Design/handoff-*` duplicate trees.
