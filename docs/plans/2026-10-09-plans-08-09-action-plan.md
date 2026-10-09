# Action plan — finish plans 08 and 09

**Created:** 2026-10-09
**Status:** ACTIVE (named in `docs/HANDOFF.md`).
**Owner decision:** on 2026-10-09 the owner instructed: *"Create an action plan to finish of everything
from plan 8 and 9, and then you start picking them off one by one as you finish each step edit
handoffs properly commit and push to main do not wait for my go ahead to push."* That instruction
activates plans 08 and 09 and authorizes pushing each completed step to `main`.
**Executes:** `2026-08-13-08-resource-economy.md` and `2026-08-13-09-content-catalogues.md`. Those two
files stay the specification of *what*; this file is the order of work, the corrections found
against source on 2026-10-03/09, and the decisions taken so work is not blocked.

## Evidence

The owner's v0.2.9 play-test findings 16, 20, 21, 22, 23, 24, 25 and 31 (see
`2026-08-13-00-MASTER-INDEX.md`), plus the owner's selection-based-enablement proposal and the D8/D9
answers recorded in plan 09. Source verification on 2026-10-03/09 confirmed every premise below
unless marked as a correction.

## Decisions taken so work can proceed (owner may override any of them)

The owner asked for uninterrupted execution. These were open; each takes the recommendation already
on record and is cheap to change because every number lives in config.

| # | Decision | Taken |
| --- | --- | --- |
| D7 | New stories only, or migrate saves? | **New stories only.** New rulebook content uses `schemaVersion: 3`; v1/v2 stories load and play unchanged. Engine features (cooldowns, effects, recovery) activate only when a rulebook defines them. |
| D5 | Recovery model | **Blend, config-driven** (`economy.json`): out-of-combat stamina regen, a per-turn mana trickle, a small out-of-combat health trickle, an engine-owned Rest action, and restoring consumables. Never revives the dead. Applies to v3 rulebooks (resources with roles); legacy stories keep their current no-regen economy. |
| — | XP repeat curve | `[1, 0.8, 0.6, 0.5, 0.4]` — floor 0.4, never zero. |
| — | Weapon stamina paid win or lose? | **Yes**, like every existing attempt cost. |
| — | Mid-story enablement limits | Tier-gated by story progress; at most 2 per chapter; journalled; reversible. |
| — | May a model enable an ungated action? | **No.** The analyzer may enable only skill-gated pool actions or skills (closes the "enable ≠ learn" hole). The player may enable anything by hand. |

## Corrections to plans 08/09 (verified in source)

1. **Costs and cooldowns live on actions, not skills.** Players perform actions; skills gate them
   (`types/actions.ts` already has attempt `costs`). Cooldown state is keyed by **action id**. Skills
   gain a *type* and passive/toggle/reaction definitions, not a second cost system.
2. **No scene boundary exists in the engine**, so "per-scene" regen is implemented as deterministic
   *out-of-combat turn* regen (a character not involved in a combat ruling this turn).
3. **New hard-state fields need schema defaults**, because rewind re-parses old checkpoint blobs with
   the current `CharacterHardStateSchema` (`orchestrator/checkpoint.ts:75`). New fields on
   `CharacterHardState` are captured by checkpoints automatically; story-level state (the enabled
   pool set) is not and needs a checkpoint extension.
4. **Weapon specials reuse the existing `action_enable` equipment effect**
   (`types/equipment.ts`, `engine/equipment.ts:415`, checked by `gate.ts:124`) instead of a new
   `grantsActionId` field.
5. **Terminology:** the persisted equipment effects `action_enable` / `skill_enable` predate the
   enable/learn rule and mean *the wearer gains it*. They keep their names (persisted data); UI copy
   says "grants". New code uses enable/disable only for pool availability.
6. **The owner's source files no longer exist** (`universal-rpg-skill-taxonomy-expanded-non-combat.txt`,
   `uni-items.txt`). They were never committed, and on 2026-10-09 the owner reported the laptop holding
   them was formatted. Under the owner's existing grants ("you structure whatever the way you feel best",
   "add all the attributes yourself", "remove whatever you feel not plausible") engineering authors the
   whole pool and the item categories itself, organised into its own sections. The forge stays
   **hybrid** (story-specific actions authored, pool entries selected on top) until the pool is large
   enough to carry a story alone.

## Working protocol

Every step: verify premise → RED test → implement → GREEN → `npm run typecheck` + both suites →
commit (scope prefix) → append `docs/WORKLOG.md` → overwrite `docs/HANDOFF.md` → tick boxes here →
push to `main`.

## Steps

### Plan 08 — resource economy and skill mechanics

- [x] **S1. XP repeat penalty** (finding 16). Curve to `[1,0.8,0.6,0.5,0.4]`; count only the same
      actor's prior rulings; read `repetitionWindowTurns` instead of a hard-coded 5; NPC rulings never
      consume the player's window.
- [x] **S2. Resource roles** (finding 22). `ResourceDef.role`; deterministic legacy role inference
      (inverted `fatigue` stays `other`); generic NPCs receive health, mana and stamina; `schemaVersion: 3`
      accepted with the V2 contract plus "Full Stats v3 must define health, mana and stamina roles".
- [x] **S3. Weapon stamina cost** (finding 21). Typed `staminaCost` on legacy and runtime item
      definitions, clamped; one shared affordability function used by gate and resolver; a weapon attack
      that cannot pay is denied before the roll with code `insufficient_resource`.
- [x] **S4. Action cooldowns and role-denominated costs** (finding 23, part). `ActionDef.cooldownTurns`;
      `CharacterHardState.cooldowns` (default `{}`); start-of-turn tick; gate code `on_cooldown`; costs may
      name a resource role.
- [x] **S5. Timed effects / durations** (finding 23, part). Effects may apply a timed status (check bonus,
      attribute bonus, per-turn resource change) to self or target; `CharacterHardState.activeEffects`
      (default `[]`); ticked deterministically; visible on the ruling and living card.
- [x] **S6. Skill types and targeting** (finding 23, rest). `SkillDef.skillType`
      (`active|passive|reaction|toggle`) with passive modifiers, toggle upkeep (engine `toggle_skill`
      action), reaction triggers; `ActionDef.targeting` scopes (`self|single|multiple|all_allies|all_enemies|area`).
- [x] **S7. Recovery model** (finding 24). `economy.json`; out-of-combat regen, mana trickle, engine-owned
      Rest action, restoring consumables; clamped; never revives; journalled.
- [x] **S8. v3 forge + UI surfacing.** Forge prompts/validation emit roles, costs, cooldowns, skill types;
      living card shows all resources, cooldowns and active effects; ruling card explains new gate codes.

### Plan 09 — universal catalogues and enablement

- [x] **S9. Pool format + non-combat starter pool.** `universal-archetypes.json` + `universal-pool.json`,
      Zod schemas, the seven balance rules as tests over the whole pool, exclusion records.
- [x] **S10. Story enablement set.** Persisted per story (migration), checkpointed, materialized into the
      effective rulebook (roles → story ids, damage multiples → numbers); classifier sees only enabled
      entries; `mayDisableEntry` (D8) in core; bridge methods in both backends.
- [ ] **S11. Forge-time selection.** Setting-fit filter → section pick → entry pick, validated, with a
      deterministic fallback; wired into new-story creation.
- [ ] **S12. Combat and magic archetypes** with the exclusion list.
- [ ] **S13. Mid-story enablement** by the analyzer with every guard (pool id, tier gate, 2 per chapter,
      skill-gated only, own transaction, journal, checkpoint).
- [ ] **S14. Story Settings UI.** Enabled catalogue + pool browser with toggles and the D8 lock reason.
- [ ] **S15. Universal items** — item-kind expansion with legacy aliases; `universal-items.json` feeding loot.
- [ ] **S16. Weapon specials** via `action_enable` + S4 cooldowns + rarity scaling.
- [ ] **S17. External config overrides** — merge-by-id override files, validation with surfaced errors,
      per-story "locked to creation / follow my edits", past rulings never recomputed.
- [ ] **S18. Close-out** — master index status, plan 08/09 boxes, design notes, HANDOFF.

## Acceptance (whole plan)

Plan 08 §8 and plan 09 §11 acceptance criteria, plus: every step leaves typecheck clean and both test
suites green; existing v1/v2 stories behave exactly as before except for the XP curve (S1), which is
a deliberate global change because it answers a complaint about live play; rewind restores every new
piece of state.
