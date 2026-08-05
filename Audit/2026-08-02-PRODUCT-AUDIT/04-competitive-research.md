# 04 — Competitive Research

**Method note.** This file synthesises a dedicated research pass. Every claim is tagged:
**[V]** = Verified (the page was fetched and read), **[I]** = Inferred (reasoned from
evidence, clearly not fact), **[NE]** = No evidence found. Vendor-authored and
competitor-authored pages are flagged inline, because this category's search results are
dominated by marketing listicles — several of the top-ranking "best AI roleplay app"
comparisons are written by the apps themselves.

Full source lists are at the end of each section.

---

## What this means (read this first)

> **Revision 2026-08-02 (turn 2) — item 1 below was WRONG, and it was the largest factual
> error in this audit.** Isekai Zero **does** have a documented DM model: **Dungeon Mind**, with
> its own player guide and creator guide. My search covered marketing, store listings and
> reviews but never reached `docs.isekaizero.ai`, so I reported absence from the wrong corpus and
> stated it too confidently. §2.2 is corrected below, §2.4's open question is **answered**, and
> the Banner Saga material in §3 is reframed — see the note at §3. Sources:
> [player guide](https://docs.isekaizero.ai/books/your-guide-to-isekai-zero/page/dungeon-mind-dm),
> [creator guide](https://docs.isekaizero.ai/books/creators-guides/page/dungeon-mind-dm).

Four things came out of this research. **The first one is struck through — it was wrong.**

1. ~~**Isekai Zero does not publicly have a "DM model."** I looked specifically for it — no
   dice, no stats, no rules, no arbitration, anywhere in its marketing, store listings, or
   reviews. What it actually sells is *memory and presentation*.~~ **CORRECTED: Isekai Zero has
   a fully documented rules referee — *Dungeon Mind*.** It has server-side `roll_d20` with
   advantage/disadvantage, exclusive write access to stats, creator-authored stat schemas,
   skills, inventory, levelling, healing and permadeath, and two control levers
   (`reject_action`, `ask_player`). So Midnight Tavern is **not** doing something the
   inspiration does not claim to do — it is building the same category of thing, and on the
   mechanical half it is at or ahead of the reference. See §2.2.
2. **The memory problem is real, category-wide, and unsolved by everyone.** Not a
   SillyTavern quirk. Character.AI's top complaint is memory. AI Dungeon's NPCs "switched
   gender mid-scene." An Isekai Zero reviewer calls it "the memory span of a goldfish."
   Your premise (a) is correct and well evidenced.
3. **You are not contrarian — you are early-consensus.** The best-funded serious player in
   this category, Hidden Door ($9M, 29 staff, founded by Hilary Mason), independently
   concluded that the LLM must not be in charge and built "a proprietary story engine, not
   an LLM wrapper." Different method, same conclusion. That is validating, and it also
   means the idea is not a moat by itself.
4. **Banner Saga's combat maths is stealable almost verbatim; its art is not a style, it
   is a labour budget.** The maths is subtraction. The art was a dedicated lead artist plus
   an outsourced animation studio funded by $723,886 of Kickstarter money.

And one warning that should shape the roadmap: **this category has a retention problem
nobody has solved.** *Whispers from the Star* went from 964 concurrent players to 21 in two
months. *Status* hit 500K DAU in a month and did not retain. People finish the novelty and
leave. Mechanical depth is the only known answer — which is an argument *for* your engine,
as a business case and not just a craft preference.

**Two more findings from the adjacent games in §5, which may be the most useful part of this
file:**

- **Wildermyth is your architecture with authored text instead of an LLM** — numeric
  personality traits crossing thresholds select variant narrative. Metacritic 86, praised for
  exactly that. Its stated ceiling is *"a finite number of vignettes"*, which is precisely the
  limit an LLM removes. It gives you the best one-sentence explanation of your own product
  (§5.1).
- **Disco Elysium answers the question you are about to face:** a deterministic engine emits
  integers, and integers are boring to read. Its solution — a passed check produces **a
  voice**, not a bonus — maps perfectly onto engine-decides / LLM-performs, and would turn
  your engine's output into the best-written part of the game (§5.2).

---

## 1. SillyTavern — the incumbent you are displacing

### 1.1 What it actually is

**[V]** SillyTavern is a locally-installed **front end** — a browser UI plus a Node server
that you run yourself, pointed at whatever backend you like (KoboldCpp, Ollama,
text-generation-webui, or paid APIs). It is open source with a large extension ecosystem.
Source: https://docs.sillytavern.app/ , https://github.com/SillyTavern/SillyTavern

**The structural fact that matters:** SillyTavern owns no game state and no rules. It
composes a prompt out of text blocks and sends it to a model. Everything that looks like
memory or mechanics is text assembled into a prompt.

### 1.2 World Info / lorebooks — and ten documented failure modes

World Info is SillyTavern's memory mechanism: a keyword-triggered dictionary that inserts
text into the prompt when trigger words appear. The official docs describe it as a tool to
"insert prompts dynamically... to help guide the AI replies."

**The docs' own opening warning is the whole story:** World Info *"does not guarantee its
appearance in the generated output messages."*

The following ten failure modes are **from the vendor's own documentation**, not user
complaints — which makes them the strongest evidence in this report:

| # | Documented failure | Why it breaks memory |
| --- | --- | --- |
| 1 | *"If the budget is exhausted, then no more entries are activated even if the keys are present"* | **Memory silently stops working** as the story grows — exactly when it is needed most |
| 2 | *"Activation keywords, titles... not in the Content field is not inserted into context"* | The model never learns *why* a fact was retrieved |
| 3 | Whole-word matching misses inflections; docs advise disabling for Japanese/Chinese | "king" matches but "liking" does not — silent misses |
| 4 | Plaintext keys cannot contain commas | Silent authoring trap |
| 5 | With Vector Storage, *"it's impossible to predict exactly what entries will be inserted"* | Non-determinism, admitted |
| 6 | A disabled Author's Note *silently drops* WI entries positioned in it | Invisible total memory loss |
| 7 | Min Activations does not check recursion from previous steps | Under-retrieval |
| 8 | Inclusion Groups insert *"only one"* entry, chosen randomly by weight | **Relevant lore is discarded by a dice roll the player never sees** |
| 9 | Editing an entry mid-timed-effect forcibly removes the effect | State corruption on edit |
| 10 | Only the primary World Info file exports with a character | Multi-lorebook setups do not travel |

Source (all ten): https://docs.sillytavern.app/usage/core-concepts/worldinfo/

**[I] The analysis that matters:** World Info is a *keyword-triggered text retrieval system
competing for a token budget.* It is not state. It has no notion of truth, of a fact being
superseded, or of a fact being *required*. Every failure above is a mode where a fact that
exists in the player's world silently fails to reach the model.

**Midnight Tavern's structural answer:** hard state lives in a database and is injected
because the rules require it, not because a keyword happened to appear. That is a genuine
architectural difference, not a feature difference. **This is your strongest single
talking point** — see file 09.

### 1.3 The extension ecosystem is your market research, already done

**[V]** SillyTavern ships built-in **Summarize** (rolling summary), **Vector Storage**
(embedding retrieval), and a **Data Bank**. Beyond that, an entire cottage industry of
third-party state trackers exists:

- SillyTavern-MultihogDnDFramework — https://github.com/MultihogAurelius/SillyTavern-MultihogDnDFramework
- rpg-companion-sillytavern — https://github.com/SpicyMarinara/rpg-companion-sillytavern
- SillyTavern-Tracker — https://github.com/kaldigo/SillyTavern-Tracker
- SillyTavern-State — https://github.com/ThiagoRibas-dev/SillyTavern-State
- lorevault-extension — https://github.com/HelpfulToolsCompany/lorevault-extension
- Talemate (alternative frontend, state as first-class) — https://github.com/vegu-ai/talemate

### 1.4 The single best piece of evidence in this entire audit

**[V]** The Multihog framework's README states, verbatim, the four problems it exists to
solve:

> *"the AI forgetting your inventory/spells, the AI forgetting long-term context, you
> always winning (aka. plot armor), and the world being static."*
> — https://github.com/MultihogAurelius/SillyTavern-MultihogDnDFramework

**That is Midnight Tavern's thesis, written by a SillyTavern user, in a SillyTavern
extension README.** Independent confirmation that both of your goals — (a) memory drift and
(b) GM authority, stated there as "plot armor" — are real and felt by paying users.

**[V] What Multihog does, and where it stops:**
- An **RPG State Tracker** runs a *second-pass model* that reads the assistant's output and
  extracts HP, inventory, party, buffs, XP, spells, then re-injects a rolling "State Memo."
- **RNG Queue** — pre-seeded deterministic dice injected into every turn.
- **Tool Call RNG** — the model calls a `RollTheDice` tool. Its stated anti-sycophancy
  mechanism is *ordering*: the AI "must declare a DC before seeing the result."
- Self-described as **"an anti-sycophancy system"** with "NO enemy scaling."

**[I] The critical limitation, and it is your entire opening:** state is **extracted by an
LLM from prose after the fact**, and adjudication still sits with the LLM. The dice are
externalized; the *judgment* is not. A second model reading prose to guess your HP is
fundamentally lossy — if the narrator writes something inconsistent, the tracker faithfully
records the inconsistency. There is no schema that can reject an illegal state and no
engine that can refuse an illegal action.

**[NE]** No evidence found of *any* SillyTavern extension where a deterministic rules
engine **decides** the outcome and the LLM only narrates a decision it cannot alter. Every
tracker found reads state out of prose, or asks the model to maintain it.

**[I] What the ecosystem's existence proves:** (1) demand is real, and users will install
fragile third-party code to get it; (2) the problem is unsolved *at the architecture
level*; (3) the market has already learned that structured trackers beat prose memory — so
you do not have to prove that lesson, only to execute it properly.

### 1.5 Character cards — the content ecosystem you must not lose

**[V]** Cards are the community's distribution unit: a PNG with JSON embedded in a text
chunk. **V2** (`chara_card_v2`) nests fields inside a `data` object specifically so V1-only
editors cannot silently destroy V2 fields. **V3** (`ccv3` chunk, base64 UTF-8 JSON) adds
the CHARX/XCHAR zip format for assets.
Sources: https://github.com/malfoyslastname/character-card-spec-v2 ,
https://github.com/kwaroran/character-card-spec-v3

**[I] The structural gap, strongly supported:** every field in V2 and V3 is prose or
configuration. **[NE]** for any numeric-stat field in either spec — no hit points, no
inventory with quantities, no skill with a rating, no relationship value, no "this
character is dead." **A card describes a character; it cannot hold a character's state.**
Cards are a content interchange format, not a save format.

**Strategic implication:** cards are the reason SillyTavern has a content ecosystem at all.
An engine that cannot import a V2/V3 card starts with zero content. Midnight Tavern already
imports both (`packages/core/src/importer/pngCard.ts`, `jsonCard.ts`, `mapToSchema.ts`) —
this is correctly prioritised and is your cheapest adoption lever.

---

## 2. Isekai Zero — the stated inspiration, and a finding you need to see

### 2.1 What it is

**[V]** A **mobile-first** AI roleplay / interactive story app, free with in-app purchases,
published by **ARX MEDIA SDN BHD** (Malaysia). iOS, Android, and web. **There is no desktop
app.** Category: Roleplaying, 16+. Launched around August 2025, actively updated through
July 2026.
Sources: https://www.isekaizero.ai/ , https://apps.apple.com/us/app/isekai-zero/id6748359707 ,
https://play.google.com/store/apps/details?id=com.isekai.world

**[V]** Positioning copy: *"chat with anime AI characters who remember you"*, *"The world
remembers what you did in chapter one"*, *"an AI story game, not just an AI chatbot"*.
Features: an AI story generator producing scene-by-scene adventures; **Visual Novel Mode**
with scene art, voice narration and animated expressions; a mood-following soundtrack;
characters with independent goals; stories that reach endings; creator tools with a stated
**25% profit share**. Interaction is a **"TAKE A TURN"** mechanic.

### 2.2 ✅ CORRECTED — Isekai Zero's arbitration model is *Dungeon Mind*, and it is documented

> **This section's original finding is withdrawn.** What follows the strikethrough is the
> corrected account, sourced from Isekai Zero's own documentation (fetched 2026-08-02).

**What Dungeon Mind actually is.** Isekai Zero runs **two** models with separated duties. From
the player guide, verbatim: the DM is *"the referee sitting next to the storyteller"*, and
**"The story AI writes what happens. The DM decides whether your action actually worked."** The
story AI narrates and deliberately omits numbers (*"The story text itself won't mention
numbers"*); Dungeon Mind adjudicates only.

| Dungeon Mind owns | Detail |
| --- | --- |
| **Dice** | `roll_d20`; advantage/disadvantage = two dice keep higher/lower; nat 20 / nat 1 with gold/red glows; rolls are **"server-side and can't be manipulated"** |
| **Stats — exclusively** | **"The DM is the only thing that changes stats."** **"Players CANNOT edit their own stats."** Attempts are refused |
| **Character sheet** | HP bar, `Alive` dot, `Condition` with turn counters; optional MP/Stamina/Energy/Action Points. Creator-authored schema (5–15 stats ideal); the DM's tools are *generated from that schema* |
| **Skills / inventory** | `set_skills`, `set_inventory` (quantity, equipped). On use, *"The DM will verify you have it and apply the effect"* |
| **Levelling** | XP thresholds; DM prompts for stat increases, may grant a skill, often raises base HP |
| **Healing / death** | Short rest (~25% HP), full rest, potions, class-locked heals; 0 HP = death, permanence creator-defined (*"Death is PERMANENT. No resurrection."*) |
| **Two control levers** | **`reject_action`** — blocks *before any roll*, with a stated reason (acting while dead, resurrection, healing outside your class, editing own stats, world rules). **`ask_player`** — pauses the story pending player input, resumes next message |

**Authoring surface worth copying:** a **Game Rules** prompt (≤10,000 tokens, *"the heart of your
DM configuration"*), plus a **Game Rule Reminder** (≤500 tokens) that is *"appended at the very
end of the DM's prompt — the last thing it reads before making decisions,"* because *"LLMs pay
the most attention to what comes last."* That is a cheap, concrete prompt-engineering trick this
project can adopt directly. DM Mode is either Required (always on) or Optional (toggleable).

**Its authority philosophy cuts against over-tightening.** The creator guide is emphatic:
*"resolve actions with consequences, don't prevent player choices"*, *"Don't restrict player
choices"*, instruct the DM to *"NEVER reject combat actions — resolve with dice and apply
consequences"*, and let players *"make bad decisions and face the results."* Rejection is scoped
narrowly to rule violations. **Read that as a caution: the temptation for this product is to
make its gate more restrictive, and the reference product deliberately does the opposite.**

**And decisively for the combat question: Isekai Zero's combat is narrative, not tactical.** No
grid, no map, no positioning, no initiative order, no action economy anywhere in the system. The
single randomiser is `roll_d20`, at *"one roll per character per action."* Turn structure exists
only where a creator encodes it themselves (e.g. `Poisoned (3t)` decrementing per turn). One
baked-in behaviour: **"NPCs always fight back — they don't just stand there."** This is why the
recommendation in [10](10-other-feedback.md) §9 is *not* to build a Banner Saga battle system.

**Where this leaves Midnight Tavern:** the mechanical half is genuinely competitive — this app's
deterministic gate and ledger are as strong as Dungeon Mind's and in some ways stronger (a pure
gate function, an append-only ledger, a narrator structurally prevented from overturning a
ruling). **The gap is the other model: Isekai Zero's story AI.** See [06](06-gap-analysis-dm-authority.md) D-5.

---

~~**[NE] No evidence found**, across the official site, the full Apple App Store listing and
its reviews, the Google Play listing, and third-party coverage, of any of:~~
*(original finding retained below for traceability — every line of it is superseded by the
table above)*

- a Dungeon Master / Game Master / referee role or mode
- dice rolls or any randomisation surfaced to the player
- character stats, attributes, or stat blocks
- skills with numeric ratings
- levels, XP, or progression
- hit points, damage, or death rules
- inventory with quantities
- any rules engine, difficulty check, or mechanical gate on player action

The phrase "dungeon master" appears on Isekai Zero's Apple page only in the *related apps*
rail — a different product ("AI Story Maker - Dungeon Master").

**What Isekai Zero actually sells is narrative continuity and presentation, not
arbitration.** It is a better-produced story chat, not a rules referee.

### 2.3 Its memory claim versus its reviews

**Marketing [V]:** *"characters who remember you," "The world remembers what you did in
chapter one."*

**User reality [V], verbatim from App Store reviews:**
- **"the memory span of a goldfish"** — the reviewer describes a story element being
  established, then roughly *ten messages later* the AI treating it as "a completely new and
  out of the blue thing."
- **"Metagaming and Continuity breakage. Alongside mismatching characters and forgetting
  details."** — reported happening **even on premium models**, with the user having to
  re-remind the AI every few messages.
- Free model context is *"10k tokens (that's like nothing if you want a big storyline)."*
- In fairness, counter-evidence: *"can remember character pretty well."*

Source: https://apps.apple.com/us/app/isekai-zero/id6748359707?see-all=reviews&platform=iphone

**[V] Caveat:** Apple shows a curated handful of reviews; this is not a representative
sample. Roughly half of the six sampled cite memory or continuity, and two of those
otherwise rate the app well.

**[I]** Memory drift is a live, unsolved complaint in the best-reviewed commercial product
in this category, and it persists on premium models — so in users' lived experience it is
not a "wait for bigger context windows" problem. **Note the users themselves believe it
is** (one explicitly hopes AI improvement will fix it). Your thesis — that it is an
architecture problem, not a model-capability problem — is contrarian *to your customers*
and must be argued, not assumed.

**[NE] An honest gap in the evidence:** no Isekai Zero review raises sycophancy or the AI
capitulating to player claims. The "no GM authority" half of your thesis is well evidenced
in the *SillyTavern* community (Multihog's "you always winning") but **not** in Isekai
Zero's reviews. Mobile story-app users may simply not want to be told no.

### 2.4 ✅ ANSWERED — it was reading (2), and the feature is documented

> **Answered 2026-08-02 (turn 2).** The owner confirmed the DM is **Dungeon Mind**, with links to
> both official guides. Of the three possibilities I listed, the truth was **(2): an in-app DM
> feature not documented in the marketing I could reach** — it is documented, just on
> `docs.isekaizero.ai` rather than in store listings. I have left the three readings below
> because the *consequences* I attached to reading (1) turned out to be right anyway, and they
> are the actionable part.
>
> **What survives, and it is the important part:** reading (1)'s consequence still holds.
> Dungeon Mind is only *half* of Isekai Zero — the referee. The other half is the **story AI**
> that owns narration, and *that* is where chaptering, pacing and endings live. Midnight Tavern
> has arcs and chapters but **no notion of a story *ending***, and no component that owns
> narrative pacing. So the thing to copy from Isekai Zero is no longer ambiguous: **copy the
> two-model split.** You have built their DM. You have not built their storyteller.
> See [06](06-gap-analysis-dm-authority.md) D-5 and [10](10-other-feedback.md) §1.
>
> **You should stop benchmarking your referee against Isekai Zero and start benchmarking your
> narrator against it.** On the referee, you are level or ahead.

~~The brief states "the DM model is the inspiration." The public record does not support that
Isekai Zero has one. One of three things is true, and I cannot distinguish between them:~~

1. You are inspired by Isekai Zero's **narrative authority and pacing feel** — the sense of
   a story being *run* for you, with chapters, consequence, and an ending — and are calling
   that "the DM model," rather than mechanical adjudication.
2. There is an in-app DM/GM feature not documented in any public marketing I could reach.
3. The inspiration is **aspirational** — what you wish Isekai Zero did.

**Why it matters:** if (1), then the thing to copy from Isekai Zero is *chaptering, pacing
and endings* — and Midnight Tavern currently has arcs and chapters but no notion of a story
*ending*, which is a real gap. If (3), then you are building a category-defining feature and
should stop benchmarking against Isekai Zero entirely and start benchmarking against
tabletop.

### 2.5 The commercial lesson — the most instructive part

**[V]** Free download, monetised by **dual virtual currency**: **Mana** (free daily grant +
rewarded ads) and **Arcane** (paid). Apple IAP tiers: **$2.99, $7.99, $14.99, $49.99,
$79.99, $149.99**. User-reported consumption: roughly 3–5 messages per 1.0 currency;
rewarded ads ~0.2 each, capped around 10 ads per 6 hours.

**[V] The pricing backlash is the loudest theme in the reviews.** One 3-star review calls
the app **"money hungry,"** notes that **summarizing into chapters/arcs costs currency**,
and concludes it **"feels actively punishing to have a long storyline."**

**[I] That single sentence is the most valuable line in this research.** It is a structural
indictment of metered cloud pricing for long-form narrative: *the longer and better your
story gets, the more it costs to keep it coherent* — so the business model is in direct
opposition to the product's core promise. A local-first app with no per-message billing
does not merely cost less; **it removes an incentive conflict the incumbent cannot remove
without abandoning its revenue model.** Put this in your marketing.

### 2.6 Scale — contested, treat with caution

- **[V]** Apple App Store as fetched: **4.8 / 5 from 506 ratings**, version 1.1.8.
- **[C]** Aggregator and competitor pages claim 78,000 downloads, ~5,300 ratings, "#1 in
  Games," and "230 billion tokens via OpenRouter." **Do not use these as fact** — the
  ratings count contradicts the App Store page directly, and the rest comes from a
  competitor's comparison page.

---

## 3. Banner Saga — what is actually transferable (and what is not)

> **Revision 2026-08-02 (turn 2) — this section is KEPT, but its status has changed.** Turn 1 was
> asked to research Banner Saga as a stated product pillar, so the research below is responsive
> work, not contamination, and it is retained in full — several of its lessons are among the most
> useful in this audit. **But it is no longer a "north star."** Owner clarification 2: turn-based
> combat and Banner Saga-style animation were **never planned**, and the repo confirms it (zero
> `banner saga` / `turn.based` / `tactics` references anywhere outside `Audit/`).
>
> **Read this section as a menu, not a roadmap.** What is worth taking is the *narrative*
> engineering: consequence that sticks (§3.5), the caravan pattern that binds story to mechanics
> (§3.4), and the damage-maths insight that makes a single roll feel weighty (§3.2 — cheap, and
> recommended). What is **not** worth taking is the tactics layer, the turn order (§3.3 already
> said don't copy it) and the art pipeline (§3.6 — a labour budget, not a style setting).
> The direct recommendation is in [10](10-other-feedback.md) §9: **no battle system.** For visual
> identity, the owner's own roadmap item — user-selectable image generation
> ([11](11-implementation-plans.md) Plan 10B) — is far cheaper and already what they want.

### 3.1 Why it is the right reference

**[V]** *The Banner Saga* (2014) is a hand-drawn turn-based tactical RPG with a
caravan/consequence layer and branching story, by **Stoic** (three ex-BioWare Austin
developers). Alex Thomas's originating concept was an explicit blend of **The Oregon
Trail**, **King of Dragon Pass**, and **Shining Force**.
Source: https://en.wikipedia.org/wiki/The_Banner_Saga

**[I]** That blend is almost exactly Midnight Tavern's ambition: a resource/consequence
layer, a narrative event system over persistent world state, and tactical combat.
**King of Dragon Pass is the closest historical ancestor of what you are building** — a
narrative event engine sitting on a simulation that owns the numbers. That is your
architecture minus the LLM, and it is worth a dedicated study.

### 3.2 The combat maths — copy this almost verbatim

**[V] Five stats:** Strength, Armor, Willpower, Exertion, Break.
Source: https://bannersaga.fandom.com/wiki/Stats

**Strength is health AND damage.** It is depletable, non-replenishable in battle, and
serves as both hit points and attack power — as a unit is injured, its attacks weaken. At
zero, knocked out.

**The damage formula is subtraction:**
```
STR damage dealt = STR(attacker) − ARM(target)
```
10 STR vs 0 ARM deals 10. Take 2 damage, now you have 8 STR, so you deal 8.

**Armor is defence and a second health bar.** Depletable but replenishable. **Break (BRK)**
is damage dealt to armor — and Break potency **stays constant** through the battle, unlike
Strength attacks.

**The floor rule and to-hit curve** when Armor exceeds Strength:
```
Miss chance = (ARM(target) − STR(attacker)) × 10%
Hit chance  = min{100%, max{20%, 100% − Miss chance}}
```
Only 1 point of STR damage is inflicted in that case. Minimum 20% to-hit floor.

**Willpower** funds extra damage, extended movement, and Active abilities costing 1–3
(more spent = more potent, capped at the ability's Rank).

**The core turn decision:** before attacking, choose whether to hit **Strength or Armor**.

**[I] Why this is the model to steal, in four points:**

1. **It is arithmetic, not simulation.** Subtraction and a linear to-hit curve. A
   non-engineer can predict every outcome — and critically, **an LLM can be handed the
   result and told to describe it**, because the result is a small set of integers.
2. **Every number is legible in prose.** *"You are wounded, so you hit softer"* is a
   sentence. Contrast a d20 system with advantage, proficiency bonuses and conditions —
   far harder to narrate coherently. **Midnight Tavern currently uses d20 + modifier vs DC**
   (`engine/dice.ts`, `engine/difficulty.ts`), which is the harder thing to narrate.
3. **Randomness is almost absent — and that is a trust mechanism.** **[V]** A
   Stoic-affiliated forum reply states RNG "was almost entirely removed from the game on
   purpose." Source: https://stoicstudio.com/forum/archive/index.php/t-1213.html
   **[I]** Low randomness means outcomes are *explainable*, which means players trust the
   engine's authority rather than suspecting the LLM made something up. **For a product
   whose entire pitch is "the rules are real," determinism is marketing, not just
   engineering.**
4. **[V] Combat was prototyped with chess pieces before any code was written**, and an
   early Final Fantasy Tactics-like system was **scrapped** after playtesters found it
   clumsy. **[I] Lesson: prototype the combat maths on paper with the product owner before
   writing engine code.**

### 3.3 Turn order — the most-copied and most-criticised idea. Do not copy it.

**[V]** Banner Saga uses a **strictly side-alternating queue**, not a global initiative
track. Team A [A1,A2] vs Team B [B1,B2,B3] produces A1, B2, A2, B3, A1, B1…
The counterintuitive consequence: **killing enemies makes survivors act more often.**
**Pillage mode** was added in beta as a corrective.
Sources: https://bannersaga.fandom.com/wiki/Terminology ,
https://www.gamepressure.com/thebannersaga/moving-around-the-battlefield-and-order-of-turns/z15d08 ,
https://bannersaga.fandom.com/wiki/Pillage

**[V] The criticism is long-running.** Steam threads argue the system "encourages you to
maim and not kill"; some call Pillage "a bandaid" proving the devs knew it was exploitable.
**[V] Root cause, from the design-intent thread:** the system was tuned around **6-v-6 PvP**
in *Banner Saga: Factions*, where alternation enables comebacks. It transferred badly to
single-player.

**[I] Direct recommendation: copy the *feel* — few units, every turn matters, low RNG,
readable maths — but use a conventional per-unit initiative track.** Side-alternating
initiative was a PvP balance mechanism retrofitted into single-player and it produced the
game's most persistent complaint. A per-unit track is also far easier for an LLM to narrate.

### 3.4 The caravan layer — how narrative binds to mechanics

**[V]** Supplies decrement one per day; the UI shows **days remaining, not an exact supply
number**. When supplies run out, population starves — though Heroes cannot die of
starvation. **Morale** is 0–100: −10 per travel day, +10 per well-provisioned rest day.
And the load-bearing detail: **morale affects the Willpower points heroes receive at the
start of each battle.**
Sources: https://bannersaga.fandom.com/wiki/Caravan , https://bannersaga.fandom.com/wiki/Morale

**[I] This is the single cleanest example in games of "narrative layer binds to combat
layer."** A decision made in a conversation three days of travel ago — take the refugees,
don't rest — arrives at the start of a fight as fewer Willpower points. The player feels
the connection with no tutorial. **That is exactly the bridge Midnight Tavern needs between
its story layer and any future combat layer, and it is achieved with one integer.**

**[V] A design risk worth recording:** players dispute whether supplies matter enough at
all. **[I] A resource layer players decide is "useless" is worse than no resource layer.**

### 3.5 Consequence requires refusing the undo — an uncomfortable question for you

**[V]** Stoic deliberately rejected genre staples: **no looting, no item shops, and no
reloading a save after a defeat.** Permanent death is baked into the plot — Vognir dies
early, Iver loses an arm, and the finale forces the player to choose who fires the magic
arrow, killing Bellower **and themselves.**
Source: https://en.wikipedia.org/wiki/The_Banner_Saga

**[I] The load-bearing insight:** consequence feels real only because **the game refuses to
let you undo it.** No manual save is a *product* decision, not a technical one.

**For Midnight Tavern this is direct and uncomfortable: if the player can edit the save,
reroll the dice, swipe to a new narration, or re-prompt the LLM, the deterministic engine's
authority is cosmetic.** GM authority is only as strong as the weakest undo path. Midnight
Tavern currently has swipe/variant regeneration, delete, rewind, and turn checkpoints
(`orchestrator/checkpoint.ts`, `store/repositories/checkpoints.ts`) — all excellent
engineering, and all undo paths. **This deserves to be a first-class product decision.**
See file 10.

### 3.6 The art style — a labour budget, not a setting

**[V]** Stoic chose traditional animation. The look draws on **Eyvind Earle's** design work
for Disney's 1959 *Sleeping Beauty*, plus Ralph Bakshi and Don Bluth. Earle is credited for
"Artistic Inspiration." Stoic's Technical Director: their biggest influence "has always been
Eyvind Earle."
Sources: https://en.wikipedia.org/wiki/The_Banner_Saga ,
https://80.lv/articles/the-banner-saga-background-artist-interview ,
https://www.polygon-treehouse.com/blog/2018/3/7/inspiration-corner-eyvind-earle

**[V] The visual grammar:** bold graphical shapes; simple palettes nearly always including
black or near-black for high contrast; dramatic shadows; negative space. From a BAFTA
stream: the world *"always has long shadows, as if the sun were perpetually setting and the
world caught in a state of decline."*

**[V] Rotoscoping confirmed** — developers filmed themselves performing, then traced it.

**[V] The toolchain:** Photoshop for art; **Adobe Flash** for animation, converted to
**sprite sheets**; a custom engine on Adobe AIR; **Powerhouse Animation Studios** outsourced
for animation and cutscenes.

**[I] The realistic read: "Banner Saga-style art" is a frame-by-frame hand-drawn 2D pipeline
with rotoscoped reference, produced by a dedicated lead artist plus an outsourced animation
studio, funded by three quarters of a million dollars. It is not a style you configure; it
is a labour budget.** **[NE]** No tooling or generative shortcut found that reproduces it.

**[I] What IS transferable cheaply**, because the style is mostly composition and palette
rules rather than animation volume:
- Limited palette with a near-black anchor, high contrast. *This is a CSS decision.*
- Long shadows, consistent low sun angle. *A rule, not artwork.*
- Flat graphic shapes, heavy negative space, silhouette-first character design.
- Static illustrated portraits plus a two- or three-frame idle gets most of the perceived
  quality for a fraction of the cost. **Banner Saga's own conversation scenes are largely
  static compositions.**

### 3.7 Commercial facts

**[V]** Kickstarter launched 19 March 2012, funded in about a day; final **$723,886 from
20,042 backers** (goal $100,000). Banner Saga 3 raised **$416,986**. Metacritic: PC 80,
**iOS 92 (universal acclaim)**, PS4 79, Switch 80. 30+ award nominations. **[NE]** no sales
figures found. A free-to-play multiplayer spinoff, **Banner Saga: Factions (2013)**, served
as combat testbed, feedback channel, and interim revenue.

**[I] Three lessons:**
1. **iOS scored highest (92).** A turn-based, text-heavy, hand-drawn tactical game performed
   best on touch.
2. **"Under-explained mechanics" is a recurring criticism of exactly this archetype.** A
   deterministic engine the player cannot see is indistinguishable from an LLM making things
   up. **Surfacing the maths is a feature, not debug UI.** This is the central point of
   file 08.
3. **A smaller combat-only build shipped first as a testbed.** That de-risking pattern is
   available to you.

---

## 4. The wider category — what the founders themselves report

The most valuable source in this research pass is **Hilary Mason's "The State of AI-Native
Games: Lessons from the Frontier"** (co-founder of Hidden Door, former Chief Scientist at
Bitly), drawn from a March 2026 GDC talk. It is a founder-authored survey that names
failures including her own competitors' and her own.
Source: https://medium.com/@hmason/the-state-of-ai-native-games-lessons-from-the-frontier-3e696a9e3279

### 4.1 Memory failure is category-defining — direct support for goal (a)

**[V]** From that article:
- Hidden Door's Ian Bicking flagged **"narrative ungroundedness"** — the story only existed
  as far as it had been authored, and **players sensed the emptiness**.
- **Character.AI's top complaint is memory**: *"you can be in the middle of an epic saga and
  your character will suddenly ask who you are."*
- AI Dungeon showed early **state-tracking failure** — *"characters forgot themselves, NPCs
  switched gender mid-scene, and a frozen vampire would attack anyway."* Its "pin" memory
  workaround **"felt like coding."**

**[I]** Three independent products at very different scales, failing the same way.
And note that *the frozen vampire attacking anyway* is precisely a **rules-authority**
failure, not a memory failure: the state was known and the model ignored it. **That single
example is the cleanest illustration of why prompting cannot substitute for an engine, and
it is worth quoting in your marketing.**

### 4.2 Architecture — you are early-consensus, not contrarian

**[V]** Hidden Door's stated differentiator is architectural: **"a proprietary story engine,
not an LLM wrapper,"** built on **tens of thousands of hand-curated tropes**, giving
**guarantees about output**.

**[V]** Lesson from *Whispers from the Star*: **"conversational freedom does not equal
narrative freedom."** A reviewer noted only two real decisions changed the ending.

**[I] This is the most important competitive fact in the report.** The best-funded serious
player in the category independently concluded that the LLM must not be in charge. Hidden
Door constrains with **authored content**; Midnight Tavern constrains with **computed
rules**. Both bet that the constraint is the product. You are not contrarian — **and that
also means the architecture alone is not a moat.** The moat is execution and the specific
choice of *computed* rather than *authored* constraint, which scales without a content team.

### 4.3 Player psychology — the evidence that cuts against you

This is the part you should read twice.

**[V]** From the same survey:
- **"The common success factor is player expression."**
- Design rule: **"constrained creativity wins"** — boundaries beat an empty void.
- The **"blank canvas problem"**: structured players **wanted to know the correct solution
  rather than improvise.**
- Jam & Tea **deliberately dumbed NPCs down**; unrestrained, they would solve everything
  themselves. Quote: **"AI can sometimes be too smart — it needs to give space for the
  player to solve problems!"**
- On onboarding: **"We redid our tutorial many times and it's still not right."**

**[I] Both directions matter.** *Supporting you:* "constrained creativity wins" and the
blank-canvas finding both argue that players **want** an authority that tells them what the
options are. A GM that says no is a feature. *Cutting against you:* "the common success
factor is **player expression**" — and a deterministic engine that refuses player claims is,
by construction, a reduction in expression.

**The needle to thread is denial that is legible and fair.** The player must understand
*why* the engine said no and feel it was earned — otherwise the product reads as an LLM
roleplay app that is worse at roleplay. **This is the single strongest argument for the
work in file 08 (UI/UX).** Your engine's refusals are currently far less visible than they
need to be.

And "we redid our tutorial many times and it's still not right" is a direct warning about
teaching a novel system to players.

### 4.4 Retention — the risk nobody has solved

**[V]** *Whispers from the Star* fell from **964 concurrent players to 21 in two months**.
*Status* hit **500K DAU in a month** but **"didn't retain users from the peak."**
Conclusion in the source: **holding users demands real gameplay depth.**

**[I]** Novelty spikes and collapses in this category. Depth is the known retention
mechanism, and depth is exactly what mechanics provide. **This is a business argument for
the engine, not just a craft argument** — and it is the argument to make to any investor.

### 4.5 Cost economics — the market makes your local-first argument for you

**[V]** *Retail Mage* went from **hundreds of dollars per session** to a **1,000× cost
reduction**. *Status* cut costs **90–95%** via Inworld AI, which "allowed them to survive
their huge DAU peak." *Suck Up!*'s token system "creates a hard wall"; *Whispers* **caps
play at 40–60 min/day**. **AI Dungeon's bandwidth costs once exceeded $20,000, taking it
offline.**

**[I]** Every hosted player is fighting inference cost, and they all resolve it by
**rationing the player**. Combined with the Isekai Zero reviewer's "feels actively punishing
to have a long storyline," this is a consistent, multi-source structural finding: **hosted
LLM narrative products must ration exactly the thing long-form players want most.** Your
local-first, bring-your-own-key model does not have that conflict.

**[V] Counter-evidence, and it is important:** *AI2U* removed player-supplied API keys via
server-side calls, described as **critical friction removal for mass adoption.**
**Bring-your-own-key is a documented adoption barrier.** Local-first solves the cost
conflict and creates a setup-friction problem in the same move. **Treat first-run setup as a
first-class product risk** — see files 08 and 11.

### 4.6 Moderation — an under-appreciated strategic advantage

**[V]** *"A single moderation failure can undo years of player growth overnight"* — and it
cannot be retrofitted after scaling. AI Dungeon's **2021 moderation crisis** triggered an
"AI lobotomy" backlash and review-bombing. Character.AI **faced lawsuits and an FTC
investigation**. **Replika was banned in Italy with a €5M fine.**

**[I]** A local-first product where the user supplies their own model has a materially
smaller exposure — the operator is not hosting generation. **This is a genuine strategic
advantage of your architecture that I do not see stated anywhere in your positioning**, and
it belongs in investor and press material.

### 4.7 Company liveness

| Company | Status | Notes |
| --- | --- | --- |
| **Character.AI** | Scaled | **28M MAU, 2bn chat minutes/month**, Google **$2.7B** licensing deal — but **only $32M 2025 revenue**. Lawsuits + FTC investigation |
| **AI Dungeon** | Alive, profitable | ~30 staff, $3.3M seed from NFX. Survived moderation crisis and a >$20k bandwidth incident |
| **AI2U** | Alive | 90% positive on Steam; predecessor had 300M YouTube views |
| **Suck Up!** | Alive | 50M+ social views with no marketing spend |
| **Hidden Door** | Early, funded | **$9M raised, 29 employees.** Public launch Aug 2025; **"hasn't scaled yet"** |
| **Retail Mage** | Early | $3.15M seed |
| **Proxima** | Early | $1.6M pre-seed |
| **Status** | Churned | 500K DAU, failed to retain |
| **Whispers from the Star** | Churned | 964 → 21 concurrent in two months |
| **Replika** | Damaged | Banned in Italy, €5M fine |

**[I] On Character.AI's numbers:** enormous engagement, small revenue. Companion chat
monetises poorly. **A premium one-time-purchase game is arguably a better business than the
category leader's.** And AI Dungeon — profitable at ~30 staff — is the realistic commercial
ceiling shape here, and a perfectly good business.

**[NE] Honest gaps:** Friends & Fables, AI Roguelite, Astrocade, Rosebud AI, and Ratatoskr
were **not verified** in this pass. Notably, the Mason survey does not name any of them
among players worth mentioning — weak negative evidence, not proof.

### 4.8 The "AI GM" pitch is not unoccupied

**[V]** Several products already market it:
- **AI Game Master - Dungeon RPG** (iOS) — GPT-powered Game Master; create heroes, battle,
  level up. https://apps.apple.com/us/app/ai-game-master-dungeon-rpg/id6475002750
- **Jenova Roleplay Game Master AI** — advertises a **dual-mode architecture separating
  planning from immersive roleplay**. https://www.jenova.ai/en/resources/ai-for-roleplaying
- **DungeonsDeep** — its blog argues that without campaign-layer state tracking, *"most long
  campaigns fall apart around the context limit — you can only delay it, not stop it."*
  **Flagged: competitor marketing.** Cite it as evidence the *pitch* exists, not as an
  independent finding.

**[I]** Note Jenova's shape — separating a planning pass from a narration pass — is the same
architecture as yours, arrived at independently. That is more evidence the design is sound
*and* that it is not unique. **[NE]** No evidence that any of them computes outcomes in code
the model cannot override. **They ask a model to be a fair GM. You propose to make fairness
structural. That distinction is the defensible part, it is narrow, and it must be
demonstrated rather than asserted.**

### 4.9 The whole map on one page

*What this means: if you only take one picture away from this file, take this one. It shows
why your position is narrow, why it is empty, and why the empty part is not an accident.*

Two questions separate every product in this category:

- **Narrative freedom** — can the player attempt *anything* they can type, or only choose from
  options someone wrote in advance?
- **Mechanical authority** — when the player attempts something, does anything other than the
  language model decide whether it worked?

|  | **Low narrative freedom** (pick from authored options) | **High narrative freedom** (type anything) |
| --- | --- | --- |
| **High mechanical authority** (code decides outcomes) | Banner Saga · Wildermyth · Citizen Sleeper · Disco Elysium · Roadwarden — *a mature 40-year-old industry. Authority is total; freedom is a menu.* | **← Midnight Tavern is the only product aiming here** |
| **Medium mechanical authority** (a *model* adjudicates against authored rules) | — | **Isekai Zero** *(moved here, turn 2)* — Dungeon Mind rolls server-side dice and exclusively owns stats, but it is an LLM following a rulebook, so its authority is *procedural, not structural* |
| **Low mechanical authority** (the model decides outcomes) | Hidden Door — *authored tropes constrain the space, but the model still narrates the outcome.* | SillyTavern · AI Dungeon · NovelAI · Character.AI — *say anything; nothing is real.* |

> **Revised (turn 2).** Isekai Zero was in the bottom-right cell on the strength of the §2.2
> error. It has been moved to a new **medium-authority** row, and that move makes the map *more*
> useful, not less: it shows the real competitive frontier is not "authority vs none" but
> **who or what holds the authority — a model, or the program.** Your neighbour is now one row
> below you rather than two, which is worth knowing.

**[I]** The bottom-right cell is crowded and commoditised — it is where every AI roleplay
product lives, and they compete on model quality and price. The top-left is a solved,
saturated industry you cannot enter cheaply. **The top-right is still the position**, and per
§4.8 it is *thinly occupied rather than empty*. The claim has to be stated precisely now that
Dungeon Mind is on the board: several products claim the "AI GM" label and Isekai Zero genuinely
delivers a refereed one — but **[NE]** none computes outcomes in code the model cannot override.
**"We have a referee" is no longer a differentiator. "Our referee is code, not a prompt" is.**

**Why the top-right cell stays empty — this is the important part.** It is not empty because
nobody thought of it. It is empty because the two obvious business models cannot reach it:

- **Cloud incumbents cannot copy it without breaking their economics.** Their revenue depends
  on metering inference, so long, deep, stateful play is their cost centre, not their product
  (§4.4, and the Isekai Zero review calling long storylines *"actively punishing"*). Local-first
  inverts that incentive entirely.
- **SillyTavern cannot copy it without ceasing to be SillyTavern.** It is a prompt composer by
  architecture and by community expectation; authority has nowhere to live in it. Its extension
  ecosystem already tried, and produced only prose-scraping trackers that read state back *out*
  of the model's output — the exact inverse of owning state.
- **It is a product decision, not a model advantage.** It therefore does not evaporate when the
  next model generation ships. If anything a better narrator makes it *more* valuable: a better
  writer is worth more when it cannot lie about the facts.

**The honest counterweight, stated here so §6.2 is not a surprise:** the same construction that
makes the position defensible also reduces player expression by design, and **[V]** the
category's own postmortems name player expression as the common success factor (§4.5). A
refusal that does not feel earned is just a worse chat app. That is a UI problem, not an
architecture problem — see file 08.

---

## 5. Adjacent comparables — the games worth stealing from

Four of these matter more to your design than any direct competitor does, because they have
already solved problems you are about to hit.

### 5.1 Wildermyth — the closest architectural analogue that exists

**[V]** A character-driven, procedurally-generated strategy RPG by Worldwalker Games, with a
2D papercraft art style and comic-strip storytelling. **Metacritic 86** from 26 critic
reviews, with praise directed specifically at its use of procedural generation for character
development.
Sources: https://en.wikipedia.org/wiki/Wildermyth ,
https://store.steampowered.com/app/763890/Wildermyth/

**[V] Personality is numeric and mechanically load-bearing.** Heroes have personality
attributes (leadership, greed, liking poetry) and "hooks" (lucky, weird, wanderlust). Some
events **only trigger** if characters with certain traits are in the party, and **the strength
of a personality trait can determine odds of success or failure.**
Source: https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/Wildermyth

**[V] The mechanism — study this one.** From the game's own modding wiki: personality is a set
of numeric values with **thresholds**. A default line appears unless a hero has a trait such
as "bookish" or "loner" **above 80**; push "bookish" above that threshold and the comic panel
displays the bookish variant line instead.
Sources: https://wildermyth.com/wiki/Modding_variant_text ,
https://wildermyth.com/wiki/Comic_Editor_Reference

**[V] The art enables the procedural generation.** Everything is paper cutouts: enemies are a
single flat piece, while **heroes are modular with tiltable arms, heads and torsos, like paper
puppets.** That modularity is what makes procedurally-composed comic panels possible at all.

**[V] The honest limitation.** *"There are a finite number of vignettes, selected to appear
based on characters' personality and relationships."*
Source: https://saveorquit.com/2021/06/25/review-wildermyth/

**[I] Why this is the most important comparable in the report.** Wildermyth is **Midnight
Tavern's architecture with authored text instead of an LLM**: numeric character state →
thresholds → variant narrative selection → the story reflects who the character actually is.
It proves the model works *and* that reviewers love the result.

And it names precisely the weakness an LLM removes. Wildermyth's ceiling is how much text
humans wrote. Your LLM replaces the vignette library with unbounded generation **while keeping
the trait-threshold selection logic in code.**

**This is also the clearest way to explain Midnight Tavern to a non-engineer:**

> *"Wildermyth's character system — but the comic panels are written fresh every time instead
> of picked from a finite list."*

**Direct implication for you:** this is what finding D-2 costs you (file 06). Wildermyth's
whole appeal is that numeric character state changes what characters do. Midnight Tavern
records disposition and relationships and then picks the first combat action in catalog order.
**You have built the state Wildermyth uses, and you are not using it.**

**[V] Also worth copying: the legacy system.** Characters record a legend at campaign's end
and return in later campaigns as "Mythic" versions retaining their transformations and
personality traits.

---

### 5.2 Disco Elysium — the highest-leverage steal in this entire audit

**[V]** 24 skills representing aspects of the protagonist's personality, grouped under
Intellect, Psyche, Physique and Motorics. **Each skill can speak directly to the player.**
Little combat; events resolve through skill checks and dialogue.
Source: https://en.wikipedia.org/wiki/Disco_Elysium

**[V] Most checks are invisible, and a passed check grants *a line of text*, not a bonus.**
The game *"constantly makes secret passive checks against the 24 skills without telling the
player,"* and **successful checks introduce voices into the dialogue.**

**[V] Skills are unreliable narrators, not stat bonuses.** They are *"heavily emotional,
hilariously argumentative and consistently unreliable."* Electrochemistry urges drug-taking;
Drama suspects everyone is lying; Authority demands respect. **Higher skill means a louder
voice, which is not always beneficial** — maxed Electrochemistry makes the character a
compulsive addict. This inverts the usual RPG power curve.
Source: https://www.gabrielchauri.com/disco-elysium-rpg-system-analysis/

**[V] Checks are 2d6 + modifier against a target number.** *(Sources disagree on which of
White/Red checks is retryable — flagged as contested.)*

**[I] Why this matters enormously to you.** Disco Elysium solves the problem Midnight Tavern
hits immediately: **a deterministic engine produces integers, and integers are boring to
read.** Its answer is that a passed check produces **a voice**, not a bonus. That maps exactly
onto your architecture:

> The engine decides which skills succeed. Each successful skill becomes **a character with an
> opinion**, which the LLM voices. The LLM never decides anything — it *performs* the engine's
> results as dialogue from named internal personalities.

**That is the cleanest possible division of labour between a deterministic engine and a
language model**, and it converts your engine's output from a stat readout into potentially
the best-written part of the game. It also answers "how do I make skills feel present without
a combat encounter" — which is your situation today (file 07, W-2).

**[V] Two warnings, recorded honestly.** Creator Robert Kurvitz called the logic structures
behind talking skills *"hellish to understand"*, and it then took ten writers to make usable —
this is not a cheap feature. And a well-trafficked Steam thread argues the dice undermine
investment: **a 97% chance can still fail**, so levelling feels meaningless and
**save-scumming is incentivised**.
Sources: https://www.gamesradar.com/the-making-of-disco-elysium-how-zaum-created-one-of-the-most-original-rpgs-of-the-decade/ ,
https://steamcommunity.com/app/632470/discussions/0/3758852249522256931/

That second warning is the same undo-path problem Banner Saga solved by removing manual saves
(§3.5, and file 06 §6). **Visible probability plus visible failure invites save-scumming** —
which is exactly why plan 9 (prose reroll keeps the ruling immutable) matters.

**[V] Where the team went next:** *Zero Parades* has a skill check roughly **every 3,000
words** versus Disco's every 6,000.

---

### 5.3 Citizen Sleeper — three rules for making dice the whole game

**[V] Three pillars: Dice, Clocks and Drives**, explicitly inspired by tabletop RPGs.
Each cycle you receive **one to five dice depending on the Sleeper's condition**; higher values
mean higher success chances, and **the odds are displayed before you commit.** Five skills
(Engineer, Interface, Enure, Intuit, Engage) increase the *effective value* of dice used on
matching actions.
Sources: https://store.steampowered.com/app/1578650/Citizen_Sleeper/ ,
https://citizensleeper.fandom.com/wiki/Dice

**[V] Designer intent (Gareth Damian Martin).** The game originally had **no dice at all**.
When dice were added he first tried to fictionalise them as "energy cores," then reverted —
**dice carry poetic associations with fate, chance and precarity**, the very themes he wanted.
He also said working with abstracted mechanics like dice and clocks **solved more problems
than it created**: one system could describe fighting a gang member *or* babysitting a child.
Source: https://www.rascal.news/tracing-citizen-sleepers-circuitous-vector-from-tabletop-to-hit-video-game/

**Three lessons, all directly applicable:**

1. **Show the number before the roll.** *"Odds are displayed before you commit."* **[I]** This
   is the answer both to Banner Saga's "under-explained mechanics" criticism and to the trust
   problem in an LLM game: **if the player sees the odds first, they cannot suspect the model
   of cheating.** Midnight Tavern currently shows the maths *after* the fact in the Ruling
   artifact. Showing the DC before committing would be a significant trust upgrade — and it
   pairs naturally with plan 22's gate-legal suggestions.
2. **One abstract system for everything.** **[I]** A strong argument *against* building
   separate combat, social and crafting subsystems. One resolution mechanic with many
   fictional dressings is cheaper to build, cheaper to explain, and far easier for an LLM to
   narrate consistently. Worth weighing before plan 10.
3. **Do not disguise the dice.** Martin tried and reverted. **[I]** This contradicts the
   instinct to hide mechanics behind pure prose. **The visible die *is* the fiction** — which
   is a direct endorsement of what your Ruling artifact already does well.

---

### 5.4 AI Dungeon and NovelAI — why the best prompt engineering still failed

These two matter because they are the most disciplined attempts to solve memory *inside the
prompt*, and both document their own failure.

**AI Dungeon — the vendor's own explanation.** The AI *"can only look back so far in your
adventure's history"* — roughly **4000 tokens for free players**. As older material drops out,
the AI *"loses its ability to look back"* and is, in the help centre's own words, **"just
making it up as best it can."**
Source: https://help.aidungeon.com/faq/why-does-the-ai-forget-or-mix-things-up

**[V]** Its architecture is layered and thoughtful: AI Instructions, **Plot Essentials**
(always included), Author's Note, and keyword-triggered **Story Cards** (formerly "World
Info"). Its **Memory System** was explicitly modelled on two human-brain strategies —
compressing memories and memory retrieval — summarising every four actions, with **an
embedding model ranking memories by relevance**. And still the vendor disclaims it as *"not
guaranteed to work 100% of the time,"* recommending Retry or **Edit mode** as fallbacks.
Sources: https://help.aidungeon.com/faq/the-memory-system ,
https://help.aidungeon.com/faq/story-cards

**NovelAI — the most carefully engineered context plumbing in the category.** Three injection
points where **position determines strength**: Memory at the top, Lorebook after it, and
Author's Note inserted **three paragraphs before the last token** because *"its influence is
very intense."* Four configurable sections each with Prefix, Suffix and **Token Budget**, a
staged assembly pipeline, plus a **Context Viewer** and colour-coded Context Bar showing what
each entry consumed.
Sources: https://docs.novelai.net/en/text/editor/advancedsettings/ ,
https://tapwavezodiac.github.io/novelaiUKB/Context.html

**[V] And the admission that matters most:** *"depending on your settings, **Context and
Lorebook entries can cancel out story text and vice versa.**"*

**[I] This is decisive evidence for your central architectural claim.** The best-engineered
prompt packer in the market — budgets, stages, positional weighting, an inspector — still
ships a warning that memory and story cancel each other out. **You cannot solve memory by
getting better at packing a prompt.** The only escape is to stop treating narrative recall as
the mechanism for facts that must be true, and put those facts in a database the rules read
directly. That is your architecture, and these two products are the proof that the alternative
has been tried properly and does not work.

**Three things to steal, and one to avoid:**

- **Steal: a Context Viewer.** Both ship a UI showing exactly what the model was told and how
  many tokens each part consumed. **For a product whose entire pitch is "the engine is
  authoritative," a viewer showing what the engine sent and what it decided is the trust
  artefact.** It is cheap, and it is the difference between "the engine decided" and "trust
  me." Pairs naturally with plan 11's diagnostics panel.
- **Steal: "Plot Essentials"** — a small always-included block guaranteed to stay in context.
  Your hard-state snapshot should occupy exactly that slot, and it broadly does.
- **Steal: positional weighting.** NovelAI's docs make the strength-by-position rule explicit
  and it costs nothing to honour. **If you inject a state block, put it near the end.** Note
  your authority clause is already composed last (`context.ts:74–101`) — that instinct is
  correct and is worth extending to the memory block once plan 1 lands.
- **Avoid: fixing the world by editing the prose.** AI Dungeon's Edit mode is the anti-pattern
  you exist to remove — if the fix for a wrong fact is to rewrite the story text, then the
  story text *is* the database and the drift comes straight back.

---

### 5.5 Roadwarden — one cheap pattern worth copying

**[V]** A text-based illustrated RPG by Moral Anxiety Studio, built in Ren'Py, released 2022
(Switch 2025). The developer designed, wrote, programmed and illustrated it. The stated design
objective was an RPG that **"notices and reflects the player's role-playing."**
Source: https://www.gamedeveloper.com/design/deep-dive-roadwarden

**[V] The Attitude system.** On meeting a new character the player picks one of five attitudes
— **friendly / playful / distanced / intimidating / vulnerable** — which changes the mood and
direction of the conversation. There is also a **time limit**, described by the developer as
the game's most restrictive system: players may reach the epilogue with major storylines
incomplete.

**[I] Steal the Attitude system.** It is cheap and it fits Midnight Tavern exactly: the player
declares *how* they are acting, the engine records it as state, and it modifies outcomes.
**It converts roleplay into a machine-readable input without asking the LLM to interpret free
text** — your whole problem, solved with five buttons. It would also give
`chooseCounterAction` (file 06, D-2) a real signal to respond to.

**[I] And the time limit is the deeper lesson: scarcity is what makes state matter.** If
nothing is scarce, nothing you track is interesting. Midnight Tavern currently has no clock
and no pressure (file 06, D-7).

**[V] One caution:** the developer's postmortem is explicitly a cautionary tale, revealing
*"the mistakes that slowed down development and hindered the game's sales."* **Text-heavy
games are commercially hard even when critically respected** — worth watching before
finalising a business plan.
Source: https://www.slideshare.net/flashgamm/using-stories-as-the-foundation-roadwarden-postmortem-aureus-moral-anxiety-studio

---

### 5.6 Two evidence gaps, recorded rather than filled

**[NE] Slay the Spire and turn-based feel.** No dedicated research pass was run; time went to
the systems with direct architectural relevance. Rather than write unsourced generalities, the
one principle worth stating — supported by the Citizen Sleeper and Banner Saga evidence above
rather than by Slay the Spire sources — is that **a readable tactical loop shows the player
every number before they commit, and derives difficulty from combinatorics rather than hidden
information.**

**[NE] King of Dragon Pass — the missing comparable, and I recommend a follow-up pass.** It
was named by Banner Saga's Alex Thomas as one of the three games his concept blended (§3.1).
**[I]** Structurally it is the closest historical ancestor of Midnight Tavern: a narrative
event engine sitting on top of a simulation that owns the numbers, where a clan's persistent
state selects and resolves story events. **It is the pre-LLM proof of your architecture, and
it should be studied before you design the event system** (plan 19's `narrativeBeatPlan.ts`).

---

## 6. Competitive positioning table

Rated on what each product *actually does today*, not what it claims.

> **Revised (turn 2):** the Isekai Zero column previously carried **[NE]** ("no evidence found")
> for mechanical authority, unbreakable rules and turn-based combat. The first two were wrong —
> Dungeon Mind supplies both (§2.2) — and are corrected below. The third was *right for the wrong
> reason*: Isekai Zero has no tactical combat because it deliberately does not want one.

| | **Midnight Tavern** | **SillyTavern** | **Isekai Zero** | **Hidden Door** | **AI Dungeon** | **Banner Saga** |
| --- | --- | --- | --- | --- | --- | --- |
| **Category** | Local narrative game engine | Local LLM front end | Mobile AI story app | Web narrative platform | Web AI story | Turn-based tactical RPG |
| **Mechanical authority** | **Deterministic engine; model cannot write state** | None (prose only) | **Yes — Dungeon Mind; exclusive stat writes, server-side rolls** *(corrected)* | Authored tropes constrain output | None | Full (conventional game) |
| **Rules the model cannot break** | **Yes — gate + ledger (pure function, before the dice)** | No | **Yes — but LLM-adjudicated, not a pure engine** *(corrected)* | Partial (content-bounded) | No | n/a |
| **Memory model** | SQLite hard state + soft state; **no semantic recall** | Keyword lorebooks + optional vectors | Cloud, **metered** | Story engine | "Pins" (*"felt like coding"*) | Save file |
| **Documented memory complaints** | Untested at scale | 10 failure modes in own docs | *"memory span of a goldfish"* | "narrative ungroundedness" | NPCs "switched gender mid-scene" | n/a |
| **Turn-based combat** | **None** (single d20 + counter) — *not a goal* | None | **None, by design** — no grid/initiative/action economy; one `roll_d20` per action | Light | None | **Yes — the reference** |
| **Character card import** | **V2 + V3** | **V2 + V3 (originator)** | No | No | No | n/a |
| **Cost model** | **One-time purchase, BYO key** | Free, BYO backend | **Metered dual currency** | Free (rev-share) | Freemium | One-time purchase |
| **Cost/coherence conflict** | **None** | None | **Severe — memory is metered** | Hosted | Hosted | n/a |
| **Runs offline / local** | **Yes** | Yes | No | No | No | Yes |
| **Moderation exposure** | **Low (not hosting)** | Low | High | High | **Crisis 2021** | None |
| **Platform** | Desktop (Tauri) | Desktop + Android | **Mobile + web only** | Web | Web | All, **iOS best-rated (92)** |
| **Content ecosystem** | Imports ST cards | **Huge — the moat** | Creator tools, 25% rev-share | Licensed IP | Community | n/a |
| **Art / animation** | **Minimal** | None | **Visual novel mode, voice, music** | Illustrated | Illustrated | **Hand-drawn, rotoscoped** |
| **Known retention** | Untested | Sticky (power users) | Churn on price | *"hasn't scaled yet"* | Profitable, stable | Complete-and-done |

### 6.1 Where you genuinely win

1. **Structural mechanical authority — and this survives the Dungeon Mind correction, sharpened.**
   Isekai Zero *does* have a referee, so "nobody has a referee" was wrong. But **its referee is an
   LLM being asked to follow a creator-authored rulebook**, whereas yours is a pure function that
   runs before any dice (`engine/gate.ts`) writing to an append-only ledger
   (`engine/ledger.ts:69`). Dungeon Mind can be argued with, in principle, because it is a model;
   your gate cannot, because it is code. **[NE]** still holds in its precise form: no competitor
   researched computes outcomes in code the model cannot override. That is a narrower claim than
   turn 1 made and it is the defensible one — use this phrasing, not the old one.
2. **No cost/coherence conflict.** Every hosted competitor rations memory or messages. You
   structurally cannot have that problem.
3. **Low moderation exposure.** Under-stated in your current positioning.
4. **Card import.** You inherit SillyTavern's content ecosystem instead of competing with it.

### 6.2 Where you are currently behind

1. ~~**Combat.** Banner Saga is your stated pillar and you have no combat system (file 07).~~
   **Withdrawn (turn 2) — not a gap.** Never planned, and the benchmark has no tactics layer
   either. **Replace it with the real one: the storyteller half.** Isekai Zero runs a second
   model that owns narration, pacing and endings; you have no component that owns those
   ([06](06-gap-analysis-dm-authority.md) D-5). This subsumes item 5 below.
2. **Presentation.** Isekai Zero ships scene art, voice narration, animated expressions and
   a mood-following soundtrack. You ship a text UI (file 08).
3. **Memory in practice.** Your architecture is better; your *retrieval* is not yet (file 05).
   Today, in No Stats mode, you are behind SillyTavern-with-Summarize.
4. **Setup friction.** BYO-key is a documented adoption barrier and AI2U removed it
   deliberately.
5. **Endings.** Isekai Zero ships stories that *end*. You have arcs and chapters but no
   ending model — and "complete-and-done" is exactly how Banner Saga retained its
   reputation.

---

## 7. Consolidated sources

**SillyTavern:** https://docs.sillytavern.app/usage/core-concepts/worldinfo/ ·
https://docs.sillytavern.app/ · https://github.com/SillyTavern/SillyTavern ·
https://github.com/malfoyslastname/character-card-spec-v2 ·
https://github.com/kwaroran/character-card-spec-v3 ·
https://github.com/character-foundry/character-foundry ·
https://github.com/MultihogAurelius/SillyTavern-MultihogDnDFramework ·
https://github.com/SpicyMarinara/rpg-companion-sillytavern ·
https://github.com/kaldigo/SillyTavern-Tracker ·
https://github.com/ThiagoRibas-dev/SillyTavern-State ·
https://github.com/HelpfulToolsCompany/lorevault-extension · https://tavernary.org/ ·
https://github.com/vegu-ai/talemate · https://rentry.co/world-info-encyclopedia

**Isekai Zero:** https://www.isekaizero.ai/ ·
https://apps.apple.com/us/app/isekai-zero/id6748359707 ·
https://apps.apple.com/us/app/isekai-zero/id6748359707?see-all=reviews&platform=iphone ·
https://play.google.com/store/apps/details?id=com.isekai.world ·
https://mwm.ai/apps/isekai-zero/6748359707 ·
https://www.appbrain.com/app/isekai-zero-anime-ai-roleplay/com.isekai.world ·
https://www.questie.ai/isekai-zero *(competitor-owned; flagged)*

**Banner Saga:** https://en.wikipedia.org/wiki/The_Banner_Saga ·
https://bannersaga.fandom.com/wiki/Stats · https://bannersaga.fandom.com/wiki/Abilities ·
https://bannersaga.fandom.com/wiki/Tactical_Strategies ·
https://bannersaga.fandom.com/wiki/Pillage · https://bannersaga.fandom.com/wiki/Terminology ·
https://bannersaga.fandom.com/wiki/Caravan · https://bannersaga.fandom.com/wiki/Morale ·
https://bannersaga.fandom.com/wiki/Events ·
https://www.gamepressure.com/thebannersaga/dealing-and-taking-damage/z25d09 ·
https://www.gamepressure.com/thebannersaga/moving-around-the-battlefield-and-order-of-turns/z15d08 ·
https://stoicstudio.com/forum/archive/index.php/t-1213.html ·
https://steamcommunity.com/app/237990/discussions/0/35221584380085529/ ·
https://80.lv/articles/the-banner-saga-background-artist-interview ·
https://www.polygon-treehouse.com/blog/2018/3/7/inspiration-corner-eyvind-earle

**Category / startups:**
https://medium.com/@hmason/the-state-of-ai-native-games-lessons-from-the-frontier-3e696a9e3279 ·
https://www.hiddendoor.co/blog/early-access ·
https://variety.com/2025/gaming/news/hidden-door-ai-role-playing-fan-fiction-game-platform-1236488265/ ·
https://gamesbeat.com/hidden-door-reveals-its-ai-powered-narrative-game-building-platform/ ·
https://pitchbook.com/profiles/company/462382-12 ·
https://www.crunchbase.com/organization/hidden-door-5210 ·
https://apps.apple.com/us/app/ai-game-master-dungeon-rpg/id6475002750 ·
https://www.jenova.ai/en/resources/ai-for-roleplaying ·
https://github.com/samvoisin/ai-dungeon-master ·
https://dungeonsdeep.ai/blog/why-ai-game-masters-forget-your-campaign-and-how-dungeonsdeepai-doesnt
*(competitor marketing; flagged)*

**Adjacent comparables — AI Dungeon / NovelAI:**
https://help.aidungeon.com/faq/why-does-the-ai-forget-or-mix-things-up ·
https://help.aidungeon.com/faq/the-memory-system ·
https://help.aidungeon.com/faq/story-cards ·
https://help.aidungeon.com/understanding-settings ·
https://help.aidungeon.com/how-do-i-manage-context ·
https://docs.novelai.net/en/text/editor/advancedsettings/ ·
https://docs.novelai.net/en/text/editor/storysettings/ ·
https://docs.novelai.net/en/text/models/ ·
https://tapwavezodiac.github.io/novelaiUKB/Context.html

**Adjacent comparables — Wildermyth:** https://en.wikipedia.org/wiki/Wildermyth ·
https://store.steampowered.com/app/763890/Wildermyth/ ·
https://tvtropes.org/pmwiki/pmwiki.php/VideoGame/Wildermyth ·
https://wildermyth.com/wiki/Modding_variant_text ·
https://wildermyth.com/wiki/Comic_Editor_Reference · http://shaenanigans.com/wildermyth ·
https://saveorquit.com/2021/06/25/review-wildermyth/ ·
https://cogconnected.com/review/wildermyth-review/

**Adjacent comparables — Roadwarden:** https://en.wikipedia.org/wiki/Roadwarden ·
https://www.gamedeveloper.com/design/deep-dive-roadwarden ·
https://moralanxietystudio.com/presskit/roadwarden ·
https://www.youtube.com/watch?v=rmryo5aIHqk ·
https://www.slideshare.net/flashgamm/using-stories-as-the-foundation-roadwarden-postmortem-aureus-moral-anxiety-studio

**Adjacent comparables — Citizen Sleeper:**
https://store.steampowered.com/app/1578650/Citizen_Sleeper/ ·
https://citizensleeper.fandom.com/wiki/Dice ·
https://www.rascal.news/tracing-citizen-sleepers-circuitous-vector-from-tabletop-to-hit-video-game/ ·
https://www.gamedeveloper.com/business/how-citizen-sleeper-was-inspired-by-tabletop-rpgs-and-gig-work

**Adjacent comparables — Disco Elysium:** https://en.wikipedia.org/wiki/Disco_Elysium ·
https://www.gamesradar.com/the-making-of-disco-elysium-how-zaum-created-one-of-the-most-original-rpgs-of-the-decade/ ·
https://www.gabrielchauri.com/disco-elysium-rpg-system-analysis/ ·
https://gamedesignthinking.com/disco-elysium-rpg-system-analysis/ ·
http://awkwardmixture.blogspot.com/2020/03/disco-elysium-skill-checks.html ·
https://steamcommunity.com/app/632470/discussions/0/3758852249522256931/ ·
https://www.rpgsite.net/interview/19999-zero-parades-interview-zaum-writers-discuss-moving-on-from-disco-elysium

---

*Next: [05 — Gap analysis: memory drift](05-gap-analysis-memory-drift.md)*
