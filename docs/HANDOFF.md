# HANDOFF - current live state

**Updated:** 2026-10-09 (plans 08 + 09 activated by the owner; execution in progress)
**Branch / source baseline:** `main`. The owner authorized pushing every completed step straight to
`origin/main` without waiting (2026-10-09). Push after each step.
**App version:** `0.2.9` (no installer built for this work yet — build once a shippable milestone is done).
**Owner's machine was formatted (reported 2026-10-09).** All local-only data is gone: the installed
v0.2.9 app and installers, the live saves (Cyraeth Adventure, Solo Leveling RPG) used for every earlier
diagnosis, the trial-unlock script, local agent tooling (`.agents/`, `.codex/`, `opencode.json`,
GateGuard hook, auto-memory) and the owner's taxonomy source files. The git history is intact on
`origin`. Consequences: D7 "new stories only" now costs nothing (no saves to migrate); live-save
findings below remain true as code facts but can no longer be re-inspected; the next build must be
produced from source on a fresh Windows toolchain.

**Active plan:** [`docs/plans/2026-10-09-plans-08-09-action-plan.md`](plans/2026-10-09-plans-08-09-action-plan.md),
which executes plans `2026-08-13-08-resource-economy.md` and `2026-08-13-09-content-catalogues.md`.
Read the action plan's "Decisions taken" and "Corrections" sections before touching code — they
override parts of plans 08/09 that were wrong against source.

## Planning rules

Every plan written before 2026-08-12 is decommissioned ([`docs/PLAN-POLICY.md`](PLAN-POLICY.md)).
Plans 01-07 and 10-12 of the 2026-08-13 set remain written but **not authorized**.

## Progress on the active plan

| Step | What | State |
| --- | --- | --- |
| S0 | Action plan written and activated | done |
| S1 | XP repeat penalty: curve `[1,.8,.6,.5,.4]`, per-actor window over the actor's last 5 turns (`countRecentSimilarUses`) | done |
| S2 | Resource roles: `ResourceDef.role`, deterministic legacy inference (`engine/resources.ts`), schema v3 contract, generic NPCs get mana + stamina on v3 | done |
| S3–S8 | Plan 08 (stamina cost, cooldowns, timed effects, skill types/targeting, recovery, v3 forge + UI) | not started |
| S9–S18 | Plan 09 (pool, enablement, selection, archetypes, mid-story enablement, UI, items, weapon specials, external config, close-out) | not started |

## Verification state

After S2 (Linux/Node 22): `npm run typecheck` clean; core **690 / 47 files** (engine coverage 100%),
UI **183 / 26 files** = **873** passing; root `npm test` passes here (the tinypool worker crash is
Windows/Node 24 only — plan 07 P0-0, not authorized).

## Facts established earlier (still true — do not re-derive)

- The classifier's `npcIntents` are merged into resolution at `orchestrator/turn.ts:666` with no
  disposition check (live violation of `CONTEXT.md` invariant 9; plan 02, not authorized).
- Generic NPCs get `attributes: {}` and only lethal resources (`bootstrap/instantiate.ts`); S2 adds mana
  and stamina, plan 05 (not authorized) adds attribute variety.
- `ResourceDef.regenPerScene` exists in rulebooks but nothing applies it; S7 replaces it with `economy.json`.
- The owner's taxonomy files are **permanently lost** (never committed; laptop formatted; not in Google
  Drive). Engineering authors the pool itself under the owner's existing grants — see the action plan.
- The engine's 100% coverage gate (`npx vitest run --coverage` in `packages/core`) was silently failing
  at `0e500d9` (`resolver.ts:173`); fixed in S2. It is **not** part of `npm test` — run it yourself
  after any `src/engine` change.

## Non-negotiable rules

- Models may propose actors, intents, soft state, pool enablement (analyzer only, guarded) and prose.
  The engine owns mechanics, ids, gates, budgets, effects, damage, death, persistence, rollback.
- Hard state is written only by `engine/ledger.ts`; soft state only by the analyzer.
- Bridge parity: every `CoreBridge` method exists and behaves identically in both backends;
  `bridge/core.ts` imports core as TYPES ONLY (plus vetted browser-safe deep imports).
- A story's rulebook is frozen at forge time. The enabled pool set (plan 09) is the one sanctioned,
  checkpointed, journalled way a story's catalogue grows.
- New `CharacterHardState` fields must carry Zod defaults so old checkpoints still decode on rewind.

## Single next action

Execute **S3** of the action plan (weapon stamina cost), then continue in order.
