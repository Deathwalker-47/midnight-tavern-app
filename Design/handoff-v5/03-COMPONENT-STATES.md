# 03 · Component States — v5

Component contracts new/changed in v5. Carries v4 components (exchange unit, ruling summary/expand,
mastery meter, ST-safe renderer, lorebook import) and adds attributes, multi-term rulings,
reveal/unlock, and No Stats variants.

## §Attributes — components (source: reference/attribute-integration.md)
Attributes render in the **SYSTEM register** (teal, monospace, tabular numerals), same wall as
resources/skills.
- **Living Card — Attributes block:** compact rows `STR 16 (+3)` (score + derived modifier), before/
  beside resources. Must lay out **3, 6, and >6** attributes without clipping (wrap to a 2-col grid
  past 4). Recently-changed score uses the existing gold-dot changed language.
- **Character Dossier — Attributes section:** full system-register block — name + abbrev, current
  score, derived modifier, description/what it governs, recently-changed marker + change source.
- **Score→modifier:** always via the single function `floor((score − 10) / 2)`; never inline the
  formula. Bands: typical 8–16, signature ≤18, heroic ≤20, superhuman >20, absolute clamp 1–30.

## §Ruling — multi-term artifact (the signature element)
The breakdown shows 1–3 stacked modifier terms and the count-up **sums the visible terms**:
- raw: `d20 (11) + DEX (+2) = 13 vs DC 12 — Success`
- skilled: `d20 (14) + STR (+3) + Blade Adept (+3) = 20 vs DC 15 — Success`
- contextual: an optional third term (e.g. `+ Ctx (+1)`)
- flat/luck: `d20 (18) = 18 vs DC 15 — Success` (no attribute term)
- opposed: both sides show their own terms; higher total wins, tie defends
- crit: natural 20/1 regardless of modifiers
- attribute-prerequisite denial: no dice; "Requires DEX ≥ 14 (Kestrel has 12)" + suggestion
- rare attribute delta: a system-register note "STR 16 → 15 (curse)" + recently-changed marker
Motion unchanged (die-settle → term count-up → total → verdict stamp), legible with three terms, and
respects reduced-motion. Term rows never crowd the stamp; wrap terms to a second line before
shrinking type.

## §Reveal / unlock — component
A quiet inline event card in the exchange (SYSTEM register): title "New skill revealed: [name]" or
"[action] now available", a one-line reason, and a note it was already in the sealed rulebook. Never
styled as model output. Denied-still-locked variant names the missing prerequisite. Dossier shows a
progression-history list (reveals + rank-ups) with chapter/turn. Story Settings developer view shows
**total definitions vs currently-revealed**. Rewinding past the causing exchange removes the reveal.

## §No Stats — card variants
- **Living Card / Characters (No Stats):** identity zone only — avatar, name, tagline, authored
  description/traits. **No** attributes/resources/skills/mastery/mechanical-inventory blocks, no
  analyzer-evolving fields. Never render empty bars or zero-filled sheets; the card ends after
  identity with a quiet "Narrator-only story" chip.
- **Story Settings (No Stats):** a "Narrator-only story" summary replaces all mechanical catalogs;
  blueprint/persona/lorebook/formatting controls remain.

## §Attribute catalog — Story Settings (Full Stats)
System-register section per generated definition: name, abbrev, description, default score, count of
actions it governs, skills/unlocks referencing it. Hidden entirely in No Stats.

## §Advanced score edit (dev/schema view, post-freeze)
A clearly-separated power-user row: current score + derived modifier preview, allowed range, confirm,
warning "future checks change; previous turns do not", checkpoint/audit note. **Not** point-buy, not
a chargen screen. (If deferred, mark the deferral explicitly — never drop silently.)

## Carried from v4 (unchanged behavior)
Exchange unit (player → ruling(s) → Narrator; prose-only omits ruling area), ST-safe renderer
(grammar + sanitizer), lorebook import (matrix + fixtures), rewind vs delete-from previews, mastery
meter — now visually distinct from attributes (mastery = pips/rank progress by use; attributes =
static score + modifier).