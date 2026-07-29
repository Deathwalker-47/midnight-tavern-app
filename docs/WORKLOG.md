# WORKLOG — append-only agent journal

Newest first. **Append** entries; never edit past ones. Each entry: date, agent/session, what
landed, why, verification, and any gotcha the next agent needs. Live state is in
[`HANDOFF.md`](HANDOFF.md); this is the history.

---

## 2026-07-29 — Task 8: release verified mechanical beats incrementally

**What landed (`09da205`).** `authorityGuard.ts::generateGuardedNarration` no longer dumps the whole
mechanical remainder after one whole-draft deterministic pre-check. On authority-audit acceptance it
now iterates `splitBeats(remainder)` and releases each beat via `onDelta`, running the deterministic
death guard PER BEAT. A beat asserting a death with no `causedDeathOf` is replaced by `safeSummary`;
every earlier verified beat is preserved, and the offending beat + everything after it is never
shown. If nothing is on screen yet and a repair remains, it regenerates instead. The removed
whole-draft `deterministicContradiction` pre-check is now the per-beat guard; the model whole-draft
audit still runs and gates fabricated non-death mechanics before any beat releases.

**Why it matters.** Before, a single fabricated death anywhere in the draft sent the ENTIRE
mechanical remainder to `safeSummary` — losing good prose. Now the good prefix survives.

**Tests (+2 → 8 in file).** Accepted mechanical beats arrive as separate deltas (incremental, not one
blob); a later beat fabricating a death is dropped while the earlier verified beat survives (RED
before: the whole-draft guard discarded both). Existing reject/repair/auditor-unavailable/false-kill
tests unchanged and green.

**Verification.** typecheck clean; **core 505 / 40 (+2) + UI 139 / 25 = 644** green.

**Design note.** Per-beat verification is deterministic (no extra model calls); a per-beat *model*
re-audit was deliberately not added (latency). The whole-draft model audit stays the model authority.

**Next:** plan Task 9 — stage deadlines, deterministic fallbacks, and latency telemetry
(`stagePolicy.ts` + `turn.ts`/classifier/authorityGuard/turnOperations).

---

## 2026-07-29 — Task 7: prove end-to-end verified streaming

Proof task (`fccab2c`) — added tests only, no source changed. The streamed-delta path was already
threaded end to end; three temporal tests now pin it.

**What was proven.** provider `stream(onDelta)` → `generateGuardedNarration` (releases each safe,
non-mechanical paragraph the instant it streams) → `turn.ts` forwards `opts.onDelta` →
`sqliteBridge.submitTurn` forwards `args.onDelta` verbatim to `core.submitTurn` → `playStore`
accumulates `proseBuffer += delta` → `Play` renders `<p data-testid="play-prose-buffer">` while
`operationPhase === "streaming"`. No boundary buffers or coalesces safe deltas.

**Tests (+3).** Each gates the provider promise (a hung `stream`/`submitTurn`) and asserts the first
safe paragraph is already delivered/rendered while it is still pending:
`authorityGuard.test.ts` (core release point), `sqliteBridge.test.ts` (bridge forwards the same
`onDelta`), `Play.test.tsx` (live prose renders mid-stream).

**Verification.** typecheck clean; **core 503 / 40 (+1) + UI 139 / 25 (+2) = 642** green.

**Gotcha.** `Play` only shows `play-prose-buffer` while `operationPhase ∈ {streaming, saving}`; a
streaming test's fake bridge must call `onPhase("streaming")` before `onDelta`. Play's mount-load
effect still emits one of the known React `act()` warnings (Task 14).

**Next:** plan Task 8 — release verified mechanical beats incrementally (per-beat authority release in
`authorityGuard.ts`, replacing the whole-draft hold for the mechanical remainder).

---

## 2026-07-29 — Task 6: deterministic provocation beyond combat

`planNpcReactions` previously provoked only on `category === "combat"`. It now reacts to any SEALED
hostile act.

**What landed (`b753de3`).** `npcAgency.ts::isProvocation(action, ruling, stakes)` returns true for:
combat category; an opposed contest (`action.opposed`); a sealed outcome table that can reduce a
target resource, or a committed negative `resourceDeltaTarget` this turn; or a classifier `stakes`
of `danger`/`opposed`. Never prose. `turn.ts` builds `stakesByTurnId` (`ruling.turnId → intent.stakes`)
in the player-resolution loop and passes it into `planNpcReactions`, so the hostility grade
participates alongside the action's category/opposed/effects. Beneficial acts (healing/aid),
harmless non-opposed dialogue, and self-directed actions are not provocations.

**Tests (`npcAgency.test.ts`, +4 → 19).** A damaging non-combat intimidation and a damage-free
opposed "menace" both provoke a same-turn counter; a harmless "greet" and healing the creature do
not (and the heal is observed). Test-local actions are appended to the fixture schema via a small
`addActions` helper. RED observed for the two provoke cases before implementation.

**Verification.** typecheck clean; **core 502 / 40 (was 498) + UI 137 / 25 = 639** green. No
regressions from broadening the predicate (existing suites use combat actions, still provoking).

**Gotchas.** `opposed` alone counts as provocation even without damage (a friendly duel-of-nerve
would provoke) — acceptable for the encounter model, revisit if a non-hostile opposed action is
ever added. `seedWightHp(hp)` sets `max = hp`, so healing tests must seed `max > current`.

**Next:** plan Task 7 — prove end-to-end verified streaming (provider → core → bridge → store → Play).

---

## 2026-07-29 — Task 5: goal-driven bounded NPC planning

Implemented plan Task 5 test-first. Present, living NPCs that did not deterministically react can
now pursue a goal on the same turn — including a non-combat player turn.

**What landed (`04e83b7`).** `orchestrator/npcAgency.ts::planNpcActions` + wiring in
`turn.ts::runTurnOperation`. After the deterministic reaction stage, the turn builds a candidate set
(present, living, non-player NPCs that have not already acted) and, only if non-empty, issues ONE
bounded classifier-role structured request (`{ actions: NpcActionProposal[] }`, max 6). Deterministic
code then validates each proposal — actor is a present living candidate, action/item/skill are in the
sealed catalog, target is a present character, and the actor's own `checkGate` permits it — before the
engine resolves it through the ordinary gate/dice/effects path into the working ledger and the
narrative contract. The model may propose; it can never invent an actor/action/target/item/skill or
bypass a gate. Own per-NPC encounter budget (`DEFAULT_NPC_ENCOUNTER_BUDGET`), independent of the
player budget. Any malformed/timeout output fails closed to `[]`; only a real abort propagates, so
narration is never blocked.

**Tests (`npcAgency.test.ts`, +4 → 15).** exploit-opening on a non-combat turn; ally aid via a sealed
support action (`mend_ally` + consumable); validation rejects invented action / absent actor / absent
target / gate-failing rank; planner error fails closed with prose intact. `AgencyRouter` gained a
non-clobbering `"NPC action planner"` branch (`plannedActions`/`plannerFailure` fields) so the extra
model call never overwrites the player-classify prompt other tests assert on.

**Verification.** typecheck clean; **core 498 / 40 (was 494) + UI 137 / 25 = 635** green. No
regressions — the planner's fail-closed path leaves every existing suite green even when it fires with
an idle present NPC (unrecognized router payloads parse-fail to `[]`).

**Gotchas for the next agent.**
- The planner issues a model call on EVERY full-stat turn with an idle present NPC. That is per the
  plan but is a latency/cost surface — Task 9 (stage deadlines + telemetry) should bound and
  instrument it, and consider a cheaper trigger (e.g. only when an encounter is active).
- Deterministic flee/surrender are catalog-dependent; the fixture catalog has no flee/surrender
  action, so those goals currently flow through the validated model path rather than a deterministic
  policy. Task 6 adds the sealed provocation predicate; revisit deterministic flee/surrender if/when
  such actions exist in a real rulebook.
- The gate pre-check in `planNpcActions` runs without equipment context (mirrors the counter path);
  `resolve` re-gates with equipment context in `turn.ts`, so it stays authoritative.

**Next:** plan Task 6 — extend deterministic provocation beyond combat (sealed threat/intimidation
predicate; no reaction to harmless dialogue).

---

## 2026-07-29 — Character registry and scene presence storage split

Created the detailed sequential Internal Beta completion plan at
`docs/superpowers/plans/2026-07-29-internal-beta-completion.md`, linked it from the live handoff, and
completed its first task test-first.

**What landed.** Migration 11 adds the persisted `characters.present` fact and a composite lookup
index. `CharacterRecord` now distinguishes active-scene presence from permanent registry
membership. `CharacterRepo.listByStory` continues to return the complete dossier/history registry;
`listPresentByStory` returns only the active cast; and `setPresent` toggles presence without deleting
the record. Inserts default to present for compatibility, while NPCs materialized by
`ensureHardState` explicitly start present.

**Red/green coverage.** The repository test first failed because `listPresentByStory` did not exist.
The completed coverage proves absent NPCs remain registered, are excluded from the present-cast
query, can re-enter the scene, and reject presence updates for missing ids. Migration tests track
version 11 and prove omitted presence defaults to true.

**Verification.** Fresh post-change `npm run typecheck` passed. Fresh `npm test` passed: core
**475 / 38 files** + UI **136 / 25 files** = **611 tests**. The same seven known React `act(...)`
warnings remain. Code landed as `c284b1d`; local documentation baton follows. No installer was
rebuilt and nothing was pushed. Task 2 is the sole next action: make presence authoritative across
checkpoints, rewind, orchestrator/context consumers, NPC agency, and both bridges.

## 2026-07-29 — Narrated NPC registry + prose-only scene-entity promotion foundation

Implemented the handoff's scene-entity promotion slice test-first, then expanded it for the product
owner's clarification: every actual NPC introduced into the fiction belongs in the character
registry; background scenery, crowds-as-background, murals, statues, and other non-character nouns
do not.

**What landed.** New
`orchestrator/sceneEntityPromotion.ts::discoverNarratedSceneEntities` recognizes validated NPC
templates, bounded described actors ("a hunched creature crawls"), and proper named actors ("Mara
enters"). It assigns stable per-story ids. `runTurnOperation` uses it in two places:

- before classification, it catches up NPCs found in recent narration through `ensureHardState`, so
  the sealed classifier can legally emit the new id and the ordinary resolver/reaction pipeline can
  adjudicate it;
- after narration, it registers newly introduced NPCs inside the same save transaction as prose,
  checkpoint, rulings, and hard-state updates, so a successful turn cannot persist prose without
  the detected NPC's registry row.

Templates are preferred; otherwise `instantiateGeneric` supplies bounded hard state. Registration
does not create an action or bypass the catalog/gate/dice wall. The existing deterministic
`planNpcReactions` remains the only chooser for obvious counter-attacks, with its separate NPC
budget.

**Red/green coverage.** `npcAgency.test.ts` grew from 4 to 8 tests. The new tests prove:

- the Jerusalem-style "hunched creature" exists only in prior narrator prose, is promoted before
  classification, receives the player's authoritative attack ruling, and counter-attacks this same
  turn through engine dice;
- a real but unprovoked described guard enters the registry;
- a newly narrated proper-name NPC enters the registry in the same atomic turn;
- a guard depicted only in a mural, plus scenery/crowd nouns, does not become a character.

**Verification.** Fresh post-refactor typecheck clean; core **473 / 38 files** + UI **136 / 25
files** = **609 tests** green (the same seven known React `act(...)` warnings); full production
build green. Fresh unsigned v0.2.8 hashes: NSIS
`DE84C91EAB90333F447EABD0D98A8865ADB54DFD2AAEFD4D80D167A47257A18B`; MSI
`FF8BFA3A912189061AEBC853E2EDF5370A38A646C63B68526FAF5EEF59F597B6`.

**Honest remaining work.** The recognizer is deliberately bounded and cannot guarantee every
possible linguistic NPC introduction. The next slice must make the product rule structural with an
engine-validated entity-introduction contract/stage and separate registry membership from current
scene presence. Then add ambiguous goal-driven NPC planning and broaden non-combat provocation.

---

## 2026-07-29 — Root cause 2: same-turn NPC agency (deterministic reaction stage)

Implemented the larger half of the handoff's single next action, test-first: NPCs now act on
the same turn instead of one turn late.

**What landed.** New `orchestrator/npcAgency.ts::planNpcReactions` — a pure, deterministic
stage. After the player's intents resolve, a **present, living** NPC that was the target of an
**allowed combat** action this turn counter-attacks its attacker with the first sealed combat
action its **own gate** permits. `turn.ts::runTurnOperation` calls it between player-intent
resolution (incl. budget refusals) and the loot/advancement stage, then resolves each returned
intent through the ordinary `resolve`→`commit` path against the same working ledger, appending
those rulings so the narrative contract (`assembleContext` + `generateGuardedNarration`) carries
them. This is the wall preserved: the planner only *chooses* a `MechanicalIntent`; the engine
still gates/dices/commits it, so an NPC cannot invent an action id, target, item, skill, or
bypass a gate.

**Fail-safe boundaries baked in + tested** (`test/orchestrator/npcAgency.test.ts`, 4 tests):
- a struck, surviving NPC produces its own authoritative ruling this same turn (dice, not prose);
- a slain NPC never acts (dead/off-scene filtered on the post-player-resolution working state);
- NPC agency uses its own per-NPC encounter budget (`DEFAULT_NPC_ENCOUNTER_BUDGET = 1`),
  independent of the player's `actionBudget` — a player who exhausts/overruns their budget still
  gets answered;
- a narration-only turn (no living NPC targeted) yields no reaction.

**Loot/advancement scoping (correctness).** Loot attaches to the *last successful ruling*; an NPC
counter is a success, so it would have stolen the player's loot anchor. `runTurnOperation` now
passes only the player-ruling prefix (`rulings.slice(0, playerRulingCount)`) to
`determineLootAwards` and `determineAttributeAdvancements`; NPC rulings feed only narration, never
the player's rewards. That fixed the "materializes runtime item" regression without a test edit.

**Existing tests updated to the new (correct) behavior** — enemies fight back now: `turn.test.ts`
(+1 ruling), `v7Turn.test.ts` (two attack scenarios +1 ruling each), `history.test.ts` (kept
exchange now holds player strike + counter = 2 rulings). Each change is a real behavior assertion,
not a number bump.

**Verification.** typecheck clean; **core 469 / 38 files (was 465) + UI 136 / 25 = 605 tests**
green. UI untouched. No new installer (correct per handoff — streaming end-to-end wiring + stage
deadlines still pending before packaging).

**Honest scope / still open (for the next agent):**
- Deterministic *direct* reactions only (counter-attack). No bounded model planner yet for
  ambiguous social/tactical NPC choices, and no scene-entity **promotion** — a consequential
  prose-only entity (the Jerusalem "hunched creature") still can't act until it exists as a
  persisted character. Promotion (validated template/generic instantiation of a prose entity
  before it acts) is the next NPC-agency slice.
- The trigger is combat-target-based; "threatens" via non-combat intimidation doesn't yet
  provoke. Widen the provoke predicate when promotion lands.
- Streaming end-to-end (root cause 1 tail) is still unverified in the packaged app, and per-stage
  deadlines + a faster default narrator tier are still pending — those attack total latency; this
  change does not.

---

## 2026-07-29 — Root cause 1 foundation: progressive verified narration release

Implemented the streaming half of the handoff's single next action, test-first.

**What landed.** `orchestrator/authorityGuard.ts::generateGuardedNarration` no longer buffers the
whole mechanical-turn draft behind an empty `onDelta`. During the streaming attempt it now releases
each COMPLETE paragraph that asserts no mechanic (deterministic `assertsMechanic` vocabulary check)
the instant it streams — such a beat cannot contradict a ruling — and holds the first mechanical
paragraph + everything after it for the whole-draft audit. On accept the held remainder is released;
on reject the held remainder is replaced by the deterministic `safeSummary` and never shown.
Already-shown beats were safe by construction → nothing contradictory is ever exposed. Fail-closed.

Two new tests in `authorityGuard.test.ts`: (a) a verified leading paragraph is released before the
draft finishes (>=2 deltas, first delta is the safe beat only); (b) a rejected mechanical paragraph
never reaches the UI or final prose. Both were written failing first, then made to pass.

**Backward compatible.** Providers/tests whose `stream()` doesn't emit deltas (existing mocks) leave
`releasedLen=0` and get the previous buffer-then-release path unchanged. All existing orchestrator
tests green.

**Verification.** typecheck clean; core 465 tests (was 463); orchestrator suite 43/43. UI untouched.

**Honest scope / what this does NOT do (for the next agent):**
- It cuts *time-to-first-visible-prose* for the narrative prefix (beats appear while the narrator is
  still generating). It does NOT reduce total narrator time or the ~50s classifier stall in the
  logged evidence — those need per-stage deadlines + a faster default narrator tier + the pipeline
  split, all still pending.
- Mechanical beats still wait for the single full-draft audit (no per-chunk model audit was added —
  that would multiply latency). True per-beat verification with a deterministic-first fast path is a
  later refinement.
- End-to-end benefit depends on the narrator provider actually streaming deltas and the turn
  orchestrator passing the real UI `onDelta` through to `generateGuardedNarration`. Verify that wire
  in `orchestrator/turn.ts` + bridge before claiming packaged improvement; add a packaged smoke check.
- `assertsMechanic` is intentionally conservative (holds combat words like "damage/wound/success"),
  so combat prose may release little early. Tune the vocabulary if too aggressive.

**Still open (root cause 2 + pipeline):** NPC same-turn agency and the `runTurnOperation` stage-split
(player-resolution -> NPC-decision/resolution -> narrative contract -> progressive narration) are
untouched. That remains the larger part of the single next action.

---

## 2026-07-28 — Refresh handoff with packaged latency, streaming, and NPC-agency diagnosis

Updated `docs/HANDOFF.md` as the complete sequential-agent baton after the latest v0.2.8 packaged
Jerusalem Man testing. It now preserves all V6/V7 requirements and later clarifications, separates
landed behavior from unverified acceptance risks, records the exact 48.3 s and 112.9 s turn
breakdowns, and documents two confirmed architectural gaps:

- mechanical narration is deliberately buffered until a whole-draft authority audit succeeds, so
  the existing UI/provider stream cannot display incremental prose; and
- NPC intents are only extracted from prior narrator prose for already-persisted present characters,
  leaving prose-only entities unable to act or receive same-turn DM rulings.

The baton names the next coherent change: test-first same-turn NPC agency plus progressively verified
paragraph/beat streaming, with deterministic reactions, bounded planner fallback, stage deadlines,
telemetry, and atomic persistence. No runtime code changed.

**Verification before documentation edit:** `npm run typecheck` clean; core **463 / 37 files** and UI
**136 / 25 files** green (**599 tests** total). The same seven known React `act(...)` warnings remain.

## 2026-07-28 — Fix packaged classifier invalid-output regression

The human's first successful packaged story then failed its first turn with **"Mechanics safely
paused · Invalid response."** The app log proved the Electron Hub classifier returned non-empty JSON
four times (initial + three repairs), but every response failed strict `ClassifiedTurn` validation.
The persisted player message explicitly named two valid Jerusalem Man catalog actions:
`Reload and Clean` and `Press the Ride`.

**Fix.**
- The classifier schema now normalizes harmless OpenAI-compatible JSON-mode variations: `null` or
  empty optional ids become absent, enum strings are trimmed, numeric confidence strings are parsed,
  and missing/null intent arrays or `freeText` take conservative empty defaults.
- The sealed actor/action/skill enums still validate after normalization. Unknown ids remain invalid.
- If all structured repairs still fail, a deterministic fallback can recover multiple actions only
  when the player used an exact, uniquely owned sealed label, id, or alias. Shared phrases and
  unresolved required targets fail closed. This recovered the reported two-action sentence without
  granting the model any new mechanical authority.

**Verification:** typecheck clean; core **458 / 36 files** + UI **133 / 25 files** = **591 tests**
green; production build green; Windows v0.2.6 MSI + NSIS generated. SHA-256: NSIS
`E3B0B867DCCEAE3ABCFA21C4E0D9CADB35BE2014C29DD758D72643B3F866ED6C`; MSI
`715C7C4986BB91DA2C1C80BB73F60619A099A110259D39298487863CA21821E3`.

**Still needs human verification:** retry a turn in v0.2.6. The saved v0.2.5 failed turn remains
narration-only by design; submit a new message after installing.

---

## 2026-07-28 — Fix forge "Failed to fetch" (native provider transport) + persona name + build

Testing the installer, forge failed with **"Couldn't forge story / Failed to fetch."**

**Root cause (transport, not response-handling).** Provider calls used the webview's browser `fetch`
from `tauri://localhost`; provider APIs send no CORS headers for browser origins → blocked. Evidence:
`core.makeRouter` at `sqliteBridge.ts:110` was called with no `fetchImpl`, so it defaulted to global
`fetch` (`router.ts:183`), and the Rust shell registered no HTTP plugin.

**Fix.** Perform provider HTTP natively (Rust/reqwest) via `tauri-plugin-http`, injected into core:
- shell: add `tauri-plugin-http`, register `.plugin(tauri_plugin_http::init())`, add an `http:default`
  scope to `capabilities/default.json` (`https://**` + localhost).
- ui: `@tauri-apps/plugin-http` `fetch` injected into `core.makeRouter({ fetchImpl })` (covers all
  forge/turn/role calls) + the two `makeProvider` sites (key validation, model listing).
- The in-memory/browser-dev bridge keeps global `fetch` (unchanged).

**Also:** removed the redundant "Your name in the story" field in StoryBlueprint — the player name now
comes from the chosen persona (`selectedPersona.name`, fallback draft value then "You").

**Build gotcha (environment, documented so the next agent doesn't burn a cycle):** the rebuild first
FAILED at cargo's crates.io fetch with schannel `CRYPT_E_NO_REVOCATION_CHECK` — the proxy's TLS
revocation endpoint is unreachable, and it only surfaces when a *new* crate is added (cached crates
hid it before). Fixed with `.cargo/config.toml` → `[http] check-revoke = false` (skips only
revocation; cert chain still verified). With that, both installers built (plugin confirmed in
Cargo.lock). Fresh v0.2.5 hashes: NSIS `b9a8cca0…`, MSI `84364cb4…`.

**Verification:** typecheck clean; core 454 + ui 133 green; Windows MSI+NSIS bundles produced.
**Unverified (needs human):** the live provider call now actually succeeding end-to-end in the
packaged app — that's the test. If it still fails, capture Settings → Open Logs (role + error).

---

## 2026-07-28 — Internal Beta exit: bridge drift guard, restart proof, act() cleanup

Completed the remaining Internal-Beta-exit plan items (1, 3, 4). Final baseline:
**core 454 / 36 files, ui 133 / 25 files = 587 tests**, typecheck clean.

**Item 1 — CoreBridge de-duplication (drift guard).** The in-memory bridge (`bridge/core.ts`)
hand-mirrors core's catalog because it must not value-import core's native runtime into the eager
webview bundle (a deliberate, load-bearing boundary — see the static-type vs dynamic-runtime import
split in that file). Rather than break that boundary, added
`packages/ui/test/bridge/catalogParity.test.ts`, which asserts the in-memory bridge's public catalog
surface is identical to canonical `@midnight-tavern/core`. It **immediately caught real drift**:
`MEMORY_KNOWN_MODELS` listed 8 of core's 14 models and mis-tiered direct GPT-4o. Resynced it to
canonical (source of truth: `core/src/router/model-recommendations.config.json`). Drift now fails CI.

**Item 3 — restart persistence proof.** `packages/core/test/store/persistence.test.ts`: opens a real
file-backed store (`openStore` over better-sqlite3), writes story+message+setting, closes, reopens a
fresh connection to the same file, asserts all restored. Closes the audits' unproven beta gate at the
durability-contract level (the packaged Tauri driver shares the same contract via `openStoreWith`).

**Item 4 — React act() warnings 31 → 7.** Play: guarded the two mount-load effects when the
`debugState` preview prop is set (preview must not do IO). StorySettings tests: flushed the mount
config-load with a trailing `act()`. Residual 7 (5 `RulingBlock` reveal-timer + 1 Play + 1 Overview)
are animation/async-reveal noise in two tests — left for a follow-up, tracked in the plan.

**Caveat for next agent:** the item-1 commit shows large line churn on `core.ts` — that's CRLF vs LF
noise (repo has no `.gitattributes`, `core.autocrlf=false`); content is correct. If you touch this a
lot, consider adding a `.gitattributes` (`* text=auto eol=lf`) in a dedicated normalization commit.

**Next:** Internal-Beta-exit code items are done. Remaining before calling the phase closed: (a) mop
up the last 7 act() warnings if desired, (b) confirm the human's manual packaged-app pass. After
that, the **later** phase is release/sellable (signing, updater, CSP, live-model acceptance).

---

## 2026-07-28 — Internal Beta exit: kickoff + card-import consolidation

**Context:** Full-code review (via codebase-memory graph) + next-phase decision. Chose the
**Internal Beta exit** track (see `Plan/next-phase-internal-beta.md`). Established this agent-handoff
mechanism (`AGENTS.md`, `docs/HANDOFF.md`, this log, the plan checklist).

**Landed — card-import consolidation (plan item 2):**
- Retired the orphaned `CardCreator` screen. It was registered but no nav path reached it, and its
  primary "Use this card" button had no handler. Deleted `packages/ui/src/screens/CardCreator.tsx`
  and its test; removed it from `app/router.ts` (ROUTES), `screens/registry.ts`, and `app/App.tsx`
  (nav `activeOn` + route-label map).
- Enriched the **working** import path — Library's modal (`packages/ui/src/screens/Library.tsx`):
  drag-and-drop drop zone (`data-testid="import-drop-zone"`), character trait chips, and a
  "Sparse card" warning (`data-testid="import-sparse-warning"`) when a card has no openings/lore.
- Tests: `Library.test.tsx` import coverage 1 → 3 (happy-path→Blueprint, drag-drop, sparse-card).

**Gotcha for next agent:** the bridge's `CardImportResult.spec` string **already** contains the
`"Card format …"` prefix (see `sqliteBridge.ts` importCard). Do not add another prefix in the UI.

**Verification:** `npm run typecheck` clean; UI suite 24 files / 126 tests green. (Core unchanged at
453.) Net test delta: −2 (CardCreator) +2 (new import tests) = 126 UI.

**Next:** plan item 1 — de-duplicate the CoreBridge (`core.ts` vs `sqliteBridge.ts`).

---

## 2026-07-28 — Persist in-flight Play operations and rebalance routine rulings

The packaged Jerusalem Man test showed that leaving Play during a long provider call and returning
discarded the visible operation, while routine actions such as prayer and travel were unnecessarily
rolled and could produce repeated failures.

**Navigation fix.** `playStore.load(storyId)` previously minted a new operation generation on every
Play mount. Returning to the same story therefore invalidated the still-running submit/swipe
callbacks and replaced the stream with an incomplete backend snapshot. Same-story loads now reuse
the active global Zustand operation. A deferred-bridge regression test proves the stream survives
route re-entry and the completed authoritative transcript is published without resubmission.

**Low-friction resolution.** `MechanicalIntent` now carries a scene-grounded stakes classification:
`none`, `uncertain`, `danger`, `opposed`, `time_pressure`, or `scarcity`. Routine dialogue, thought,
prayer, maintenance, safe travel, and atmospheric gestures are narration-only unless a concrete
mechanical goal or obstacle exists. Valid unopposed narration-only actions with `stakes=none`
auto-succeed without RNG or XP. Opposition, attacks, deception, non-none stakes, costs, or any
tracked state effect still force deterministic resolution. Gates continue to deny unavailable
skills/items. Automatic outcomes receive their own journal event kind instead of being mislabeled
as denied.

**Narration quality.** The authority auditor now requires an exact prose excerpt and ruling conflict
before rejecting a draft; normal scene progression and natural-language consequences are explicitly
allowed. The last-resort deterministic narrator no longer exposes UUIDs, internal actor IDs, or
debug arithmetic and gives a fuller readable consequence.

**Verification:** typecheck clean; full suite green at **core 460 / UI 135 = 595 tests**; production
Tauri build clean. Unsigned v0.2.7 bundles: NSIS SHA-256
`F4ADCC8C602514A08AA1C7E9D485F490FD286788AC2920ECCE25F8E5ED9312A7`; MSI SHA-256
`4C522431E64159FF03F3E82093E11BEBA76E4F0A76F79D561A47FAB464D295DA`.

---

## 2026-07-28 — Restore narrator prose and bound classifier/auditor latency

Packaged telemetry for the Jerusalem Man story showed the exact failure chain. A mixed prayer plus
sealed-action turn spent four classifier requests before recovering `Press the Ride`, then displayed
the provider failure even though the deterministic DM ruling succeeded. A two-action pistol turn
took 141 seconds: the narrator produced a 4,087-character draft, the authority auditor rejected a
harmless JSON-mode shape as invalid, the app generated a second full draft, audited again, and
finally discarded all prose for a terse deterministic summary.

Classifier structured repair is now capped at one retry before sealed catalog recovery. Provider-only
diagnostics are hidden when that recovery produced valid mechanics, while low-confidence,
unresolved-action, and unresolved-target cases remain visible. The authority-audit schema accepts
unambiguous string booleans and null empty-contradiction lists. An unavailable auditor now fails
closed immediately after the first draft instead of launching a second narrator generation; the
deterministic emergency text includes action, outcome, total, DC, d20, modifier, and narration hint.
True contradictions still follow the existing rewrite-or-safe-fallback authority wall.

**Verification:** focused red/green regressions plus clean typecheck; full suite green at **core 463 /
UI 136 = 599 tests**. Production UI/Tauri build and `cargo check` clean. Unsigned v0.2.8 bundles:
NSIS SHA-256 `F747FDEADD5CE1EC38151445BE6FB74F52DF4A2851BAF579B547C62DB9680AC1`;
MSI SHA-256 `8D3C1C5D863FF9D359CA9B5A1213DFD5CDDA71789B8CC21F00234381CBF774BF`.

---

## 2026-07-29 — Make presence authoritative; repair live ruling order and false NPC promotion

Completed detailed-plan Task 2 in commit `de443cf`. Migration 12 adds checkpoint scene-presence
pre-images. Rewind restores every saved presence boolean. Turn classification, context assembly,
NPC agency, analyzer, suggestions, swipe context, and the native cast bridge now consume only
`listPresentByStory`; checkpoint/dossier/history/rulebook paths retain the complete registry.
Focused RED tests proved that an absent NPC could still act, rewind failed to restore presence, and
the native bridge exposed the full registry before the fix.

The human then reported two packaged regressions: DM rulings appeared only after streamed prose
completed, and the narration sentence “Nothing moves…” created a character named Nothing. Commit
`2e4cf07` fixes both:

- core emits an immutable `onRulings` snapshot before `thinking`, `streaming`, or any narrator delta;
  both bridges thread it and Play renders `pendingRulings` above the live prose buffer;
- sentence-initial quantifiers are excluded from proper-name promotion while a real name such as
  Ashara remains accepted;
- migration 13 removes the existing unused `:scene:nothing` phantom and scrubs its checkpoint keys;
  mechanically referenced rows are preserved;
- classifier structured output now permits a second bounded repair after live evidence showed two
  consecutive malformed shapes from the same route.

Test-first RED failures were observed for ruling-before-prose order, Nothing/Something promotion,
the missing cleanup migration, and the unavailable second structured repair.

**Verification:** `npm run typecheck` clean; core **480 / 39 files** and UI **137 / 25 files** green
(**617 tests** total); production `npm run build` and Rust `cargo check` green. Known test noise
remains seven React `act(...)` warnings. Fresh unsigned v0.2.8 bundles:

- NSIS SHA-256 `B438E441A51C7C503E59F97A3794349485C919818EDAA565F6A4E4834F55798F`
- MSI SHA-256 `9F2717FB8BE186F191120F053D53625727B2279B3CB178E82E990AC3032588B8`

Added `docs/NEXT-AGENT-PROMPT.md` as a copy-ready continuation brief. The single next action is
detailed-plan Task 3: the engine-validated NPC introduction/presence contract, followed by retiring
post-narration heuristic creation as an authority path.

---

## 2026-07-29 — Validate creature identity, attack ownership, damage, and death prose

Packaged testing exposed four connected failures: an undocumented current creature was absent from
the registry, the classifier redirected two player strikes through an older `Dead man` row, the
narrator repeated mechanical boilerplate, and prose declared a kill although the successful strike
had no health effect.

Commit `350f805` completes detailed-plan Tasks 3–4. A bounded classifier-role NPC registrar proposes
`introduce | enter | leave`; deterministic validation checks grounding/templates, rejects ambient
murals/statues/crowds and quantifier phantoms, reuses normalized rows, stages the resulting roster
before classification/context, and commits it atomically with the turn. Generated narrator prose no
longer writes registry rows. A narration failure test proves a proposed character is not persisted.

Player intents are normalized to the single present player. If a malformed classifier response
reverses actor and target, the engine restores the player as actor and the mistaken NPC as target,
so two strikes within the configured action budget remain two legal attempts. Denied ruling cards
now identify the actor.

Universal actions config v2 gives mechanically empty melee/ranged attacks program-owned lethal
resource damage (`-4` success, `-8` critical success), applied to both generated and older persisted
full-stat rulebooks without mutating explicit damage. The ledger treats a lethal resource at zero
as death; the narrator authority guard rejects kill/death assertions unless the ruling contains
`causedDeathOf`. Private ruling facts are no longer copied into prose, and the deterministic
fallback is natural narrative rather than dice/DC boilerplate.

**Verification:** `npm run typecheck` clean; core **494 / 40 files** and UI **137 / 25 files** green
(**631 tests** total). Known noise remains seven React `act(...)` warnings. Per the human's
instruction, no installer was rebuilt; packaging is deferred until the remaining Internal Beta work
is complete.
