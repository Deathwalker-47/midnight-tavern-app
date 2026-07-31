# HANDOFF - current live state

**Updated:** 2026-07-31
**Branch / HEAD:** local `main` at source commit `2c5c738`; documentation closeout pending; not pushed
**App version:** `0.2.8`, unsigned
**User-owned/untracked:** `.codex/`, `opencode.json` - preserve
**Active plan:** `Plan/next-phase-internal-beta.md`, Task 15A
**Detailed plan:** `docs/superpowers/plans/2026-07-31-packaged-beta-remediation.md`

## Current outcome

Four of seven packaged-acceptance remediation slices are complete.

1. `fab2088` - retained Forge offers reliable resume and an awaited id-safe fresh start.
2. `2032832` - registry-owned soft memory and character-specific Character history.
3. `3b0a05e` - newest authoritative living/present target continuity for pronoun attacks.
4. `2c5c738` - provider failure or exhausted suggestion repair now yields five deterministic choices
   from rich committed scene context. Names come only from living visible registry characters;
   mechanical options come only from non-combat gate-allowed sealed actions. Sparse context returns
   no fabricated choices and caller abort remains abort. Play keeps all choices insert-only.

Do not start Task 16 and do not build an installer yet. Complete all Task 15A source slices, run the
combined release gate, then package once.

## Verification

- Task 15A.4 focused core suggestions: **13 tests / 1 file**, passed.
- Focused Play plus both bridge suites: **38 tests / 3 files**, passed.
- Complete core: **564 tests / 44 files**, passed.
- Complete UI: **151 tests / 25 files**, passed.
- Root total after Task 15A.4: **715 tests**, passed.
- `npm run typecheck`: passed.
- `git diff --check`: passed before the source commit.
- Prior package/release evidence predates Task 15A and is historical only.

## Remaining packaged findings

1. **Hostile NPC agency:** deterministic reaction needs a resolved provocation, while goal planning
   returns no action on provider failure. No validated persisted hostility fact supports an
   engine-owned fallback attack.
2. **Scroll:** Play follow/latest intent relies chiefly on delayed React state and can lose the
   reader/latest anchor during DOM replacement or layout growth.
3. **Overview:** before an arc closes, live chapter summaries remain in the narrow timeline while
   the large pane falls back to the immutable premise.

## Non-negotiable authority rules

- Engine/DM owns gates, dice, effects, damage, death, budgets, target legality, persistence, and
  rollback. Models propose identity/intent and write prose only.
- Every actual fictional NPC/creature is registry-backed. Scenery, crowds, statues, murals,
  "Nothing," and "Something" are not characters.
- Registry membership and scene presence are separate. Only present, living actors participate.
- Rulings render before narrator streaming. Prose cannot assert death without threshold-backed
  `causedDeathOf`.
- Two player strikes remain legal under the two-action player budget; NPC budget is separate.
- Hostility must be explicit, validated, persisted, and rollback-safe; never infer it from mood,
  species, combat-capable actions, or prose tone.
- NPC fallbacks must use normal sealed action lookup, gates, resolver, ruling cards, state effects,
  and the shared NPC per-turn budget.
- Browser/native bridge parity is mandatory; keep native dependencies out of the webview path.
- Preserve `.codex/` and `opencode.json`; do not push.

## Single next action

Implement detailed-plan Task 5 with TDD:

1. Add RED tests for an explicitly hostile introduced NPC, planner provider failure, a legal sealed
   damaging action, and an independently resolved NPC attack against a present living player.
2. Extend the bounded NPC-introduction contract with a small disposition field; validate only an
   explicit hostile value and persist it in engine-owned hard state atomically with introduction.
3. On planner degradation, choose at most one legal damaging sealed action for each eligible hostile
   NPC and route it through the normal classifier-independent gate/resolver/ruling/state path.
4. Prove neutral, dead, absent, no-legal-action, target-dead, shared-budget, and rollback negatives.
   Reactions and goal actions must consume one combined NPC per-turn budget, never duplicate it.
5. Run focused introduction/agency/turn/checkpoint suites, all tests, and typecheck; then append
   WORKLOG, overwrite this handoff, refresh `docs/NEXT-AGENT-PROMPT.md`, and commit the slice.

Do not mix scroll, Overview, or packaging into the hostility/agency commit.
