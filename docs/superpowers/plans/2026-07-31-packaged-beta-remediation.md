# Packaged Beta Acceptance Remediation Plan

> Execute sequentially with test-driven-development and verification-before-completion. This
> repository forbids parallel coding agents. Each behavior change must be observed RED before its
> production implementation is edited.

**Goal:** Close every defect found in the first provider-backed v0.2.8 acceptance pass without
weakening deterministic engine authority, registry/presence rules, atomic persistence, or bridge
parity.

**Scope:** Seven user-observed failures: Forge restart after cancellation, character-specific
dossiers and current state, attack target continuity, Possible Moves degradation, independent
hostile NPC action, Play scroll anchoring, and Overview information hierarchy. Installer rebuilding
is deferred until all source slices are complete, per the product owner's instruction.

## Acceptance findings and confirmed causes

1. **Overview hierarchy is inverted.** Once chapters exist but no arc has closed, `Overview` uses
   the live chapter summaries only in the narrow timeline while the large reading pane falls back
   to the immutable premise. The latest closed chapter must be the primary story recap; premise is
   supporting context.
2. **Every dossier repeats the global story.** `getCharacterDossier` currently selects the latest
   arc plot summary or the last three global chapter summaries for every character. “Story so far”
   must instead be derived only from that registry character's backstory, observations, and
   actor/target events.
3. **Soft fields are missing, especially for the player.** Characters created by bootstrap and NPC
   promotion can have hard state without a soft record, and the background analyzer omits every
   present character that lacks soft state. The analyzer therefore cannot populate their traits,
   mood, location, or goal.
4. **Cancelled Forge traps the user in retained-work UX.** Cancellation deliberately retains a
   checkpoint, but `forgeStory` always reuses any retained request and operation id. Discard is a
   secondary asynchronous path. The user needs explicit, race-free choices to resume saved work or
   start a genuinely fresh operation.
5. **Possible Moves disappear when the classifier degrades.** Suggestions require an exact
   structured provider response after bounded repair and otherwise throw. Packaged logs show both
   rate-limit failures and malformed tiny responses. A provider failure must yield safe,
   scene-grounded deterministic suggestions, not an empty feature.
6. **Pronoun attacks lose the active target.** Local universal-action recovery resolves only an
   explicitly named present character or a scene with exactly one non-player character. “Attack it
   again” fails when an older non-player registry character is also present. Recovery needs a
   high-confidence recent living target focus; otherwise it must remain unresolved rather than
   guess.
7. **Hostile NPC agency vanishes with the planner provider.** Same-turn deterministic reactions
   work only after a resolved provocation, while goal-driven NPC planning returns no actions on any
   provider error. Hostility must become an engine-approved persisted scene fact so a living hostile
   NPC can select a legal sealed attack without depending on a model call.

## Non-negotiable constraints

- The engine owns gates, dice, damage, death, action budgets, target legality, and committed state.
- Models may propose identity, disposition, goals, and prose; the engine validates before use.
- Every actual NPC/creature is registry-backed. Scenery and quantifier nouns are not characters.
- Registry membership and scene presence remain separate. Only present, living actors can act.
- A pronoun target is reused only from a unique, recent, present, living focus; never from roster
  order.
- Provider degradation may reduce variety but may not disable safe player affordances or proven
  hostile behavior.
- Player and NPC budgets stay separate; two legal player strikes remain legal.
- Death remains authoritative only at the configured lethal-resource threshold.
- Browser/native bridge parity is mandatory. Do not import native or `node:` dependencies into the
  in-memory webview bridge.
- Do not rebuild an installer until every remediation slice is complete and the full gate is green.

## Task 1: Make Forge recovery offer a real fresh start

**Primary files:**
- `packages/ui/src/screens/StoryBlueprint.tsx`
- `packages/ui/test/screens/StoryBlueprint.test.tsx`

- [x] Add a failing test: cancel a Forge, choose **Start new Forge**, then assert a new story id,
  operation id, request, and no resume checkpoint are passed to `createStory`.
- [x] Add a failing race test proving the old durable operation is cleared before the fresh one is
  saved, so a late clear cannot delete the new operation.
- [x] Extract an awaited `discardRetainedForge(expectedOperationId)` transition that clears durable
  state only for the retained id and then clears matching refs/state.
- [x] Present equally understandable actions: **Resume saved Forge** and **Start new Forge**.
- [x] Preserve explicit checkpoint resume and honest provider 429/error copy.
- [x] Run the focused StoryBlueprint suite, UI suite, typecheck, and commit the slice.

Completed 2026-07-31. The focused test was RED because no Start-new action existed. Fresh start now
awaits the queued retained write, clears exactly the retained operation id, and only then creates and
saves a new request without `resume`. A clear failure is visible and blocks replacement instead of
racing it. Focused StoryBlueprint 8/8, UI 149/25, core 546/42, total 695, and typecheck pass.

## Task 2: Give every registry character durable character-specific memory

**Primary files:**
- `packages/core/src/bootstrap/instantiate.ts`
- `packages/core/src/orchestrator/npcIntroduction.ts`
- `packages/core/src/orchestrator/turn.ts`
- `packages/core/src/memory/softStore.ts`
- `packages/core/src/memory/dossier.ts`
- `packages/core/test/memory/dossier.test.ts`
- relevant bootstrap, NPC-introduction, analyzer, and turn tests
- `packages/ui/src/screens/CharacterDossier.tsx`
- `packages/ui/test/screens/CharacterDossier.test.tsx`

- [x] Add failing tests proving player and introduced-NPC records always have a valid soft-state
  envelope and are included in analyzer input.
- [x] Add failing dossier tests with two characters in one story; neither dossier may use the
  other's observations or the global chapter/arc summary.
- [x] Ensure soft state on every registry insertion path and lazily repair older hard-only rows.
- [x] Reject analyzer operations for unknown/non-present character ids; the analyzer may update only
  the supplied present registry cast.
- [x] Build **Character history** from that character's backstory, observations, and actor/target
  events. Show an honest empty-state label when no evidence exists; never substitute global plot.
- [x] Populate evidence-backed traits, mood, location, and goal during completed turns, including
  the player. Do not invent defaults that the exchange does not support.
- [x] Rename the UI section from “Story so far” to “Character history” and distinguish “Not observed
  yet” from loading/absence.
- [x] Run focused core/UI tests, all tests, typecheck, and commit the slice.

Completed 2026-07-31. Character insertion now creates a primary player or secondary NPC soft
envelope at the repository boundary, while completed-turn background work repairs legacy null
envelopes before prompting the analyzer. Analyzer output is limited to the supplied present cast,
and unknown/non-present ids or relationships cannot create registry entries. Dossiers no longer
read global chapter/arc summaries: Character history uses only that character's backstory,
observations, and authoritative actor/target events. Empty Mentality, Mood, Location, Goal, and
history states say **Not observed yet** instead of appearing broken. Focused core 67/5 and UI 2/1,
complete core 550/43 and UI 150/25 (700 total), and typecheck pass.

## Task 3: Preserve a unique recent target across degraded classification

**Primary files:**
- `packages/core/src/classifier/classify.ts`
- `packages/core/src/orchestrator/context.ts`
- `packages/core/src/orchestrator/turn.ts`
- classifier/context/turn tests

- [x] Add a failing reproduction with player + old NPC + current creature present, a prior allowed
  attack ruling against the creature, provider failure, and “attack it again.”
- [x] Derive target focus from the newest committed player ruling/event whose target is still
  present and alive; thread only that authoritative id into classifier recovery.
- [x] Reuse focus only for pronoun/continuation language and only when explicit naming did not select
  another target.
- [x] Prove stale, dead, absent, multiple, and explicitly switched targets fail closed or select the
  explicit living name as appropriate.
- [x] Keep sealed action lookup, gate evaluation, damage, death, and action-budget rules unchanged.
- [x] Run classifier/turn suites, all tests, typecheck, and commit the slice.

_Completed 2026-07-31 in `3b0a05e`. RED cases covered provider failure with an older NPC and current
creature, dead/absent/stale/multiple focus, and explicit target switching. Focus is derived only
from the newest recent authoritative player ruling and is reused only for continuation wording.
Focused classifier/target-focus/turn suites passed 80 tests in 3 files; complete core passed 558
tests in 44 files, UI passed 150 tests in 25 files (708 total), and root typecheck passed._

## Task 4: Keep Possible Moves useful during provider degradation

**Primary files:**
- `packages/core/src/orchestrator/suggestions.ts`
- `packages/core/src/orchestrator/context.ts`
- `packages/core/test/orchestrator/suggestions.test.ts`
- UI suggestion-flow tests if copy/state changes

- [x] Add failing tests for provider error, malformed output after repairs, aborted signal, absent
  characters, an empty sealed catalog, and sparse scene context.
- [x] Return five unique deterministic fallback suggestions when there is enough committed scene
  context. Use recent scene anchors, present registry names, and legal sealed action labels only.
- [x] Never mention absent/dead characters, invent items/skills, or pre-assert success.
- [x] Preserve caller cancellation as cancellation; do not turn abort into suggestions.
- [x] Keep suggestions insert-only: sending one still runs normal classifier/gate/ruling authority.
- [x] Give an honest reduced-variety notice only if useful; do not show “unavailable” when safe
  fallbacks exist.
- [x] Run suggestion/bridge/Play suites, all tests, typecheck, and commit the slice.

_Completed 2026-07-31 in `2c5c738`. After provider failure or three invalid structured attempts,
rich committed scene context yields five deterministic choices. Fallbacks use only living visible
registry names, extracted scene anchors, and non-combat gate-allowed sealed actions; sparse context
returns no fabricated choices and aborts still reject. The Play drawer keeps them insert-only.
Focused core passed 13 tests and focused UI/bridge passed 38 tests; complete core passed 564/44,
UI passed 151/25 (715 total), and root typecheck passed._

## Task 5: Persist validated hostility and act without the planner provider

**Primary files:**
- `packages/core/src/types/schema.ts` and/or character hard-state flag contract
- `packages/core/src/orchestrator/npcIntroduction.ts`
- `packages/core/src/orchestrator/npcAgency.ts`
- `packages/core/src/orchestrator/checkpoint.ts`
- `packages/core/src/orchestrator/turn.ts`
- NPC-introduction/agency/turn/persistence tests

- [ ] Add failing tests for an explicitly hostile introduced creature attacking a present living
  player when the NPC planner provider errors or times out.
- [ ] Add negative tests: neutral/friendly/unknown disposition, dead/absent actor, dead/absent target,
  no legal damaging action, exhausted NPC budget, and cancelled/rolled-back turn.
- [ ] Extend the bounded introduction proposal with a small disposition contract and validate it
  against explicit scene evidence before persisting an engine-owned hostility fact.
- [ ] Deterministically choose a legal sealed damaging action for a validated hostile NPC only;
  route it through normal gate/resolver/ruling/state machinery.
- [ ] Preserve deterministic provocation reactions and ensure the same NPC cannot exceed its
  separate per-turn budget across reaction plus goal action.
- [ ] Atomically checkpoint, commit, and roll back hostility with the character transition.
- [ ] Run NPC/turn/persistence suites, all tests, typecheck, and commit the slice.

## Task 6: Stabilize Play scroll anchoring

**Primary files:**
- `packages/ui/src/screens/Play.tsx`
- `packages/ui/test/screens/Play.test.tsx`

- [ ] Add failing DOM-metric tests: initial load lands at latest; near-bottom streaming follows;
  reading older prose survives stream changes, drawer open/close, and layout growth; Jump to latest
  resumes follow mode.
- [ ] Track follow/latest intent synchronously in a ref rather than relying only on delayed React
  state from scroll events.
- [ ] Use layout-phase anchoring and a bottom sentinel or bounded resize observation so height
  changes cannot reset the reader to the transcript start.
- [ ] Preserve the user's exact viewport while they are reading history.
- [ ] Run Play tests, UI suite, typecheck, and commit the slice.

## Task 7: Put the latest chapter summary in the primary Overview pane

**Primary files:**
- `packages/ui/src/screens/Overview.tsx`
- `packages/ui/test/screens/Overview.test.tsx`

- [ ] Add failing tests for: no closed chapter, chapters without a closed arc, and a closed arc.
- [ ] With chapters but no arc, render the selected/latest chapter title and automatic summary in
  the large reading pane; show premise as compact persistent context.
- [ ] With a closed arc, keep the arc synthesis primary and the chapter timeline navigable.
- [ ] Avoid presenting an immutable premise under chapter/arc labels that imply generated history.
- [ ] Verify narrow and wide layouts preserve readable hierarchy and keyboard navigation.
- [ ] Run Overview tests, UI suite, typecheck, and commit the slice.

## Task 8: Final gate, baton, and one deferred package build

- [ ] Run `npm run typecheck` and `npm test`.
- [ ] Run configured core coverage and direct core/UI production builds.
- [ ] Run `cargo check`.
- [ ] Re-index codebase memory after structural source changes.
- [ ] Append exact evidence and known limitations to `docs/WORKLOG.md`.
- [ ] Update `Plan/next-phase-internal-beta.md`, overwrite `docs/HANDOFF.md`, and refresh
  `docs/NEXT-AGENT-PROMPT.md` with actual commits and one next action.
- [ ] Only now rebuild the unsigned package once, refresh artifact hashes, and hand it to the human
  for the affected acceptance steps.

## Completion definition

All seven packaged findings have regression tests and source fixes; the deterministic authority
rules above remain green; provider rate limits degrade gracefully without inventing mechanics; all
baton documents match HEAD; and only the final combined source state is packaged for the next human
acceptance pass.
