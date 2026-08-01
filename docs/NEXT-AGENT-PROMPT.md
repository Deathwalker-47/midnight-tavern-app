# Copy-paste prompt for the next coding agent

Continue Midnight Tavern in `C:\Users\anuji\Documents\midnight-tavern-app`.

Act as engineering manager and hands-on implementation agent. Work autonomously and sequentially;
this repository forbids parallel coding agents. Do not ask the human to choose TypeScript
architecture. Do not push. Preserve the user-owned untracked `.codex/` directory and
`opencode.json`. Do not build an installer until the human asks.

Read in full before editing:

1. `AGENTS.md`
2. `docs/HANDOFF.md`
3. newest entries in `docs/WORKLOG.md`
4. `Plan/next-phase-internal-beta.md`, especially Task 15B
5. `docs/superpowers/plans/2026-08-01-live-combat-remediation.md`

Use codebase-memory-mcp before text search and re-index if symbols are stale. Follow strict RED ->
observe the intended failure -> minimal implementation -> GREEN. Every PowerShell command must begin
with explicit `Set-Location -LiteralPath 'C:\Users\anuji\Documents\midnight-tavern-app'` because the
desktop working-folder hint is unreliable. Before stopping, run typecheck and the complete suite,
append WORKLOG, overwrite HANDOFF, update this prompt and the active plan, and commit coherent green
changes with the required co-author trailer.

## Current repository state

- Local `main` at `bd968fb`; nothing pushed.
- Unsigned app version `0.2.8`.
- Task 15A's seven earlier packaged fixes remain complete.
- Task 15B Task 1 is complete.
- Fresh gate: core 580 / UI 156 = 736 tests passed; typecheck passed.

## What Task 1 changed

`bd968fb` fixes the live bug where a generic shadow/creature could not attack because
`instantiateGeneric` gave it no skills or weapon and every generated attack was gated.

- Universal config v3 defines `attack_natural`.
- Runtime normalization adds canonical `universal_natural_attack` only when a full-stat story lacks
  an existing gate-legal natural-family action, including older frozen stories.
- The action has no skill/item/equipment/cost gate and receives deterministic `-4/-8` lethal damage.
- It resolves through ordinary gates, d20, visible ruling, committed mutation, and engine death
  authority; no synthetic narrator mechanic was added.
- The in-memory browser config mirrors canonical core.
- Regressions cover config normalization and a real submitted turn with a promoted creature whose
  hard state has `skills: []` and `inventory: []`.

## Exact next task: creation-time NPC capability loadouts

The user's proposal is correct, but preserve the domain boundary: the story has one frozen action
catalogue. An NPC receives capabilities (skills/attributes/resources/equipment) that gate a subset of
those actions; it does not receive a separate model-authored action list.

Implement Task 2 from the detailed plan:

1. Write failing `npcIntroduction.test.ts` coverage first. Extend only new-actor proposals with a
   bounded `skillIds` list (maximum three). The registrar prompt should see concise sealed story
   skill ids/names/descriptions.
2. The engine must filter unknown ids, deduplicate, and instantiate accepted skills at novice rank.
   Never accept model-authored ranks, actions, effects, equipment, attributes, or resource values.
3. Template-backed NPCs remain entirely template-authored; a proposal cannot override their loadout.
4. Decide and test safe handling of excess ids. Prefer structural rejection or a deterministic
   first-three bound, but ensure malformed output cannot suppress otherwise grounded registry work
   without an honest fallback.
5. Include learned skills and gate-relevant state in the NPC action-planner context so the provider
   can choose legal story actions. Engine `checkGate` remains final authority.
6. Test unknown, duplicate, empty, template, neutral, dead, and rollback cases. Run full verification,
   commit, then move to Task 3 if green.

## Remaining queue after Task 2

- Expand the universal action registry evenly across combat/social/exploration/crafting/utility. The
  old v2 registry had 14 families and no crafting family. Task 1 already consumed v3, so use v4 for
  the balanced expansion.
- Increase forge output from 20 to 30 actions (six/category) and from a prompted 4-8 to a validated,
  premise-relevant 6-10 skills. Ensure meaningful semantic diversity and provider token/deadline/
  checkpoint viability.
- Improve damage/HP balance, transient provider retry + ruling-derived fallback prose, and degraded
  recent-target/presence recovery in that order.

## Authority rules

- Engine/DM owns gates, dice, effects, damage, death, budgets, target legality, loot, progression,
  persistence, and rollback. Models select sealed ids and write prose only.
- Every actual fictional NPC/creature must be registry-backed; scenery and vague nouns must not.
- Only present living actors participate. Rulings appear before narration. Death requires lethal
  health threshold evidence. Player and NPC action budgets remain separate.
- Browser/SQLite bridge parity is mandatory and browser code cannot import native or `node:` modules.
