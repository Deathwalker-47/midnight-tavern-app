# Copy-paste prompt for the next coding agent

Continue Midnight Tavern in `C:\Users\anuji\Documents\midnight-tavern-app`.

Act as engineering manager and hands-on implementation agent. Work autonomously and sequentially;
this repository forbids parallel coding agents. Do not ask the human to choose TypeScript
architecture. Do not push. Preserve the user-owned/untracked `.agents/`, `.codex/`, and
`opencode.json` paths.

Read in full before editing: `AGENTS.md`, `CONTEXT.md`, `docs/HANDOFF.md`, the newest
`docs/WORKLOG.md` entries, and Tasks 15A-15E in `Plan/next-phase-internal-beta.md`. Use
codebase-memory-mcp before text search and re-index if symbols are stale. For defects, follow strict
RED -> observe the intended failure -> minimal implementation -> GREEN. Begin every PowerShell
command with an explicit `Set-Location -LiteralPath
'C:\Users\anuji\Documents\midnight-tavern-app'` because the shell sometimes ignores its supplied
working directory.

Before stopping, run typecheck and the complete test suite, append WORKLOG, overwrite HANDOFF,
update this prompt and the active plan, and commit coherent green changes with the required
co-author trailer. Build one installer only after the current defect list is complete.

## Current repository state

- Local `main` source ends at `32a7ac2`, followed by a docs-only Task 15E closeout; not pushed.
- Source commits for Task 15E are `c6abef6` (`core: reject phantom narrated actors`) and `32a7ac2`
  (`core: preserve contextual NPC identity`).
- Unsigned app version `0.2.8`; Tasks 15A-15E source and automated gates are complete.
- Fresh gates: core **625 / 45 files**, UI **160 / 25 files**, **785 tests total**; typecheck,
  `cargo check`, and the optimized package build all passed.
- Preferred installer:
  `packages/shell/src-tauri/target/release/bundle/nsis/Midnight Tavern_0.2.8_x64-setup.exe`
  SHA-256 `F19130E9AB40646AA2E41D58E0B5929CA26792431D597FEC9E6A78D6F79E7725`.
- MSI alternative:
  `packages/shell/src-tauri/target/release/bundle/msi/Midnight Tavern_0.2.8_x64_en-US.msi`
  SHA-256 `88162E67A7F1CC5FD15323AA6A0B5444C06D9A6912C525102C4F6BBA2769DED3`.
- Both installers are intentionally unsigned.

## Latest live defect, evidence, and repair

The affected installed story is `Cyraeth Adventure`, id
`ab1c6258-e244-4e7d-9147-1b0d3396a2c7`. Read-only evidence came from:

- database: `%APPDATA%\com.midnighttavern.app\midnight-tavern.db`
- log: `%LOCALAPPDATA%\com.midnighttavern.app\logs\midnight-tavern.log`

The live roster contained the player, `Daen`, and bogus scene rows named `He`, `It`, and `Third`.
The real younger archer, older woman, large dog, and an earlier alien predator were absent. The last
turn itself succeeded: NPC introduction, classifier, NPC planner, and narrator all completed; this
was deterministic extraction failure, not provider or UI failure.

Root cause was in `packages/core/src/orchestrator/sceneEntityPromotion.ts`: sentence-start proper-name
grammar accepted pronouns/ordinals, a broad appositive path associated `Third` with `creature`,
described-actor grammar could not cross ordinary modifiers, and discovery internally truncated the
already bounded history to two narration messages.

Task 15E now:

- rejects pronouns and ordinals without blocking explicit identities or proper names;
- recognizes bounded described actors through modifiers and common past-tense verbs;
- excludes depictions such as murals, statues, and paintings;
- scans all caller-bounded recent narration and marks actors discovered only in older narration as
  historical/absent;
- preserves that absence when new character hard state is created;
- adds migration 16, which removes only exact unused non-player scene rows `He`, `It`, and `Third`,
  scrubs their hard/soft/presence/identity checkpoint data, and preserves mechanically referenced
  short-name actors;
- maps a later self-introduction to the nearest matching provisional human even when several people
  are present, preserving the existing id rather than creating a duplicate.

The live database was never manually edited. Migration and narrator-history repair occur when the
new build opens the save and the story advances.

## Exact next task: consume human packaged acceptance

Do not invent another source task before the human tests. Have them install the fresh NSIS build and
continue `Cyraeth Adventure` for one new turn. Verify all of the following from UI plus read-only
logs/state:

1. Legacy `He`, `It`, and `Third` rows are gone.
2. `Daen` remains.
3. The younger man, older woman, and large dog are registry-backed and present.
4. The earlier predator is registry-backed but absent, so it does not appear in Present.
5. A later unambiguous proper-name reveal enriches its provisional row; no duplicate person is
   created.
6. No scenery, vague noun, pronoun, or ordinal is promoted.

If those pass, continue the broader installed journey: organic NPC action on a later beat, useful
Possible Moves, Forge cancel -> fresh restart, 30-action/6-10-skill rulebook breadth, two legal
player strikes, meaningful health/death only at the lethal threshold, rulings before verified
narration, no internal markup, narrator retry settling, correct provider authentication, per-character
dossier memory, Overview hierarchy, and stable follow-latest scrolling.

Do not claim manual acceptance until the human reports it. If a defect appears, inspect the exact
packaged log, operation rows, transcript, events, checkpoints, and character state before editing;
write a failing regression test for that evidence; then update `Plan/`, `docs/HANDOFF.md`,
`docs/WORKLOG.md`, and this prompt before stopping.

## Authority rules

- One story owns one frozen executable action catalogue. NPCs receive capability loadouts, never
  model-authored private action lists.
- The narrator may originate fictional actors and reveal identities, but the registry owns their
  existence and the engine owns all subsequent mechanical agency.
- Engine/DM owns gates, dice, effects, damage, death, budgets, target/direction legality, loot,
  progression, persistence, and rollback. Models select sealed ids and write prose only.
- Every actual fictional NPC/creature must be registry-backed; later unambiguous names enrich the
  same row. Scenery, crowds, statues, murals, pronouns, ordinals, and vague nouns are not characters.
- Registry membership is not scene presence. Only present living actors participate.
- Rulings appear before narration. Death requires lethal-threshold evidence. Player and NPC action
  budgets remain separate.
- Browser/SQLite bridge parity is mandatory; browser code cannot import native or `node:` modules.
