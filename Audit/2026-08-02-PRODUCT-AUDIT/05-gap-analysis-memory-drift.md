# 05 — Gap Analysis: Memory Drift (goal a)

**Goal (a) as stated:** *"fight memory drift in general — story, characters, relationships,
inventory, skills, attributes, etc."*

---

## What this means (read this first)

Memory drift is when the AI forgets or contradicts what already happened. Your goal splits
cleanly in two, and the project's scores are very different on each half:

| Half of the problem | Example | Status |
| --- | --- | --- |
| **Mechanical drift** — numbers, items, skills, HP | *"You still have the sword"* when you sold it | ✅ **SOLVED.** Structurally, not by prompting |
| **Narrative drift** — facts, promises, relationships, world | *"The cellar door is locked"* forgotten 30 turns later | ❌ **LARGELY UNSOLVED** |

The mechanical half is genuinely, architecturally solved and better than anything in the
competitive set. The narrative half is where the product currently lives up to roughly a
third of its promise.

**The single most important finding in this entire audit is in §3.1 below:** the system
diligently records up to 200 observations per character every turn — and then **never shows
a single one of them to the AI that writes your story.** The richest memory the product
collects is write-only. It appears in the UI dossier and nowhere else.

That is not a design flaw in the memory model. It is a *wiring* gap, and it is the cheapest
high-impact fix in this report.

---

## 1. What is genuinely solved — mechanical drift

I want to be precise about this because it is the project's real achievement and it should
not get lost among the criticism.

**Verified by reading the full file:** `packages/core/src/types/softState.ts:128–175`
defines `SoftStatePatchSchema` as a `.strict()` closed discriminated union. The complete
list of operations the AI's memory-analyzer may emit is:

- `set` — mood / location / goal / appearance / speechStyle
- `append` — traits / likes / dislikes
- `observe` — free-text observation
- `adjust_relationship` — trust/power deltas
- world ops: `set_overview_hint`, `add_location`, `add_thread`, `resolve_thread`

**There is no operation in that union that can name a resource, a skill, an item, or a hit
point.** Not "one that is validated" — one that does not exist. Even a maliciously crafted
model response cannot reach hard state through this channel, because there is no verb for
it.

Hard state has exactly one writer: `commit()` at `packages/core/src/engine/ledger.ts:69`,
documented as transactional at the call site (`ledger.ts:60–68`), and reached only after
`checkGate()` (`engine/gate.ts:1–16`) has permitted the action and the resolver has rolled.

**Consequence, stated plainly:** the class of failure that dominates the competition —
Multihog's *"the AI forgetting your inventory/spells"*, AI Dungeon's *"a frozen vampire
would attack anyway"*, Isekai Zero's *"metagaming and continuity breakage"* — **cannot
happen here for mechanical facts.** Your HP is what the ledger says. Your inventory is what
the ledger says. No amount of narrator hallucination changes it.

That is a real, defensible, category-leading achievement. **Severity of remaining
mechanical-drift risk: none identified.**

---

## 2. The team already diagnosed the rest — and was right

Before I list the gaps, credit where due: `Plan/v2-memory-system.md:9` states the problem
independently and accurately:

> *"v1 memory **remembers** but does three things minimally: it retrieves nothing
> semantically (recall is 'latest arc + recent chapters + present-character slices'), it
> stores narrative facts only as free-text observations (no structure, no dedup, no
> conflict resolution), and it does not **police** consistency (the model can drift and
> nothing notices)."*

I found the same three gaps by reading the code, independently. **The team's diagnosis is
correct.** What follows adds severity ranking, source citations, and **one failure the plan
does not mention** — which happens to be the biggest one.

Also worth restating from file 03: `Plan/high-level-plan.md:108` explicitly scoped this out
of v1 — *"remembers, does not police... Automated drift detection is deferred."* So this is
a **known, deliberate v1 cut**, not a surprise. The problem is that the marketing claim and
the shipped scope have diverged.

---

## 3. The findings, ranked by user-visible impact

### 🔴 M-1 — CRITICAL: Observations are never shown to the narrator

**Severity: critical. Effort to fix: small. This is the highest value-per-hour fix in the
report.**

**What happens today, end to end:**

1. After every turn, the analyzer (`memory/analyzer.ts`, 75 lines) reads the prose and emits
   `observe` operations — *"Kael flinched when the fire was mentioned"*, *"promised to
   return the locket."*
2. `softStore.ts:69–77` appends each to the character's observation log, FIFO-capped at 200
   (`softStore.ts:27`).
3. The prompt's soft-state block is built by `condenseSoftSlice`
   (`summarizer/injector.ts:35–48`). **Read the function: it renders traits, mood, goal,
   location, and relationships. It does not touch `soft.observations`.**
4. The context assembler `assembleContext` (`orchestrator/context.ts:466–581`) builds
   exactly: system frame → ruling facts → hard snapshot → persona → soft slices → arc +
   chapters → lorebook → recent history → player text. **There is no observations block.**

**Verified by exhaustive search.** Across all of `packages/core/src`, `.observations` is read
in exactly three non-test places:

| Location | Purpose |
| --- | --- |
| `memory/cardView.ts:219` | Renders `recentObservations` for the **UI character card** |
| `memory/dossier.ts:478` | Reads `allObs` for the **UI dossier** |
| `memory/dossier.ts:549` | Maps observation text into the **UI dossier** |

**All three are UI display. None is the prompt.**

**What this means in plain language:** the game watches your story carefully, writes down
everything it notices about every character, shows those notes to *you* in the dossier
screen — and never tells the AI. The narrator writes each turn having never seen a single
observation about anyone in the scene.

There is a bleak detail that confirms it. When a character has no traits, mood, goal,
location or relationships, `condenseSoftSlice` emits the literal string **`"no notable
observations"`** (`injector.ts:47`) — while that character's `observations` array may hold
two hundred of them.

**Second-order consequence:** the FIFO cap (M-2 below) discards memory the model was never
shown anyway. Fixing the cap without fixing this achieves nothing. **Fix retrieval first.**

**Where the damage shows:** every "the AI forgot that I promised X" complaint. This is the
mechanism behind the exact failure the product exists to prevent.

---

### 🔴 M-2 — CRITICAL: No Stats mode has no memory at all

**Severity: critical (commercial). Effort: medium.**

`orchestrator/context.ts:498–500`:

```ts
const memory = schema.statMode === "full"
  ? await buildMemoryBlock(store, storyId, presentIds)
  : { softSlices: [] as string[], chapters: [] as string[], arc: undefined as string | undefined };
```

In `none` mode the narrator receives **no character notes, no chapter summaries, and no
arc.** Raw history is then hard-capped at the last **8 messages**
(`orchestrator/context.ts:503`) — about four exchanges — before token budgeting even
applies.

This is not an oversight; it follows the documented model-role matrix in
`Audit/V5_IMPLEMENTATION_STATUS_2026-07-23.md`, where the **Analyzer and Summarizer are both
"Silent"** in No Stats. So No Stats stories do not merely fail to *retrieve* memory — they
never *accumulate* any.

**Why this is commercially severe.** No Stats is the mode a SillyTavern user will try
first, because it is the mode that looks like what they already have. In that mode Midnight
Tavern has an 8-message memory and no summarisation — **strictly worse than SillyTavern with
the Summarize extension**, and worse than Isekai Zero, whose reviewers already complain of
*"the memory span of a goldfish"* at ~10 messages.

**Your best argument is invisible in the doorway most new users walk through.**

---

### 🟠 M-3 — HIGH: `set_overview_hint` destroys the entire world overview

**Severity: high (active data loss). Effort: small.**

`memory/softStore.ts:101–102`:

```ts
case "set_overview_hint":
  return { ...state, overview: op.text };
```

The world overview — the accumulated description of your entire world — is **replaced
wholesale** by whatever single string the analyzer emitted this turn. Not appended, not
merged, not versioned. One weak analyzer response and your world description is gone, with
no history and no undo.

The operation is *named* `set_overview_hint` — a **hint** — but it is implemented as a total
overwrite. This is the single worst data-loss bug I found in the memory layer.

---

### 🟠 M-4 — HIGH: No narrative-fact store exists

**Severity: high. Effort: large (this is the v2 plan).**

There is nowhere for a plain world fact to live. *"The cellar door is locked."* *"The
innkeeper owes you a favour."* *"You promised to return by dusk."* *"The bridge burned down
in chapter two."*

Items are hard state; **facts about items are homeless.** The only vessels available are:
- free-text `observe` (attached to a character, capped, and — per M-1 — never shown),
- `add_location` (name + description only),
- `add_thread` (title + note, string-keyed — see M-6),
- `set_overview_hint` (destroys everything, per M-3).

This is exactly what `Plan/v2-memory-system.md` proposes to fix with `memory/facts.ts` and
`memory/consolidator.ts`. **Verified: both files are absent from disk.**

---

### 🟠 M-5 — HIGH: Contradictions accumulate; nothing is ever resolved

**Severity: high. Effort: medium.**

`memory/softStore.ts:64–68` (`append`):

```ts
const list = state.identity[op.path];
if (includesCI(list, op.value)) return state;
return { ...state, identity: { ...state.identity, [op.path]: [...list, op.value] } };
```

It deduplicates case-insensitively but **cannot contradict.** `"brave"` and `"cowardly"`
coexist in the same traits list forever. There is no conflict detection, no supersession,
and no confidence weighting anywhere in the soft store.

A character who was cowardly in chapter one and became brave by chapter five is described
to the narrator as **both**, simultaneously, permanently. Character *development* — one of
your stated pillars — is structurally unrepresentable.

Compounding it: **`condenseSoftSlice` shows only the first six traits** —
`soft.identity.traits.slice(0, 6)` (`injector.ts:37`). Since `append` pushes to the end, the
**six oldest traits win permanently** and everything learned later is invisible. First
impressions are literally indelible.

---

### 🟡 M-6 — MEDIUM: Threads are keyed by lowercased title string

**Severity: medium. Effort: small.**

`memory/softStore.ts:107–121`:

```ts
case "add_thread": {
  if (state.unresolvedThreads.some((t) => t.title.toLowerCase() === op.title.toLowerCase())) return state;
  ...
case "resolve_thread": {
  ...t.title.toLowerCase() === op.title.toLowerCase() ? { ...t, resolved: true } : t
```

Two failure modes, both silent:
- **Resolve fails on a rephrase.** Thread opened as *"Find the missing courier"*; the
  analyzer later emits *"Find the courier"* — no match, the thread stays open forever, and
  your unresolved-threads list fills with completed business.
- **A genuinely new thread is dropped** if its title happens to match an existing one.

Neither reports an error. Both are `return state` — a silent no-op.

---

### 🟡 M-7 — MEDIUM: Relationships saturate and then stop responding

**Severity: medium. Effort: small.**

`memory/softStore.ts:78–94`. `adjust_relationship` accumulates deltas clamped to `[-1, 1]`.

Once trust reaches 1.0 after twenty kindnesses, **a betrayal moves nothing** — the clamp
absorbs it, and subsequent evidence has literally zero effect until enough negative deltas
accumulate to unstick it. The most dramatic moment in a relationship arc is the one the
model is least able to represent.

There is also no decay: a relationship formed in chapter one is weighted identically to one
formed last turn.

---

### 🟡 M-8 — MEDIUM: The narrator gets raw character IDs, not names

**Severity: medium. Effort: trivial.**

`summarizer/injector.ts:45`:

```ts
.map((r) => `${r.toCharacterId}(trust ${r.trust.toFixed(1)}${r.feeling ? `, ${r.feeling}` : ""})`)
```

The relationship line renders `r.toCharacterId` — a raw internal identifier. The narrator
receives something like `char_7f3a91b2(trust 0.8, protective)` and **cannot use it**, because
it does not know who `char_7f3a91b2` is.

Every relationship in every prompt is therefore wasted tokens at best, and confusing noise
at worst. Related: `nameFor` (`orchestrator/context.ts:483`) falls back to the raw id when a
character is not in the present set, so ids can leak into prompt text elsewhere too.

**This is a one-line fix with immediate quality impact.**

---

### 🟡 M-9 — MEDIUM: Observation cap is FIFO with no consolidation

**Severity: medium (currently masked by M-1). Effort: medium.**

`softStore.ts:27` sets `OBSERVATION_CAP = 200`; `softStore.ts:69–77` slices the oldest away.
No importance weighting, no consolidation into durable traits, no summarisation before
discard. Act One simply evaporates.

Ranked medium rather than high **only because of M-1** — the discarded observations were
never reaching the model anyway. **The moment M-1 is fixed, this becomes high.**

---

### 🟡 M-10 — MEDIUM: No semantic retrieval

**Severity: medium. Effort: large.**

Recall is recency + present-character + token budget. There is no way to ask *"what do we
know about the locket?"* A fact from turn 12 relevant to turn 300 is unreachable unless it
happens to be in the last 8 messages, the current arc summary, or a present character's
(unrendered) slice.

**Verified:** a search of `packages/core/src` for `transformers.js`, `embedding`, or
`cosine` returns **zero** TypeScript hits. `memory/embeddings.ts` and `memory/retrieval.ts`
are both absent.

The README concedes this and `Plan/high-level-plan.md:161` deliberately deferred it. The
plan's own reasoning — that a good summarizer substitutes for vectors — is defensible, but
it assumes the summariser output actually reaches the model, which per M-1 and M-2 is only
half true.

---

### 🟢 M-11 — LOW: No drift detection *(in this repo — but see Memory-Keeper below)*

**Severity: low today (it presupposes the above). Effort: large — revised: medium, because a
working upstream implementation already exists.**

Nothing compares new prose against established soft state. If the narrator says Kael has
green eyes in chapter one and brown in chapter nine, nothing notices. `memory/drift.ts` is
absent.

This is `Plan/v2-memory-system.md`'s policing layer and it is correctly sequenced last —
there is no point policing consistency against a memory the model never sees.

> **Revision 2026-08-02 (turn 2).** Owner clarification 4 supplied a second repository,
> **Memory-Keeper** (`C:/Users/anuji/Documents/Memory-Keeper/Memory-Keeper`), described as "the
> father of Drift protection." I audited it. It does not change the fact that
> `packages/core/src/memory/drift.ts` is absent in *this* repo, so M-11 stands as written — but the
> effort estimate drops from **large to medium**, because the detection design and prompts already
> exist and are tested upstream. See §3.12 below for the full finding, including the part of the
> owner's claim that does **not** hold.

---

### 🔵 M-12 — Memory-Keeper exists upstream: detection is built, *enforcement is not*

**New finding, 2026-08-02 (owner clarification 4). Severity: informational — it re-scores other
findings rather than adding a defect of its own.**

> **Full deep-dive: [12 — Memory-Keeper audit](12-memory-keeper-audit.md).** That file adds the
> entity-by-entity map, the five techniques worth porting into Midnight Tavern (relationship
> exponential smoothing, narrator-voice-as-entity, the pre-capture race fix, confidence-gated
> fact admission, interval auto-snapshots) and seven ranked findings MK-1…MK-7 — including
> **MK-1, silent write-loss**, where every extraction failure degrades to a `logger.warning`
> with no health surface. Re-verified independently on 2026-08-02: `105 passed, 5 skipped`.

**What it is.** A FastAPI service plus a SillyTavern extension, in a separate repo. Not a library
this app imports; a system the app can talk to over HTTP. Module map: `analyzer/` (11 modules —
fact / relationship / character / narrator-state / arc extractors, plus **two** drift detectors),
`api/` (`pipeline.py` orchestrator, `context_formatter.py`, 12 route modules incl.
`routes/drift.py`), `store/` (abstract base + SQLite + Postgres), `adapters/sillytavern/`.

**Its implementation status is real, and I measured it.** Running its own suite with its own venv:

```
105 passed, 5 skipped in 13.95s
```

The 5 skips are all `tests/test_store/test_postgres_store.py` (`TEST_POSTGRES_URL not set`), so the
SQLite path is genuinely covered and **the Postgres path is unverified**.

**How its drift protection actually works — and why the name overstates it.**
`api/pipeline.py:56-97` returns memory context synchronously, then fires
`asyncio.create_task(self._async_extraction(...))` at **`:85-87`** — fire-and-forget. Drift
detection runs in that background task (`:159-160` → `_detect_and_store_drift` at `:311-359`) and
is an **LLM judge**: `analyzer/drift_detector.py:40` asks a model for JSON. A detected item becomes
a `DriftLog` row. On the *next* turn, `_build_context:117` passes `drift_logs[:5]` into the injected
memory block, which appends a correction note at one of three strengths
(`api/context_formatter.py:21-34`, `:178-180`) — *"Gentle reminder…"* / *"Correction needed…"* /
*"CORRECTION REQUIRED… MUST adhere"*.

**Nothing blocks, gates, retries, or verifies compliance.** The strongest lever in the system is a
capital-letters string in a prompt. Its own design note says so plainly and honestly —
`docs/design-notes/sync-drift-check.md:3` declares
`Status: **Proposed / not implemented** (deferred by decision)` for the synchronous gate that
*would* make it preventive, and `:8-24` states the system is *"a mitigation and recovery pipeline,
not a hard consistency guarantee"*, that *"the **first occurrence** of any drift is always
generated before the system can react"*, and that a *"stubborn or low-capability chat model can
ignore the correction and keep drifting."* I verified the note is not stale: `grep -rn "sync_drift"`
across the repo returns **0** hits outside the note, and none of its four proposed config keys
exist in `config.py`.

**Verdict on the owner's claim, split honestly.** *"Pretty much fully implemented"*:
- ✅ **Holds for the memory layer.** 105 green tests, two store backends, snapshots with rollback
  and retention, narrator-voice tracking as a first-class concern, relationship exponential
  smoothing so one bad extraction cannot flip a relationship (`pipeline.py:257-309`, with an audit
  trail), four tuning presets, a working adapter.
- ❌ **Does not hold for "protection."** There is no enforcement anywhere in it. It is a **drift
  detector and advisor, not a drift preventer.** Father of drift protection — but what it fathered
  is the detection half.

**One real defect worth reporting upstream (MK-1): `drift_sensitivity` is a dead knob.**
`config.py:33` defines it, `config.example.yaml:53` documents it, `presets.py:6,10,14,18` sets it in
all four presets (including `high`), and `tests/test_config.py:53` asserts it round-trips — but **no
detector reads it.** Setting `high` behaves identically to `low`. It is the first dial a user would
reach for.

**Why this matters for *this* app — the re-score cuts both ways.** Any gap here written as if drift
detection were unexplored territory should be **downgraded**: the design, prompts and data model
exist and are tested upstream, so M-4/M-10/M-11 are cheaper than estimated. But any assumption that
drift is *handled* upstream must be **kept open**, because enforcement does not exist there either.
**The app cannot inherit prevention that Memory-Keeper does not have.** This app's deterministic
gate/ledger is in fact *stronger* than Memory-Keeper on the mechanical half — Memory-Keeper's
advantage is on the narrative half, which is exactly where this app is weak.

---

## 4. Summary table

| ID | Finding | Severity | Effort | Source |
| --- | --- | --- | --- | --- |
| M-1 | Observations never reach the narrator | 🔴 Critical | Small | `injector.ts:35–48`, `context.ts:466–581` |
| M-2 | No Stats mode has no memory at all | 🔴 Critical | Medium | `context.ts:498–500`, `:503` |
| M-3 | `set_overview_hint` destroys world overview | 🟠 High | Small | `softStore.ts:101–102` |
| M-4 | No narrative-fact store | 🟠 High | ~~Large~~ **Medium** (Memory-Keeper has a tested one) | absent: `memory/facts.ts` |
| M-5 | Contradictions accumulate; first 6 traits win | 🟠 High | Medium | `softStore.ts:64–68`, `injector.ts:37` |
| M-6 | Threads keyed by lowercased title | 🟡 Medium | Small | `softStore.ts:107–121` |
| M-7 | Relationships saturate at ±1 | 🟡 Medium | Small | `softStore.ts:78–94` |
| M-8 | Narrator sees raw character IDs | 🟡 Medium | Trivial | `injector.ts:45` |
| M-9 | FIFO observation cap, no consolidation | 🟡 Medium | Medium | `softStore.ts:27`, `:69–77` |
| M-10 | No semantic retrieval | 🟡 Medium | ~~Large~~ **Medium** (Memory-Keeper ships `analyzer/embeddings.py`) | absent: `memory/retrieval.ts` |
| M-11 | No drift detection | 🟢 Low | ~~Large~~ **Medium** (design + prompts exist upstream) | absent: `memory/drift.ts` |
| M-12 | **Memory-Keeper exists upstream: detection built, enforcement not** | 🔵 Info | — | `pipeline.py:85-87`, `drift_detector.py:40`, `sync-drift-check.md:3`; 105 tests pass |

> **Revision 2026-08-02 (turn 2).** M-12 added and the effort column re-scored for M-4, M-10 and
> M-11 — owner clarification 4. Severities are **unchanged**: Memory-Keeper is a separate service
> that this app does not currently call, so nothing here is fixed by its existence — only cheaper
> to fix. Downgrading the severities would have been the dishonest move.

---

## 5. The shape of the problem

**Storage is better than retrieval, by a wide margin.**

The team built a careful, type-safe, structurally-secure soft-state store — and then wired
only a thin, recency-biased slice of it into the model. Look at the line counts:

| Function | Lines | |
| --- | ---: | --- |
| `memory/dossier.ts` | 690 | **Displays** memory to the user |
| `memory/cardView.ts` | 260 | **Displays** memory to the user |
| `memory/softStore.ts` | 161 | **Stores** memory |
| `memory/analyzer.ts` | 75 | **Produces** memory |
| `summarizer/injector.ts` | **85** | **Delivers memory to the AI** |

**Eighty-five lines carry the entire product promise to the model, and they skip the
richest field.** Nine hundred and fifty lines exist to show that memory to the human.

The product currently demonstrates its memory to the *player* far better than it supplies
it to the *narrator*. The dossier screen is impressive precisely because it reads the data
the prompt ignores.

---

## 6. Honest verdict against goal (a)

| Claim | Verdict |
| --- | --- |
| *"Beats SillyTavern on mechanical drift (inventory, skills, stats)"* | ✅ **TRUE and structural.** Cannot regress |
| *"Beats SillyTavern on story/character/relationship drift"* | ❌ **NOT TRUE TODAY.** M-1 alone means the narrator sees less per-character memory than a well-tuned SillyTavern lorebook |
| *"Beats SillyTavern in No Stats mode"* | ❌ **FALSE — worse.** 8-message window, no summaries (M-2) |
| *"Relationships persist and evolve"* | 🟠 **Partly.** They persist; they saturate (M-7) and render as unusable IDs (M-8) |
| *"Characters visibly develop"* | ❌ **Structurally blocked** by M-5 — contradictions coexist and the six oldest traits win |
| *"Memory-Keeper is the father of Drift protection, pretty much fully implemented"* | 🟠 **Half true, and the half matters.** ✅ The memory layer is real and tested (105 passing). ❌ It contains **no enforcement** — it detects drift after the fact and appends a politely-worded correction note. It is a detector and advisor, not a preventer. See M-12 |

**The good news is how cheap the top of this list is.** M-1, M-3, M-7 and M-8 are all small
or trivial changes in three files — `summarizer/injector.ts`, `memory/softStore.ts`, and
`orchestrator/context.ts`. Together they would move the narrative-memory story from "worse
than the incumbent" to "clearly better," **without** building embeddings, a fact store, or
a drift detector.

The v2 memory plan is good and should happen. **But it should not be the next thing you
do.** Wiring up what already exists comes first, and it is a fraction of the work.

Step-by-step plans for all of these are in
[11 — Implementation plans](11-implementation-plans.md), items **1–6**.

---

*Next: [06 — Gap analysis: DM authority](06-gap-analysis-dm-authority.md)*
