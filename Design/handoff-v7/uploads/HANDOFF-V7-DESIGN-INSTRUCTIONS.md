# Midnight Tavern — Handoff V7 Design Instructions

## Purpose

Create a clean V7 design revision using Handoff V6 as the visual baseline. This is a design task,
not an implementation or architecture task.

The V7 output must:

- correct the V6 decisions superseded below;
- add every new screen, interaction, and component state required below;
- preserve accepted V6 behavior that is not explicitly superseded;
- produce one coherent, implementation-ready design rather than another append-only copy of older
  handoffs.

## Source priority

When sources disagree, use this order:

1. this document;
2. `Plan/competitive-adoptions.md` for the four competitive-adoption features;
3. `Design/handoff-v6/` for the current visual language and accepted V6 flows;
4. older plans/designs only for the original equipment and Character Dossier concepts.

Do not carry forward stale decisions merely because they remain in an older copied document.

## Keep the design handoff clean

The design output should contain only:

- current product and UX decisions needed to understand the designs;
- screen and component specifications;
- state and interaction flows;
- responsive and accessibility behavior;
- the final interactive prototypes.

Do not include source code, database schemas, prompt templates, model-routing architecture,
migrations, test plans, implementation pseudocode, historical V2–V6 appendices, or copied planning
documents.

Produce one concise V7 design specification, one index, and only the prototypes needed below.
Choose one canonical Play/chat prototype; do not maintain conflicting `Chat` and `Play` versions.

---

## 1. V6 decisions superseded by V7

### 1.1 Attribute scale

Replace every V6 reference to a 1–10 attribute scale.

- Ordinary attribute scores use a **1–20** scale.
- Scores above 20 are permitted only when the source material explicitly establishes superhuman or
  otherwise exceptional capability.
- The usual number of attributes is **3–6**. This is the attribute count, not the score range or a
  total point budget.
- Continue to display the derived modifier beside the score. Use the established modifier behavior
  from the earlier 1–20 system in examples: `10 (+0)`, `14 (+2)`, `20 (+5)`, `22 (+6)`.
- An explicit card-defined `0` may still be shown as a locked or unavailable state with its reason;
  it is not a normal rollable score.
- Imported card-defined attribute names, abbreviations, scores, locked states, and meanings take
  precedence over generated replacements.

Update attribute examples and layouts everywhere: Story Creation, Living Cards, Character Dossier,
Story Settings, ruling artifacts, progression views, and the design system.

### 1.2 Universal actions

Remove V6's fixed list and fixed count of universal actions.

- The universal-action catalog is data-driven and may contain any number of entries.
- Engineering and product will decide the actual catalog during development.
- The catalog is maintained only through an engineering-owned upgradeable configuration. There is
  **no UI for adding, removing, editing, reordering, enabling, or disabling universal actions**.
- Where the product exposes universal actions for explanation or debugging, the design may provide
  a read-only catalog that supports arbitrary size, categories, search/filtering, definitions, and
  links from story-specific actions to their universal base.
- Use neutral placeholder examples only. Do not define a canonical action list in the design.

### 1.3 Progression math

Do not make progression balance decisions in the design handoff.

- Retain the four visible skill ranks: **Novice, Adept, Expert, Master**.
- Progress is XP awarded for ruled actions, not a count of actions or successful uses.
- Components receive the current XP, the next threshold, the latest award, and rank-up information.
- Do not hard-code XP thresholds, award formulas, anti-grinding rules, or other level curves into
  the design specification.

### 1.4 Model recommendations

Do not hard-code model names, recommendation lists, or recommended sampler values into prototypes.
The UI must accept changing recommendation data while preserving the V6 Primary-provider behavior.

---

## 2. Non-negotiable interaction model

### Full Stats exchange order

The canonical exchange order is:

1. player message;
2. one or more **DM Ruling** artifacts;
3. Narrator prose that obeys those rulings.

The ruling appears above the prose it governs. It names the attempted action, target, relevant
attribute and skill, outcome, consequences, XP, and any loot or equipment change. Narrator prose
must never visually appear to be the authority for a mechanical result.

If prose is regenerated, the ruling stays fixed and visible. The regeneration UI must state that
only the telling changes and that mechanics, dice, XP, loot, and hard-state consequences do not.

“DM Ruling” is the player-facing name of the rules verdict. Do not add a sixth DM model role or a DM
model selector.

### No Stats

No Stats remains Narrator-only. Hide Full Stats-only controls and surfaces, including difficulty,
action budgets, ruling mechanics, attributes, skills, equipment, loot mechanics, and the mechanical
journal. Do not render empty mechanical panels.

The contextual-suggestions control may still be available because it helps with prose-only
roleplay.

---

## 3. Story Creation and Story Blueprint

Update the Full Stats creation flow with the following sections.

### Persona confirmation

Before forging begins, show a prominent confirmation panel with:

- selected persona name and avatar;
- a short summary of the persona information that will shape the player character;
- **Change persona** and **Edit persona** actions;
- a strong warning that the character sheet will be generated from this persona;
- a clearly secondary warned path if the user continues without a persona.

The selected persona must never be easy to overlook.

### Mechanic-source review

Before forging, show a review of mechanics detected from:

- the imported card;
- the selected persona;
- the story blueprint/premise;
- generated defaults.

For attributes, show name, abbreviation, score or locked state, definition, source, and whether the
value applies to the world system or the player character. Make it visually clear that explicit
card mechanics will not be silently replaced by generated ones.

### Macro compatibility

Assume all officially supported SillyTavern macros are an engineering compatibility requirement.
The design only needs:

- a successful compatibility state;
- a warning state identifying unresolved or unknown macros and the field containing each one;
- copy explaining that unknown macros are preserved rather than silently deleted;
- a blocking state only when an unresolved token prevents a required creation field from working.

`{{user}}` represents the attached persona and `{{char}}` represents the imported
character/story. Supported tokens must never appear raw in visible story prose.

### Difficulty

Full Stats creation includes a difficulty picker:

- Story;
- Standard, selected by default;
- Hard;
- Brutal;
- Custom.

Each option has one plain-language description. Custom reveals the controls defined by
`Plan/competitive-adoptions.md`. Explain that difficulty changes visible check and damage values,
not the underlying story content.

### Player action budget

Full Stats creation includes **Actions per turn**:

- a compact stepper or select;
- range **1–5**;
- default **2**;
- plain-language copy explaining that combat, movement, item use, and consequential dialogue or
  social attempts all count;
- a note that extra detected actions are refused rather than silently performed.

Treat this as part of the story's rules. Show it read-only later in Story Settings with rulebook
regeneration as the route to change it.

---

## 4. Forging experience

Carry forward V6's truthful discrete progress design and refine it so it never looks frozen.

Required presentation:

- named completed, active, and pending stages;
- active substep or fragment;
- current repair/retry attempt when applicable;
- elapsed time;
- time or text for the most recent real progress event;
- a visibly active indeterminate indicator while a request is running;
- clear slow, degraded, timed-out, failed, cancelled, resumable, and completed states;
- safe Cancel;
- retry only the failed fragment;
- resume a retained draft.

Do not use a decorative percentage or a progress bar that advances independently of real work.
Do not imply that a slow forge is healthy forever. Explain what is happening and what the user can
safely do.

The forge flow also needs a regeneration variant initiated from Story Settings.

---

## 5. Canonical Play/chat screen

Create one canonical Play design that includes all of the following.

### Composer and action budget

- Show a quiet `Up to 2 actions this turn`-style helper using the configured value.
- Do not show a false live count for arbitrary free text.
- After classification, if the message contains more actions than allowed, show which actions were
  accepted and which were refused because the turn budget was exhausted.
- Refused extra actions receive no success treatment, consequence, XP, or loot.
- Provide an edit/retry route without losing the player's text.

### Contextual suggestions

Add a small but discoverable button beside the composer that opens **5–6** context-aware
suggestions. Suggestions may be actions, movement, or dialogue.

Required behavior and states:

- selecting a suggestion inserts it into the composer but never sends automatically;
- inserted text remains editable;
- the user can dismiss and regenerate suggestions;
- loading, success, empty, and failure states;
- keyboard and screen-reader access;
- in Full Stats, suggestions should respect the visible action budget;
- the suggestion control must not be confused with narrator-response regeneration.

### Ruling artifact

The expanded ruling design must support:

- action and target names plus their definitions;
- governing attribute and skill plus their definitions;
- denied, failed, successful, critical, opposed, unresolved-target, action-budget-exceeded, and
  classifier-unavailable states;
- visible consequences, costs, XP, loot, and equipment effects;
- a concise default state and a full-detail expansion.

### Advantage and disadvantage

Add ruling states for:

- normal roll;
- advantage: two dice with the used higher die emphasized and the discarded die dimmed or struck
  through;
- disadvantage: two dice with the used lower die emphasized;
- cancellation: both advantage and disadvantage reasons shown with a clear “cancelled to normal”
  result;
- opposed rolls where each side may have a different roll mode.

Always show the player-facing reasons for advantage or disadvantage.

### Difficulty in rulings

When difficulty modifies a check, show base DC, effective DC, and preset name. When it modifies
damage, show the multiplier in the effects line. Do not hide the adjustment.

### Classifier and target recovery

Keep the player's turn visible when mechanics cannot be classified. Distinguish:

- no content;
- invalid response;
- timeout or unavailable provider;
- low confidence;
- unresolved action;
- unresolved target;
- narration-only continuation;
- successful retry.

Use accurate copy and recovery actions such as Retry mechanics, Clarify target, Edit turn, and
Configure Classifier. A mechanical attempt without a valid ruling must not be presented as a
successful ruled action.

### Streaming terminal states

The `The story continues…` indicator must visibly transition through:

- thinking;
- streaming;
- saving/finalizing;
- idle;
- error;
- cancelled;
- timed out.

The composer re-enables when the operation is terminal. Include stale-operation and app-restart
recovery presentations without requiring the user to navigate away and back.

### Regenerate with feedback

For the latest narrator response, add:

- the existing previous/next variant control;
- a small “Regenerate with feedback” affordance;
- preset chips: Shorter, More detail, More tension, Less flowery, Different take;
- an optional free-text field with a 300-character limit;
- generating, completed, validation-error, and provider-error states;
- a way to inspect the feedback that produced the active variant.

State clearly that the fixed ruling and all mechanics remain unchanged.

---

## 6. Skills and progression presentation

Update all skill surfaces to be definition-rich and data-driven:

- skill name and plain-language definition;
- what the skill permits;
- linked attribute where applicable;
- actions that use it;
- current rank;
- current XP and next threshold;
- the latest XP award and the ruling/action that produced it;
- rank-up state;
- Master state;
- multi-skill award state;
- rewound award state;
- progression history in the full profile.

The design should remain valid if engineering changes thresholds or award amounts.

---

## 7. Equipment, loadout, and item tiers

Add a complete equipment presentation using these exact tiers:

**Common · Uncommon · Rare · Legendary · Mythical**

Mythical is a god-tier, nearly impossible classification and must not look like ordinary loot.
Tier styling must remain legible without relying on color alone.

### Seven-slot universal loadout

Use exactly seven active equipment slots:

1. Primary;
2. Secondary;
3. Head;
4. Body;
5. Utility;
6. Accessory I;
7. Accessory II.

A two-handed item occupies Primary and Secondary. Only equipped items provide equipped effects.
Consumables, keys, currency, quest objects, and non-worn lifestyle assets remain inventory items
and do not consume equipment slots.

### Equipment effects

Item details must be able to explain:

- skill modifiers;
- temporary or conditional boosts;
- a skill or action enabled by the item;
- utility or lifestyle benefits;
- rare attribute modifiers;
- requirements, restrictions, and active conditions.

Do not ask the designer to balance these effects. The design must present supplied values clearly.

### Required equipment states

- empty slot;
- compatible item available;
- equipped;
- compare/replace;
- two-handed slot occupation;
- requirement not met;
- incompatible slot;
- unique item already equipped;
- cannot equip more copies than owned;
- effect active;
- effect conditional or inactive;
- recently gained;
- recently changed;
- fallen/dead character;
- No Stats variant with no equipment UI.

Keep **Inventory** and **Equipped loadout** visually distinct so an unequipped item cannot appear to
grant active effects.

---

## 8. Loot

Loot is a mechanical result of combat and non-combat encounters. The DM Ruling determines the
eligible reward; Narrator prose does not invent or grant items.

Design the following:

- a compact loot line inside the ruling;
- an expanded loot award showing item, tier, quantity, definition, effects, encounter/source, and
  any requirement;
- no-loot state;
- one-item and multi-item states;
- View item;
- Equip now when compatible;
- Keep in inventory;
- slot-full replacement flow that never silently unequips another item;
- rare, Legendary, and Mythical award treatments that communicate significance without obscuring
  the mechanical facts;
- item-gained and item-lost entries in the Mechanical Journal.

The user chooses whether to equip or store an awarded item; the user does not choose an
undeserved reward from an unrestricted catalog.

---

## 9. Full character profile

Carry forward V6's Character Dossier rather than replacing it, but make it complete and reachable
from both Characters and the Play living-card drawer.

The full profile must contain:

- identity and player-visible appearance;
- personality, mentality, traits, behavioral signatures, and outlook;
- current mood, location, goal, and status;
- **Story so far** summary and key events;
- chronological observations/history with chapter or turn references;
- relationships with all tracked characters, in both directions where available;
- relationship feeling, trust, power, and recent change;
- involved plot threads;
- attributes, resources, skills, XP, inventory, and equipped loadout for Full Stats;
- item effects and progression history;
- recently changed markers and provenance where relevant.

Include living, fallen, sparse/newly introduced, loading, empty/error, narrow-width, primary
character, secondary character, player character, and No Stats variants. Never reveal
player-hidden secrets in this profile.

---

## 10. Story Settings and rulebook

### Definitions and catalogs

Provide readable, searchable Full Stats sections for:

- attributes;
- skills;
- universal actions as a **read-only reference**;
- story-specific actions;
- resources;
- items and equipment;
- tiers;
- loot eligibility summaries;
- action budget;
- difficulty.

Every definition explains what the mechanic means and when it applies. Story-specific actions show
their universal base without assuming a fixed universal-action count. Do not provide any universal
action configuration controls.

### Difficulty changes

Show the same difficulty picker used during creation. Explain that changes apply from the next turn,
do not rewrite prior outcomes, and do not affect opposed-check DCs. Show confirmation and success
states for a mid-story change.

### Rulebook regeneration

Carry forward V6's destructive regeneration flow and extend its impact summary to cover:

- attributes;
- skills and XP;
- universal and story-specific actions;
- resources and flags;
- item catalog, inventory, equipped loadout, and loot state;
- rulings and mechanical-journal history;
- hard-state character sheets.

Preserved narrative content, imported card, persona, blueprint, lorebooks, and transcript must be
distinguished from reset or archived mechanical data. Keep:

- Duplicate story and regenerate as the recommended path;
- a strongly gated direct-regeneration path;
- exact impact counts;
- typed confirmation for direct regeneration;
- retained rollback-snapshot messaging;
- rulebook-version boundary in the transcript and journal;
- atomic success, failure, and rolled-back states;
- truthful fragment-based forging progress.

---

## 11. Mechanical Journal

Add a story-scoped **Journal** tab alongside Play, Overview, Characters, and Story Settings.

Required layout:

- entries grouped by chapter;
- filters for Rolls, Denied, Progression, Items/Equipment, and Milestones;
- actor filter;
- expandable entry details;
- Export menu for Markdown and CSV.

Entries must support:

- full roll math;
- normal, advantage, disadvantage, cancellation, and opposed rolls;
- denied actions visually distinct from failed rolls;
- base and effective difficulty;
- damage multipliers;
- XP and rank-up events;
- skill unlocks;
- item gain/loss, loot, and equipment changes;
- attribute changes;
- death;
- difficulty changes;
- chapter, arc, and rulebook-version boundaries.

Provide empty, loading, filtered-empty, pagination/load-more, export-success, and export-error states.
After rewind or delete, removed events must no longer appear. No Stats has no mechanical Journal
surface.

---

## 12. Providers and model recommendations

Retain V6's explicit Primary-provider design:

- exactly one Primary badge when valid providers exist;
- Make primary on other providers;
- saving another provider never changes Primary;
- removing Primary requires an explicit replacement;
- per-role provider/model bindings always remain visible and win.

Extend model and role controls to present changing, configuration-supplied information:

- Recommended-for-role badge;
- recommended parameter summary;
- expanded parameter details;
- Custom marker after user edits;
- Reset to recommended;
- unavailable/outdated recommendation state;
- live provider inventory clearly separated from recommendation metadata.

The layouts must tolerate changing model names, counts, tags, and parameters. Do not choose the
recommended models or values in the design.

---

## 13. Required V7 prototypes

Produce or update only these canonical prototypes:

1. **Story Creation / Blueprint**
   - persona confirmation;
   - mechanic-source review;
   - corrected 1–20 attributes;
   - macro states;
   - difficulty;
   - action budget.
2. **Forging Progress**
   - normal, slow, degraded, repair, timeout, cancel, resume, success, and regeneration variants.
3. **Play**
   - canonical exchange order;
   - composer budget;
   - contextual suggestions;
   - all ruling additions;
   - classifier recovery;
   - streaming terminal states;
   - regenerate with feedback;
   - loot award.
4. **Living Card / Loadout**
   - corrected attributes;
   - XP;
   - inventory;
   - seven equipment slots and item details.
5. **Character Dossier**
   - complete story and mechanical profile plus equipment.
6. **Story Settings**
   - catalogs, difficulty, action budget, item tiers, and destructive regeneration.
7. **Mechanical Journal**
   - grouped history, filters, expanded math, export states.
8. **Settings / Role Matrix**
   - Primary provider plus configurable recommendations and parameters.
9. **Design System delta**
   - new or changed components and their required states only.

Do not create a second chat prototype or duplicate unchanged V6 screens.

---

## 14. Design acceptance checklist

The V7 design is ready only when:

- no 1–10 attribute language or examples remain;
- 3–6 is clearly the usual attribute count, not a score band;
- card-defined mechanics and persona influence are visible before forge;
- V6's fixed eight/ten universal-action catalog is gone;
- XP UI does not define progression math;
- the ruling is above and authoritative over Narrator prose;
- regeneration feedback cannot appear to alter mechanics;
- action budget configuration and overflow are designed;
- the composer offers 5–6 editable contextual suggestions;
- all five equipment tiers and all seven slots are designed;
- inventory and equipped effects cannot be confused;
- combat and non-combat loot award flows exist;
- the full character profile includes mentality, story so far, relationships, history, and sheet;
- advantage/disadvantage, difficulty, feedback regeneration, and Journal designs satisfy
  `Plan/competitive-adoptions.md`;
- forge progress never relies on a cosmetic percentage;
- classifier and streaming failures have truthful terminal and recovery states;
- rulebook regeneration includes the new equipment, loot, action-budget, and journal impacts;
- Primary provider remains explicit while model recommendations remain data-driven;
- No Stats contains no empty or inactive Full Stats mechanics;
- the output contains no implementation or historical-document noise.
