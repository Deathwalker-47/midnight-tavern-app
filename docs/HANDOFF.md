# HANDOFF - current live state

**Updated:** 2026-07-29
**Branch / runtime HEAD:** `main` at `a803f76` before the following docs commit; local, not pushed
**App version:** `0.2.8`, unsigned
**User-owned/untracked:** `.codex/`, `opencode.json` - preserve
**Active plan:** `Plan/next-phase-internal-beta.md`
**Detailed plan:** `docs/superpowers/plans/2026-07-29-internal-beta-completion.md`

## Fresh verification

- `npm run typecheck`: passed.
- `npm test`: core 518/41 files + UI 140/25 files = **658 tests**, passed.
- Focused core/UI production builds and `cargo check`: passed.
- Known noise: seven existing React `act(...)` warnings.
- No installer was produced. A generic root build was stopped when it entered Tauri packaging; do not
  package again until the remaining Internal Beta work and Task 15 acceptance are complete.

## What just landed - Task 9b (`a803f76`)

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

## Remaining ordered work

1. Task 10: make responsive models the versioned defaults while retaining Opus-class quality
   choices.
2. Task 11: make Forge progress truthful, bounded, durable, resumable, and cancellable.
3. Tasks 12-13: card attributes/macros/starting gear and remaining UX acceptance.
4. Task 14: eliminate all seven React `act(...)` warnings.
5. Task 15: full Internal Beta gate, packaged manual acceptance, then create the final installer.
6. Task 16 signing/updater/CSP remains later and out of scope.

## Single next action

Start detailed-plan **Task 10** test-first. In
`packages/core/test/router/modelConfig.test.ts` and
`packages/ui/test/bridge/catalogParity.test.ts`, write failing expectations that the recommended
narrator default is a responsive model and that labels clearly distinguish speed from explicit
quality choices. Update only the versioned
`packages/core/src/config/model-recommendations.json`; keep Opus-class models available but not the
default. Run focused tests, full typecheck/tests, direct core/UI builds, and `cargo check`, then commit
`core(config): prefer responsive narrator defaults`.

Do not build an installer yet.
