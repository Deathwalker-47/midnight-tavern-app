# Design Requirements Brief — v1

A complete design brief for the user interface of a local-first roleplay application with deterministic game mechanics and evolving character memory. This document defines the product's identity, the design principles, the full screen inventory with per-screen requirements, the shared component library, every important state, and the interaction/motion rules. It is written to be handed directly to a designer or a design-generation tool with no other context required.

---

## 1. What the product is (design context)

A **desktop application** (Windows/macOS; built web-tech, so effectively a responsive web UI in a native shell) where a user plays interactive stories narrated by an AI. What makes it different from every other AI roleplay client:

1. **The world has rules that hold.** Dice rolls, skills, inventory, and health are enforced by deterministic code, not by the AI's whims. When the player attempts something, a real d20 is rolled against a real difficulty, and the outcome is binding. Failure genuinely happens.
2. **Characters visibly evolve.** Every character has a "living card" that grows through play — appearance, mood, relationships, growth, key events — like watching a character sheet become a biography.
3. **Long stories stay coherent.** Play is compressed into chapters and arcs with rich structured summaries the user can browse like a book of their own story.

**Audience:** tabletop RPG, CRPG, and LitRPG enthusiasts — people who love rules, progression, dice, and consequence. They are depth-seekers on long, lean-in sessions at a desktop. They are literate in RPG conventions (HP bars, skill checks, DCs, inventory) and *want* to see the mechanics, not have them hidden. They are not the casual mobile chat-companion audience.

**The feeling to design for:** sitting down at a game table with a brilliant game master and a rulebook that is actually enforced. Immersive and literary, but with visible, trustworthy machinery underneath. Two registers must coexist on screen: **story** (prose, atmosphere, character) and **system** (dice, numbers, ledgers, verdicts). The design's central craft problem is making these two registers feel like one product.

## 2. Design principles

1. **Prose is the protagonist.** The reading experience is the product's center. Story text gets generous measure (60–75ch), comfortable line-height, and a serif or high-quality humanist face that invites long reading. Nothing may crowd it.
2. **Mechanics are honest and legible, never decorative.** When a roll happens, show the math: `d20 (14) + Blade Adept (+3) = 17 vs DC 15 → SUCCESS`. The user must always be able to verify the system told the truth. Mechanical UI uses a distinct "system register": a monospace or engineered utility face, precise alignment, tabular numerals. System elements never pretend to be story, and story never pretends to be system.
3. **Ambient, not administrative.** Panels, sheets, and summaries are *there when summoned* (a tap, a drawer, a hover) and otherwise out of the way. The user should never feel they are maintaining a dashboard. If a screen feels like homework, it is wrong.
4. **Two-speed personality.** Calm, disciplined chrome; one deliberate signature moment (see §3). Restraint everywhere except where the product's promise lives.
5. **Evolution is the delight.** Wherever state changes — a card gains a trait, a skill ranks up, a relationship shifts — the change itself should be perceivable (a brief highlight, a "changed since last session" marker). Watching things become is the emotional payoff; design surfaces the *delta*, not just the state.
6. **Newcomer path is guided; power path is dense.** The same product serves a first-timer who has never heard of an API key and a veteran who wants sampler-level control. Progressive disclosure is mandatory: simple defaults on the surface, an "Advanced" seam that opens real depth.

## 3. Visual direction

- **Theme:** dark-first (this audience plays long sessions, often at night). A light theme may exist but dark is the design target. Avoid the two AI-design clichés: this must not be (a) near-black with a single acid-green/vermilion accent, nor (b) warm cream with a terracotta accent. Build a palette from the product's own world instead.
- **Palette concept:** "lamplight over a game table." A deep, slightly warm dark ground (not pure black — think oxidized bronze-black or deep umber-slate), a parchment-adjacent light tone reserved for prose text, one **story accent** (a warm candle/brass gold used for narrative highlights, character names, quoted lines) and one **system accent** (a cool, precise tone — steel-teal or similar — used exclusively for mechanical elements: dice, DCs, verdicts, ledger values). The two accents are the visual encoding of the two registers and must never swap roles. Add a success green, a failure red (muted, not alarm-red), and a critical gold/crimson pair for nat-20/nat-1 moments. Define all as named tokens.
- **Typography (three roles):** a characterful display face for story titles, chapter/arc headings, and the wordmark (something with literary weight — used with restraint); a highly readable body face for prose (serif or bookish humanist, tuned for long-form dark-mode reading); a utility/monospace face for the system register (rolls, stats, IDs, settings). The type pairing should itself be memorable.
- **The signature element:** the **Ruling** — the moment a dice resolution appears in the story stream. This is the product's promise made visible, and it deserves the design's one bold move: a distinctive inline artifact (not a toast that vanishes) that sits between prose paragraphs like an illuminated marginal note or a stamped verdict — showing the d20 result, modifier, DC, and outcome with a short, satisfying reveal animation (die settles → total counts → verdict stamps). Crits (nat 20 / nat 1) get an amplified variant. Everything else in the app stays quiet so this moment lands.
- **Texture and depth:** subtle, purposeful. Cards may carry a faint paper/parchment grain in their surface; elevation via soft shadow and 1px warm hairlines rather than heavy borders. No glassmorphism, no neon glows outside crit moments.
- **Iconography:** a single consistent stroke-icon set; a small custom set for RPG concepts (d20, skill, inventory, HP, arc/book, lorebook) that matches the system register's precision.
- **Density:** medium. Roomier than a trading terminal, denser than a marketing site. Long-session ergonomics: generous hit targets, restrained pure-white, no large bright surfaces.

## 4. Application shell & navigation

- **Layout:** a slim left rail (icon + label on hover/expand) with: Library, current Story (contextual), Personas, Lorebooks, Settings. The Play screen is entered from Library and takes over the content area.
- **Within a story**, a secondary tab row or segmented control: **Play · Overview · Characters · Story Settings**.
- **Window:** min 1100×700; design targets 1280–1600 wide. All screens must degrade gracefully to a narrow (~900px) window: side panels become drawers/overlays.
- **Persistent elements:** connection/model status chip (small, bottom of rail — shows the active narrator model and a green/amber/red health dot), and trial/license state when relevant (quiet, in Settings and as a subtle chip during trial).

## 5. Screen inventory & requirements

### 5.1 First-run Setup Wizard
Three steps, full-screen, calm and confident. This flow decides whether newcomers survive; it must feel like being welcomed, not configured.

1. **Welcome** — the product's promise in one screen: name, one line ("Stories with rules that hold"), a small animated vignette of the signature Ruling artifact resolving (this is the product demoing its soul in 3 seconds). CTA: "Set up your storyteller."
2. **Connect your AI** — plain-language explanation ("This app runs on an AI model you connect — your key, your account, your data stays yours"). The **recommended path** is one aggregator provider presented as a guided card: deep-link "Create a key" button, paste field with live validation (spinner → green check + detected balance), then an inline **test generation** that streams a two-sentence sample so the first experience is success. An unobtrusive "Advanced: choose a different provider" link expands the full provider list (10+ providers + custom endpoint) with key fields per provider. Error states must be specific and blame-accurate: "This key was rejected by the provider" / "This model couldn't complete a test — try a recommended one."
3. **Choose your models** — a pre-filled card showing the five model roles (Narrator, Classifier, Analyzer, Summarizer, Story Generator) each with a recommended default and a "Recommended" badge; one toggle reveals per-role dropdowns for those who care. CTA: "Enter the library."

### 5.2 Library (home)
The default screen. A shelf, not a dashboard.

- **Sections:** "Your stories" (cards with cover, title, a one-line where-you-left-off, chapter count, last-played), "Start something new" (a prominent premise-input card: a single text field "Describe your story…" + Start button — this is the primary CTA of the whole screen), and "Starter stories" (3 bundled cards with cover art treatment).
- **Import** actions (secondary): "Import card" (file) and "Import from URL" — with a drop-anywhere file-drop affordance on the whole screen.
- **Story creation moment:** after the user submits a premise, show a crafted **forging interstitial** (15–45s of real generation time): staged progress copy that reflects what's truly happening ("Reading your premise… Deciding the rules of this world… Writing the skill catalog… Placing your starting gear… Sealing the rulebook"), ending in a satisfying "The rules are set." transition into Play. This wait is unavoidable — design makes it feel like world-forging, not loading.
- **Empty state (first ever visit):** the premise input front and center with three example premises as tappable chips.

### 5.3 Play screen (the core; design this first and best)
A focused reading column with summonable side surfaces.

- **Story stream (center, ~66% width):** alternating player entries (visually quieter, right-aligned indent or subtle marker) and narrator prose (the star). Narrator text streams in. **Ruling artifacts** (§3 signature) appear inline between paragraphs when mechanics resolve — including NPC rolls, labeled by actor ("Bandit attacks you — d20…"). Multiple rulings in one turn stack as a compact ledger group.
- **Input bar (bottom):** a single free-text field ("What do you do?") with send; a subtle hint row may surface when the classifier found the last input ambiguous ("That wasn't resolved mechanically — be more specific to attempt an action"). No command syntax, no buttons for actions — free text is the interface; the system figures it out.
- **Party strip (top of stream or upper-right):** small avatars of present characters with name + HP bar (only player-visible resources) + a mood glyph from soft state. Dead characters show a distinct, respectful dead treatment. Clicking any avatar opens the Living Card.
- **Living Card (right drawer, ~360–420px, summoned):** the evolving character sheet. Two visually distinct zones on one card, honoring the two registers: **the person** (portrait area, identity, current appearance/outlook, mood · location · goal line, traits as quiet chips, relationships as compact directional rows with trust/feeling) rendered in the story register; **the sheet** (resources with bars, learned skills with mastery rank pips Novice→Master and a progress hint to next rank, inventory list with qty) rendered in the system register. Fields changed recently carry a soft "recently changed" shimmer/marker with a tooltip of what changed. The card is read-only.
- **Turn states:** thinking/streaming indicator in the story voice ("The story continues…" with a subtle quill/ink motion, not a spinner); classifier-skip notice (quiet inline line: "Mechanics skipped this turn — classifier error"); model failure state (inline card: which role failed, plain cause, "Try a recommended model" action linking to settings).
- **Ergonomics:** keyboard-first (Enter to send, Esc closes drawers), reading position preserved, new-content anchor button when scrolled up.

### 5.4 Story Overview (chapters & arcs)
The story as a book about itself.

- **Header:** story title, top-line counts (Arcs · Chapters · Messages), and a "Summarize now" action with its precondition state ("Need N more messages to summarize") when not yet available.
- **Chapters view:** a vertical list of chapter cards — number, generated title, message range, expandable summary. Typographically bookish; this should feel like a table of contents of the user's own novel.
- **Arc view:** the crown jewel of this screen — a long-form structured document per arc with sections: Plot Summary, Character Development (per character: appearance/outlook, status, changes, key events, growth), Relationship Dynamics, Secrets & Revelations, Memorable Dialogue (quoted lines styled distinctly in the story accent), Promises & Oaths, Antagonists & Threats, World-Building & Lore, Unresolved Plot Threads, Stakes & Tensions, Key Items & Artifacts, Skills & Powers, Limitations & Weaknesses, Timeline. Design this as a beautiful reading document (clear section hierarchy, the display face for section heads, generous rhythm) — users will screenshot it.
- **Regenerate/delete controls** per chapter/arc, quiet and confirmed.

### 5.5 Character Card Creator & Editor
- **Creator:** a two-pane form — left: fields (name, description/backstory, personality/traits, appearance, speech style, opening scene, alternate greetings); right: a live preview rendered as the Living Card's "person" zone, updating as they type. Portrait upload with a tasteful default frame when absent.
- **Editor:** the same surface opened on an imported/existing card; imported cards show a small provenance line ("Imported · Card format V2").
- Explicit note in the UI where relevant: mechanical stats are not authored here — "Rules, skills, and stats are generated when a story begins."

### 5.6 Persona manager
Simple CRUD: persona cards (name, short description, portrait), one marked Default. Creating/editing uses a compact modal or side panel — this screen should feel light.

### 5.7 Lorebook manager
A utilitarian, power-leaning surface (system register may dominate here): per-story list of entries as rows — keywords (chips), content preview, enabled toggle; row expands to edit. Add-entry inline. Clear empty state explaining what a lorebook does in one sentence.

### 5.8 Settings (Advanced)
Tabbed or sectioned; unapologetically dense — this is the power user's home.

- **Providers & Keys:** list of configured providers with status dots; add-provider flow mirroring the wizard's advanced branch.
- **Model Roles:** the five-role matrix (role → provider → model → sampler controls: temperature, top-p, max tokens, etc.), each model choice carrying a "Recommended" / "Advanced — results may vary" badge. This matrix is a signature power feature; design it as a clean, scannable grid, not five collapsed accordions.
- **Story defaults:** summarizer thresholds (messages/chapter, chapters/arc), context budget.
- **Per-story (reached via Story Settings tab):** read-only schema viewer — the frozen rulebook (resources, skill list with tiers, action catalog with DCs, items) presented in the system register with a "developer view" honesty; limited editing where permitted; regenerate button in its locked state after play begins, with a plain explanation of why.
- **License:** trial countdown or license status, key entry, purchase link-out. Quiet, factual, never nagging.

## 6. Shared component library (design as a system)

Tokens first (color, type scale, spacing, radius, elevation, motion durations), then components:

1. **RulingArtifact** — the signature. Variants: standard success/failure, crit success, crit failure, gate-denied (attempt refused: shows the reason — "Requires Lockpicking — not learned" — in the system register, styled as a firm but fair verdict, visually distinct from a failed roll), opposed contest (two rolls side by side), stacked group.
2. **LivingCard** — with person-zone / sheet-zone; compact (drawer) and full (creator preview) sizes; "recently changed" marker treatment.
3. **ResourceBar** — labeled, current/max, tabular numerals, damage/heal delta flash.
4. **MasteryPips** — 4-rank indicator with next-rank progress hint.
5. **StoryCard** (library), **ChapterCard**, **ArcDocument** section styles.
6. **ProviderCard / KeyField** — with validating, valid, and rejected states.
7. **RoleMatrixRow** — role, model select, badge, sampler expander.
8. **PremiseInput** — the library's primary CTA treatment.
9. **ForgingInterstitial** — staged progress with narrative copy.
10. **Chips** (traits, keywords), **RelationshipRow** (directional, trust value, feeling text), **DeadMarker**, **ModelStatusChip**, **Toast/InlineNotice** (errors are specific, active-voice, and name the fix), **EmptyState** pattern (every empty screen is an invitation to a specific action), **ConfirmDialog**.

## 7. Motion & interaction rules

- One orchestrated moment: the Ruling reveal (die settle → count-up → verdict stamp; ~600–900ms; crits slightly longer with a single stronger flourish). Everything else: fast, functional transitions (120–200ms fades/slides) for drawers, cards, and state changes.
- Streaming prose appears word/segment-wise without layout jank; rulings insert without shifting the reading position.
- "Recently changed" markers pulse once on first view, then rest as a static dot until viewed.
- Respect reduced-motion: ruling reveal becomes an instant styled state; no essential information may live only in animation.
- Keyboard focus is always visible; the whole Play flow is operable without a mouse.

## 8. Voice & microcopy

- Register: a knowledgeable game master — warm, plain, confident. Sentence case everywhere. Active verbs on controls ("Start story," "Roll it back," "Import card"), and an action keeps its name through the whole flow.
- The system register speaks in verdicts, terse and factual: "SUCCESS · 17 vs DC 15", "Denied — requires Lockpicking."
- Errors: what happened + how to fix, never apologetic, never vague. Model failures always name the *role* and point to the model picker.
- Empty states invite one specific action. Trial/license copy is factual and calm, never dark-patterned.

## 9. States checklist (every screen must define these)

Loading (first-load and in-context), empty, error (per failure type: provider auth, model output failure, network), long-content overflow, narrow-window (~900px) layout, reduced motion, and — for Play — the mid-generation, classifier-skipped, character-death, and trial-expired variants.

## 10. Deliverables expected from this brief

1. Token system (palette with named hex values, type scale and faces, spacing, radius, elevation, motion durations).
2. High-fidelity designs of all eight surfaces (§5), Play screen first and deepest (including the Living Card drawer and at least four RulingArtifact variants).
3. The shared component library (§6) with states.
4. The two flagship flows end-to-end: first-run wizard → first generation, and premise → forging → first turn → first ruling → opening the Living Card.
5. Interaction specs for the Ruling reveal and the "recently changed" system.
