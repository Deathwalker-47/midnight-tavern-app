# HANDOFF - current live state

**Updated:** 2026-07-29
**Branch / runtime HEAD:** `main` at `f1d8a4a` before the following docs commit; local, not pushed
**App version:** `0.2.8`, unsigned
**User-owned/untracked:** `.codex/`, `opencode.json` - preserve
**Active plan:** `Plan/next-phase-internal-beta.md`
**Detailed plan:** `docs/superpowers/plans/2026-07-29-internal-beta-completion.md`

## Fresh verification

- `npm run typecheck`: passed.
- `npm test`: core 528/42 files + UI 147/25 files = **675 tests**, passed.
- Direct UI production build and `cargo check`: passed.
- UI suite stderr is clean; the old seven React `act(...)` warnings are eliminated and guarded.
- No installer was produced. Do not run the root build/package flow until Task 15.

## What just landed - Task 14 (`f1d8a4a`)

The UI suite no longer leaks React updates beyond the owning test:

- Play unmounts explicitly before shared bridge/store/route teardown;
- subscribed route reset runs inside React `act`;
- ruling count-up/reveal work is cancelled during cleanup instead of updating after the test;
- Overview awaits its pending mount work inside `act`;
- both suites fail if `not wrapped in act(...)` ever returns;
- the complete 147-test UI suite emits no warning stderr.

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
11. Task 14 (`f1d8a4a`): warning-free, warning-guarded React test lifecycle.

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

1. Task 15: full Internal Beta gate, packaged manual acceptance, then create the final installer.
2. Task 16 signing/updater/CSP remains later and out of scope.

## Single next action

Start detailed-plan **Task 15**:

1. run typecheck, all tests, coverage, direct core/UI production builds, and `cargo check`
   independently, recording counts/durations/warnings;
2. run the root packaging flow and capture exact NSIS/MSI artifact paths plus SHA-256;
3. execute as much packaged manual acceptance as the local harness supports: create/import, play,
   close/reopen/continue, NPC registry/presence/agency, ruling-before-prose, safe streaming, Forge,
   suggestions, macros, and cross-card starting gear;
4. do not check an exit criterion without direct evidence; document any genuinely manual-only
   residual step rather than guessing;
5. update every handoff and produce the final installer location/hash when the gate is green.

Do not start Task 16 signing/updater/CSP.
