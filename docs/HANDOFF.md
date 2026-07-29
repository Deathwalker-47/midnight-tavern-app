# HANDOFF - current live state

**Updated:** 2026-07-29
**Branch / runtime HEAD:** `main` at `a2656e4` before the following docs commit; local, not pushed
**App version:** `0.2.8`, unsigned
**User-owned/untracked:** `.codex/`, `opencode.json` - preserve
**Active plan:** `Plan/next-phase-internal-beta.md`
**Detailed plan:** `docs/superpowers/plans/2026-07-29-internal-beta-completion.md`

## Fresh verification

- `npm run typecheck`: passed.
- `npm test`: core 519/41 files + UI 141/25 files = **660 tests**, passed.
- Focused core/UI production builds and `cargo check`: passed.
- Known noise: seven existing React `act(...)` warnings.
- No installer was produced. A generic root build was stopped when it entered Tauri packaging; do not
  package again until the remaining Internal Beta work and Task 15 acceptance are complete.

## What just landed - Task 10 (`a2656e4`)

Recommendation config v2 makes `google/gemini-2.0-flash-001` the shipped narrator default and labels
it `Gemini 2.0 Flash · Fast`. `anthropic/claude-opus-4` remains available as the visible
`Claude Opus 4 · Quality` choice; Sonnet and other curated models remain selectable.

This is a versioned catalog/default change, not UI-only routing. Core, the browser-safe bridge
mirror, Role Matrix reset behavior, and catalog parity tests move together. New setups and explicit
reset-to-recommended use the responsive narrator. Existing custom bindings remain untouched.

## Task 9b runtime foundation (`a803f76`)

All five provider-backed turn stages are now bounded by `runStage`:

- classifier: 30 s default, narration-only deterministic recovery;
- NPC introduction: 20 s, no roster transitions;
- NPC planner: 20 s, no NPC action;
- narrator: 60 s, authority-safe deterministic prose;
- authority audit: 30 s, fail-closed deterministic prose.

`SubmitTurnOptions.stagePolicy` exposes injectable deadlines, clock, and scheduler for deterministic
tests. `generateGuardedNarration` uses the same policy for narrator and audit calls. Provider errors
and timeouts no longer strand a turn; genuine caller cancellation still propagates and now wins
immediately even when provider code ignores its abort signal.

Migration 14 adds `turn_operations.stage_metrics_json`. Each operation persists ordered
`StageMetric[]` records (`stage`, `startedAt`, `durationMs`, `outcome`). Restart inspection retains
them; retry atomically clears old attempt metrics before recording the new attempt. The native UI
bridge exposes `onStageMetric` for both submit and retry.

Fake-clock and boundary tests cover classifier/introduction/narrator/audit hangs, stage abort,
authority-safe fallback, exactly one completed exchange, restart persistence, retry clearing, and
bridge forwarding.

Important semantic correction: an ordinary narrator/provider failure now completes through safe
fallback prose. Because the turn completed authoritatively, any previously approved atomic NPC
transition commits with it. Genuine cancellation or a failed operation still leaves no partial
exchange or registry mutation.

## Planner cost decision

Task 9 considered gating goal-driven NPC planning to an "active encounter." It remains deliberately
ungated because the engine currently has no authoritative encounter-active fact. Gating on combat
rulings would incorrectly suppress Task 5's accepted non-combat aid, conversation, and
exploit-opening behavior. The request is bounded and measured for now. Add gating only after a
sealed encounter-state model exists.

## Non-negotiable product and authority rules

- Engine/DM owns gates, dice, effects, damage, death, budgets, loot, progression, and persistence.
- Models may propose identity/intent and write prose but may not mutate or contradict hard state.
- Every actual fictional NPC or creature must be registry-backed. Ambient scenery, murals, statues,
  background crowds, "Nothing," and "Something" are not characters.
- Registry membership and scene presence are separate. Only present, living actors participate.
- Rulings render before narrator streaming. Prose may dramatize but may not quote internal dice/DC
  boilerplate or assert death without an authoritative `causedDeathOf`.
- Two player actions remain legal when the configured player budget is two. NPC budget is separate.

## Completed runtime sequence

1. Tasks 1-2: authoritative presence, rollback pre-images, ruling-before-prose, quantifier phantom
   cleanup.
2. Tasks 3-4 (`350f805`): engine-validated NPC introduction/presence, actor normalization, default
   attack damage, health-threshold death, natural authority fallback.
3. Task 5 (`04e83b7`): bounded validated goal-driven NPC actions.
4. Task 6 (`b753de3`): sealed non-combat provocation.
5. Task 7 (`fccab2c`): provider-to-Play temporal streaming proof.
6. Task 8 (`09da205`): verified mechanical beat release.
7. Task 9a (`2b43325`): reusable stage deadline policy and bounded NPC planner.
8. Task 9b (`a803f76`): remaining stages, persisted metrics, restart/retry/cancel coverage.
9. Task 10 (`a2656e4`): responsive narrator default with explicit fast/quality labels.

## Remaining ordered work

1. Task 11: make Forge progress truthful, bounded, durable, resumable, and cancellable.
2. Tasks 12-13: card attributes/macros/starting gear and remaining UX acceptance.
3. Task 14: eliminate all seven React `act(...)` warnings.
4. Task 15: full Internal Beta gate, packaged manual acceptance, then create the final installer.
5. Task 16 signing/updater/CSP remains later and out of scope.

## Single next action

Start detailed-plan **Task 11** test-first. Trace the existing bootstrap/generation persistence and
bridge flows with codebase-memory-mcp. Add failing tests for truthful per-stage timing/progress, one
bounded repair, timeout fallback, cancellation, restart/resume, and navigation away/re-entry. Persist
a Forge operation with explicit stage/progress/detail/timing and preserve the prior story/rulebook
until the replacement validates and commits completely. Keep native/browser bridge parity. Run
focused tests, full typecheck/tests, direct core/UI builds, and `cargo check`, then commit
`core(bootstrap): make forge bounded and resumable`.

Do not build an installer yet.
