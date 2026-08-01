# HANDOFF - current live state

**Updated:** 2026-08-01
**Branch / source baseline:** local `main` at `41c5963`; not pushed
**App version:** `0.2.8`, unsigned
**User-owned/untracked:** `.codex/`, `opencode.json` - preserve
**Active plan:** `Plan/next-phase-internal-beta.md`, Task 15B in progress
**Detailed plan:** `docs/superpowers/plans/2026-08-01-live-combat-remediation.md`

## Current outcome

Task 15A's seven packaged-acceptance fixes remain complete. Task 15B now has two green slices:

- `bd968fb` guarantees an engine-owned, gate-legal natural attack in every full-stat story,
  including runtime compatibility for older frozen catalogues.
- `41c5963` gives newly grounded emergent NPCs a bounded capability loadout selected only from
  sealed story skill ids. Known unique ids become novice skills; unknown ids cannot enter state.
- Template NPCs keep their forge-authored mechanics. Existing-character presence transitions cannot
  rewrite hard state.
- The registrar sees sealed skill metadata and the reaction planner sees gate-relevant character
  state, while the engine remains the final action/gate authority.
- `CONTEXT.md` records the shared action/catalogue/loadout language and invariants.

## Fresh verification

- Task-2 RED was observed in four focused assertions before implementation.
- Focused NPC introduction and NPC agency suites passed.
- `npm run typecheck`: passed.
- Complete core: **585 tests / 44 files**, passed.
- Complete UI: **156 tests / 25 files**, passed.
- Root total: **741 tests**, passed.
- `git diff --check`: passed before the source commit.

## Expanded Task 15B queue

1. **DONE:** universal natural attack and compatibility for existing frozen stories.
2. **DONE:** bounded story-grounded emergent-NPC skill loadouts plus planner capability context.
3. **NEXT (P1):** broaden the universal registry across all five categories, then forge six
   actions/category (30 total) and a premise-relevant, validated 6-10 skill set. Verify semantic
   family/category consistency and provider token/deadline/checkpoint viability.
4. Scale baseline damage / encounter HP into a meaningful range.
5. Retry transient provider failures and generate richer ruling-derived safe fallback prose.
6. Apply recent-target focus to degraded recovery and improve stale presence hygiene.

## Non-negotiable authority and domain rules

- One story owns one frozen executable action catalogue. NPCs do not own a second action catalogue;
  their capability loadout determines which story actions gate-pass.
- Models may select sealed ids and prose; the engine owns gates, dice, effects, damage, death,
  budgets, target legality, persistence, rollback, loot, and progression.
- Every actual fictional NPC/creature is registry-backed. Scenery, crowds, statues, murals,
  `Nothing`, and vague `Something` are not characters.
- Registry membership and scene presence differ. Only present, living actors participate.
- Rulings render before narrator streaming. Prose cannot assert death without threshold-backed
  `causedDeathOf`.
- Two player strikes remain legal under the two-action player budget; NPC budget is separate.
- Browser/native bridge parity is mandatory; keep native dependencies out of the browser path.
- Preserve `.codex/` and `opencode.json`; do not push.
- Do not build another installer until the human asks.

## Single next action

Start Task 3 test-first. Add RED coverage proving the universal registry has balanced families in
every category including crafting; a forge produces exactly six actions/category (30 total),
contains a usable natural attack, validates family/category consistency, and produces 6-10 distinct
premise-grounded skills. Then implement registry v4, generation/validation limits, provider budgets,
and checkpoint-safe behavior; run the full gate and update this baton before Task 4.
