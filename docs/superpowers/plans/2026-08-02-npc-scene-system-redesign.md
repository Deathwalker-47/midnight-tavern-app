# NPC Scene System Redesign Plan

> Execute sequentially with test-driven-development, systematic-debugging, and
> verification-before-completion. This repository forbids parallel coding agents. Every behavior
> change must be observed RED before its production implementation is edited.

**Goal:** Replace the current collection of prose-reading NPC heuristics with one authoritative,
timeline-safe scene contract so every individual actor in committed narration is registry-backed,
only justified NPC actions reach the DM, narration covers each real ruling exactly once, and Possible
Moves come from meaningful scene affordances.

**Architecture:** Add a typed Scene State boundary between accepted story history and every turn
consumer. A pre-narration beat plan may propose organic actors and ordinary story beats; the engine
reconciles identity, aliases, presence, actor-local capabilities, and current trigger events before
the narrator writes. The narrator then receives an immutable contract and a post-generation audit
rejects unapproved actors or uncovered mechanics. Registry/presence changes, rulings, prose, aliases,
and variant snapshots commit atomically.

**Tech stack:** TypeScript, Zod, deterministic core engine, model-backed bounded proposals, SQLite
embedded migrations/repositories, React/Zustand, Vitest, Tauri/Rust.

**Scope boundary:** This plan diagnoses and redesigns the system; it does not repair the user's
installed `Cyraeth Adventure` save. The user will rewind and replay. Do not build an installer until
all source slices below are green, then build one combined package for human acceptance.

## Product contract

1. The narrator may introduce people, animals, and creatures organically, but an individual actor
   may appear in committed prose only when the same turn has an approved registry identity.
2. Registry identity is persistent; scene presence is timeline and variant state. Only present,
   living actors can act or be targeted.
3. A descriptor and a later name are aliases of one actor when the evidence is unambiguous. A
   location, depiction, statue, crowd, pronoun, ordinal, or sentence-transition word is not an actor.
4. Models propose story beats, identity candidates, soft disposition, intent, and prose. The engine
   owns ids, catalog membership, gates, budgets, effects, damage, death, persistence, and rollback.
5. An NPC mechanical action needs either a current unconsumed trigger event or an explicit persisted
   goal/disposition agenda. Prior prose is context, never proof that a fresh action occurred.
6. `opposed` means a contest; it does not mean hostile. Failed reassurance may increase distrust but
   cannot automatically become a damaging counterattack.
7. DM rulings render before prose. The ruling card owns numbers and mechanical detail; prose owns the
   natural fictional consequence. A provider fallback or timeout must never append a synthetic
   `X succeeds. Hint.` paragraph to story prose.
8. Possible Moves are generated from typed actors, interactables, hazards, exits, open questions,
   and goals. Raw nearby words are not scene affordances.
9. Rewind, delete, swipe, retry, cancellation, and restart restore the same active cast, aliases,
   presence, consumed triggers, rulings, and narration variant.

## Confirmed live failure chain

The installed database and log were inspected read-only. The latest failing exchange is not one
extractor miss; it is a disagreement among independent interpreters:

| Observation | Current owner | Confirmed cause |
| --- | --- | --- |
| `Kellan` is in prose but not the registry | `sceneEntityPromotion.ts` | `The archer - Kellan -` is outside the bounded identity grammar, and `Kellan finally lowered...` is missed because an adverb separates the name and actor verb. |
| The older woman and dog exist as absent rows but do not return to Present | `discoverNarratedSceneEntities` | Existing known names are skipped unless the candidate enriches a generic name, so deterministic discovery cannot reactivate an absent known actor from clear current prose. |
| Daen punched after failed reassurance | `planNpcReactions` | Every opposed action is treated as provocation; the benign opposed `Reassure Survivor` therefore selects the first legal damaging response. |
| Daen punched again when the player only wrote `Describe what you now` | `planNpcActions` | The planner sees recent prose but no current trigger ids, disposition, goal, or consumed-event state. It reinterpreted the already-narrated punch as a new attack. |
| The second ruling removed 10 Health although the prose did not depict a new strike | turn resolution plus narrator timeout | Mechanics resolved before narration; the narrator timed out at 60 seconds after writing a different scene. No causal-coverage gate prevented that mismatch. |
| `Daen's Unarmed Strike succeeds. A solid blow lands against the target.` appears below prose | `authorityGuard.safeSummary` | On timeout the engine appends its mechanical summary to the accepted prose even though the UI already has a ruling card. Tests currently require this duplicated sentence. |
| Possible Moves ask about `describe` and `slowly` | `buildSceneAnchors` plus deterministic suggestion fallback | The anchor builder reverses words from the latest narration. The fallback templates use the first surviving tokens, so verbs/adverbs become fake subjects. |
| Generic NPCs receive implausibly identical skills | `inferredSkillIds` in scene promotion | Skill inference scans the whole narrator response, then grants the same global keyword-derived list to every promoted actor instead of using actor-local evidence. |

The latest operation formally completed because every subsystem satisfied its own local schema. The
root defect is that registrar, regex promotion, classifier, reaction heuristic, NPC planner,
narrator, analyzer, and suggestion tokenizer do not share one actor/scene/event model.

## Target turn flow

1. **Load active Scene State.** Rehydrate registry identities, active-variant aliases/presence,
   current soft disposition/goals, and unconsumed scheduled events.
2. **Reconcile bounded accepted history.** Repair older saves from evidence spans using the same
   reconciler used for new turns; do not let a separate compatibility extractor define identity.
3. **Classify and resolve the player.** Emit stable current-turn events for every consequential
   attempt and ruling.
4. **Plan NPC mechanics from events.** Supply current triggers plus structured Scene State; validate
   semantic hostility, target, gate, budget, duplicate/cooldown, and event consumption.
5. **Create a Narrative Beat Plan.** The story model may propose organic actor introductions,
   identity reveals, entries/exits, dialogue, nonmechanical beats, and scene affordances. It may only
   reference already-resolved rulings for mechanical outcomes.
6. **Reconcile and stage the plan.** Resolve each actor reference to a registry id, create actor-local
   capabilities from sealed assets, reject scenery/duplicates/ambiguity, and freeze a Narrative
   Contract.
7. **Generate and audit prose.** Narrate only the approved cast/beats; causally cover every ruling
   once; reject unapproved individual actors, state changes, damage, or death.
8. **Commit atomically.** Save rulings, prose, actor identity/presence, aliases/provenance, consumed
   triggers, affordances, and checkpoint/variant scene snapshot in one transaction.
9. **Analyze soft memory.** Update only approved registry actors from the committed variant.

## Task 1: Freeze the Cyraeth lifecycle as an end-to-end RED contract

**Primary files:**
- Create `packages/core/test/orchestrator/npcSceneLifecycle.test.ts`
- Create `packages/core/test/fixtures/cyraethNpcScene.ts`
- Modify `packages/core/test/orchestrator/npcAgency.test.ts`
- Modify `packages/core/test/orchestrator/sceneEntityPromotion.test.ts`
- Modify `packages/core/test/orchestrator/authorityGuard.test.ts`
- Modify `packages/core/test/orchestrator/suggestions.test.ts`

- [ ] Build a provider-scripted fixture for the exact sequence: generic villagers appear, Daen is
  revealed, the archer is revealed as Kellan, the older woman and dog reappear, reassurance fails,
  and the next player input is narration-only.
- [ ] Observe RED assertions that every individual actor is one registry row and that current
  physical mentions reactivate known absent rows without duplicating aliases.
- [ ] Observe RED assertions that failed supportive/opposed actions do not provoke damage and that a
  prior narrated attack cannot become a fresh intent without a current trigger.
- [ ] Observe RED assertion that the player remains at the pre-turn Health value on the
  narration-only exchange.
- [ ] Observe RED assertion that a narrator timeout leaves the ruling card/retry metadata separate
  and never appends `succeeds`/`fails` summary prose.
- [ ] Observe RED suggestions that must reference Daen/Kellan/the claw-handed creature/current road,
  and must not promote `describe`, `slowly`, `alone`, or pronouns to subjects.
- [ ] Add rewind, delete, swipe, retry, cancellation, and restart variants to the fixture before
  production changes, so later tasks cannot pass only on a straight-line turn.

**Verification:** Run the focused new lifecycle suite and record the expected failures in WORKLOG.
Do not weaken or delete an assertion to make later tasks green.

## Task 2: Introduce the shared Scene State domain and persistence boundary

**Primary files:**
- Create `packages/core/src/types/scene.ts`
- Create `packages/core/src/store/repositories/characterAliases.ts`
- Modify `packages/core/src/store/db.ts` (migration 17)
- Modify `packages/core/src/store/index.ts`
- Modify `packages/core/src/store/repositories/characters.ts`
- Modify `packages/core/src/store/repositories/checkpoints.ts`
- Modify `packages/core/src/store/repositories/turnOperations.ts`
- Modify `packages/core/src/store/repositories/storyEvents.ts`
- Modify `packages/core/src/orchestrator/history.ts`
- Modify `packages/core/test/store/db.test.ts`
- Modify `packages/core/test/store/repositories.test.ts`
- Modify `packages/core/test/orchestrator/history.test.ts`
- Modify `CONTEXT.md` and `ARCHITECTURE.md`

- [ ] Define Zod-backed `ActorKind`, `ActorAlias`, `EvidenceSpan`, `SceneObservation`,
  `SceneCastEntry`, `SceneAffordance`, `NpcTriggerEvent`, `NpcIntentProposal`,
  `NarrativeBeatPlan`, and `NarrativeContract` types.
- [ ] Make every observation carry message id, active variant, offsets/quote, observation kind,
  actor kind, presence claim, and proposed/existing identity. No evidence-free transition may reach
  persistence.
- [ ] Add `characters.actor_kind` with a legacy-safe `unknown` default and a
  `character_aliases` table with normalized alias, display alias, provenance message/variant, and
  active-timeline status. Add uniqueness rules that prevent one active alias from silently binding
  to two actors.
- [ ] Persist the approved Scene State/Narrative Contract inside the durable turn operation's
  staged envelope so retry/restart cannot rerun identity or NPC intent decisions.
- [ ] Extend checkpoint and narrator-variant snapshots to restore display identity, alias activity,
  presence, scene affordances, and consumed trigger state together. Historical provenance may remain
  auditable, but inactive branches must not influence current targeting/planning.
- [ ] Add typed story-event kinds for actor observation, identity enrichment, presence transition,
  NPC intent, and trigger consumption. Keep materialized `characters.present` for fast reads.
- [ ] Prove migration 17 upgrades old saves without making all legacy actors present, losing hard or
  soft state, or resurrecting removed phantom rows.

**Verification:** Focused DB/repository/history tests, file-backed persistence test, typecheck.

## Task 3: Replace competing actor heuristics with one Scene Reconciler

**Primary files:**
- Create `packages/core/src/orchestrator/sceneReconciler.ts`
- Modify `packages/core/src/orchestrator/npcIntroduction.ts`
- Modify `packages/core/src/orchestrator/sceneEntityPromotion.ts`
- Modify `packages/core/src/orchestrator/turn.ts`
- Modify `packages/core/src/orchestrator/checkpoint.ts`
- Create `packages/core/test/orchestrator/sceneReconciler.test.ts`
- Modify `packages/core/test/orchestrator/npcIntroduction.test.ts`
- Modify `packages/core/test/orchestrator/sceneEntityPromotion.test.ts`
- Modify `packages/core/test/orchestrator/turn.test.ts`

- [ ] Treat the model registrar and deterministic prose grammar as candidate generators only. Both
  must emit `SceneObservation[]`; neither may write `CharacterRecord` or presence directly.
- [ ] Resolve candidates deterministically against ids, active aliases, actor kind, evidence spans,
  current presence, and nearby coreference. Return accepted observations plus rejected observations
  with stable reason codes for telemetry.
- [ ] Support descriptor-first reveals such as `The archer - Kellan -`, bounded intervening adverbs,
  ordinary dialogue vocatives, animal names, and current physical mentions of known absent actors.
- [ ] Fail closed on locations (`Arial`), depictions, crowds, quantifiers, pronouns, ordinals, prose
  transitions, and ambiguous aliases.
- [ ] Make re-entry explicit: a current physical observation of the older woman/dog may set present;
  a historical mention may ensure registry membership but cannot set present.
- [ ] Reconcile current active-variant evidence only. A name from an abandoned swipe/rewound branch
  may remain provenance but cannot steal the actor in the active branch.
- [ ] Remove `mergeNarratedEntityTransitions` and the known-name skip as authority paths once the
  reconciler owns all transitions. Keep a narrow compatibility adapter only while old-save tests need
  it, then delete it in Task 9.
- [ ] Persist accepted/rejected observation diagnostics in the operation, excluding provider secrets
  and excessive prose.

**Verification:** Scene reconciler, introduction, promotion, turn, checkpoint/history suites.

## Task 4: Plan organic actors before narration and enforce the Narrative Contract

**Primary files:**
- Create `packages/core/src/orchestrator/narrativeBeatPlan.ts`
- Modify `packages/core/src/orchestrator/context.ts`
- Modify `packages/core/src/orchestrator/authorityGuard.ts`
- Modify `packages/core/src/orchestrator/turn.ts`
- Create `packages/core/test/orchestrator/narrativeBeatPlan.test.ts`
- Modify `packages/core/test/orchestrator/authorityGuard.test.ts`
- Modify `packages/core/test/orchestrator/turn.test.ts`

- [ ] Add one bounded structured preflight after mechanics: existing actor references, organic actor
  proposals, presence changes, identity reveals, dialogue/nonmechanical beats, and affordances.
- [ ] Reconcile and stage proposed actors before prose. Organic creation remains available to the
  storyteller, but ids, alias binding, kind, capabilities, and presence are engine-approved.
- [ ] Pass the narrator an immutable contract containing approved actor ids/display names, exact
  rulings to cover, allowed nonmechanical beats, and forbidden state claims.
- [ ] Audit committed prose so every individual actor mention resolves to the approved cast. Allow
  explicitly marked background collectives and scenery without registry rows; repair or reject an
  unapproved individual rather than committing a prose-only NPC.
- [ ] Verify each current ruling has a causal fictional consequence exactly once. Mentioning an old
  ruling in context cannot satisfy a current ruling, and ordinary prose cannot create a new ruling.
- [ ] Preserve first-safe-chunk streaming only for beats already validated against the contract.
  Never expose an unapproved introduction or mechanical outcome before its validation boundary.
- [ ] Commit the staged actors and narration together; cancellation, timeout before commit, and
  failed audit leave neither half behind.

**Verification:** Narrative-plan, authority, streaming, cancellation, retry, and full-turn tests.

## Task 5: Provision emergent NPC capabilities from actor-local evidence

**Primary files:**
- Create `packages/core/src/orchestrator/npcCapabilityProvisioner.ts`
- Modify `packages/core/src/orchestrator/sceneEntityPromotion.ts`
- Modify `packages/core/src/orchestrator/npcIntroduction.ts`
- Modify `packages/core/src/orchestrator/turn.ts`
- Modify `packages/core/test/orchestrator/sceneReconciler.test.ts`
- Create `packages/core/test/orchestrator/npcCapabilityProvisioner.test.ts`

- [ ] Select an exact frozen NPC template when canonical identity matches; otherwise derive a bounded
  archetype only from that actor's evidence spans and proposed role.
- [ ] Select only sealed story skill ids/actions and validate gates. Do not copy keywords or skills
  from unrelated actors elsewhere in the narration.
- [ ] Give a dog, archer, elder, merchant, or creature distinct plausible loadouts in the same scene;
  prove irrelevant magic/crafting skills are not leaked across actors.
- [ ] Preserve the engine-owned natural attack compatibility rule, playable encounter Health, and
  threshold-backed death.
- [ ] Make capability provisioning deterministic for the staged observation/seed so narrator retry,
  app restart, and swipe do not silently reroll an actor sheet.

**Verification:** Provisioner, instantiation, gate, resolver, persistence, and lifecycle tests.

## Task 6: Make NPC agency event-driven and semantically intentional

**Primary files:**
- Modify `packages/core/src/types/actions.ts`
- Modify `packages/core/src/config/universal-actions.json`
- Modify `packages/core/src/config/registry.ts`
- Modify `packages/core/src/bootstrap/generate.ts`
- Modify `packages/core/src/bootstrap/validate.ts`
- Modify `packages/core/src/orchestrator/npcAgency.ts`
- Modify `packages/core/src/orchestrator/turn.ts`
- Modify `packages/core/test/orchestrator/npcAgency.test.ts`
- Modify `packages/core/test/orchestrator/turn.test.ts`
- Modify relevant config/bootstrap compatibility tests

- [ ] Add engine-owned action interaction semantics (`hostile`, `supportive`, `neutral`) to the
  versioned universal family and frozen action definitions. Provide a conservative compatibility
  function for old rulebooks; `opposed` alone must resolve to neutral, never hostile.
- [ ] Replace `isProvocation` with current-event evaluation: explicit hostile attempt, committed
  harm, or a validated scene threat may trigger a counteraction; reassurance/persuasion failure may
  update disposition but cannot select damage automatically.
- [ ] Feed the planner structured Scene State, current unconsumed trigger events, disposition,
  relationship, goal, capability loadout, and last-action metadata. Recent prose is supporting
  context only.
- [ ] Require `triggerEventId` for reactive actions or a persisted `agendaId` for independent goal
  actions. Validate that it belongs to the current scene, is unconsumed, and semantically permits
  the proposed action/target.
- [ ] Consume the trigger on accepted intent; enforce actor/action/target uniqueness and a bounded
  repeat/cooldown rule. A provider cannot replay yesterday's punch as today's attack.
- [ ] Correct effect targeting semantics: actor flags and target flags must be distinct fields so an
  exposure/condition caused to the target cannot silently land on the attacker.
- [ ] Keep the NPC budget separate from the player's action budget and retain deterministic hostile
  fallback only when persisted hostility plus a current agenda permits it.

**Verification:** Universal config, bootstrap, NPC agency, resolver, turn, death, and lifecycle tests.

## Task 7: Separate ruling presentation from narration fallback

**Primary files:**
- Modify `packages/core/src/orchestrator/authorityGuard.ts`
- Modify `packages/core/src/orchestrator/turn.ts`
- Modify `packages/core/src/store/repositories/turnOperations.ts`
- Modify `packages/ui/src/screens/Play.tsx`
- Modify `packages/ui/src/state/playStore.ts`
- Modify `packages/ui/test/screens/Play.test.tsx`
- Modify `packages/core/test/orchestrator/authorityGuard.test.ts`
- Modify `packages/core/test/orchestrator/turn.test.ts`

- [ ] Replace `GuardedNarrationResult.usedSafeFallback` prose substitution with explicit narration
  status (`complete`, `partial_verified`, `unavailable`) plus a separate retryable failure reason.
- [ ] Remove `safeSummary` from story prose. Mechanical truth remains in persisted rulings/events and
  the UI ruling artifact, never in an appended narrator paragraph.
- [ ] Render routine rulings as one concise line before prose (for example, `Daen hit you for 10
  Health`) with expandable dice/DC/effect details. Denials and safety pauses retain prominent cards.
- [ ] If narration times out after safe prose, keep only contract-verified prose, show a separate
  `Narration incomplete - Retry` notice, and do not synthesize another fictional sentence.
- [ ] If no prose is safe, show the ruling plus the notice; retry reuses the same rulings and staged
  Scene State. It must not reroll, repeat an NPC intent, or leave Play busy.
- [ ] Remove tests that require `X succeeds. Hint.` only after the replacement presentation and
  persistence tests are RED and implemented.

**Verification:** Authority guard, turn recovery, Play, restart, cancellation, and lifecycle tests.

## Task 8: Generate Possible Moves from typed scene affordances

**Primary files:**
- Modify `packages/core/src/orchestrator/context.ts`
- Modify `packages/core/src/orchestrator/suggestions.ts`
- Modify `packages/core/src/orchestrator/narrativeBeatPlan.ts`
- Modify `packages/core/test/orchestrator/suggestions.test.ts`
- Modify `packages/core/test/orchestrator/narrativeBeatPlan.test.ts`
- Modify `packages/ui/test/screens/Play.test.tsx`

- [ ] Build `SceneAffordance[]` from approved actors, interactables, hazards, exits, open questions,
  and current goals. Every affordance has a stable id, display label, kind, and referenced actor ids.
- [ ] Ask the suggestion model to compose from affordance ids and validate every returned move
  against the active Scene State and target legality.
- [ ] Make deterministic fallback templates consume affordances only. With Daen, Kellan, a road, and
  a claw-handed-creature question, output meaningful ask/investigate/travel/prepare choices.
- [ ] Reject stop words, pronouns, isolated verbs/adverbs, location fragments, absent actors, dead
  targets, unsupported equipment, and duplicate paraphrases.
- [ ] Preserve insert-only UX and the two-action player budget; suggestions never auto-submit or
  invent mechanics.

**Verification:** Suggestion, context, Play, and lifecycle tests with provider success, malformed
output, timeout, and total unavailability.

## Task 9: Decompose the turn coordinator and retire duplicate authority paths

**Primary files:**
- Refactor `packages/core/src/orchestrator/turn.ts`
- Create `packages/core/src/orchestrator/turn/loadScene.ts`
- Create `packages/core/src/orchestrator/turn/resolvePlayerPhase.ts`
- Create `packages/core/src/orchestrator/turn/resolveNpcPhase.ts`
- Create `packages/core/src/orchestrator/turn/prepareNarration.ts`
- Create `packages/core/src/orchestrator/turn/commitTurn.ts`
- Modify all orchestrator integration tests
- Modify `ARCHITECTURE.md`, `CONTEXT.md`, `docs/HANDOFF.md`, and `docs/NEXT-AGENT-PROMPT.md`

- [ ] Extract the 676-line, cognitive-complexity-103 `runTurnOperation` into explicit phases while
  preserving one durable operation and one atomic commit.
- [ ] Each phase consumes/returns typed data; it must not reread raw prose to infer facts already
  represented in Scene State or current events.
- [ ] Delete the old transition merge, global narration skill inference, opposed-equals-provocation,
  prose-token suggestion anchors, and `safeSummary` prose fallback once all callers move.
- [ ] Retain bounded provider deadlines, cancellation semantics, live ruling-before-prose delivery,
  verified streaming, operation recovery, and browser/native bridge parity.
- [ ] Run the complete Cyraeth fixture through straight play, retry, restart, swipe, rewind, delete,
  and provider degradation. Assert the same active branch has one canonical actor per individual,
  correct presence, no duplicate damage, covered rulings, and meaningful suggestions.

**Verification:** Full core/UI suites, typecheck, direct core/UI builds, `cargo check`, and
`git diff --check`.

## Task 10: One packaged acceptance build after the redesign is complete

- [ ] Update the active Task 15G checklist, WORKLOG, HANDOFF, NEXT-AGENT prompt, CONTEXT, and
  ARCHITECTURE with actual landed behavior and remaining risks.
- [ ] Run `npm run typecheck` and `npm test` fresh; record exact counts.
- [ ] Run direct production builds and `cargo check` before packaging.
- [ ] Run one root `npm run build`, record installer paths, sizes, SHA-256 hashes, and unsigned status.
- [ ] Human acceptance: rewind the affected Cyraeth branch and replay from before the villagers.
  Verify Present/Characters, Kellan/older woman/dog identity, no unsupported Daen attack, compact
  ruling presentation, narration retry, meaningful Possible Moves, close/reopen, and swipe/rewind.
- [ ] Inspect the installed log/database read-only after the replay and compare the persisted Scene
  State, trigger consumption, rulings, active variant, and visible UI. Do not repair the save in
  place unless the human separately authorizes that operation.

## Stop conditions

- Do not paper over a failed actor reconciliation by hiding the Present strip or filtering names in
  UI only.
- Do not let the narrator, registrar, or analyzer write hard mechanics or bypass the sealed catalog.
- Do not classify every named noun as an actor and clean up with migrations afterward.
- Do not use absence from one prose paragraph as evidence that an actor left.
- Do not use prior narrated action text as a new NPC trigger.
- Do not weaken death/damage authority to make prose pass.
- Do not append a mechanical fallback sentence to the story stream.
- Do not build intermediate installers; build once after Tasks 1-9 are green.
