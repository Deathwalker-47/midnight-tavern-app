# HANDOFF - current live state

**Updated:** 2026-08-01
**Branch / source baseline:** Task 15B source at `5f4e85d`; this handoff/docs-only closeout follows; not pushed
**App version:** `0.2.8`, unsigned
**User-owned/untracked:** `.codex/`, `opencode.json` - preserve
**Active plan:** `Plan/next-phase-internal-beta.md`; Task 15B automated/source work complete
**Detailed plan:** `docs/superpowers/plans/2026-08-01-live-combat-remediation.md`

## Current outcome

Task 15A's seven packaged-acceptance fixes remain complete. All six Task 15B source slices are now
implemented, tested, and committed:

- `bd968fb`: gate-legal natural attack for every full-stat story, including old frozen catalogues.
- `41c5963`: bounded sealed-skill capability loadouts for newly grounded emergent NPCs.
- `e3a4801`: balanced universal registry v4 and premise-grounded 30-action / 6-10-skill forges.
- `e43ae50`: authoritative attribute/item damage scaling and six-hit generic encounter pacing.
- `e7548ab`: bounded transient provider retries and actor/action/outcome safe fallback prose.
- `5f4e85d`: classifier-stage timeout recovery through the unique recent living target, plus narrow
  explicit-evidence scene-presence retirement.

The final slice reuses the same sealed local recovery for outer classifier timeouts instead of
falling directly to narration-only. It still fails closed without a unique recent present living
target, and an explicit named target continues to win. Existing NPCs may leave without being named
only when the registrar quotes an exact committed sentence such as "You are alone now" or "No one
else remains." Omission, player-only claims, and dramatic uses of "alone" do not retire anyone.
Presence transitions stay staged and commit atomically with the narrator message/rulings; a cancelled
turn leaves prior presence untouched. Registry records are never deleted.

## Fresh verification

- Task-6 RED was observed for classifier timeout recovery and exact committed roster evidence; a
  separate RED edge case rejected dramatic "alone" phrasing.
- Focused classifier/turn/NPC-introduction gate: **101 tests / 3 files**, passed.
- `npm run typecheck`: passed.
- Complete core: **601 tests / 45 files**, passed.
- Complete UI: **156 tests / 25 files**, passed.
- Root total: **757 tests**, passed.
- Final `npm run build`: passed, including core, UI/Vite, optimized Rust release, MSI, and NSIS.
- `git diff --check`: passed before the Task-6 source commit.

## Test installers

- Preferred NSIS installer:
  `packages/shell/src-tauri/target/release/bundle/nsis/Midnight Tavern_0.2.8_x64-setup.exe`
  - bytes: `5620099`
  - SHA-256: `467262CF7144E53560A88351142CA113E053C31339489994489104329D7B5E3B`
- MSI alternative:
  `packages/shell/src-tauri/target/release/bundle/msi/Midnight Tavern_0.2.8_x64_en-US.msi`
  - bytes: `9265152`
  - SHA-256: `9A5E0834616DE18A8F4A05FEFFEEC25EF5A5FB3DC3BB03782D14BABFAAE6E145`
- Both report `NotSigned`, which is expected until the later signing/release phase.

## Non-negotiable authority and domain rules

- One story owns one frozen executable action catalogue. NPCs receive capability loadouts, not a
  second model-authored action list.
- Models may select sealed ids and prose; the engine owns gates, dice, effects, damage, death,
  budgets, target legality, persistence, rollback, loot, and progression.
- Every actual fictional NPC/creature is registry-backed. Scenery, crowds, statues, murals,
  `Nothing`, and vague `Something` are not characters.
- Registry membership and scene presence differ. Only present, living actors participate.
- Rulings render before narrator streaming. Prose cannot assert death without threshold-backed
  `causedDeathOf`. Player and NPC action budgets remain separate.
- Browser/native bridge parity is mandatory. Preserve `.codex/` and `opencode.json`; do not push.

## Single next action

Wait for the human's provider-backed packaged acceptance results. They should create/import a fresh
story and specifically verify: varied 30-action/6-10-skill rulebook; every encountered creature in
the registry; hostile creature counter-attack with visible ruling and meaningful damage; two legal
player strikes; death only at lethal threshold; readable fallback during provider degradation;
"attack it again" continuity with another old NPC present; stale actors leaving only when the scene
explicitly establishes absence; Possible Moves; Forge cancel/fresh restart; dossier mentality/current
fields; Overview hierarchy; and stable follow-latest scrolling. Record any observed regressions as a
new prioritized plan before changing source. Do not claim manual acceptance until the human reports it.
