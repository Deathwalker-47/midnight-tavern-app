# HANDOFF - current live state

**Updated:** 2026-08-01
**Branch / source baseline:** local `main` at `e3a4801`; not pushed
**App version:** `0.2.8`, unsigned
**User-owned/untracked:** `.codex/`, `opencode.json` - preserve
**Active plan:** `Plan/next-phase-internal-beta.md`, Task 15B in progress
**Detailed plan:** `docs/superpowers/plans/2026-08-01-live-combat-remediation.md`

## Current outcome

Task 15A's seven packaged-acceptance fixes remain complete. Task 15B now has three green slices:

- `bd968fb` guarantees an engine-owned, gate-legal natural attack in every full-stat story,
  including runtime compatibility for older frozen catalogues.
- `41c5963` gives newly grounded emergent NPCs a bounded capability loadout selected only from
  sealed story skill ids. Known unique ids become novice skills; unknown ids cannot enter state.
- `e3a4801` expands the shared universal registry to v4 and makes the forge produce a validated,
  premise-grounded rulebook of 30 actions and 6-10 skills.
- Template NPCs keep their forge-authored mechanics. Existing-character presence transitions cannot
  rewrite hard state.
- The registrar sees sealed skill metadata and the reaction planner sees gate-relevant character
  state, while the engine remains the final action/gate authority.
- `CONTEXT.md` records the shared action/catalogue/loadout language and invariants.
- Every action category has at least six universal families; forged catalogues contain exactly six
  actions/category and at least four distinct families/category. The natural attack stays ungated.
- The browser bridge consumes the same universal registry JSON as core instead of a copied list.

## Fresh verification

- Task-3 RED was observed in five focused assertions before implementation.
- `npm run typecheck`: passed.
- Complete core: **588 tests / 44 files**, passed.
- Complete UI: **156 tests / 25 files**, passed.
- Root total: **744 tests**, passed.
- Direct core and UI production builds passed; no Tauri package or installer was built.
- Core Vitest is intentionally single-worker after repeated Windows/Node v24 worker `EPIPE` exits;
  ordinary `npm test` is stable with that setting.
- `git diff --check`: passed before the source commit.

## Expanded Task 15B queue

1. **DONE:** universal natural attack and compatibility for existing frozen stories.
2. **DONE:** bounded story-grounded emergent-NPC skill loadouts plus planner capability context.
3. **DONE:** balanced v4 universal registry plus validated 30-action / 6-10-skill story rulebooks.
4. **NEXT (P1):** scale baseline damage / encounter HP into a meaningful deterministic range.
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

Start Task 4 test-first. Add RED coverage proving a successful implicit melee strike scales from the
actor's authoritative governing attribute and applicable equipped weapon data instead of always
dealing flat `-4`, while remaining deterministic and bounded. Audit generated NPC/encounter health
against the new range. Preserve the existing threshold-only death transition and narrator authority
guard, then run the full gate and update this baton before Task 5.
