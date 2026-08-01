# HANDOFF - current live state

**Updated:** 2026-08-01
**Branch / source baseline:** local `main` at `e7548ab`; not pushed
**App version:** `0.2.8`, unsigned
**User-owned/untracked:** `.codex/`, `opencode.json` - preserve
**Active plan:** `Plan/next-phase-internal-beta.md`, Task 15B in progress
**Detailed plan:** `docs/superpowers/plans/2026-08-01-live-combat-remediation.md`

## Current outcome

Task 15A's seven packaged-acceptance fixes remain complete. Task 15B now has five green slices:

- `bd968fb` guarantees an engine-owned, gate-legal natural attack in every full-stat story,
  including runtime compatibility for older frozen catalogues.
- `41c5963` gives newly grounded emergent NPCs a bounded capability loadout selected only from
  sealed story skill ids. Known unique ids become novice skills; unknown ids cannot enter state.
- `e3a4801` expands the shared universal registry to v4 and makes the forge produce a validated,
  premise-grounded rulebook of 30 actions and 6-10 skills.
- `e43ae50` scales combat damage from authoritative attributes/equipment and gives generic encounters
  a six-hit pacing floor, including already-persisted fallback creatures.
- `e7548ab` retries transient provider/network failures inside one bounded request window and replaces
  vague safe narration with actor/action/outcome prose derived from immutable rulings.
- Provider attempts are capped at three. Retryable HTTP statuses are 408, 409, 425, 429, and 5xx;
  authentication, cancellation, malformed responses, and other permanent failures are not retried.
- Numeric/date `Retry-After` is honored but capped at two seconds. A broken narrator stream retries
  only before its first visible delta, preventing duplicate prose.
- Safe fallback includes a benign sealed narration hint only when it contains no mechanical claim or
  deterministic contradiction. Damage, loot, and death cannot leak from an unsafe hint.
- Template NPCs keep their forge-authored mechanics. Existing-character presence transitions cannot
  rewrite hard state. The engine remains the final action/gate/death authority.
- The browser bridge consumes the same universal registry JSON as core instead of a copied list.

## Fresh verification

- Task-5 RED was observed in three focused assertions before implementation.
- Focused router/authority guard: **28 tests**, passed.
- `npm run typecheck`: passed.
- Complete core: **596 tests / 45 files**, passed.
- Complete UI: **156 tests / 25 files**, passed.
- Root total: **752 tests**, passed.
- `npm run build` passed, but this root command also includes `tauri build` and refreshed local
  MSI/NSIS bundles. These are not acceptance artifacts and must not be rebuilt or handed off until
  the human asks. Use direct core/UI builds for interim source slices.
- Core Vitest intentionally runs one worker after repeated Windows/Node v24 worker `EPIPE` exits.
- `git diff --check`: passed before the source commit.

## Expanded Task 15B queue

1. **DONE:** universal natural attack and compatibility for existing frozen stories.
2. **DONE:** bounded story-grounded emergent-NPC skill loadouts plus planner capability context.
3. **DONE:** balanced v4 universal registry plus validated 30-action / 6-10-skill story rulebooks.
4. **DONE:** meaningful deterministic damage scaling and generic encounter-health pacing.
5. **DONE:** bounded transient provider retries and richer authority-safe fallback prose.
6. **NEXT (P2):** apply recent-target focus to degraded recovery and retire stale scene presence.

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

Start Task 6 test-first. Reproduce a classifier/provider failure for "attack it again" with two
present NPCs and prove deterministic recovery chooses the unique recent living player target. Then
retire stale scene presence only from explicit scene evidence; never infer absence merely because a
character was not named in one narrator turn. Preserve fail-closed ambiguity, registry history, and
atomic turn commits. Run focused tests, typecheck, and the complete suites, then update every baton.
