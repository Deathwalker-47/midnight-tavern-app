# Copy-paste prompt for the next coding agent

Continue Midnight Tavern in `C:\Users\anuji\Documents\midnight-tavern-app`.

Act as engineering manager and hands-on implementation agent. Work autonomously and sequentially;
this repository forbids parallel coding agents. Do not ask the human to choose TypeScript
architecture. Do not push. Preserve the user-owned untracked `.codex/` directory and
`opencode.json`. Do not build an installer until the human asks.

Read in full before editing: `AGENTS.md`, `CONTEXT.md`, `docs/HANDOFF.md`, newest `docs/WORKLOG.md`
entries, `Plan/next-phase-internal-beta.md` Task 15B, and
`docs/superpowers/plans/2026-08-01-live-combat-remediation.md`.

Use codebase-memory-mcp before text search and re-index if symbols are stale. Follow strict RED ->
observe the intended failure -> minimal implementation -> GREEN. Every PowerShell command must begin
with explicit `Set-Location -LiteralPath 'C:\Users\anuji\Documents\midnight-tavern-app'`. Before
stopping, run typecheck and the complete suite, append WORKLOG, overwrite HANDOFF, update this prompt
and the active plan, and commit coherent green changes with the required co-author trailer.

## Current repository state

- Local `main` at `41c5963`; nothing pushed; unsigned app version `0.2.8`.
- Task 15A's seven earlier packaged fixes remain complete.
- Task 15B Tasks 1-2 are complete.
- Fresh gate: core 585 / UI 156 = 741 tests passed; typecheck passed.

## What just landed

- `bd968fb`: universal config v3 and runtime normalization guarantee a gate-legal, engine-resolved
  `attack_natural` action for any full-stat creature, including older frozen stories.
- `41c5963`: a newly grounded emergent NPC may select at most three sealed story skill ids. Generic
  instantiation filters unknowns, deduplicates, and grants novice rank. Template and existing actors
  cannot be mechanically overwritten by a runtime proposal.
- Registrar and reaction-planner prompts now contain the bounded information needed to choose legal,
  role-appropriate capabilities/actions. Engine gates remain final authority.

## Exact next task: broader universal and forge catalogues

Implement Task 3 in the detailed plan, test-first:

1. Add failing coverage that every required category has several distinct universal families and
   crafting is no longer empty.
2. Add failing forge/generation coverage for exactly six actions/category (30 total), a usable
   natural attack, family/category consistency, and 6-10 unique premise-grounded skills.
3. Introduce registry v4 with balanced semantic families. Do not turn universal families into
   executable character-owned commands; Phase B still specializes them into frozen story actions.
4. Raise generation breadth without forcing irrelevant magic or combat into peaceful premises.
   Preserve deterministic validation, structured repair, retained checkpoints, and resume.
5. Verify action-generation token limits and per-stage deadlines are sufficient for 30 definitions.
6. Run focused tests, root typecheck, and both complete suites; commit and update every baton doc.

## Remaining queue after Task 3

- Scale implicit attack damage and/or generated encounter health into a meaningful range.
- Retry transient provider failures and produce richer ruling-derived safe fallback prose.
- Apply recent-target continuity to degraded classifier recovery and retire stale scene presence.

## Authority rules

- One story owns one frozen executable action catalogue. NPCs receive capability loadouts, never
  model-authored private action lists.
- Engine/DM owns gates, dice, effects, damage, death, budgets, target legality, loot, progression,
  persistence, and rollback. Models select sealed ids and write prose only.
- Every actual fictional NPC/creature must be registry-backed; scenery and vague nouns must not.
- Only present living actors participate. Rulings appear before narration. Death requires lethal
  threshold evidence. Player and NPC action budgets remain separate.
- Browser/SQLite bridge parity is mandatory; browser code cannot import native or `node:` modules.
