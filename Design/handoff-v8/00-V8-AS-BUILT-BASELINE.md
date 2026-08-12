# Midnight Tavern — V8 As-Built Baseline

**Created:** 2026-08-13
**Purpose:** V7 was the last handoff that went through design. Everything since — roughly six weeks
of engineering across the internal-beta remediation and Audit Plan 13 — shipped **without design in
the loop**. This document records what the product actually looks like today, so the next design
pass starts from reality instead of from V7.

**This is not a design proposal.** It is a description of as-built state, written by engineering,
plus an honest list of where the build has drifted from the V7 spec. Where a drift is a *defect*
rather than a deliberate evolution, it says so.

**Companion document:** `docs/plans/2026-08-13-DESIGN-BRIEF.md` is the actual ask — what needs
designing next. Read this file first for context, then that one for the work.

Prototypes from the last design pass remain at `Design/handoff-v7/v7/` (open `Index.dc.html`). They
are still the best visual reference for anything this document does not contradict.

---

## 0. Registers — unchanged and still non-negotiable

Two voices held strictly apart.

- **STORY** — serif (Cormorant Garamond display / Source Serif 4 prose) + brass `#D9A648`. Prose,
  names, chapter titles, primary CTAs.
- **SYSTEM** — mono (IBM Plex Mono) + teal `#74B8AE`. Dice, DCs, verdicts, stats, ids, settings.

**If a number can change during play, it is mono.** This rule has held perfectly in the build and
should not be relaxed.

## 1. The design system as built

`packages/ui/src/theme/tokens.css` is the single source of truth and was ported verbatim from the
V7 handoff's `01-DESIGN-SYSTEM.md`. It has **not drifted**. Reproduced here so the next design pass
has exact values:

```css
/* Grounds (dark → light) */
--bg0-ground: #14100c;   /* app background */
--bg1-panel:  #1b1611;   /* rails, headers, panels */
--bg2-card:   #231c15;   /* cards, raised surfaces */
--bg3-raised: #2c241b;   /* chips, hover, inset controls */
--hairline:   #382e21;   /* 1px borders */
--hairline-soft: rgba(216, 170, 90, 0.12);

/* Text */
--prose:     #eadcbe;    /* narrative body + headings */
--ui-text:   #d6c9ab;    /* UI labels, secondary headings */
--secondary: #a08d6c;    /* supporting copy */
--muted:     #6e5f49;    /* captions, disabled, meta */

/* STORY accent */
--brass:        #d9a648;
--brass-bright: #f2c56b;

/* SYSTEM accent */
--teal:      #74b8ae;
--teal-dim:  #4e827b;
--teal-tint: rgba(116, 184, 174, 0.08);

/* Verdict / status */
--success:      #8fb573;
--failure:      #c96f57;  /* muted terracotta, deliberately not pure red */
--crit-gold:    #f5ce6e;
--crit-crimson: #b5442f;
--dead:         #8a8175;  /* fallen characters, denied rulings */

/* Selection / focus */
--selection-bg: rgba(217, 166, 72, 0.25);
--focus-ring:   #74b8ae;

/* Type families */
--font-display: "Cormorant Garamond", Georgia, serif;
--font-prose:   "Source Serif 4", Georgia, serif;
--font-ui:      "IBM Plex Sans", system-ui, sans-serif;
--font-mono:    "IBM Plex Mono", ui-monospace, monospace;

/* Radii */
--radius-card:  10px;
--radius-chip:  6px;
--radius-stamp: 3px;

--elevation: 0 6px 20px rgba(0, 0, 0, 0.4);

/* Shell metrics */
--rail-width:    72px;
--header-height: 96px;

/* Motion */
--motion-fast: 160ms;
--motion-med:  300ms;
--motion-ruling-die:   350ms;
--motion-ruling-total: 900ms;
--ease-settle: cubic-bezier(0.2, 0.8, 0.3, 1.2);
```

Helper classes `.register-story` / `.register-system` set family + accent together so the voices
cannot borrow each other's font or colour. `.display`, `.prose` (17px/1.75, 66ch measure), `.mono`
(tabular numerals), and `.paper-grain` are the other shared primitives.

`prefers-reduced-motion: reduce` collapses every motion token to `0.001ms` at the `:root` level, so
components inherit the guard rather than each implementing it.

**Live style guide:** `packages/ui/src/screens/DesignSystem.tsx` renders the system in-app. It is
the fastest way to see the current state and should be updated alongside any design change.

## 2. Shell and navigation as built

- **Left rail**, 72px: Library, Story, Personas, Lore, Settings.
- **Story header**, 96px: title · `CH n` chapter label · message count, with sub-tabs
  **Play · Overview · Characters · Journal · Story Settings**.
- Screens present today: `Play`, `Overview`, `Characters`, `CharacterDossier`, `CharacterLoadout`,
  `Journal`, `StorySettings`, `Library`, `Lorebook`, `Personas`, `Settings`, `RoleMatrix`,
  `SetupWizard`, `Wizard`, `StoryBlueprint`, `DesignSystem`, **`Diagnostics`**.
- **Breakpoints in use:** `900px` (Play switches the living-card drawer to an overlay), `760px`
  (Overview stacks its two columns).

## 3. What drifted from V7 — the part that matters

Ordered by how visible it is to a player.

### 3.1 The ruling artifact grew five variants V7 did not specify

V7 specified: denied, failed, successful, critical, opposed, unresolved-target,
action-budget-exceeded, classifier-unavailable.

As built (`packages/ui/src/components/RulingArtifact.tsx`), the variant list is:

```
success · failure · crit-success · crit-failure · opposed · npc · stacked
denied · budget-exceeded · unresolved · classifier-unavailable
```

**`npc` and `stacked` are new and never saw design.**

- **`npc`** — an NPC's own action, given its own register so a player cannot mistake it for their
  own. It carries an extra **reason line** explaining *why* the NPC acted ("They were already
  hostile to Jinwoo.", "Marta harmed them with Unarmed Strike."). This is a genuinely good addition
  that needs a designed treatment; right now the reason is plain secondary text bolted under the card.
- **`stacked`** — two rolls in one card (an exchange: enemy hits, player ripostes). Takes its accent
  from the *second* roll.

**Known defect:** `accentFor()` returns `var(--teal)` for `npc` **before** consulting the outcome,
so an NPC failure renders identical to an NPC success. The owner has specified the fix (failure red
for everyone, success stays teal) and it is scheduled — design does not need to re-decide it, but
should be aware the `npc` variant will soon carry two accents.

### 3.2 A narration fallback state exists that V7 never contemplated

When the engine cannot verify the narrator's prose against the dice results, it **discards the
prose** and substitutes a deterministic factual recap:

```
Jinwoo's Natural attack achieves a critical success. The natural attack lands with devastating force.
Jinwoo's Weapon Strike fails. The foe twists aside from your swing.
Shadow_entity's Natural attack fails. The natural attack misses its target.
```

…rendered **in the STORY register, in serif, exactly like narrator prose**, followed by a warning
notice with Retry / Change model / Dismiss.

This is the single worst-looking thing in the product today. The player reads it as the AI writing
badly. It is not prose at all — it is a machine recap wearing the story's clothes, and it is a
direct violation of the register rule that the rest of the app obeys perfectly. Fixing it is design
brief §3.

### 3.3 Journal filters grew

V7: Rolls / Denied / Progression / Items-Equipment / Milestones.
As built: the same plus **Interrupted** and **Boundary** (chapter started, arc completed, rulebook
regenerated). Seven chips plus "All" now sit in a row that was designed for five.

### 3.4 A Diagnostics screen exists

Local, opt-in, never networked — counters for stage latency and outcomes. Enabled in Settings.
Entirely undesigned; it currently renders as a plain data dump.

### 3.5 Attribute advancement

Deterministic app verdicts on DM-proposed attribute changes now attach to narrator exchanges and
appear in the Journal. No designed treatment.

### 3.6 Overview changed behaviour

The primary reading document now **switches** depending on what exists — latest chapter until an arc
exists, then the arc, with a selectable timeline for historical chapters. The owner's verdict on
this is that it reads as "all over the place", and design brief §4 replaces it with three fixed
sections.

### 3.7 Play screen composition

Now: `PartyStrip` of present cast across the top → scrolling message stream with ruling cards
embedded inline → composer at the bottom → `LivingCard` in a right-hand drawer. Below 900px the
drawer becomes an overlay. Known issues, all scheduled: the drawer does not refresh after a turn,
it survives a story switch, the strip shows characters no longer in the scene, and the composer is
fixed-height.

## 4. What has NOT drifted

Worth stating so design does not re-solve solved problems:

- The two registers, and every token value.
- Ruling-above-prose ordering, and rulings staying fixed across prose regeneration.
- Advantage/disadvantage presentation — two dice, used one emphasised, discarded struck and dimmed,
  cancellation shown explicitly.
- Difficulty presentation — `base DC → effective DC (preset name)`, damage multiplier in effects.
- The seven equipment slots and five rarity tiers.
- No Stats mode hiding Full Stats surfaces entirely rather than rendering them empty.
- The reduced-motion guard.

## 5. What is about to change

The 2026-08-13 plan set (`docs/plans/2026-08-13-00-MASTER-INDEX.md`) will introduce, subject to
owner approval:

- **Character taxonomy** — `user / party / ally / neutral / rival / enemy / creature`, replacing the
  `primary`/`secondary` label, with three umbrella sections and a much richer User panel.
- **Three resources** — health, mana and stamina on every character, plus skill cooldowns. The
  living card currently shows one bar and will need three plus cooldown state.
- **Quests** — an entirely new surface, with five difficulty tiers and a reward-choice moment.
- **A universal pool** of ~3,000 actions and skills with per-story enable/disable, needing a browser
  that does not exist in any form today.
- **Categorised action suggestions**, replacing today's undifferentiated list.

Design brief §1–6 covers exactly these. Anything in this document not mentioned there is considered
settled and should be left alone.

---

## Acceptance for the next design pass

The V8 pass is complete when: the narration fallback no longer wears the STORY register; the `npc`
ruling variant has a designed reason line and two accents; the Characters screen presents three
sections with a User dashboard; quests exist end to end including the reward moment; the pool
browser is usable at ~3,000 entries; and Overview presents three fixed sections with honest empty
states — all without introducing a third register or a token outside §1.
