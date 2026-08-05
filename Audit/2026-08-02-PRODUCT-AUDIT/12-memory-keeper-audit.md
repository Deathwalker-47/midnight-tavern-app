# 12 — Memory-Keeper Audit (the parent of drift protection)

**Added:** 2026-08-02, second pass, in response to user clarification #4.
**Repo audited:** `C:\Users\anuji\Documents\Memory-Keeper\Memory-Keeper`
**Status of this audit:** Verified by reading source and running the test suite.

---

## What this means (plain language, read this first)

Memory-Keeper is a **separate, finished, working product** you built before
Midnight Tavern. It is a Python service that sits beside SillyTavern, watches the
roleplay go past, and keeps notes: who these characters are, what they believe,
who trusts whom, what facts the world has established, and when the AI starts
contradicting itself. It then quietly pastes those notes back into the AI's prompt
so the AI stops forgetting.

You described it as "the father of Drift protection part of our system." That is
**accurate, and it is the correct word — father, not the thing itself.** Memory-Keeper
proved the *ideas* work. But it can only ever *advise* the storytelling AI. It has
no power to stop it. Midnight Tavern exists because advice is not enough.

That single sentence is the most important finding in this file, and it justifies
Midnight Tavern's whole existence rather than making it redundant. Details below.

---

## 1. Verified facts about the repository

| Property | Finding | How verified |
|---|---|---|
| Language | **Python** (not TypeScript) | `pyproject.toml`, 42 `.py` source files |
| Framework | FastAPI + Pydantic + Uvicorn | `memory_keeper/api/server.py`, `.venv` contents |
| Storage | SQLite **and** PostgreSQL | `store/sqlite_store.py`, `store/postgres_store.py` |
| Source size | 42 Python modules under `memory_keeper/` | `find memory_keeper -name "*.py" \| wc -l` |
| Test size | 22 test modules | `find tests -name "*.py" \| wc -l` |
| **Test result** | **105 passed, 5 skipped, 0 failed** | Ran `pytest tests/ -q` on 2026-08-02 |
| Skips | 5 Postgres tests skip when `TEST_POSTGRES_URL` unset | Skip reasons printed in output |
| Git history | 20 commits, 6 branches, 5 merged PRs | `git log --oneline` |
| Working tree | Clean except untracked `opencode.json` | `git status --short` |
| Licence | MIT | `LICENSE` |
| Integration | SillyTavern browser extension, 37,872-byte `index.js` | `adapters/sillytavern/` |

**The user's claim "this is pretty much fully implemented" is VERIFIED.** This is not
a prototype. It is a coherent, tested, documented service with a real integration
path. Its own README roadmap shows 9 of 13 items checked, and the 4 unchecked ones
(MCP interface, advanced relationship analytics, multi-session analysis, web UI) are
genuinely additive rather than load-bearing.

---

## 2. What Memory-Keeper actually tracks — the 10 entities

From `memory_keeper/store/models.py` (class definitions at the cited lines):

| Entity | Line | What it holds |
|---|---|---|
| `Session` | `models.py:66` | Root container for one roleplay scenario |
| `CharacterIdentity` | `models.py:78` | Core traits, worldview, speech patterns, tier |
| `BehavioralSignature` | `models.py:95` | Interaction style — the character's "voice fingerprint" |
| `CharacterState` | `models.py:109` | Mood, location, current goal (moment-to-moment) |
| `NarratorState` | `models.py:122` | **Tense, perspective, description density, pacing, tone** |
| `Fact` | `models.py:135` | subject / predicate / object + evidence + confidence |
| `Event` | `models.py:151` | Significant narrative events |
| `RelationshipDynamic` | `models.py:163` | label, trust_level, power_balance, emotional undercurrent, history |
| `NarrativeArc` | `models.py:178` | title, status, beats, expected outcome, involved characters |
| `DriftLog` | `models.py:190` | type, severity, previous vs conflicting state, evidence |
| `MemorySnapshot` | `models.py:205` | Full point-in-time backup for rollback |

**`NarratorState` deserves special attention.** Memory-Keeper tracks drift in the
*narrator's voice* — tense, person, pacing, tone — as a first-class entity separate
from character drift, with its own detector (`analyzer/narrator_drift_detector.py`)
and its own prompt (`analyzer/prompts/narrator_drift_detection.md`). This is a
category of drift most competitors ignore entirely, and it is the kind of drift a
reader *feels* before they can name it: the story silently slides from past tense
to present, or from tight third person to a chatty omniscient voice.

---

## 3. The architecture — and its one structural limit

### 3.1 The turn loop (Verified — `api/pipeline.py:56-97`)

```
message arrives
  → look up or auto-create the character            (pipeline.py:71-78)
  → SYNC: build memory context, return it NOW       (pipeline.py:81)
  → ASYNC: fire extraction + drift analysis         (pipeline.py:84-90)
  → return context immediately                      (pipeline.py:92-97)
```

The docstring states the design in one line (`pipeline.py:41`):
> `Sync retrieval → return context → async extraction + drift analysis.`

Extraction runs as a **detached background task** (`asyncio.create_task`,
`pipeline.py:85`). Seven analyzers then run concurrently via `asyncio.gather`
(`pipeline.py:149-176`): facts, relationships, character drift, narrator state,
narrative arcs, narrator drift, and character state.

### 3.2 The limit, stated by the project itself

`docs/design-notes/sync-drift-check.md` is unusually honest, and I am quoting it
rather than paraphrasing because it is the crux of this entire audit:

> "The current system is a *mitigation and recovery* pipeline, not a hard
> consistency guarantee. Drift correction has an unavoidable one-turn lag."

> "Therefore, the **first occurrence** of any drift is always generated before the
> system can react. Only its *continuation* is corrected."

> "The correction itself is also 'soft': the memory block asks the chat LLM to stay
> in character (gentle/moderate/firm), but nothing verifies compliance. A stubborn
> or low-capability chat model can ignore the correction and keep drifting."

That note's status line reads `Proposed / not implemented (deferred by decision —
keep the async model for now)`. So the limitation is **known, documented, and
consciously accepted** in Memory-Keeper. That is good engineering hygiene. It is
also precisely the ceiling Midnight Tavern was built to break through.

### 3.3 How weak the enforcement really is

The entire enforcement mechanism is **English text pasted into a prompt**. From
`api/context_formatter.py:21-34`, the three correction strengths are literally three
differently-worded strings:

| Strength | Prefix (`context_formatter.py:15-19`) | The actual "enforcement" |
|---|---|---|
| gentle | `Note:` | "Gentle reminder: {name} has been showing some inconsistency…" |
| moderate | `IMPORTANT:` | "Correction needed: {name} should maintain consistency…" |
| firm | `CRITICAL:` | "CORRECTION REQUIRED: {name} MUST adhere to established characterization…" |

The whole memory block is wrapped in `[MEMORY_KEEPER_START] … [MEMORY_KEEPER_END]`
with the correction appended after it (`context_formatter.py:174-182`). A budget
allocator trims sections by priority when space runs short —
identity > narrator > state > relationships > facts > arcs > drift warnings
(`context_formatter.py:72`, enforced by the `budget` decrements throughout).

**Assessment (Inferred, but with high confidence):** shouting `MUST` in capital
letters at a language model is not an authority model. It is a *request*. Any
model can ignore it, and cheaper models will. Memory-Keeper cannot roll a die,
cannot reject an action, cannot refuse to commit a state change, and cannot stop
the story. It observes and it pleads.

---

## 4. What Midnight Tavern should steal (concrete, ranked)

These are techniques already proven in your own working code. Reusing them is
low-risk because you wrote them and they pass tests.

### 4.1 HIGH VALUE — Relationship exponential smoothing

`api/pipeline.py:257-309`, `_merge_relationship`. Numeric relationship dimensions
are **never overwritten** by a new observation. They are blended:

```
new = (1 - alpha) * old + alpha * observed        # alpha default 0.3
```

clamped to `[-1, 1]` (`pipeline.py:280-282`), with an audit line appended to
`history` only when something moved meaningfully — label changed, or trust/power
moved ≥ 0.05 (`pipeline.py:298-309`).

**Why this matters more than it looks.** The stated purpose is that "a single noisy
extraction cannot flip an established relationship" (`pipeline.py:260-262`). This is
a *defence against the LLM's own overconfidence*. One sarcastic line should not
convert a decade-long friendship into hostility. Any system that lets the newest
observation overwrite accumulated truth will oscillate. **Check whether Midnight
Tavern's relationship updates overwrite or smooth — if they overwrite, this is a
real bug class waiting to happen, and the fix is thirty lines you already own.**

### 4.2 HIGH VALUE — Narrator voice as a tracked entity

`store/models.py:122` + `analyzer/narrator_drift_detector.py` + the dedicated prompt.
Tracking tense / perspective / density / pacing / tone as durable state, and
diffing it turn over turn, catches a whole drift class that character-level
tracking misses entirely. Midnight Tavern's invariant work is focused on facts and
entities; prose *voice* is a different axis.

### 4.3 MEDIUM VALUE — The pre-capture race fix

`pipeline.py:133-146` and commit `e370d55` ("Fix narrator drift race condition").
The prior narrator state is captured **before** the concurrent batch runs, so drift
is compared against a stable pre-update baseline instead of a value another task
may have already overwritten. This is a genuine concurrency bug that was found and
fixed. **Any system running concurrent extractors against shared state has this
same bug shape.** Worth auditing Midnight Tavern for it explicitly.

### 4.4 MEDIUM VALUE — Confidence-thresholded fact admission

`pipeline.py:187`. A fact is only stored if
`confidence >= analyzer_config.fact_confidence_threshold`. Cheap, effective
gate against hallucinated world-facts being canonised.

### 4.5 MEDIUM VALUE — Interval auto-snapshots with retention cap

`pipeline.py:499-544`. Every N messages, serialise the whole session (characters,
facts, relationships, events, arcs, drift logs) into a snapshot, then delete the
oldest beyond `max_snapshots_per_session`. Gives rollback without unbounded growth.

### 4.6 CONSIDER — Advisory-vs-gate as a *user setting*

The deferred design note (§3.2) sketches exactly the decision Midnight Tavern
faces: advisory (cheap, one-turn lag) vs gate-with-regenerate (expensive, catches
first occurrence, may block the user). The trade-off table in
`docs/design-notes/sync-drift-check.md:62-68` is already written. Midnight Tavern
should expose this as a deliberate quality/latency/cost dial rather than hard-coding
one answer.

---

## 5. Why Midnight Tavern is NOT redundant — the sharpest framing in this audit

Put the two side by side:

| | Memory-Keeper | Midnight Tavern |
|---|---|---|
| Position | Bolt-on beside SillyTavern | Owns the whole engine |
| Sees the turn | After it happened | Before it commits |
| On drift | Logs it, then asks nicely next turn | Can refuse, gate, or correct in place |
| State authority | Advisory notes in a prompt | Authoritative store the story must obey |
| Enforcement | Capitalised English | Code |
| First drift occurrence | **Always escapes** | Preventable in principle |
| Language | Python service | TypeScript, in-process |

**Memory-Keeper is a memory *observer*. Midnight Tavern is a memory *authority*.**

The reason Memory-Keeper can never close the gap is not a missing feature — it is
positional. It does not own the generation loop. It cannot intercept a reply before
the user sees it, because SillyTavern owns that moment. The design note admits the
gate mode "requires deeper SillyTavern integration (intercepting a
generated-but-uncommitted message and driving a regenerate), which is riskier than
the current `setExtensionPrompt` injection" (`sync-drift-check.md:70-76`).

Midnight Tavern owns that moment by construction. **That is the entire strategic
justification for building it as a standalone app rather than another SillyTavern
extension**, and it is worth stating in exactly those terms in the README and any
public-facing pitch.

---

## 6. Honest criticism of Memory-Keeper

Being fair means naming the weaknesses too.

1. **Every extraction is an LLM call, and drift detection is an LLM judging an LLM.**
   `analyzer/drift_detector.py:40` is one `call_json`. Seven analyzers may fire per
   message (`pipeline.py:149-176`). Cost and latency scale with turn count, and the
   detector inherits the biases and failure modes of whatever model backs it.
   Nothing here is deterministic.

2. **Prompt templates are string-replaced, not structurally validated.**
   `drift_detector.py:26-35` chains `.replace()` calls on markdown templates. If a
   character's own text contains something like `{core_traits}`, behaviour is
   undefined. Minor, but it is the kind of thing that bites once and confuses for
   an hour.

3. **Errors are swallowed to warnings almost everywhere.** `logger.warning` on
   failed fact store (`pipeline.py:200`), failed relationship store
   (`pipeline.py:255`), failed drift log (`pipeline.py:359`), failed state update
   (`pipeline.py:375`), failed narrator update (`pipeline.py:402`), failed arc
   processing (`pipeline.py:458`). Plus `return_exceptions=True` on the gather
   (`pipeline.py:176`). **Consequence: memory can silently stop being written while
   the app looks perfectly healthy.** For a product whose entire value proposition
   is "we do not forget," silent write-loss is the worst possible failure mode.
   There is no surfaced health signal, no counter, no user-visible "extraction
   failed" state. This is the single most actionable defect in the repo.

4. **Auto-creation of characters is generous.** Any name the relationship extractor
   invents becomes a `SECONDARY` character row (`pipeline.py:225-233`), and the same
   happens for unknown speakers (`pipeline.py:71-78`). One hallucinated name
   permanently pollutes the cast. Midnight Tavern has been fighting exactly this
   class of problem — compare the recent commits `bd4f99d` "reconcile narrated
   villager identities" and `a56fe49` "close Cyraeth coreference repair". **Same
   bug family, independently rediscovered in both codebases.** That is a strong
   signal it needs a principled fix, not another one-off repair.

5. **Postgres path is effectively untested in practice.** The 5 skipped tests are
   the only Postgres coverage and they skip by default. Claiming Postgres support
   while never exercising it in CI is a latent risk.

6. **README overstates slightly.** It cites a `github.com/memory-keeper/memory-keeper`
   URL and a BibTeX entry with author "Anujith-Claude"; the real remote is under
   `Deathwalker-47`. Cosmetic, but if this ever goes public, fix it.

---

## 7. Findings table (severity ranked)

| # | Finding | Type | Severity | Where |
|---|---|---|---|---|
| MK-1 | Silent write-loss: all extraction failures degrade to `logger.warning` with no health surface | Verified | **HIGH** | `pipeline.py:200,255,359,375,402,458` |
| MK-2 | Enforcement is advisory prose only; no mechanism verifies compliance | Verified | **HIGH** (by design) | `context_formatter.py:21-34`, `sync-drift-check.md:19-24` |
| MK-3 | First occurrence of any drift always escapes (one-turn lag) | Verified | **HIGH** (by design) | `sync-drift-check.md:11-18` |
| MK-4 | Hallucinated names auto-become permanent characters | Verified | MEDIUM | `pipeline.py:71-78, 225-233` |
| MK-5 | Postgres support shipped but unexercised by default | Verified | MEDIUM | `tests/test_store/test_postgres_store.py` |
| MK-6 | Prompt building via naive `.replace()` | Verified | LOW | `drift_detector.py:26-35` |
| MK-7 | README repo URL and citation author are wrong | Verified | LOW | `README.md:39, 245-250` |

---

## 8. What to do about it (actionable)

**For Memory-Keeper itself** — only if you intend to keep it alive as a product:

1. Add an extraction health counter and surface it (MK-1). Every swallowed warning
   should increment a per-session `extraction_failures` field that the adapter can
   display. Effort: small. Value: high.
2. Gate auto-character-creation behind a confidence threshold or an allowlist of
   known cast members (MK-4), mirroring the fact-confidence gate that already
   exists at `pipeline.py:187`.
3. Either wire a Postgres service into CI or downgrade the claim to "experimental"
   (MK-5).

**For Midnight Tavern** — the real payoff:

4. Port relationship exponential smoothing (§4.1). Verify first whether Midnight
   Tavern currently overwrites relationship numbers; if it does, this is a
   pre-emptive bug fix.
5. Port narrator-voice-as-entity (§4.2) — tense/perspective/pacing/tone as durable
   tracked state with turn-over-turn diffing.
6. Audit Midnight Tavern for the pre-capture race pattern (§4.3) anywhere
   concurrent tasks read-then-write shared state.
7. Audit Midnight Tavern for the same silent-degradation pattern as MK-1. A store
   that quietly stops persisting is far more dangerous in Midnight Tavern than in
   Memory-Keeper, because Midnight Tavern's state is *authoritative* — the story is
   supposed to be unable to contradict it.
8. Adopt the coreference/identity problem as a **named, principled subsystem**
   rather than repeated one-off repairs. Both codebases hit it independently
   (MK-4 here; `bd4f99d` and `a56fe49` there).
9. Reuse the advisory-vs-gate trade-off table (§4.6) as the basis for a user-facing
   quality dial.

Cross-references: goal (a) analysis in `05-gap-analysis-memory-drift.md`;
goal (b) and the Dungeon Mind comparison in `06-gap-analysis-dm-authority.md`;
step-by-step plans in `11-implementation-plans.md`.

---

## 9. One-line summary for the executive reader

Memory-Keeper is real, finished, tested (105 passing), and it earned the name
"father of drift protection" — it proved that extraction, relationship smoothing,
narrator-voice tracking, drift detection, and snapshot rollback all work. What it
cannot do is *enforce* any of it, because it does not own the generation loop and
its only lever is politely-worded text in a prompt. **Midnight Tavern is the same
ideas relocated to where they can actually be binding.** Keep Memory-Keeper as
proof, as a SillyTavern-market foothold, and as a parts bin — but the strategic
bet belongs in the engine that owns the turn.
