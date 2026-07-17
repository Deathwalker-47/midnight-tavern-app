# Midnight Tavern — Developer Handoff

A design-complete, interactive prototype of **Midnight Tavern**: a local-first roleplay
application with gated, deterministic game mechanics and persistent, evolving memory.
This package is everything a developer needs to implement it in a real codebase.

> **Status:** design + interaction reference, not production code. The screens are
> high-fidelity, clickable HTML prototypes. Use them as the source of truth for
> layout, spacing, color, type, copy, motion, and state behavior.

---

## What's in this folder

```
handoff/
├── README.md                 ← you are here
├── 00-PRODUCT-SPEC.md        ← product overview, architecture intent, screen-by-screen spec
├── 01-DESIGN-SYSTEM.md       ← tokens, type, motion, component library, voice
├── 02-STATES-AND-FLOWS.md    ← per-screen state matrix + the two flagship flows step-by-step
├── 03-IMPLEMENTATION-NOTES.md← how to read the prototype files + build guidance
├── screens/                  ← the 12 interactive prototype screens (open in a browser)
│   ├── Index.dc.html         ← screen directory / entry point
│   ├── Play.dc.html          ← THE core screen (turn engine, rulings, living-card drawer)
│   ├── Library.dc.html       ← story shelf + new-story premise → forging interstitial
│   ├── Wizard.dc.html        ← 3-step first-run setup
│   ├── Overview.dc.html      ← chapter timeline + arc document
│   ├── Characters.dc.html    ← living cards (party + antagonists)
│   ├── StorySettings.dc.html ← the frozen rulebook viewer
│   ├── CardCreator.dc.html   ← persona editor with live preview
│   ├── Personas.dc.html      ← persona gallery
│   ├── Lorebook.dc.html      ← keyword-triggered lore entries
│   ├── Settings.dc.html      ← providers/keys, model-role matrix, samplers, license
│   ├── DesignSystem.dc.html  ← rendered component library + token reference
│   └── support.js            ← runtime for the prototype format (see notes below)
└── reference/
    ├── design-notes.md       ← the condensed design bible (tokens + content + per-screen)
    ├── high-level-plan.md    ← original product plan (source of truth for behavior)
    ├── low-level-plan.md     ← original engineering plan (data model, pipeline)
    └── design-brief.md       ← original design requirements brief
```

## How to use this package

1. **See it move first.** Open `screens/Index.dc.html` in a modern browser (Chrome/Safari/Firefox).
   From there, every screen is one click away. Each screen has a **Demo** switcher (top strip)
   that cycles its loading / empty / error / edge states — exercise them all.
   - In **Play**, type any message and press Enter to watch a full turn: prose streams, a
     **Ruling** artifact animates in (die settles → math → total counts up → verdict stamps),
     stats update in the drawer. Send several times to walk the scripted sequence
     (denied → NPC roll → combat exchange → nat-20 crit with mastery advance).
2. **Read `00-PRODUCT-SPEC.md`** for what each screen is and does.
3. **Read `01-DESIGN-SYSTEM.md`** before writing any UI — it defines the two-register
   system that the whole look depends on.
4. **Read `02-STATES-AND-FLOWS.md`** to implement the same state coverage and the two
   flagship flows end-to-end.
5. **Cross-check against `reference/`** — the original plans define the data model, the
   model pipeline, save format, and mechanics rules in detail. Where this handoff and the
   plans disagree, the plans win on *behavior*; the prototype wins on *look & feel*.

## The one thing not to get wrong

The entire aesthetic rests on **two visual registers that never trade places**:

- **STORY** — warm, serif, brass `#D9A648`. Everything the fiction touches: prose, names,
  quotes, chapter titles, primary CTAs.
- **SYSTEM** — cool, monospace, teal `#74B8AE`. Only the machinery: dice, DCs, verdicts,
  stats, ledgers, IDs, settings values.

If a die roll ever renders in brass serif, or a character's name in teal mono, it's wrong.
See `01-DESIGN-SYSTEM.md`.
