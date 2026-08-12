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

### 3.1 The absolute rule (owner, 2026-08-13)

> *"No one can make user or any characters learn a skill. You can only unlock or lock it in the
> global pool of available skills/actions."*

**Enablement operates on catalogue availability ONLY. It never touches character hard state.**

| Operation | Who may do it | What it changes |
| --- | --- | --- |
| Enable / disable a pool entry | forge at creation; the player by hand; a model's validated mid-story proposal | the **story's catalogue** — what exists in this world |
| A character learns a skill | **the ledger only**, via the deterministic paths in §3.2 | that character's **hard state** |

A model may never cause a character to learn anything, directly or indirectly. Enabling
`Resurrection` into a story's catalogue does not put it in anyone's hands — it only means the world
now contains such a thing.

### 3.2 How characters actually learn, unchanged by this plan

All of these are engine-owned, deterministic, and ledger-written:

- `startingState.skills` at forge time.
- The existing `unlockPaths` — `trainer` / `manual` / `trial` — routed through
  `LEARN_SKILL_ACTION_ID` → `tryUnlock` (`packages/core/src/engine/unlock.ts`).
- Mastery rank advancement from accumulated successes (`masteryAdvance`).
- A quest reward the **player explicitly chooses** from a fixed engine-derived set (plan 10 §7).

None of these is a model decision. The classifier may recognise "I ask the smith to teach me", but
the engine decides whether the prerequisites, cost, and gate permit it.

### 3.3 Terminology — fix this now or it will cause a bug

The word "unlock" is currently overloaded across the codebase and these plans, and the two meanings
have opposite authority rules. **Every plan, test name, type, and UI string must use:**

| Term | Meaning | Authority |
| --- | --- | --- |
| **enable / disable** | a pool entry is or is not in this story's catalogue | model may propose; player may set |
| **learn / grant** | a character acquires a skill into hard state | **ledger only** |

`SkillDef.unlockPaths` is pre-existing and means *learn*. Do **not** rename the field (it is
persisted in frozen schemas), but never describe enablement as "unlocking" in new code or copy.
Plan 10's quest reward `skill_unlock` **must be renamed `skill_grant`** for the same reason —
see plan 10 §3.

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
- [ ] **4.2** **Exclusion is engineering's call** (owner, 2026-08-13: *"remove whatever you feel not
      plausible"*). An entry is excluded when the engine cannot express it without new capabilities.
      Record every exclusion with a reason (§4b.2 keeps it in the file with `"excluded": true`), so
      the decision is reviewable and reversible rather than an unexplained absence.

      The exclusion test: **can this be expressed as a gated d20 check producing deterministic
      effects on tracked state?** If not, it is out.

      Excluded by that test, with the reason:

      | Group | Reason |
      | --- | --- |
      | §67 Unique/Legendary — "Reverse Cause and Effect", "Swap Bodies", "Return From Death Under Specific Condition", "Turn Lies Into Reality" | Require rewriting committed history or engine identity. Directly violate the immutability of past rulings. |
      | §22 Time Magic — "Stop Time", "Rewind Time", "Undo Injury", "Reset Position" | Same: they mean un-committing a ruling. The engine's rollback is a *player* affordance, not an in-fiction power. |
      | §30 Summoning, §31 Transformation (whole sections) | Need a creature-instantiation and body-swap model that does not exist. Genuinely good features — hold for a future plan rather than fake them. |
      | §54 Soul, §55 Dream (whole sections) | Need a parallel state space (souls, dream layers) with no engine representation. |
      | §61 Sacrifice — "Sacrifice Lifespan", "Sacrifice Memory", "Sacrifice Skill" | Trade against state the engine does not track. **Keep** the ones that trade tracked resources (Sacrifice Health/Mana/Stamina/Item). |
      | §59 Luck — "Reroll", "Force Reroll", "Probability Shift" | Re-rolling breaks the "swipe never re-rolls" invariant and the determinism guarantee. **Keep** the passive ones (Increased Luck) as flat modifiers. |
      | §46 Languages (whole section) | Better modelled as story flags/lore than as skills with DCs. |

      Everything else in the 166 sections is expressible. Note that the exclusions are concentrated
      in Part I; **the non-combat expansion (§68–166) is almost entirely expressible** as social,
      knowledge, craft, and care checks — which is why §4.3 does it first.
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

## 4b. Pool structure (engineering's call, per owner grant)

> **Owner, 2026-08-13:** *"You structure whatever the way you feel best for all the actions and
> skills."*

Two files, both versioned config shipped with the app, both snapshotted into a frozen rulebook via
`mechanicsConfigVersions` so an old story keeps the semantics it was forged against.

### `universal-archetypes.json` — the mechanics (80–150 entries)

An archetype owns everything mechanical. It is story-agnostic: it refers to attributes and resources
by **role**, never by a story's specific ids, and expresses damage as a multiple of the story's
baseline rather than an absolute number.

```jsonc
{
  "id": "arch.magic.elemental_bolt",
  "kind": "action",
  "category": "combat",
  "governingRole": "magic",              // resolved to a real attribute at enablement
  "dc": 12,
  "costs": { "mana": 4 },
  "cooldownTurns": 0,
  "targeting": { "scope": "single" },
  "damageMultiple": 1.5,                 // × the story's baseline natural-attack delta
  "params": [{ "name": "element", "type": "string" }],
  "effects": { "crit_success": {...}, "success": {...}, "failure": {...}, "crit_failure": {...} }
}
```

### `universal-pool.json` — the named entries (~3,000)

An entry is flavour plus a pointer at an archetype. It carries **no** mechanics of its own; that is
what makes bulk authoring safe and what guarantees §4.5's symmetry rule by construction.

```jsonc
{
  "id": "uni.magic.fire.fire_bolt",
  "name": "Fire Bolt",
  "kind": "action",
  "archetypeId": "arch.magic.elemental_bolt",
  "params": { "element": "fire" },
  "section": "10-fire-magic",            // the taxonomy's own section, preserved
  "tier": "common",
  "tags": ["magic", "fire", "ranged", "damage"],
  "settingFit": ["fantasy", "any"],      // drives forge selection; see §5
  "description": "A darting bolt of flame."
}
```

**Id scheme:** `uni.<domain>.<group>.<snake_name>` for entries, `arch.<domain>.<shape>` for
archetypes. Stable forever — ids are persisted in enablement sets and frozen rulebooks, so **an id
may never be reused or repurposed**. Renaming a display name is fine; changing an id is a migration.

**Why `section` is preserved verbatim:** the owner's taxonomy is already a good human organisation
(166 named sections), it is what the pool browser groups by, and keeping it means the file can be
re-imported and diffed against future revisions of the taxonomy.

**Why `settingFit` exists:** a modern-day thriller should not be offered Necromancy, and a medieval
story should not be offered Drone Control. This tag is the cheapest possible relevance filter and it
runs deterministically *before* any model sees the index — which keeps §5.3's selection prompt small
and stops the forge wasting tokens rejecting obviously wrong entries.

**Why `tags` exists separately from `section`:** sections are taxonomic (where a human would file
it), tags are functional (what it does). Selection and the plan 11 suggestion funnel both key off
tags; the browser keys off sections.

- [ ] **4b.1** `kind: "action" | "skill"` distinguishes the two, but they share one file, one id
      scheme, and one browser. They differ only in whether they gate (skill) or are performed
      (action). Keeping them in one structure avoids two parallel systems that would inevitably
      drift, which is the same mistake §8.1 warns about for items.
- [ ] **4b.2** Entries excluded per §4.2 stay in the file with `"excluded": true` and a reason, so
      the exclusion is visible and reviewable rather than an absence.

## 4c. External configuration and user overrides

> **Owner, 2026-08-13:** *"All the universal items should be configurable from outside, even their
> attribute changes."*

Everything in the universal layer — archetypes, pool entries, and items — must be editable by the
human outside the app, including the mechanical numbers (DC, costs, cooldowns, damage multiples,
effect tables, tiers), not merely enable/disable.

### 4c.1 This does not weaken the authority wall — say so explicitly

The authority wall forbids **models** writing mechanics. It has never forbidden the **human**. In a
solo game the player is their own game master, and editing a rulebook is what game masters do. A
future agent must not "fix" this as a violation.

The wall is preserved because the edit path is: human → file on disk → validated on load → frozen
into a story. No model is anywhere on that path.

### 4c.2 Where overrides live

Shipped defaults stay in the app bundle and are never written to. Overrides live beside the
database, in a directory the user can open, edit, and version-control themselves:

```
%APPDATA%\com.midnighttavern.app\
  config\
    universal-archetypes.json     # optional override
    universal-pool.json           # optional override
    universal-items.json          # optional override
    README.md                     # written on first run: what these are, how merging works
```

- [ ] **4c.3** Resolution is **deep-merge by id over the shipped defaults**, not wholesale
      replacement. A user who wants to change one DC edits one entry; they do not have to maintain a
      copy of 3,000 entries. An override entry may set any subset of fields.
- [ ] **4c.4** A `"remove": true` marker on an id removes a shipped entry from the pool, so the user
      can delete as well as edit.
- [ ] **4c.5** New ids may be added. **A user-authored entry is as legitimate as a shipped one** —
      this is the natural way for someone to add their own content, and it costs nothing extra since
      the merge already handles it. It must still reference a real archetype and pass validation.
- [ ] **4c.6** Expose the folder from the UI ("Open config folder") and offer "restore defaults" per
      file. Non-technical users must be able to get back to a working state.

### 4c.7 Validation — the part that keeps this safe

User-edited config is untrusted input in the ordinary engineering sense. On load:

- Validate every merged entry against the Zod schema **and** the §4.5 balance rules.
- An entry that fails is **skipped with a clear, surfaced error naming the file, id, and field** —
  the app must not crash, silently drop it, or start a story with a half-loaded pool.
- Balance-rule violations are **warnings, not errors**: the human is allowed to make an unbalanced
  game deliberately. Schema violations are errors, because they would break the engine.
- Surface the results in Story Settings, not just a log — a user who broke their config needs to see
  why without opening a terminal.

- [ ] **4c.8** Clamp adversarial-looking values the way `MAX_ITEM_DAMAGE_BONUS` already clamps item
      damage, so a typo of `50000` degrades gracefully rather than producing an unplayable turn.

### 4c.9 The frozen-schema collision — the real design problem here

`mechanicsConfigVersions` exists specifically so config drift cannot change a story that was already
forged. If a user edits an archetype's DC, does a story mid-play change?

**Default: no.** A story stays locked to the config it was forged against. This preserves the
product's core promise — the rules do not move under you — and it keeps rewind and replay
deterministic, which matters because a rewound turn re-derives from the current config.

**But the human is the GM**, and refusing to let them tune their own live game would be
paternalistic. So:

- [ ] **4c.10** Add a per-story setting: **"Rulebook config: locked to creation (default) / follow
      my edits"**. Locked stories snapshot a config hash; following stories re-resolve on load.
- [ ] **4c.11** When a story is set to follow, show a clear one-time warning that mechanics may
      change between sessions and that rewound turns may resolve differently.
- [ ] **4c.12** Committed rulings are **never** recomputed under either setting. History is immutable;
      only future resolution changes. Confirm swipe still reuses committed rulings verbatim (it does
      today — invariant 6) and add a test that a config edit cannot alter a past ruling.

**4c.12 is the load-bearing guarantee.** As long as it holds, config editing can never rewrite
history, only the future — which is exactly what a GM changing a house rule mid-campaign means.

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
- [ ] **6.7** **The analyzer proposes** (owner decision D9, answered 2026-08-13). Explicitly **not**
      the narrator (it would enable things to justify prose it already wrote) and **not** the
      classifier (it would enable whatever it just failed to classify — a feedback loop that defeats
      plan 02). The analyzer already runs post-turn, off the critical path
      (`orchestrator/turn.ts` → `runBackground`), and already swallows its own errors, so a failed
      enablement proposal can never block or fail a turn.

      Two consequences of choosing the analyzer, both good:
      - It sees the **committed** narration, so it proposes against what actually happened rather
        than against a draft.
      - It is already the sole writer of soft state, so it is the one model the architecture already
        trusts with a post-turn write path. Enablement is a *catalogue* write, not hard state on a
        character (§3.1), so this does not widen its authority over mechanics.
      - [ ] Enablement must be committed in its own transaction, not folded into the analyzer's
            soft-state patch, so a soft-state failure cannot half-apply a catalogue change.

## 7. The enablement UI (owner's point 2, and finding 25.5)

Two surfaces, both in Story Settings:

1. **Enabled catalogue** — what this story currently uses. Filter by category / type / tier, search,
   detail view showing gate requirements, costs, cooldown, duration, targeting, outcome table.
2. **The pool browser** — everything available, with enable/disable toggles, grouped by the
   taxonomy's sections.

- [ ] **7.1** The pool browser must stay usable at ~3,000 entries. Virtualize, and lazy-load section
      contents. Measure; do not guess.
- [ ] **7.2** **Disabling an entry any character has learned is FORBIDDEN** (owner decision D8,
      answered 2026-08-13: *"Lets not allow to disable any skill thats been assigned to a
      character."*). This supersedes the earlier "mark it dormant" proposal, and is better: dormancy
      would have created a third state (enabled / disabled / learned-but-disabled) that every
      consumer — gate, classifier catalogue, living card, dossier — would have had to reason about.
      Refusing outright keeps two states.

      Implementation:
      - The check lives in **core**, not the UI: `mayDisableEntry(storyId, entryId)` returns false if
        any character in the story has it in `hard.skills`, or has an equipped item granting it
        (§8.2's weapon specials). Both bridges refuse identically; add a parity test.
      - The UI shows the toggle as disabled with an honest reason naming **who** learned it
        ("Jinwoo has learned this"), so the player knows what to do about it.
      - Applies to the player's manual toggles **and** to any programmatic disable.
      - It follows that **the pool can only grow within a story's lifetime** once anything is
        learned. That is the correct trade: a catalogue that shrinks under a character's feet would
        strand hard state the ledger legitimately wrote.
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

| # | Decision | Status |
| --- | --- | --- |
| D7 | New stories only, or migrate existing saves? | **OPEN** — still the biggest cost driver |
| D8 | Disabling an entry a character has learned | **ANSWERED 2026-08-13: forbidden.** See §7.2 |
| D9 | Which model proposes mid-story enablement | **ANSWERED 2026-08-13: the analyzer.** See §6.7 |
| — | Which taxonomy entries to exclude | **DELEGATED to engineering 2026-08-13.** See §4.2 |

**D7 is now the only open decision in this plan**, and it is the same one that gates plans 05 and 08.

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
