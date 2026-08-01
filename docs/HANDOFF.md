# HANDOFF - current live state

**Updated:** 2026-08-01
**Branch / source baseline:** local `main` at `963d71a`; this docs-only closeout follows; not pushed
**App version:** `0.2.8`, unsigned
**User-owned/untracked:** `.codex/`, `opencode.json` - preserve
**Active plan:** `Plan/next-phase-internal-beta.md`; Tasks 15A-15D automated/source work complete

## Current outcome

Task 15D is implemented, committed, fully verified, and packaged. Read-only inspection of the
installed game database proved both reported failures:

- “Is anyone there? I need help!” was structured as narration-only but local recovery later matched
  the broad `help` alias as outward `Assist`, producing an irrelevant target error.
- narrator messages introduced a man and Bess, then explicitly said “I am Bram Kelder. This is
  Bess,” while the registry still contained only the player.

Source commit `963d71a` fixes the complete boundary:

- requests to receive help remain dialogue; explicit outward help such as “I help the Guard…” still
  resolves as Assist;
- bounded past-tense narration and direct identity declarations promote actual people/animals;
- a revealed name enriches one existing generic actor id instead of creating a duplicate;
- deterministic discoveries supplement and reconcile registrar output rather than running only
  when the model returns nothing;
- character display-name changes commit atomically, and migration 15/checkpoints restore prior
  names on rewind/delete;
- an exact legacy-transcript test proves the already-broken Bram/Bess save repairs both registry
  actors before classification on its first new turn under this build.

## Fresh verification

- `npm run typecheck`: passed.
- `npm test`: core **618 / 45 files**, UI **160 / 25 files**, **778 total**, passed.
- `cargo check`: passed.
- `npm run build`: passed core, UI/Vite, optimized Rust, MSI, and NSIS packaging.
- The red-green coverage includes help direction, past-tense entity discovery, player-identity
  exclusion, generic-to-proper rename, exact prose-only history repair, and identity rollback.

## Fresh test artifacts

- Preferred NSIS installer:
  `packages/shell/src-tauri/target/release/bundle/nsis/Midnight Tavern_0.2.8_x64-setup.exe`
  - bytes: `5626573`
  - SHA-256: `1BE6146A299C1BEAB9FB2B40EE3DE11C00E64D49A3B0B34A714DF90D5F4DC059`
- MSI alternative:
  `packages/shell/src-tauri/target/release/bundle/msi/Midnight Tavern_0.2.8_x64_en-US.msi`
  - bytes: `9269248`
  - SHA-256: `8237481D91917278E731B3ED387C3788293E9020A8BAFAC87563A650C9ED5CCB`
- Standalone app executable:
  `packages/shell/src-tauri/target/release/midnight-tavern.exe`
  - bytes: `22799360`
  - SHA-256: `FFD55BC0A7F5F7DBD06494BBC8B565A4FA7D60CB5DBF359D72911A38591D532D`
- All report `NotSigned`, expected until the later signing/release phase.

## Non-negotiable authority and domain rules

- One story owns one frozen executable action catalogue. NPCs receive capability loadouts, not a
  second model-authored private action list.
- Models may introduce actors, select sealed ids, and write prose. The engine owns gates, dice,
  effects, damage, death, budgets, direction/target legality, persistence, rollback, loot, and
  progression.
- Every actual fictional NPC/creature that appears must be registry-backed. A later identity reveal
  enriches the same actor when it is unambiguous; scenery, crowds, statues, murals, and vague nouns
  remain non-characters.
- Registry membership and scene presence differ. Only present, living actors participate.
- Rulings render before narrator streaming. Prose cannot assert death without threshold-backed
  `causedDeathOf`. Player and NPC action budgets remain separate.
- Browser/native bridge parity is mandatory. Preserve `.codex/` and `opencode.json`; do not push.

## Single next action

The human should install the fresh NSIS artifact over the prior build and continue the affected save.
On the first new turn, confirm Bram Kelder and Bess appear in Characters (with no duplicate Man) and
that asking for help remains dialogue rather than Assist. Then continue the provider-backed
acceptance journey: organic NPC action on a later beat, useful Possible Moves, Forge fresh restart,
two-action combat, threshold-backed damage/death, ruling-before-prose, narrator retry, per-character
dossier memory, Overview hierarchy, and follow-latest scrolling. Record every observed regression
before changing source. Do not claim manual acceptance until the human reports the installed journey.
