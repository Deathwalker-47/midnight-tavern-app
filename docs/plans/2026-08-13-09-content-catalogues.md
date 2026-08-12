# Plan 09 — Universal catalogues and story-scoped enablement

**Created:** 2026-08-13. **Rewritten 2026-08-13** after the owner proposed selection-based
enablement, which replaces the previous "generate a much bigger catalogue per story" approach.
**Covers owner findings:** 20 (universal item catalogue), 25 (richer actions and skills; universal
skill set; catalogue UI), 31 (weapon special skills)
**Size:** XL
**Depends on:** plan 08 (costs, cooldowns, resource roles). Relieves plan 02 (see §1).
**Blocked on owner decisions D7, D8, D9 (§9).**
**Status:** Planned. Not authorized.

---

## 0. The owner's proposal, and why this plan now follows it

> "If increasing the universal actions and skills will have a bad impact on the product, latency and
> user money unnecessarily being wasted — let the story creation AI decide which skills and actions
> to enable from the universal list based on story content, and then the user will have an option to
> lock/unlock skills/actions manually. Also during the roleplay, if a model requires to unlock a new
> skill or action because the story demands it, it can do that as well. Only from our universal set —
> they can't invent any new ones."

**Adopted.** The previous version of this plan proposed growing each story's generated catalogue to
60–90 actions. That was wrong in three ways the owner correctly anticipated:

| Problem with generate-bigger | How enablement fixes it |
| --- | --- |
| The classifier prompt carries the catalogue **every turn, forever**. 90 actions is a permanent latency and token tax. | Only the *enabled subset* is sent. Pool size and per-turn cost are decoupled. |
| The forge must **author** 90 full `ActionDef`s (DC, governing attribute, gates, four-outcome effect tables) in structured output. It already needed budget and deadline increases for 30. Tripling it was the largest single risk in the plan set. | The forge **selects ids**. A list of 50 strings is a small, reliable structured output. |
| A frozen rulebook cannot grow. If play goes somewhere the forge did not anticipate, the catalogue never fits again. | Controlled mid-story enablement from a sealed pool. |

**The pool size becomes free.** A 3,000-entry universal catalogue costs nothing at runtime, because
runtime only ever sees what a story enabled.

## 1. Why this plan is still the other half of the P0

Plan 02 diagnosed finding 19 (misclassification) as having two halves. This is Half B, and the
diagnosis is unchanged: the Solo Leveling story has **20 actions**, Cyraeth 30, and when the nearest
catalogue entry to "show my empty hands" is "Reassure Survivor — comfort a traumatized refugee", the
classifier force-fits.

Enablement fixes this **better** than generation would have: a story can enable 60 well-fitted
actions drawn from thousands of pre-authored ones, instead of having a model invent 90 mediocre ones.

Shipping plan 02 alone still makes the game feel more inert. These two must land close together.

## 2. Source material

| File | Content | Scale |
| --- | --- | --- |
| `universal-rpg-skill-taxonomy-expanded-non-combat.txt` (owner-supplied) | 166 sections. Part I (1–67) combat/magic/craft; Part II (68–166) a large non-combat expansion — conversation, empathy, family, reputation, etiquette, diplomacy, governance, politics, law, courts… | **~3,000+ named skills** |
| `uni-items.txt` (owner-supplied) | 17 item categories | 17 kinds |
| `packages/core/src/config/universal-actions.json` | 31 existing action families, v4 | 31 families |

**The taxonomy is names, not mechanics.** Not one entry carries a DC, governing attribute, outcome
table, cost, or gate. §4 is how that gets solved affordably.

- [ ] **2.1** Read the full taxonomy file before implementing (it exceeds a single read; page through
      it). Record the exact section count and total named-skill count in this plan — the numbers
      above are an estimate from the first ~2,000 lines.

## 3. The three-layer model (revised)

| Layer | What it is | Frozen? | Sent to models at runtime? |
| --- | --- | --- | --- |
| **Universal pool** | Every action and skill the product knows about, pre-authored, versioned config. Thousands of entries. | Yes — shipped config, versioned | **No** |
| **Story enablement set** | The subset of pool ids active for one story. Chosen at forge time, editable by the player, extendable mid-story under rules. | No — grows under §6 rules | **Yes** — this is the classifier's catalogue |
| **Character learned set** | What a character has actually learned. | No | Yes, as part of hard state |

**Enable ≠ learn.** This is the most important rule in this plan.

- *Enabling* a skill puts it in the story's catalogue: it becomes a thing that exists in this world.
- *Learning* it still requires the existing `unlockPaths` (trainer / manual / trial) and the gate.

Without that separation, "the story demands it" becomes a route for a model to grant itself
Resurrection to escape a death. **A model may enable; only the engine may grant.**

## 4. Authoring the pool affordably — archetype + flavour

> **Owner grant, 2026-08-13:** *"You can add all the attributes of action or skills that are not
> given yourself."*
>
> Engineering therefore owns the mechanical attributes for every pool entry — DC, governing
> attribute, resource costs, cooldown, duration, targeting, gates, and the four-outcome effect table.
> The owner does not need to specify individual numbers. **That authority is bounded by §4.5's
> balance rules, which exist so the result is reviewable rather than arbitrary.**

Pre-authoring 3,000 balanced definitions is months of work and is not proposed.

The existing `universalFamily` concept already carries the answer: **the archetype owns the
mechanical shape; the named entry owns the flavour.**

```
archetype: elemental_bolt
  category: combat, governingAttribute: <story's magic attribute>, dc: 12,
  costs: { mana: 4 }, effects: { success: { resourceDeltaTarget: { <lethal>: -6 } }, ... }
  parameters: { element: string }

named entries drawn from the taxonomy:
  Fire Bolt      -> elemental_bolt { element: "fire" }
  Ice Bolt       -> elemental_bolt { element: "ice" }
  Lightning Bolt -> elemental_bolt { element: "lightning" }
  Shadow Bolt    -> elemental_bolt { element: "shadow" }
  Water Bolt     -> elemental_bolt { element: "water" }
```

Five taxonomy entries, one authored archetype. The taxonomy's structure makes this unusually
tractable — sections 10–15 (fire/ice/lightning/water/earth/wind magic) are near-identical shapes with
different elements, and sections 27–29 (healing / buff / debuff) likewise.

- [ ] **4.1** Derive the archetype set from the taxonomy by collapsing shape-identical entries.
      Target: **80–150 archetypes** covering the whole 3,000-entry pool. Record the mapping in config
      so it is auditable.
- [ ] **4.2** Entries that genuinely have no archetype (section 67 "Unique / Legendary" —
      "Reverse Cause and Effect", "Swap Bodies") are **excluded from the pool for now**. They need
      bespoke mechanics the engine cannot express. Record the exclusion list with reasons; do not
      quietly drop them.
- [ ] **4.3** Non-combat sections (68–166) are largely **social/knowledge checks** against an
      attribute with no target harm — a very small number of archetypes covers hundreds of entries
      (`social_check`, `knowledge_check`, `craft_check`, `care_check`). Do these first; they are the
      cheapest coverage in the whole file and they directly address finding 19, because "show my
      empty hands" has an honest home in a `social_check`-shaped *Reassurance* or *De-Escalation*.
- [ ] **4.4** Story-specific numbers (which attribute governs, what the lethal resource is called)
      resolve at **enablement time** against the frozen story schema, not in the pool. The pool is
      story-agnostic.

### 4.5 Balance rules the authored attributes must obey

These make §4's authoring authority auditable. Every one is machine-checkable, so they become
validator tests rather than opinions.

| Attribute | Rule |
| --- | --- |
| `dc` | Within the existing band `DC_MIN 5 … DC_MAX 25` (`types/actions.ts:90`). Trivial 5–9, standard 10–14, hard 15–19, extreme 20–25. An archetype's DC must match its stated difficulty word. |
| Resource cost | Scales with tier: common 0–2, uncommon 3–5, rare 6–9, legendary 10–14, mythical 15+. Denominated in plan 08's resource **roles**, never raw ids. |
| `cooldownTurns` | 0 for at-will; 1–2 for strong; 3–5 for tier-defining; >5 only for legendary/mythical. |
| Damage / healing | Expressed as a multiple of the story's baseline natural-attack delta, so it scales with any story's numbers rather than being absolute. |
| Outcome table | All four outcomes present. `crit_success` strictly better than `success`; `crit_failure` strictly worse than `failure`. Never zero-effect on all four. |
| Gates | A skill-requiring action names a skill in the same archetype family. No action requires an item kind the pool does not define. |
| Symmetry | Shape-identical entries (Fire/Ice/Lightning Bolt) must have **identical** numbers. Flavour differs; mechanics do not. Enforced by deriving them from one archetype. |

- [ ] **4.6** Write these as validator tests in `packages/core/test/config/` that run over the whole
      pool, so a badly authored entry fails CI rather than reaching a player. This is the mechanism
      that makes bulk authoring safe.
- [ ] **4.7** Where an entry cannot satisfy the rules without inventing a new engine capability
      (summoning, transformation, time manipulation), it goes on §4.2's exclusion list rather than
      being forced into an ill-fitting archetype. **Record it; do not silently drop it.**

## 5. Forge-time selection (owner's point 1)

- [ ] **5.1** Replace Phase B's action *authoring* with action *selection*: given the premise, the
      generated attributes/skills/resources, and a compact index of the pool (archetype + name +
      one-line description, **not** full definitions), return a list of ids to enable.
- [ ] **5.2** Target **40–70 actions** and **20–40 skills** enabled per story. Validate: minimum
      coverage per category survives (the existing `CATALOG_MIN_PER_CATEGORY` rule), the ungated
      canonical natural attack is always enabled, and every selected id exists in the pool.
- [ ] **5.3** The pool index sent for selection is itself large (~3,000 lines). **Do not send it
      whole.** Two-stage: first select ~15 relevant *sections* from the 166, then select entries
      within them. This keeps each structured call small and is the same funnel shape plan 11 uses
      for the move taxonomy.
- [ ] **5.4** Selection is far cheaper than authoring, so forge latency and cost should **drop**.
      Measure before/after and report — if it does not drop, the two-stage design is wrong.

## 6. Mid-story enablement (owner's point 3) — the part needing the most care

A model may propose enabling a pool entry when the story demands it. Guards, all engine-owned:

- [ ] **6.1** **Sealed source.** The proposal names a pool id. Unknown id → rejected. Same Zod-enum
      discipline the classifier already uses.
- [ ] **6.2** **Tier gating.** A pool entry carries a tier; enabling above the story's current
      progress tier is refused. A legendary skill cannot appear in chapter one.
- [ ] **6.3** **Rate limit.** At most N enablements per chapter (proposed: 2). Prevents a slow leak
      of the entire pool into every story.
- [ ] **6.4** **Enable ≠ learn** (§3). Enablement never grants the skill to anyone.
- [ ] **6.5** **Checkpointed.** The enablement set is hard state and must be captured in the turn
      checkpoint, so rewind un-enables what the reverted turn enabled. **Missing this breaks
      invariant 7** and is the most likely silent bug in this plan.
- [ ] **6.6** **Visible and reversible.** Every enablement is a journal event and the player can
      disable it again from the UI (§7).
- [ ] **6.7** **Which model proposes?** Recommendation: **not** the narrator (it would enable things
      to justify prose it already wrote) and **not** the classifier (it would bias toward enabling
      whatever it failed to classify — a feedback loop that would defeat plan 02). Prefer a bounded
      call on the **analyzer** or a dedicated post-turn stage, running off the critical path, so a
      failure never blocks a turn. **Owner decision D9.**

## 7. The enablement UI (owner's point 2, and finding 25.5)

Two surfaces, both in Story Settings:

1. **Enabled catalogue** — what this story currently uses. Filter by category / type / tier, search,
   detail view showing gate requirements, costs, cooldown, duration, targeting, outcome table.
2. **The pool browser** — everything available, with enable/disable toggles, grouped by the
   taxonomy's sections.

- [ ] **7.1** The pool browser must stay usable at ~3,000 entries. Virtualize, and lazy-load section
      contents. Measure; do not guess.
- [ ] **7.2** Disabling an action that a character has already **learned** is a conflict. Proposed:
      allow it, mark the learned skill dormant, keep the hard state intact so re-enabling restores
      it. Never delete learned hard state because a catalogue toggle changed. **Owner decision D8.**
- [ ] **7.3** Design deliverable — see the design brief.

## 8. Findings 20 and 31 (unchanged from the previous version)

### 8.1 Universal items (finding 20)

- [ ] Extend `ItemKindSchema` to cover `uni-items.txt`'s 17 categories, keeping existing kinds as
      aliases so live saves decode.
- [ ] Add `universal-items.json` — engine-owned archetypes per kind, feeding the **runtime loot
      generator**.
- [ ] **Do not revive `StorySchema.items`.** Source describes it as a legacy forge-time catalogue
      ("New V7 stories emit none; runtime item tables own loot"). Verify before writing code —
      forking the item system in two is a real trap here.

### 8.2 Weapon specials (finding 31)

- [ ] `ActionDef.requiresEquipmentEnabler` already exists — an action gated until equipped gear
      enables it. **This is the hook.** Verify how `checkGate` evaluates it before designing around it.
- [ ] Item definitions gain `grantsActionId?` and `specialCooldownTurns?`.
- [ ] Cooldowns reuse plan 08's `CharacterHardState.cooldowns`. **Do not invent a second cooldown
      mechanism.**
- [ ] Rarity scaling rides `equipment-loot.json`'s existing per-tier caps (`maximumEffects`,
      `maximumCheckBonus`) rather than a parallel power budget.
- [ ] A weapon special is a **granted enablement**, which composes cleanly with §3's model: equipping
      enables, unequipping disables.

## 9. Owner decisions

| # | Decision |
| --- | --- |
| D7 | New stories only, or migrate existing saves? (unchanged; still the biggest cost driver) |
| **D8** | Disabling an action a character has already learned — dormant (recommended) or forbidden? |
| **D9** | Which model may propose mid-story enablement, and should it require player confirmation the first time? |

## 10. Implementation order

1. Pool config format + archetype set for the **non-combat sections only** (§4.3) — cheapest, highest
   impact on finding 19, proves the format.
2. Enablement set: schema field, repository, checkpoint integration (§6.5). **No UI, no selection.**
3. Forge-time selection replacing authoring (§5).
4. Combat/magic archetypes (§4.1).
5. Mid-story enablement with all guards (§6).
6. The two UI surfaces (§7).
7. Items (§8.1), then weapon specials (§8.2).

## 11. Acceptance criteria

1. A new story enables 40–70 actions and 20–40 skills selected from the pool, and forge cost and
   latency **drop** versus authoring.
2. The classifier prompt contains only the enabled subset; per-turn tokens do not grow with pool size.
3. No model can introduce an action or skill outside the pool.
4. Mid-story enablement respects tier gating and the per-chapter rate limit, is journalled, and is
   reversible.
5. Enabling never grants a skill to a character.
6. Rewind restores the enablement set exactly.
7. The pool browser is usable at full scale.
8. Existing v1/v2 stories load and play unchanged.
9. Suite green; typecheck clean; bridge parity for every new method.

## 12. Risks

- **Authoring effort is still the dominant cost**, just far smaller than before. §4.1's collapse
  ratio (3,000 entries → 80–150 archetypes) is the number that decides whether this is weeks or
  months. **Validate it on the non-combat sections first (§4.3) before committing to the whole pool.**
- **Mid-story enablement is the drift risk.** Every guard in §6 exists for a reason; §6.7's choice of
  proposing model especially — wiring it to the classifier would create a feedback loop that
  undermines plan 02.
- **§6.5 (checkpointing enablement)** is the most likely silent correctness bug.
- **Selection quality is unproven.** A model choosing 50 of 3,000 ids may choose badly. Measure by
  replaying the owner's existing premises through selection and having the owner judge the result
  before this ships.
