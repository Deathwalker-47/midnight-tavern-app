# Copy-paste prompt for the next coding agent

Continue Midnight Tavern in `C:\Users\anuji\Documents\midnight-tavern-app`.

Act as engineering manager and hands-on implementation agent. Work autonomously and sequentially;
this repository forbids parallel coding agents. Do not ask the human to choose TypeScript
architecture. Do not push. Preserve the user-owned untracked `.codex/` directory and
`opencode.json`. Do not build an installer until the human asks; root `npm run build` invokes Tauri,
so use direct core/UI builds while source work remains.

Read in full before editing: `AGENTS.md`, `CONTEXT.md`, `docs/HANDOFF.md`, newest
`docs/WORKLOG.md` entries, `Plan/next-phase-internal-beta.md` Task 15B, and
`docs/superpowers/plans/2026-08-01-live-combat-remediation.md`.

Use codebase-memory-mcp before text search and re-index if symbols are stale. Follow strict RED ->
observe the intended failure -> minimal implementation -> GREEN. Every PowerShell command must begin
with explicit `Set-Location -LiteralPath 'C:\Users\anuji\Documents\midnight-tavern-app'`. Before
stopping, run typecheck and the complete suite, append WORKLOG, overwrite HANDOFF, update this prompt
and the active plan, and commit coherent green changes with the required co-author trailer.

## Current repository state

- Local `main` at `e7548ab`; nothing pushed; unsigned app version `0.2.8`.
- Task 15A and Task 15B Tasks 1-5 are complete.
- Fresh gate: core 596 / UI 156 = 752 tests passed; typecheck passed.
- An unnecessary root build refreshed local MSI/NSIS bundles. They are not acceptance artifacts;
  do not rebuild or distribute them.

## What landed in Task 15B

- `bd968fb`: every full-stat story has a gate-legal natural attack, including runtime compatibility.
- `41c5963`: emergent NPCs select at most three sealed story skills and the planner sees their actual
  gate-relevant capability state; the engine still owns legal actions.
- `e3a4801`: universal registry v4 has balanced families and Forge validates 30 actions plus 6-10
  premise-grounded skills, sharing the exact registry JSON across browser/core.
- `e43ae50`: attacks scale with authoritative attributes/bounded item damage and generic encounters
  use a six-hit health/damage pacing floor while threshold-only death remains authoritative.
- `e7548ab`: complete/stream provider I/O retries transient network/408/409/425/429/5xx failures up
  to three attempts inside the original timeout. Retry-After is capped at two seconds; permanent
  failures do not retry; a stream never retries after emitting visible text. Deterministic fallback
  names actor, action, and ruling outcome, keeps only non-mechanical safe hints, and cannot invent
  damage, death, loot, or state.

## Exact next task: recent-target recovery and presence hygiene

Implement Task 6 in the detailed plan, test-first:

1. Trace `deriveRecentPlayerTargetId`, classifier deterministic recovery, target resolution, turn
   orchestration, and NPC presence transitions before editing.
2. Add a failing end-to-end test: the classifier/provider fails for "attack it again" while two NPCs
   are marked present, but exactly one living NPC was the player's most recent authoritative target.
   Recovery must resolve that target and produce a normal ruling instead of `unresolved target`.
3. Preserve fail-closed behavior when there is no unique recent living target, the target is dead or
   absent, or the current text explicitly names a different/ambiguous target.
4. Add presence-hygiene tests. Retire stale presence only from explicit, validated scene-exit or
   scene-roster evidence. Do not delete registry characters or mark them absent merely because a
   narrator turn omitted their name. Dead characters remain registry history but cannot act/target.
5. Keep NPC-introduction/presence changes staged before classifier context and commit them atomically
   with the turn; rollback/cancellation must leave no partial presence mutation.
6. Run focused tests, root typecheck, and complete suites. Use direct core/UI builds only. Update all
   baton documents and commit before claiming Task 15B source completion.

## Authority rules

- One story owns one frozen executable action catalogue. NPCs receive capability loadouts, never
  model-authored private action lists.
- Engine/DM owns gates, dice, effects, damage, death, budgets, target legality, loot, progression,
  persistence, and rollback. Models select sealed ids and write prose only.
- Every actual fictional NPC/creature must be registry-backed; scenery and vague nouns must not.
- Only present living actors participate. Rulings appear before narration. Death requires lethal
  threshold evidence. Player and NPC action budgets remain separate.
- Browser/SQLite bridge parity is mandatory; browser code cannot import native or `node:` modules.
