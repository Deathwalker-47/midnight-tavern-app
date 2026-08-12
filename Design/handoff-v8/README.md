# Midnight Tavern — Design Handoff V8

**Created:** 2026-08-13

V7 was the last handoff that went through design. Roughly six weeks of engineering shipped after it
— the internal-beta remediation and Audit Plan 13 — **without design in the loop**. Then the owner
play-tested the packaged v0.2.9 build and returned 31 findings, which produced a twelve-plan
remediation set.

This folder exists so the next design pass starts from what the product actually is, not from what
V7 said it would be.

## Read in this order

| File | What it is |
| --- | --- |
| **`00-V8-AS-BUILT-BASELINE.md`** | What the product looks like today, the complete token set, and an honest list of every drift from V7. **Start here.** |
| **`02-SCREEN-INVENTORY.md`** | Every screen, its current composition, and whether it is unchanged / drifted / new / changing. |
| **`01-DESIGN-BRIEF.md`** | The actual ask — six items needing design, in priority order. |
| `assets/tokens.css` | The live design tokens, copied verbatim from `packages/ui/src/theme/tokens.css`. |
| `assets/motion.css` | The live motion definitions, including the reduced-motion guard. |

`01-DESIGN-BRIEF.md` is a **copy**. The canonical file is
`docs/plans/2026-08-13-DESIGN-BRIEF.md` — if the two disagree, the canonical one wins.

## Still-valid V7 material

`../handoff-v7/v7/*.dc.html` — 22 screen prototypes. **Still the best visual reference** for
anything `00-V8-AS-BUILT-BASELINE.md` does not explicitly contradict. Open `Index.dc.html`.

`../handoff-v7/00-V7-DESIGN-SPEC.md` — the V7 spec. Sections it covers that have not drifted
(registers, ruling-above-prose, advantage/disadvantage, difficulty presentation, equipment slots and
tiers, No Stats behaviour) remain binding.

## The single most useful thing in the repo

`packages/ui/src/screens/DesignSystem.tsx` is a **live in-app style guide** rendering every token and
component in its real state. Run the app and visit it. Keep it updated with any design change — it
is the mechanism that stops this drift happening again.

## The one rule that must not break

Two registers, held strictly apart:

- **STORY** — serif, brass `#D9A648`. Prose, names, chapter titles, primary CTAs.
- **SYSTEM** — mono, teal `#74B8AE`. Dice, DCs, verdicts, stats, ids, settings.

**If a number can change during play, it is mono.**

This has held perfectly across the whole build, and it is what makes the product's central promise —
the story is improvised, the rules are not — legible at a glance. The most visible defect in the app
today (`00-V8-AS-BUILT-BASELINE.md` §3.2) is a single place where it was broken.
