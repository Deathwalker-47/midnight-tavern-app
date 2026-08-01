# Copy-paste prompt for the next coding agent

Continue Midnight Tavern in `C:\Users\anuji\Documents\midnight-tavern-app`.

Act as engineering manager and hands-on implementation agent. Work autonomously and sequentially;
this repository forbids parallel coding agents. Do not ask the human to choose TypeScript
architecture. Do not push. Preserve the user-owned/untracked `.agents/`, `.codex/`, and
`opencode.json` paths. Never mutate an installed story database unless the human explicitly asks for
that exact data operation; packaged diagnosis is read-only by default.

Read in full before editing:

1. `AGENTS.md`
2. `CONTEXT.md`
3. `ARCHITECTURE.md`
4. `docs/HANDOFF.md`
5. the newest `docs/WORKLOG.md` entries
6. Task 15G in `Plan/next-phase-internal-beta.md`
7. `docs/superpowers/plans/2026-08-02-npc-scene-system-redesign.md`

Use codebase-memory-mcp before text search and re-index if symbols are stale. Use systematic
debugging and strict RED -> observe failure -> minimal coherent implementation -> GREEN. Begin every
PowerShell command with:

`Set-Location -LiteralPath 'C:\Users\anuji\Documents\midnight-tavern-app'`

because the shell sometimes ignores its supplied working directory.

Before stopping, run fresh typecheck and complete tests, run the relevant native/build gates, append
WORKLOG, overwrite HANDOFF, update this prompt and the active plan, and commit coherent green changes
with the required co-author trailer. Build one installer only after all current Task 15G source
slices are complete; do not package each intermediate refactor.

## Current repository state

- Local `main` has Task 15G documentation based on parent `a56fe49`; not pushed.
- App version `0.2.8`, unsigned.
- No Task 15G gameplay implementation has started. The previous turn deliberately analyzed before
  coding because the observed defects share one broken NPC lifecycle boundary.
- Baseline before the docs-only diagnosis: root typecheck passed; core **632 / 45 files**, UI
  **160 / 25 files**, **792 tests total**, passed.
- Run the baseline again before source edits. If it is red on the current tree, fix/log that first.
- The most recently built installer belongs to Task 15F and is stale for Task 15G acceptance. Do not
  hand it off as a fix for this work.

## User goal

The user wants a coherent role-playing scene, not a collection of heuristics:

- every actual individual NPC or creature that appears in committed narration is part of the
  character registry;
- a later name reveal enriches the same actor rather than creating a duplicate;
- only genuinely current/present/living actors can act or be targeted;
- NPCs can act autonomously when their current goal/disposition and legal sealed capabilities justify
  it, but a prior narrated action cannot replay as a new action;
- supportive or social failure does not automatically become violence;
- the engine owns mechanics and the narrator depicts them naturally without overriding them;
- ruling details remain visible before prose, but no mechanical `X succeeds. Hint.` recap is appended
  under every story response;
- Possible Moves are meaningful and scene-specific, not templates around arbitrary words;
- rewind, swipe, retry, cancellation, restart, and provider degradation preserve the same story
  truth.

Do not solve this by hiding characters/rulings in UI, adding another proper-name regex, broadening
the planner prompt, or weakening authority checks.

## Installed evidence: inspect read-only only

Story: `Cyraeth Adventure`

Story id: `ab1c6258-e244-4e7d-9147-1b0d3396a2c7`

- SQLite database:
  `C:\Users\anuji\AppData\Roaming\com.midnighttavern.app\midnight-tavern.db`
- Native log:
  `C:\Users\anuji\AppData\Local\com.midnighttavern.app\logs\midnight-tavern.log`
- WAL/SHM may be live. Use SQLite URI `mode=ro` and `PRAGMA query_only=ON`.
- The user will rewind and replay. Do not repair this save in place.

The exact latest sequence was:

1. Narration introduced/described Daen, an archer, an older woman, and a large dog.
2. The player tried `Reassure Survivor` against Daen. It failed.
3. Daen automatically punched the player because the reaction heuristic treats every opposed action
   as provocation.
4. The next player message was `Describe what you now`. The classifier found no player mechanic.
5. The NPC planner nevertheless proposed another Daen Unarmed Strike by reading the earlier punch in
   recent prose as if it were a new current intent.
6. The engine applied another 10 Health damage. The narrator timed out at 60 seconds after producing
   prose that did not depict a fresh strike.
7. Fallback appended `Daen's Unarmed Strike succeeds. A solid blow lands against the target.` below
   the prose even though the UI already had the ruling card.
8. That prose revealed `The archer - Kellan -`, mentioned the older woman at her doorway, and her dog,
   but Present still contained only the player and Daen. There was no Kellan character row.
9. Possible Moves later offered phrases such as asking about `describe` and `slowly`.

At inspection the player was 80/100 Health. Daen was present; the other previously registered actors
were absent. Do not bake this corrupted state into expected behavior; use the transcript/log as a
fixture source.

## Confirmed source causes

### Identity and presence

`packages/core/src/orchestrator/turn.ts`

- `runTurnOperation` is 676 lines, cyclomatic complexity 39, cognitive complexity 103.
- It owns registrar, deterministic entity discovery, classifier, reaction, NPC planner, resolver,
  narrator, post-prose discovery, transaction, and analyzer sequencing.
- `mergeNarratedEntityTransitions` merges incompatible transition sources without one evidence model.

`packages/core/src/orchestrator/npcIntroduction.ts`

- `ApprovedNpcTransition` contains a full `CharacterRecord` plus only
  `introduce|enter|leave|update`; it has no evidence span, actor kind, provenance, confidence, or
  identity-link decision.
- Existing enter/leave validation proves quoted text occurs but does not own scene semantics.

`packages/core/src/orchestrator/sceneEntityPromotion.ts`

- Free-form regex grammar is a second identity authority.
- `archer` and `hound` are not consistently recognized actor heads.
- `The archer - Kellan -` is outside the supported name-reveal patterns.
- `Kellan finally lowered...` is missed because an adverb separates the name and actor verb.
- `discoverNarratedSceneEntities` skips a candidate whose name is already known unless it enriches a
  generic identity. Therefore a clear current mention cannot reactivate an existing absent older
  woman or dog.
- `inferredSkillIds` scans the whole narrator response and gives the same global keyword-derived
  skills to unrelated promoted actors.

### NPC intent and mechanics

`packages/core/src/orchestrator/npcAgency.ts`

- `isProvocation` returns true for combat, any opposed action, harmful effects, committed harm, or
  danger/opposed stakes. The existing test explicitly requires retaliation after an opposed contest.
- `planNpcReactions` chooses the first gate-legal damaging action. That turned failed reassurance
  into a punch.
- `NpcPlanInput` contains raw player text, recent narration, hard-state candidates/names/presence, and
  hard state. It does not contain character soft disposition/goals/relationships, current trigger
  ids, event consumption, last acted turn, or a structured scene.
- `NpcActionProposal.reason` is model prose and not linked to a current event. The planner repeated a
  prior punch on a narration-only player turn.

`packages/core/src/types/actions.ts`

- `ActionDef` has category, universal family, opposed, gates, costs, and effects but no explicit
  hostile/supportive/neutral interaction semantic.
- `EffectSpec.setFlag` applies to the actor only. The observed exposure flag landed on Daen although
  the fiction framed the player as exposed; actor/target flag effects need distinct fields.

### Narration and ruling presentation

`packages/core/src/orchestrator/authorityGuard.ts`

- `safeSummary` deliberately creates actor/action/outcome/hint prose.
- `generateGuardedNarration` appends it when the narrator is unavailable or a safe prefix exists.
- Existing tests require this fallback wording. Replace the contract through RED tests; do not merely
  delete the function.
- Current auditing catches mechanical contradictions but does not require exact causal coverage of
  every current ruling before commit when generation times out.

`packages/ui/src/screens/Play.tsx` and `packages/ui/src/state/playStore.ts`

- The UI already renders ruling artifacts and a narration-degradation notice. Mechanical fallback
  prose therefore duplicates presentation and reads as part of the story.

### Possible Moves

`packages/core/src/orchestrator/context.ts`

- `buildSceneAnchors` uses character names, location, then reversed words from the latest narrator
  message.

`packages/core/src/orchestrator/suggestions.ts`

- `deterministicFallbackSuggestions` templates around the first surviving anchors. This produced
  `describe` and `slowly` as fake scene subjects.
- Tests currently prove only lexical overlap, not semantic affordance grounding.

### Persistence/history

`packages/core/src/store/db.ts`

- Migration 11 added `characters.present`; migration 12 checkpointed presence; migration 15
  checkpointed display identity; migration 16 removed exact unused pronoun/ordinal phantoms.
- There is no alias/provenance table, actor kind, active-variant Scene State snapshot, or event
  consumption ledger.

`packages/core/src/store/repositories/turnOperations.ts`

- Durable `staged` JSON can carry a typed Narrative Contract/Scene State without rerunning model
  decisions on retry, but it is currently untyped at the repository boundary.

`packages/core/src/store/repositories/storyEvents.ts`

- The event enum has mechanical/journal events but no actor-observation, presence-transition,
  NPC-intent, or trigger-consumption events.

## Accepted target architecture

Implement the detailed plan, not a narrower substitute:

1. Add one typed, engine-owned **Scene State** with actor identities/aliases/kinds, active presence,
   disposition/goals, current triggers, and scene affordances.
2. Make registrar and deterministic grammar emit evidence-backed `SceneObservation` candidates. One
   Scene Reconciler decides id/alias/presence and records rejected reasons.
3. Add a pre-narration **Narrative Beat Plan**. The storyteller can still introduce organic actors,
   but the engine registers/stages them and actor-local sealed capabilities before prose.
4. Give the narrator an immutable Narrative Contract. Post-audit requires every individual actor to
   resolve to the approved cast and every current ruling to have one causal fictional consequence.
5. Make NPC intent event-driven. A response references one unconsumed current hostile trigger or a
   validated persisted agenda. `opposed` alone is neutral. Prior prose cannot authorize a new action.
6. Keep rulings before prose but separate presentation: concise routine ruling line plus expandable
   details. Narration status/retry is UI metadata; no `safeSummary` paragraph enters story prose.
7. Generate Possible Moves from typed actors/interactables/hazards/exits/open questions/goals.
8. Snapshot Scene State by active narrator variant and restore it through swipe/rewind/delete/retry.
9. Decompose the oversized turn coordinator only after the new contracts have tests and callers.

The plan proposes a legacy-safe migration 17 with actor kind/aliases/provenance and active timeline
state. Follow the detailed tasks and adjust exact schema only if RED fixtures prove a safer shape;
preserve atomicity and old-save compatibility.

## Exact next action: Task 15G Task 1 only

Do not edit production Scene State code first.

Create:

- `packages/core/test/fixtures/cyraethNpcScene.ts`
- `packages/core/test/orchestrator/npcSceneLifecycle.test.ts`

Update focused tests only as needed to freeze the current broken contracts:

- `packages/core/test/orchestrator/npcAgency.test.ts`
- `packages/core/test/orchestrator/sceneEntityPromotion.test.ts`
- `packages/core/test/orchestrator/authorityGuard.test.ts`
- `packages/core/test/orchestrator/suggestions.test.ts`

Script the exact provider outputs and assert:

1. Daen, Kellan, older woman, and dog each resolve to one registry identity; current mentions make
   known absent actors present; aliases do not duplicate people.
2. Failed supportive/opposed reassurance causes no automatic damaging response.
3. The narration-only next player turn cannot replay the prior Daen strike; player Health stays at
   the pre-turn value.
4. Every valid current ruling is covered once; narrator timeout never appends mechanical recap prose.
5. Suggestions use real scene actors/facts and never use `describe`, `slowly`, `alone`, or pronouns as
   subjects.
6. Retry/restart/swipe/rewind/delete/cancellation restore one coherent active Scene State.

Observe and record the expected RED failures before production edits. Then implement Task 2 onward
one coherent slice at a time, updating the checklist and WORKLOG after each green slice.

## Required verification and closeout

For each source slice:

- focused RED/GREEN tests;
- `npm run typecheck`;
- `npm test` before commit;
- `git diff --check`;
- preserve bridge parity and no user-owned changes.

Before Task 15G completion/package:

- full root typecheck/tests;
- direct core/UI production builds;
- `cargo check` in `packages/shell/src-tauri`;
- one root `npm run build` only after all source slices are complete;
- installer sizes, hashes, and unsigned status in HANDOFF/WORKLOG;
- update active plan, CONTEXT, ARCHITECTURE, HANDOFF, and this prompt with what actually landed.

Do not claim packaged/provider acceptance until the human installs, rewinds, replays, and the new log
and database are inspected read-only.
