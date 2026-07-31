# HANDOFF - current live state

**Updated:** 2026-07-31
**Branch / HEAD:** local `main` at source commit `a0b5a98`; documentation closeout pending; not pushed
**App version:** `0.2.8`, unsigned
**User-owned/untracked:** `.codex/`, `opencode.json` - preserve
**Active plan:** `Plan/next-phase-internal-beta.md`, Task 15A
**Detailed plan:** `docs/superpowers/plans/2026-07-31-packaged-beta-remediation.md`

## Current outcome

Six of seven packaged-acceptance remediation slices are complete.

1. `fab2088` - retained Forge offers reliable resume and an awaited id-safe fresh start.
2. `2032832` - registry-owned soft memory and character-specific Character history.
3. `3b0a05e` - newest authoritative living/present target continuity for pronoun attacks.
4. `2c5c738` - rich scenes retain five safe deterministic Possible Moves during provider failure.
5. `ad25b9c` - explicit narrator-backed hostility persists in hard state and is rollback-safe. A
   present living hostile NPC that planning fails or leaves unplanned selects one gate-legal sealed
   damaging action through the ordinary resolver/ruling/state path. Neutral, ambiguous, absent,
   dead, and action-less cases fail closed; a prior reaction consumes the NPC's one turn action.
6. `a0b5a98` - Play tracks follow-latest intent synchronously, anchors React changes before paint,
   and observes measured transcript growth. Initial/latest and near-bottom views follow; historical
   reading stays fixed through streaming, drawer reflow, and resize; Jump to latest resumes follow.

Do not start Task 16 and do not build an installer yet. Complete Overview, run the
combined release gate, then package once.

## Fresh verification

- Focused Play: **21 tests / 1 file**, passed.
- Complete core: **578 tests / 44 files**, passed.
- Complete UI: **154 tests / 25 files**, passed.
- Root total after Task 15A.6: **732 tests**, passed.
- `npm run typecheck`: passed.
- `git diff --check`: passed.
- Prior package/release evidence predates Task 15A and is historical only.

## Remaining packaged findings

1. **Overview:** before an arc closes, live chapter summaries remain in the narrow timeline while
   the large pane falls back to the immutable premise.

## Hostility semantics now locked

- The persisted fact is `hard.flags.npc_hostile_to_player`.
- Only committed narrator text can establish it, and only when one unambiguous present living
  registry actor explicitly attacks the player. Player text is never evidence.
- Reverse direction, negation, mood/species/appearance, and ambiguous shortened aliases fail closed.
- Planning can take precedence with one valid action. Failure, timeout, empty output, invalid output,
  or omission gives an eligible hostile actor one sealed damaging fallback.
- Reactions and planned/fallback actions share the one-action NPC turn budget.
- The checkpoint is captured before the disposition transition; rewind/delete restores the flag.

## Non-negotiable authority rules

- Engine/DM owns gates, dice, effects, damage, death, budgets, target legality, persistence, and
  rollback. Models propose identity/intent and write prose only.
- Every actual fictional NPC/creature is registry-backed. Scenery, crowds, statues, murals,
  "Nothing," and "Something" are not characters.
- Registry membership and scene presence are separate. Only present, living actors participate.
- Rulings render before narrator streaming. Prose cannot assert death without threshold-backed
  `causedDeathOf`.
- Two player strikes remain legal under the two-action player budget; NPC budget is separate.
- Browser/native bridge parity is mandatory; keep native dependencies out of the webview path.
- Preserve `.codex/` and `opencode.json`; do not push.

## Single next action

Implement detailed-plan Task 7 with TDD in `packages/ui/src/screens/Overview.tsx` and
`packages/ui/test/screens/Overview.test.tsx`:

1. Add RED tests for no chapter, chapters without an arc, chapter selection, and a closed arc.
2. With chapters but no arc, make the selected/latest automatic chapter title and summary primary.
3. Retain the immutable premise as compact supporting context, clearly labeled as premise.
4. With a closed arc, keep the arc synthesis primary and the chapter timeline navigable.
5. Verify keyboard selection plus narrow/wide semantic hierarchy.
6. Run focused Overview tests, complete UI, root typecheck/all tests, append WORKLOG, overwrite this
   handoff, refresh `docs/NEXT-AGENT-PROMPT.md`, and commit the slice.

Do not mix packaging into the Overview commit.
