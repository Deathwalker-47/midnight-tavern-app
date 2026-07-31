# HANDOFF - current live state

**Updated:** 2026-07-31
**Branch / HEAD:** local `main` at source commit `2032832`; documentation closeout pending; not pushed
**App version:** `0.2.8`, unsigned
**User-owned/untracked:** `.codex/`, `opencode.json` - preserve
**Active plan:** `Plan/next-phase-internal-beta.md`, Task 15A
**Detailed plan:** `docs/superpowers/plans/2026-07-31-packaged-beta-remediation.md`

## Current outcome

Two of seven packaged-acceptance remediation slices are complete.

1. `fab2088` - a retained Forge now offers **Resume saved Forge** and **Start new Forge**. Fresh
   start waits for queued retained writes, clears exactly the retained operation id, and creates a
   new story/operation without a resume checkpoint.
2. `2032832` - character memory is registry-owned and character-specific. Every insertion receives
   a primary player or secondary NPC soft envelope; completed turns repair legacy present rows;
   analyzer ops are restricted to the supplied present registry cast; and dossiers no longer reuse
   global chapter/arc plot summaries.

The Character page now uses **Character history** from only that character's backstory,
observations, and authoritative actor/target events. Empty Mentality, Mood, Location, Goal, and
history states say **Not observed yet**. The in-memory and SQLite bridge paths preserve this meaning.

Do not start Task 16 and do not build an installer yet. Complete all remaining Task 15A slices,
run the combined gate, then package once.

## Verification

- Task 15A.2 RED cases reproduced null insertion, analyzer-created `ghost`, global dossier leakage,
  missing legacy-present analyzer input, and the old blank/shared UI.
- Focused core: **67 tests / 5 files**, passed.
- Focused UI: **2 tests / 1 file**, passed.
- Complete core: **550 tests / 43 files**, passed.
- Complete UI: **150 tests / 25 files**, passed.
- Root total after Task 15A.2: **700 tests**, passed.
- `npm run typecheck`: passed.
- Prior full release gate at `8ab7a68` remains historical only; its package predates Task 15A.

## Remaining packaged findings

1. **Attack continuation:** local universal-action recovery resolves an explicit name or a sole
   non-player only. “Attack it again” becomes ambiguous when an old NPC and the current creature are
   both present, even though the latest committed ruling identifies the active foe.
2. **Possible Moves:** exact structured provider output throws after bounded repair; packaged HTTP
   429 and malformed responses therefore disable the feature instead of using safe grounded moves.
3. **Hostile NPC agency:** deterministic reaction needs a resolved provocation, while goal planning
   returns no action on provider failure. No validated persisted hostility fact supports an
   engine-owned fallback attack.
4. **Scroll:** Play follow/latest intent relies chiefly on delayed React state and can lose the
   reader/latest anchor during DOM replacement or layout growth.
5. **Overview:** before an arc closes, live chapter summaries remain in the narrow timeline while
   the large pane falls back to the immutable premise.

## Non-negotiable authority rules

- Engine/DM owns gates, dice, effects, damage, death, budgets, target legality, persistence, and
  rollback. Models propose identity/intent and write prose only.
- Every actual fictional NPC/creature is registry-backed. Scenery, crowds, statues, murals,
  “Nothing,” and “Something” are not characters.
- Registry membership and scene presence are separate. Only present, living actors participate.
- Rulings render before narrator streaming. Prose cannot assert death without threshold-backed
  `causedDeathOf`.
- Two player strikes remain legal under the two-action player budget; NPC budget is separate.
- Target continuity may reuse only one unique recent present living target, never roster order.
- Provider degradation may reduce variety but cannot invent mechanics or silently disable safe
  affordances/proven hostile behavior.
- Browser/native bridge parity is mandatory; keep native dependencies out of the webview path.
- Preserve `.codex/` and `opencode.json`; do not push.

## Single next action

Implement detailed-plan Task 3 with TDD:

1. Add a RED turn/classifier reproduction with player + older NPC + current creature present, a
   newest committed allowed player attack against the creature, provider failure, and “attack it
   again.”
2. Derive one focus only from the newest committed player ruling/event whose target remains present
   and alive; pass that authoritative id into local classifier recovery.
3. Reuse focus only for pronoun/continuation wording when no explicit living name selects another
   target. Prove absent, dead, stale, ambiguous, and explicit-switch behavior.
4. Keep sealed action lookup, gates, effects, damage/death, and the two-action budget unchanged.
5. Run focused classifier/turn tests, all tests, typecheck, append WORKLOG, overwrite this handoff,
   refresh `docs/NEXT-AGENT-PROMPT.md`, and commit the slice.

Do not mix suggestions, hostility, scroll, Overview, or packaging into the target-continuity commit.
