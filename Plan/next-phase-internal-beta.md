# Next phase — Internal Beta exit

**Chosen:** 2026-07-28. Goal: satisfy the Internal-Beta exit criteria. Release/sellable work
(signing, updater, CSP, live-model acceptance) is explicitly a **later** phase.

Baseline when the phase started (HEAD `f6e9622`): **579 tests** (core 453 / ui 126). Tauri `0.2.5`.
Current baseline (HEAD `3566c25`, measured 2026-08-02): **792 tests** (core 632 / ui 160).
Post-Phase-3 of Audit Plan 13 (measured 2026-08-05): **833 tests** (core 655 / ui 178).

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
- [x] Expand the versioned universal family registry with balanced combat, social, exploration,
  crafting, and utility coverage.
- [x] Increase forge-time action and skill breadth while retaining premise relevance, validation,
  repair, resume, and provider deadline guarantees.
- [x] Scale baseline attack damage / encounter health into a meaningful range.
- [x] Retry transient provider failures and provide richer authority-safe fallback prose.
- [x] Apply recent-target continuity to degraded classifier recovery and retire stale scene presence.
- [x] Run the full automated/native gate and refresh WORKLOG, HANDOFF, and next-agent prompt. Do not
  rebuild an installer until the human asks.

## Task 15C: Live Narration and Registry Integrity Remediation

Packaged testing on 2026-08-01 exposed one invalid social ruling, internal narrator markup, organic
NPCs that remained prose-only, false-positive provider-key validation, and stale retry UI. These
were handled as one dependency-ordered batch before the requested combined installer rebuild.

- [x] Require an unambiguous present non-player target for every sealed action family/effect that
  acts on another character; a call for help with no survivor present remains narration-only.
- [x] Strip internal `[Chronicle Note]...[/Chronicle Note]` planning blocks from both streamed and
  persisted narration, including tags split across provider chunks.
- [x] Let the narrator introduce NPCs organically, then promote bounded named/described actors into
  the registry before the turn commits; grant generic actors up to three usable sealed story skills.
- [x] Validate provider credentials with a minimal authenticated chat request even when the provider
  exposes a public model catalogue.
- [x] Clear stale narrator-degradation notices when retry starts and always settle the Play busy
  state after success or failure.
- [x] Run the complete automated/native gate, update every baton document, commit coherent green
  changes, and build/hash one combined unsigned installer.

## Task 15D: Directional Intent and Revealed-Identity Repair

Packaged testing on 2026-08-01 showed a spoken request for help being reversed into an `Assist`
ruling, while ordinary past-tense narration introduced a man and Bess and later established “I am
Bram Kelder. This is Bess” without adding either actor to the registry.

- [x] Inspect the packaged SQLite transcript, turn operations, and character rows to establish the
  exact failure boundary rather than infer it from the screenshot.
- [x] Treat receiving/requesting help as dialogue at both model-output and deterministic-recovery
  boundaries while preserving an explicit outward Assist to a named present character.
- [x] Recognize bounded past-tense actor prose and direct identity declarations, including ordinary
  people and animals, without promoting scenery, quantifiers, or the player's repeated identity.
- [x] Reconcile a revealed proper name with one existing generic actor id; do not add a duplicate.
- [x] Persist display-name enrichment atomically and add migration/checkpoint support so rewind or
  delete restores the earlier provisional identity.
- [x] Repair the already-persisted prose-only Bram/Bess transcript on its first turn under the new
  build before classification.
- [x] Run the complete automated/native gate, update every baton document, commit coherent green
  changes, and build/hash one combined unsigned installer.

## Task 15E: Cyraeth Narrated-Actor Integrity Repair

Packaged testing on 2026-08-02 showed the live Cyraeth roster containing `He`, `It`, and `Third`
while the narrator's real younger archer, older woman, large dog, and earlier predator were absent.
Read-only log, transcript, operation, event, and character inspection proved a successful provider
turn followed by deterministic extraction errors rather than an LLM or UI failure.

- [x] Inspect the installed log and Cyraeth SQLite state to map each phantom and missed actor to the
  exact narrator prose and completed turn stages.
- [x] Reject sentence-initial pronouns and ordinal transitions without blocking explicit identities
  or genuine proper names.
- [x] Recognize bounded described actors through modifiers and ordinary past-tense verbs while
  continuing to reject murals, statues, paintings, and other depictions.
- [x] Scan the caller-bounded recent narration window so the affected save can repair the earlier
  predator as a historical registry member without returning it to the current scene.
- [x] When several provisional people are present, use nearby self-introduction context to enrich
  the matching registry row rather than creating a duplicate named character.
- [x] Add migration 16 to remove only exact unused auto-generated `He`, `It`, and `Third` rows,
  scrub every checkpoint dimension, and preserve mechanically referenced actors.
- [x] Run typecheck, the complete automated suite, native `cargo check`, update all baton documents,
  commit coherent green changes, and build/hash one combined unsigned installer.

## Task 15F: Cyraeth Villager Coreference and Narration-Guard Repair

The next packaged turn registered broad descriptions as separate villagers and replaced the latter
half of otherwise valid prose with a safe recap. Read-only inspection of the complete transcript,
operation record, story configuration, checkpoints, character hard/soft state, and native log proved
two source defects: third-person name reveals were not reconciled with provisional rows, and the
deterministic death guard treated negated or hypothetical death-language as a concrete state change.

- [x] Inspect the installed Cyraeth log and SQLite state without modifying the user's save, including
  every message, variant, ruling, operation stage, character row, checkpoint, and story prompt.
- [x] Confirm the latest `Reassure Survivor` failure was a valid ruling and distinguish it from the
  narration truncation and actor-coreference defects.
- [x] Reconcile `Daen` with `First man`, enrich `Younger man` to `Daenin`, and enrich the specific
  `Older woman` to `Mera` while suppressing the overlapping broad `Woman` registrar transition.
- [x] Support narrator-bounded name explanations, descriptor-first appositives, and unambiguous
  dialogue vocatives without promoting arbitrary capitalized prose.
- [x] Allow questions, counterfactuals, explicit negations, and incomplete attempts that mention
  death while retaining deterministic rejection for concrete unruled `falls dead`, `died`, `slain`,
  and kill assertions.
- [x] Reproduce the exact packaged actor aliases and authority warning through RED tests, then prove
  the repaired full turn atomically preserves the canonical roster.
- [x] Run the complete typecheck/test/native/package gate, update every baton document, commit the
  documentation closeout, and hash one fresh unsigned installer for rewind/replay acceptance.

## Task 15G: Authoritative NPC Scene System Redesign

The next packaged replay showed that Tasks 15C-15F repaired individual extraction cases but did not
produce one coherent NPC lifecycle. The narrator mentioned Kellan, an older woman, and a dog while
only Daen remained present; failed reassurance provoked an automatic punch; the next narration-only
player message let the planner repeat that old punch as a fresh ruling; the narrator timed out
without depicting it; the engine appended a duplicate mechanical recap; and Possible Moves treated
`describe` and `slowly` as scene subjects. This is a system-boundary failure, not another regex case.

Detailed diagnosis and execution plan:
`docs/superpowers/plans/2026-08-02-npc-scene-system-redesign.md`.

- [x] Inspect the installed Cyraeth transcript, operations, character rows, action definitions, and
  native log read-only; do not mutate the user's save.
- [x] Trace identity, presence, capability, NPC intent, ruling, narration fallback, suggestion, and
  rewind/variant ownership through the current code and define one target Scene State contract.
- [ ] Freeze the complete Cyraeth lifecycle as an end-to-end RED fixture, including provider
  degradation, retry/restart, swipe, rewind, delete, and cancellation.
- [ ] Add typed Scene State, evidence spans, alias/provenance persistence, trigger events,
  affordances, and active-variant scene snapshots with a legacy-safe migration.
- [ ] Replace registrar/regex write paths with one Scene Reconciler and make organic narrator actors
  part of a pre-narration Narrative Beat Plan that commits atomically with prose.
- [ ] Provision emergent NPC capabilities from actor-local evidence and sealed story assets.
- [ ] Make NPC agency consume current semantic trigger events or persisted agendas; `opposed` alone
  must never imply hostility, and prior prose must never replay an action.
- [ ] Require causal narrative coverage for each current ruling and remove deterministic mechanical
  recap sentences from story prose; retain concise ruling UI plus retryable narration status.
- [ ] Generate Possible Moves from typed scene affordances rather than arbitrary prose tokens.
- [ ] Decompose the turn coordinator, remove superseded authority paths, run the full automated and
  native gate, update every baton document, and build one combined installer only after all Task
  15G source slices are complete.

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
