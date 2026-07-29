# HANDOFF - current live state

**Updated:** 2026-07-29
**Branch / runtime HEAD:** `main` at `75dfe6c` before the following docs commit; local, not pushed
**App version:** `0.2.8`, unsigned
**User-owned/untracked:** `.codex/`, `opencode.json` - preserve
**Active plan:** `Plan/next-phase-internal-beta.md`
**Detailed plan:** `docs/superpowers/plans/2026-07-29-internal-beta-completion.md`

## Fresh verification

- `npm run typecheck`: passed.
- `npm test`: core 528/42 files + UI 147/25 files = **675 tests**, passed.
- Direct UI production build and `cargo check`: passed.
- Known noise: seven React `act(...)` warnings, now the sole target of Task 14.
- No installer was produced. Do not run the root build/package flow until Task 15.

## What just landed - Task 13 (`3ebd58d` through `75dfe6c`)

The remaining product acceptance paths are now explicit and regression-tested:

- suggestions reject and repair text that names a registry character absent from the current scene;
- lorebook entry save failure is caught, displays recovery context, retains exact content/keywords,
  blocks duplicate requests while saving, and retries the same draft;
- existing lorebook tests prove shelf -> selected book -> child-entry loading;
- a two-character roster test proves dossier and equipment/loadout navigation use the clicked
  registry member rather than whichever card loaded first;
- rulebook regeneration failure leaves the sealed schema and unsaved settings visible, and retry
  receives the same duplicate/in-place mode plus the retained validated checkpoint;
- existing CharacterDossier coverage proves the selected dossier drills into that character's
  loadout.

The runtime fixes are `3ebd58d` (absent-character suggestion repair) and `e0f210d` (lorebook
draft-safe recovery). `6dab752` and `75dfe6c` harden already-correct navigation and regeneration
behavior with acceptance tests.

## Runtime foundation already complete

1. Tasks 1-2: authoritative registry/presence split, rollback pre-images, ruling-before-prose,
   quantifier phantom cleanup.
2. Tasks 3-4 (`350f805`): bounded NPC introduction/presence, actor normalization, legal two-action
   turns, default attack damage, health-threshold death, natural authority fallback.
3. Task 5 (`04e83b7`): validated same-turn goal-driven NPC actions under a separate budget.
4. Task 6 (`b753de3`): sealed non-combat provocation.
5. Tasks 7-8 (`fccab2c`, `09da205`): provider-to-Play streaming and verified mechanical beat release.
6. Tasks 9a-9b (`2b43325`, `a803f76`): bounded provider stages, deterministic fallbacks, durable
   latency/outcome metrics, and immediate cancellation.
7. Task 10 (`a2656e4`): responsive Gemini Flash narrator default with explicit fast/quality labels.
8. Task 11 (`80e3b44`): bounded, durable, resumable Forge.
9. Task 12 (`b348f83`): macro-safe card acceptance and source-authoritative starting gear.
10. Task 13 (`3ebd58d` through `75dfe6c`): grounded suggestions and product recovery/navigation
    acceptance.

## Non-negotiable product and authority rules

- Engine/DM owns gates, dice, effects, damage, death, budgets, loot, progression, and persistence.
- Models may propose identity/intent and write prose but may not mutate or contradict hard state.
- Every actual fictional NPC or creature must be registry-backed. Ambient scenery, murals, statues,
  background crowds, "Nothing," and "Something" are not characters.
- Registry membership and scene presence are separate. Only present, living actors participate.
- Rulings render before narrator streaming. Prose may dramatize but may not quote internal dice/DC
  boilerplate or assert death without an authoritative `causedDeathOf`.
- Two player actions remain legal when the configured player budget is two. NPC budget is separate.
- Do not add NPC encounter gating until an authoritative encounter-active fact exists.
- Preserved card/persona source is the authority for accepted identity/mechanics and attached-source
  starting possessions; model output cannot rename accepted concepts or add unverified inventory.

## Remaining ordered work

1. Task 14: eliminate all seven React `act(...)` warnings.
2. Task 15: full Internal Beta gate, packaged manual acceptance, then create the final installer.
3. Task 16 signing/updater/CSP remains later and out of scope.

## Single next action

Start detailed-plan **Task 14** test-first:

1. instrument the focused Play and Overview tests so any `console.error` containing the React
   `not wrapped in act(...)` warning fails the test;
2. reproduce the five `RulingBlock` timer warnings, one additional Play async warning, and one
   Overview mount-load warning independently;
3. fix test synchronization first by using fake timers/`act` for reveal timers and awaiting pending
   loads; modify runtime code only if a real lifecycle error is exposed;
4. run the complete UI suite with clean stderr, then full typecheck/tests and direct UI build;
5. commit coherently and update the plan, worklog, handoff, and next-agent prompt.

Do not build an installer yet. Task 15 owns the root build/package flow and packaged manual
acceptance.
