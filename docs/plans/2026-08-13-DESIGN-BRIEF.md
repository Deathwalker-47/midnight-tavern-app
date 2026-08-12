# Design brief — hand this to Claude for design work

**Created:** 2026-08-13
**Purpose:** everything in the 2026-08-13 remediation plan set that needs a *design* decision before
engineering can implement it.
**How to use:** copy everything below the line into a fresh Claude conversation. It is written to be
self-contained. Bring the answers back and they become the visual spec for plans 04, 07, 10, 11, 12.

---

You are designing screens for **Midnight Tavern**, a desktop app (Tauri + React 18) for playing
solo tabletop RPG campaigns driven by AI. I need concrete, buildable design direction — layouts,
hierarchy, component anatomy, states, and copy. Produce HTML/CSS mockups I can hand to an engineer.

## The product in one paragraph

A human plays a solo RPG campaign. AI models write the prose and interpret what the player typed,
but **the program owns all mechanics** — dice, difficulty, damage, death, inventory, progression.
This split is the product's whole reason to exist: the story is soft and improvised, the rules are
hard and trustworthy. The UI must make that split *feel* true at a glance.

## The existing design language (keep it — do not redesign the system)

There are **two visual registers**, and mixing them is the cardinal sin:

- **STORY register** — serif, warm brass/parchment tones, generous line height. Used for narrator
  prose and anything diegetic. Feels like a novel.
- **SYSTEM register** — monospace, teal accents, tight tracking, small caps labels like
  `RULING · SUCCESS`. Used for dice, verdicts, stats, and anything the program decided. Feels like a
  machine that cannot be argued with.

Dark theme throughout. Existing CSS custom properties include: `--bg0-ground`, `--bg1-panel`,
`--bg2-card`, `--teal` (system accent), `--dead` (refusal/denial red), `--ui-text`, `--secondary`,
`--muted`, `--hairline`, `--radius-card`, `--radius-stamp`, `--elevation`, `--ease-settle`. Motion
respects `prefers-reduced-motion`.

The signature component is the **ruling card**: an embedded verdict that mounts mid-prose showing the
die, the arithmetic (`d20 4 + 0 = 4 vs DC 8`), and a rotated rubber-stamp verdict (SUCCESS / FAILURE
/ CRIT FAIL / DENIED). It is beloved. Do not restyle it; several asks below extend it.

Please **reuse these tokens and registers**. I want evolution, not a new design system.

---

## What I need designed

### 1. Character list — three umbrella sections (highest priority)

Today every character renders as the same generic card with a `PRIMARY` / `SECONDARY` label. I want
the Characters screen reorganised into **three stacked sections, in this fixed order**:

1. **User** — contains only the player's own character. This needs a **substantially richer panel
   than the others**, not the generic card: it is the player's home base. It should surface, in one
   eye-pleasing view: resources (health / mana / stamina), attributes, learned skills with
   progression, **currently equipped items per slot**, and anything else you think earns its place.
   Design this as a *dashboard*, not a list row.
2. **Party** — characters who travel with the player and help in and out of combat.
3. **NPC** — everyone else.

Within those sections, individual characters carry a **type tag**. Proposed set (tell me if you'd
change it): `User`, `Party`, `Ally`, `Neutral`, `Rival`, `Enemy`, `Creature`, `Background`.

Design questions I need answered:
- Anatomy and layout of the rich **User** panel. What is the primary read? What collapses?
- How the three sections are visually separated without three heavy headers eating the viewport.
- How the type tag reads — colour-coded chip, icon, or something quieter? It must not be mistaken
  for a mechanical stat.
- Empty states: no party members yet; no NPCs met yet.
- How an **Enemy** reads differently from an **Ally** at a glance, without becoming a health bar.

There are **seven equipment slots**: primary, secondary, head, body, utility, accessory 1,
accessory 2. Item rarity tiers: Common, Uncommon, Rare, Legendary, Mythical.

### 2. Living-card drawer

A side drawer showing one character's live stats while reading the story. It currently shows name,
tier label, health bar, a 6-cell attribute grid, and skills with XP. It will soon also need
**mana and stamina bars**, cooldown state, and equipped gear.

- How do three resource bars coexist without dominating the card?
- Show me the drawer at three sizes: narrow window, normal, and wide.

### 3. Ruling card — two small extensions

- **NPC failure currently renders teal, identical to NPC success.** I want failure to read as failure
  for everyone. My instinct: NPC *success* stays teal (so NPC actions keep their own register), NPC
  *failure* goes red. Tell me if that's right or if outcome colour should simply win in all cases —
  and show both.
- Some actions are **engine-owned universals** available to every character with no training (e.g.
  an unarmed attack). Players currently mistake these for learned skills. I want a small marker on
  the ruling card distinguishing "universal fallback" from "your learned skill". Design that marker.

### 4. Quest system (new feature — needs the most design thought)

A quest log, probably a section in the Journal or its own tab. Requirements:

- Quests have **difficulty tiers**: Light, Moderate, Hard, Brutal, **Nightmare**. Nightmare must feel
  genuinely rare and forbidding — near-impossible, and the only route to Mythical rewards.
- Quests range from specific ("deliver this letter") to sweeping ("end the war").
- On completion the player **chooses one reward** from up to four offered types: an attribute
  upgrade, a skill upgrade, a tiered skill unlock, or an item. Which are available depends on the
  quest's difficulty; some are locked out entirely at low difficulty.
- Quests double as an **anti-drift device** — a persistent, visible reminder of current goals so the
  story doesn't wander. That means the active quest needs some presence on the Play screen too,
  without stealing attention from the prose.

Design questions:
- The quest list: how do five difficulty tiers read at a glance without a rainbow?
- The **reward-choice moment** — this is a big emotional beat. Design it properly.
- The lightweight active-quest indicator on the Play screen.
- Quest states: available, active, completed, failed, expired.

### 5. Action suggestions ("Possible moves")

The player gets suggested moves above the composer. Today they're an undifferentiated list and often
irrelevant. I want them **categorised by intent** — drawn from a large taxonomy, roughly six shown at
a time, each labelled by kind: e.g. *obvious*, *good*, *evil*, *dominating*, *out-of-the-box*,
*impress an NPC*, *dangerous*, *cautious*, *clever*, *social*, *desperate*.

- How do six categorised suggestions render without becoming a wall of chips?
- How is the category communicated — label, icon, colour, position?
- Some categories are morally charged (evil, cruel, betray). How do those read without the UI
  appearing to *endorse* them, while still being genuinely tempting? This is the subtle one.

### 6. Overview screen redesign

Currently "all over the place". It should present, in clearly separated sections:
- **Arc** — condensed, high-level summary of the campaign so far.
- **Chapters** — more detailed, what actually happened, chapter by chapter.
- The original story premise, clearly marked as immutable and distinct from generated history.

### 7. Story Settings — catalogue browser

The action and skill catalogues are about to grow from ~20-30 entries to potentially hundreds. The
current flat read-only list will not cope. Design a browser: filtering by category, skill type, tier;
search; and a detail view for one action or skill showing its gate requirements, costs, cooldown,
and outcome table.

### 8. "Universal slots and tier policy" panel

An existing panel explains item **rarity tiers** well but never explains what the seven **slots**
actually are. Design the slots explanation to sit alongside the tier explanation.

### 9. Narration failure notice

When the app can't verify the AI's prose against the dice results, it substitutes a factual recap and
shows a warning with actions (Retry / Change model / Dismiss). It currently appears often enough to
be annoying and names the wrong model to change. Design a **less alarming, more informative**
treatment — something that reads as a graceful degradation, not an error.

### 10. Composer

Should auto-expand as the player types, up to about four lines, then scroll internally. Show the
states: empty with placeholder, one line, at max height, and disabled (during generation, and when
the licence has lapsed — the latter needs an upsell treatment that isn't obnoxious).

---

## Constraints

- **Desktop-first**, dark theme, but must survive a narrow window (~900px) — there's an existing
  breakpoint there.
- Reuse the existing tokens and the two-register discipline. Flag it explicitly if you think a token
  needs adding.
- Accessibility: keyboard navigation, visible focus, sensible ARIA, and everything must still read
  under `prefers-reduced-motion`.
- No external assets, fonts, or icon libraries — inline SVG only if icons are needed.

## What to give me back

For each numbered item: a short rationale (2-3 sentences on the key decision), then a self-contained
HTML+CSS mockup using the tokens above, showing the main state plus any important secondary states.
Where you're making a judgement call I should weigh in on, say so explicitly rather than quietly
picking one.

Start with **items 1, 4, and 5** — those are the ones blocking engineering.
