# HANDOFF - current live state

**Updated:** 2026-10-09 (plans 08 + 09 **complete** — every step S0–S18 shipped to `main`)
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

**Active plan:** none. The last one —
[`docs/plans/2026-10-09-plans-08-09-action-plan.md`](plans/2026-10-09-plans-08-09-action-plan.md), executing
plans 08 and 09 — is complete; its "Outcome" section lists what shipped, what did not, and why. Per
AGENTS.md, the next plan is picked deliberately with the owner (see the single next action).

## Planning rules

Every plan written before 2026-08-12 is decommissioned ([`docs/PLAN-POLICY.md`](PLAN-POLICY.md)).
Plans 01-07 and 10-12 of the 2026-08-13 set remain written but **not authorized**.

## Progress on the last plan (complete)

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
| S11 | Forge-time selection: setting-fit + expressibility filter → one sealed-enum model call → capped, topped up, deterministic fallback; enabled as `forge` after install and after regeneration; forge stays hybrid | done |
| S12 | Combat + magic archetypes (melee, brawling, ranged, defense, 5 elemental schools via an `{element}` param, healing, hexcraft), reaction skills paired 1:1 with their action (enable either → both), 8 recorded exclusions; pool now 63 archetypes / 222 entries | done |
| S13 | Mid-story enablement by the analyzer: sealed enum, skill-gated only, tier gate by completed chapters, 2 per chapter, asked only on a teaching cue, own transactions, journalled, turn-scoped; journal sentences for pool/recovery events | done |
| S14 | Story Settings: `RulebookCatalogue` (forged + enabled entries, provenance, kind/category/tier filters, search, detail with outcome table) and `PoolBrowser` (collapsed sections "n of m enabled", 40-entry lazy pages, whole-pool search, enable/disable, KEPT + D8 reason, tier-lock reason); core `catalogue/browse.ts` shared by both bridges (`listPoolSections`, `browsePool`); **tier lock now binds the player's toggles too** (forge exempt) — see the action plan's decisions | done |
| S15a | Item kinds: 17 finer kinds in the 7 existing families (`itemKindSatisfies`: broad needs accept the family, fine needs accept that kind or a generic one); `universal-items.json` (28 archetypes) — loot must name one and the archetype sets every mechanic; migration 18 (item `stamina_cost` — **was never persisted** — `restores_json`, `archetype_id`) | done |
| S15b | `consume_item` uses looted runtime items with `restores` (classifier offered them by id + name); quantity recorded on the ruling (`itemConsumed`), written at commit, used-up rows kept at 0 and restored by every rewind path | done |
| S16 | Weapon specials: `equipmentEnabled` pool actions (9 entries), offered to loot as a sealed `specialId`, attached only to a fitting weapon of sufficient tier, enabled turn-scoped in the commit (enablement split into stage + write); loot can no longer grant actions/skills through effects (**was: a common item could grant master rank**); D8 item half — held granting items keep an entry | done |
| S17a | Config overrides in core: `resolveConfig` (merge by id, remove, add, schema errors skip with file/id/field, unusable entries left out, balance → warnings, clamps), active config + per-story snapshot, locked (default) / follow modes, everything catalogue-aware threaded; §4c.12 immutability tested | done |
| S17b | Desktop shell reads `$APPDATA/config` (fs plugin JS added; capability names checked against the crate, not build-validated here — no GTK in this container); bridge methods in both backends; Story Settings § CONFIG (issues, open/reload, restore defaults, locked/follow with warning) | done |
| S18 | Close-out: plan 09 §5.3 two-stage selection (above 300 candidates), plan / index statuses, outcome report | done |
| — | **Plans 08 and 09 complete** (open: plan 09 §5.4 unmeasured, §7.3 design; the hybrid forge leaves acceptance 1 and part of 3 unmet as written — see the action plan's Outcome) | done |

## Verification state

After S18 (Linux/Node 22): `npm run typecheck` clean; core **901 / 68 files** (engine coverage 100%),
UI **211 / 32 files** = **1112** passing; UI production build verified at S17b (main chunk 457.2 kB /
126.5 kB gzip); root `npm test` passes here (the tinypool worker crash is Windows/Node 24 only — plan 07
P0-0, not authorized). `cargo check` cannot run in this container (missing GTK system libraries), so
the Rust shell and the S17b capability file have not been build-validated since plans 08/09 began.

## Facts established earlier (still true — do not re-derive)

- The classifier's `npcIntents` are merged into resolution at `orchestrator/turn.ts:666` with no
  disposition check (live violation of `CONTEXT.md` invariant 9; plan 02, not authorized).
- Generic NPCs get `attributes: {}` and only lethal resources (`bootstrap/instantiate.ts`); S2 adds mana
  and stamina, plan 05 (not authorized) adds attribute variety.
- `ResourceDef.regenPerScene` exists in rulebooks but nothing applies it; S7's `economy.json` is the
  recovery model now, and `regenPerScene` stays ignored (forge should stop emitting it in S8).
- Runtime items live outside hard state and checkpoints. Anything a turn does to them must be recorded
  on its rulings and undone in `orchestrator/history.ts undoRuntimeItemsFromIdx` (loot: `ruling.loot`;
  consumption: `ruling.itemConsumed`). A used-up instance stays at quantity 0 for that reason; rewind does
  not re-equip a slot it held.
- The owner's taxonomy files are **permanently lost** (never committed; laptop formatted; not in Google
  Drive). Engineering authors the pool itself under the owner's existing grants — see the action plan.
- Equipment's `resource_capacity` effect is display-only: nothing in the engine applies it (found during
  S6b). Not fixed — out of scope; worth a future plan item.
- `store.transaction` queues and does not nest. Code that must write inside a turn's commit uses a
  stage-then-write split (e.g. `stagePoolEnablement` / `writeStagedEnablement`).
- The pool JSON is bundled into the UI (the memory bridge imports it). Fine at 222 entries; at ~3,000
  (~1.5 MB raw) it should be loaded lazily.
- The design deliverable for the Story Settings surfaces (plan 09 §7.3, design brief §5) has not been
  produced; S14 made reasonable calls (see WORKLOG S14) that a designer may revise.
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

**An owner decision, in two parts — do not start new work without it.**

1. **Build and play-test** plans 08 + 09 on Windows (the owner's machine was formatted, so the toolchain
   is fresh). The build also validates the S17b fs capability names against the real `tauri-build`, and
   play is the only way to judge pool selection quality with a real model and to measure forge time
   (plan 09 §5.4). Things worth trying: Story Settings → Rulebook catalogue / Universal pool / Rulebook
   config; drinking a looted potion and rewinding; a weapon special from loot after the first chapter;
   resting and the Conditions block on the living card.
2. **Choose the next plan.** The master index's recommended order puts plan **02 (classifier fidelity)**
   first: item 19 is the owner's own P0, and misclassification undermines judging everything else,
   including the new catalogue. Recommendation: 02 next, then 06 (narration integrity). Plan 04
   (character panels) is now unblocked by 08 if the owner prefers visible UI work.
