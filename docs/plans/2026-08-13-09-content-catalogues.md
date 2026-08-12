# Plan 09 — Content catalogues

**Created:** 2026-08-13
**Covers owner findings:** 20 (universal item catalogue), 25 (action + skill catalogues far richer;
universal skills; D&D 5e port; new Story Settings UI), 31 (weapon special skills)
**Size:** XL
**Depends on:** plan 08 (costs, cooldowns, resource roles). Relieves plan 02 (see §1).
**Blocked on owner decision D7.**
**Status:** Planned. Not authorized.

---

## 1. Why this plan is the other half of the P0

Plan 02 diagnosed the misclassification (finding 19) as having two halves. This is Half B.

The Solo Leveling story has **20 actions**; Cyraeth has 30. `CATALOG_MIN_ACTIONS = 30`
(`packages/core/src/types/actions.ts:88`) with `CATALOG_MIN_PER_CATEGORY = 6`. When only six social
actions exist and they are as narrow as "Reassure Survivor — comfort a traumatized refugee", every
ordinary sentence lands far from the nearest catalogue entry, and the classifier force-fits.

**Plan 02 makes the engine honest about poor fits; this plan makes poor fits rare.** Shipping 02
alone will make the game feel inert — say so to the owner when 02 lands, and treat this plan as its
necessary partner rather than a nice-to-have.

## 2. The three-layer catalogue model (existing, keep it)

| Layer | What it is | Where |
| --- | --- | --- |
| **Universal families** | 31 abstract semantic families (`attack_melee`, `influence`, `craft`…) that guide forge specialization. Not executable. | `packages/core/src/config/universal-actions.json` (v4) |
| **Universal actions** | Engine-owned executable actions available in every story — today only the natural attack. | `config/registry.ts` `applyUniversalActionDefaults` |
| **Story actions** | The frozen per-story catalogue the classifier picks from. | `StorySchema.actions` |

The owner wants growth at **all three** layers. Keep the layering — it is what stops a model
inventing mechanics.

## 3. Finding 25 — richer actions and skills

### 3.1 Expand the universal family registry (v5)

- [ ] **3.1a** Port from D&D 5e the families that genuinely have no representation today. Current
      gaps by inspection of the v4 list: no `stealth`/`hide`, no `perceive` distinct from `observe`,
      no `heal` (only `recover`), no `buff`/`debuff`, no `summon`, no `mount`, no `disarm` distinct
      from `control`, no `grapple`-adjacent `shove`/`trip`, no `dash`/`disengage`/`dodge` action
      economy, no `ready`/`prepare`.
- [ ] **3.1b** Bump `universal-actions.json` to `version: 5`. `mechanicsConfigVersions.universalActions`
      is snapshotted into every frozen rulebook, so **old stories keep v4 semantics** — verify that
      is true before relying on it.
- [ ] **3.1c** Keep at least six families per category (existing validation) and add the new
      categories the taxonomy implies. If a family does not fit `combat|social|exploration|crafting|
      utility`, extend `ActionCategorySchema` deliberately rather than mis-filing it.

### 3.2 A universal **skill** registry (new — mirrors universal actions)

Skills currently exist only per-story. The owner wants a configurable universal skill layer
"incorporating general D&D 5e mechanics".

- [ ] **3.2a** Create `packages/core/src/config/universal-skills.json`, versioned, with the same
      shape discipline as `universal-actions.json`. Seed with archetype-spanning skills so every
      playstyle the owner named (warrior, priest, mage, rogue, ranger, bard…) has a spine.
- [ ] **3.2b** Add `mechanicsConfigVersions.universalSkills` to the frozen schema.
- [ ] **3.2c** Skills carry the plan 08 fields (`skillType`, `cost`, `cooldownTurns`,
      `durationTurns`, `targeting`) — so **plan 08 must land first** or the registry has to be
      rewritten.

### 3.3 Forge generation targets

Current: Phase A validates 6–10 skills; Phase B generates exactly six actions per category (30
total). The owner wants "plethora… do not hold back".

- [ ] **3.3a** Raise targets. Proposed: **60–90 actions** (12–18 per category) and **20–30 skills**
      spanning at least five playstyle archetypes.
- [ ] **3.3b** **This will break the forge.** Phase B already needed its budget and fragment deadline
      raised for 30 actions (WORKLOG 2026-08-01, Task 15B.3). Tripling the output in one structured
      call will hit token limits, latency, and repair loops. **Split Phase B into per-category
      calls** (one call per action category, six calls) so each response stays small and reliable.
      This is the main engineering work of §3 and should be planned as its own changeset.
- [ ] **3.3c** Preserve the existing invariants: the ungated canonical natural attack survives; every
      action has a validated DC in band; family/category validation still applies; skill-coverage
      repair cannot accidentally gate the natural attack.
- [ ] **3.3d** Forge time and cost will rise materially. Measure and report both before/after; the
      owner should decide whether a slower, richer forge is acceptable.

### 3.4 "Out of the box" interlocking skills

The owner asked for skills that modify other skills/actions ("reinforce simple attack", "reinforce
weapon attack").

- [ ] **3.4a** This needs a **modifier** concept that does not exist: a skill whose effect is to
      alter another action's roll, damage, or cost. Design it as an engine-evaluated modifier list
      on `CharacterHardState`, applied in `resolver.ts` alongside the existing equipment and
      condition modifiers — **not** as a model-authored effect.
- [ ] **3.4b** Scope carefully: a general "skills that modify other skills" system is a combinatorial
      explosion. Start with a closed set of modifier kinds (`+N to checks of family X`,
      `+N damage with item kind Y`, `-N cost of skill Z`) and refuse anything else at validation.

## 4. Finding 20 — universal item catalogue

Seed: `C:\Users\anuji\Desktop\uni-items.txt` — 17 categories (Consumable, Tool, Ammo/Charge,
Material, Quest/Key, Currency, Wearable, Container, Book, Device, Food, Medicine, Access, Treasure,
Artifact, Companion, Transport).

Current `ItemKindSchema` is much narrower (weapon/armor/consumable/misc by observation of the live
data). The 17 categories map to **item kinds**, not items.

- [ ] **4.1** Extend `ItemKindSchema` to cover the 17 categories, keeping existing kinds as aliases
      so live saves decode.
- [ ] **4.2** Create `packages/core/src/config/universal-items.json` — engine-owned archetypes per
      kind (a "healing potion" archetype, a "lockpick" archetype), with `props` conventions and the
      plan 08 `staminaCost` where relevant. The forge specializes these into story items exactly as
      it specializes action families.
- [ ] **4.3** Reconcile with the **existing runtime loot system**. `equipment-loot.json` already
      defines 7 slots and 5 tiers with per-tier effect/bonus caps, and `StorySchema.items` is
      described in source as a *legacy* forge-time catalogue ("New V7 stories emit none; runtime item
      tables own loot"). **Do not resurrect the legacy path.** Universal item archetypes should feed
      the runtime loot generator, not repopulate `schema.items`. Verify this before writing code —
      getting it wrong would fork the item system in two.

## 5. Finding 31 — weapon special skills

> "used like normal weapon attacks, but with cooldowns, different per weapon; as rarity increases,
> power and uniqueness increase."

### Design

A weapon special is **an action granted by an equipped item**, gated on a cooldown.

- `ActionDef` already has `requiresEquipmentEnabler: z.boolean().optional()` — an action that exists
  in the rulebook but stays gated until equipped gear enables it. **This is exactly the hook needed.**
  Verify how it is currently evaluated in `checkGate` before designing around it.
- The item definition gains `grantsActionId?: string` and `specialCooldownTurns?: number`.
- Cooldown storage reuses plan 08's `CharacterHardState.cooldowns` keyed by action id — **do not
  invent a second cooldown mechanism.**
- Tier scaling rides the existing `equipment-loot.json` tier caps: `maximumEffects` and
  `maximumCheckBonus` already scale common→mythical, so a mythical weapon's special can legitimately
  carry more effects. Reuse those caps rather than inventing a parallel power budget.

- [ ] **5.1** RED: equipping a weapon grants its special action; unequipping revokes it; using it
      sets a cooldown; using it again before expiry is denied at the gate with a clear reason.
- [ ] **5.2** RED: a mythical weapon's special cannot exceed the tier caps in `equipment-loot.json`.
- [ ] **5.3** Rewind restores cooldown state exactly.

## 6. Finding 25.5 — the Story Settings catalogue browser

Moved here from plan 12 for cohesion: the UI exists to browse *this* plan's output.

- [ ] **6.1** Filter by category / skill type / tier; search; detail view showing gate requirements,
      costs, cooldown, duration, targeting, and the outcome table.
- [ ] **6.2** Must stay performant at ~90 actions + ~30 skills. Virtualize only if measurement says
      so; do not pre-optimize.
- [ ] **6.3** Design deliverable — see the design brief.

## 7. Implementation order

1. §3.1 universal families v5 (config only, low risk).
2. §4 item kinds + universal items config.
3. §3.2 universal skills config (**after plan 08**).
4. §3.3b forge Phase B split into per-category calls — **the risky one, alone in its own changeset**.
5. §3.3a raise generation targets.
6. §5 weapon specials.
7. §3.4 interlocking modifier skills.
8. §6 the browser UI.

## 8. Acceptance criteria

1. A newly forged story has 60–90 actions and 20–30 skills spanning five+ playstyles.
2. Forge success rate does not regress; measure across at least five forges before and after.
3. Existing v1/v2 stories load and play unchanged with their snapshotted config versions.
4. Weapon specials are granted by equipment, respect cooldowns, and honour tier caps.
5. The catalogue browser stays usable at the new scale.
6. Suite green; typecheck clean; bridge parity for any new bridge method.

## 9. Risks

- **Forge reliability is the make-or-break.** Tripling structured output is the single most likely
  way to break the product. §3.3b (splitting the call) is mandatory, not optional.
- **Cost and latency.** More actions means a bigger classifier prompt every turn, forever. Measure
  the per-turn token increase and report it — this has an ongoing money cost for the owner.
- **Two item systems.** §4.3 is a real trap; the legacy `schema.items` path must not be revived.
- **Combinatorial explosion** in §3.4 if modifier kinds are not closed.
