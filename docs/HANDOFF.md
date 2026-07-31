# HANDOFF - current live state

**Updated:** 2026-07-31
**Branch / HEAD:** local `main` at source commit `3b0a05e`; documentation closeout pending; not pushed
**App version:** `0.2.8`, unsigned
**User-owned/untracked:** `.codex/`, `opencode.json` - preserve
**Active plan:** `Plan/next-phase-internal-beta.md`, Task 15A
**Detailed plan:** `docs/superpowers/plans/2026-07-31-packaged-beta-remediation.md`

## Current outcome

Three of seven packaged-acceptance remediation slices are complete.

1. `fab2088` - retained Forge offers **Resume saved Forge** and **Start new Forge**; fresh start
   awaits id-safe clearing before creating a new operation without a resume checkpoint.
2. `2032832` - every registry character owns a durable soft-memory envelope; analyzer updates are
   restricted to the present registry cast; Character history is character-specific and empty
   observed fields are labeled honestly.
3. `3b0a05e` - pronoun attack continuation uses at most one newest authoritative player-ruling
   target, only while it remains recent, present, non-player, and alive. Explicit names override;
   dead, absent, stale, unknown, or multi-target focus fails closed.

Do not start Task 16 and do not build an installer yet. Complete all Task 15A source slices, run the
combined release gate, then package once.

## Verification

- Task 15A.3 focused classifier/target-focus/turn suites: **80 tests / 3 files**, passed.
- Complete core: **558 tests / 44 files**, passed.
- Complete UI: **150 tests / 25 files**, passed.
- Root total after Task 15A.3: **708 tests**, passed.
- `npm run typecheck`: passed.
- `git diff --check`: passed before the source commit.
- Prior package/release evidence predates Task 15A and is historical only.

## Remaining packaged findings

1. **Possible Moves:** exact structured provider output throws after bounded repair; packaged HTTP
   429 and malformed responses disable suggestions instead of using safe grounded moves.
2. **Hostile NPC agency:** deterministic reaction needs a resolved provocation, while goal planning
   returns no action on provider failure. No validated persisted hostility fact supports an
   engine-owned fallback attack.
3. **Scroll:** Play follow/latest intent relies chiefly on delayed React state and can lose the
   reader/latest anchor during DOM replacement or layout growth.
4. **Overview:** before an arc closes, live chapter summaries remain in the narrow timeline while
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
- Provider degradation may reduce variety but cannot invent mechanics or silently disable safe
  affordances/proven hostile behavior.
- Browser/native bridge parity is mandatory; keep native dependencies out of the webview path.
- Preserve `.codex/` and `opencode.json`; do not push.

## Single next action

Implement detailed-plan Task 4 with TDD:

1. Add RED tests for provider error, malformed output after bounded repairs, caller abort, absent
   or dead characters, an empty sealed action catalog, and sparse committed scene context.
2. When safe context exists, return five unique deterministic fallback suggestions using only
   recent committed scene anchors, present living registry names, and legal sealed action labels.
3. Never invent items/skills, mention absent/dead characters, or pre-assert success. Caller abort
   must remain an abort.
4. Keep suggestions insert-only; sending one must still pass through normal classification, gates,
   rulings, effects, and action budgets.
5. Run focused suggestion/bridge/Play suites, all tests, and typecheck; then append WORKLOG,
   overwrite this handoff, refresh `docs/NEXT-AGENT-PROMPT.md`, and commit the slice.

Do not mix hostility, scroll, Overview, or packaging into the Possible Moves commit.
