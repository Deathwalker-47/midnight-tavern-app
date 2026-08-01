# Copy-paste prompt for the next coding agent

Continue Midnight Tavern in `C:\Users\anuji\Documents\midnight-tavern-app`.

Act as engineering manager and hands-on implementation agent. Work autonomously and sequentially;
this repository forbids parallel coding agents. Do not ask the human to choose TypeScript
architecture. Do not push. Preserve the user-owned untracked `.codex/` directory and
`opencode.json`.

Read in full before editing: `AGENTS.md`, `CONTEXT.md`, `docs/HANDOFF.md`, the newest
`docs/WORKLOG.md` entries, and Tasks 15A-15D in `Plan/next-phase-internal-beta.md`. Use
codebase-memory-mcp before text search and re-index if symbols are stale. For defects, follow strict
RED -> observe the intended failure -> minimal implementation -> GREEN. Begin every PowerShell
command with an explicit `Set-Location -LiteralPath
'C:\Users\anuji\Documents\midnight-tavern-app'`.

Before stopping, run typecheck and the complete test suite, append WORKLOG, overwrite HANDOFF,
update this prompt and the active plan, and commit coherent green changes with the required
co-author trailer.

## Current repository state

- Local `main` source is `963d71a`, followed by a docs-only Task 15D closeout; nothing is pushed.
- Unsigned app version `0.2.8`; Tasks 15A-15D source and automated gates are complete.
- Fresh gate: core 618 / UI 160 = **778 tests** passed; typecheck, `cargo check`, and optimized
  package build passed.
- Preferred installer:
  `packages/shell/src-tauri/target/release/bundle/nsis/Midnight Tavern_0.2.8_x64-setup.exe`
  SHA-256 `1BE6146A299C1BEAB9FB2B40EE3DE11C00E64D49A3B0B34A714DF90D5F4DC059`.
- MSI alternative:
  `packages/shell/src-tauri/target/release/bundle/msi/Midnight Tavern_0.2.8_x64_en-US.msi`
  SHA-256 `8237481D91917278E731B3ED387C3788293E9020A8BAFAC87563A650C9ED5CCB`.
- Both installers are intentionally unsigned.

## Latest live defect and fix

Read-only packaged SQLite inspection showed the classifier correctly returned narration-only for
“Is anyone there? I need help!”, but deterministic fallback later reversed the broad `help` alias
into outward Assist. It also showed narration establishing a man, Bess, then “I am Bram Kelder. This
is Bess,” while the registry contained only the player.

Task 15D makes help directional at model-output and local-recovery boundaries. Past-tense actor
prose and direct identity declarations now create registry-backed actors. A revealed proper name
enriches one existing generic actor id, registrar and deterministic discoveries are reconciled, and
identity is included in migration-15 checkpoint pre-images so rewind/delete restores the earlier
name. The exact already-broken Bram/Bess transcript is an integration fixture: its first new turn
under this build registers Bram Kelder and Bess before classification and does not create Man.

## Exact next task: consume human packaged acceptance

Do not invent another source task before the human tests. Ask them to install the fresh NSIS build
and continue the affected save. On its first new turn verify:

1. Bram Kelder and Bess appear in Characters; no duplicate generic Man exists.
2. Asking/calling to receive help remains dialogue; explicitly helping a named present character
   may resolve as Assist.
3. Bram/Bess have registry hard state and useful story-authored skills; an actor may take only an
   engine-approved action on a subsequent beat.

Then continue the broader installed journey: Forge cancel -> fresh restart, 30-action/6-10-skill
rulebook breadth, useful Possible Moves, two legal player strikes, meaningful health/death only at
the lethal threshold, rulings before verified narration, no internal markup, narrator retry settling,
correct NanoGPT validation, per-character dossier memory, Overview hierarchy, and stable
follow-latest scrolling.

Do not claim manual acceptance until the human reports it. If defects appear, reproduce each from
logs/state, write a dependency-ordered plan, preserve the authority rules below, and update
`Plan/`, `docs/HANDOFF.md`, `docs/WORKLOG.md`, and this prompt before stopping.

## Authority rules

- One story owns one frozen executable action catalogue. NPCs receive capability loadouts, never
  model-authored private action lists.
- The narrator may originate fictional actors and reveal identities, but the registry owns their
  existence and the engine owns all subsequent mechanical agency.
- Engine/DM owns gates, dice, effects, damage, death, budgets, target/direction legality, loot,
  progression, persistence, and rollback. Models select sealed ids and write prose only.
- Every actual fictional NPC/creature must be registry-backed; later unambiguous names enrich the
  same row. Scenery, crowds, statues, murals, quantifiers, and vague nouns are not characters.
- Only present living actors participate. Rulings appear before narration. Death requires lethal
  threshold evidence. Player and NPC action budgets remain separate.
- Browser/SQLite bridge parity is mandatory; browser code cannot import native or `node:` modules.
