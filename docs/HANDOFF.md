# HANDOFF - current live state

**Updated:** 2026-07-31
**Branch / source baseline:** local `main` at `f6c526b` plus this documentation closeout; not pushed
**App version:** `0.2.8`, unsigned
**User-owned/untracked:** `.codex/`, `opencode.json` - preserve
**Active plan:** `Plan/next-phase-internal-beta.md`, Task 15A complete
**Detailed plan (complete):** `docs/superpowers/plans/2026-07-31-packaged-beta-remediation.md`
**Detailed plan (NEW, IN PROGRESS — diagnosis done, code not started):**
`docs/superpowers/plans/2026-08-01-live-combat-remediation.md` — 4 defects from the 2nd packaged pass.

## Current outcome

All seven source findings from the first provider-backed packaged acceptance pass are fixed and
regression-covered:

1. `fab2088` - retained Forge offers explicit reliable resume and an awaited id-safe fresh start.
2. `2032832` - every registry character owns a soft envelope; Character history is selected-
   character evidence, with honest unobserved Mood, Location, Goal, and Mentality states.
3. `3b0a05e` - continuation attacks may reuse only the newest unique authoritative target that is
   still present and alive; explicit names win and ambiguity fails closed.
4. `2c5c738` - rich scenes retain five safe deterministic Possible Moves during provider failure;
   sparse context and cancellation remain honest and safe.
5. `ad25b9c` - explicit narrator-backed hostility is persisted and rollback-safe; an eligible
   hostile NPC receives one legal sealed damaging fallback through normal rulings when planning
   fails or omits it.
6. `a0b5a98` - Play follow-latest intent is synchronous and resize-aware; historical reading stays
   fixed through streaming, drawer reflow, and measured growth.
7. `f6c526b` - latest/selected chapter history owns the primary Overview pane until a persisted arc
   exists. Arc synthesis is primary by default afterward, chapters remain keyboard-navigable, and
   the immutable premise is compact, separately labeled context.

No further source defect from this seven-item batch is known. Do not start Task 16 unless the human
explicitly expands scope.

## Fresh combined verification

- Focused Overview: **5 tests / 1 file**, passed.
- Complete core: **578 tests / 44 files**, passed.
- Complete UI: **156 tests / 25 files**, passed with the React warning guard clean.
- Root total: **734 tests**, passed.
- `npm run typecheck`: passed.
- Configured core coverage: **100% statements / branches / functions / lines**.
- Core/UI production build and Tauri release/package build: passed.
- `cargo check`: passed.
- Codebase-memory re-index: **6,207 nodes / 15,714 edges**.
- Isolated release startup smoke: alive after eight seconds; only the smoke PID was stopped.
- `git diff --check`: passed before source commit; rerun after documentation closeout.

## Fresh unsigned v0.2.8 artifacts

- NSIS (recommended human test installer):
  `packages/shell/src-tauri/target/release/bundle/nsis/Midnight Tavern_0.2.8_x64-setup.exe`
  - 5,619,121 bytes
  - SHA-256 `AC06D7ED7678A8F4BABBED7DA9F758917D3C699516C7E3E757A7BA4FEFC5B349`
- MSI:
  `packages/shell/src-tauri/target/release/bundle/msi/Midnight Tavern_0.2.8_x64_en-US.msi`
  - 9,261,056 bytes
  - SHA-256 `AAC815ADF63B33867022640C020A97BB2151B4BE58E5C66A904CF7C4A3C266BF`
- Release executable:
  `packages/shell/src-tauri/target/release/midnight-tavern.exe`
  - 22,795,264 bytes
  - SHA-256 `E557CBBDE60EEB6BC5BD5D1083D78900F7B99061280A51571A64E386505DF866`

## Non-negotiable authority rules

- Engine/DM owns gates, dice, effects, damage, death, budgets, target legality, persistence, and
  rollback. Models propose identity/intent and write prose only.
- Every actual fictional NPC/creature is registry-backed. Scenery, crowds, statues, murals,
  "Nothing," and "Something" are not characters.
- Registry membership and scene presence are separate. Only present, living actors participate.
- Rulings render before narrator streaming. Prose cannot assert death without threshold-backed
  `causedDeathOf`.
- Two player strikes remain legal under the two-action player budget; NPC budget is separate.
- Provider degradation may reduce variety, but cannot invent mechanics or disable safe deterministic
  affordances and established hostile behavior.
- Browser/native bridge parity is mandatory; keep native dependencies out of the webview path.
- Preserve `.codex/` and `opencode.json`; do not push.

## Known limitation / acceptance boundary

The packaged provider returned HTTP 429 during the first human pass. That is external degradation,
not evidence of a local crash, and the app must continue to report it honestly. Automated checks
prove deterministic fallback paths, persistence contracts, and packaged startup, but they cannot
replace the human's visual/provider-backed journey or validate the user's credentials.

## Single next action (2026-08-01 — supersedes the installer step below)

A second provider-backed packaged pass surfaced four defects. Diagnosis is done and recorded in
`docs/superpowers/plans/2026-08-01-live-combat-remediation.md`. **Start at that plan's Task 1, Step 1**
(a failing test reproducing "the shadow entity never attacks back"). Verified root cause: generic
creatures (`bootstrap/instantiate.ts::instantiateGeneric`) have `skills:[]`/`inventory:[]`, so they
cannot gate-pass a skill/weapon-gated attack, so `npcAgency.ts::chooseCounterAction` finds no legal
counter. Fix = a config-owned universal natural attack (no skill/weapon requirement, implicit damage).
Then Tasks 2 (damage scaling / HP balance), 3 (provider retry + richer fallback prose), 4 (ambiguous
`attack` → recent-target resolution + presence hygiene). No source changed yet; repo green at
`14e320c`. Do not push; do not rebuild the installer until the human asks.

## Prior next action (installer test — still valid for the already-fixed 7 findings)

Have the human install the fresh NSIS artifact and repeat the affected provider-backed acceptance
journey:

1. Forge cancel -> **Resume saved Forge** and, separately, **Start new Forge**.
2. Play long enough to inspect latest-follow, historical reading, and **Jump to latest**.
3. Open **Possible moves** during normal service and provider degradation.
4. Meet a new creature, confirm registry identity/presence and character-specific dossier fields.
5. Attack it twice within the player action limit, then use a pronoun continuation with an older NPC
   also present; confirm the correct current living target is ruled.
6. Confirm the hostile creature independently attacks through a visible DM ruling and health/death
   changes remain engine-owned.
7. Inspect Overview before and after an arc closes: chapter summary first, premise compact, then arc
   synthesis primary with keyboard-accessible chapter drill-down.
8. Close/reopen and confirm persistence.

If the human reports another defect, reproduce it from this baseline and add RED coverage before a
source change. Otherwise Task 15A is complete; Task 16 remains deferred.
