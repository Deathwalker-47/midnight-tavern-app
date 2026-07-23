# Midnight Tavern — Handoff V7

A clean V7 design revision on the V6 visual baseline. Interactive, high-fidelity HTML prototypes are
the source of truth for layout, copy, motion, and states.

## Start here
- **`00-V7-DESIGN-SPEC.md`** — the concise V7 specification (decisions, screens, states).
- **`v7/Index.dc.html`** — the prototype directory. Open it first; every screen has a **Demo**
  switcher for its states.

## The nine canonical V7 prototypes (`v7/`)
1. `StoryCreation.dc.html` — persona confirmation, mechanic-source review, 1–20 attributes, macro
   states, difficulty, action budget.
2. `ForgingProgress.dc.html` — truthful fragment progress + slow/degraded/timeout/cancel/resume/
   regeneration; no cosmetic percentage.
3. `Play.dc.html` — the canonical chat: ruling above prose, composer budget, contextual suggestions,
   advantage/disadvantage/opposed rulings, classifier recovery, streaming terminal states,
   regenerate-with-feedback, loot award.
4. `LivingCardLoadout.dc.html` — seven equipment slots, five tiers, XP, inventory (reached from the
   full profile).
5. `CharacterDossier.dc.html` — the complete story + mechanical profile with equipment.
6. `StorySettings.dc.html` — searchable catalogs, difficulty, item tiers, action budget, destructive
   regeneration.
7. `Journal.dc.html` — the Mechanical Journal: grouped history, filters, expanded math, export.
8. `Settings.dc.html` (+ `RoleMatrix.dc.html`) — explicit Primary provider + data-driven
   recommendations.
9. `DesignSystemDelta.dc.html` — only the new/changed V7 components and their required states.

Supporting screens carried from V6 (Overview, Characters, Lorebook, Library, Personas, Setup Wizard,
base DesignSystem, etc.) are included in `v7/` so the handoff is self-contained.

## Key V7 changes
1–20 attributes · DM Ruling above and authoritative over prose · data-driven universal actions ·
XP-based progression · advantage/disadvantage · difficulty · regenerate-with-feedback · Mechanical
Journal · five item tiers + seven-slot loadout · truthful forge progress · explicit Primary provider
with data-driven model recommendations.
