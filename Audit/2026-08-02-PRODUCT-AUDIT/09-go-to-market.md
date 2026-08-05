# 09 — Go To Market: how to promote this outside the app

**Scope.** The user asked: *"how can we promote this outside of app."* This file is
strategy and channels. It is the least code-grounded file in the audit — where I am
reasoning rather than citing, I say so.

**One honest caveat up front:** I am an engineer auditing a codebase, not a marketer with
category data. Treat §§1–3 (positioning and proof) as high confidence, since they follow
directly from verified product facts. Treat §§5–7 (channels, pricing, sequencing) as
informed opinion.

---

> **Revision 2026-08-02 (turn 2).** Five owner clarifications land on this file, and two of them
> change the recommended strategy rather than its wording. **(a)** Banner Saga-style turn-based
> combat and animation were **never planned** — an agent introduced them into the audit's framing,
> so the "three pillars" premise in §9 is retired and the +6→+12-month combat beat in §8 is
> withdrawn. Standing verdict: *don't build it* (file 10 §9). **(b)** The real roadmap item is
> **user-selectable image generation** — the player picks provider + model, and images are generated
> during the story when enabled. It is a **future** plan, so it appears here as roadmap and never as
> shipped capability. **(c)** The **"DM"** the owner cites in Isekai Zero is **Dungeon Mind**, which
> *is* publicly documented — so §1.3's warning against citing it was wrong and is inverted into a
> positioning asset. **(d)** **Memory-Keeper** is real, tested and substantially complete, which
> upgrades memory from "don't mention it" to a qualified, claimable differentiator — the one word to
> avoid being *prevents*. **(e)** The owner archived the old handoff files themselves; no finding
> here rested on that, so nothing changes on its account.
>
> Unchanged: §2 (the market's own words), §3.1–3.2 (the demo that already films itself), §4
> (audience), §5.1 (channels) and §6 (pricing) are independent of the combat question and stand.

## What this means (read this first)

You have one marketable idea, and it is a good one:

> **Every other AI roleplay product asks the model to be fair. This one makes fairness
> structural — the rules are enforced in code the model cannot reach.**

That sentence is true, verifiable, and — based on the competitive research — **not claimed
by anyone else in the category.** It is your entire position.

Three things follow:

1. ~~**Do not market memory yet.** It is your headline weakness right now (file 05), and the
   first knowledgeable user who tests it will find the seam in ten minutes. Market
   *authority*, which is genuinely finished, and let memory become a launch beat later.~~

   > **Revised (turn 2) — memory is marketable, with one word held back.** Turn 1 scored memory
   > as an unbuilt promise because it only looked at this repo. **Memory-Keeper** — a separate,
   > substantially complete FastAPI service the owner built as the origin of the drift work — is
   > real and tested: **105 passing tests**, two store backends, 12 API route modules, snapshots
   > with rollback and retention, LLM-backed extraction of facts/relationships/arcs, **two**
   > independent drift detectors (character drift and narrator *voice* drift), and a working
   > SillyTavern adapter. Competitors' top complaint is memory; you have a shipped subsystem
   > aimed squarely at it.
   >
   > **The one word to hold back is *prevents*.** Memory-Keeper detects drift *after* the model
   > has produced it, writes a `DriftLog` row, and injects a correction note on the following
   > turn at one of three strengths. Nothing blocks, retries, or verifies compliance — the
   > strongest lever in the system is an emphatic string in the prompt, and its own design note
   > says so more bluntly than this audit did: *"a mitigation and recovery pipeline, not a hard
   > consistency guarantee,"* with *"an unavoidable one-turn lag"* and *"the first occurrence of
   > any drift is always generated before the system can react."*
   >
   > **So the honest, still-differentiating claim is:** *"Your character drifts, we catch it, and
   > the next turn corrects course — and you can see the log."* That is testable, survives a
   > sceptic, and no competitor offers it. *"Never forgets"* or *"prevents drift"* would not
   > survive one session. Note the asymmetry that makes this credible: **authority is prevention
   > (hard state is gated in code), memory is detection and recovery.** Marketing them with the
   > same verb is the mistake to avoid.
   >
   > Two caveats before it goes in a headline. **The app-side wiring is still the gap** — file 05
   > M-1 stands: the observations exist but never reach the narrator's prompt, so on today's build
   > the detection upstream cannot help the story. And `drift_sensitivity` is a **dead knob** —
   > defined in config, set by all four presets, documented, read by no detector — so do not
   > advertise tunable sensitivity until it is wired.
2. **Your best marketing asset is a screenshot you already have** — the denial ruling
   artifact. It shows a game telling a player *no*, with the maths. Nobody else can show
   that image.
3. **The demo must be a demo, not a description.** The category is saturated with
   claim-based marketing (file 04 §2.6 — the top search results for "best AI roleplay app"
   are written by the apps themselves). A 40-second video of the engine refusing a cheat
   attempt cuts through all of it.

And one strategic warning, narrowed but not withdrawn: **do not launch a memory claim until
retrieval is wired app-side.** Your audience is technical, sceptical, and vocal. A "solves memory
drift" claim tested against the current build in No Stats mode (8-message window, no summaries —
file 05, M-2) would produce exactly the kind of public correction that is very hard to recover
from. What changed in turn 2 is the *size* of that job: with Memory-Keeper already built and
tested, this is an integration task, not a subsystem to invent — which shortens the runway to a
launch you can defend.

---

## 1. Positioning

### 1.1 The one-line pitch

> **Midnight Tavern is a roleplay game with a referee the AI cannot argue with.**

Alternatives, depending on audience:

- **For SillyTavern users:** *"Your character sheet is a database, not a paragraph the model
  might forget."*
- **For tabletop players:** *"An AI narrator with a DM sitting between it and the rules."*
- **For the sceptical:** *"The model writes the prose. The program decides what is true."*
  (This is nearly verbatim from `Plan/high-level-plan.md:9` — the founding document already
  contains the best marketing copy in the project.)

### 1.2 The category name

You called it a **"narrative-focused LLM-based chat game engine."** That is accurate and
unsellable — four modifiers before the noun.

Better options: **"AI roleplay with real rules"** (plainest), **"the refereed AI RPG"**
(most distinctive), or lean on the negative space: **"AI roleplay that can say no."**

**My recommendation: "AI roleplay that can tell you no."** It is memorable, it is a complete
thought, and it makes people ask a follow-up question — which is what a category line is for.

### 1.3 What NOT to claim yet

| Claim | Why not yet |
| --- | --- |
| *"**Prevents** memory drift"* | The word to avoid. Memory-Keeper **detects** drift and corrects it next turn; nothing blocks it. Say "catches and corrects," never "prevents" |
| *"Characters that grow and remember"* | Blocked app-side by M-1 and M-5 — the observations exist but never reach the narrator (file 05) |
| *"Generated art for every scene"* | Roadmap, not shipped. Zero image files in the product today (file 08, U-3); position it as what's coming, with a date you can hold |
| ~~*"Banner Saga-style combat"*~~ | ~~No combat system exists (file 07, W-2)~~ **Retired — see revision note below.** Never planned, so there is nothing to disclaim and nothing to promise |
| ~~*"Beautiful hand-drawn animation"*~~ | ~~Zero image files in the product (file 08, U-3)~~ **Retired for the same reason** — superseded by the generated-art row above |
| ~~*"Inspired by Isekai Zero's DM model"*~~ | ~~Isekai Zero has no public DM model (file 04 §2.2). Would invite an embarrassing correction~~ **Wrong — inverted below. This claim is safe and it is an asset** |

> **Revision — three rows changed (turn 2).**
>
> **The Isekai Zero row was flatly incorrect and is now reversed.** Isekai Zero's DM is **Dungeon
> Mind**, documented publicly at `docs.isekaizero.ai` in both the player and creator guides. Its
> own framing is *"the referee sitting next to the storyteller,"* with the division of labour stated
> outright: *"The story AI writes what happens. The DM decides whether your action actually
> worked."* It has exclusive stat write access (*"The DM is the only thing that changes stats"*),
> server-side rolls that *"can't be manipulated,"* and a `reject_action` that blocks an action
> **before any roll** with a stated reason. That is Midnight Tavern's architecture, arrived at
> independently. **You may cite it, and you should** — it converts your position from one vendor's
> opinion into a convergent design that a second product validated. There is no correction to
> invite; the documentation is on your side.
>
> **The two combat/animation rows are retired rather than fixed.** Both scored the absence of
> something the owner never planned. A go-to-market document has no business disclaiming a non-goal:
> saying "we don't have Banner Saga combat" plants the idea that you were supposed to. Say nothing
> about tactics at all. What replaces them is the generated-art row — a real roadmap item that needs
> honest tense discipline, not a disclaimer.

**One line you can use today, and it is the strongest sentence in this file [opinion]:**

> *"The referee is a program, not a personality. The same design Isekai Zero calls Dungeon Mind —
> except ours runs on your machine, on your key, and you can read the source of every ruling."*

**What you can claim today, all verifiable:**
- The model cannot grant you an item, a skill, or a level. ✅ `engine/ledger.ts:69`
- A skill you have not learned cannot be used, ever. ✅ `engine/gate.ts`
- Dice, DCs and modifiers are shown and auditable. ✅ `RulingArtifact.tsx:234–241`
- Every DM decision is logged and exportable. ✅ `Journal.tsx:135–154`
- Your data never leaves your machine. ✅ Local-first, BYO key
- Imports SillyTavern V2/V3 character cards. ✅ `importer/`
- **A malicious character card cannot cheat the game.** It can make the narrator *say* anything;
  it cannot grant an item, pass a gate, or change a stat — because the engine never reads the
  prose back into state. ✅ `engine/ledger.ts:69` is the sole writer; `context.ts:45–56` composes
  the authority clause last and names character cards as subordinate

That is a strong, honest launch list.

**And one thing to promise rather than claim (turn 2, clarification 3):** the roadmap item is
**user-selectable image generation** — the player picks provider *and* model, and images are
generated during the story when they enable it. Marketed correctly this is a strong beat, because
it inherits the credibility of the rest of the product: same BYO-key shape as the text provider,
your key, your machine, your choice of model, no per-image metering by you. It is also the honest
answer to *"why does this look like a document tool"* (file 08, U-3).
**Tense discipline is the whole game here.** Every sentence about art must be visibly future —
*"generated scene art is coming, and you'll pick the model"* — never present tense, never in a
screenshot, never on a store page as a bullet next to shipped features. The audience that converts
on structural honesty is the same audience that punishes a roadmap item dressed as a feature.
A dated public roadmap entry is worth more here than a teaser image.

**Do not skip the last one — it is the most under-claimed asset you have.** Every competitor
that composes a downloaded character card into a prompt is exposed to that card carrying
instructions. Yours is too, at the *prose* level: a hostile card can steer tone, or attempt to
talk the narrator into declaring an outcome. But it hits a wall the others do not have, and the
wall is structural rather than a filter that can be talked around. Phrase it as a property, not
a boast: *"Downloaded cards can influence how the story is written. They cannot change what is
true."*

Two honest caveats to keep the claim clean, both of which you should fix before saying it loudly
(file 07): the analyzer prompt has no authority clause of its own, so a crafted card can still
steer **soft** state (W-4), and the card importer will fetch any URL you hand it (W-3). Neither
undermines the hard-state claim; both are small fixes, and shipping them first turns a good
claim into an unimpeachable one.

---

## 2. The three arguments the market has already made for you

These come from the competitive research and are the most persuasive material available,
because **they are your competitors' own words**.

### 2.1 Your thesis, written by a SillyTavern user

The Multihog D&D Framework's README states the four problems it exists to solve:

> *"the AI forgetting your inventory/spells, the AI forgetting long-term context, you always
> winning (aka. plot armor), and the world being static."*
> — https://github.com/MultihogAurelius/SillyTavern-MultihogDnDFramework

**Use this.** It is a SillyTavern power user independently articulating your product brief.
An article titled *"Someone built a 2,000-line SillyTavern extension to stop the AI letting
you win. Here's why that can't work."* writes itself — and it is a technically honest
argument (file 04 §1.4: extracting state from prose after the fact cannot be authoritative).

### 2.2 Hosted rivals must ration the thing players want most

An Isekai Zero reviewer, paying, on the App Store:

> *"...feels actively punishing to have a long storyline."*

Because **summarising your story into chapters costs currency.** Their memory feature is
metered.

**This is the sharpest commercial argument you have.** For a hosted product, every turn costs
the operator money, so the business model is structurally opposed to long stories. Yours is
not: one purchase, your own key, no per-message billing, no cap on how long your story runs.

Headline: **"Your story doesn't get more expensive the better it gets."**

### 2.3 The whole category fails the same way

From Hilary Mason's founder survey (file 04 §4.1):

- Character.AI's **top complaint is memory** — *"you can be in the middle of an epic saga and
  your character will suddenly ask who you are."*
- AI Dungeon: *"characters forgot themselves, NPCs switched gender mid-scene, and **a frozen
  vampire would attack anyway**."*

**That frozen vampire is the single best illustration in this entire audit** of why prompting
cannot replace an engine: the state was known, and the model ignored it. A gate check makes
that literally impossible — a frozen actor fails the `alive`/condition check before any die
is rolled (`engine/gate.ts:1–16`).

Use the vampire. It is concrete, funny, and it makes the architectural argument in one
sentence.

---

## 3. Proof, not claims — the demo strategy

The category runs on claims. **You can run on demonstrations,** because you are the only one
who can show the receipt.

### 3.1 The 40-second video that sells the product

1. Player types: *"I pull out my legendary sword and cut the guard down."*
2. The DM ruling appears **above** the prose: **DENIED** — no die, dashed ⊘ glyph, stamp.
   Reason: *you do not have that item.*
3. Detail row, verbatim from the shipped UI: *"No roll, cost, XP, loot, equipment change, or
   mechanical consequence."* (`Play.tsx:170`)
4. The narrator writes the scene where the sword is not there.
5. Cut to the Journal: the decision, logged, exportable.
6. Card: *"The AI writes the story. It doesn't get to decide what's true."*

**Every frame of that already exists** (file 08 §1.1). It requires no new engineering, and no
competitor can film it.

### 3.2 The side-by-side

Same character card, same prompt, same model. SillyTavern on the left, Midnight Tavern on the
right. Attempt something the character cannot do. Left: the model obliges. Right: denied,
with maths.

This is devastating and completely fair — you are not rigging it; the architectures simply
differ. It is also the format that performs on r/SillyTavern and YouTube.

### 3.3 The long-session proof — **hold this one back**

The strongest possible demo is a 200-turn story where a fact from turn 3 still holds at turn
200. **You cannot run that demo today** (file 05, M-1). Fix retrieval first, then make this
your launch centrepiece — it is the demo that would define the category.

> **Revised (turn 2) — closer than turn 1 thought, and film the correction rather than the
> streak.** Memory-Keeper already extracts and persists the facts this demo needs, so the blocker
> is app-side integration, not a subsystem to build. Two notes on how to shoot it. **First, the
> honest version of this demo is a *catch*, not a perfect record:** show the narrator starting to
> contradict a turn-3 fact, the drift log firing, and the next turn correcting itself. That is
> what the system actually does, it is more interesting than an unbroken streak, and it cannot be
> accused of cherry-picking. Claiming "200 turns, zero drift" invites someone to run turn 201.
> **Second, one-turn lag is inherent** — the first occurrence of any drift is always generated
> before the system can react — so a demo edited to hide the lag misrepresents the architecture.
> Show the lag and name it; the audience that cares about memory will respect that far more than
> a clean cut.

---

## 4. Audience, in priority order

### 4.1 Primary: SillyTavern power users who have already tried to fix this

The people installing Multihog, SillyTavern-Tracker, SillyTavern-State, lorevault. They have
felt both pains, they are technical enough for BYO-key, and they already accept local
installs.

**Why they convert:** they have already paid a cost to solve this and it did not work.
**Where they are:** r/SillyTavern, the SillyTavern Discord, tavernary.org, GitHub issues on
the tracker extensions themselves.
**What convinces them:** the architectural argument that prose-extracted state cannot be
authoritative. They will get it immediately.

### 4.2 Secondary: solo tabletop players

People who play solo RPGs, use oracle systems, or run one-player campaigns. They already
believe rules should bind, and "an AI narrator with a real DM" needs no explanation.

**Where:** r/Solo_Roleplaying, r/rpg, itch.io's solo-RPG community, the Ironsworn/Mythic
communities.
**Caveat:** they are conservative about AI. Lead with *"the rules are enforced in code,"* not
*"powered by AI."*

### 4.3 Tertiary: the AI-native games conversation

Small but disproportionately influential — the audience reading Mason's GDC survey. They will
recognise instantly that you reached the same conclusion as Hidden Door by a different route,
and that is a story worth telling.

### 4.4 Explicitly NOT your audience yet

Mobile companion-chat users (Character.AI, Isekai Zero's core). They want frictionless
emotional chat; you offer a desktop install, an API key, and a system that tells them no.
Chasing them means losing your differentiator, and their monetisation is poor anyway —
Character.AI's **28M MAU produced only $32M in 2025 revenue** (file 04 §4.7).

---

## 5. Channels

Ranked by fit. **[Opinion, not verified.]**

### 5.1 Highest fit

**1. r/SillyTavern and the SillyTavern Discord.** Your exact audience, concentrated.
Rules: participate for weeks before promoting; lead with the card-import compatibility (you
*extend* their ecosystem, you do not replace it); post the side-by-side, not a feature list.

**2. A technical blog post with real depth.** *"Why your AI roleplay bot always lets you
win — and the architecture that fixes it."* Show the gate function. Show the closed patch
union. Explain why a second model reading prose cannot be authoritative. This audience
rewards genuine engineering content and it is highly shareable to Hacker News.

**3. YouTube long-form.** Solo-RPG and AI-tools channels. The demo is visual and the
argument survives a 20-minute format.

**4. itch.io.** Right audience for a premium narrative game, low friction, community that
tolerates early builds.

### 5.2 Medium fit

**5. Hacker News**, once — on the technical post, not the product. Title it around the
architecture. Expect hard questions about determinism and prompt injection; you can answer
both well (`context.ts:74–101`), which is itself good marketing.

**6. Steam.** Big reach and a payment rail, but a BYO-key requirement will generate refunds
and negative reviews from users who did not read. If you go there, gate it behind a very
explicit store-page warning. **Consider this after onboarding is solved** (file 08, U-4).

**7. Open-sourcing the engine, keeping the app paid.** The engine is the credible artefact.
An open `packages/core` with the gate, ledger and closed patch union would make the technical
argument permanently, generate contributions, and cost you little — the product value is the
app, the content pipeline and the UI. **[Opinion — but I think this is the highest-leverage
distribution move available to you.]**

### 5.3 Low fit — do not bother yet

TikTok/Reels (wrong depth), paid ads (audience too small and specific), influencer
partnerships (nothing to show yet), and press outreach (no news hook until the memory
integration or generated art lands — ~~combat or~~ the two beats that are actually on the
roadmap).

---

## 6. Pricing and business model

**Current plan** (`Plan/high-level-plan.md:203`): one-time purchase with paid major-version
upgrades, free trial on the user's own key, no subscription. **I think this is correct** and
would not change it.

Supporting evidence:
- Character.AI: 28M MAU → $32M revenue. Companion chat monetises badly.
- AI Dungeon: **profitable at ~30 staff.** That is the realistic, good outcome shape here.
- Isekai Zero's metered model produces its loudest complaints.
- You have no inference costs to recover, so you have no reason to meter.

**Price anchoring [opinion]:** this is a premium tool for a niche, not a mass-market app.
$25–40 one-time is defensible and signals seriousness. Underpricing a technical product to a
technical audience reads as low confidence.

**The free trial is your best asset.** It runs on their key, costs you nothing, and converts
on the strength of the product. Make sure it lasts long enough for the *authority* to become
visible — the denial moment is the conversion event, so the trial must guarantee the player
hits one.

---

## 7. What to fix before promoting anything

Ordered. **Do not skip 1 and 2.**

1. **Fix M-1** — wire observations into the prompt (file 05). Until then, any memory claim is
   falsifiable in one session. **(Turn 2: this is an integration, not a build.** Memory-Keeper
   already produces and stores what the prompt is missing, which is why item 1 is days rather than
   the quarters turn 1 implicitly assumed.)
2. **Fix M-2** — No Stats mode having no memory is the single worst first impression
   available, and No Stats is what a SillyTavern refugee will pick first.
3. **Fix W-3** — the SSRF in URL import (file 07). Shipping a security bug in a card
   importer, to a community that shares card links constantly, would be a launch-ending
   story.
4. **Fix U-6 and U-7** — raw JSON on screen and a fabricated chapter number. Both trivial;
   both are exactly what a reviewer screenshots.
5. **Wire U-2** — NPC ruling variants, so NPC actions are explicable.
6. **Then** build the 40-second demo and the side-by-side.

**Estimated: the first five are days, not months.** That is a short runway to a launch you can
defend.

> **Turn 2 — two things deliberately *not* on this list.** **Generated art does not block launch.**
> It is the +6→+12-month beat (§8); the 40-second authority demo films fine against the current
> text UI, and holding the launch for art would trade a provable differentiator for a cosmetic one.
> **Wiring `drift_sensitivity` does not block launch either** — it is a dead knob today (defined,
> preset, documented, read by nothing), so the only requirement is that no marketing copy or store
> page promises tunable drift sensitivity until it does something. Cheaper to not claim it than to
> fix it before shipping.

---

## 8. The one-year narrative

**[Opinion, offered as a framing rather than a plan.]**

- **Now → +1 month:** fix memory retrieval and the security bug. Ship nothing publicly.
  Build the demo video.
- **+1 → +3 months:** soft launch to r/SillyTavern and the Discord. Free trial, card import,
  the authority demo. Goal is 100 real users and their complaints, not revenue.
- **+3 → +6 months:** publish the technical post. Consider open-sourcing the engine. Add
  onboarding. This is when "solves memory drift" becomes claimable, if the v2 memory work has
  landed.
- ~~**+6 → +12 months:** combat. It is the biggest lift and the biggest differentiator versus
  every text-only competitor, and it is the thing that answers the category's retention
  problem (file 04 §4.4 — *"holding users demands real gameplay depth"*). Consider Stoic's
  own pattern: **Banner Saga shipped a small combat-only multiplayer build first** as a
  testbed, and it worked.~~
- **+6 → +12 months (replaces the withdrawn combat beat):** **generated scene art ships** —
  provider + model picker, images produced during the story, off by default. This is the beat
  that changes what the product *looks* like, and it is the one the owner actually planned. It
  answers the same retention argument the combat beat was reaching for (file 04 §4.4 — *"holding
  users demands real gameplay depth"*) at a fraction of the cost, because presentation is what
  makes the existing loop read as a game (file 08, U-3/U-13). Sequence it after the memory
  integration: art makes people look, memory makes them stay.

  > **Why the combat beat is withdrawn (turn 2).** It was never on the owner's roadmap — the audit
  > inherited it from turn 1's framing. The standing verdict is *don't build it* (file 10 §9), and
  > for this file the point is narrower: **a roadmap is a marketing document.** Publishing a combat
  > milestone would commit you publicly to a non-goal, invite comparison against Banner Saga and
  > Darkest Dungeon on art and balance — a fight you would lose and do not need — and devalue the
  > differentiator you actually have. The Stoic precedent is irrelevant once tactics is off the
  > table.

---

## 9. ~~The uncomfortable strategic question~~ The question was based on a premise you never held

> **Rewritten 2026-08-02 (turn 2).** This section asked you to choose between shipping narrow and
> building combat + commissioned art. **The dilemma was manufactured by the audit, not by your
> plans.** Turn 1 was handed "animations + turn-based combat + LLM narrative" as your three pillars
> and scored the product against them; you never had those pillars. A repo-wide sweep of your own
> docs found **zero** hits for `banner saga`, `turn.based`, `turn order`, `tactics`, `grid combat`
> and `battle system`, and all four `initiative` hits are **explicit deferrals**
> (`Plan/competitive-adoptions.md:706`, `README.md:277`, `Plan/attribute-integration.md:204`).
> Path (B) was never on the table, so there is no fork to agonise over. The original text is kept
> struck through below because the *shape* of its recommendation — ship the thing you have — was
> right for the wrong reason.

~~Your three stated pillars are **animations + turn-based combat + LLM narrative**. Today you
have a rules engine and a text UI: one pillar of three, and it is the least visible one.~~

~~Combat and art are each enormous — one is a subsystem with no plan (file 07, W-2), the other
is a labour budget rather than a style (file 04 §3.6).~~

~~**So there is a real choice to make, and it should be made deliberately:** **(A) Narrow** — be
the best refereed text roleplay engine, drop animation from the pitch, ship in months. **(B) Go
wide** — build combat and commission art, realistically 12+ months and an art budget. **[My
opinion:] take (A) now and keep (B) as the sequel.**~~

### What the actual strategic question is

Not *narrow vs wide*. You are already narrow by design, and the deferral lines in your own repo
show that was deliberate. The real question is about **sequencing two roadmap items against one
credibility budget**:

> **Do you launch on authority alone, or hold until memory is integrated?**

That is the only genuine tension in this file, because authority is finished and provable today
while memory is built-but-unwired (Memory-Keeper is real and tested; file 05 M-1 is the missing
integration), and generated art is planned-but-absent.

**[My opinion:] launch on authority, name memory as *integrating*, and name art as *coming*.**
Authority is the differentiator no competitor can copy without rebuilding their architecture, and
it is the one you can film today (§3.1). The trap to avoid is the opposite of the one turn 1
warned about: not "shipping too narrow," but **letting a technical audience discover that a claimed
capability is one integration away from working.** State the sequence publicly and you convert a
weakness into a roadmap; imply all three are live and you hand a sceptic the correction that
defines you.

**What this changes about the positioning, concretely:**

- **Drop the pillar language from every external surface.** Three-pillar framing invites a scorecard
  where you are one-for-three. You are not building three things.
- **Do not disclaim tactics.** Not in a FAQ, not in a "what we're not" section. Silence is the
  correct treatment for a non-goal; disclaiming it plants the expectation.
- **Art is presentation, not a pillar.** Framed as a pillar it looks like a missing third of the
  product. Framed as presentation for a working engine, generated scene art is a polish beat that
  makes the existing loop legible — and it is the honest description.
- **The differentiator stack, in the order it should be marketed:** authority (shipped, provable,
  unmatched) → memory catch-and-correct (built upstream, integrating) → generated art (roadmap,
  dated). Each beat lands on its own; none depends on a tactics layer.

Per file 04 §4.4, novelty without depth collapses — but your depth is the referee and the memory
service, not a battle system. Selling those two, in the right tense, is the whole strategy.

---

*Next: [10 — Other feedback](10-other-feedback.md)*
