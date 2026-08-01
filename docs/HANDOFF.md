# HANDOFF - current live state

**Updated:** 2026-08-02
**Branch / source baseline:** local `main` at `32a7ac2`; this docs-only closeout follows; not pushed
**App version:** `0.2.8`, unsigned
**User-owned/untracked:** `.agents/`, `.codex/`, `opencode.json` - preserve
**Active plan:** `Plan/next-phase-internal-beta.md`; Tasks 15A-15E automated/source work complete

## Current outcome

Task 15E is implemented, fully verified, and freshly packaged. Read-only inspection of the installed
`Cyraeth Adventure` log and SQLite state proved the screenshot was not a provider or UI failure:

- the last turn completed `npc_introduction`, classifier, NPC planner, and narrator successfully;
- sentence-initial `It`, `Third`, and `He` were incorrectly promoted into character rows;
- the actual younger archer, older woman, large dog, and earlier predator were absent even though
  narrator prose established them;
- `Daen` was the only correctly registered non-player actor in that live save.

Source commits `c6abef6` and `32a7ac2` repair the full boundary:

- pronouns and ordinal transitions cannot become actors, while explicit names remain eligible;
- bounded described actors survive modifiers and ordinary past-tense verbs;
- murals, statues, paintings, and other depictions remain excluded;
- discovery uses the caller-bounded narration history, so an older creature can be repaired into
  Characters as historical and absent rather than incorrectly returned to Present;
- migration 16 removes only exact unused auto-generated `He`, `It`, and `Third` rows and scrubs their
  checkpoint references, while preserving any mechanically referenced short-name character;
- if several provisional people exist, nearby self-introduction context enriches the matching row
  rather than creating a duplicate named NPC;
- discoveries and presence/identity changes still commit atomically with the turn.

The live database and log were queried read-only. No user save was manually edited. Migration 16 and
history repair take effect when the freshly built app opens the database and the story advances.

## Fresh verification

- `npm run typecheck`: passed.
- `npm test`: core **625 / 45 files**, UI **160 / 25 files**, **785 total**, passed.
- Focused actor/turn/database repair suite: **34 tests / 3 files**, passed.
- `cargo check`: passed.
- `npm run build`: passed core, UI/Vite, optimized Rust, MSI, and NSIS packaging.
- `git diff --check`: passed before source commits.

## Fresh test artifacts

- Preferred NSIS installer:
  `packages/shell/src-tauri/target/release/bundle/nsis/Midnight Tavern_0.2.8_x64-setup.exe`
  - bytes: `5624034`
  - SHA-256: `F19130E9AB40646AA2E41D58E0B5929CA26792431D597FEC9E6A78D6F79E7725`
- MSI alternative:
  `packages/shell/src-tauri/target/release/bundle/msi/Midnight Tavern_0.2.8_x64_en-US.msi`
  - bytes: `9269248`
  - SHA-256: `88162E67A7F1CC5FD15323AA6A0B5444C06D9A6912C525102C4F6BBA2769DED3`
- Standalone app executable:
  `packages/shell/src-tauri/target/release/midnight-tavern.exe`
  - bytes: `22799360`
  - SHA-256: `98B0169A6894DAEA1F9308A7C0EED2770F4B857D28578EAD67C14F95524D9A86`
- All report `NotSigned`, expected until the later signing/release phase.

## Expected Cyraeth acceptance behavior

After installing this build and opening the affected save:

1. Migration 16 removes the unused phantom `He`, `It`, and `Third` rows.
2. On the first new story turn, the actual younger man, older woman, and large dog are promoted as
   present registry actors; `Daen` remains.
3. The earlier alien predator is repaired into Characters as a historical absent actor and must not
   appear in the Present strip unless later prose explicitly returns it.
4. A later unambiguous name reveal enriches the matching provisional actor row; it must not add a
   duplicate person.

## Non-negotiable authority and domain rules

- One story owns one frozen executable action catalogue. NPCs receive capability loadouts, not a
  second model-authored private action list.
- Models may introduce actors, select sealed ids, and write prose. The engine owns gates, dice,
  effects, damage, death, budgets, direction/target legality, persistence, rollback, loot, and
  progression.
- Every actual fictional NPC/creature that appears must be registry-backed. A later identity reveal
  enriches the same actor when it is unambiguous; scenery, crowds, statues, murals, pronouns,
  ordinals, and vague nouns remain non-characters.
- Registry membership and scene presence differ. Only present, living actors participate.
- Rulings render before narrator streaming. Prose cannot assert death without threshold-backed
  `causedDeathOf`. Player and NPC action budgets remain separate.
- Browser/native bridge parity is mandatory. Preserve `.agents/`, `.codex/`, and `opencode.json`;
  do not push.

## Single next action

The human should install the fresh NSIS artifact over the prior build and continue `Cyraeth
Adventure` for one new turn. Record whether the exact four acceptance expectations above hold before
changing source. If they do, continue the provider-backed journey for organic NPC action, useful
Possible Moves, two-action combat, threshold-backed damage/death, ruling-before-prose, narrator
retry, per-character dossier memory, Overview hierarchy, Forge restart, and follow-latest scrolling.
Do not claim manual acceptance until the human reports the installed result.
