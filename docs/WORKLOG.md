# WORKLOG — append-only agent journal

Newest first. **Append** entries; never edit past ones. Each entry: date, agent/session, what
landed, why, verification, and any gotcha the next agent needs. Live state is in
[`HANDOFF.md`](HANDOFF.md); this is the history.

---

## 2026-08-01 — Feature: surface the narrator degradation reason (no more silent fallback)

Follow-up to the "no prose = provider 429" diagnosis. When the narrator falls back to the deterministic
summary, the app now tells the player WHY instead of showing a silent terse recap that reads as a bug.

- `authorityGuard.ts`: `GuardedNarrationResult.fallbackReason?: string`. Captures the narrator stream
  error (runStage swallows it into the fallback, so it's grabbed in a wrapper first) and sets a short
  player-facing reason at every safe-fallback return: `describeProviderFailure` maps HTTP 429 →
  "the AI provider is rate-limiting requests (HTTP 429)", 5xx/other statuses, and timeout; audit-driven
  fallbacks use a fixed "couldn't be verified against the DM rulings" reason.
- `turn.ts`: `TurnResult.narratorFallbackReason` populated from the narration result.
- Bridge: `SubmitTurnResult.narratorFallbackReason` (core.ts type) threaded in both submit and retry
  paths (`sqliteBridge.ts`); in-memory design-mode stub unchanged (canned success).
- `playStore.ts`: new `narratorNotice?: string` state + `clearNarratorNotice()`; set from
  `outcome.usedNarratorFallback` on submit/retry completion, cleared on the next turn / reset.
- `Play.tsx`: a warn `InlineNotice` (`data-testid="narrator-notice"`) shown on a completed-but-degraded
  turn — "Full narration unavailable this turn … {reason} …" with **Retry narration** (swipeLast),
  **Change narrator model** (→ Role Matrix), and **Dismiss**.

Tests: authorityGuard "reports a provider rate-limit (429) as the fallback reason"; Play "surfaces the
fallback reason when the narrator degraded". Verified: typecheck clean; **core 604 / 45 + UI 158 / 25 =
762** green. Not committed; no installer rebuilt.

---

## 2026-08-01 — Fix: raise Forge fragment deadline (60s clipped legit action-batch generation)

Packaged v0.2.8 testing: Forge failed with "Story forging timed out while processing
actions-exploration-crafting-utility after 60000ms." Logs
(`%LOCALAPPDATA%/com.midnighttavern.app/logs/midnight-tavern.log`, `bootstrapper` role) show the
fragments completing SUCCESSFULLY but slowly on `gemini-3.6-flash`: 45299 ms (2002 tokens) and
49087 ms (3492 tokens) for the large action batches — then one crossed the 60s cap →
`BootstrapTimeoutError`. This was NOT a 429; it was a genuine slow-but-working generation clipped by
too-tight a deadline.

**Fix.** `bootstrap/generate.ts` default `fragmentDeadlineMs` 60_000 → **120_000**. The deadline is a
hung-provider backstop, not a cap on a legitimately slow large fragment; observed real durations
(45–49s) left almost no headroom at 60s. 120s still catches a truly hung provider. No caller overrides
the default (only tests pass it explicitly, unaffected). Verified: core **603 / 45** green, typecheck
clean. Not committed; no installer rebuilt.

**Note.** The 45–49s fragment times are themselves inflated by `gemini-3.6-flash` being the bound
bootstrapper model under Electron Hub trial load. A faster/less-throttled model would forge quicker;
the deadline bump makes the current binding reliable rather than racing the clock.

---

## 2026-08-01 — Fix: UUID leak in fallback prose + diagnose "no prose" as provider 429

Packaged v0.2.8 testing, "Attack with your dagger" turn: the narration was the terse deterministic
summary AND it leaked a raw actor id — *"74d6414e 2421 4fba B350 85ccbce8e8a7's Weapon Strike
succeeds…"* — while the NPC ("Shadow Entity") rendered fine.

**Bug fixed (UUID leak, source-verified + test-first).** `orchestrator/authorityGuard.ts::safeSummary`
built the actor label with `humanizeId(ruling.actorId)`. For an NPC whose id is a readable slug
(`shadow_entity` → "Shadow Entity") it looked fine by luck; the player's `actorId` is a UUID, so it
rendered the raw id. Fix: `safeSummary` now takes an optional `nameFor(id)` resolver (added to
`GuardedNarrationOptions`), resolves actor and `causedDeathOf` ids through it, and falls back to a
UUID-safe humanization (`readableActor`/`isOpaqueId`) that never prints an opaque id — a resolved
name wins, a readable slug is humanized, an opaque id becomes "The unnamed figure". `turn.ts` wires a
roster-backed `nameFor` (full registry + this turn's NPC transitions) into `generateGuardedNarration`.
Two RED tests in `authorityGuard.test.ts` reproduced the leak (resolved-name and no-resolver cases)
before the fix. Verified: core **603 / 45** (+2), typecheck clean.

**Root cause of "no prose" (NOT an app bug — provider rate limit).** App logs
(`%LOCALAPPDATA%/com.midnighttavern.app/logs/midnight-tavern.log`) show the exact turn
(2026-08-01 18:58:12, session `4c114d44`): narrator stream `electronhub` / `gemini-3.6-flash`,
retried attempts 1→2 (250 ms) and 2→3 (500 ms), all `ProviderHttpError status 429`, then
`llm.request.failed` at 3065 ms → deterministic fallback. Same 429 pattern at 16:31 (three fails) and
2026-07-31 19:44. The provider (Electron Hub trial) is rate-limiting the narrator model; the retry
loop (`router.ts`, 3 attempts, honors `Retry-After`) worked correctly and the fallback is by design.
No code change resolves a sustained provider 429.

**Recommended follow-ups (not yet done — needs product-owner call).**
1. Surface the degradation reason to the user: when `generateGuardedNarration` falls back due to a
   provider error, capture and thread the reason (e.g. "provider rate limit · 429") so Play shows a
   clear notice instead of silent terse prose that reads as a bug. Cross-layer (router → stage → turn
   → bridge → Play); the classifier path already has a "Mechanics safely paused" precedent.
2. User-side immediate remedy: rebind the narrator role to a less rate-limited model, or add the
   user's own provider key (Settings → Role Matrix). gemini-3.6-flash on the Electron Hub trial is the
   throttled binding.

Not committed pending the human's call. No installer rebuilt.

---

## 2026-08-01 — Fix: stale retained Forge hijacking a freshly imported card

Packaged v0.2.8 testing: importing any character card (e.g. "The Mojave") landed on a Story
Blueprint pre-filled with a *previous* story ("Dungeon Master Enhanced V2" — persona Jinwoo, a
dragonborn-necromancer opening) regardless of what was imported. Screenshots also showed a retained
Forge banner "electronhub: HTTP 429".

**Root cause (source-verified via codebase-memory trace).**
`screens/StoryBlueprint.tsx`'s mount effect (the retained-Forge rehydration) ran on every `creating`
mount and, whenever a persisted `story-create` Forge operation existed, **unconditionally** overwrote
`title`/`premise`/`statMode`/`blueprint`/`selectedOpening`/`personaId`/`continueWithoutPersona` from
that old operation's request. The user's earlier Dungeon-Master forge had failed with HTTP 429,
leaving a retained operation in SQLite; `Library.tsx::useImportedCard` set a fresh Mojave draft and
navigated to the blueprint, whose `storedDraft` initializers loaded Mojave — then this effect clobbered
it all back to the stale operation. It reproduced on every import until that retained Forge was cleared.

**Fix.** A fresh draft the user deliberately brought in — a just-imported card, or a typed
premise/title — is now authoritative. The rehydration effect early-returns when the arriving draft has
an `importedCard` or a non-empty `premise`/`title`, so a stale, unrelated retained Forge never hijacks
it. The retained Forge stays in storage and is still offered when creation starts from an empty draft
(the existing resume / start-new paths are unchanged and still green). UI-only change; no bridge
surface touched, so no parity impact.

**Test-first.** New RED test in `StoryBlueprint.test.tsx` ("keeps a freshly imported card and does not
let a stale retained Forge hijack it") reproduced the bug exactly (title read "Recovered Blueprint"
instead of "The Mojave") before the one-guard fix made it green.

**Verification.** `npm run typecheck` clean; focused StoryBlueprint suite 9/9 (incl. the two retained-
Forge resume/start-new tests); full `npm test` **core 601 / 45 + UI 157 / 25 = 758** green. No installer
rebuilt yet — the fix is in source only; a packaged rebuild is needed before it shows in the installed
app. Not committed pending the human's call.

**Gotcha for next agent.** The retained Forge is only offered from an *empty* new-story draft now. If a
user with a stale retained Forge wants to resume it, they must start a new story without importing/typing
first. That matches the reported intent (imports must win) but revisit if resume-after-import is ever
wanted.

---

## 2026-08-01 — Task 15B.1: gate-legal natural attack for every creature

Completed `bd968fb`. Reproduced the installed shadow-creature failure at two independent boundaries:
config normalization returned no natural attack, and a real submitted turn with a promoted generic
NPC (`skills: []`, `inventory: []`) emitted only the player's ruling. Both tests were observed RED
before production changed.

Universal action config v3 now defines `attack_natural`. For full-stat stories,
`applyUniversalActionDefaults` appends canonical `universal_natural_attack` only when the catalogue has
no existing natural-family action without skill/item/equipment/cost gates. This deliberately supports
already-frozen stories at runtime without mutating their persisted source. Its damage is injected by
the existing program-owned path (`-4` success / `-8` critical), and it resolves through normal gate,
dice, ruling, mutation, and death authority. Browser fallback config was updated in lockstep with core.

**Verification:** focused config, NPC agency, bootstrap regeneration, repository impact, and bridge
parity suites passed; `npm run typecheck` passed; complete core **580 / 44** and UI **156 / 25** =
**736 tests** passed. Existing neutral/dead/absent NPC tests remain green.

**Scope expansion recorded:** the active/detailed plans now include creation-time NPC sealed-skill
loadouts and broader premise-grounded universal/action/skill generation. One story still owns one
executable catalogue; NPC capability is hard-state access to it, never a second model-authored list.

**Next:** Task 15B.2 RED tests for bounded sealed `skillIds` on emergent NPC introduction, then expose
the validated capabilities to the NPC action planner.

---

## 2026-08-01 — Live combat remediation: diagnosis + plan (no code changed)

Reviewed the app after another agent completed Tasks 1–15A + the 2026-07-31 packaged remediation (HEAD
`14e320c`, verified green: core 578 / UI 156 = 734, typecheck clean). A second provider-backed packaged
human pass (Gemini, Solo Leveling RPG) reported four defects with screenshots. Traced root causes to
source and wrote `docs/superpowers/plans/2026-08-01-live-combat-remediation.md`.

**Key verified finding (Task 1, P0):** "the shadow entity never attacks back." Root cause is NOT
harm-detection (an initial hypothesis I checked and discarded) — `turn.ts::requireStory` normalizes the
schema with `applyUniversalActionDefaults` before npcAgency sees it, so the implicit `-4/-8` damage IS
visible and `dealsTargetHarm` is fine. The real cause: `bootstrap/instantiate.ts::instantiateGeneric`
builds creatures with `skills:[]`/`inventory:[]`, so they cannot gate-pass a skill/weapon-gated attack,
so `npcAgency.ts::chooseCounterAction` (and `planHostileNpcFallback`) find no legal counter → the
creature literally cannot fight back. Fix = a config-owned universal natural attack (no skill/weapon
requirement, implicit damage) in every full-stat catalog.

**Other three (diagnosed, less deeply source-verified — verify before implementing):** damage too small
(flat `-4`, STR 10 → `+0`, no weapon prop; generated ~100 HP mismatched) → scale by attribute/weapon
and/or forge HP; "no prose" = `safeSummary` on provider failure/audit reject → provider retry + richer
fallback prose; "unresolved target" = classifier fail + ambiguous target (stale "Dead man") → apply the
existing `targetFocus.deriveRecentPlayerTargetId` to recovery + presence hygiene.

**Verification:** read `npcAgency.ts`, `config/registry.ts`, `turn.ts:127`, `bootstrap/instantiate.ts`.
No source or test changed this session — repo stays green at `14e320c`. Diagnosis + a test-first entry
point per task are recorded in the new plan's task list and its Progress log (exact stopping point).

**Next:** the new plan's Task 1, Step 1 (failing test reproducing the shadow_entity bug), then Tasks
2–4 in order.

---

## 2026-07-29 — Task 9a: stage deadline primitive + bound the NPC planner

First slice of Task 9 (`2b43325`). Task 9 is split: 9a = the reusable deadline/fallback/telemetry
primitive applied to the highest-risk stage; 9b = wrap the remaining stages + persist metrics
(migration). See the plan's Task 9 section for the 9b checklist.

**What landed.** `orchestrator/stagePolicy.ts::runStage(stage, run, opts)` races an async stage
against `deadlineMs`; on timeout it aborts the stage (the injected `AbortSignal`) and returns a
DETERMINISTIC `fallback()` (never blocking the turn); on error it also falls back; a genuine caller
cancel re-throws (not a fallback). It emits a `StageMetric { stage, startedAt, durationMs, outcome }`
via `onMetric` — provider internals never leak. Clock + deadline timer are injectable
(`now`, `schedule`), so tests are deterministic without a global fake clock. `DEFAULT_STAGE_DEADLINES`
covers all five stages; exported from the orchestrator barrel.

`turn.ts` wraps the goal-driven NPC planner (Task 5's per-turn model call) in
`runStage("npc_planner", …, { fallback: () => [] })` and forwards `SubmitTurnOptions.onStageMetric`.
Note: `planNpcActions` already catches provider errors internally (→ `[]`), so `runStage` mainly adds
the DEADLINE bound (a hung provider → timeout → `[]`); the error path is a belt-and-braces net.

**Tests (+7).** 6 `stagePolicy` unit tests (ok / timeout+abort / error / caller-cancel /
already-cancelled / positive defaults) + a turn-level test asserting the `npc_planner` metric is
emitted with a non-negative duration.

**Verification.** typecheck clean; **core 512 / 41 (+7) + UI 139 / 25 = 651** green.

**Next:** plan Task 9b — wrap classifier/introduction/narrator/audit stages, persist `StageMetric[]`
on `turn_operations` (migration + bridge parity), fake-clock timeout/duplicate-turn tests.

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

---

## 2026-07-29 - Complete NPC agency, progressive authority streaming, and bounded turn stages

Completed detailed-plan Tasks 5-9 in commits `04e83b7`, `b753de3`, `fccab2c`, `09da205`,
`2b43325`, and `a803f76`.

- Goal-driven NPC planning now uses one bounded structured request for present idle NPCs, validates
  every proposal against the sealed action/item/skill catalogs and present targets, and resolves
  under a separate NPC budget. Invalid, dead, absent, malformed, timed-out, or failed-gate proposals
  become no NPC action.
- Deterministic provocation extends beyond combat to opposed contests, committed target harm, and
  sealed danger/opposition stakes without treating harmless aid or conversation as hostile.
- Provider-to-Play temporal tests prove safe prose is visible before the provider promise resolves.
  Accepted mechanical prose releases beat-by-beat behind the whole-draft authority audit, with a
  per-beat deterministic guard against unrecorded death.
- `runStage` now bounds classifier, NPC introduction, NPC planner, narrator, and authority audit.
  Timeouts/provider failures use deterministic narration-only, no-transition, no-NPC-action, or
  authority-safe prose fallbacks. Genuine caller cancellation propagates immediately, including when
  provider code ignores the abort signal.
- Migration 14 persists `StageMetric[]` on durable turn operations. Restart inspection retains the
  evidence, retry clears the previous attempt before recording new metrics, and both submit/retry
  bridge paths expose live telemetry.

Ordinary narrator failure now completes with safe deterministic prose, so already approved atomic
NPC transitions commit with that successful fallback turn. Genuine cancellation/failed operations
still leave no partial exchange or registry mutation. Planner encounter-gating remains deferred
because there is no authoritative encounter-active fact; using combat rulings as a proxy would
suppress accepted non-combat NPC agency. The call is deadline-bounded and measured meanwhile.

**Verification:** `npm run typecheck` passed; core **518 / 41 files** and UI **140 / 25 files**
passed (**658 tests** total). Focused production UI/core builds and `cargo check` passed. Seven
pre-existing React `act(...)` warnings remain. No installer was produced; packaging remains deferred
until the Internal Beta exit gate.

---

## 2026-07-29 - Prefer a responsive narrator default

Completed detailed-plan Task 10 in `a2656e4`. Recommendation config v2 changes the shipped
OpenRouter narrator binding from Claude Sonnet to `google/gemini-2.0-flash-001`, labeled
`Gemini 2.0 Flash · Fast`. `anthropic/claude-opus-4` remains available and is now visibly labeled
`Claude Opus 4 · Quality`; Sonnet and other curated choices remain available as well.

The change is versioned data rather than UI selection logic. The browser-safe bridge mirror, Role
Matrix version copy, reset-to-recommended behavior, and canonical catalog parity tests were updated
together. Existing custom bindings stay untouched; new defaults and explicit resets receive the
responsive narrator.

Focused RED tests first observed config v1, the Sonnet default, and missing speed/quality labels.
The first full run also identified two legitimate stale Role Matrix expectations, which now assert
the v2 reset contract.

**Verification:** `npm run typecheck` passed; core **519 / 41 files** and UI **141 / 25 files**
passed (**660 tests** total). Direct core/UI production builds and `cargo check` passed. Seven
pre-existing React `act(...)` warnings remain. No installer was built.

---

## 2026-07-29 - Make Forge bounded, durable, and resumable

Completed detailed-plan Task 11 in commit `80e3b44`.

- Bootstrap structured output now permits one model repair by default, including the cross-schema
  repair pass. Every provider-backed fragment has an independent 45-second deadline with injectable
  clock/scheduler hooks for deterministic tests.
- `BootstrapTimeoutError` identifies the exact timed-out fragment. Caller cancellation remains a
  distinct `AbortError` and wins immediately even if provider code ignores the aborted signal.
- Progress reports real phase, fragment, attempt, validation detail, total elapsed time, and
  per-fragment duration. Validated Phase A, actor-foundation, and action-batch checkpoints remain
  resumable after failure, timeout, cancellation, navigation, or restart.
- The shared bridge now owns a versioned Forge operation contract. Packaged/native state persists in
  SQLite settings; the browser/test bridge mirrors it in local storage. Writes are serialized so a
  late checkpoint cannot resurrect an operation after successful installation, and clear operations
  are ID-guarded so stale completions cannot erase a newer Forge.
- Wizard and Story Blueprint creation rehydrate retained work, show the real last event/timing,
  resume the retained request, or let the user explicitly discard it before editing. A completed
  story causes any stale retained operation to be ignored and cleaned instead of duplicated.
- A regression test proves failed full-stat rulebook replacement leaves the installed schema,
  rulebook version, and snapshot history untouched.

RED evidence was observed for the previous three-repair default, missing deadline scheduling,
provider-ignored cancellation, absent durable bridge methods, and both creation screens failing to
rehydrate retained work.

**Verification:** `npm run typecheck` passed. Core **524 / 41 files** and UI **144 / 25 files**
passed (**668 tests** total). Direct core and UI production builds passed; `cargo check` passed.
Seven pre-existing React `act(...)` warnings remain and are reserved for Task 14. No installer was
produced.

**Next:** detailed-plan Task 12, beginning with three literal card/persona fixtures that cover
explicit attributes, named possessions, and `{{user}}` / `{{char}}` macros.

---

## 2026-07-29 - Preserve card identity and explicitly carried starting gear

Completed detailed-plan Task 12 in commit `b348f83`.

- Added three literal V2/V3 card/persona acceptance fixtures covering prompt-time `{{user}}` and
  `{{char}}` expansion, explicit typed attribute names/scores, exact named possessions, scenery
  decoys, model-proposed decoy gear, and preservation of the original unexpanded creation source.
- RED evidence showed accepted mechanics could remain stuck on a stale import-preview substitution
  (`'s Echo Sense` instead of `Ari's Echo Sense`), multi-word possessions collapsed to generic
  `Dagger`/`Amulet`, apostrophe names became `Ash-Warden'S Ring`, and a model-proposed museum sword
  was installed despite never belonging to the player.
- Forge now resolves persona/card macros immediately before prompts, refreshes typed mechanics from
  the preserved card, and carries a transient resolved source into actor-foundation prompts and
  installation without mutating the raw card/persona snapshot.
- Deterministic starting-gear extraction couples each supported item to a carried/wielded/worn/kept/
  holstered/strapped/packed cue in the same sentence, retains bounded multi-word names, handles
  repeated item kinds, and no longer treats generic `has`/`owns` as proof of carried equipment.
- When card/persona prose is attached, only deterministically verified possessions are installed;
  unverified model proposals and scenery are excluded. Premise-only creation can still use bounded
  actor-foundation proposals, and an empty verified result receives neutral personal effects.

**Verification:** focused bootstrap/macro/equipment/cross-card suites passed **68 tests**. Fresh
`npm run typecheck` passed; core **527 / 42 files** and UI **144 / 25 files** passed (**671 tests**
total). Direct core and UI production builds passed; `cargo check` passed. The seven pre-existing
React `act(...)` warnings remain reserved for Task 14. No installer was produced.

**Next:** detailed-plan Task 13, beginning with independent acceptance tests for grounded
suggestions, retry draft retention, lorebook hierarchy, character dossier/loadout navigation, and
rulebook-regeneration persistence.

---

## 2026-07-29 - Close remaining product acceptance risks

Completed detailed-plan Task 13 in commits `3ebd58d`, `e0f210d`, `6dab752`, and `75dfe6c`.

- Suggested player actions now load the complete registry only to identify absent names, then reject
  and repair any suggestion that names a registered character who is not in the live scene.
  Suggestions remain constrained to current-scene context and legal sealed actions.
- A lorebook entry save failure is handled on-screen instead of becoming an unhandled promise
  rejection. The exact content and trigger keywords remain editable, duplicate clicks are blocked
  during the request, and the same draft can be retried.
- Existing hierarchy acceptance proves the global lorebook shelf opens one selected parent and
  fetches only that book's child entries.
- A new two-character acceptance test clicks the non-player card and proves both dossier and
  equipment/loadout routes receive that selected registry id. The dossier suite continues to prove
  correct loadout drill-in and cumulative progression rendering.
- Rulebook regeneration acceptance now simulates a provider failure after a validated checkpoint.
  The installed `Blade Adept`/`Strike` catalog and an unsaved title remain visible; retry uses the
  same story, duplicate mode, and retained checkpoint before reporting installation success.

RED evidence was observed for absent-character suggestions (accepted without repair) and lorebook
save failure (no visible recovery plus an unhandled rejection). The character and regeneration
paths already behaved correctly, so their new multi-entity and failure/retry tests harden those
contracts without unnecessary runtime changes.

**Verification:** `npm run typecheck` passed; core **528 / 42 files** and UI **147 / 25 files**
passed (**675 tests** total). Direct UI production build and `cargo check` passed. The only stderr
noise is the known seven React `act(...)` warnings, now the sole target of Task 14. No installer was
produced.

**Next:** detailed-plan Task 14, beginning by turning the seven current React `act(...)` warnings
into focused test failures, then fixing test synchronization without changing correct runtime
behavior.

---

## 2026-07-29 - Eliminate the remaining React test warnings

Completed detailed-plan Task 14 in commit `f1d8a4a`.

Play and Overview now install a focused warning guard that records React's `not wrapped in act(...)`
diagnostic and fails the owning test. The first guarded run reproduced the Overview failure while
confirming that explicit Play cleanup cancels the ruling reveal/count-up work before it can update an
unmounted test. Play also wraps the subscribed route reset in `act`. Overview's synchronous error
assertion now waits for the already-started mount promises inside `act`.

No runtime source change was needed: the warnings were caused by test teardown and pending async
work, not a product lifecycle defect. Keeping the guards means future leaked updates cannot silently
return.

**Verification:** focused Play + Overview **20 tests** passed with no warning output; complete UI
suite **147 / 25 files** passed with clean stderr. Fresh `npm run typecheck` and `npm test` passed:
core **528 / 42 files** + UI **147 / 25 files** = **675 tests**. Direct UI production build passed.
No installer was produced during Task 14.

**Next:** detailed-plan Task 15: run every Internal Beta exit command independently, build the
unsigned packaged app, execute the create/import/play/restart/continue and authority acceptance
matrix, and record exact artifact paths and SHA-256 hashes.

---

## 2026-07-31 - Complete the automated Internal Beta gate and package v0.2.8

Completed Task 15's source and automated verification gate. The configured coverage command first
failed despite the ordinary suite passing: the engine measured 90.06% statements/lines, 84.81%
branches, and 94.20% functions against its 100% thresholds. Commit `4237735` adds deterministic
coverage for equipment/loadout and loot boundaries, sparse progression fallbacks, attribute
advancement guards, equipment-enabled gates, explicit XP ledger behavior, resolver attribute and
equipped/opposed effects, every opposed natural-roll precedence case, deception, and unknown action
labels. It also removes two branches that were provably unreachable under their existing caller and
data invariants. The real configured engine gate now reports 100% statements, branches, functions,
and lines.

Fresh closeout evidence:

- `npm run typecheck`: passed in 12.351 seconds.
- `npm test`: core 546/42 files plus UI 147/25 files, 693 total, passed in 20.616 seconds. UI stderr
  remained clean and the `act(...)` regression guards passed.
- `npm --workspace @midnight-tavern/core run coverage`: 546 tests and 100% in all four configured
  coverage dimensions, passed in 11.615 seconds.
- Direct core build: passed in 4.123 seconds.
- Direct UI production build: passed in 8.067 seconds.
- `cargo check`: passed in 3.76 cargo-reported seconds.
- Root package build: passed and Tauri reported both bundles complete. The desktop turn was
  interrupted after completion and cargo printed an implausible elapsed value, so no package
  duration is claimed.
- The release executable, MSI, and NSIS files were independently re-opened and hashed after the
  interruption. No cargo, rustc, Tauri, WiX, or NSIS packaging process remained.
- The packaged release executable was launched with an isolated app-data profile, remained alive
  for eight seconds, and only that newly launched process was stopped. The user's existing installed
  Midnight Tavern process was left untouched.

Artifacts:

- `packages/shell/src-tauri/target/release/midnight-tavern.exe` - 22,791,168 bytes - SHA-256
  `F2BE3989C2CF57611EADF31D841E3A1EE197E832D3927F9E3E8B6E8B7584D36F`
- `packages/shell/src-tauri/target/release/bundle/msi/Midnight Tavern_0.2.8_x64_en-US.msi` -
  9,261,056 bytes - SHA-256
  `077504A87FC1A76FCFFDBE99820589503692ECC84C93ABB6330F900D1780F661`
- `packages/shell/src-tauri/target/release/bundle/nsis/Midnight Tavern_0.2.8_x64-setup.exe` -
  5,614,826 bytes - SHA-256
  `74E258DDCF878D40022E9EC3B7BD54618AED12BDFAA859541FA7897E2196E7BA`

Automated acceptance covers real-file close/reopen persistence, create/import, play/history,
registry-backed NPC introduction and presence, same-turn NPC agency, ruling-before-delta, verified
streaming, Forge recovery, grounded suggestions, macros, literal cross-card fixtures, and starting
gear authority. Detailed-plan Task 15 Steps 2, 3, and 5 deliberately remain partial: the isolated
startup smoke is not a substitute for the human's visual/provider-backed packaged journey. The
single next action is that acceptance pass using the NSIS installer; Task 16 signing/updater/CSP
remains out of scope.
---

## 2026-07-31 - Packaged acceptance remediation opened

The first provider-backed v0.2.8 acceptance pass found seven defects that the prior automated gate
did not expose: Overview gives the static premise more weight than live chapter summaries;
character dossiers reuse one global story and omit soft fields; cancelled Forge lacks a clear
atomic fresh-start path; Possible Moves disappear after structured-provider failure; pronoun attack
continuations lose their current target when an older NPC is also present; hostile NPC goal actions
vanish when the planner provider degrades; and Play can lose its latest/read-position anchoring.

**Diagnosis.** Codebase-memory tracing and targeted runtime inspection found direct owners for all
seven. `getCharacterDossier` explicitly reads global arc/chapter summaries. `runBackground` filters
out present characters without soft state. `forgeStory` always reuses a retained request/checkpoint.
Suggestions throw after their repair budget. Universal local attack recovery has no recent target
focus. The NPC planner returns no action on provider failure, and Play follow mode relies on delayed
state without layout anchoring. Packaged logs also showed classifier/provider HTTP 429 and malformed
small responses; rate limiting is real external degradation, not a local crash, and must remain
honestly reported while safe deterministic fallbacks work.

**Planning/baton.** Added
`docs/superpowers/plans/2026-07-31-packaged-beta-remediation.md`, opened Task 15A in the active plan,
and replaced HANDOFF/NEXT-AGENT-PROMPT with the current root causes, authority constraints, task
order, and exact next Forge slice. No runtime source changed. The old unsigned v0.2.8 artifacts are
now stale for acceptance; per the product owner, package only once after all remediation source
slices and the combined gate are complete.

**Baseline.** Before this docs checkpoint, typecheck passed and core 546/42 plus UI 147/25 = 693
tests passed. Only user-owned `.codex/` and `opencode.json` were untracked.

---

## 2026-07-31 - Task 15A.1: Forge resume and fresh-start lifecycle

**RED evidence.** Two new StoryBlueprint tests restored a cancelled durable Forge and looked for a
**Start new Forge** action. Both failed because the UI exposed only **Resume retained forge** and an
asynchronous discard. The race test also required the retained durable operation to finish clearing
before any replacement save.

**What landed.** `StoryBlueprint` now keeps explicit resume behavior while offering **Start new
Forge** beside **Resume saved Forge**. Fresh start waits for the queued retained write, clears only
the matching retained operation id through the already id-guarded bridge contract, resets retained
progress, and then generates a new request/operation with no resume checkpoint. A durable-clear
failure is surfaced and stops replacement; it cannot silently race a new save. Cancellation still
retains validated fragments and the editable blueprint.

**Tests and verification.** Focused StoryBlueprint: 8/8. Complete UI: 149 tests/25 files. Core: 546
tests/42 files. Root total: 695 tests. Typecheck passed. The old package was not rebuilt, per the
product owner's instruction to package only after all Task 15A work is complete.

**Next:** Task 15A.2 - durable soft envelopes, present-cast analysis, character-only dossier history,
and honest Character history UI states.

---

## 2026-07-31 - Task 15A.2: Registry-owned character memory and dossiers

**RED evidence.** Repository tests showed player/NPC insertions persisted `soft_json` as null;
`applySoftPatch` created a new hard-state `ghost` row from analyzer output; a two-character dossier
test received the global chapter summary instead of either character's evidence; and the dossier UI
still rendered **STORY SO FAR** with blank dashes and an empty Mentality section. A legacy-row turn
test also required both present characters to appear in the analyzer prompt after their soft state
was cleared.

**What landed.** Every character insertion now receives a durable soft envelope: primary for the
player, secondary for NPCs. Completed-turn background analysis lazily repairs old present hard-only
rows, including the player. The analyzer prompt now forbids registry creation, and both its caller
and soft-state store reject unknown, non-present, cross-story, and unknown relationship targets.
Dossiers no longer load global chapters/arcs for their recap; **Character history** is built only
from the selected character's backstory, observations, and authoritative events where they were the
actor or target. Missing Mentality, Mood, Location, Goal, and character history are labeled honestly
as not observed rather than shown as shared plot or broken blanks. The in-memory and SQLite bridge
paths preserve the same dossier meaning.

**Tests and verification.** Focused core: 67 tests/5 files. Focused UI: 2 tests/1 file. Complete
core: 550 tests/43 files. Complete UI: 150 tests/25 files. Root total: 700 tests. Typecheck passed.
No installer was built.

**Next:** Task 15A.3 - recover a pronoun continuation target only from one unique recent committed
player ruling whose target remains present and alive.

---

## 2026-07-31 - Task 15A.3: Authoritative recent-target continuity

**RED evidence.** Classifier recovery could not resolve "attack it again" when an older NPC and the
current creature were both present. A turn-level provider-failure reproduction produced no ruling,
and the new target-focus suite initially had no implementation.

**What landed.** The orchestrator now derives at most one recent focus from the newest committed
allowed player ruling in the bounded message window. The target must remain present, non-player,
and alive; a newest turn with multiple targets is ambiguous and does not fall back to an older
event. Classifier recovery may reuse that id only for continuation wording. An explicit living name
always wins, while dead, absent, stale, unknown, or ambiguous focus fails closed. Sealed actions,
gates, effects, damage/death, and the two-action player budget were not changed.

**Tests and verification.** Focused classifier/target-focus/turn suites: 80 tests/3 files. Complete
core: 558 tests/44 files. Complete UI: 150 tests/25 files. Root total: 708 tests. Typecheck and diff
checks passed. No installer was built.

**Next:** Task 15A.4 - deterministic, scene-grounded Possible Moves on provider degradation while
preserving cancellation and normal DM authority when a suggestion is sent.

---

## 2026-07-31 - Task 15A.4: Grounded Possible Moves during provider degradation

**RED evidence.** Provider HTTP errors, structurally invalid output after all three attempts,
semantically generic output, dead/absent cast mentions, empty sealed catalogs, and sparse scenes
were exercised. Five cases initially threw `SuggestionGenerationError` instead of returning safe
choices or an honest empty result.

**What landed.** Rich committed narrator context now yields five deterministic fallback choices
after provider failure or exhausted repair. The builder uses only extracted scene anchors, living
visible registry characters, and non-combat gate-allowed sealed actions; it does not infer combat,
invent items/skills, mention unavailable characters, or claim outcomes. Sparse scenes return no
fabricated choices. Caller abort remains an abort. Play renders fallback rows as normal insert-only
choices, preserving the draft and all downstream classifier/gate/ruling authority.

**Tests and verification.** Focused core suggestions: 13 tests/1 file. Focused Play/bridge: 38
tests/3 files. Complete core: 564 tests/44 files. Complete UI: 151 tests/25 files. Root total: 715
tests. Root typecheck and diff checks passed. No installer was built.

**Next:** Task 15A.5 - persist only explicitly validated hostility and let a living present hostile
NPC choose a legal sealed damaging action when the planner provider degrades.

---

## 2026-07-31 - Task 15A.5: Persisted hostility and autonomous NPC attacks

**RED evidence.** A committed narrator sentence explicitly showing the Grave-wight attacking the
player produced no disposition transition. A planner provider failure and a valid empty planner
response both left a flagged hostile NPC with no ruling. A rewind test showed the flag was never
committed, and an ambiguous shortened name initially marked two registry actors hostile.

**What landed.** `npc_hostile_to_player` is now an engine-owned hard-state fact derived only from
committed narrator evidence in which one unambiguous present living registry actor explicitly
attacks the player. Player claims, reverse-direction attacks, negation, ominous appearance, and
ambiguous aliases fail closed. The transition commits atomically after the pre-turn checkpoint and
rewind restores the earlier flag state. If bounded goal planning fails, times out, returns empty, or
omits an eligible hostile actor, deterministic policy chooses at most one gate-legal sealed damaging
action and routes it through the normal resolver, ruling, damage/death, and persistence path. An NPC
that already reacted is excluded from planning, preserving one shared NPC action for the turn.

**Tests and verification.** Focused introduction/agency/history: 56 tests/3 files. Negative coverage
includes neutral/unknown evidence, dead or absent actors and targets, no legal damaging action,
ambiguous aliases, shared reaction budget, and rewind. Complete core: 578 tests/44 files. Complete
UI: 151 tests/25 files. Root total: 729 tests. Root typecheck and diff checks passed. No installer
was built.

**Next:** Task 15A.6 - stabilize Play scroll anchoring across initial load, streaming, historical
reading, drawer/layout growth, and explicit Jump to latest.

---

## 2026-07-31 - Task 15A.6: Stable Play transcript anchoring

**RED evidence.** A DOM-metric resize test placed the reader near latest, increased transcript
height without a React data change, and observed `scrollTop` remain at 850 instead of following the
new 1500-pixel bottom. The old effect watched delayed state and render dependencies only.

**What landed.** Follow-latest intent now updates synchronously in the scroll handler. React content
and drawer changes anchor in a layout effect before paint, while a bounded `ResizeObserver` covers
font loading, wrapping, ruling expansion, and other measured height changes. The observer follows
only in latest mode. Historical reading leaves the exact scroll position untouched across streaming
and drawer reflow. **Jump to latest** synchronously restores follow mode before the next resize.

**Tests and verification.** Focused Play: 21 tests/1 file. New DOM-metric coverage proves initial
load at latest, near-bottom resize following, historical resize stability, streaming/drawer
stability, and Jump-to-latest resumption. Complete core: 578 tests/44 files. Complete UI: 154
tests/25 files. Root total: 732 tests. Root typecheck and diff checks passed. No installer was built.

**Next:** Task 15A.7 - put the latest automatic chapter summary in the primary Overview pane until
an arc synthesis exists, with premise retained as compact context.

---

## 2026-07-31 - Task 15A.7 and combined remediation release gate

**RED evidence.** Overview tests covered premise-only stories, multiple closed chapters without an
arc, and a persisted arc. They failed because there was no primary chapter document, the premise
was rendered inside an arc-shaped document, timeline entries were not selectable, and neither
generated document had a stable semantic boundary.

**What landed.** `f6c526b` makes the latest persisted chapter the primary reading document until an
arc exists. A persisted arc remains primary by default; selecting any summarized timeline chapter
opens that character-independent historical chapter document, and **Back to current arc** restores
the synthesis. Timeline entries support Enter/Space and expose selected state. The immutable story
premise is now a small, separately labeled **Original story premise** block and is never presented
as generated chapter/arc history. The two-column Overview stacks below 760px so the same semantic
order remains readable on narrow windows.

**Combined verification.** Focused Overview passed **5 tests / 1 file**. Fresh root typecheck
passed. Fresh full suites passed: core **578 / 44 files** plus UI **156 / 25 files**, **734 tests**
total, with the UI warning guard clean. Configured core coverage remains **100% statements,
branches, functions, and lines**. `npm run build` passed the core/UI production builds and the Tauri
release/package build; standalone `cargo check` passed. Codebase memory was re-indexed at 6,207
nodes / 15,714 edges. The release executable remained alive for an isolated eight-second startup
smoke and only that smoke process was stopped.

Fresh unsigned v0.2.8 artifacts:

- `packages/shell/src-tauri/target/release/midnight-tavern.exe` - 22,795,264 bytes - SHA-256
  `E557CBBDE60EEB6BC5BD5D1083D78900F7B99061280A51571A64E386505DF866`
- `packages/shell/src-tauri/target/release/bundle/msi/Midnight Tavern_0.2.8_x64_en-US.msi` -
  9,261,056 bytes - SHA-256
  `AAC815ADF63B33867022640C020A97BB2151B4BE58E5C66A904CF7C4A3C266BF`
- `packages/shell/src-tauri/target/release/bundle/nsis/Midnight Tavern_0.2.8_x64-setup.exe` -
  5,619,121 bytes - SHA-256
  `AC06D7ED7678A8F4BABBED7DA9F758917D3C699516C7E3E757A7BA4FEFC5B349`

All seven packaged findings now have source fixes and regression coverage. The remaining evidence
is the human's visual/provider-backed installed-app journey, especially provider rate-limit
behavior and the seven affected workflows. Automated startup cannot claim that observation.
Task 16 signing/updater/CSP remains explicitly out of scope.

---

## 2026-08-01 - Task 15B.2: Creation-time NPC capability loadouts

**RED evidence.** Focused registrar/agency tests produced four intended failures: a generic NPC
ignored proposed sealed skills, the registrar prompt did not expose the story skill catalogue,
structurally excessive skill proposals were accepted, and the reaction planner could not see the
actor's learned skills or other gate-relevant hard state.

**What landed.** `41c5963` lets only a newly grounded emergent actor propose up to three sealed story
skill ids. Generic instantiation filters unknown ids, deduplicates known ids, and grants novice rank
with zero successes. Template NPC sheets remain entirely forge-authored, and an existing actor's
presence update cannot rewrite its loadout. The registrar receives concise sealed skill metadata;
the NPC action planner receives attributes, resources, learned skills, and inventory. The engine's
ordinary action catalogue and gate remain the only executable authority. `CONTEXT.md` records these
domain terms and invariants for future agents.

**Verification.** Focused NPC introduction and agency suites passed. Fresh root typecheck passed.
Complete suites passed: core **585 tests / 44 files** plus UI **156 tests / 25 files**, **741 tests**
total. `git diff --check` passed before commit. No installer was built.

**Next:** Task 15B.3 - expand the universal registry to balanced v4 coverage and forge a
premise-grounded 30-action / 6-10-skill rulebook without weakening validation or resume guarantees.

---

## 2026-08-01 - Task 15B.3: Broader story-grounded action and skill catalogues

**RED evidence.** Five focused assertions failed before implementation: the universal registry was
still v3 and lacked balanced family coverage, an action could claim a family from the wrong
category, Phase A allowed fewer than six skills, Phase B still requested only three actions per
category, and the forge prompt did not require the broader final rulebook.

**What landed.** `e3a4801` advances the universal registry to v4 with 31 families across combat,
social, exploration, crafting, and utility, with at least six families in every category. Forge
Phase A now validates 6-10 distinct premise-grounded skills. Phase B generates exactly six actions
per category, 30 total, with at least four distinct families in each category and strict
family/category validation. Combat always retains the ungated canonical natural attack; skill
coverage repair cannot accidentally gate it. Prompts explicitly require story relevance and avoid
inventing irrelevant magic, weapons, or crafts. Provider budgets and the fragment deadline were
raised for the larger structured result. The browser bridge now consumes the shared universal JSON
instead of maintaining a drifting copy.

**Verification.** Two repeated full-suite attempts exposed Windows/Node v24 Vitest worker `EPIPE`
exits rather than assertion failures. Core Vitest now uses one worker, after which the ordinary root
commands were stable. Fresh root typecheck passed. Complete suites passed: core **588 tests / 44
files** plus UI **156 tests / 25 files**, **744 tests** total. Direct core and UI production builds
passed. `git diff --check` passed before commit. No Tauri package or installer was built.

**Next:** Task 15B.4 - replace flat implicit strike damage with deterministic attribute/equipment
scaling and verify generated encounter health remains playable without weakening death authority.

---

## 2026-08-01 - Task 15B.4: Deterministic damage and encounter-health balance

**RED evidence.** Three focused assertions failed before implementation: ordinary and high-Strength
natural strikes both dealt the authored flat `-4`; a weapon-required attack that omitted
`scaleByItemProp` ignored the weapon's damage prop; and a generic creature in a 100-health story was
created at 100/100 rather than an encounter-sized pool.

**What landed.** `e43ae50` makes combat attack damage engineering-owned at resolution time. Positive
governing-attribute modifiers and bounded item damage add to lethal target damage. Weapon-required
attacks infer the conventional `damage` prop when generated definitions omit the scaling marker,
while untrusted prop values are clamped to 0-20. Combat involving an untemplated generic NPC uses a
six-hit lethal-resource floor, so already-persisted 100-health fallback creatures become playable
without rewriting their state. Future generic NPCs are created with a six-baseline-natural-hit
lethal pool. Explicit named templates retain their authored durability, and death remains exclusively
the ledger's threshold transition.

**Verification.** Focused resolver/instantiation tests passed **31 tests / 2 files**. Fresh root
typecheck passed. Complete suites passed: core **592 tests / 45 files** plus UI **156 tests / 25
files**, **748 tests** total. Direct core and UI production builds passed. The history, rollback,
difficulty, ledger, and playthrough suites remained green. No Tauri package or installer was built.

**Next:** Task 15B.5 - retry transient provider failures and replace generic safe narration with
richer prose derived strictly from the authoritative ruling.

---

## 2026-08-01 - Task 15B.5: Provider resilience and authority-safe fallback prose

**RED evidence.** Three focused assertions failed before implementation: an HTTP 429 response was
returned immediately rather than retried; deterministic fallback contained only a model-authored
hint and omitted actor/action/outcome; and a mechanically unsafe hint could assert unrecorded death,
damage, and loot.

**What landed.** `e7548ab` gives router completion and streaming calls at most three attempts for
network failures and HTTP 408/409/425/429/5xx. Attempts share the original timeout and cancellation
guard. Exponential delay begins at 250ms; numeric/date `Retry-After` is honored but capped at two
seconds. Authentication, malformed output, cancellation, and permanent client failures do not
retry. Narrator streaming retries only before any delta is visible, so a disconnect cannot duplicate
already-shown prose. Deterministic safe narration now names the ruling actor, action, and outcome;
it appends only hints with no mechanical vocabulary or deterministic contradiction and derives death
solely from authoritative `causedDeathOf` evidence.

**Verification.** Focused router/authority guard tests passed **28 tests / 2 files**. Fresh root
typecheck passed. Complete suites passed: core **596 tests / 45 files** plus UI **156 tests / 25
files**, **752 tests** total. `git diff --check` passed before commit. A root `npm run build` also
invoked Tauri and refreshed local MSI/NSIS bundles despite no installer being needed; those outputs
are not acceptance artifacts and will not be rebuilt or handed off.

**Next:** Task 15B.6 - route degraded ambiguous continuation attacks through the unique recent living
target and retire stale scene presence only from explicit validated evidence.

---

## 2026-08-01 - Task 15B.6: Recent-target timeout recovery and presence hygiene

**RED evidence.** A full turn with two present NPCs, a unique recent living target, continuation
wording, and a hung classifier stage fell to narration-only instead of resolving the sealed attack.
A second failure showed an exact committed "You are alone now" roster statement could not retire an
older present NPC. A third edge-case failure showed substring matching could confuse a dramatic use
of "alone" with physical scene isolation.

**What landed.** `5f4e85d` exposes the classifier's sealed deterministic failure recovery to the turn
stage fallback, so provider errors and outer stage timeouts use identical action/target validation
without another model request. Recent focus applies only to continuation wording and only when the
latest authoritative player ruling identifies one present living non-player target; explicit names
still override, while ambiguous/dead/absent focus remains unresolved. Existing-character presence
grounding must now place the actor and evidence in the same sentence. A leave may omit the name only
when it quotes an exact, narrowly recognized committed roster sentence such as "You are alone now"
or "No one else remains." Mere omission, player-only claims, and dramatic uses fail closed. Registry
records remain; cancellation coverage proves transitions do not commit before the atomic save.

**Verification and package.** Focused classifier/turn/NPC-introduction tests passed **101 tests / 3
files**. Fresh root typecheck passed. Complete suites passed: core **601 tests / 45 files** plus UI
**156 tests / 25 files**, **757 tests** total. Final root build passed core/UI/Vite and optimized Rust,
then produced unsigned NSIS and MSI bundles. HANDOFF records exact paths, sizes, signatures, and
SHA-256 hashes.

**Next:** human provider-backed packaged acceptance. No known Task 15B source item remains; record
new observations before changing code.

---

## 2026-08-01 — Task 15C: narration, organic NPC registry, and provider integrity

**Packaged evidence and RED tests.** The installed app produced a targetless `Reassure Survivor`
ruling when no survivor existed, exposed a `[Chronicle Note]` planning block, and let the narrator
introduce Marta Hearthwright plus other individuals without registry rows. A NanoGPT key could be
reported valid after only its public model catalogue loaded. Retrying degraded narration retained
the old 401 banner while the busy indicator ran. Focused tests were observed failing for the action
schema/recovery path, split-chunk internal-note stream, current-turn organic NPC promotion, public
catalogue authentication false positive, and stale retry state.

**What landed.** Target legality is now one shared catalogue rule used by prompt validation and
deterministic recovery: opposed/target-effect/target-required universal actions need one different,
present character, so a plain call for help stays narration-only. A stateful stream filter removes
internal Chronicle Note blocks from deltas and stored prose even when markers span chunks. The
narrator remains free to introduce people and creatures organically; bounded proper-name,
appositive, actor-noun, and actor-verb grammar promotes them into the registry before the same turn
commits. Generic promoted actors receive up to three sealed, story-authored usable skills, while
mechanical action is deferred to the next beat and remains engine-gated. Provider key validation now
requires a one-token authenticated chat request after discovery. Narration retry clears the stale
fallback notice at start and settles `thinking`/phase on both success and failure.

This batch also packages the already-tested retained-Forge import guard, 120-second Forge fragment
deadline, UUID-safe fallback names, narrator degradation reason/actions, and ruling-before-streaming
work that had remained source-only after the previous packaged build.

**Verification and package.** Source landed as `76c6c5e`. Fresh root typecheck passed. Complete suites passed: core **609 tests /
45 files** plus UI **160 tests / 25 files**, **769 tests** total. `npm run build` passed core, UI/Vite,
optimized Rust, MSI, and NSIS; a fresh incremental `cargo check` also passed. Fresh unsigned v0.2.8 artifacts:

- NSIS `packages/shell/src-tauri/target/release/bundle/nsis/Midnight Tavern_0.2.8_x64-setup.exe` —
  5,624,379 bytes — SHA-256 `CC5624D67E6CA6454BBFB5C5C19207B1E55E91D0A78C27FC4A0C695C4DE0F2CF`.
- MSI `packages/shell/src-tauri/target/release/bundle/msi/Midnight Tavern_0.2.8_x64_en-US.msi` —
  9,265,152 bytes — SHA-256 `601C5A8ABE573A876424A1BAB7818C2E76D5449B6C0A566AB159D76F9FFC4CCC`.
- App EXE `packages/shell/src-tauri/target/release/midnight-tavern.exe` — 22,795,264 bytes —
  SHA-256 `053AB2F0FB98A9A5CAC59976F605DF7D7C48275C9A98962DB2390E039251902C`.

All three report `NotSigned`, expected until the later release/signing phase. Manual provider-backed
acceptance remains the human's next step; automated success does not claim that visual journey.

---

## 2026-08-01 — Task 15D: directional Assist and narrator identity repair

**Packaged evidence and RED tests.** Read-only inspection of
`%APPDATA%\com.midnighttavern.app\midnight-tavern.db` confirmed the exact live state. The classifier
operation for “Is anyone there? I need help!” had fallen into deterministic recovery and matched the
broad `help` alias as outward `Assist`, even though the structured classifier returned narration
only. The next two narrator messages established a man, Bess, and then “I am Bram Kelder. This is
Bess,” while the `characters` table still contained only the player. Five focused failures captured
direction reversal, past-tense actor discovery, prose-only history repair, generic-name enrichment,
and identity rollback.

**What landed.** Source commit `963d71a` makes Assist directional: requests to receive help are
dialogue at both model-output and local-recovery boundaries, while “I help the Guard…” still resolves
normally. Bounded entity grammar now recognizes ordinary past-tense actor prose, dogs, and direct
self/introduction declarations. A revealed name enriches one present generic human row instead of
creating a second person; the player's own repeated introduction is excluded. Deterministic
discoveries supplement and reconcile registrar proposals, so a smaller provider cannot omit a real
actor or create a duplicate. Character display names can now be updated, migration 15 snapshots
identity in turn checkpoints, and rewind/delete restores the prior provisional name. An exact
integration fixture starts with the already-broken Bram/Bess transcript and proves the next turn
registers both before classification.

**Verification and package.** Fresh root typecheck passed. Complete suites passed: core **618 tests /
45 files** plus UI **160 tests / 25 files**, **778 tests** total. `cargo check` passed. `npm run build`
passed core, UI/Vite, optimized Rust, MSI, and NSIS. Fresh unsigned v0.2.8 artifacts:

- NSIS `packages/shell/src-tauri/target/release/bundle/nsis/Midnight Tavern_0.2.8_x64-setup.exe` —
  5,626,573 bytes — SHA-256 `1BE6146A299C1BEAB9FB2B40EE3DE11C00E64D49A3B0B34A714DF90D5F4DC059`.
- MSI `packages/shell/src-tauri/target/release/bundle/msi/Midnight Tavern_0.2.8_x64_en-US.msi` —
  9,269,248 bytes — SHA-256 `8237481D91917278E731B3ED387C3788293E9020A8BAFAC87563A650C9ED5CCB`.
- App EXE `packages/shell/src-tauri/target/release/midnight-tavern.exe` — 22,799,360 bytes —
  SHA-256 `FFD55BC0A7F5F7DBD06494BBC8B565A4FA7D60CB5DBF359D72911A38591D532D`.

All report `NotSigned`. Manual installed-app acceptance remains open. In the affected existing save,
the first new turn under this build repairs Bram Kelder and Bess from the two recent narrator
messages before it classifies the player's action.

---

## 2026-08-02 - Task 15E: Cyraeth narrated-actor integrity repair

**Packaged evidence and RED tests.** Read-only inspection of the installed log, transcript,
operations, events, checkpoints, and SQLite character state for `Cyraeth Adventure` showed a fully
successful provider turn followed by an invalid roster: the player and Daen were joined by phantom
rows `It`, `Third`, and `He`, while the narrator's younger archer, older woman, large dog, and an
earlier alien predator were missing. Focused failures reproduced sentence-initial pronoun/ordinal
promotion, missed described actors, internal recent-history truncation, historical actors returning
as present, unsafe cleanup, and a later name reveal creating a duplicate when several provisional
people existed.

**What landed.** Source commits `c6abef6` and `32a7ac2` harden narrated-actor extraction without
moving identity authority to the model. Pronouns and ordinals are rejected; described people and
creatures can cross bounded modifiers into ordinary past-tense agency verbs; depictions remain
excluded. Discovery now consumes the full caller-bounded narration window, and actors found only in
older prose enter the registry as historical/absent. Migration 16 deletes only exact unused
auto-generated `He`, `It`, and `Third` scene rows, scrubs their hard/soft/presence/identity checkpoint
dimensions, and preserves mechanically referenced short-name characters. Context around an
unambiguous self-introduction selects the correct provisional human among several, preserving its
id instead of creating a duplicate. All registry, presence, and identity changes remain atomic with
the turn.

**Verification and package.** The focused actor/turn/database suite passed **34 tests / 3 files**.
Fresh root typecheck passed. Complete suites passed: core **625 tests / 45 files** plus UI **160
tests / 25 files**, **785 tests total**. `cargo check` passed. `npm run build` passed core, UI/Vite,
optimized Rust, MSI, and NSIS. Fresh unsigned v0.2.8 artifacts:

- NSIS `packages/shell/src-tauri/target/release/bundle/nsis/Midnight Tavern_0.2.8_x64-setup.exe` -
  5,624,034 bytes - SHA-256 `F19130E9AB40646AA2E41D58E0B5929CA26792431D597FEC9E6A78D6F79E7725`.
- MSI `packages/shell/src-tauri/target/release/bundle/msi/Midnight Tavern_0.2.8_x64_en-US.msi` -
  9,269,248 bytes - SHA-256 `88162E67A7F1CC5FD15323AA6A0B5444C06D9A6912C525102C4F6BBA2769DED3`.
- App EXE `packages/shell/src-tauri/target/release/midnight-tavern.exe` - 22,799,360 bytes -
  SHA-256 `98B0169A6894DAEA1F9308A7C0EED2770F4B857D28578EAD67C14F95524D9A86`.

All report `NotSigned`. The installed save itself was not manually modified. Its first new turn under
this build should remove the unused phantom rows, repair real present actors, and register the older
predator as absent; manual provider-backed acceptance remains the human's next step.

---

## 2026-08-02 - Task 15F: Cyraeth villager coreference and narration-guard repair

**Read-only live-state diagnosis.** The complete `Cyraeth Adventure` transcript, variants, latest
turn operation, rulings, character hard/soft rows, checkpoints, story schema/blueprint, and native
log were inspected without changing the installed database. The latest turn was not a provider or
mechanics failure: all five stages completed, the `Reassure Survivor` attempt validly failed on d20
6 vs DC 8, and the 77.2-second operation committed one ruling. The narrator returned 3,691
characters, but only a 1,866-character safe prefix and deterministic recap were stored after the
keyword-only death guard rejected the unseen remainder. The same evidence established the actual
cast: `Daen` was the first man, `Daenin` the younger man, `Mera` the older woman (later shortened to
the woman), and the large dog was distinct. Broad provisional rows had been activated as separate
characters.

**RED -> GREEN repair.** Focused failures reproduced `First man` beside existing `Daen`, failure to
resolve the appositive `Younger man - Daenin`, failure to bind the dialogue vocative `Mera` to the
specific older woman when a broad `Woman` row also existed, retention of the registrar's duplicate
transitions, and false rejection of `could have killed` / `does not mean anyone is dead`. Source
commit `bd4f99d` adds bounded third-person name explanations, descriptor-first appositives,
unambiguous vocative resolution, overlap-specific candidate selection, and narration-grounded alias
suppression in the atomic transition merge. The deterministic guard now distinguishes questions,
modal/counterfactual language, explicit negation, and incomplete attempts from concrete death
assertions, while new edge cases prove unruled `falls dead`, `died`, and `was slain` remain blocked.

**Verification and package.** Focused actor/authority/turn coverage passed **48 tests / 3 files**.
Fresh root typecheck passed. Complete suites passed: core **632 tests / 45 files** plus UI **160
tests / 25 files**, **792 tests total**. `cargo check`, `git diff --check`, and `npm run build` passed.
Fresh unsigned v0.2.8 artifacts:

- NSIS `packages/shell/src-tauri/target/release/bundle/nsis/Midnight Tavern_0.2.8_x64-setup.exe` -
  5,625,514 bytes - SHA-256 `F2D782561AD92527FA496638189EC1CA40524C7504E0449B380C7115A8443FB7`.
- MSI `packages/shell/src-tauri/target/release/bundle/msi/Midnight Tavern_0.2.8_x64_en-US.msi` -
  9,269,248 bytes - SHA-256 `ACEE3C638CFE3C488F77CA6D78195547A40BE69C42FA5FCB9DB11EDF38590402`.
- App EXE `packages/shell/src-tauri/target/release/midnight-tavern.exe` - 22,799,360 bytes -
  SHA-256 `1FCE44034D661BEA2430B404016FD551881318863584EDA41951433694FA4C61`.

All report `NotSigned`. The user's installed story was deliberately not repaired in place. Packaged
acceptance is to install this build, rewind the latest exchange, and replay it; legacy alias shells
restored by the checkpoint may remain historical/absent, but must not return to the Present strip.
The same read-only audit also found empty character soft-memory fields and `world_soft = null` after
the analyzer completed; this is recorded as a separate acceptance signal, not silently claimed fixed
by the actor/authority changes.

---

## 2026-08-02 - Task 15G diagnosis: NPC scene authority is fragmented

**Read-only live-state reconstruction.** The installed `Cyraeth Adventure` database and native log
were inspected without modifying the save. The exchange after failed reassurance applied two
separate Daen Unarmed Strike rulings to the player. The first was a deterministic reaction because
`Reassure Survivor` is opposed; the second was proposed on the next player message, `Describe what
you now`, even though the classifier found no player mechanic. That second operation removed another
10 Health and set the action's exposure flag on Daen. Its narrator stage timed out at the 60-second
boundary after producing prose that did not depict a fresh strike, then the authority fallback
appended `Daen's Unarmed Strike succeeds. A solid blow lands against the target.` to the story.

The same active prose clearly contained the archer's revealed name `Kellan`, the older woman, and her
dog, but the current roster had only the player and Daen present. Existing absent older-woman/dog
rows cannot be reactivated by deterministic discovery because known names are skipped unless a
generic identity is enriched. `The archer - Kellan -` is outside the current reveal grammar, and an
intervening adverb prevents the proper-name actor-verb matcher. Generic capability inference also
uses keywords from the whole narrator response, so unrelated emergent actors can receive the same
skills. No installed state was repaired; the human will rewind and replay later.

**System cause.** `runTurnOperation` is a 676-line coordinator with 39 cyclomatic / 103 cognitive
complexity. Model registrar, deterministic prose extraction, classifier, opposed-action reaction,
NPC planner, narrator, analyzer, and suggestion fallback independently reinterpret raw text without
one shared identity/presence/event model. Local tests encode those local contracts: any opposed
contest may provoke damage, safe fallback prose must include actor/action/outcome, and lexical
suggestion grounding accepts arbitrary surviving words. Each subsystem can therefore pass while the
story, registry, ruling, and prose disagree.

**Architecture decision and plan.** Task 15G is opened with the dependency-ordered plan at
`docs/superpowers/plans/2026-08-02-npc-scene-system-redesign.md`. The target introduces one typed,
timeline/variant-safe Scene State; evidence-backed actor observations and alias reconciliation; a
pre-narration Narrative Beat Plan for organic NPC creation; actor-local sealed capabilities;
current-event-driven NPC intent with explicit hostile/supportive/neutral semantics; exact causal
ruling coverage; fallback status outside story prose; and affordance-backed Possible Moves. The
first implementation slice is an end-to-end Cyraeth RED fixture across retry/restart/swipe/rewind,
not another production regex edit. No gameplay source or installer was changed in this diagnosis.

**Verification.** Fresh post-documentation root typecheck passed. Complete suites passed: core **632
tests / 45 files** plus UI **160 tests / 25 files**, **792 tests total**. `git diff --check` passed.
No native or package gate was run because this batch changes documentation only.

**Next:** implement Task 15G Task 1 only: add the provider-scripted lifecycle fixture, observe each
intended RED failure, and record it before touching the Scene State production implementation.

---

## 2026-08-02 — Decision: adopt Audit Plan 13, mark Task 15G's Scene State redesign obsolete

A separate, independently-authored product audit (`Audit/2026-08-02-PRODUCT-AUDIT/`, 13 files,
grounded at the same `3566c25` HEAD as Task 15G's diagnosis) was reviewed alongside the just-opened
Task 15G plan. Both target the same root defect in `npcAgency.ts` — `isProvocation` treats every
opposed check as an attack, and `chooseCounterAction` picks the first catalog match regardless of
relationship — but propose incompatible fixes at incompatible scope. Task 15G's fix requires a
10-task Scene State rearchitecture (new persistence domain, alias tables, a migration, a
reconciler, a pre-narration Narrative Beat Plan, event-driven agency, then a `turn.ts`
decomposition) as a prerequisite. The audit's `13-implementation-plan-final.md` fixes the same
defect directly against existing data — deriving a hostile/wary/neutral/friendly disposition from
the already-persisted `NPC_HOSTILE_TO_PLAYER_FLAG` plus relationship trust — in one ~2-day phase,
fully spec'd with RED tests already written.

**Decision: Plan 13 is adopted; the Task 15G Scene State redesign is obsolete.** Reasoning:

1. **Broader product coverage per unit effort.** Plan 13 also fixes what the audit ranks as the
   single most damaging gap in the product — up to 200 recorded character observations per story,
   displayed in the dossier, never once placed in the narrator's prompt (`buildMemoryBlock`'s
   `softSlices` is computed and then silently dropped by `assembleContext`). Task 15G's plan does
   not touch memory injection at all; it is scoped entirely to NPC scene/actor identity.
2. **This is the seventh consecutive narrow-then-wider patch round for the same problem class**
   (Tasks 15A, 15B.1-15B.6, 15C, 15D, 15E, 15F, 15G all address NPC identity/prose-parsing
   variants of one issue). Betting the next multi-week block on an eighth, much larger attempt was
   judged worse for the product than shipping Plan 13's broader, cheaper, already-specified value
   first — DM disposition, memory wiring, UI visibility (loot effects, Journal filters), suggestion
   grounding, and stage-outcome observability, each independently shippable and dependency-ordered.
3. **Lower execution risk.** Plan 13 is ready to run now (exact files, line numbers, RED tests,
   acceptance criteria per step). Task 15G's own "Next" action was still only Task 1 — a fixture,
   no production code — after a full diagnosis pass.

**What is not lost.** Task 15G's diagnosis (the exact Cyraeth failure chain, the
`runTurnOperation` complexity-103 root cause) remains accurate and is preserved as reference
material at the top of its plan file and in `docs/HANDOFF.md`. If the disposition/UI/suggestions
fixes in Plan 13 prove insufficient for the specific actor-identity failures logged there (Kellan
not recognized, older-woman/dog not reactivating, phantom pronoun rows), a **scoped-down** version
of just the Scene Reconciler idea (not the full 10-task chain) may be revisited then.

**Action taken this session:** marked the plan file obsolete with a header notice, rewrote
`docs/HANDOFF.md`'s active-plan pointer and non-negotiable-rules framing to match, and added a
"plan superseded" note above the Task 15G invariants in `CONTEXT.md` (invariant 8 is being fixed by
Plan 13 Phase 2; invariants 6, 7, 9, 10 have no replacement scheduled and remain honest
unsatisfied-property statements, not active work). Beginning Plan 13 execution at Phase 0 next, in
this same session.

**Verification before this decision:** fresh `npm run typecheck` and `npm test` confirmed the
baseline is genuinely green — core **632 / 45 files**, UI **160 / 25 files**, **792 total** — before
any source was touched, per `AGENTS.md`'s start-here checklist.

---

## 2026-08-02 — Execute Plan 13 Phases 0–2 (truth & safety, memory reaches the model, disposition)

Following the decision above, implemented `Audit/2026-08-02-PRODUCT-AUDIT/13-implementation-plan-final.md`
Phases 0 through 2 test-first, verifying each step's premise against source before writing its RED
test (the plan itself was wrong about two of its own steps — see below, in the same spirit as the
plan's own corrections to Plan 11).

**Phase 0 — truth & safety.**
- 0.1: `README.md:250` and `Plan/next-phase-internal-beta.md:6` corrected from the stale 393/579
  test counts to the measured 792 (632/160), preserving the old line as an explicit historical
  marker.
- 0.2: Appended the Journal-filter-chip and `StageMetric` "fallback" gaps to `CONTEXT.md` as
  known, scheduled defects.
- 0.3: Deleted dead `submitTurnLegacy` (`turn.ts:399`, verified zero other references first), lifted
  its 8-phase comment verbatim above `runTurnOperation`. `turn.ts` ~150 lines shorter.

**Phase 1 — memory reaches the model.** Two of six steps needed correction against source first:
- **1.2 was stale.** The plan claimed `assembleContext` never uses `buildMemoryBlock`'s
  `softSlices`; `context.ts:546` has pushed it since the file's creation (`1db8216`, 2026-07-18).
  The real, narrower gap: `condenseSoftSlice` (`injector.ts`) never rendered `soft.observations` —
  the capped-200 FIFO narrative log the audit actually means by "up to 200 observations." Fixed by
  surfacing the 3 most recent observations, newest first, in the character-notes line.
- 1.1: `condenseSoftSlice`/`buildMemoryBlock` gained a `nameOf` resolver; `context.ts`'s `nameFor`
  widened from the present-only set to the full registry (present wins on conflict), so a
  relationship pointing at an absent character renders a name, not a raw id.
- 1.3: World soft state (`overview`, `unresolvedThreads`) now reaches the prompt via a new
  `WORLD STATE:` block — previously computed nowhere near `assembleContext` at all (this one's
  premise held up).
- 1.4: Relationship trust/power now accumulate with an asymptotic attenuation near ±1
  (`asymptoticDelta`) instead of linear-then-clamp, so repeated large deltas approach the boundary
  instead of pinning to it in one step.
- 1.5: `StoryThreadSchema.id` is now a Zod-transformed field (optional in, backfilled via
  `crypto.randomUUID()` in output) — no migration, since threads live in `world_soft.soft_json` as
  JSON. This exposed a real gap in the shared `codec.ts` JSON helper: its `encodeJson`/`decodeJson`
  generics assumed schema input and output were always identical, which broke once a schema had an
  asymmetric transform. Fixed `codec.ts` to use Zod's actual 3-param `ZodType<Output, Def, Input>`
  shape; no call site needed an explicit type param afterward.
- 1.6: Removed all three `statMode === "full"` gates around the analyzer (`context.ts`'s
  `buildMemoryBlock` call, `turn.ts`'s `runBackground`, `history.ts`'s swipe `runAnalyzer`) — No-Stats
  stories now accumulate soft memory too. Updated the existing "No Stats calls only the narrator"
  test's `router.calls` expectation to include `"analyzer"`, since that's now correct behavior, not a
  regression.

**Phase 2 — DM behaves in character.** Closes Task 15G's D-1/D-2 defects directly, the reason 15G
was marked obsolete:
- Replaced `isProvocation` with `isHostileAct` (combat/target-harm/committed-harm/`danger` stakes
  only) and `isOpposedContest` (`opposed && !dealsTargetHarm`) — a losing contest of nerve no longer
  reads as violence, per `CONTEXT.md` invariant 8.
- Added `deriveDisposition(npc, npcSoft, towardId): "hostile" | "wary" | "neutral" | "friendly"` —
  the validated `NPC_HOSTILE_TO_PLAYER_FLAG` always wins; otherwise derived from the analyzer's
  relationship trust (`WARY_TRUST_THRESHOLD = -0.4`, `FRIENDLY_TRUST_THRESHOLD = 0.4`).
- Rewrote `chooseCounterAction` to select by disposition-gated preference tiers (harmful /
  non-harmful-opposed / social) instead of first-catalog-match, with a `wasHarmed` fallback for
  wary/neutral/friendly so a genuinely wounded NPC can still defend itself. (One deliberate
  divergence from the plan's exact table: friendly also falls back to the harmful tier if actually
  harmed and no peaceful option exists — the plan's version left a friendly NPC permanently
  defenseless even under real, repeated damage, which felt like an oversight rather than an
  intentional design choice.)
- Threaded an optional `softById` map through `NpcReactionContext`/`planNpcReactions`, populated
  from `turn.ts`'s already-fetched `presentRoster`.
- `planHostileNpcFallback` passes `"hostile"`/`wasHarmed: true` explicitly — it already gates on the
  validated flag before calling `chooseCounterAction`.

**Verification.** Full suite green throughout, after every single step, no exceptions: final state
core **651 / 45 files**, UI **160 / 25 files**, **811 total** — matching Plan 13's own ledger
("After Phase 2: 811") exactly. `npm run typecheck` clean at every step. Nothing committed yet.

**Next:** Plan 13 Phase 3 (UI visibility — loot-effect typing, Journal filter fix, ruling
presentation), then Phase 4 (immutability proof), Phase 5 (suggestions), Phase 6 (observability), in
that order per the plan's dependency graph.

## 2026-08-05 — Execute Plan 13 Phases 3–6.1 (visibility, immutability, suggestions, observability) — Plan 13 complete

Continuation of the 2026-08-02 session, working every remaining phase in order with the same
TDD discipline (RED test observed failing, then implementation, then GREEN, full suite + typecheck
after every step).

**Phase 3 — make mechanics visible in the UI.** `Ruling.loot[].effects` retyped from
`z.array(z.unknown())` to a real `EquipmentEffectSchema` array; added `formatEquipmentEffect` in
`engine/equipment.ts` (exhaustive switch over the discriminated union) and re-exported it into
`bridge/core.ts` via a deep import straight at `engine/equipment.js` (not the barrel), so the
webview bundle never pulls in `better-sqlite3`. `Play.tsx`'s denied-branch check moved from
regex-matching a reason string to `gate.code === "action_budget_exceeded"`. `classifier_recovery`
events now categorize as a new `"interrupted"` Journal kind instead of `"denied"` — an infrastructure
hiccup is not a world refusal. Added the `"boundary"` filter chip that had been silently missing.
Journal's dice rendering and loot/effects rows now use `formatEquipmentEffect`/readable numbers
instead of `JSON.stringify`. Header's chapter label now reads `listChapters(storyId).length` instead
of estimating from `messageCount / 20`.

**Phase 4 — prove rewind immutability, don't just assert it.** Added `"turn_rewound"` as a
`StoryEventKindSchema` member and a `journalTruncation(...)` helper called last inside
`deleteLastTurn`/`rewindTo`/`deleteFromExchange`, so a rewind leaves an explicit audit record instead
of silently vanishing. First inversion-check attempt (breaking `history.ts`'s `narrator.id` lookup)
did NOT make the existing characterization test fail — proof it wasn't a real tripwire, since the
test read the stored-rulings table directly and never exercised the broken lookup. Fixed by
injecting a genuine fake re-resolve call, confirmed that failed as expected, then reverted cleanly.
Two pre-existing tests' `events.listByStory(...).toHaveLength(0)` assertions after `deleteLastTurn`
were now legitimately wrong (a `turn_rewound` record survives) — updated to expect length 1.

**Phase 5 — typed scene anchors for suggestions.** Replaced narrator-text-derived
`sceneAnchors`/`UNSAFE_FALLBACK_ANCHORS` string matching with a typed `SceneAnchor`/`SceneAnchorKind`
built directly from characters/location/world state. Deleted `suggestionWords`/
`SUGGESTION_STOP_WORDS` as genuinely dead code (zero remaining call sites, verified by grep) — the
plan's claim that they were "still used elsewhere" was checked against source and found false.

**Phase 6.0 — make the "fallback" stage outcome real.** `StageMetric.outcome` had conflated a
deadline timeout and a thrown error into a single `"timeout"` value with no way to distinguish them
downstream; `turn.ts`'s classifier fallback worked around this by re-peeking `stageMetrics.at(-1)`,
which only worked by accident. Split `outcome` (`"ok"|"fallback"|"cancelled"|"error"`) from a new
`cause` (`"timeout"|"error"`) passed directly into `fallback(cause)`; wrapped the fallback call in its
own try/catch so a fallback that itself throws is honestly reported as `"error"`, not silently
counted as a successful recovery. `StageMetricSchema` gained a `.transform()` to normalize legacy
persisted `outcome: "timeout"` rows to `{outcome: "fallback", cause: "timeout"}` on read — no SQL
migration, no schema version bump.

**Phase 6.1 — local, opt-in diagnostic counters + a Diagnostics screen.** New
`packages/core/src/observability/` module: `countersForTurn(input)` is a pure fold from one turn's
already-computed outputs (gate verdicts, stage metrics, classifier/authority-guard signals) to a flat
dotted-key integer delta map — no I/O, no store import, safe on the webview path. Persistence reuses
the existing settings-table-as-typed-KV-store pattern (two new setting keys, no migration).
`sqliteBridge.ts`'s `submitTurn`/`retryTurnOperation` now tee stage metrics into a local array and
fold them into the persisted counter set after each turn completes, gated by the opt-in flag and
never throwing into the turn itself; the router's logger is wrapped to also count provider
retries/failures without a new call site in core. Added 4 `CoreBridge` methods
(`getDiagnosticsEnabled`/`setDiagnosticsEnabled`/`readDiagnosticCounters`/`clearDiagnosticCounters`)
implemented over both the real bridge and the in-memory dev bridge, plus a test-only
`__seedDiagnosticCounters` seam on the memory bridge (not on `CoreBridge` itself) for screen tests.
New `Diagnostics.tsx` screen (routed at `#diagnostics`, reachable from Settings' existing Diagnostics
section): opt-in toggle, a table of raw counters plus derived mean-stage-latency rows, JSON export
reusing Journal's Blob-download pattern, two-click reset.

**Verification.** Full suite green after every step. Final state: core **670 tests / 47 files**, UI
**183 tests / 27 files**, **853 total**. `npm run typecheck` clean in both workspaces throughout.
Acceptance greps confirmed: `db.ts` has no diff (no migration), zero `"version: 17"` hits, `gate.ts`'s
`checkGate` signature unchanged, zero `fetch`/`http` references in `Diagnostics.tsx` or
`observability/`, `countersForTurn`'s file has zero real `store` references (only a comment
mentioning it), exported diagnostics JSON contains only `exportedAt` + integer counters. Committed as
two phase-scoped commits (Phase 6.0 had been implemented but not yet committed at the end of the
2026-08-02 session): `50cd0c2` (Phase 6.0) and `9288a5a` (Phase 6.1), both pushed to `main`.

**Plan 13 is now complete in its entirety.** The "Deferred queue" listed in the plan document
(Plans 21/19/20/18/23/10B) remains explicitly out of scope — it was never part of "the rest of the
phases."

---

## 2026-08-12 — Verify Plan 13 completion against source; make the plan document self-describing

No behaviour change. This session opened with the start-here checklist and the owner's question:
*have we actually completed everything in Plan 13?* The honest answer required checking, because
**the plan document contained zero checkboxes** — `grep "\[ \]"` and `grep "\[x\]"` both returned
nothing — so the only record of completion lived in this worklog and HANDOFF, i.e. in the claims of
the sessions that did the work rather than in the tree.

**Baseline re-verified on a clean tree at `ba49114`:** `npm run typecheck` clean in both workspaces;
`npm test` green at **853** — core **670 / 46 files**, UI **183 / 26 files**.

**All 22 steps confirmed present in source**, individually, not inferred: 0.1–0.3 (README clean,
`CONTEXT.md` defect section present, `submitTurnLegacy` gone); 1.1–1.6 (`condenseSoftSlice` name map,
observations at `injector.ts:60`, `WORLD STATE:` at `context.ts:558`, `asymptoticDelta`, the Zod
thread-id transform, and all three analyzer `statMode` gates removed — the four remaining
`statMode === "full"` hits gate runtime items, ruling facts, NPC introduction and narrated-entity
promotion, none of which are the analyzer); 2.1 (`isHostileAct` / `isOpposedContest` /
`deriveDisposition` present, `isProvocation` gone); 3.1–3.8 (`formatEquipmentEffect` plus its
browser-safe deep re-export, the `gate.code` branch, the `npc` and `classifier-unavailable` variants,
opposed dice, the `boundary` and `interrupted` chips, `listChapters` in `App.tsx`); 4.1
(`turn_rewound` in schema, history and journal); 5.1 (typed `SceneAnchorKind`, with
`UNSAFE_FALLBACK_ANCHORS` / `suggestionWords` / `SUGGESTION_STOP_WORDS` all at zero hits); 6.0–6.1
(`outcome`/`cause` split, `observability/`, `Diagnostics.tsx`, zero migration-17 refs, zero network
calls, zero `store.` refs in `counters.ts`).

**Three discrepancies found, all documentation-side; none is a code defect.**

1. **Step 0.3's acceptance was self-contradicting.** It demanded `grep -rn "submitTurnLegacy"
   packages/` return zero hits *and*, three lines later, that the eight-phase comment survive — but
   that comment names the retired function (`turn.ts:396`). Amended in place to test for a
   definition, call or export instead; verified returning zero. The only other hit is in
   `packages/core/dist/`, a gitignored build artifact.
2. **Step 3.8's acceptance was superseded by a later step in the same plan.** It demanded zero
   `JSON.stringify` under `packages/ui/src/screens/`; Step 6.1 deliberately adds one at
   `Diagnostics.tsx:56` for the diagnostics export — a file download, not the player-facing JSON leak
   the criterion exists to catch. Amended to exclude that file; verified returning zero.
3. **Phase 3 landed 833 tests against a projected 835** (core 655 / UI 178 vs core 658 / UI 177).
   Every Phase 3 step's change is present in source, so this is where the tests landed, not whether
   the behaviour is covered — which the plan itself anticipated ("treat the split as the check, not
   the exact total"). The final 853 clears every ledger checkpoint.

**Landed (`d8dc46f`, docs only, +95/−2 in one file).** `13-implementation-plan-final.md` now opens
with a `Status: ✅ COMPLETE` header (completion dates, verifying commit, final counts, method, and
the ledger note), a 22-item completion checklist, and the six deferred plans as **open** checkboxes
so remaining scope is visible without reading to line 3673. Both stale criteria are struck through
and amended in place rather than deleted, per the audit's own auditability convention.

**Two smaller corrections for the next agent.** `AGENTS.md:21`'s stale pointer to
`Plan/next-phase-internal-beta.md` was already fixed in `ba49114` — no action needed, contrary to
what a stale briefing may say. And HANDOFF was quoting **47/27 test files**; the real numbers are
**46/26**. Test counts (670/183) always matched, so nothing was ever lost — it was a miscount, now
corrected in HANDOFF.

**Gotcha worth carrying forward.** `docs/WORKLOG.md`'s own header says *"Newest first"* while the
protocol in `AGENTS.md` says *append* — so entries are in fact oldest-first and the newest is at the
bottom. Reading the top of this file gives you 2026-08-01, not current state. Left as-is rather than
renumbering history; just know which end to read.

**No active plan.** The deferred queue (Plans 21/19/20/18/23/10B) is open and unscheduled; the
choice is the owner's and has not been made.

---

## 2026-08-12 — Ship v0.2.9: the first installer that actually contains Plan 13

Same session as the verification entry above. Building was not on anyone's list; it surfaced from
checking the premise behind "which plan next?".

**The finding.** Every installer on disk was **v0.2.8, built 2026-08-02 03:44**. The earliest Plan 13
code commit is **`e990cb6`, 2026-08-05 14:33**. So no packaged build had ever contained a single line
of Plan 13 — not the memory wiring, not the disposition fix, not the UI visibility work, not typed
suggestions, not diagnostics. All of it existed only in source. The old Task 15G rule ("do not build
intermediate installers; build once after all slices are complete") had been satisfied when Plan 13
closed on 2026-08-05, and nobody acted on it.

**Why this mattered more than picking a plan.** The deferred queue's biggest item, Plan 19 (XL,
1–3 months), is justified almost entirely by NPC misbehaviour the owner observed *in v0.2.8* — a
build that predates Phase 2's disposition fix aimed squarely at that behaviour. Committing months to
Plan 19 before testing the fix would have been deciding blind.

**Landed (`fe9d014`).** Version bumped 0.2.8 → 0.2.9 across all five files that carry it
(`tauri.conf.json`, `Cargo.toml`, shell `package.json`, `package-lock.json`, `Cargo.lock`), and MSI +
NSIS bundles built. No source logic changed.

**Verification.** `cargo check` clean (note: PowerShell 5.1 wraps cargo's stderr progress into a
`NativeCommandError` even on success — read the exit code, not the stream). Core `tsc` and UI `vite
build` both clean. Suite green at **853** (core 670/46, UI 183/26) before and after the bump. The
built UI bundle contains a `counters-*.js` chunk — Phase 6.1 code that does not exist in 0.2.8 —
which is positive confirmation the installer carries the work rather than just a new version string.

**One thing checked and cleared.** The UI build emits a 237 kB `counters-*.js` chunk, which looked
like Phase 6.1 having dragged something heavy onto the webview path. It has not:
`observability/counters.ts` imports only `zod` plus two **type-only** imports, so Vite simply named
the shared zod vendor chunk after it. The webview constraint still holds.

**Testing notes for the owner.** Plan 13 added **no migration** (ladder still tops at 16, with 17
reserved for Plan 19), so 0.2.9 and 0.2.8 read the same database — the existing *Cyraeth Adventure*
save opens in either and rolling back does not damage it. Testing on that save is more informative
than a fresh story, since it already carries the NPC history that produced the original failure.
Diagnostics ships **opt-in** (`getDiagnosticsEnabled` defaults to `false`) and must be turned on in
Settings before it records anything.

**Still not pushed.** Four local commits ahead of origin (`d8dc46f`, `cd89bec`, `fe9d014`, and this
entry's docs commit). The human has not asked.

---

## 2026-08-13 - v0.2.9 play-test triage: plan decommission + new plan set

**Owner evidence.** The owner play-tested the packaged v0.2.9 build (the first installer ever to
contain Plan 13) and returned 31 numbered findings with screenshots. Two instructions reframed the
project: every pre-2026-08-12 plan is decommissioned, and the owner wants a detailed, implementable
plan set produced and approved BEFORE any development starts.

**Plan decommission (`b19d4b8`).** Added `docs/PLAN-POLICY.md` as the authoritative rule: plans
written before 2026-08-12 are retired, and anything in `Plan/`, `Audit/`, or
`docs/superpowers/plans/` not already shipped is cancelled rather than deferred - explicitly
including Audit Plan 13's deferred queue (Plans 21/19/20/18/23/10B). Banners were added to all 17
retired documents, `AGENTS.md` got an unmissable header, and `ARCHITECTURE.md`'s stale claims that
`Plan/` holds the authoritative behavioural specification were retargeted to code + tests. A first
banner pass was reverted and redone byte-exactly after it added a UTF-8 BOM and rewrote line
endings, turning 5-line additions into 900-line diffs.

**Live-save diagnosis (read-only, on a copy).** Established as fact:

- The NPC "unprovoked punch" is **two** defects. Turn 12 carried `stakes=opposed`, the exact clause
  Plan 13 Phase 2 removed - fixed. Turn 14 had **no player ruling at all**, so the deterministic
  reaction path could not have fired; that attack came from `classified.npcIntents`, which
  `orchestrator/turn.ts:666` merges into the resolve loop with no disposition, hostility or trigger
  check. That is the live violation of `CONTEXT.md` invariant 9, now recorded there. It is closable
  cheaply in plan 02 and does **not** need the cancelled Plan 19.
- Owner finding 17 is **not a bug**. Every player ruling was checked against the actor's learned
  skills: `utility_command_shadow` (needs the epic `shadow_extraction`) was correctly DENIED with
  `skill_required`; `combat_basic_strike` passed because a Dagger is equipped in `secondary`. Only
  the engine-owned `universal_natural_attack` is ungated, which the owner confirmed is acceptable.
- Owner finding 19 (P0 misclassification) cannot be fixed by a confidence threshold - the reported
  case carried `confidence: 1`.
- Generic NPCs carry `attributes: {}` (`bootstrap/instantiate.ts:109`) and a constant
  `GENERIC_ENCOUNTER_HITS = 6`, which is why every NPC shows all-10 attributes and 24/24 health.
- "And Daen" is a real registry row created by a sentence-initial conjunction being absorbed into a
  proper name; `shadow_entity` carries a raw snake_case id and display name from a different path.

**Testing unlock (no source change, as requested).** The owner's trial expired 2026-08-05 yet play
continued. A scratchpad script writes a cached-valid `licenseCache` row plus a reset `trialStartedAt`
into the app's own settings table; `evaluateLicense()` reads cache only and never the network, so it
is stable. It backs up the database first and supports `--revert`. This is local test tooling and is
deliberately not part of the product.

**Plan set (`4fd1af7`, `9630b86`, this commit).** `docs/plans/2026-08-13-00-MASTER-INDEX.md` maps all
31 findings to 13 workstream plans in three waves, with cross-cutting rules and seven owner
decisions. Written so far: 01 entitlement lockdown, 02 classifier fidelity (the P0), 03 entity
registry integrity, 07 live UI reactivity, plus a self-contained design brief for the owner to hand
to Claude. Still to write: 04, 05, 06, 08, 09, 10, 11, 12.

**Verification.** Typecheck clean in both workspaces; core 670/46 and UI 183/26 = 853 passing when
run per-workspace. Root `npm test` fails on a tinypool worker crash *after* all UI tests pass - a
known Windows/Node 24 issue that core pins `maxWorkers: 1` for and the UI config does not; fix is
task P0-0 in plan 07. Bridge parity verified mechanically at 85/85 methods. No source was touched
this session, so the suite is unchanged.

**Next:** finish plans 04, 05, 06, 08, 09, 10, 11, 12, then wait for owner authorization. No
implementation until the owner approves and returns with design decisions.

---

## 2026-08-13 - Complete the play-test remediation plan set (all 12 plans + design brief)

**Owner instruction.** Write every remaining plan in one pass, then regenerate the design brief last
so it captures anything the plans surfaced. Review comes before any development.

**What landed.** Plans 04, 05, 06, 08, 09, 10, 11 and 12 were written, joining 00/01/02/03/07 from
earlier in the day, and the design brief was rewritten. All 31 owner findings now have an
implementable plan with evidence, file:line root causes, RED-tests-first steps, acceptance criteria,
risks, and an authority-wall note.

**Four findings were verified NOT to be bugs**, which materially changes the work:

- **17 (natural attack ungated).** Every player ruling in the live save was checked against the
  actor's learned skills. `utility_command_shadow`, which requires the epic `shadow_extraction`, was
  correctly DENIED with `skill_required`; `combat_basic_strike` passed only because a Dagger is
  equipped in `secondary`. Only the engine-owned universal natural attack is ungated, which the owner
  confirmed is acceptable. Residual issue is presentational: it is labelled like a learned skill.
- **16, half of it.** `turn.ts:673` already filters the repetition window on `targetId`, so attacking
  a different character already resets it. The real defects are the curve - `repetitionMultipliers`
  is `[1, 0.5, 0.25, 0]`, so a fourth consecutive use earns literally zero XP - and a window that
  takes the last five rulings globally rather than per-actor, so an NPC reaction consumes the
  player's slots.
- **12 (a DM one-liner appended to every prose).** That text is the deterministic recap that
  REPLACES prose when the authority audit fails, not an appendix. Removing it would leave failed
  turns with no prose at all. The real fix is to stop the audit failing and to stop rendering the
  recap in the STORY register, where it currently wears serif and reads as bad writing.
- **26 (Overview lacks arc/chapter concepts).** `ArcRecord` and `ChapterRecord` both exist with
  bridge methods. It is a layout and hierarchy problem: the primary document currently switches
  depending on what exists, which is what reads as "all over the place".

**Two confirmations of the owner's own narration plan**, checked directly in source:
`authorityGuard.ts:122` passes `maxRepairs: 0` to the audit call, so one formatting slip suppresses
the whole narration; and `authorityGuard.ts:125` returns `ok: result.contradictions.length === 0`,
ignoring the parsed `obeysRulings` - so `{"obeysRulings": false, "contradictions": []}` is currently
accepted as approval. That is an authority-integrity defect, not merely a reliability one. Plan 06
adopts the owner's plan wholesale and adds prose-degeneration handling, the recap register fix, and
the notice copy.

**Cross-plan dependency worth carrying forward:** plans 02 and 09 are two halves of one defect. 02
makes the engine honest about poor action fits; 09 makes poor fits rare by growing the catalogue from
~20-30 actions to 60-90. Shipping 02 alone will make the game feel more inert, because honest
declining exposes how little the rulebook covers. The owner must be warned when 02 lands.

**Design brief** was trimmed once on owner instruction - it had accumulated items needing no designer
- and then revised after the plans were written. The revision surfaced one genuinely new item:
rendering the fallback recap in the SYSTEM register rather than the STORY register, which is the
actual fix for the "every prose ends with a DM one-liner" complaint.

**Verification.** Documentation only; no source touched, so the suite is unchanged from the measured
baseline (typecheck clean; core 670/46 and UI 183/26 = 853 passing per-workspace; root `npm test`
still fails on the known tinypool worker crash, fixed by plan 07 task P0-0).

**Next:** owner reviews the plan set. Six decisions remain open (D1, D3-D7); D7 - new stories only
versus migrating existing saves - is the largest cost driver. No implementation until the owner
authorizes a wave.
