# Midnight Tavern — V7 Design Specification

A clean V7 revision on the V6 visual baseline. This document holds only current product/UX
decisions, screen and component specs, and state/interaction flows. Implementation architecture,
schemas, prompts, and historical V2–V6 appendices live elsewhere and are intentionally excluded.

Prototypes: `v7/` (open `v7/Index.dc.html`). One canonical Play prototype — no separate Chat.

---

## 0. Registers (unchanged)

Two voices held strictly apart. **STORY** = serif (Cormorant / Source Serif) + brass `#D9A648`:
prose, names, chapter titles, primary CTAs. **SYSTEM** = mono (IBM Plex Mono) + teal `#74B8AE`:
dice, DCs, verdicts, stats, IDs, settings. If a number can change during play, it is mono.

---

## 1. Corrections to V6

- **Attribute scale is 1–20.** Modifier is one formula, `mod = ⌊(score−10)/2⌋`, shown beside the
  score: `10 (+0)`, `14 (+2)`, `20 (+5)`, `22 (+6)`. Scores above 20 only where the card
  establishes superhuman capability. The usual **attribute count is 3–6** (a count, not a range or
  budget). A card-defined `0` renders as a locked/unavailable state with its reason. Imported
  card mechanics take precedence over generated ones.
- **Universal actions are data-driven.** No UI to add/remove/edit/reorder/enable/disable them.
  Story Settings shows a **read-only** universal-action reference of arbitrary size, with the
  base each story action specializes.
- **Progression shows XP, not action counts.** Four ranks (Novice, Adept, Expert, Master).
  Components receive current XP, next threshold, latest award, and rank-up info. The design
  hard-codes no thresholds, curves, or anti-grind rules.
- **No hard-coded model names or sampler values.** Layouts tolerate changing recommendation data.

---

## 2. Non-negotiable interaction model

- **Exchange order:** player message → one or more **DM Ruling** artifacts → narrator prose that
  obeys them. The ruling renders **above** the prose and is authoritative; prose never appears to
  decide a mechanical result. Regenerating prose leaves the ruling, dice, XP, loot, and hard-state
  fixed — the regen UI says so.
- **“DM Ruling”** is the player-facing name of the rules verdict. No sixth DM model role, no DM
  model selector.
- **No Stats is Narrator-only.** All Full Stats surfaces (difficulty, budgets, ruling mechanics,
  attributes, skills, equipment, loot, mechanical journal) are hidden — never rendered empty.
  Contextual suggestions remain available (they help prose-only play).

---

## 3. Story Creation / Blueprint  → `StoryCreation.dc.html`

Pre-forge review with:
- **Persona confirmation** — prominent, never easy to overlook: name, avatar, summary, Change /
  Edit persona, a strong warning that the sheet is generated from this persona, and a clearly
  secondary, warned path to continue without one.
- **Mechanic-source review** — attributes with name, abbreviation, score / locked state,
  definition, source (`CARD / PERSONA / BLUEPRINT / CUE / GENERATED`), and world-system vs
  player-character scope. Explicit card mechanics are visibly protected from silent replacement.
- **Macro compatibility** — success / warning (unresolved or unknown macros, with the field each
  is in, preserved not deleted) / blocking (an unresolved token blocks a required field). `{{user}}`
  = attached persona, `{{char}}` = imported card/story; supported tokens never appear raw in prose.
- **Difficulty** — Story / **Standard (default)** / Hard / Brutal / Custom, one plain description
  each; Custom reveals DC-offset and damage-multiplier levers. Difficulty changes visible check
  and damage values, not story content.
- **Action budget** — Actions per turn, stepper, range **1–5**, default **2**; combat, movement,
  item use, and consequential dialogue/social attempts all count; extra actions are refused, not
  silently performed. Shown read-only later in Story Settings; changing it needs rulebook regen.

## 4. Forging  → `ForgingProgress.dc.html`

Truthful, fragment-based progress: named completed/active/pending stages, active substep, current
repair/retry attempt, elapsed time, and the **most recent real progress event**. A visibly active
indeterminate indicator while a request runs. States: normal, slow, degraded, timed-out, failed,
cancelled, resumable, completed, plus the **regeneration** variant (archives prior rulebook until
atomic success; writes a rulebook-version boundary). Safe Cancel; retry only the failed fragment;
resume a retained draft. **No cosmetic percentage or self-advancing bar.**

## 5. Play  → `Play.dc.html`  (canonical)

- **Composer:** quiet `Up to N actions this turn` helper from the configured value; no false live
  count for free text; after classification, overflow shows accepted vs refused actions (refused
  get no success, consequence, XP, or loot); edit/retry keeps the player's text.
- **Contextual suggestions:** a discoverable button opens **5–6** context-aware suggestions
  (action / move / dialogue). Selecting inserts into the composer (never auto-sends); text stays
  editable; dismiss + regenerate; loading / ready / empty / failure; keyboard + SR access; respects
  the action budget in Full Stats; never confused with narrator-response regeneration.
- **Ruling artifact:** action/target + definitions, governing attribute/skill + definitions; a
  concise default and a full-detail expansion; states — denied, failed, successful, critical,
  opposed, unresolved-target, action-budget-exceeded, classifier-unavailable; visible consequences,
  costs, XP, loot, equipment effects.
- **Advantage / disadvantage:** normal (one die); advantage (two dice, used higher emphasized,
  discarded struck/dimmed); disadvantage (used lower emphasized); cancellation (both reasons shown,
  “cancelled to normal”, single die); opposed (each side its own mode). Player-facing reasons always
  shown.
- **Difficulty in rulings:** base DC → effective DC + preset name when it modifies a check; damage
  multiplier in the effects line (`8 damage ×1.3 Hard`). Never hidden.
- **Classifier / target recovery:** the turn stays visible; distinct states — no content, invalid
  response, timeout/unavailable, low confidence, unresolved action, unresolved target,
  narration-only continuation, successful retry. Recovery: Retry mechanics, Clarify target, Edit
  turn, Configure Classifier. A mechanical attempt without a valid ruling is never shown as a
  successful ruled action.
- **Streaming terminal states:** the indicator transitions through thinking → streaming →
  saving/finalizing → idle → error → cancelled → timed-out. Composer re-enables only when terminal.
  Stale-operation / app-restart recovery shown in place.
- **Regenerate with feedback:** previous/next variant control plus a small affordance with preset
  chips (Shorter, More detail, More tension, Less flowery, Different take) and an optional free-text
  field capped at **300 characters**; generating / completed / validation-error / provider-error;
  the active variant's feedback is inspectable. The fixed ruling and all mechanics never change.
- **Loot award:** compact line in the ruling + expanded award (item, tier, quantity, definition,
  effects, encounter/source, requirement); no-loot / one / multi; Equip now / Keep in inventory /
  View item; slot-full replacement never silently unequips; rare/Legendary/Mythical treatments;
  item-gained/lost entries in the Journal.

## 6. Skills & progression

Definition-rich, data-driven: name + plain definition, what it permits, linked attribute, actions
that use it, current rank, current XP + next threshold, latest award + the ruling that produced it,
rank-up, Master, multi-skill award, rewound award, and progression history in the full profile.
Valid if engineering changes thresholds or amounts.

## 7. Equipment  → `LivingCardLoadout.dc.html`  (reached from a character's full profile)

- **Tiers:** Common · Uncommon · Rare · Legendary · Mythical. Mythical is god-tier and never looks
  like ordinary loot. Legible without color (distinct glyph + full name).
- **Seven slots:** Primary, Secondary, Head, Body, Utility, Accessory I, Accessory II. A two-handed
  item occupies Primary + Secondary. Only equipped items grant effects. Consumables, keys, currency,
  quest objects, and lifestyle assets stay inventory items.
- **Effects presented (not balanced):** skill modifiers; temporary/conditional boosts; a skill or
  action the item enables; utility/lifestyle benefits; rare attribute modifiers; requirements,
  restrictions, active conditions.
- **States:** empty · compatible-available · equipped · compare/replace · two-handed occupation ·
  requirement-not-met · incompatible · unique-already-equipped · copies-owned · effect-active ·
  effect-conditional/inactive · recently-gained · recently-changed · fallen · No Stats (no UI).
  Inventory and equipped loadout are visually distinct so an unequipped item cannot appear active.

## 8. Loot

A mechanical result of combat and non-combat encounters — the DM Ruling determines the eligible
reward; prose never invents or grants items. The user chooses to equip or store; the user never
picks an undeserved reward from an unrestricted catalog. (Award UI lives in Play; eligibility
summary in Story Settings.)

## 9. Character Dossier  → `CharacterDossier.dc.html`

Complete and reachable from Characters and the Play living-card drawer: identity + visible
appearance; personality/mentality/traits/behavioral signatures/outlook; current mood/location/goal/
status; **Story so far** + key events; chronological history with turn refs; relationships in both
directions (feeling, trust, power, recent change); involved threads; and for Full Stats attributes
(1–20), resources, skills/XP, inventory, equipped loadout, item effects, and progression history.
Recently-changed markers + provenance. Variants: living, fallen, sparse, loading, empty/error,
narrow, player (primary), companion (secondary), No Stats. Never reveals player-hidden secrets.

## 10. Story Settings  → `StorySettings.dc.html`

Searchable Full Stats catalogs: attributes (1–20), skills, **universal actions (read-only
reference)**, story-specific actions (showing their universal base), resources, items & equipment,
tiers, loot eligibility, action budget (read-only), difficulty. Every definition explains what the
mechanic means and when it applies; no universal-action config controls. Difficulty picker matches
creation and explains changes apply from the next turn, are not retroactive, and don't affect
opposed DCs (confirmation + success states). Destructive rulebook regeneration: Duplicate &
regenerate (recommended) vs a strongly gated typed-confirmation in-place path; exact impact summary
covers attributes, skills/XP, universal & story actions, resources/flags, item catalog + inventory
+ equipped loadout + loot, rulings + journal, and hard-state sheets; preserved narrative/card/
persona/blueprint/lorebooks/transcript are distinguished from reset data; retained rollback
snapshot; version boundary; atomic success/failure/rolled-back; truthful fragment-based forge.

## 11. Mechanical Journal  → `Journal.dc.html`

A story-scoped Journal tab alongside Play, Overview, Characters, Story Settings. Entries grouped by
chapter; filters Rolls / Denied / Progression / Items-Equipment / Milestones; actor filter;
expandable details; Export → Markdown & CSV. Supports full roll math; normal/advantage/
disadvantage/cancellation/opposed; denied distinct from failed; base & effective difficulty; damage
multipliers; XP & rank-up; skill unlocks; item gain/loss, loot, equipment changes; attribute
changes; death; difficulty changes; chapter/arc/rulebook-version boundaries. States: empty, loading,
filtered-empty, load-more, export-success, export-error. Rewind/delete removes the corresponding
events — no orphans. No Stats has no journal surface.

## 12. Providers & recommendations  → `Settings.dc.html` (+ `RoleMatrix.dc.html`)

Explicit Primary provider: exactly one Primary badge when valid providers exist; Make-primary on
others; saving another provider never changes Primary; removing Primary needs an explicit
replacement; per-role provider/model bindings stay visible and win. Data-driven recommendations:
recommended-for-role badge, recommended parameter summary + expanded details, Custom marker after
edits, Reset to recommended, unavailable/outdated-recommendation state; live provider inventory kept
separate from recommendation metadata. The design chooses no model names or values.

---

## Acceptance (V7)

No 1–10 attribute language; 3–6 is the usual attribute **count**; card mechanics + persona are
visible before forge; V6's fixed universal-action catalog is gone; XP UI defines no progression
math; the ruling is above and authoritative over prose; feedback regeneration cannot appear to
alter mechanics; action budget config + overflow designed; 5–6 editable suggestions; all five tiers
+ all seven slots; inventory vs equipped never confusable; combat + non-combat loot flows; the full
profile carries mentality, story-so-far, relationships, history, and sheet; advantage/disadvantage,
difficulty, feedback regen, and the Journal satisfy the competitive-adoptions spec; forge never
relies on a cosmetic percentage; classifier + streaming failures have truthful terminal/recovery
states; regeneration impact includes equipment, loot, action-budget, and journal; Primary stays
explicit while recommendations stay data-driven; No Stats contains no empty Full Stats mechanics.
