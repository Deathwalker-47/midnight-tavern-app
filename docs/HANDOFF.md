# HANDOFF - current live state

**Updated:** 2026-08-02 (Plan 13 Phases 0-2 executed)
**Branch / source baseline:** local `main` @ `3566c25` + uncommitted Phase 0-2 source changes; not
pushed, not yet committed
**App version:** `0.2.8`, unsigned; no new installer was built for this diagnostic batch
**User-owned/untracked:** `.agents/`, `.codex/`, `opencode.json` - preserve
**Active plan:** `Audit/2026-08-02-PRODUCT-AUDIT/13-implementation-plan-final.md`
**Superseded/obsolete:** `docs/superpowers/plans/2026-08-02-npc-scene-system-redesign.md` (Task
15G) — do not implement; see the OBSOLETE notice at the top of that file for why. Its diagnosis
sections below remain accurate reference material.

## Why the plan changed

Task 15G's own diagnosis (below) is correct, but its proposed fix required a 10-task Scene State
rearchitecture as a prerequisite. `Audit/2026-08-02-PRODUCT-AUDIT/13-implementation-plan-final.md`
fixes the same root defect (`isProvocation`/`chooseCounterAction` in `npcAgency.ts`) directly
against existing data in its Phase 2, at a fraction of the cost, and additionally fixes a broader
and more damaging gap the audit found: character/world soft-memory observations are recorded and
displayed but never reach the narrator's prompt at all (Plan 13 Phase 1). Plan 13 is fully
spec'd, sequenced by dependency, and ready to execute; Task 15G had only a RED fixture as its next
action. See `docs/WORKLOG.md` (2026-08-02, "Adopt Plan 13...") for the full decision record.

## Historical context (Task 15G diagnosis — accurate, but the fix direction below is obsolete)

The latest packaged NPC failure was analyzed as a system-boundary problem. No gameplay source was
changed and the installed save was inspected read-only only. Do not apply another isolated regex,
planner-prompt, or UI filter patch before the Task 15G lifecycle fixture exists.

The current implementation has multiple independent authorities interpreting raw prose:

- the model registrar proposes identity/presence transitions;
- deterministic narration grammar promotes/reconciles actors;
- the classifier decides player mechanics;
- `planNpcReactions` treats provocation mechanically;
- `planNpcActions` invents current NPC intent from recent prose;
- the narrator attempts to cover rulings;
- the analyzer updates soft memory;
- suggestion fallback tokenizes the latest prose.

All can satisfy their local schema while disagreeing about who exists, who is present, what happened
this turn, and what the player can do. `runTurnOperation` currently coordinates these paths in 676
lines with cyclomatic complexity 39 and cognitive complexity 103.

## Exact packaged evidence

Installed story: `Cyraeth Adventure`, id `ab1c6258-e244-4e7d-9147-1b0d3396a2c7`.

- Database: `C:\Users\anuji\AppData\Roaming\com.midnighttavern.app\midnight-tavern.db`
- Native log: `C:\Users\anuji\AppData\Local\com.midnighttavern.app\logs\midnight-tavern.log`
- Inspect SQLite with URI `mode=ro` and `PRAGMA query_only=ON`; WAL/SHM may be active.
- The human will rewind and replay. Do not repair the current save in place.

The relevant exchange proved:

1. Failed `Reassure Survivor` triggered a Daen punch because `isProvocation` treats every opposed
   action as hostile. Reassurance is supportive even when opposed.
2. On the next player text, `Describe what you now`, player classification contained no mechanics,
   but the NPC planner repeated Daen's prior punch as a fresh Unarmed Strike because it reads recent
   prose without current trigger ids, disposition/goal state, or event consumption.
3. Each strike removed 10 Health. The latest action's `stagnation_exposure` flag landed on Daen
   because `setFlag` is actor-only even though the fiction framed exposure on the target.
4. The latest narrator call timed out at roughly 60 seconds after writing prose that did not depict a
   fresh strike. The turn still committed the ruling/damage and appended the deterministic sentence
   `Daen's Unarmed Strike succeeds. A solid blow lands against the target.`
5. Prose established the archer as `Kellan` and physically included the older woman and dog, but the
   Present strip retained only the player and Daen.
6. `The archer - Kellan -` is outside current reveal grammar; `Kellan finally lowered...` is missed
   because an adverb separates the name and actor verb. Existing absent actors are skipped by
   deterministic discovery unless they enrich a generic identity, so known older-woman/dog rows do
   not re-enter from clear current prose.
7. Possible Moves used `describe` and `slowly` as scene subjects because the deterministic fallback
   takes reversed surviving words from narration rather than typed actors/facts/affordances.
8. Emergent actor skill selection scans the whole narrator message, so unrelated actors can receive
   the same keyword-derived loadout.

Current installed character state at inspection included the player at 80/100 Health, Daen present,
and multiple other actors absent. There was no `Kellan` character row. Do not treat that state as the
target or mutate it; it is evidence for the RED fixture.

## Target architecture proposed for Task 15G — OBSOLETE, not being built

This section is kept only as a record of what was considered and rejected. **Do not build this.**

- One engine-owned, active-variant **Scene State** is the shared input for classification, NPC
  agency, narration, soft memory, UI presence, and suggestions.
- Model registrar/prose grammar become candidate generators of evidence-backed `SceneObservation`s;
  one deterministic Scene Reconciler owns id, alias, actor-kind, and presence decisions.
- A bounded **Narrative Beat Plan** proposes organic actors before prose. The engine reconciles and
  stages them, grants actor-local sealed capabilities, and gives the narrator an immutable contract.
- Committed prose may contain an individual actor only when the contract resolves that actor to one
  registry id. Scenery and background collectives remain non-characters.
- NPC mechanics consume a current hostile trigger event or a persisted validated agenda. Prior prose
  is context, not a fresh trigger. `opposed` is not equivalent to hostile. **This one bullet is
  still being fixed — via Plan 13 Phase 2's `deriveDisposition`, not via this Scene State design.**
- Rulings render before prose and own mechanical detail. Prose covers each current ruling causally
  once. Provider timeout/fallback status remains separate UI metadata; no engine recap is appended
  to story prose. **Also still being fixed — Plan 13 Phase 3 (Ruling presentation) and the narrower
  Task 7 idea of separating `safeSummary` from prose, without the rest of this architecture.**
- Possible Moves compose from typed scene affordances, never arbitrary nearby words. **Also still
  being fixed — Plan 13 Phase 5, using typed anchors instead of `sceneAnchors` reversal.**
- Identity, aliases, presence, trigger consumption, rulings, prose, and active narrator-variant
  scene snapshots remain atomic and rewind/retry/restart safe. **Not being pursued now** — no
  replacement scheduled; revisit only if the disposition/UI/suggestions fixes above prove
  insufficient for the specific actor-identity failures logged below (Kellan, older woman, dog).

The 10-task dependency order this plan specified (RED lifecycle fixture → domain/persistence →
reconciler → pre-narration contract → actor-local capabilities → event-driven agency →
ruling/presentation split → affordance suggestions → turn-coordinator decomposition → one combined
package) is **not being executed**. Several of its individual *goals* are being achieved more
cheaply through Plan 13; only the full-rearchitecture *path* to them was rejected.

## Verification state

Fresh verification after this docs-only diagnosis:

- `npm run typecheck`: passed.
- `npm test`: core **632 / 45 files**, UI **160 / 25 files**, **792 total**, passed.
- `git diff --check`: passed.
- Git retained only user-owned `.agents/`, `.codex/`, and `opencode.json` alongside these Task 15G
  documentation changes.

No native/package gate is needed for a documentation-only diagnosis. Before any later source
completion claim, run the focused suites plus full typecheck/tests, direct builds, and `cargo check`.

## Non-negotiable rules

- Models may propose actors, intents, soft state, and prose. The engine owns mechanics, ids, gates,
  budgets, effects, damage, death, persistence, rollback, and active scene membership.
- Every actual individual NPC/creature in committed prose must be registry-backed. Do not create
  characters for scenery, depictions, crowds, pronouns, ordinals, or prose-transition words.
- Only present living actors participate. Player and NPC action budgets remain separate.
- A later name reveal enriches one actor; active-branch/variant evidence controls current aliases and
  presence.
- Do not weaken threshold-backed death or ruling-before-prose behavior.
- Preserve browser/native bridge parity and user-owned untracked paths. Do not push.
- Do not build intermediate installers. Build once after all Task 15G source slices are complete.

## Progress on the active plan (Plan 13)

Phases 0, 1, and 2 are complete and verified — see `docs/WORKLOG.md`'s 2026-08-02 "Execute Plan 13
Phases 0-2" entry for the full account, including two corrections made against source where the
plan's own premise was stale (step 1.2's real gap was `condenseSoftSlice` dropping
`soft.observations`, not `assembleContext` never using `softSlices` at all — that wiring already
existed) and one deliberate deviation (friendly-disposition NPCs get a harmed-fallback to the
harmful tier that the plan's exact preference table omitted). Full suite green after every single
step: core **651 / 45 files**, UI **160 / 25 files**, **811 total**, typecheck clean throughout.
Nothing has been committed yet.

## Single next action

Implement `Audit/2026-08-02-PRODUCT-AUDIT/13-implementation-plan-final.md` Phase 3 (UI visibility:
loot-effect typing/formatting, Journal filter-chip fix, ruling presentation), then Phase 4
(immutability proof), Phase 5 (suggestions), Phase 6 (observability), in the plan's stated
dependency order. **Verify each step's premise against current source before writing its RED
test** — the plan was written by a separate review pass and two of its Phase 1 steps did not match
current source exactly; treat it as a strong guide, not infallible ground truth. Each step has its
own RED test, exact production edit, and acceptance criteria in that file.
