# HANDOFF — current live state

**Updated:** 2026-07-29
**Branch / runtime HEAD:** `main` at `2b43325` (Task 9a) before this docs commit; local, not pushed
**App version:** `0.2.8`, unsigned
**User-owned/untracked:** `.codex/`, `opencode.json` — preserve
**Active plan:** `Plan/next-phase-internal-beta.md`
**Detailed plan:** `docs/superpowers/plans/2026-07-29-internal-beta-completion.md`

## Fresh verification

- `npm run typecheck`: passed.
- `npm test`: core 512/41 files + UI 139/25 files = **651 tests**, passed (Tasks 5–9a added 20).
- Known noise: seven existing React `act(...)` warnings.
- Build/cargo/installer were intentionally not rerun after `350f805`; the human asked to defer the
  installer until all remaining Internal Beta work is complete.

## This session (Tasks 5–9a): what was done and what was deferred

All landed test-first, each its own commit; full suite green after each. Per-commit detail is in
`WORKLOG.md`; the plan checkboxes are ticked with completion notes. Concise did/deferred per task:

**Task 5 — goal-driven bounded NPC planning (`04e83b7`).**
- DID: `npcAgency.ts::planNpcActions` — one bounded classifier request proposes NPC goals (aid,
  converse, flee, surrender, exploit) for present idle NPCs; deterministic validation (present
  candidate, sealed action/item/skill, present target, actor gate); own per-NPC budget; fail-closed
  to `[]` on malformed/timeout. Wired in `turn.ts` after deterministic reactions; loot/advancement
  scoped to the player-ruling prefix so an NPC action can't steal the reward anchor.
- DEFERRED: no deterministic flee/surrender *policy* (fixture catalog has none, so those goals flow
  through the validated model path); the planner fires a model call on EVERY full-stat turn with an
  idle present NPC — bounded by a deadline in 9a but NOT yet gated to "encounter active" (cost).

**Task 6 — deterministic provocation beyond combat (`b753de3`).**
- DID: `isProvocation(action, ruling, stakes)` — provokes on combat category, an opposed contest,
  a sealed/committed target-harm effect, or classifier stakes danger/opposed; `turn.ts` threads
  `intent.stakes` via `stakesByTurnId`. Healing/aid and harmless non-opposed dialogue never provoke.
- DEFERRED: `opposed` alone counts as provocation (a hypothetical non-hostile opposed action would
  provoke); no dedicated "hostile" action flag was added (used existing sealed fields only).

**Task 7 — prove end-to-end verified streaming (`fccab2c`).**
- DID: proof only — 3 temporal tests (core `authorityGuard`, `sqliteBridge`, `Play`) each gate the
  provider promise and assert the first safe paragraph is delivered/rendered while it is still
  pending. Confirmed `onDelta` is threaded provider → core → bridge → `playStore` (`proseBuffer`) →
  `Play` (`data-testid="play-prose-buffer"`).
- DEFERRED: nothing — NO source change was needed (no boundary buffered).

**Task 8 — release verified mechanical beats incrementally (`09da205`).**
- DID: on authority-audit accept, `generateGuardedNarration` releases the mechanical remainder
  beat-by-beat (`splitBeats`) with a PER-BEAT deterministic death guard; a fabricated-death beat is
  replaced by `safeSummary` while earlier verified beats survive (old whole-draft guard discarded
  all). Model whole-draft audit retained for non-death fabrications.
- DEFERRED: no per-beat *model* re-audit (kept deterministic per-beat to avoid N model calls); the
  model whole-draft audit stays the model-level authority.

**Task 9a — stage deadline primitive + NPC-planner bound (`2b43325`).**
- DID: `orchestrator/stagePolicy.ts::runStage` — deadline race → deterministic fallback on
  timeout/error (never blocks the turn), genuine caller cancel propagates, `StageMetric` via injected
  callback, injectable clock/timer (6 deterministic unit tests). Applied to the `npc_planner` stage in
  `turn.ts`; `SubmitTurnOptions.onStageMetric` plumbed; exported from the orchestrator barrel.
- DEFERRED (= Task 9b, see the plan + Single next action): the `classifier`, `npc_introduction`,
  `narrator`, and `authority_audit` stages are NOT yet wrapped; `StageMetric[]` is NOT persisted (no
  `turn_operations` migration / bridge parity yet); no fake-clock timeout/duplicate-turn test at the
  `turn.ts` level (only the `stagePolicy` unit level); planner still not gated to "encounter active".

**Session baseline delta:** 631 → **651 tests** (core 494→512, UI 137→139); typecheck clean
throughout. HEAD `2b43325` (+ this docs commit). Local, not pushed — say the word to push. No
installer built (correct; the human deferred it until all Internal Beta tasks pass).

## Non-negotiable authority rules

- Engine/DM owns gates, dice, effects, damage, death, budgets, loot, progression, and persistence.
- Models may propose identity/intent and write prose but may not mutate or contradict hard state.
- Every actual NPC/creature appearing in fiction must be in the character registry; ambient scenery,
  murals, statues, background crowds, “Nothing,” and “Something” are not characters.
- Registry membership and scene presence are separate. Only present, living actors participate.
- Rulings render before narrator streaming. Narrator prose may dramatize but must not quote internal
  dice/DC boilerplate or assert death without an authoritative `causedDeathOf`.

## What `350f805` changed

1. Added `orchestrator/npcIntroduction.ts`: one bounded structured classifier request proposes
   introduce/enter/leave; deterministic code validates grounding, template, name, duplicates, and
   ambient negatives.
2. Stages approved roster changes before the normal classifier and narrator context, then persists
   them atomically with the completed turn. Provider/narrator failure leaves no new row.
3. Removed post-narration character creation. The prior heuristic is only a bounded
   pre-classification catch-up for creatures already present in historical narration.
4. Normalizes every player intent to the sole present player. A reversed NPC-as-actor/player-as-target
   response is swapped back, preventing attacks on a current undocumented creature from being
   attributed to an older NPC such as `Dead man`.
5. Two strikes remain legal when the story action budget is two; skill gates still apply to the
   actual player and sealed action.
6. Universal actions config v2 applies `-4` success / `-8` critical-success damage to the target
   lethal resource when a melee/ranged action omitted damage. Existing explicit damage wins.
   Runtime schema normalization upgrades old persisted full-stat stories in memory.
7. Death is authoritative when a lethal resource reaches zero (resources clamp at zero). The
   authority guard rejects kill/death prose when no ruling reports `causedDeathOf`.
8. Narrator prompts treat ruling facts as private constraints, and safe fallback prose no longer
   repeats “resolves as success (total vs DC...)”.
9. Denied ruling cards include the actor name, making classifier/actor mistakes visible.

## Important live diagnosis

The tested Solo Leveling database proved Jinwoo already knew Basic Strike. The bad two-strike turn
was denied because the classifier returned `Dead man` as the player-intent actor and Jinwoo as its
target; `Dead man` was an older creature, while the current attacked creature had never entered the
registry. The new registrar + actor normalization address that chain. The prior Weapon Strike schema
had no health delta, so a successful strike could never kill mechanically; config v2 repairs that.

## Remaining ordered work

1. Task 5: bounded goal-driven NPC planning — **DONE (`04e83b7`)**. `planNpcActions` proposes via one
   bounded classifier request; deterministic validation (present candidate, sealed action/item/skill,
   present target, actor gate) + separate NPC budget; fail-closed to no action on malformed/timeout.
   Watch-out: fires a model call every full-stat turn with an idle present NPC — Task 9 should bound it.
2. Task 6: sealed non-combat provocation — **DONE (`b753de3`)**. `isProvocation` reacts to combat /
   opposed / target-harm / hostile-stakes; healing/aid and harmless talk draw no reaction.
3. Task 7: end-to-end verified streaming — **DONE (`fccab2c`)**, proof-only, no source changed;
   `onDelta` already threaded provider → core → bridge → store → Play.
4. Task 8: progressively verify and release mechanical beats — **DONE (`09da205`)**; per-beat
   deterministic release + death guard, whole-draft model audit retained.
5. Task 9a: stage deadline primitive (`stagePolicy.ts`) + NPC-planner bound — **DONE (`2b43325`)**.
   Task 9b (remaining): wrap classifier/introduction/narrator/audit stages + persist metrics
   (migration). Task 10: responsive model defaults.
6. Tasks 11–13: resumable Forge, card/persona/starting-gear acceptance, and remaining UX acceptance.
7. Task 14: eliminate seven React warnings.
8. Task 15: full Internal Beta gate, packaged manual acceptance, then create the final installer.
9. Task 16 signing/updater/CSP remains later/out of scope.

## Single next action

Continue **Task 9b** (9a landed in `2b43325`; `runStage`/`stagePolicy.ts` exists). Wrap the remaining
turn stages in `turn.ts` with `runStage` + `DEFAULT_STAGE_DEADLINES` and deterministic fallbacks:
`classifier` → narration-only recovery; `npc_introduction` → no transitions; `narrator` /
`authority_audit` → `safeSummary` (these two live inside `generateGuardedNarration`, so thread a
`deadlineMs`/`onMetric` option through `GuardedNarrationOptions`). Then persist `StageMetric[]` on the
turn operation: migration `stage_metrics_json` on `turn_operations` (+ `TurnOperationSchema` field,
`toRecord`/`upsert`, and bridge parity in `ui/src/bridge/core.ts` + `sqliteBridge.ts`). Write
fake-clock timeout + duplicate-turn tests in `turn.test.ts`; confirm restart/retry/cancel. See the
plan's Task 9b checklist. Commit `core(orchestrator): bound remaining turn stages and persist latency`.

Do not build an installer yet. Generate it only after the remaining Internal Beta tasks (through Task
15) and complete verification, as requested by the human.
