# Copy-paste prompt for the next coding agent

Continue Midnight Tavern in `C:\Users\anuji\Documents\midnight-tavern-app`.

Act as engineering manager and hands-on implementation agent. Work autonomously and sequentially;
this repository forbids parallel coding agents. Do not ask the human to choose TypeScript
architecture. Do not push. Preserve the user-owned untracked `.codex/` directory and
`opencode.json`.

Read in full before editing: `AGENTS.md`, `CONTEXT.md`, `docs/HANDOFF.md`, newest
`docs/WORKLOG.md` entries, `Plan/next-phase-internal-beta.md` Task 15B, and
`docs/superpowers/plans/2026-08-01-live-combat-remediation.md`.

Use codebase-memory-mcp before text search and re-index if symbols are stale. For new defects follow
strict RED -> observe the intended failure -> minimal implementation -> GREEN. Every PowerShell
command must begin with explicit
`Set-Location -LiteralPath 'C:\Users\anuji\Documents\midnight-tavern-app'`. Before stopping, run
typecheck and the complete suite, append WORKLOG, overwrite HANDOFF, update this prompt and the active
plan, and commit coherent green changes with the required co-author trailer.

## Current repository state

- Local `main` source at `5f4e85d`, followed by a docs-only Task 15B closeout commit; nothing pushed.
- Unsigned app version `0.2.8`.
- Task 15A and all six Task 15B source slices are complete.
- Fresh gate: core 601 / UI 156 = 757 tests passed; typecheck and optimized package build passed.
- Preferred installer:
  `packages/shell/src-tauri/target/release/bundle/nsis/Midnight Tavern_0.2.8_x64-setup.exe`
  SHA-256 `467262CF7144E53560A88351142CA113E053C31339489994489104329D7B5E3B`.
- MSI alternative:
  `packages/shell/src-tauri/target/release/bundle/msi/Midnight Tavern_0.2.8_x64_en-US.msi`
  SHA-256 `9A5E0834616DE18A8F4A05FEFFEEC25EF5A5FB3DC3BB03782D14BABFAAE6E145`.
- Both installers are intentionally unsigned.

## What Task 15B delivered

- A gate-legal natural attack in every full-stat story, including old frozen catalogues.
- At most three sealed story skills for a newly grounded emergent NPC; planners see actual learned
  skills/resources/inventory, while the engine remains the only action/gate authority.
- Universal registry v4 with balanced combat/social/exploration/crafting/utility families.
- Forge validation for exactly 30 premise-grounded actions and 6-10 skills with protected natural
  attack, family/category validation, resume, and repair guarantees.
- Attribute/item-scaled damage and a six-hit generic encounter pacing floor; named templates retain
  authored durability and death still requires lethal threshold evidence.
- Up to three transient network/408/409/425/429/5xx provider attempts inside one original timeout;
  capped Retry-After, no retry on permanent errors, and no streaming retry after visible output.
- Safe fallback prose names actor/action/outcome and filters unrecorded damage/death/loot/state.
- Classifier-stage timeout recovery uses only a unique recent present living target for continuation
  wording. Explicit names override it; ambiguous/dead/absent focus still fails closed.
- Existing NPC presence can retire from a named exit or an exact committed roster sentence such as
  "You are alone now." Omission, player-only assertions, and dramatic uses of "alone" do not count.
  Presence commits atomically; registry history is retained.

## Exact next task: process human packaged acceptance

Do not invent another source task before the human tests. Ask for or consume their packaged results,
then reproduce each observed issue and create a new dependency-ordered plan. The intended acceptance
journey should cover:

1. Fresh create/import and Forge cancel -> fresh restart behavior.
2. A premise-relevant 30-action / 6-10-skill rulebook and usable Possible Moves.
3. Every encountered NPC/creature appearing in the registry, with per-character mentality/current
   fields and character-specific history.
4. A hostile creature autonomously attacking through an engine ruling; meaningful HP changes; two
   player strikes allowed; death only when lethal health reaches zero.
5. Rulings visible before verified narration; readable deterministic prose if providers fail.
6. "Attack it again" choosing the newest living target despite an older present NPC, while explicit
   names override and ambiguity still pauses safely.
7. Explicit scene departure retiring presence without deleting registry history.
8. Overview hierarchy and follow-latest scrolling remaining stable.

Do not claim manual acceptance until the human reports it. If they find defects, preserve the same
authority rules and update `Plan/`, `docs/HANDOFF.md`, `docs/WORKLOG.md`, and this prompt before stopping.

## Authority rules

- One story owns one frozen executable action catalogue. NPCs receive capability loadouts, never
  model-authored private action lists.
- Engine/DM owns gates, dice, effects, damage, death, budgets, target legality, loot, progression,
  persistence, and rollback. Models select sealed ids and write prose only.
- Every actual fictional NPC/creature must be registry-backed; scenery and vague nouns must not.
- Only present living actors participate. Rulings appear before narration. Death requires lethal
  threshold evidence. Player and NPC action budgets remain separate.
- Browser/SQLite bridge parity is mandatory; browser code cannot import native or `node:` modules.
