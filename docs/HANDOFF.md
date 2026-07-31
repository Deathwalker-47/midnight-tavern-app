# HANDOFF - current live state

**Updated:** 2026-07-31
**Branch / HEAD:** local `main` at source commit `ad25b9c`; documentation closeout pending; not pushed
**App version:** `0.2.8`, unsigned
**User-owned/untracked:** `.codex/`, `opencode.json` - preserve
**Active plan:** `Plan/next-phase-internal-beta.md`, Task 15A
**Detailed plan:** `docs/superpowers/plans/2026-07-31-packaged-beta-remediation.md`

## Current outcome

Five of seven packaged-acceptance remediation slices are complete.

1. `fab2088` - retained Forge offers reliable resume and an awaited id-safe fresh start.
2. `2032832` - registry-owned soft memory and character-specific Character history.
3. `3b0a05e` - newest authoritative living/present target continuity for pronoun attacks.
4. `2c5c738` - rich scenes retain five safe deterministic Possible Moves during provider failure.
5. `ad25b9c` - explicit narrator-backed hostility persists in hard state and is rollback-safe. A
   present living hostile NPC that planning fails or leaves unplanned selects one gate-legal sealed
   damaging action through the ordinary resolver/ruling/state path. Neutral, ambiguous, absent,
   dead, and action-less cases fail closed; a prior reaction consumes the NPC's one turn action.

Do not start Task 16 and do not build an installer yet. Complete scroll and Overview, run the
combined release gate, then package once.

## Fresh verification

- Focused NPC introduction/agency/history: **56 tests / 3 files**, passed.
- Complete core: **578 tests / 44 files**, passed.
- Complete UI: **151 tests / 25 files**, passed.
- Root total after Task 15A.5: **729 tests**, passed.
- `npm run typecheck`: passed.
- `git diff --check`: passed.
- Prior package/release evidence predates Task 15A and is historical only.

## Remaining packaged findings

1. **Scroll:** Play follow/latest intent relies chiefly on delayed React state and can lose the
   reader/latest anchor during DOM replacement or layout growth.
2. **Overview:** before an arc closes, live chapter summaries remain in the narrow timeline while
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

Implement detailed-plan Task 6 with TDD in `packages/ui/src/screens/Play.tsx` and
`packages/ui/test/screens/Play.test.tsx`:

1. Add RED DOM-metric tests proving initial load lands at latest, near-bottom streaming follows,
   reading older prose survives streaming plus drawer/layout growth, and Jump to latest resumes.
2. Track follow-latest intent synchronously rather than depending on delayed React state.
3. Use layout-phase anchoring plus a bottom sentinel or bounded resize observation so content-height
   changes cannot reset the reader to the transcript start.
4. Preserve the exact historical viewport while follow mode is off; avoid fighting user scrolling.
5. Run focused Play tests, complete UI, root typecheck/all tests, append WORKLOG, overwrite this
   handoff, refresh `docs/NEXT-AGENT-PROMPT.md`, and commit the slice.

Do not mix Overview or packaging into the scroll commit.
