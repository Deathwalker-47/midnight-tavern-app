# HANDOFF - current live state

**Updated:** 2026-08-01
**Branch / source baseline:** local `main` at `bd968fb`; not pushed
**App version:** `0.2.8`, unsigned
**User-owned/untracked:** `.codex/`, `opencode.json` - preserve
**Active plan:** `Plan/next-phase-internal-beta.md`, Task 15B in progress
**Detailed plan:** `docs/superpowers/plans/2026-08-01-live-combat-remediation.md`

## Current outcome

Task 15A's seven packaged-acceptance fixes remain complete. The second installed pass reopened live
combat and rulebook breadth work as Task 15B. Its first slice is now complete:

- `bd968fb` guarantees a gate-legal, engine-owned natural attack for every full-stat creature.
- Universal action config v3 adds the `attack_natural` family with deterministic `-4/-8` default
  lethal-resource damage.
- `applyUniversalActionDefaults` adds `universal_natural_attack` only when an older/current story has
  no existing ungated natural-family action. The normalized runtime catalogue changes; the persisted
  frozen source is not mutated.
- A promoted creature with no skills and no inventory now counter-attacks through the ordinary gate,
  dice, ruling, mutation, and death-authority pipeline. Neutral, dead, absent, and action-ineligible
  NPCs still fail closed.
- Browser in-memory and packaged SQLite catalogues remain exactly in parity.

## Fresh verification

- Task-1 RED was observed independently at config and real-turn boundaries.
- Focused config / NPC agency / bootstrap / regeneration / bridge-parity suites passed.
- `npm run typecheck`: passed.
- Complete core: **580 tests / 44 files**, passed.
- Complete UI: **156 tests / 25 files**, passed.
- Root total: **736 tests**, passed.
- `git diff --check`: passed before the source commit.

## Expanded Task 15B queue

1. **DONE:** universal natural attack and compatibility for existing frozen stories.
2. **NEXT (P0):** assign emergent NPCs a bounded, story-grounded capability loadout at registry
   creation. The registrar may select at most three existing sealed skill ids; the engine filters,
   deduplicates, and grants novice rank. It may not author actions, ranks, effects, gear, attributes,
   or resource values. Template NPCs keep their authored loadouts.
3. Broaden the universal registry across all five categories (v2 had no crafting family), then forge
   six actions/category (30 total) and a premise-relevant 6-10 skill set.
4. Scale baseline damage / encounter HP into a meaningful range.
5. Retry transient provider failures and generate richer ruling-derived safe fallback prose.
6. Apply recent-target focus to degraded recovery and improve stale presence hygiene.

## Non-negotiable authority and domain rules

- One story owns one frozen executable action catalogue. NPCs do not own a second action catalogue;
  their skills, attributes, resources, and equipped items determine which story actions gate-pass.
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

Start Task 2 test-first. Add failing tests in `npcIntroduction.test.ts` showing that a grounded new
NPC proposal can carry up to three sealed `skillIds`, valid ids become novice learned skills during
generic instantiation, unknown/duplicate/excess ids cannot enter hard state, and template-backed NPCs
remain unchanged. Then include learned skills and gate-relevant state in the NPC planner prompt. Run
the full gate, commit the slice, and update this baton again before Task 3.
