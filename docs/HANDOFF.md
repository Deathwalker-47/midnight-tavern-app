# HANDOFF - current live state

**Updated:** 2026-07-29
**Branch / runtime HEAD:** `main` at `80e3b44` before the following docs commit; local, not pushed
**App version:** `0.2.8`, unsigned
**User-owned/untracked:** `.codex/`, `opencode.json` - preserve
**Active plan:** `Plan/next-phase-internal-beta.md`
**Detailed plan:** `docs/superpowers/plans/2026-07-29-internal-beta-completion.md`

## Fresh verification

- `npm run typecheck`: passed.
- `npm test`: core 524/41 files + UI 144/25 files = **668 tests**, passed.
- Direct core/UI production builds and `cargo check`: passed.
- Known noise: seven existing React `act(...)` warnings, reserved for Task 14.
- No installer was produced. Do not run the root build/package flow until Task 15.

## What just landed - Task 11 (`80e3b44`)

Forge is now bounded and recoverable rather than an unbounded screen-local request:

- bootstrap structured output uses one model repair by default and one cross-schema repair pass;
- each provider-backed fragment has a 45-second deadline, truthful attempt/detail/elapsed/duration
  progress, and a named `BootstrapTimeoutError`;
- caller cancellation wins immediately and remains distinct from timeout even if the provider
  ignores its aborted signal;
- validated mechanics, actor-foundation, and action-batch fragments checkpoint independently;
- the bridge persists a versioned Forge operation in native SQLite settings and mirrors it through
  browser local storage;
- checkpoint writes are serialized, clears are operation-ID guarded, and a stale retained operation
  is ignored/cleaned if its story already installed;
- Wizard and Story Blueprint creation restore the exact retained request, expose the last real
  event, and offer explicit resume or discard/edit controls after navigation or restart;
- failed full-stat replacement generation leaves the installed story schema and rulebook version
  unchanged.

Focused RED evidence covered the former three-repair default, absent deadline scheduler,
provider-ignored cancellation, missing bridge persistence, and both screens failing to rehydrate.
Native save/reload/ID-safe-clear behavior and browser restart restoration are directly tested.

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

## Remaining ordered work

1. Task 12: lock card attributes, macro identity, and explicitly carried starting gear with three
   literal cross-card fixtures.
2. Task 13: remaining product/UX acceptance and bridge parity.
3. Task 14: eliminate all seven React `act(...)` warnings.
4. Task 15: full Internal Beta gate, packaged manual acceptance, then create the final installer.
5. Task 16 signing/updater/CSP remains later and out of scope.

## Single next action

Start detailed-plan **Task 12** test-first. Add three literal card/persona fixtures with explicit
attribute concepts/names, named carried possessions, and `{{user}}` / `{{char}}` macros. Run the
current bootstrap/macro path and record any substitutions, dropped identity, or missing carried
gear. Preserve explicit concepts and names; instantiate only possessions the card/persona actually
says the protagonist carries. Then run bootstrap, macro, equipment, and cross-card suites, full
typecheck/tests, direct core/UI builds, and `cargo check`; commit
`core(bootstrap): preserve card identity and starting gear`.

Update the detailed plan, WORKLOG, this handoff, and `docs/NEXT-AGENT-PROMPT.md` before moving to
Task 13. Do not build an installer yet.
