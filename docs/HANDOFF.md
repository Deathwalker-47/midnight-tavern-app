# HANDOFF - current live state

**Updated:** 2026-10-09 (plans 08 + 09 activated by the owner; execution in progress)
**Branch / source baseline:** `main`. The owner authorized pushing every completed step straight to
`origin/main` without waiting (2026-10-09). Push after each step.
**App version:** `0.2.9` (no installer built for this work yet — build once a shippable milestone is done).
**User-owned/untracked (owner's Windows machine):** `.agents/`, `.codex/`, `opencode.json` — preserve.

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
| S2–S8 | Plan 08 (resource roles, stamina cost, cooldowns, timed effects, skill types/targeting, recovery, v3 forge + UI) | not started |
| S9–S18 | Plan 09 (pool, enablement, selection, archetypes, mid-story enablement, UI, items, weapon specials, external config, close-out) | not started |

## Verification state

After S1 (Linux/Node 22): `npm run typecheck` clean; core **676 / 46 files**,
UI **183 / 26 files** = **859** passing; root `npm test` passes here (the tinypool worker crash is
Windows/Node 24 only — plan 07 P0-0, not authorized).

## Facts established earlier (still true — do not re-derive)

- The classifier's `npcIntents` are merged into resolution at `orchestrator/turn.ts:666` with no
  disposition check (live violation of `CONTEXT.md` invariant 9; plan 02, not authorized).
- Generic NPCs get `attributes: {}` and only lethal resources (`bootstrap/instantiate.ts`); S2 adds mana
  and stamina, plan 05 (not authorized) adds attribute variety.
- `ResourceDef.regenPerScene` exists in rulebooks but nothing applies it; S7 replaces it with `economy.json`.
- The owner's taxonomy files (`universal-rpg-skill-taxonomy-expanded-non-combat.txt`, `uni-items.txt`) are
  **not in the repo** and Google Drive was not reachable from the cloud session. S9 ships the format and a
  starter pool; the full import waits for the files.

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

Execute **S2** of the action plan (resource roles), then continue in order.
