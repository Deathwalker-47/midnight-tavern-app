# Copy-paste prompt for the next coding agent

Continue Midnight Tavern in `C:\Users\anuji\Documents\midnight-tavern-app`.

Act as engineering manager and hands-on implementation agent. Work autonomously and sequentially;
this repository forbids parallel coding agents. Do not ask the human to choose TypeScript
architecture. Do not push. Preserve the user-owned untracked `.codex/` directory and
`opencode.json`.

Read in full before editing: `AGENTS.md`, `CONTEXT.md`, `docs/HANDOFF.md`, the newest
`docs/WORKLOG.md` entries, and Tasks 15A-15C in `Plan/next-phase-internal-beta.md`. Use
codebase-memory-mcp before text search and re-index if symbols are stale. For defects, follow strict
RED -> observe the intended failure -> minimal implementation -> GREEN. Begin every PowerShell
command with an explicit `Set-Location -LiteralPath
'C:\Users\anuji\Documents\midnight-tavern-app'`.

Before stopping, run typecheck and the complete test suite, append WORKLOG, overwrite HANDOFF,
update this prompt and the active plan, and commit coherent green changes with the required
co-author trailer.

## Current repository state

- Local `main` source is `76c6c5e`, followed by a docs-only Task 15C closeout; nothing is pushed.
- Unsigned app version `0.2.8`; Tasks 15A-15C source and automated gates are complete.
- Fresh gate: core 609 / UI 160 = **769 tests** passed; typecheck, `cargo check`, and optimized
  package build passed.
- Preferred installer:
  `packages/shell/src-tauri/target/release/bundle/nsis/Midnight Tavern_0.2.8_x64-setup.exe`
  SHA-256 `CC5624D67E6CA6454BBFB5C5C19207B1E55E91D0A78C27FC4A0C695C4DE0F2CF`.
- MSI alternative:
  `packages/shell/src-tauri/target/release/bundle/msi/Midnight Tavern_0.2.8_x64_en-US.msi`
  SHA-256 `601C5A8ABE573A876424A1BAB7818C2E76D5449B6C0A566AB159D76F9FFC4CCC`.
- Both installers are intentionally unsigned.

## What Task 15C delivered

- Every target-requiring sealed action needs one unambiguous, present, non-player target; a call for
  help with no survivor stays narration-only.
- Stateful output filtering strips internal Chronicle Note blocks from streamed and persisted prose.
- The narrator may create NPCs organically. Every actual named/described person or creature is
  promoted into the registry before the same turn commits, with hard state and up to three usable
  sealed story skills. It cannot act retroactively in its introduction prose; it can act through the
  authoritative planner/engine from the next beat.
- Provider-key validation uses an authenticated minimal chat even when model discovery is public.
- Narration retry clears stale provider notices and always settles Play state.
- The same package includes the retained-Forge import guard, 120-second Forge fragment deadline,
  UUID-safe fallback names, visible narrator degradation/retry controls, and ruling-before-streaming.

## Exact next task: consume human packaged acceptance

Do not invent another source task before the human tests. Consume their installed-app results,
reproduce each problem, and create a dependency-ordered plan before editing. The journey must cover:

1. Fresh create/import and Forge cancel -> genuinely fresh restart.
2. Premise-relevant 30-action / 6-10-skill rulebook and useful Possible Moves.
3. Organic named NPC/creature introduction immediately creating a registry dossier with mentality,
   current fields, character-specific history, hard state, and story-appropriate usable skills.
4. The newly introduced NPC remaining prose-only in its introduction beat, then autonomously taking
   a legal engine-resolved action from the next beat when its hostility/goal warrants it.
5. Two legal player strikes, meaningful health changes, and death only at lethal health threshold.
6. Rulings visible before verified narration; no Chronicle Note/internal markup; safe readable
   fallback when a provider fails; Retry Narration always settles.
7. Targetless calls/dialogue never resolving against an invented survivor, while explicit names and
   unique recent-target continuation still work and ambiguity pauses safely.
8. Correct NanoGPT key validation, Overview hierarchy, per-character dossier memory, and stable
   follow-latest scrolling.

Do not claim manual acceptance until the human reports it. If defects appear, preserve the same
authority rules and update `Plan/`, `docs/HANDOFF.md`, `docs/WORKLOG.md`, and this prompt before
stopping.

## Authority rules

- One story owns one frozen executable action catalogue. NPCs receive capability loadouts, never
  model-authored private action lists.
- The narrator may originate fictional actors, but the registry owns their existence and the engine
  owns all subsequent mechanical agency.
- Engine/DM owns gates, dice, effects, damage, death, budgets, target legality, loot, progression,
  persistence, and rollback. Models select sealed ids and write prose only.
- Every actual fictional NPC/creature must be registry-backed; scenery, crowds, statues, murals, and
  vague nouns must not become characters.
- Only present living actors participate. Rulings appear before narration. Death requires lethal
  threshold evidence. Player and NPC action budgets remain separate.
- Browser/SQLite bridge parity is mandatory; browser code cannot import native or `node:` modules.
