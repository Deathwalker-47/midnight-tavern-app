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

- Local `main` at `e43ae50`; nothing pushed; unsigned app version `0.2.8`.
- Task 15A's seven earlier packaged fixes remain complete.
- Task 15B Tasks 1-4 are complete.
- Fresh gate: core 592 / UI 156 = 748 tests passed; typecheck and direct core/UI builds passed.

## What just landed

- `bd968fb`: universal config v3 and runtime normalization guarantee a gate-legal, engine-resolved
  `attack_natural` action for any full-stat creature, including older frozen stories.
- `41c5963`: a newly grounded emergent NPC may select at most three sealed story skill ids. Generic
  instantiation filters unknowns, deduplicates, and grants novice rank. Template and existing actors
  cannot be mechanically overwritten by a runtime proposal.
- `e3a4801`: registry v4 provides at least six universal families in every category. The forge now
  validates 6-10 distinct premise-grounded skills and exactly 30 actions: six/category with at least
  four families/category. Family/category mismatches fail validation, the natural attack stays
  ungated, and browser/core consume the same universal JSON.
- `e43ae50`: combat attacks add authoritative positive attribute power and bounded item damage.
  Generic encounters use a six-hit damage floor, new generic NPCs receive a six-baseline-hit lethal
  pool, and named templates keep authored health. Threshold-only ledger death is unchanged.
- Registrar and reaction-planner prompts now contain the bounded information needed to choose legal,
  role-appropriate capabilities/actions. Engine gates remain final authority.
- Core Vitest intentionally runs one worker because repeated Windows/Node v24 pool workers exited
  with `EPIPE`; the ordinary full command is stable with this setting.

## Exact next task: provider resilience and authority-safe fallback prose

Implement Task 5 in the detailed plan, test-first:

1. Trace provider calls and authority-guard fallback construction before editing.
2. Add failing router tests for bounded retries of transient HTTP/network failures. Permanent
   authentication, malformed output, explicit cancellation, and non-retryable client errors must
   fail immediately; respect Retry-After when safely available.
3. Implement a small shared retry policy with capped attempts, bounded delay, and no duplicate
   mechanical commits. Retrying model I/O must never rerun the engine transaction.
4. Add failing authority-guard tests for provider exhaustion after a valid ruling. Safe fallback
   prose must identify actor/action plus success, failure, critical result, or denial from the ruling
   and may mention only sealed effect hints/provenance. It must not invent death, damage, loot, or
   state.
5. Run focused tests, root typecheck, complete suites, and direct core/UI builds; commit and update
   every baton document before Task 6.

## Remaining queue after Task 5

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
