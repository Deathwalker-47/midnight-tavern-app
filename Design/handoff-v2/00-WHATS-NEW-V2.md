# What's New in V2

This is **version 2** of the Midnight Tavern handoff. V1 delivered the twelve core screens
and the design system; **V2 makes the configuration and authoring surfaces real, adds two new
screens, and upgrades the Play loop with message-level controls.** Everything in V1 still
applies — tokens, the two-register discipline, the Ruling animation, motion rules, and copy
voice are unchanged. This document highlights only what changed.

> If you implemented against V1, read this file top to bottom — it's the diff. The other docs
> (00–03) have been updated in place and carry a **“Batch 2 additions”** section at the end.

> **Correction (post-review):** the full SillyTavern-parity field set belongs to **story
> creation**, not personas. There are now two distinct editors: **Story Blueprint**
> (`StoryBlueprint.dc.html`) holds the full story-card fields; the **persona editor**
> (`CardCreator.dc.html`, reached from Personas) is deliberately simple — a persona is just
> *who you play*, not a whole world.

---

## New screens (2)

| Screen | File | What it is |
|---|---|---|
| **Character Dossier** | `screens/CharacterDossier.dc.html` | A deep, read-only character profile opened from the roster or the Play drawer. Both registers on one page: story-register mentality / past / observations timeline / dual-direction relationships, walled off from a system-register "hard-state" sheet. Demo states: living · fallen · sparse · narrow. |
| **Role Matrix** | `screens/RoleMatrix.dc.html` | The interactive model-configuration component (also embedded inside Settings and the Wizard). Provider→model dropdowns with per-role recommendations + free-text, and the full sampler panel. Openable standalone for review. |
| **Story Blueprint** | `screens/StoryBlueprint.dc.html` | The full story-card editor (SillyTavern parity): identity, scenario, first message + alternate greetings, system prompt, post-history, example dialogue, tags — with live preview. Reached from the Library new-story/import flow and the dossier. |

The screen count goes from 12 to **15** (14 product screens + Index).

---

## Upgraded areas (mapped to the batch-2 request)

**1 & 5 · Real role matrix with provider→model dropdowns.** Settings and Wizard step 3 no
longer show static role text. Both now embed the **RoleMatrix**: a scannable five-row grid
(Narrator, Classifier, Analyzer, Summarizer, **Story AI**) where each row has a provider
dropdown, a **role-aware** model dropdown (models are grouped under "Recommended for <role>"
with a badge, then "Other models", then a persistent "Enter model ID…" free-text row), and a
sampler summary. States covered: recommended/badged, manually-overridden (marker + reset),
**json-mode-risk** caution on structured roles, provider-list loading, and free-text/advanced.

**2 · Lorebooks are now a global library + attach model.** The Lore screen gained a top-level
**library view** (all lorebooks across the app: name, entry count, "used in N stories", source
tag) that drills into the existing entry editor (now with `always-on` + priority controls).
**Story Settings** gained a **"Lorebooks in this story"** attach panel — per-story enable
toggles, detach, and an attach picker. Mental model: lorebooks are shared assets you attach,
not property of one story.

**3 · Story creation vs. personas — two separate editors.** The full **Story Blueprint**
editor is a dedicated screen (`StoryBlueprint.dc.html`) with grouped, all-editable fields:
Identity, Opening (incl. repeatable **alternate greetings** with preview flip), a collapsible
**Narration control** group (system prompt, post-history instructions, example dialogue), and
Metadata — the same fields you get importing a Chara Card V2/V3. Its narration group carries the
required boundary copy: *"Guides the storyteller's voice and style. The world's rules and dice
outcomes are always enforced by the app and can't be overridden here."* It's reached from the
Library's new-story flow ("or author a full blueprint"), the import flow, and the dossier's edit
affordance. The **persona editor** (`CardCreator.dc.html`, from Personas) stays deliberately
**simple**: name, short role, description, voice/quirks, default toggle — a persona is who you
play, not a world.

**4 · Personas attach to stories.** The new-story flow (Library premise overlay) has a compact
**"Play as: <persona> ▾"** picker; Story Settings has a **"Your persona in this story"** row
with a change control. Optional, defaults to the global default persona. No new full screen.

**6 · Swipe + delete/rewind on messages (Play).** The latest narrator message now has a quiet
hover/focus control cluster: a **swipe variant counter** (`‹ 2/3 ›` — cycles existing tellings
and generates a new one at the end) and a **⋯ menu** (Delete last exchange · Rewind to here).
Earlier messages get **rewind-only**. The integrity rule is front-and-center: the copy
*"Swiping rewrites how it's told — the roll already happened and stands."* plus a **locked-die
glyph** (ROLL LOCKED) when the turn contained a ruling. The **rewind confirm** dialog states
exactly what's removed, including that summaries after that point will be rebuilt.

**7 · Character dossier.** New screen — see the table above.

**8 · Full sampler panel.** Sampler control moved out of a global block and onto **each role**
(opened from a RoleMatrix row): temperature, top-p, top-k, min-p, frequency/presence/repetition
penalties, max tokens, stop sequences, optional seed. **Presets** (Precise / Balanced /
Creative) set a whole profile in one tap; a recommended model **pre-fills** its role's profile;
unsupported fields render disabled with a note; a per-role **Reset to recommended** is present.
Samplers are always per-role — there is no global creativity control.

**Rename.** The fifth model role is called **Story AI** everywhere (was "Story Generator").

---

## New Design-System specimens

`screens/DesignSystem.dc.html` gained a **"Configuration & authoring"** section with
specimens for: RoleMatrixRow (recommended / advanced+json-risk / overridden states),
SamplerPanel (presets + disabled field), MessageActions (swipe counter, locked-die glyph, ⋯
menu, rewind-confirm), LorebookLibraryCard, AttachPanel (lorebook + persona), BlueprintForm,
and CharacterDossier. (The Party Strip specimen from the interim batch is also present.)

---

## Nothing else changed

Two-register discipline, color tokens, type scale, the Ruling artifact and its animation,
motion timings, and copy voice are all **identical to V1**. No screen outside the list above was
redesigned.
