> **DECOMMISSIONED 2026-08-12 - reference only, not a task list.**
> Every plan written before 2026-08-12 is retired by owner decision. Plan 13 was **executed** and
> shipped in v0.2.9; its **deferred queue (Plans 21 / 19 / 20 / 18 / 23 / 10B) is cancelled**, not
> deferred. The diagnosis chapters in this folder remain useful reference; their priority ordering
> and work items do not. See [`docs/PLAN-POLICY.md`](../../docs/PLAN-POLICY.md).

# Midnight Tavern — Product Audit

**Date:** 2 August 2026 · **Commit audited:** `e1e0d86` (working tree clean)
**Test baseline measured:** 792 passing, 0 failing (632 core, 160 UI)
**Revised 2 August 2026 (turn 2)** after five owner clarifications — see below.

---

## Revision notice — read before the findings

This audit was first written from a brief that named *"animations, turn-based combat, and
interactive LLM story"* as the product's three pillars. **Two of those three were never yours.**
The owner has since clarified five things, and every file has been revised in place. Corrections
are struck through rather than deleted so the change stays auditable.

| # | Clarification | What it changed |
| --- | --- | --- |
| **1** | **"DM" = Isekai Zero's *Dungeon Mind*** — a referee, not a storyteller. Docs: [player guide](https://docs.isekaizero.ai/books/your-guide-to-isekai-zero/page/dungeon-mind-dm), [creator guide](https://docs.isekaizero.ai/books/creators-guides/page/dungeon-mind-dm) | The audit's single largest factual error, and it was mine. Turn 1 said Isekai Zero had no DM model; it has a fully documented one. **[06](06-gap-analysis-dm-authority.md) D-5 was inverted** — a referee is the *intended* thing, so behaving like one is conformance, not a defect. [10](10-other-feedback.md) §1 and [04](04-competitive-research.md) §2.2 corrected |
| **2** | **Turn-based combat and Banner Saga animation were never planned** | Verified: **zero** hits for `banner saga`, `turn.based`, `tactics`, `battle system` anywhere in the repo outside `Audit/`. No agent inserted them. The "three pillars" framing was the contamination, and it came from the turn-1 brief. **Retired everywhere.** [07](07-misguided-implementations.md) W-2 withdrawn: critical → not a defect |
| **3** | **The real roadmap item is player-selectable image generation** — provider + model chosen in settings, images during story when enabled; a *future* plan | Also verified: recorded **nowhere** in the repo (zero hits for `image.?gen`, `text.?to.?image`, `stable diffusion`, `sdxl`, `dall`, `imagen` outside `Audit/`). Now [11](11-implementation-plans.md) Plan 10B, replacing the withdrawn combat plan |
| **4** | **Memory-Keeper is the father of the drift-protection work, and is largely built** | Audited directly at `Memory-Keeper` `main` @ `547c9b6`: **`105 passed, 5 skipped in 13.95s`** observed. Verdict is split — the *memory* layer is real and substantially complete, but **nothing in it prevents drift**; it detects after the fact and asks the model nicely next turn. Full audit now in **[12](12-memory-keeper-audit.md)**; also [05](05-gap-analysis-memory-drift.md) M-12 and [02](02-codebase-map.md) §1.1 |
| **5** | **The owner archived the old handoff files** | `3566c25` "archived old designs to prevent bloat". Turn 1's "who deleted 189 files?" question is retired. [02](02-codebase-map.md) map-hazard note resolved; [11](11-implementation-plans.md) Plan 24 marked done-by-owner |

**And the direct question the owner asked — *should we adopt the Banner Saga battle system?* —
is answered in full at [10](10-other-feedback.md) §9. Short version: no. Build the 5% of it that
carries the feeling, not the battle grid.**

---

## Read this in five minutes

### What this project is

Midnight Tavern is an AI roleplay game with **a referee the AI cannot argue with**. You play
a story narrated by a language model, but dice, skills, items and health are owned by the
program — not the model. The model writes the prose; the program decides what is true.

It exists to fix two things that break every AI roleplay app: **(a)** the AI forgetting your
story, and **(b)** the AI letting you win because you asked nicely.

### The one-paragraph verdict

**The engine is genuinely excellent and does something no competitor does.** A player cannot
claim a skill they have not learned or an item they do not hold — that is enforced in code
before any dice are rolled, and the narrator is structurally prevented from overturning it.
That half of the product is finished and category-leading. **But the narrative half is not
wired up.** The system records rich memory about every character, shows it to the player in
a beautiful dossier screen — and never shows a single line of it to the AI that writes your
story. And the half of the job that Isekai Zero splits into a second model — the **storyteller**
that owns pacing, scenes and endings — has never been named or resourced as a component here.
Your referee is excellent; your narrator is unowned.

**The good news is how cheap the top of the list is.** The single biggest defect is a wiring
gap of roughly a day's work.

### The five findings that matter most

| # | Finding | Where |
| --- | --- | --- |
| **1** | **The AI never sees the memory you collect.** Up to 200 observations per character are recorded, displayed in the dossier, and never placed in the narrator's prompt. It is write-only memory | [05](05-gap-analysis-memory-drift.md) M-1 |
| **2** | **"No Stats" mode has no memory at all** — an 8-message window, no summaries. That is the mode a SillyTavern user tries first, and in it you are *worse* than SillyTavern | [05](05-gap-analysis-memory-drift.md) M-2 |
| **3** | **The engine manufactures violence.** Any *opposed* check counts as an attack, so losing a staring contest can get you punched — authoritatively, with committed damage | [06](06-gap-analysis-dm-authority.md) D-1 |
| **4** | **NPCs all behave identically.** Retaliation picks the first combat action in catalog order, ignoring disposition and relationship — data the engine already owns | [06](06-gap-analysis-dm-authority.md) D-2 |
| **5** | **The storyteller half is unowned.** Isekai Zero runs two models — Dungeon Mind referees, a story AI narrates. You built the referee, and built it well. Nothing in the product owns narrative beats, pacing or endings | [06](06-gap-analysis-dm-authority.md) D-5 |

Plus one security issue to fix before any public release: the card importer fetches **any**
user-supplied URL with no restrictions, making the app a LAN and loopback probe via a shared
card link ([07](07-misguided-implementations.md) W-3).

### What is genuinely well built — this is not a bad codebase

- **The hard/soft wall is real.** `types/softState.ts` defines a closed set of memory
  operations with *no verb* that can touch health, skills, or items. Not "validated" —
  unrepresentable. `engine/ledger.ts:69` is the sole writer of game state.
- **The gate refuses before the dice.** `engine/gate.ts` runs seven checks in order, and a
  denied action never rolls.
- **The authority clause is composed last, structurally.** No imported character card can
  position instructions after it — a real security property, not a comment.
- **The Ruling artifact is the best-executed part of the product.** A denial renders with *no
  die at all*, its own colour, and plain English: *"No roll, cost, XP, loot, equipment change,
  or mechanical consequence."*
- **792 tests, all green**, with genuine RED→GREEN evidence recorded per task.

### The three things to do first

1. **Wire observations into the narrator prompt** ([11](11-implementation-plans.md), Plan 1 —
   hours, not weeks). It is the difference between memory that is decorative and memory that
   works.
2. ~~**Answer one question:** what do you mean by Isekai Zero's *"DM model"*?~~ ✅ **Answered
   (turn 2): it is *Dungeon Mind*, and it is fully documented.** The follow-up work is now
   concrete rather than a question: **resource the storyteller half** — the second model in
   Isekai Zero's split — and audit your referee against theirs on the two conformance points you
   have not verified (a `reject_action` reason surfaced to the player, and an `ask_player` pause).
   ([06](06-gap-analysis-dm-authority.md) D-5, [10](10-other-feedback.md) §1)
3. **Ship the eight small UI fixes** ([08](08-ui-ux-gaps.md) §5). Days of work, and the
   product goes from "a chat app with a stats panel" to "a game with a visible referee."

### The one strategic decision

> **Rewritten (turn 2).** This section previously read "your three pillars are animation +
> turn-based combat + LLM narrative — you have one of three." That framing came from the turn-1
> brief, not from you, and it was wrong. It is retired.

The real decision is narrower and much more favourable: **you are one wiring job away from
being able to prove your central claim, and the thing standing between you and a finished
product is not a 12-month art bet — it is the storyteller half of the DM.**

**Do this:** narrow the pitch to *"the AI roleplay game with a referee the model cannot argue
with"*, fix M-1 so memory actually reaches the narrator, then resource the storyteller as a
named component. That is months, not years, and it needs no artists.

**Do not** build a Banner Saga battle system. The full reasoning is in
[10](10-other-feedback.md) §9; the decisive fact is that **Isekai Zero — the product you cite as
your model — deliberately has no grid, no initiative and no action economy either.** Building
one would diverge from your own benchmark. Image generation ([11](11-implementation-plans.md)
Plan 10B) is the far cheaper way to buy visual identity, and it is already what you want.
([09](09-go-to-market.md) §9)

### The market position, in one line

Every competitor researched — SillyTavern, Isekai Zero, Character.AI, AI Dungeon, Hidden Door
— **asks a model to be fair. You make fairness structural.** No evidence was found of any
competitor computing outcomes in code the model cannot override. That is your entire
position, it is real, and it is narrow enough that you must *demonstrate* it rather than
claim it.

---

## The files

| File | What it covers |
| --- | --- |
| **[01 — What this project actually is](01-what-this-project-actually-is.md)** | The real purpose, restated crisply; the five decisions that are genuinely well made |
| **[02 — Codebase map](02-codebase-map.md)** | Module-by-module architecture with `file:line` citations; complexity hotspots; test baseline |
| **[03 — Design and plan review](03-design-and-plan-review.md)** | Twelve planning documents scored against source. Two critical plans at 0% |
| **[04 — Competitive research](04-competitive-research.md)** | SillyTavern, Isekai Zero / Dungeon Mind, Banner Saga, Hidden Door and the wider category; the games worth stealing from (Wildermyth, Disco Elysium, Citizen Sleeper, Roadwarden, NovelAI); a one-page map of where you sit and a positioning table. 120 sources |
| **[05 — Gap analysis: memory drift](05-gap-analysis-memory-drift.md)** | Goal (a). Eleven findings, M-1…M-11 |
| **[06 — Gap analysis: DM authority](06-gap-analysis-dm-authority.md)** | Goal (b). Seven findings, D-1…D-7, plus the undo question |
| **[07 — Misguided implementations](07-misguided-implementations.md)** | Eleven findings, W-1…W-11 — and a section on what is *not* wrong |
| **[08 — UI/UX gaps](08-ui-ux-gaps.md)** | Fourteen findings, U-1…U-14, and the cheapest path to a better product |
| **[09 — Go to market](09-go-to-market.md)** | Positioning, proof strategy, audiences, channels, pricing, sequencing |
| **[10 — Other feedback](10-other-feedback.md)** | The open questions, process observations, and the hard things |
| **[11 — Implementation plans](11-implementation-plans.md)** | 24 numbered plans with files, steps, tests and effort, in four sprints |
| **[12 — Memory-Keeper audit](12-memory-keeper-audit.md)** | The parent project, audited directly: what it proved, what it can never do, and the five techniques worth porting. `105 passed, 5 skipped` verified |

---

## Vocabulary lock: "same-turn combat" ≠ "turn-based combat"

These two phrases look alike and mean opposite things. Confusing them is what made
clarification 2 necessary, so the audit fixes the terms here and uses them
consistently throughout.

| Term | Meaning in this project | Status |
| --- | --- | --- |
| **same-turn combat** | A "turn" is *one player message and its resolution*. Same-turn combat means the NPC answers **within the same exchange** instead of one exchange later. It is a latency/responsiveness property of the chat loop. | **Shipped.** Fixed by the owner-originated `docs/superpowers/plans/2026-08-01-live-combat-remediation.md` and Task 15B |
| **turn-based combat** | The Banner Saga sense: a *tactical mode* — grid, unit positioning, initiative order, alternating activations, action points, unit animation. | **Never built, never planned, twice deliberately deferred** (`Plan/competitive-adoptions.md:706`, `README.md:277`) |

**Why this matters:** the 2026-08-01 live-combat work is legitimate, owner-requested
bug-fixing of the *first* kind. It must not be confused with, or trimmed alongside,
the *second* kind that was never on the roadmap.

---

## How to read the findings

**Every finding carries an ID, a severity, and a citation.** IDs are stable and
cross-referenced between files.

| Prefix | Domain | File |
| --- | --- | --- |
| `M-n` | Memory drift | 05 |
| `D-n` | DM authority | 06 |
| `W-n` | Misguided implementation | 07 |
| `U-n` | UI/UX | 08 |

**Severity:** 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low — ranked by *user-visible impact*,
not engineering interest.

**Verified vs Inferred.** Claims about code were checked in source and carry a `file:line`.
Claims about competitors carry a URL. Where I reasoned rather than verified, it says so —
and where I found no evidence, it says that too rather than filling the gap with plausible
text.

**Two corrections I made to my own work**, kept visible rather than quietly deleted:
- I flagged a `core → ui` dependency as an architectural smell. **It was a name collision in
  the call graph** — core imports nothing from ui, the layering is clean ([02](02-codebase-map.md) §4).
- My early notes said NPC reactions could replay unboundedly. **The August 2026 combat
  remediation fixed that**, and I credited it rather than repeating the stale claim
  ([06](06-gap-analysis-dm-authority.md) §2).

---

## Scoreboard against your stated goals

| Your goal | Status |
| --- | --- |
| Fight memory drift — **mechanical** (items, skills, stats, HP) | ✅ **Solved, structurally.** Best in the category |
| Fight memory drift — **narrative** (story, characters, relationships) | ❌ **Largely unsolved.** The plan exists; 0% built |
| DM authority — **"what the player can and cannot do"** | ✅ **Solved.** `engine/gate.ts` — nobody else does this |
| DM authority — **skills, levelling, items** | ✅ **Solved.** `engine/ledger.ts` is the sole writer |
| DM authority — **NPCs behaving as themselves** | ❌ **Not working.** Catalog-order attacks, disposition ignored |
| DM authority — **running the story** (pacing, scenes, endings) | ❌ **Not built.** It referees rules; it does not run a story |
| ~~Turn-based combat~~ | ⬜ **Not a goal** — never planned; absence is scope discipline (turn 2) |
| ~~Banner Saga-style animation~~ | ⬜ **Not a goal** — never planned (turn 2) |
| Player-selectable image generation (**future plan**) | ⬜ **Unrecorded.** Zero references anywhere in the repo — the roadmap item exists only in your head. [11](11-implementation-plans.md) Plan 10B |
| Drift detection upstream (Memory-Keeper) | ✅ **Built and tested** (105 passing) — but it *detects*, it does not *prevent*, and this app does not call it |
| SillyTavern card compatibility | ✅ **V2 + V3 import working** |
| Local-first, no metered memory | ✅ **Shipped, and a real competitive advantage** |

**Five of ten scored goals delivered — and once the two non-goals are set aside, that is five
of eight real goals, including the four hardest.** The engine problem, the one most teams cannot
solve, is behind you. What remains is wiring, behaviour and presentation; the first of those is
a day's work.

*(Turn-2 correction: the previous tally read "four of ten" and counted two things you never set
out to build as failures. Scoring a non-goal as a miss made the product look further from done
than it is.)*

---

*Audit performed by reading source at `e1e0d86`, running the test suite, and researching
competitors from primary sources. Every code claim is citable; every competitor claim carries
a URL.*
