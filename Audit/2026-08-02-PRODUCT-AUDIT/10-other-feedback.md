# 10 — Other Feedback

*"Any other feedback for me?"*

This file is the things that did not fit the other categories: questions I need answered,
process observations, and a few opinions about how this project is being built rather than
what it contains.

---

## What this means (read this first)

Five things, in order of how much I think they matter:

1. **One question needs your answer before the roadmap can be trusted** — what you mean by
   "the DM model" of Isekai Zero, because the public record does not support that it has one.
2. **You have an undo problem that undermines your core promise**, and it is a product
   decision nobody has made yet.
3. **Your engineering process is genuinely good.** I say that having read the plans, the
   worklog, the test discipline and the commit trail. The problem is not quality — it is that
   *planning is outrunning landing*, and the repo cannot tell a design from a shipped feature.
4. **You are flying blind on the metrics that define your product.** 792 tests, none of which
   touch a real model, and 21 lines of telemetry.
5. **Something in this project reads as fear of finishing.** Seven design generations, three
   audits, four planning documents for one subsystem — and one of three stated pillars with no
   code at all. That is worth sitting with.

---

## 1. ✅ ANSWERED: what "the DM model" is — Isekai Zero's **Dungeon Mind**

> **Revision 2026-08-02 (turn 2).** Owner clarification 1 answered this, and the answer is
> **reading (b): there is a documented DM feature my competitive analysis missed.** I searched the
> marketing site, App Store and Play listings and third-party coverage, and concluded there was no
> dice/stats/gate feature. **I was wrong** — it is documented, just not in the places I looked:
> `docs.isekaizero.ai`, in both the player guide and the creator guide. File 04 §2.2 has been
> corrected. This is the single largest factual error in the original audit and it is mine.

**What Dungeon Mind actually is.** A **referee that runs beside the storyteller** — Isekai Zero's
own words: *"the referee sitting next to the storyteller,"* and the division of labour is explicit:
***"The story AI writes what happens. The DM decides whether your action actually worked."***

So Isekai Zero is a **two-model architecture**, and that — not art or voice — is the thing worth
copying:

| Dungeon Mind owns | Detail |
| --- | --- |
| **Dice** | `roll_d20`; advantage/disadvantage = 2 dice keep higher/lower; nat 20 / nat 1 with gold/red glows; rolls are **server-side and cannot be manipulated** |
| **Stats — exclusively** | *"The DM is the only thing that changes stats."* *"Players CANNOT edit their own stats."* Creator-authored schema, 5-15 stats ideal; the DM's tools are generated from it |
| **Sheet, skills, inventory** | HP bar, `Alive` flag, `Condition` with turn counters; `set_skills`, `set_inventory` (quantity, equipped); on use *"the DM will verify you have it and apply the effect"* |
| **Levelling, healing, death** | XP thresholds → DM prompts for stat increases; rests/potions/class-locked heals; creator-defined death permanence |
| **Two control levers** | **`reject_action`** — blocks before any roll, **with a stated reason** shown to the player. **`ask_player`** — pauses the story pending input (which stat to raise, which loot to take) |

**How it is authored:** a **Game Rules** prompt (≤10,000 tokens, *"the heart of your DM
configuration"*) plus a **Game Rule Reminder** (≤500 tokens) that is *"appended at the very end of
the DM's prompt — the last thing it reads before making decisions,"* because *"LLMs pay the most
attention to what comes last."* That last trick is free and worth stealing today.

**The three things this changes for you:**

1. **Your instinct was right and you are further ahead than the audit said.** Your engine already
   does the hard part — exclusive state ownership, gates before dice, a narrator that cannot
   overturn a result. On the referee half you are **at or ahead of** the product you are copying.
2. **The gap is the *other* model.** Isekai Zero splits narrator and adjudicator into two named
   components with separate duties. Your audit (and your repo) treat "the DM" as one thing. The
   storyteller half — pacing, beats, complications, **endings** — has never been named or
   resourced as its own component. That is the real finding, and it replaces the vaguer version
   in file 06 D-5.
3. **Their authority philosophy is looser than yours might become.** *"Resolve actions with
   consequences, don't prevent player choices."* Creators are told to instruct the DM to
   ***"NEVER reject combat actions — resolve with dice and apply consequences,"*** and to let
   players *"make bad decisions and face the results."* Rejection is reserved for rule violations.
   If you tighten your DM, tighten it toward *consequence*, not *refusal*.

**Retired:** the "which of three readings is it?" table above is resolved (it was (b)). The
follow-on paragraph about turn-based combat and animations as unshipped pillars is also retired —
per clarification 2 they were never pillars. See §9 below for the full recommendation on combat.

---

## 2. Your authority is undermined by your own undo buttons

This is the sharpest strategic observation in the audit and it comes from the Banner Saga
research (file 04 §3.5, file 06 §6).

**Verified:** Stoic shipped Banner Saga with **no manual save and no reloading after a
defeat.** The stated design insight is that consequence feels real *only because the game
refuses to let you undo it.*

Midnight Tavern ships: swipe/variant regeneration, message delete, story rewind, and per-turn
checkpoints. All well-engineered — the prior audit specifically praises the atomicity of the
delete/rewind path — and **all undo paths.**

**A DM whose rulings can be re-rolled by pressing a button is not an authority; it is a
suggestion.** If a player can swipe until the narrator writes the outcome they wanted, the
deterministic engine becomes cosmetic — and worse, *the player knows it*, so the core promise
stops being believable from the inside.

I am not telling you to delete these features. They are genuinely useful when the prose is
bad. But right now this is an accident of feature accretion rather than a decision.

**My recommendation: separate "I didn't like the writing" from "I didn't like the outcome."**
Let prose regeneration keep the committed ruling **immutable** — same dice, same result, new
words. That preserves the escape hatch players need without letting them shop for outcomes.
Optionally add an Ironman mode, and surface rerolls in the Mechanical Journal so the record
stays honest. (File 11, plan #9.)

---

## 3. Your process is good. Say that out loud, then fix the one thing that isn't.

I read the plans, the worklog, the audits, and the commit trail. Some specifics that are
genuinely above average:

- **RED→GREEN evidence is recorded per task.** The combat remediation plan logs, for each
  task, the failure observed, what changed, the exact test count, and the next step.
- **A wrong hypothesis was recorded and warned against.** `live-combat-remediation.md:30–34`
  documents a root cause that was investigated, found false, and explicitly flagged **"do NOT
  chase this."** I have rarely seen a team do that. It saved me time during this audit.
- **Supersession is handled cleanly.** `HANDOFF-V7:46–96` enumerates exactly which V6
  decisions V7 overrides, rather than leaving two documents to silently disagree.
- **The forensic diagnosis in the NPC redesign plan is excellent** — it traces failures from a
  real save to eight named subsystems and one root cause, without hand-waving.
- **792 tests, zero failing, zero skipped**, with a repository boundary and type discipline
  that held up under scrutiny.
- **Honesty in the product itself:** `ForgingInterstitial` has no fake progress bar
  (file 08 §1.2). That is a values decision showing up in code.

**The one process problem: planning is outrunning landing.**

Simultaneously open: the v2 memory system (0% built), the NPC scene redesign (0% built), V7
design (partially built, no task plan), and combat (not designed). That is more accepted
design than a small team can land, and it creates a permanent gap between what the documents
describe and what runs.

**And nothing in the repo marks the difference.** `Plan/v2-memory-system.md:3` does it right —
*"**Status:** plan (not yet implemented)"* — which proves you know the pattern. It just is not
applied to V7, to the redesign plan, or to the README (which still claims 393 tests against an
actual 792).

**Cheapest high-value fix in this whole audit:** a `Status:` line on every plan and design
document. `SHIPPED` / `PARTIAL — see X` / `PLAN — not implemented`. Ten minutes of work that
prevents you, a future collaborator, or an AI agent from building on a foundation that does
not exist. (File 11, plan #12.)

---

## 4. You are flying blind on exactly the metrics that define your product

`packages/core/src/observability/` is **21 lines, one file.**

Your 792 tests are a strong regression net for the deterministic engine and a **near-total
blind spot for the narrative engine** — nothing in them exercises a real LLM provider. So the
entire region where your product's promise is kept or broken is both untested and
uninstrumented.

None of these is currently counted:

- How often the authority guard **rejects** the narrator's draft
- How often `safeSummary` **replaces** real prose (i.e. how often the story visibly breaks)
- How often the classifier fails and recovers
- How often a gate **denies** an action — *your headline feature, unmeasured*
- How often provider retries fire
- How long a story runs before the player abandons it

**Every one of those is a direct measure of whether the product works.** For a local-first
app this must be local-only and opt-in — a developer diagnostics panel, not analytics. But you
are currently unable to answer "is the DM firing too often or not enough?" with anything but
vibes. (File 11, plan #11.)

**Related:** you are the product owner *and* the only tester (per the project's own working
notes). One person's play sessions cannot cover the space where these failures live. The
telemetry panel would multiply the value of every hour you spend playing.

---

## 5. On being a non-engineer owner with AI engineering

Observations, offered as feedback on the *arrangement* rather than the code.

**What is working:** the documentation discipline is unusually strong precisely *because* the
work is handed between agents — the handoffs, worklogs and plans exist because they must.
Most human teams do not document this well. That is a genuine advantage of your setup.

**Three risks I would watch:**

1. **AI agents treat documents as ground truth.** An agent that reads
   `HANDOFF-V7-DESIGN-INSTRUCTIONS.md` will reasonably assume it describes the app and build
   accordingly. This is why the `Status:` line (§3) is not bureaucracy — **it is a correctness
   mechanism in a workflow where documents are inputs to code generation.**

2. **The prototype sprawl is agent-hostile.** Seven generations of `Design/handoff*` produce
   ~800 near-duplicate nodes in the code index, outweighing the real UI package (file 07,
   W-8). **I hit this myself during this audit** — searches kept landing in dead prototypes.
   Every agent you run pays that tax. Archiving V1–V5 is a small change that makes every
   future AI session cheaper and more accurate.

3. **Point-patching accumulates where nobody can see it.** The commits before the redesign
   plan (`c6abef6`, `32a7ac2`, `bd4f99d`) each fixed one symptom in one subsystem's private
   heuristic. Each was a correct, well-tested change. Together they built the eight-model mess
   the redesign plan now has to unwind. **An agent asked to "fix this bug" will fix that bug;
   it will not tell you the abstraction is wrong unless you ask.** Periodically asking "is
   this the fifth patch to the same area?" is a question only you can ask, and the answer is a
   signal to redesign rather than patch.

**One suggestion on the arrangement itself:** you are non-technical by your own account, but
the most valuable thing in this audit for you is probably §2 (the undo question) and §1 (the
DM question) — both **product** decisions that no engineer or agent can make for you. Consider
making a short written list of decisions that are *yours alone*, so agents stop implicitly
deciding them by default. Right now, "can the player reroll a ruling?" was decided by whoever
implemented swipe.

---

## 6. Something in this project reads as fear of finishing

**[This is an opinion. Take it or leave it.]**

Count what exists: seven design handoff generations. Three audits (including this one). Four
planning documents covering one memory subsystem. A 1,572-line worklog. Two prior status
audits whose framing has already been overtaken.

Now count what does not: no combat code. No art. No onboarding. Two accepted critical plans at
0%.

**The pattern is a lot of preparing and re-describing, and less shipping of the hard visible
parts.** Design and planning are the comfortable work — they always feel productive and they
never fail. Combat and art are the uncomfortable work: they are large, they can be judged, and
they can be bad.

I do not think this is laziness — the engine is proof of serious sustained effort, and the
quality bar in the code is high. I think it may be **perfectionism in a place where it is
safe**, which is a very common failure mode for a solo owner with a strong architectural
instinct.

The concrete suggestion: **the next thing you ship should be visible to a player.** Not the
v2 memory port, not the turn.ts decomposition — something a stranger could see in a
screenshot. File 08 §5 lists eight of them, all small. Ship those before the next design
document is written.

---

## 7. Smaller things

**7.1 The `light` stat mode was correctly killed but its ghost remains.** V5 collapsed to two
modes (`none` / `full`) with legacy `light` stories loaded as Full Stats behind a migration
marker. Good decision, handled properly. But `statMode` checks still branch three ways in
places (`context.ts:498` reads `=== "full"`, implicitly grouping `none` and `light`). Worth a
sweep to make the two-mode reality explicit in the types.

**7.2 The 12-character composer minimum is a small betrayal of your own model.** `Play.tsx:808–811`
rejects short turns as "vague." "Run." is four characters and a perfectly good action. The
check measures length and reports a judgement about quality, and it fires *before* the engine —
the only thing entitled to judge. It will irritate precisely the terse, tactical players you
want. (File 08, U-12.)

**7.3 `validateStorySchema` is unowned and it sits on the first-run path.** Cognitive
complexity 153 — the worst function in the codebase, worse than `runTurnOperation` on every
axis — and no plan mentions it. Its failure mode is "story creation mysteriously fails," which
is the most expensive failure a product can have. (File 07, W-5.)

**7.4 There is prompt-injection-shaped text inside your repo right now.** A prior agent's
output was mangled while appending to a shared journal file, leaving a fragment of tool-call
syntax in file data. **Almost certainly an accident, not an attack** — I checked, and I am not
going to dress it up as an intrusion. But it is a live demonstration of the risk class in a
workflow where agents read your repo, and the fix (per-step files instead of one shared
journal) is what this audit's own bookkeeping used. (File 07, W-9.)

**7.5 Your founding document contains your best marketing copy.**
`Plan/high-level-plan.md:36`: *"The model can narrate getting a sword; only the program can
make it true."* That is better than anything I wrote in file 09. Use it.

---

## 8. The three things I would do first

If I could only get three things across from this whole audit:

1. **Wire the observations into the prompt** (file 05, M-1). It is small, and it is the
   difference between "memory is decorative" and "memory works." Everything you want to claim
   about drift depends on it.
2. ~~**Answer the DM question** (§1) and write down which pillars are shipped, designed, or
   wished.~~ ✅ **DONE 2026-08-02** — DM = Isekai Zero's **Dungeon Mind**, a referee running beside
   the storyteller (§1). Replacement priority: **name and resource the *storyteller* half** —
   pacing, beats, complications and endings — as a component distinct from the referee. That is
   the gap the answer exposed.
3. **Ship something a player can see** (file 08 §5). Eight small UI fixes, days of work, and
   the product would go from "chat app with a stats panel" to "a game with a visible referee."

And the thing to *stop* doing: **writing new design documents until two of the existing ones
have landed.**

---

## 9. Should you adopt a Banner Saga-style turn-based battle system?

> **Added 2026-08-02 (turn 2)** in answer to the owner's direct question: *"should we take the
> banner saga battle system to our app in your opinion? Would that make a huge difference and make
> ours a better product?"*

### No. Don't build it. It would make the product worse, not better.

Not "not yet," not "after the roadmap" — I think a tactics layer is the wrong shape for this
product, and I'd argue against it even with unlimited engineering budget. Five reasons, strongest
first.

**1. The product you are copying deliberately doesn't have one.** Isekai Zero's Dungeon Mind — the
model you named as the inspiration — has **no grid, no map, no positioning, no initiative order and
no action economy.** Its entire randomiser is one `roll_d20` at *"one roll per character per
action."* Combat is resolved as prose plus a roll bar; the story text deliberately never mentions
numbers. The reference product solved narrative combat by making it *lighter*, not heavier. Adopting
Banner Saga tactics would move you **away** from the thing you're benchmarking against.

**2. It competes with your own core loop for the same minutes.** Your loop is: type an intent → the
DM adjudicates → the world answers in prose. A tactics layer replaces that with: select unit → move
on grid → choose ability → watch animation. Both are "the game," and the player only has so much
attention. Every turn spent in a tactics UI is a turn *not* spent in the free-text loop that is your
only real differentiator. Banner Saga could afford that split because its combat *was* the game and
the narrative was the connective tissue. For you it's inverted.

**3. It attacks a problem you don't have, and ignores the one you do.** Your two stated enemies are
memory drift and DM authority. A tactics layer helps with **neither**. Worse, it *multiplies* the
drift surface: positions, formations, cooldowns, statuses and turn order are all new state that must
stay consistent with prose — and file 05 shows you can't yet keep *facts* consistent with prose
(M-1: the narrator is never shown the 200 observations you diligently record). Building tactics
before fixing M-1 is adding rooms to a house with no roof.

**4. The cost is far larger than it looks, and it's mostly art.** Banner Saga's combat reads as good
because of animation: per-unit idle/attack/hit/death frames, hand-painted at Stoic's standard. You
have **zero image assets** in the repo today (file 08, U-3). A credible tactics layer is a combat
resolver *plus* a grid renderer *plus* an animation pipeline *plus* an art budget — realistically
several quarters and a hire, against a product that hasn't yet shipped the eight small UI fixes in
file 08 §5 that would make the *existing* game visible.

**5. Your own repo already reached this conclusion, twice, before I did.**
`Plan/competitive-adoptions.md:706` rejects *"status effects, elemental reactions, initiative,
turn-order combat"* as a v2 subsystem and says **"advantage/disadvantage delivers most of the
tactical texture at a fraction of the cost."** `README.md:277` files a combat subsystem under
"Later." That judgement was right. Trust it.

### What to do instead — the 5% that buys 80% of the feeling

The real itch behind the question is legitimate: **fights are currently flat.** One d20, a flat −4,
and it's over. That's a *narrative texture* problem, not an architecture problem, and it's cheap:

1. **Advantage/disadvantage** — two dice, keep higher/lower. Isekai Zero has exactly this and
   nothing more. Your repo already identified it as the high-value cheap win. Days, not quarters.
2. **Conditions with durations** — `Poisoned (3t)`, decrementing per turn. Isekai Zero implements
   "turn-like structure" purely this way, with no turn engine underneath.
3. **Meaningful damage numbers** — the `2026-08-01-live-combat-remediation` plan already found the
   real bug here (~100 HP vs 4 damage per hit ≈ 25 hits to kill). Fixing the maths will do more for
   how a fight *feels* than a grid ever would.
4. **Consequence, not choreography** — injuries that persist, NPCs that remember being fought,
   deaths that stick. This is where your memory system is a weapon no tactics game has.

That list is roughly one sprint and it addresses the actual complaint. A tactics layer is multiple
quarters and addresses a complaint nobody made.

### The honest counter-argument

There is one scenario where I'd change my answer: if you decide the product is a **tactics game with
an LLM narrator** rather than a narrative engine with dice. That's a real and viable product — but
it's a different company, competing with Banner Saga and Darkest Dungeon on art and balance rather
than with SillyTavern on memory and authority. You'd be trading a defensible moat (deterministic
state authority + drift resistance, which is genuinely hard and genuinely rare) for a crowded market
where your current strengths count for very little. I don't think that trade is good, and nothing in
the repo suggests it's the game you actually want to make.

### Bottom line

Banner Saga is worth studying for **narrative** craft — irreversible consequence, a world clock that
moves without you, endings that cost something. File 04 §3 and file 06 already mine it for exactly
that, and those references are staying. Copy its *storytelling*. Don't copy its battle grid.

---

*Next: [11 — Implementation plans](11-implementation-plans.md)*
