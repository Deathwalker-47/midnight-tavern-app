# Midnight Tavern — Design Reference (internal)

Desktop app, dark-first. "Lamplight over a game table." Two registers: STORY (warm, serif, brass) vs SYSTEM (cool, mono, steel-teal). Min 1100×700, target 1280–1600, degrade to ~900 (panels→overlays).

## Tokens
Ground bg0 #14100C · panel bg1 #1B1611 · card bg2 #231C15 · raised bg3 #2C241B
Hairline #382E21 · hairline-soft rgba(216,170,90,.12)
Prose #EADCBE · ui-text #D6C9AB · secondary #A08D6C · muted #6E5F49
STORY accent brass #D9A648 (bright #F2C56B) — narrative highlights, names, quotes, primary CTAs
SYSTEM accent teal #74B8AE (dim #4E827B, tint rgba(116,184,174,.08)) — dice, DCs, verdicts, ledgers ONLY. Never swap.
Success #8FB573 · Failure #C96F57 (muted) · Crit-gold #F5CE6E · Crit-crimson #B5442F · Dead #8A8175
Radius: 10 cards, 6 chips/inputs, 3 stamps. Elevation: soft shadow rgba(0,0,0,.4) + 1px warm hairline. Paper grain: repeating-linear-gradient very low alpha on cards.
Focus ring: 2px solid #74B8AE offset 2. Selection bg rgba(217,166,72,.25).

## Type
Display: "Cormorant Garamond" 600 (titles, chapter/arc heads, wordmark)
Body prose: "Source Serif 4" 400/600, 17px/1.75, measure 66ch
UI sans: "IBM Plex Sans" 400/500/600 (labels, buttons, forms)
System mono: "IBM Plex Mono" 400/500/600, tabular-nums (rolls, DCs, stats, IDs, settings values)
Google Fonts: Cormorant+Garamond:wght@500;600;700 | Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400 | IBM+Plex+Mono:wght@400;500;600 | IBM+Plex+Sans:wght@400;500;600

## Motion
Ruling reveal ~900ms: die settles (rotate -100°→0, 350ms) → math fades in → total counts up (CSS @property --rt integer + counter) → verdict stamps (scale 1.5→1 overshoot, ~.85s delay). Crits +300ms, one ring-burst flourish. Everything else 120–200ms fades/slides. Recently-changed: pulse once then static gold dot. prefers-reduced-motion → all durations .001s.

## Shell
Left rail 72px: wordmark glyph, Library, Story (contextual), Personas, Lorebooks, Settings; bottom = ModelStatusChip (green/amber/red dot + model) + trial chip. Story tabs: Play · Overview · Characters · Story Settings.
Files/links: Play.dc.html, Library.dc.html, Wizard.dc.html, Overview.dc.html, Characters.dc.html, StorySettings.dc.html, CardCreator.dc.html, Personas.dc.html, Lorebook.dc.html, Settings.dc.html, DesignSystem.dc.html

## Content bible — story "Embers of the Silent Vale" (fantasy)
Premise: An ash-fall has buried the Vale Road; pilgrims vanish near the ruined monastery of Cindermoor. The Hollow Flame cult wakes something under the ossuary.
Player persona: **Kestrel Vane** — sellsword courier. HP 19/24, Stamina 10/14. Skills: Blade Adept (adept, 4/5 to expert), Persuasion (adept), Arcane Sight (novice). NO Lockpicking (drives denied demo). Inventory: Vale saber, oil-treated cloak, waybread ×2, silver marks ×31, sealed letter.
**Wren Callow** — scout/thief. HP 14/16, Stam 9/12. Lockpicking (adept, 3/5→expert), Stealth (expert), Shortblade (novice, recently changed). Traits: Sharp-eyed, Debt-haunted, Loyal in the clinch, Sweet tooth. Mood restless · Ossuary stair · goal: "get paid, get out". Rel → Kestrel trust +0.6 "trusts her lead"; → Aldric +0.2 "wary respect" (recent).
**Brother Aldric** — warrior-priest of the Ember Choir. HP 30/30. Warhammer (expert), Liturgy (adept), Shieldcraft (adept). Mood steady · goal "consecrate the ossuary". Dead-state demo char.
Antagonists: grave-wights, Prior Voss (Hollow Flame). Items: reliquary gate, censer of cold fire, wight-ash.
Chapters: 1 "Smoke on the Vale Road" (msgs 1–20) · 2 "The Toll of Bells" (21–40) · 3 "Under the Ossuary" (41–58, current). Arc 1: "The Hollow Flame" (ch 1–2 complete, doc exists). Counts: 1 arc · 3 chapters · 58 messages.
Rulings pool: Persuade warden d20 14+3=17 vs DC15 SUCCESS · Stealth d20 6+1=7 vs DC13 FAILURE · nat20 Blade crit · nat1 crit fail · DENIED "Requires Lockpicking — not learned" · opposed Stealth 16 vs Perception 12 · NPC "Wight claws at Kestrel — d20 13+2=15 vs DC14 SUCCESS → Kestrel −5 HP".
Mastery: novice +1 → adept +3 → expert +5 → master +7; rank up per N successes (successCount visible).

## Play turn script (interactive queue)
1. lockpick reliquary → DENIED artifact + prose
2. ask Wren → NPC ruling success (Wren 3/5→4/5 shimmer)
3. wight fight → stacked group: wight hits Kestrel −5 (strip flash) + Kestrel blade success
4. finishing blow → nat 20 crit + mastery advance line (Blade 5/5 → Expert)
5+. narration-only; short input (<12 chars) → ambiguity hint row
Turn flow: thinking "The story continues…" (quill ink dots) → prose streams word-wise → ruling mounts animated mid-stream → prose continues. Esc closes drawer, Enter sends, anchor btn when scrolled up.

## Model roles & providers (Settings/Wizard)
Roles: Narrator (prose) · Classifier (cheap/fast) · Analyzer (cheap/fast) · Summarizer (mid) · Story Generator (mid/strong). Recommended default per role + "Recommended" / "Advanced — results may vary" badges. Sampler: temperature, top-p, max tokens.
Providers: OpenRouter (recommended aggregator), OpenAI, Anthropic, Google, Mistral, DeepSeek, xAI, Groq, Custom endpoint. Key states: validating (spinner) → valid (green check + balance $4.82) → rejected ("This key was rejected by the provider").
Wizard: 1 Welcome ("Stories with rules that hold" + animated ruling vignette, CTA "Set up your storyteller") · 2 Connect (guided OpenRouter card, deep-link "Create a key", paste+validate, inline test generation streams 2 sentences; "Advanced: choose a different provider") · 3 Models (5 roles pre-filled, toggle reveals dropdowns, CTA "Enter the library").
Forging stages: "Reading your premise… / Deciding the rules of this world… / Writing the skill catalog… / Placing your starting gear… / Sealing the rulebook" → "The rules are set."
Trial: 14-day, quiet chip "Trial · 9 days left"; expiry gates story creation only.

## Arc document sections (Overview)
Plot Summary · Character Development (per char: appearance/outlook, status, changes, key events, growth) · Relationship Dynamics · Secrets & Revelations · Memorable Dialogue (brass quotes) · Promises & Oaths · Antagonists & Threats · World-Building & Lore · Unresolved Plot Threads · Stakes & Tensions · Key Items & Artifacts · Skills & Powers · Limitations & Weaknesses · Timeline. Regenerate/delete quiet+confirmed. "Summarize now" precondition: "Need 2 more messages to summarize".

## StorySettings (frozen schema dev view)
System register dominates. Stat mode full · resources (HP lethal, Stamina) · skill list w/ tiers+prereqs+unlock paths · action catalog (20+ actions, DC 5–25, category, requiresSkill, costs, effects) · items w/ tiers · starting state. Regenerate LOCKED after play: "58 messages exist. Regenerating would orphan learned skills and inventory." Limited edit: DC values, labels.

## Per-screen states checklist
Every screen: loading, empty, error (provider-auth / model-output / network), overflow, narrow ~900, reduced-motion. Play adds: mid-generation, classifier-skipped ("Mechanics skipped this turn — classifier error"), model-failure card (names role, "Try a recommended model" → Settings), character-death, trial-expired. Use `demo` enum prop per screen + narrowWindow boolean.

## Component library (DesignSystem.dc.html)
RulingArtifact (success/failure/crit×2/denied/opposed/stacked) · LivingCard compact+full · ResourceBar (delta flash) · MasteryPips (4 ranks + progress hint) · StoryCard/ChapterCard/ArcDoc styles · ProviderCard/KeyField states · RoleMatrixRow · PremiseInput · ForgingInterstitial · Chips · RelationshipRow · DeadMarker · ModelStatusChip · Toast/InlineNotice · EmptyState · ConfirmDialog. Tokens table first.
Voice: game-master warm+plain, sentence case, active verbs. System register: terse verdicts "SUCCESS · 17 vs DC 15".
