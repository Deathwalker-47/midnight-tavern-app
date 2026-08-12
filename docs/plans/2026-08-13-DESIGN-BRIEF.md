# Design brief — hand this to Claude for design work

**Created:** 2026-08-13
**Scope:** only the surfaces that genuinely need a *visual design decision* before engineering can
build them. Everything else from the play-test findings is specified in the engineering plans and
needs no design input — see §"Deliberately not in this brief" at the bottom.
**How to use:** copy everything below the line into a fresh Claude conversation. It is
self-contained.

---

You are designing screens for **Midnight Tavern**, a desktop app (Tauri + React 18) for playing solo
tabletop RPG campaigns driven by AI. I need concrete, buildable direction — layout, hierarchy,
component anatomy, states — delivered as HTML/CSS mockups I can hand to an engineer.

## The product in one paragraph

A human plays a solo RPG campaign. AI models write the prose and interpret what the player typed,
but **the program owns all mechanics** — dice, difficulty, damage, death, inventory, progression.
That split is the product's reason to exist: the story is soft and improvised, the rules are hard
and trustworthy. The UI must make that split *feel* true at a glance.

## The existing design language — keep it, don't redesign it

Two visual registers, and mixing them is the cardinal sin:

- **STORY register** — serif, warm brass/parchment, generous line height. Narrator prose and anything
  diegetic. Feels like a novel.
- **SYSTEM register** — monospace, teal accents, tight tracking, small-caps labels like
  `RULING · SUCCESS`. Dice, verdicts, stats — anything the program decided. Feels like a machine that
  cannot be argued with.

Dark theme throughout. Existing CSS custom properties: `--bg0-ground`, `--bg1-panel`, `--bg2-card`,
`--teal` (system accent), `--dead` (refusal red), `--ui-text`, `--secondary`, `--muted`,
`--hairline`, `--radius-card`, `--elevation`, `--ease-settle`. Motion respects
`prefers-reduced-motion`.

Reuse these tokens and registers. I want evolution, not a new design system. Flag it explicitly if
you think a token needs adding.

---

## 1. Character list — three umbrella sections, and a rich User panel

**This is the highest priority.** Today every character renders as the same generic card with a
`PRIMARY` / `SECONDARY` label. I want the Characters screen reorganised into **three stacked
sections, in this fixed order**:

1. **User** — only the player's character. Needs a **substantially richer panel than the others**,
   not the generic card: it is the player's home base. It should surface in one eye-pleasing view:
   three resources (health / mana / stamina), attributes, learned skills with progression, and
   **currently equipped items per slot**. Design this as a *dashboard*, not a list row. Add anything
   else you think earns its place.
2. **Party** — characters who travel with the player and help in and out of combat.
3. **NPC** — everyone else.

Within those sections each character carries a **type tag**. Proposed set — tell me if you'd change
it: `User`, `Party`, `Ally`, `Neutral`, `Rival`, `Enemy`, `Creature`, `Background`.

There are **seven equipment slots**: primary, secondary, head, body, utility, accessory 1,
accessory 2. Item rarity tiers: Common, Uncommon, Rare, Legendary, Mythical.

Questions I need answered:

- Anatomy and layout of the rich **User** panel. What's the primary read? What collapses?
- How the three sections separate visually without three heavy headers eating the viewport.
- How the type tag reads — colour-coded chip, icon, something quieter? It must not be mistaken for a
  mechanical stat.
- How an **Enemy** reads differently from an **Ally** at a glance, without becoming a health bar.
- Empty states: no party members yet; no NPCs met yet.

### 1b. The living-card drawer (same problem, different container)

While reading the story, clicking a character opens a side drawer with their live stats. It
currently shows name, tier label, one health bar, a 6-cell attribute grid, and skills with XP. It
will soon also need **mana and stamina bars**, cooldown state, and equipped gear.

- How do three resource bars coexist without dominating the card?
- Show the drawer at three widths: narrow (~900px), normal, wide.

## 2. Quest system — a new feature, needs the most design thought

A quest log, either a Journal section or its own tab.

- Quests have **difficulty tiers**: Light, Moderate, Hard, Brutal, **Nightmare**. Nightmare must feel
  genuinely rare and forbidding — near-impossible, and the only route to Mythical rewards.
- Quests range from specific ("deliver this letter") to sweeping ("end the war").
- On completion the player **chooses one reward** from up to four offered types: an attribute
  upgrade, a skill upgrade, a tiered skill unlock, or an item. Which are available depends on the
  quest's difficulty; some are locked out entirely at low difficulty.
- Quests double as an **anti-drift device** — a persistent, visible reminder of current goals so the
  story doesn't wander. The active quest therefore needs some presence on the Play screen, without
  stealing attention from the prose.

Questions:

- The quest list: how do five difficulty tiers read at a glance without a rainbow?
- The **reward-choice moment** — this is a big emotional beat. Design it properly.
- The lightweight active-quest indicator on the Play screen.
- Quest states: available, active, completed, failed, expired.

## 3. Overview screen redesign

Currently "all over the place". It should present in clearly separated sections:

- **Arc** — condensed, high-level summary of the campaign so far.
- **Chapters** — more detailed, what actually happened, chapter by chapter.
- The original story premise, clearly marked as immutable and distinct from generated history.

## 4. Story Settings — catalogue browser

The action and skill catalogues are about to grow from ~20–30 entries to potentially hundreds. The
current flat read-only list will not cope. Design a browser: filter by category / skill type / tier,
search, and a detail view for one action or skill showing gate requirements, costs, cooldown, and
outcome table.

---

## Constraints

- **Desktop-first**, dark theme, but must survive a narrow window (~900px) — there's an existing
  breakpoint there.
- Reuse the existing tokens and the two-register discipline.
- Accessibility: keyboard navigation, visible focus, sensible ARIA, and everything must still read
  under `prefers-reduced-motion`.
- No external assets, fonts, or icon libraries — inline SVG only if icons are needed.

## What to give me back

For each numbered item: a short rationale (2–3 sentences on the key decision), then a self-contained
HTML+CSS mockup using the tokens above, showing the main state plus important secondary states.
Where you're making a judgement call I should weigh in on, say so explicitly rather than quietly
picking one.

Start with **item 1**, then **item 2**. Those two block engineering; 3 and 4 can follow.

---

## Deliberately NOT in this brief

Recorded here so nobody re-adds them thinking they were forgotten. Each is specified in an
engineering plan and needs no design input:

| Owner finding | Why it's not a design question | Where it lives |
| --- | --- | --- |
| 30 — categorise action suggestions | The hard part is the *selection policy*: choosing 6 relevant moves from a ~700-entry taxonomy. Rendering a category label on the existing chips is a trivial variation. | Plan 11 |
| 29 — composer auto-expands to ~4 lines | A textarea that grows then scrolls. No design decision exists. | Plan 07 §4 |
| 14 — NPC failure renders blue | Already decided by the owner: failure red for everyone, success stays blue. A two-line change to `accentFor()`. | Plan 07 §3 |
| 27 — slots not explained | Needs *copy* explaining what the seven slots are, in the existing panel's existing layout. | Plan 12 |
| 13 — narration failure notice | Needs *copy* per failure type; the exact strings are already tabulated in the owner's narration plan. | Plan 06 |
| 02 §4.2 — mark engine-owned universal actions | A small chip on an existing card. Fold into item 1's type-tag language once that's settled. | Plan 02 |
