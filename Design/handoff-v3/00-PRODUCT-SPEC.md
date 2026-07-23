# 00 · Product Spec

## What Midnight Tavern is

A **local-first, single-player roleplay application**. The user writes what their character
does; a language model narrates the world in response. Unlike a plain chat, the app runs a
**deterministic mechanics layer** on top of the fiction:

- When the player attempts something with an uncertain outcome, the app **rolls dice**
  against a **difficulty class (DC)**, checks the character's **actual learned skills**, and
  renders a **Ruling** — a small, authoritative verdict card embedded in the prose.
- Rulings are **gated**: you cannot succeed at something you haven't learned. Attempting to
  pick a lock without the Lockpicking skill returns a **DENIED** ruling, not a roll.
- Outcomes **persist and compound**: HP drops, skills advance through mastery ranks, items
  are gained and spent, relationships shift. The character sheet is a **living document**.
- Long stories stay coherent through **rolling memory**: chapters are summarized into an
  **arc document** the storyteller re-reads before every turn.

Everything runs on the user's machine against **their own API key**. Nothing is sent to a
first-party server. The business model is a **14-day trial**, after which existing stories
remain fully playable and only *creating new stories* is gated.

### Architecture intent (see `reference/low-level-plan.md` for the authoritative version)

- **Five model roles**, each independently assignable to a model/provider:
  - **Narrator** — writes prose (strongest model).
  - **Classifier** — decides whether a turn needs a roll (cheap, runs every turn).
  - **Analyzer** — reads outcomes into stat/memory changes (cheap).
  - **Summarizer** — folds closed chapters into the arc document (mid).
  - **Story Generator** — forges a new world's rulebook from a premise (mid/strong).
- **Turn pipeline (Play):** player input → Classifier (roll needed? which skill? DC?) →
  gate check against character sheet → dice → Narrator streams prose with the Ruling mounted
  mid-stream → Analyzer applies deltas to the living cards.
- **Forging pipeline (new story):** premise → Story Generator produces a frozen **rulebook**
  (resources, skill catalog with prereqs, action catalog with DCs, items, starting state).
- **Persistence:** stories are folders on disk; personas and lorebooks are reusable across
  stories; keys and role assignments live in local settings.

---

## The screens

12 files. One shell (left rail 72px + contextual header). Story-scoped screens share a
sub-tab bar: **Play · Overview · Characters · Story Settings**.

### Index — `screens/Index.dc.html`
Not part of the product; a **directory** of every screen for review, grouped by area
(First run & library / Playing a story / Authoring & config). Each card deep-links to a
screen. Use it as your map.

### Play — `screens/Play.dc.html` — THE core screen
The surface the user spends 95% of their time in. Three columns: left rail, story stream
(center), living-card drawer (right, collapsible).

- **Story stream:** chapter marker, then an alternating log of **player messages** (right-
  aligned, warm bubble) and **narrator prose** (full-width serif, names highlighted brass).
  **Ruling artifacts** are mounted inline between prose blocks.
- **Party strip:** a slim strip atop the stream showing the present cast (avatar, name,
  player-visible HP, mood glyph); click an entry to open that character's Living Card. Fallen
  characters use the fallen treatment; collapses to avatars-only when narrow.
- **Composer:** serif textarea, Enter to send / Shift+Enter newline, Send button. Helper row
  shows keybindings + "Playing as Kestrel Vane". A **jump-to-latest** anchor appears when
  scrolled up.
- **Living-card drawer:** player card (HP + Stamina bars, skills with mastery pips,
  inventory chips), companion card (Wren — HP, traits, one skill, relationship line), and a
  scene card. Toggle with the × / edge tab, or **Esc**. Drawer collapses to a vertical
  "CARDS" tab.
- **Turn engine (scripted for the demo):** each Send advances a scripted sequence that
  showcases every ruling type — see `02-STATES-AND-FLOWS.md`. A turn plays: thinking
  indicator ("The story continues…" + quill-ink dots) → prose → Ruling animates in → stat
  deltas flash in the drawer.
- **States (Demo switcher):** live turns · denied · death (combat) · classifier-skipped ·
  model-failure · trial-expired · network-error · loading · empty · reduced-motion.

### Library — `screens/Library.dc.html`
Home base outside a story. A **shelf** of story cards (title, blurb, chapter/message counts,
last-updated, colored spine; active story badged). **New story** opens a **premise overlay**
(prompt textarea + seed suggestions) → **Forging interstitial**: a 5-stage progress sequence
("Reading your premise… → Deciding the rules… → Writing the skill catalog… → Placing your
starting gear… → Sealing the rulebook") ending on "The rules are set." → CTA into the story.
**Import** brings in a **character card** (Chara Card V2/V3): from a file (PNG-with-embedded-data
or JSON), **from a URL** (overlay with validating / fetched-preview / rejected states), or by
**dragging** a .png/.json anywhere over the Library; an import-preview confirms before seeding a
new story.
**States:** shelf · new-premise · forging · empty · loading (skeletons) · error · trial-expired ·
importing (url-fetch + drag-drop + preview).

### Wizard — `screens/Wizard.dc.html` — flagship first-run flow
3 steps with a progress rail:
1. **Welcome** — value prop "Stories with rules that hold." + an **auto-playing Ruling
   vignette** (the signature animation as a teaser). CTA "Set up your storyteller."
2. **Connect** — guided **OpenRouter** card (recommended): deep-link to create a key, paste
   field with **live validation** (idle → validating spinner → valid + green check + balance,
   or rejected + reason). On valid, an **inline test generation** streams two sentences to
   prove it works. Collapsible "Advanced: choose a different provider."
3. **Models** — the five roles pre-filled with sensible defaults; each row expands to a
   picker with **Recommended / Advanced — results may vary** badges and per-model pricing.
   CTA "Enter the library."

### Overview — `screens/Overview.dc.html`
The story's memory, made legible. Left: a **chapter timeline** (summarized vs in-progress)
plus a link to arc documents. Right: the **arc document** — a long, structured record the
storyteller reads before every turn. 11 sections: Plot Summary · Character Development
(per-character blocks) · Relationship Dynamics · Secrets & Revelations · Memorable Dialogue
(brass pull-quotes) · Promises & Oaths · Antagonists & Threats · World-Building & Lore ·
Unresolved Plot Threads · Key Items & Artifacts · Timeline. Regenerate/Delete controls (quiet,
would be confirm-gated). **States:** document · need-2-more-messages · summarizing · no-arc-yet.

### Characters — `screens/Characters.dc.html`
Full-size **living cards** in a grid, split into "The Party" and "Antagonists & Figures."
Party cards carry HP + Stamina bars, skills with mastery pips (gold dot = recently advanced),
trait chips, and relationship lines. **States:** cast · empty · a-death (shows a fallen
character — card desaturated, "FALLEN" marker, HP 0).

### Story Settings — `screens/StorySettings.dc.html`
A **developer/power-user view of the frozen rulebook**, system register dominant. Sectioned:
Core (stat mode, dice, DC range, mastery) · Resources (HP lethal, Stamina) · Skill catalog
(tiers + prerequisites + unlock paths) · Action catalog (22-row table: action, category, DC,
required skill, effect — a denied/locked row shown greyed) · Items & tiers · Starting state
(code-style block). **Regeneration is LOCKED** after play begins with an explanatory banner
("58 messages exist. Regenerating would orphan learned skills and inventory."); DC values and
labels remain editable.

### Card Creator — `screens/CardCreator.dc.html`
Two-pane **persona editor**. Left: form (avatar with color swatches, name, tagline,
description, trait toggles, suggested starting-skill rank pickers). Right: a **live preview**
card that updates as you type. Explains that the world fills in HP/stamina/gear from its own
rules. Reached from Personas.

### Personas — `screens/Personas.dc.html`
Light gallery of reusable player personas (avatar, name, tagline, blurb, trait chips, which
story each is used in; default badged). "New persona" tile → Card Creator.

### Lorebook — `screens/Lorebook.dc.html`
Manager for **keyword-triggered lore**. Left: searchable entry list (title + trigger-keyword
chips; always-in-context entries dot-marked). Right: editor (title, keyword chips, content
textarea with a word-count warning past ~80 words, "always in context" toggle, delete). Copy
explains entries are injected verbatim when a keyword appears in recent play.

### Settings — `screens/Settings.dc.html`
App-wide config, section-nav layout. **Providers & keys** — cards for OpenRouter/Anthropic/
OpenAI/Google, each showing one of the key states (connected + balance / validating / rejected
+ reason / empty). **Model roles** — the five-role matrix (role, model dropdown, fit badge; a
row deliberately shows an "Advanced" mismatch). **Sampler defaults** — temperature / top-p /
max-tokens sliders. **License** — trial status card + "enter a license key," with the
post-trial gating explained.

### Design System — `screens/DesignSystem.dc.html`
The living **component library**, rendered. Token swatches (grounds + both registers), the
type scale, **every Ruling variant** (success / failure / crit-success / crit-failure /
opposed / denied) with a **Replay** button for the animation, mastery pips × 4 ranks, resource
bars (incl. wounded/flash), chips & status dots, inline notices, and the button set. Voice
guidance at the bottom.

---

See `01-DESIGN-SYSTEM.md` for the visual system and `02-STATES-AND-FLOWS.md` for exhaustive
state and flow specs.


---

## Batch 2 additions (V2)

Two screens were added and several existing ones upgraded. See `00-WHATS-NEW-V2.md` for the full diff.

### Character Dossier — `screens/CharacterDossier.dc.html` (NEW)
A deep, **read-only** character profile, opened from the Characters roster ("Open full profile")
or the Play living-card drawer. Honors both registers on one page, top to bottom: header/identity
(portrait, name, one-liner, tier) · **Mentality** (traits, behavioral signatures, outlook) ·
Current state (mood · location · goal) · **Past** (backstory + an observations timeline tagged by
chapter/turn, given a reading-document treatment) · **Relationships** (both directions, player
relationship prominent, with trust/power/tone) · **The sheet** (system-register hard state —
resources, skills with mastery pips + progress-to-next, inventory with quantities, alive/fallen —
visually walled off) · Involved threads. Editing identity happens in the Blueprint editor; the
edit affordance links there. Demo states: living · fallen · sparse · narrow (sheet stacks below).

### Role Matrix — `screens/RoleMatrix.dc.html` (NEW, embedded component)
The interactive model configurator embedded in **Settings** and **Wizard step 3**. Five rows
(Narrator, Classifier, Analyzer, Summarizer, **Story AI**), each with a provider dropdown, a
role-aware model dropdown (Recommended-for-role group + Other + free-text "Enter model ID"), and a
sampler summary that expands to the full per-role sampler panel.

### Upgraded screens
- **Settings / Wizard** — embed RoleMatrix (was static text). Sampler control is now per-role.
- **Lorebook** — global library view (all lorebooks) → entry editor with always-on + priority.
- **Story Settings** — "Lorebooks in this story" attach panel + "Your persona in this story" row.
- **Story Blueprint** (NEW, `StoryBlueprint.dc.html`) — the full SillyTavern-parity story-card field set with a collapsible
  Narration-control group and the "rules can't be overridden" boundary copy. The **persona editor**
  (`CardCreator.dc.html`, from Personas) is a separate, deliberately simple editor — name, short
  role, description, voice/quirks, default toggle.
- **Library** — persona picker ("Play as …") in the new-story flow.
- **Play** — message swipe (variant counter) + ⋯ delete/rewind, locked-die glyph, rewind confirm.

### Role rename
The fifth role is **Story AI** everywhere (was "Story Generator").


---

## V3 additions

**Onboarding vs story creation.** `SetupWizard.dc.html` is onboarding only (connect provider +
confirm five roles; completion-gated). Story creation is the **New Story Builder** in the Library
(premise + persona quick path, or full `StoryBlueprint`). A clean profile launches into Setup
Wizard, not the Library.

**Connect-your-storyteller banner & gating (Library).** Until a provider is configured, a
persistent banner (primary “Continue setup”, secondary “Open provider settings”, plain-language
explanation) shows in the content area. Model-dependent actions (New Story, open-to-play) route to
setup with context; local actions (browse, Import card) remain available.

**Providers.** Canonical order everywhere: OpenRouter, Electron Hub, NanoGPT, OpenAI, Anthropic,
Google, Mistral, DeepSeek, xAI, Groq, Custom endpoint. Electron Hub and NanoGPT have full cards.

**Custom endpoint.** Two independent fields — Base URL (labelled, OpenAI-compatible example, URL
validation + normalization) and a separate masked API key — plus Validate connection, model
discovery, and manual model-ID fallback. States: validating / valid / rejected / network-error /
no-models.

**Role Matrix.** Separate Provider and Model controls; selecting a provider fetches its models
live (loading / ready / empty / error+retry / custom-discovery→manual). Per-role samplers retained.
