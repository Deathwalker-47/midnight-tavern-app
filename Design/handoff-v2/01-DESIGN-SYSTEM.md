# 01 · Design System

**Concept:** *lamplight over a game table.* Dark, warm, papery. A desktop application, not a
web page. Target width 1280–1600px; usable 1100–900 (side panels become overlays below ~900).

## The two registers (non-negotiable)

The whole look depends on holding two voices apart. Never let one borrow the other's font or color.

| | STORY | SYSTEM |
|---|---|---|
| Belongs to | the fiction: prose, names, quotes, chapter/arc titles, primary CTAs | the machinery: dice, DCs, verdicts, stats, ledgers, IDs, settings values, keybindings |
| Type | serif (Cormorant display / Source Serif prose) | monospace (IBM Plex Mono) |
| Accent | brass `#D9A648` | teal `#74B8AE` |

---

## Color tokens

```
/* Grounds (dark → light) */
--bg0-ground     #14100C   /* app background */
--bg1-panel      #1B1611   /* rails, headers, panels */
--bg2-card       #231C15   /* cards, raised surfaces */
--bg3-raised     #2C241B   /* chips, hover, inset controls */
--hairline       #382E21   /* 1px borders */
--hairline-soft  rgba(216,170,90,.12)

/* Text */
--prose          #EADCBE   /* narrative body + headings on dark */
--ui-text        #D6C9AB   /* UI labels, secondary headings */
--secondary      #A08D6C   /* supporting copy */
--muted          #6E5F49   /* captions, disabled, meta */

/* STORY accent */
--brass          #D9A648   /* names, primary CTA, story highlights */
--brass-bright   #F2C56B   /* hover, emphasis */

/* SYSTEM accent */
--teal           #74B8AE   /* dice, DCs, verdicts, system labels */
--teal-dim       #4E827B   /* secondary system, borders */
--teal-tint      rgba(116,184,174,.08)

/* Verdict / status */
--success        #8FB573
--failure        #C96F57   /* muted terracotta, not pure red */
--crit-gold      #F5CE6E   /* critical success, recently-advanced dot */
--crit-crimson   #B5442F   /* critical failure */
--dead           #8A8175   /* fallen characters, denied rulings */

/* Selection / focus */
selection bg     rgba(217,166,72,.25)
focus ring       2px solid #74B8AE, offset 2px
```

**Elevation:** `box-shadow: 0 6px 20px rgba(0,0,0,.4)` + a 1px warm hairline. Cards may carry a
very-low-alpha `repeating-linear-gradient` paper grain. **Radii:** cards 10px · chips/inputs 6px
· verdict stamps 3px.

---

## Type

Load from Google Fonts:

```
Cormorant Garamond : 500;600;700
Source Serif 4     : ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400
IBM Plex Sans      : 400;500;600
IBM Plex Mono      : 400;500;600
```

| Role | Family | Usage |
|---|---|---|
| Display | **Cormorant Garamond** 600 | screen titles, chapter/arc heads, wordmark, character names on cards |
| Prose | **Source Serif 4** 400/600, 17px / line-height 1.75, measure ~66ch | narrative body, dialogue, arc-document text |
| UI | **IBM Plex Sans** 400/500/600 | buttons, labels, forms, nav, chips |
| System | **IBM Plex Mono** 400/500/600, `font-variant-numeric: tabular-nums` | rolls, DCs, stats, prices, IDs, settings values, keybindings |

**Rule of thumb:** if a number can change during play (HP, a roll, a DC, a balance), it's mono.
If it's prose the player reads for story, it's serif.

---

## Motion

The **Ruling reveal** (~900ms) is the signature moment. Sequence:

1. **Die settles** — `rotate(-100deg) scale(.7)` → `rotate(0) scale(1)`, ~350ms,
   `cubic-bezier(.2,.8,.3,1.2)`.
2. **Math fades in** — the `d20 X + mod = total  vs DC` line, ~400ms, delay ~350ms.
3. **Total counts up** — integer tween to the final total (implemented with
   `@property --rt {syntax:'<integer>'}` + a counter, or a JS tween), ~600ms, delay ~500ms.
4. **Verdict stamps** — `scale(1.5) → 1` overshoot with a slight rotate, ~500ms, delay ~850ms.
5. **Crits** add ~300ms and one **ring-burst** flourish (an expanding, fading ring around the die).

Everything else is 120–200ms fades/slides. A **recently-changed** stat pulses once, then leaves
a static gold dot. **`prefers-reduced-motion: reduce` collapses all durations to ~0.001s** —
every screen already respects this; keep it.

Other motions: thinking indicator = three brass dots doing a staggered ink-bob; stat delta =
a brief background flash on the changed bar/number; mastery advance = pips shift to gold with a
fade; forging = a spinner ring + step list checking off in sequence.

---

## Shell

- **Left rail, 72px fixed.** Wordmark glyph (brass "M") at top; nav items Library · Story ·
  Personas · Lore · Settings (icon + 9px label, active item gets `--bg3` fill + brass icon +
  soft border). Bottom: a **model-status chip** (green/amber/red dot + model name) and a
  compact **trial chip** ("Trial 9d").
- **Contextual header.** Story screens show the story title + `CH n · CHAPTER NAME` (mono, teal)
  + message count, then the sub-tab bar (Play · Overview · Characters · Story Settings) with a
  brass underline on the active tab.
- **Demo strip.** Every screen carries a small "Demo" chip row directly under the header — this
  is a **prototype affordance for reviewing states**, not a product feature. Drop it in the real
  build (or keep behind a dev flag).

---

## Component library

Rendered live in `screens/DesignSystem.dc.html`. Key components:

- **RulingArtifact** — the embedded verdict card. Variants: success · failure · crit-success ·
  crit-failure · opposed · denied · npc · **stacked** (a two-roll exchange, e.g. enemy hits then
  player ripostes). Anatomy: register label ("RULING") → [die | math | verdict stamp] → optional
  italic result line → optional mastery/effect line. Left border + subtle bg tint carry the
  verdict color. **Denied** has no die (dashed ⊘ glyph, grey `--dead`, reason + hint).
- **LivingCard** — character sheet. Compact (drawer/companion) and full (Characters page).
  Player card accents brass; others teal. Contains ResourceBar, MasteryPips, trait chips,
  inventory chips, relationship rows. Fallen state: desaturated, "FALLEN" marker, HP 0, `--dead`.
- **PartyStrip** — a slim horizontal strip atop the story stream showing the **present** cast:
  small avatar/initial tile, name, player-visible HP bar, and a mood glyph from soft state.
  Click an entry to open that character's LivingCard drawer. Fallen members use the fallen
  treatment; the strip collapses to avatars-only in the narrow (~900px) layout.
- **ResourceBar** — labeled track (HP, Stamina). Color by fraction (success → failure when low);
  wounded state uses `--failure`; delta flash on change.
- **MasteryPips** — `●●●○○` across 4 ranks. Modifiers: novice +1 (1 pip) · adept +3 (3) ·
  expert +5 (5) · master +7. Recently-advanced pip/skill turns `--crit-gold` with a gold dot.
- **StoryCard / ChapterCard / ArcDoc** — shelf cards with colored spines; chapter timeline
  nodes (summarized = green, in-progress = brass, pulsing); the long-form arc document styles.
- **ProviderCard / KeyField** — provider row with the four key states (empty / validating
  spinner / valid + check + balance / rejected + reason), border color tracks state.
- **RoleMatrixRow** — role glyph + name + description, model dropdown, fit badge
  (Recommended = green / Advanced = amber).
- **PremiseInput**, **ForgingInterstitial**, **Chips** (recommended/advanced/fallen/keyword),
  **RelationshipRow**, **DeadMarker**, **ModelStatusChip**, **InlineNotice/Toast**
  (info/warn/error), **EmptyState**, **ConfirmDialog**.

### Buttons

- **Primary** — brass fill, `#1B1611` text (main CTAs: Send, Forge, Enter).
- **Secondary** — `--bg3` fill, brass text, soft brass border.
- **Ghost** — transparent, `--secondary` text, hairline border.
- **System action** — transparent, teal text + teal-dim border (for mechanics/settings actions).
- **Disabled** — `--bg3` fill, `--muted` text, `cursor: not-allowed`.

---

## Voice & copy

- **Storyteller voice:** a warm, plain game-master. Sentence case, active verbs, no purple
  filler. ("The gate is cold enough to sting.")
- **System voice:** terse and certain. ("SUCCESS · 17 vs DC 15", "Requires Lockpicking — not
  learned.")
- **UI copy:** direct, human, quietly literary. Empty states invite rather than apologize.
  Errors name the thing and the fix. Never expose jargon the player didn't opt into.


---

## Batch 2 additions (V2)

New components, rendered in `screens/DesignSystem.dc.html` under **"Configuration & authoring"**:

- **RoleMatrixRow** — provider select + role-aware model dropdown (Recommended-for-role group,
  Other models, free-text "Enter model ID"), sampler summary. States: recommended (badged),
  free-text/advanced with **json-mode-risk** warning on structured roles, and overridden (marker +
  reset).
- **SamplerPanel** — Precise / Balanced / Creative presets, the full control set (temperature,
  top-p, top-k, min-p, frequency/presence/repetition penalties, max tokens, stop sequences, seed),
  provider-unsupported fields disabled with a note, per-role "Reset to recommended". Pre-filled
  from the role's recommended profile; "Custom" marker when hand-edited. Always per-role.
- **MessageActions** — swipe variant counter (`‹ 2/3 ›`, cycles + generates), the **locked-die**
  glyph (ROLL LOCKED), the ⋯ menu (Delete last exchange · Rewind to here), the integrity copy, and
  the **RewindConfirm** dialog (states exactly what's removed, incl. rebuilt summaries).
- **LorebookLibraryCard** — name, entry count, "used in N stories", source tag (User / From card /
  Migrated).
- **AttachPanel** — lorebook (per-story enable toggle, detach, imported-from-card badge) and
  persona ("Play as …") variants.
- **BlueprintForm** — grouped fields (Identity · Opening · Narration control · Metadata), advanced
  group collapsed by default, live person-zone preview.
- **CharacterDossier** — the full two-register profile page (see 00-PRODUCT-SPEC).

Registers are unchanged: model/sampler/dice components are system-register (mono/teal); blueprint
identity and persona components are story-register (serif/brass) where they touch fiction.
