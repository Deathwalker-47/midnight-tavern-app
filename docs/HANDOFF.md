# HANDOFF - current live state

**Updated:** 2026-08-01
**Branch / source baseline:** local `main` at `76c6c5e`; this docs-only closeout follows; not pushed
**App version:** `0.2.8`, unsigned
**User-owned/untracked:** `.codex/`, `opencode.json` - preserve
**Active plan:** `Plan/next-phase-internal-beta.md`; Tasks 15A-15C automated/source work complete

## Current outcome

Task 15C is implemented, committed, fully verified, and packaged. Its governing NPC rule is:

> The narrator may introduce a real person or creature organically. Before that turn commits, the
> app must promote the newly appearing actor into the character registry with identity, presence,
> hard state, and bounded story-authored skills. The new actor cannot retroactively take a
> mechanical action in the prose that created it, but it may act through the engine from the next
> beat.

This preserves organic storytelling without allowing prose-only actors to bypass deterministic
mechanics. Scenery, crowds, statues, murals, `Nothing`, and vague `Something` remain non-characters.

Source commit `76c6c5e` also closes the live packaged defects accumulated after Task 15B:

- actions that require another character now require one unambiguous present non-player target;
  calling for help cannot resolve as `Reassure Survivor` when no survivor exists;
- internal `[Chronicle Note]...[/Chronicle Note]` blocks are removed from streamed and persisted
  narration even when tags are split across chunks;
- organically introduced named/described NPCs are registered atomically and receive up to three
  usable sealed story skills;
- NanoGPT/provider credential validation performs an authenticated minimal chat instead of trusting
  a possibly public model list;
- narration retry clears stale degradation notices immediately and always settles the Play busy
  state;
- retained-Forge import no longer rehydrates an unrelated failed Forge, Forge fragments have a
  120-second deadline, fallback prose resolves roster names instead of UUIDs, narrator degradation
  is visible and retryable, and rulings remain visible before prose streaming.

## Fresh verification

- `npm run typecheck`: passed.
- `npm test`: core **609 / 45 files**, UI **160 / 25 files**, **769 total**, passed.
- `cargo check`: passed.
- `npm run build`: passed core, UI/Vite, optimized Rust, MSI, and NSIS packaging.
- Organic-NPC, target-legality, Chronicle-filter, credential-validation, and retry-state behaviors
  are all locked by regression tests.

## Fresh test artifacts

- Preferred NSIS installer:
  `packages/shell/src-tauri/target/release/bundle/nsis/Midnight Tavern_0.2.8_x64-setup.exe`
  - bytes: `5624379`
  - SHA-256: `CC5624D67E6CA6454BBFB5C5C19207B1E55E91D0A78C27FC4A0C695C4DE0F2CF`
- MSI alternative:
  `packages/shell/src-tauri/target/release/bundle/msi/Midnight Tavern_0.2.8_x64_en-US.msi`
  - bytes: `9265152`
  - SHA-256: `601C5A8ABE573A876424A1BAB7818C2E76D5449B6C0A566AB159D76F9FFC4CCC`
- Standalone app executable:
  `packages/shell/src-tauri/target/release/midnight-tavern.exe`
  - bytes: `22795264`
  - SHA-256: `053AB2F0FB98A9A5CAC59976F605DF7D7C48275C9A98962DB2390E039251902C`
- All report `NotSigned`, expected until the later signing/release phase.

## Non-negotiable authority and domain rules

- One story owns one frozen executable action catalogue. NPCs receive capability loadouts, not a
  second model-authored private action list.
- Models may introduce actors, select sealed ids, and write prose. The engine owns gates, dice,
  effects, damage, death, budgets, target legality, persistence, rollback, loot, and progression.
- Every actual fictional NPC/creature that appears must be registry-backed in the same committed
  turn. Newly narrated actors gain mechanical agency only on a subsequent beat.
- Registry membership and scene presence differ. Only present, living actors participate.
- Rulings render before narrator streaming. Prose cannot assert death without threshold-backed
  `causedDeathOf`. Player and NPC action budgets remain separate.
- Browser/native bridge parity is mandatory. Preserve `.codex/` and `opencode.json`; do not push.

## Single next action

The human should install the fresh NSIS artifact and run the provider-backed acceptance journey.
Specifically verify: organic named NPC introduction creates a dossier with useful skills; that NPC
can act from the next beat; no targetless social ruling appears; no Chronicle Note is visible;
NanoGPT accepts only the correct key; narration retry settles; Possible Moves remain useful; Forge
cancel/fresh restart works; combat damage/death and two-action turns remain authoritative; dossier
memory is character-specific; Overview hierarchy and follow-latest scrolling stay stable. Record
every observed regression before changing source. Do not claim manual acceptance until the human
reports the installed journey.
