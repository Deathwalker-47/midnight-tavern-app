# V8 Screen Inventory — as built, 2026-08-13

Every screen in the shipped v0.2.9 app, what it currently contains, and whether it changed since the
V7 design pass. **Source of truth is `packages/ui/src/screens/*.tsx`.**

Legend:
- **= V7** — matches the V7 spec; the `handoff-v7/v7/*.dc.html` prototype is still accurate.
- **DRIFTED** — shipped differently from V7, without design input.
- **NEW** — did not exist at V7.
- **CHANGING** — a designed change is requested; see `01-DESIGN-BRIEF.md`.

---

## Play — `Play.tsx` (1,803 lines, the largest screen)

**DRIFTED · CHANGING.** V7 prototype: `handoff-v7/v7/Play.dc.html`.

Composition top to bottom: `PartyStrip` of present cast → scrolling message stream (narrator prose
in STORY register, player turns as right-aligned bubbles, `RulingArtifact` cards embedded inline
where dice landed) → `ActionSuggestions` drawer ("Possible moves") → composer. A `LivingCard` sits
in a right-hand drawer; below 900px it becomes an overlay.

Current defects, all scheduled and none needing design input:

| Defect | Note |
| --- | --- |
| Living card never refreshes after a turn | needs navigation away and back |
| Drawer survives a story switch | shows a character from the previous story |
| Present strip shows characters no longer in the scene | presence never expires |
| Composer is fixed height | should grow to ~4 lines then scroll |

**Needs design:** the narration-fallback treatment (brief §3). See baseline §3.2 — this is the
highest-value visual fix in the product.

## RulingArtifact — `components/RulingArtifact.tsx` (452 lines)

**DRIFTED.** The signature component; do not restyle the core.

Reveal sequence (~900ms, all collapsed under reduced motion): die settles 350ms `ease-settle` →
math fades in 400ms @350ms → total counts up 600ms @500ms → verdict stamps 500ms @850ms with an
overshoot curve → crits add a ring burst 1.1s @400ms.

Eleven variants: `success · failure · crit-success · crit-failure · opposed · npc · stacked ·
denied · budget-exceeded · unresolved · classifier-unavailable`.

`npc` and `stacked` are post-V7 and undesigned. `npc` carries a **reason line** explaining why the
NPC acted — a good addition currently rendered as plain secondary text. See baseline §3.1 for the
known accent defect.

## Characters — `Characters.tsx`

**CHANGING — highest priority.** Currently one generic card per character with a `PRIMARY` /
`SECONDARY` label. Becomes three umbrella sections (User / Party / NPC) with a rich User dashboard
and per-character type tags. Brief §1.

## CharacterDossier — `CharacterDossier.tsx` (812 lines)

**= V7.** `handoff-v7/v7/CharacterDossier.dc.html` still accurate. Full hard+soft join: identity,
appearance, personality, mood/location/goal, story-so-far, chronological history with turn refs,
bidirectional relationships, threads, and for Full Stats the attributes, resources, skills/XP,
inventory, equipped loadout and progression history.

## CharacterLoadout — `CharacterLoadout.tsx`

**= V7.** `handoff-v7/v7/LivingCardLoadout.dc.html`. Seven slots, five tiers, equipped-vs-inventory
distinction. **Changing behaviourally only:** editing will be restricted to `user` and `party`
characters, which needs a disabled-affordance state but no new layout.

## Overview — `Overview.tsx`

**DRIFTED · CHANGING.** The primary reading document currently *switches* — latest chapter until an
arc exists, then the arc, with a selectable timeline for historical chapters, and the immutable
premise in a separate small block. Two columns stacking below 760px. The owner's verdict is "all
over the place"; brief §4 replaces it with three fixed sections. Keyboard support on timeline
entries (Enter/Space, selected state) must survive.

## Journal — `Journal.tsx` (423 lines)

**DRIFTED.** `handoff-v7/v7/Journal.dc.html`. Filter chips grew from five to seven — added
**Interrupted** and **Boundary** — plus "All", in a row designed for five. Actor filter, expandable
details, Export → Markdown/CSV. Quests may add an eighth surface here (brief §2).

## StorySettings — `StorySettings.tsx` (1,163 lines)

**CHANGING — largest scope increase.** `handoff-v7/v7/StorySettings.dc.html`. Today: searchable
read-only catalogues (attributes, skills, universal actions, story actions, resources, items,
tiers, loot eligibility, action budget, difficulty) plus the gated rulebook-regeneration flow.

The equipment panel explains the five **tiers** with a card each but lists the seven **slots** as a
bare inline run with no explanation — brief §6a.

Becomes the home of the enabled-catalogue browser **and** the ~3,000-entry universal pool browser —
brief §5. This is the biggest new surface in the set.

## Library — `Library.tsx` (542 lines)

**= V7.** Story shelf, create/import, and the trial/licence upsell banner. Copy already promises
"Playing on — new turns and new stories — needs a license", which engineering will shortly make
true; the locked state may need a small treatment.

## Settings / RoleMatrix — `Settings.tsx`, `RoleMatrix.tsx`

**= V7.** `Settings.dc.html`, `RoleMatrix.dc.html`. Provider cards with key validation states,
explicit Primary provider, per-role model bindings, sampler panels, licence panel, and the
diagnostics opt-in toggle. The narration-failure notice will route here, so the Classifier row may
need a focus/highlight state.

## Diagnostics — `Diagnostics.tsx`

**NEW · undesigned.** Local, opt-in, never networked. Stage latency and outcome counters. Currently
a plain data dump. Not in the design brief — low priority, but it exists and someone will see it.

## SetupWizard / Wizard / StoryBlueprint

**= V7.** `SetupWizard.dc.html`, `StoryCreation.dc.html`, `StoryBlueprint.dc.html`. First-run
provider setup, story creation, and the pre-forge blueprint review with persona confirmation,
mechanic-source review, macro compatibility, difficulty and action budget.

Story creation will gain a **catalogue-selection step** when the universal pool lands (brief §5) —
the forge will select which pool entries a story enables. Not yet specced; flag if you want it in
this pass.

## Lorebook / Personas — `Lorebook.tsx` (1,058), `Personas.tsx` (511)

**= V7.** `Lorebook.dc.html`, `LorebookImport.dc.html`, `Personas.dc.html`.

## DesignSystem — `DesignSystem.tsx` (641 lines)

**= V7, and the most useful file in this folder for you.** The live in-app style guide. Open the app
and visit it to see every token and component in its real state. Keep it updated with any design
change — it is how the next person avoids this drift.

---

## Components not covered above

`ActionSuggestions` (changing — categorised moves), `ArcDoc`, `AttachPanel`, `BlueprintForm`,
`Button`, `ChapterCard`, `Chip`, `ConfirmDialog`, `DeadMarker`, `DifficultyPicker`, `EmptyState`,
`ForgingInterstitial`, `InlineNotice` (used by the narration notice — brief §3), `KeyField`,
`LivingCard` (changing — three resource bars), `LootAward`, `LorebookLibraryCard`, `MasteryPips`,
`MessageActions`, `ModelStatusChip`, `OperationStatus`, `PartyStrip` (changing — scene-only
presence), `PremiseInput`, `ProviderCard`, `RelationshipRow`, `ResourceBar`, `RoleMatrixRow`,
`SamplerPanel`, `SkillProgress`, `StoryCard`, `StoryCreationReview`, `ThinkingIndicator`, `Toast`.

## A note on screenshots

`screenshots/` is empty in this pass. The V7 folder's screenshots are of an older build and are
misleading for anything in §3 of the baseline. If you need current visuals, the fastest route is to
run the app and visit `DesignSystem.tsx`, or ask the owner — they have recent captures of the Play
screen, living cards, ruling artifacts, and the narration-fallback state.
