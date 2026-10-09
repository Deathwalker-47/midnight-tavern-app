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
| S3 | Weapon stamina cost: typed `staminaCost` on items (clamped ≤10), v3 default 1/2 by hands, shared `attemptCost` for gate + resolver, gate code `insufficient_resource` | done |
| S4 | Action cooldowns (`ActionDef.cooldownTurns`, optional `hard.cooldowns`, gate code `on_cooldown`, end-of-turn tick of pre-existing cooldowns only) + role-denominated costs (`normalizeCost`) | done |
| S5 | Timed statuses: `statusSelf`/`statusTarget` on outcomes, optional `hard.activeEffects`, check/attribute bonuses in rolls, end-of-turn per-turn pool changes reported as `status_<id>` rulings | done |
| S6a | **Pre-existing defect fixed:** `learn_skill` was never routed in the V7 turn pipeline (always refused as an unknown action). Now `resolveLearnSkill`: first usable path in rulebook order; trainer paths need a present, living, non-hostile teacher | done |
| S6b | Passive skills: `SkillDef.skillType` + bounded `passive` bonuses (category-scoped check bonus, attribute bonus) on both sides of a roll (`roll.passiveModifier`); gate code `not_invocable`; validator rejects actions gated by a passive and no longer demands passive/toggle skills be "used" by an action | done |
| S6c | Toggle skills: `SkillDef.toggle` (upkeep + bonus), engine action `toggle_skill` (offered to the classifier only when the rulebook has toggles), optional `hard.toggledOn`, upkeep paid at the end of every turn on (incl. the first), lapse reported as a ruling | done |
| S6d | Reaction skills: `SkillDef.reaction` (`attacked`/`damaged` → action vs the attacker), `planSkillReactions` after all NPC actions, one per character per turn, never chained, through the normal gate (`asReaction`); reaction-gated actions are reaction-only; rulings carry `reaction` | done |
| S6e | Targeting scopes: `ActionDef.targeting` (`self/single/multiple/all_allies/all_enemies/area`), `expandTargets` (sides = validated hostility flag), `resolveAgainstEach` (one cost/cooldown/roll/XP, one ruling per target, target-side effects only after the first), gate code `no_target`, `MechanicalIntent.targetIds`; all turn resolutions go through one `resolveIntent` | done |
| S7 | Recovery: `config/economy.json` (versioned into rulebooks); end-of-turn regen as shares of max (stamina 25% / mana 10%, 5% in combat / health 5%, min 1; in combat = acted in or hit by a combat or wounding ruling), journalled as `recovery` events, not rulings; engine actions `take_rest` (50% health, full stamina, 50% mana, 3-turn cooldown, refused with enemies present — gate code `in_combat`) and `consume_item` (`ItemDef.restores`); v3 only for regen/rest; never revives; engine action ids reserved in the validator | done |
| — | **Pre-existing defect fixed (found in S7):** the narrator was told every no-roll ruling was DENIED (routine automatic successes, status ticks, toggles, learning) | done |
| S8a | Forge emits v3 for Full Stats: deterministic core pools + roles (`withCorePools`), passive/toggle skills kept, reactions → active (pool supplies them), role-keyed costs survive stabilization, prompts teach roles/costs/cooldowns/targeting | done |
| S8b | UI: living card CONDITIONS (statuses in words, recovering actions) + skill tags (PASSIVE / TOGGLE ON-OFF / REACTION); ruling card `automatic` variant (no-roll rulings that changed something were previously invisible), gate-code titles, reaction / target-spread / cooldown / status facts, Conditions + Passive modifier terms | done |
| — | **Plan 08 complete** | done |
| S9 | Universal pool format (`config/pool.ts`: story-agnostic archetypes by attribute/pool **role**, health as multiples of the baseline hit; entries = flavour only, tier inherited) + balance rules (`config/poolRules.ts`, plan 09 §4.5 as code) + non-combat starter pool: 25 sections, 28 action + 8 skill archetypes, 153 entries (5 recorded exclusions); id lock test | done |
| S10a | Enablement set in core: migration 17 `story_pool_enablements` (snapshots the materialized definition), `catalogue/` (attribute-role inference, materialization, enable/disable + D8 guard, effective schema), `requirePlayableStory` for turns/history/suggestions, turn-made enablements removed on rewind | done |
| S10b | Bridge methods `listPoolEnablements` / `enablePoolEntry` / `mayDisablePoolEntry` / `disablePoolEntry` in both backends, sharing core's pure `catalogue/plan.ts` (parity test over real core + store); cards/dossier on the effective rulebook | done |
| S11–S18 | Plan 09 (selection, combat archetypes, mid-story enablement, UI, items, weapon specials, external config, close-out) | not started |

## Verification state

After S10b (Linux/Node 22): `npm run typecheck` clean; core **826 / 59 files** (engine coverage 100%),
UI **193 / 29 files** = **1019** passing; UI production build verified; root `npm test` passes here (the tinypool worker crash is
Windows/Node 24 only — plan 07 P0-0, not authorized).

## Facts established earlier (still true — do not re-derive)

- The classifier's `npcIntents` are merged into resolution at `orchestrator/turn.ts:666` with no
  disposition check (live violation of `CONTEXT.md` invariant 9; plan 02, not authorized).
- Generic NPCs get `attributes: {}` and only lethal resources (`bootstrap/instantiate.ts`); S2 adds mana
  and stamina, plan 05 (not authorized) adds attribute variety.
- `ResourceDef.regenPerScene` exists in rulebooks but nothing applies it; S7's `economy.json` is the
  recovery model now, and `regenPerScene` stays ignored (forge should stop emitting it in S8).
- `consume_item` only consumes **rulebook** items that declare `restores`. Runtime loot items (the
  equipment system, stored outside hard state) cannot be consumed yet, and the forge does not yet emit
  `restores` — S8 (forge) and S15 (universal items) must close both.
- The owner's taxonomy files are **permanently lost** (never committed; laptop formatted; not in Google
  Drive). Engineering authors the pool itself under the owner's existing grants — see the action plan.
- Equipment's `resource_capacity` effect is display-only: nothing in the engine applies it (found during
  S6b). Not fixed — out of scope; worth a future plan item.
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

Do **S11**: forge-time pool selection (plan 09 §5). After Phase A, deterministically filter the pool by
`settingFit` and by what the rulebook can express (`materializeEntry` refusals), ask one bounded model
call to pick sections, then one to pick entry ids (sealed Zod enum of the candidates), validate, and
fall back deterministically (e.g. a fixed starter set per section) when the model fails. Enable the
picks with source `forge` after the story is created. Keep the forge **hybrid**: the authored Phase B
catalogue stays; the pool adds to it. Measure the extra latency honestly.