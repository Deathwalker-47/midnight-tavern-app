# Design brief — hand this to Claude for design work

**Created:** 2026-08-13. **Revised** after all twelve engineering plans were written, which surfaced
one new high-value design item (§3, the narration fallback) that was not visible earlier.
**Scope:** only surfaces that genuinely need a *visual design decision*. Everything else from the 31
play-test findings is specified in the engineering plans — see §"Deliberately not in this brief".
**How to use:** copy everything below the line into a fresh Claude conversation. It is
self-contained.

---

You are designing screens for **Midnight Tavern**, a desktop app (Tauri + React 18) for playing solo
tabletop RPG campaigns driven by AI. I need concrete, buildable direction — layout, hierarchy,
component anatomy, states — delivered as HTML/CSS mockups I can hand to an engineer.

## The product in one paragraph

A human plays a solo RPG campaign. AI models write the prose and interpret what the player typed,
but **the program owns all mechanics** — dice, difficulty, damage, death, inventory, progression.
That split is the product's reason to exist: the story is soft and improvised, the rules are hard and
trustworthy. The UI must make that split *feel* true at a glance.

## The existing design language — keep it, don't redesign it

Two visual registers, and mixing them is the cardinal sin:

- **STORY register** — serif, warm brass/parchment, generous line height. Narrator prose and anything
  diegetic. Feels like a novel.
- **SYSTEM register** — monospace, teal accents, tight tracking, small-caps labels like
  `RULING · SUCCESS`. Dice, verdicts, stats — anything the program decided. Feels like a machine that
  cannot be argued with.

Dark theme throughout. Existing CSS custom properties: `--bg0-ground`, `--bg1-panel`, `--bg2-card`,
`--teal` (system accent), `--dead` (refusal red), `--ui-text`, `--secondary`, `--muted`,
`--hairline`, `--radius-card`, `--radius-stamp`, `--elevation`, `--ease-settle`. Motion respects
`prefers-reduced-motion`.

The signature component is the **ruling card**: an embedded verdict that mounts mid-prose showing the
die, the arithmetic (`d20 4 + 0 = 4 vs DC 8`), and a rotated rubber-stamp verdict (SUCCESS / FAILURE
/ CRIT FAIL / DENIED). It is beloved — do not restyle it. §3 sits next to it.

Reuse these tokens and registers. I want evolution, not a new design system. Flag it explicitly if
you think a token needs adding.

---

## 1. Character list — three umbrella sections, and a rich User panel

**Highest priority.** Today every character renders as the same generic card with a
`PRIMARY` / `SECONDARY` label. Reorganise the Characters screen into **three stacked sections, fixed
order**:

1. **User** — only the player's character. Needs a **substantially richer panel than the others**,
   not the generic card: it is the player's home base. Surface in one eye-pleasing view: three
   resources (health / mana / stamina), attributes, learned skills with progression, and **currently
   equipped items per slot**. Design this as a *dashboard*, not a list row.
2. **Party** — characters who travel with the player and help in and out of combat.
3. **NPC** — everyone else.

Within those sections each character carries a **type tag**: `User`, `Party`, `Ally`, `Neutral`,
`Rival`, `Enemy`, `Creature`. Tell me if you'd change that set.

Seven equipment slots: primary, secondary, head, body, utility, accessory 1, accessory 2. Item
rarity tiers: Common, Uncommon, Rare, Legendary, Mythical.

Questions:

- Anatomy and layout of the rich **User** panel. What's the primary read? What collapses?
- How the three sections separate without three heavy headers eating the viewport.
- How the type tag reads — colour-coded chip, icon, something quieter? It must not be mistaken for a
  mechanical stat.
- How an **Enemy** reads differently from an **Ally** at a glance, without becoming a health bar.
- Empty states: no party members yet; no NPCs met yet.

### 1b. Living-card drawer (same problem, different container)

Clicking a character while reading opens a side drawer with live stats: currently name, tier label,
one health bar, a 6-cell attribute grid, skills with XP. It will soon also need **mana and stamina
bars**, skill cooldown state, and equipped gear.

- How do three resource bars coexist without dominating the card?
- How does a skill on cooldown read — greyed, a countdown, something else?
- Show the drawer at three widths: narrow (~900px), normal, wide.

## 2. Quest system — new feature, needs the most design thought

A quest log, either a Journal section or its own tab.

- Difficulty tiers: Light, Moderate, Hard, Brutal, **Nightmare**. Nightmare must feel genuinely rare
  and forbidding — near-impossible, and the only route to a Mythical reward.
- Quests range from specific ("deliver this letter") to sweeping ("end the war").
- On completion the player **chooses one reward** from up to four: an attribute upgrade, a skill
  upgrade, a tiered skill unlock, or an item. Availability depends on difficulty; some are locked out
  entirely at low difficulty.
- Quests double as an **anti-drift device** — a visible reminder of current goals so the story
  doesn't wander. The active quest needs presence on the Play screen without stealing attention from
  the prose.

Questions:

- The quest list: how do five difficulty tiers read at a glance without a rainbow?
- The **reward-choice moment** — a big emotional beat, and the player picks exactly one of up to
  four. Design it properly.
- The lightweight active-quest indicator on the Play screen.
- Quest states: available, active, completed, failed, expired.

## 3. The narration fallback — the highest-value small fix

When the app cannot verify the AI's prose against the dice results, it discards the prose and
substitutes a deterministic factual recap, then shows a warning. The recap looks like this:

```
Jinwoo's Natural attack achieves a critical success. The natural attack lands with devastating force.
Jinwoo's Weapon Strike fails. The foe twists aside from your swing.
Shadow_entity's Natural attack fails. The natural attack misses its target.
```

**The problem: it is currently rendered in the STORY register, in serif, exactly like narrator
prose.** So the player reads it as the AI writing badly, and concludes "every prose ends with a DM
one-liner". It is not prose at all — it is a mechanical summary wearing the story's clothes.

Design it as a **SYSTEM-register block**, visually continuous with the ruling cards it summarises, so
it is self-evidently a machine recap rather than failed writing. This is a small change with a large
perceived-quality payoff.

Then the accompanying notice. Current copy:

> ⚠ **Full narration unavailable this turn**
> The mechanics resolved and are shown above, but the narration couldn't be verified against the DM
> rulings, so a brief factual recap stands in for the full scene. Send another action, or swipe this
> turn to retry the narration.
> [Retry narration] [Change narrator model] [Dismiss]

It reads as an error. It should read as graceful degradation, and it should lead with the reassuring
part — **the dice already counted and are final**. Design the treatment and propose copy. There are
six distinct underlying causes, so the component needs to carry a variable reason and a variable
primary action.

## 4. Overview screen — three fixed sections

Currently the primary document *switches* depending on what exists (latest chapter until an arc
exists, then the arc), with a timeline for selecting historical chapters. That mode-switching is why
it reads as "all over the place". Replace it with three fixed sections, always present:

1. **Premise** — immutable, compact, clearly marked as the story's fixed origin.
2. **Arc** — condensed synthesis. Latest expanded; earlier arcs collapse.
3. **Chapters** — the detailed record, newest first, each expandable.

Each needs an honest empty state (a new story has a premise and nothing else) so the player learns
the structure rather than seeing sections vanish. Must stack sensibly below 760px.

## 5. Story Settings — the catalogue, and the pool it's drawn from

This is bigger than a list redesign, and it's the surface I'm least sure about.

The app is moving to a **universal pool** of roughly 3,000 pre-authored skills and actions —
everything the product knows how to do, across combat, magic, crafting, survival, and a large
non-combat body (conversation, empathy, diplomacy, governance, law, family, reputation). A story does
not use all of it. At story creation, an AI **selects** a fitting subset — call it 40–70 actions and
20–40 skills — and that subset is what the game actually runs on. The player can then **enable or
disable** entries by hand, and during play the app may occasionally enable something new from the
pool when the story calls for it.

So there are two related surfaces, and I need both:

**5a. The enabled catalogue** — what this story currently runs on. A few dozen entries. Filter by
category / type / tier, search, and a detail view for one entry showing its gate requirements,
resource costs, cooldown, duration, targeting, and outcome table. This replaces today's flat
read-only list, which does not cope.

**5b. The pool browser** — all ~3,000, grouped by the taxonomy's ~166 named sections, with
enable/disable toggles. This is the hard one:

- How does a player navigate 3,000 items grouped into 166 sections without drowning? Section-first
  drill-down, search-first, or something else?
- How does *enabled* read against *available* at a glance, at both section level ("12 of 47 enabled")
  and entry level?
- Entries the story enabled automatically, entries the player enabled, and entries the app enabled
  mid-play are three different provenances. Should the player see the difference? I think yes, but
  tell me if that's clutter.
- Some entries are **locked by tier** — a legendary skill can't be enabled in chapter one. How does a
  locked-but-visible entry read without feeling like a paywall?
- An entry a character has already learned **cannot be disabled** — the toggle is refused, and the
  UI should say who learned it ("Jinwoo has learned this"). How does a permanently-locked-on toggle
  read without looking broken?

Assume the browser is opened rarely and deliberately — it is a settings surface, not a play surface.
It can afford to be dense and screen-filling in a way the Play screen cannot.

## 6. Two small questions

**6a. Equipment slot cards.** A panel explains item *rarity tiers* with a card each — real
explanations, good weight. It lists the seven *slots* as a bare inline run with no explanation at
all. Design slot cards matching the tier cards so both halves balance. (I'll write the copy.)

**6b. Morally-charged suggestions.** The app suggests six possible moves each turn, each tagged with
an intent — *obvious, cautious, clever, dominating, dangerous* — and some are deliberately dark:
*betray, intimidate, exploit*. This is a mature RPG and meaningful evil choices belong in it. How
should a dark option read as **available and genuinely tempting** without the UI appearing to
**recommend** it? This is one narrow question about chip/label treatment, not a request to redesign
the suggestions feature.

---

## Constraints

- **Desktop-first**, dark theme, but must survive a narrow window (~900px) — there's an existing
  breakpoint there.
- Reuse the existing tokens and the two-register discipline.
- Accessibility: keyboard navigation, visible focus, sensible ARIA, and everything must still read
  under `prefers-reduced-motion`.
- No external assets, fonts, or icon libraries — inline SVG only if icons are needed.

## What to give me back

For each item: a short rationale (2–3 sentences on the key decision), then a self-contained HTML+CSS
mockup using the tokens above, showing the main state plus important secondary states. Where you're
making a judgement call I should weigh in on, say so explicitly rather than quietly picking one.

Order: **1 and 2 first** (they block engineering), then **3** (small, high payoff), then 4, 5, 6.

---

## Deliberately NOT in this brief

Recorded so nobody re-adds them thinking they were forgotten. Each is fully specified in an
engineering plan and needs no design input.

| Owner finding | Why it's not a design question | Plan |
| --- | --- | --- |
| 30 — categorise suggestions | The work is the *selection policy*: narrowing ~700 move archetypes to ~30 by scene state, then validating the model's picks against the gate. Only the dark-option chip treatment is design (§6b). | 11 |
| 29 — composer auto-expands to ~4 lines | A textarea that grows then scrolls. No design decision exists. | 07 |
| 14 — NPC failure renders blue | Owner already specified it: failure red for everyone, success stays blue. Two-line change to `accentFor()`. | 07 |
| 10, 18 — living cards stale / from old story | A state-refresh bug. No visual change. | 07 |
| 28 — non-present characters in the strip | A presence-expiry rule in the engine. | 07 |
| 27 — slots not explained | Needs copy, which I'll write; only the card layout is design (§6a). | 12 |
| 4, 19 — misclassification | Engine-side grounding and fit gating over model output. | 02 |
| 5 — duplicate "And Daen" | A grammar rule in entity extraction. | 03 |
| 6 — everything is attribute 10 | Deterministic seeded stat variation. | 05 |
| 16, 21, 22, 23, 24 — economy and skills | Schema and engine work. The *display* of new resources is covered by §1b. | 08 |
| 20, 25, 31 — catalogues and weapon specials | Content generation. The *browser* is §5. | 09 |
| 2 — lock the story surface on trial expiry | Entitlement enforcement. The locked-composer state is a small variant of an existing disabled state; specify it in §3's component work if it needs anything. | 01 |
