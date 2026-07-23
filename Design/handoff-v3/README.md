# Midnight Tavern — Developer Handoff · V3

A design-complete, interactive prototype of **Midnight Tavern**: a local-first roleplay
application with gated, deterministic game mechanics and persistent, evolving memory.

> **Status:** design + interaction reference, not production code. High-fidelity, clickable
> HTML prototypes — the source of truth for layout, spacing, color, type, copy, motion, states.

> **⭐ V3 — read `00-WHATS-NEW-V3.md` first.** It is the diff from V2: onboarding split from
> story creation (**Setup Wizard** vs **New Story Builder**), a persistent “Connect your
> storyteller” banner with setup-gating, the canonical 11-provider order (adds **Electron Hub**
> and **NanoGPT**), the two-field **custom endpoint** form, and genuinely separate
> **Provider / Model** controls with live per-provider model fetch. Everything else is unchanged.

---

## Screens (`screens/`)

```
Index.dc.html            screen directory / entry point
SetupWizard.dc.html      ★NEW onboarding: connect provider → confirm 5-role matrix (gated)
Library.dc.html          shelf + New Story Builder + "Connect your storyteller" banner/gating
Play.dc.html             core play loop (turns, rulings, drawer, swipe/rewind)
Overview.dc.html         chapter timeline + arc document
Characters.dc.html       living-card roster
CharacterDossier.dc.html deep read-only character profile (both registers)
StorySettings.dc.html    frozen rulebook + lorebook attach + persona row
CardCreator.dc.html      persona editor (simple)
StoryBlueprint.dc.html   full story-card editor (SillyTavern parity)
Personas.dc.html         persona gallery
Lorebook.dc.html         global lorebook library → entry editor
Settings.dc.html         11 providers (canonical order) + two-field custom endpoint + RoleMatrix
RoleMatrix.dc.html       ★model configurator: Provider + Model (live fetch) + per-role samplers
DesignSystem.dc.html     rendered component library + tokens
support.js               prototype runtime
```

## How to use

1. Open `screens/Index.dc.html` in a modern browser. Every screen is one click away, each with a
   **Demo** switcher (top strip) cycling its loading / empty / error / edge states.
2. First-run path: open **SetupWizard** → connect (paste a key; type one containing “bad” to see
   the rejected state) → confirm the five roles → done. Then **Library**.
3. To see gating: open **Library**, Demo → **Not configured**. The banner appears; **New story**
   and story cards route to setup; **Import card** stays available.
4. In **Settings** / **SetupWizard**, the **Role Matrix** has separate Provider and Model
   controls — pick a provider to watch models fetch (try NanoGPT or Custom endpoint for the
   empty/manual path). The **Custom endpoint** provider card has the two-field form; type a URL
   containing “down” or “nomodels” to see those states.

## Docs

- `00-WHATS-NEW-V3.md` — the V2→V3 diff (start here if you know V2).
- `00-PRODUCT-SPEC.md`, `01-DESIGN-SYSTEM.md`, `02-STATES-AND-FLOWS.md`,
  `03-IMPLEMENTATION-NOTES.md` — updated in place, each with a **V3 additions** section at the end.
- `00-WHATS-NEW-V2.md` — the prior diff, retained for history.
- `reference/` — original product & engineering plans (authoritative for data model & behavior).

## Two registers (unchanged, non-negotiable)

STORY = warm serif + brass `#D9A648` (fiction). SYSTEM = mono + teal `#74B8AE` (dice, DCs,
verdicts, providers, models, samplers). They never trade places.
