# 02 — Codebase Map

**Audited at commit `e1e0d86`** (working tree clean; the only change since `b57d7d6`,
the state all code findings were verified against, is this audit folder plus a
`.gitignore` edit — no product code moved).

---

## What this means (read this first)

Midnight Tavern is three programs stacked on top of each other:

1. **A rules engine** (`packages/core`) that knows dice, damage, inventory and skills.
   It is written so that *the language model cannot touch it*. This is the good part.
2. **A conductor** (`packages/core/src/orchestrator`) that runs one turn: read what you
   typed → decide what kind of action it was → roll the dice → tell the AI what actually
   happened → let the AI write the prose → save. This is where the complexity lives, and
   where almost every defect in this report lives.
3. **A desktop app** (`packages/ui` + `packages/shell`) that draws all of it, running as a
   Tauri window with a local SQLite file as the only database.

The single most important structural idea in the whole codebase is the **hard/soft wall**:
numbers the engine owns ("hard state") are in one place, and vibes the AI owns ("soft
state") are in another, and there is deliberately **no code path** that lets the second
write to the first. That wall is real and I verified it. Most of what is wrong in this
report is *not* the wall failing — it is everything built around the wall being thinner
than the design documents claim.

**Size:** core is 23,824 lines of TypeScript across 113 files; UI is 20,604 lines across
63 files; the Rust shell is only 391 lines of real code (it is a thin SQLite host, not
where logic lives).

---

## 1. Package layout

| Package | Role | Real LOC | Notes |
| --- | --- | ---: | --- |
| `packages/core` | Rules engine, orchestrator, storage, LLM routing | 23,824 | Runs both in Node and in the Tauri webview |
| `packages/ui` | React app — every screen the player sees | 20,604 | Talks to core through one bridge module |
| `packages/shell` | Tauri desktop wrapper + native SQLite | 391 | `src-tauri/src/db.rs` (283), `lib.rs` (102) |
| **Memory-Keeper** *(separate repo)* | Upstream memory + drift-detection service — **not imported by this app** | Python | Added 2026-08-02, clarification 4. See §1.1 |
| ~~`Design/handoff*`~~ | ~~7 generations of static HTML design prototypes~~ | — | ✅ **ARCHIVED by the owner** in commit `3566c25`. See note below |

> **✅ Map hazard RESOLVED — owner action, not a defect.**
>
> **Revision 2026-08-02 (turn 2), owner clarification 5.** This was flagged as a hazard (and as
> recommendation W-8 / plan #24) at commit `e1e0d86`. It has since been **fixed by the owner
> themselves**: commit `3566c25` *"archived old designs to prevent bloat"* removed **190 files /
> 52,238 lines** and replaced them with a single `Design/handoff-archive.rar` (1,217,948 bytes).
> HEAD has moved from `e1e0d86` to `3566c25`. Verified by `git show --stat 3566c25`.
>
> Turn 1 closed with an open question — *"who deleted 189 files?"* — because it saw the deletions
> as an uncommitted working-tree change it could not attribute. **That question is answered: the
> owner did it deliberately, and then committed it.** Nothing anomalous happened. The note is
> retained here only so the historical finding is traceable.
>
> *Original finding, for the record:* the architecture graph reported `handoff` … `handoff-v7` as
> seven separate "packages" of ~116 nodes each with near-identical internals (cohesion 0.98–0.99,
> all exposing the same `get`/`walk`/`boot`/`resolve` functions) — ~800 nodes of near-duplicate
> JavaScript that outweighed the real UI package in the graph, so anyone (or any AI agent)
> navigating by search hit design prototypes as often as real code. That is no longer true.

---

## 1.1 Memory-Keeper — the upstream memory service *(added 2026-08-02, clarification 4)*

> **Revision 2026-08-02 (turn 2).** The owner supplied a second repository —
> `C:/Users/anuji/Documents/Memory-Keeper/Memory-Keeper` (git `main`, head `547c9b6`) — described as
> *"the father of Drift protection… pretty much fully implemented."* It is audited in full in
> [05 — Memory drift, finding M-12](05-gap-analysis-memory-drift.md). Summarised here because it
> belongs on the map.

**Relationship to this app: none in code, today.** Memory-Keeper is a **FastAPI HTTP service plus a
SillyTavern extension** (`adapters/sillytavern/`). Midnight Tavern does not import it, call it, or
depend on it — there is no client for it in `packages/core`. It is a *predecessor and design
ancestor* of this app's drift thinking, not a runtime component of it. Anyone reading the audit
should not expect to find it in the dependency graph, because it is not there.

| Package | Role |
| --- | --- |
| `memory_keeper/analyzer/` | 11 modules. LLM extractors (facts, relationships, character info, narrator state, narrative arcs) + **two** drift detectors: `drift_detector.py` (character), `narrator_drift_detector.py` (prose voice). Plus `embeddings.py`, `state_consolidator.py`, `llm_client.py`, `prompts/` |
| `memory_keeper/api/` | `pipeline.py` (orchestrator), `context_formatter.py` (builds the injected memory block), 12 route modules incl. `routes/drift.py`, `schemas.py`, `server.py` |
| `memory_keeper/store/` | `base.py` abstract + `sqlite_store.py` + `postgres_store.py`, `models.py` |
| `adapters/sillytavern/` | The consumer — a SillyTavern extension |
| `config.py`, `presets.py`, `main.py` | Config, four tuning presets, CLI entry |

**Measured status, not claimed:** its own suite run with its own venv gives
`105 passed, 5 skipped in 13.95s`. The 5 skips are all `tests/test_store/test_postgres_store.py`
(`TEST_POSTGRES_URL not set`) — SQLite covered, **Postgres unverified**.

**The one-line architectural read:** it is a **drift detector and advisor, not a drift preventer.**
Detection is an LLM judge running in a fire-and-forget background task (`api/pipeline.py:85-87`);
the output is a log row plus a politely-worded correction note injected on the *next* turn. Nothing
gates or blocks. This app's deterministic hard/soft wall is **stronger** on mechanical state;
Memory-Keeper is ahead on *narrative* memory, which is precisely this app's weak half.

---

## 2. `packages/core` — module by module

Ordered by how much they matter to the product thesis.

### 2.1 `orchestrator/` — 6,682 lines, 17 files. The conductor.

This is the biggest and most important directory in the codebase.

| File | Lines | What it does |
| --- | ---: | --- |
| `turn.ts` | **1,528** | The whole turn pipeline. Biggest file in the repo. |
| `authorityGuard.ts` | 625 | Stops the AI narrating outcomes it wasn't granted |
| `sceneEntityPromotion.ts` | 602 | Detects people/things the AI invented in prose |
| `context.ts` | 581 | Builds the prompt sent to the narrator |
| `attributeAdvancement.ts` | 438 | Decides when a stat goes up |
| `rulebook.ts` | 436 | Player-facing rules summary |
| `history.ts` | 410 | Message history windowing |
| `npcAgency.ts` | 356 | Decides whether an NPC hits back |
| `npcIntroduction.ts` | 326 | Brings NPCs on/off stage |
| `journal.ts` | 292 | The Mechanical Journal feed |
| `suggestions.ts` | 279 | The "Possible Moves" chips |
| `loot.ts` | 195 | Item drops from rulings |
| `checkpoint.ts` | 194 | Save/restore points |
| `stagePolicy.ts` | 147 | Per-stage deadlines + fallbacks |
| `loadout.ts` | 112 | Equipment resolution for a turn |
| `index.ts` | 108 | Public surface |
| `targetFocus.ts` | 53 | Who the player last aimed at |

**The turn pipeline.** `turn.ts` contains two generations of the same function, side by
side:

- `submitTurnLegacy` — `orchestrator/turn.ts:399`, the older synchronous path.
- `runTurnOperation` — `orchestrator/turn.ts:568`, **676 lines**, the current
  resumable path. Public entry is `submitTurn` at `orchestrator/turn.ts:1246`, with
  `retryTurnOperation` at `:1402` for crash recovery.

The legacy function carries the clearest statement of the intended eight-phase order, in
its own comments (`orchestrator/turn.ts:413–554`):

```
1. Persist the player message                              (:413)
2. Classify — turn free text into a catalog action         (:436)
3. Resolve every intent into a staged ruling, nothing committed yet (:446)
4. Assemble narrator context with rulings inline as facts   (:471)
5. Stream the narrator prose                                (:486)
6. Persist prose + commit rulings in ONE transaction        (:495)
7. Fire-and-forget: analyzer patch, chapter/arc summaries   (:542)
8. Return prose + rulings for dice toasts                   (:554)
```

**This ordering is the product's core insight and it is implemented correctly.** Step 3
(compute) strictly precedes step 5 (narrate), and step 6 is atomic. The AI is told what
happened; it never decides what happened.

`runTurnOperation` calls, in one hop: `classifyWithRecovery`, `assembleContext`,
`generateGuardedNarration`, `commit`, `planNpcReactions`, `planNpcActions`,
`planNpcTransitions`, `discoverNarratedSceneEntities`, `determineLootAwards`,
`determineAttributeAdvancements`, `enforceActionBudget`, `capture`, `transaction`,
`runStage`, `runBackground`. Fifteen subsystems coordinated from one function body — which
is precisely why it scores cognitive complexity 103 (see §5).

### 2.2 `engine/` — 2,059 lines, 14 files. The rules. **The best code in the repo.**

| File | Lines | Role |
| --- | ---: | --- |
| `resolver.ts` | 563 | Turns an intent + gate verdict into a ruling |
| `equipment.ts` | 404 | 7 slots, item tiers, stat contributions |
| `attributeAdvancement.ts` | 306 | Stat growth rules |
| `gate.ts` | 175 | **Can this action even be attempted?** |
| `ledger.ts` | 144 | **The only writer of hard state** |
| `unlock.ts` | 109 | Skill/action unlocks |
| `progression.ts` / `dice.ts` / `difficulty.ts` / `rollMode.ts` / `attributes.ts` / `actionBudget.ts` / `conditions.ts` | 344 | Small focused rule units |

Two files carry the guarantee:

**`engine/gate.ts`** — `checkGate` is documented as *"a PURE function with no I/O"* that
runs seven checks in a fixed order before any die is rolled
(`engine/gate.ts:1–16`): action exists in catalog → actor alive → skill learned → rank met
→ required item held → costs affordable → conditions hold. A denied action never rolls.
This is exactly right, and it is the mechanism that makes "the DM says no" enforceable
rather than a prompt instruction.

**`engine/ledger.ts:69`** — `commit(schema, mutations, charsById)` is the sole function
that mutates character hard state, and it is documented as transactional at the call site
(`engine/ledger.ts:60–68`). It returns the ids of characters who died as a direct result.
Everything that changes a number in this game funnels through these 76 lines.

**Verified:** there is no second write path to hard state. This is the wall, and it holds.

### 2.3 `store/` — 2,992 lines, 19 files. SQLite persistence.

`store/db.ts` (631 lines) owns the schema and a hand-rolled migration ladder:
**16 migrations**, `store/db.ts:82–618`, versions 1 through 16, applied by `migrate()` at
`store/db.ts:618`.

Repositories (one per table, the only place SQL is written):
`lorebook.ts` (277), `turnOperations.ts` (245), `runtimeItems.ts` (237),
`storyEvents.ts` (178), `messages.ts` (171), `characters.ts` (171), `stories.ts` (158),
`checkpoints.ts` (133), `personas.ts` (129), `chapters.ts` (108), `arcs.ts` (99),
`rulings.ts` (96), `rulebookSnapshots.ts` (74), `settings.ts` (56), `worldSoft.ts` (44),
`codec.ts` (23).

The repository boundary is clean and consistently applied — JSON columns validate through
Zod on the way out, and hard/soft state live in separate tables. This matches the stated
architecture.

> Relevant to the NPC redesign (file 03): the plan requires a **migration 17** for
> character aliases. It does not exist. The ladder stops at 16.

### 2.4 `bootstrap/` — 3,464 lines, 9 files. Story creation.

Turns a user's story idea into a **frozen schema** — the fixed catalog of attributes,
skills, actions and items that the classifier is later constrained to. Entry points:
`generateStorySchema` (`bootstrap/generate.ts:1409`, 496 lines),
`validateStorySchema` (`bootstrap/validate.ts:130`, 224 lines),
`freezeSchema` / `bootstrapStory` (`bootstrap/freeze.ts`),
`instantiatePlayer` / `instantiateFromTemplate` (`bootstrap/instantiate.ts`),
`deterministicRepair` (`bootstrap/repair.ts`),
`resolveStartingGear` (`bootstrap/startingGear.ts`),
`changeStoryStatMode` (`bootstrap/switchMode.ts`).

Freezing the schema up front is what makes the classifier safe — see §2.5.

### 2.5 `classifier/` — 775 lines, 3 files. Free text → a legal move.

`classify.ts` (564) + `prompt.ts` (191). The classifier's job is to read "I swing at the
bandit" and return a catalog action id. **Crucially, its output schema is a Zod enum built
from the frozen catalog** — so it is structurally incapable of inventing an action that
does not exist. `classifyWithRecovery` adds a repair loop.

The prompt (`classifier/prompt.ts:169–191`) receives only: catalog + present characters +
recent narration + player message. **No character-card text reaches it** — which means the
untrusted-content channel described in file 07 does not touch this path. That is a good
boundary and it appears to be deliberate.

### 2.6 `memory/` — 1,279 lines, 6 files. The soft-state store.

| File | Lines | Role |
| --- | ---: | --- |
| `dossier.ts` | 690 | The character dossier the *UI* renders |
| `cardView.ts` | 260 | Card-style character view |
| `softStore.ts` | **161** | **The entire memory-mutation surface** |
| `analyzer.ts` | 75 | Post-turn LLM pass that emits soft patches |
| `prompt.ts` | 62 | Analyzer prompt |

Note the shape of this directory: **690 lines to *display* memory, 161 lines to *store*
it, and 75 lines to *produce* it.** The memory subsystem is heavily weighted toward
presentation. File 05 covers the consequences in detail.

### 2.7 `summarizer/` — 315 lines, 4 files.

`injector.ts` (85) — condenses soft state into the prompt block.
`chapter.ts` (100) / `arc.ts` (99) — rolling summaries at two timescales.
This is the entire long-term-memory compression layer: **184 lines**.

### 2.8 `router/` — 1,146 lines, 12 files. LLM provider abstraction.

`router.ts` (383), `structured.ts` (202), `recommend.ts` (136), `roles.ts` (117),
`samplers.ts` (111), `index.ts` (98), `modelCatalog.ts` (64), plus small config files.
Handles multiple providers, per-role model assignment (narrator / classifier / analyzer
can each use a different model), structured-output calls, and sampler settings.

This is competent, unremarkable infrastructure and I found nothing wrong with it.

### 2.9 `types/` — 1,552 lines, 13 files. The contracts.

`schema.ts` (268) — the frozen story schema.
`records.ts` (192) — DB row shapes.
`events.ts` (184) — the event vocabulary.
`softState.ts` (175) — **the soft-state patch union; see below.**
`equipment.ts` (169), `difficulty.ts` (118), `attributeAdvancement.ts` (111),
`blueprint.ts` (106), `actions.ts` (91), `primitives.ts` (56), `hardState.ts` (50),
`conditions.ts` (20).

**`types/softState.ts:128–175` is the wall, expressed as a type.** `SoftStatePatchSchema`
is `.strict()` over a closed discriminated union of operations. There is no operation in
that union that can name a resource, a skill, an item or a hit point. Even a maliciously
crafted model response cannot reach hard state through this channel. **Verified by
reading the full file.** This is genuinely well designed and the README's claim about it
is true.

### 2.10 `importer/` — 1,011 lines, 7 files. SillyTavern compatibility.

`mapToSchema.ts` (350), `mechanics.ts` (308), `cardTypes.ts` (109), `pngCard.ts` (99),
`urlImport.ts` (87), `jsonCard.ts` (24). Reads Chara Card V2/V3 from PNG metadata, raw
JSON, or a URL, and maps them onto a story schema.

This is the project's main adoption on-ramp — and its main untrusted-input surface. See
file 07 finding **M-2** (`importer/urlImport.ts:64–87` fetches an arbitrary user-supplied
URL with `redirect: "follow"`, no scheme allow-list, no private-IP block, and no timeout).

### 2.11 Smaller modules

`macros/` (1,328 / 5 files) — SillyTavern-style `{{macro}}` expansion.
`config/` (393 / 2) — app configuration.
`licensing/` (296 / 3) — license gating.
`observability/` (21 / 1) — **21 lines.** There is effectively no telemetry in core.
`util/` (15 / 1).

---

## 3. `packages/ui` — 20,604 lines

| Area | Files | Lines |
| --- | ---: | ---: |
| `screens/` | 17 | 10,923 |
| `components/` | 36 | 4,452 |
| `bridge/` | 3 | 3,105 |
| `state/` | 4 | 1,165 |
| `app/` | 2 | 629 |
| `observability/` | 1 | 171 |
| `theme/` | 0 | 0 |

Largest files: `bridge/core.ts` (2,063), `screens/Play.tsx` (1,887),
`StorySettings.tsx` (1,213), `Lorebook.tsx` (1,115), `bridge/sqliteBridge.ts` (934),
`CharacterDossier.tsx` (848), `Wizard.tsx` (808), `DesignSystem.tsx` (674),
`StoryBlueprint.tsx` (654), `Library.tsx` (566), `state/playStore.ts` (543).

**The bridge is the chokepoint.** `bridge/core.ts` exposes `getBridge`, which the graph
reports as the highest-fan-in symbol in the entire codebase (**79 inbound callers**),
with `requireStory` at 28. Every screen reaches core through this one module. That is a
defensible design — one seam, easy to mock, and it is what lets core run inside the Tauri
webview — but it also means `bridge/core.ts` at 2,063 lines is a de-facto second
orchestrator living in the UI package, and it is the file most likely to become
unmaintainable next.

`theme/` is an empty directory. Design tokens are not centralised (relevant to file 08).

---

## 4. Cross-package boundaries

The graph reports `ui → core` at 19 call sites and — apparently — `core → ui` at 8.

**I checked the eight, and they are a false alarm. Recording the correction here rather
than leaving the scary number standing.** All eight resolve to a callback named `onDelta`
(from `router/providers/openaiCompat.ts`, `orchestrator/authorityGuard.ts`,
`router/router.ts`, and three test files) matching the *definition* of `onDelta` in
`packages/ui/src/state/playStore.ts`. It is a name collision in the call graph, not a real
edge: a `grep` for any import of `packages/ui` or a `@…/ui` package from anywhere in
`packages/core/src` returns **nothing**.

**Verdict: core has no dependency on ui. The layering is clean**, and core can run headless.
The streaming-callback pattern (`onDelta`) is the intended seam and it is correctly
inverted — core calls a function the caller supplies.

One genuine portability note, confirmed: exactly one file in core touches a `node:` builtin
— `packages/core/src/util/uuid.ts`. Everything else is webview-safe, which is what lets core
run inside the Tauri renderer over the SQLite bridge.

`shell → core` is 3 calls: the Tauri layer really is just a SQLite host.

---

## 5. Complexity hotspots (measured, not guessed)

Ranked by cognitive complexity across the whole graph:

| Function | Location | Cyclomatic | Cognitive | Lines |
| --- | --- | ---: | ---: | ---: |
| `validateStorySchema` | `bootstrap/validate.ts:130` | 65 | **153** | 224 |
| `runTurnOperation` | `orchestrator/turn.ts:568` | 39 | 103 | 676 |
| `generateGuardedNarration` | `orchestrator/authorityGuard.ts:404` | 20 | 49 | 222 |
| `commit` | `engine/ledger.ts:69` | 17 | 45 | 76 |
| `generateStorySchema` | `bootstrap/generate.ts:1409` | 22 | 43 | 496 |
| `evaluateAttributeAdvancement` | `engine/attributeAdvancement.ts:103` | 26 | 30 | 188 |

Two observations the team should act on:

1. **The NPC redesign plan targets `runTurnOperation` for decomposition — but
   `validateStorySchema` is worse on every axis** (cyclomatic 65 vs 39, cognitive 153 vs
   103) and no plan mentions it. It is the function that decides whether a freshly
   generated story is playable, so its failure mode is *"story creation mysteriously
   fails or repairs forever"* — a first-run experience killer. **This is an unowned risk.**
2. `commit` at cognitive 45 in only 76 lines is dense, but it is the single most
   safety-critical function in the product. Density there is acceptable; it is well
   commented and well tested. I would not refactor it.

---

## 6. Test coverage of the map

**Verified by running the suite at `b57d7d6`:** `npm test --workspaces --if-present`,
exit code 0.

- `packages/core`: **45 test files, 632 tests, all passing** (22.6s)
- `packages/ui`: **25 test files, 160 tests, all passing** (11.5s)
- **Total: 792 passing, 0 failing, 0 skipped**
- `packages/shell` has **no `test` script** — the Rust side is untested by this command.

Two things follow, and both matter:

- The README's claim of "393 tests (311 core, 82 UI)" is **stale by ~2×**. The suite has
  roughly doubled. Documentation lag is a recurring theme in this audit.
- **A green suite here proves the deterministic engine, not the product.** Nothing in
  these 792 tests exercises a real LLM provider. Every finding in files 05, 06 and 07 is
  about behaviour that only appears when a real model is in the loop — which is exactly
  the region the test suite cannot see. The suite is a strong regression net for the
  rules engine and a near-total blind spot for the narrative engine.

---

## 7. What the map tells you

- **The wall is real.** `engine/gate.ts` + `engine/ledger.ts` + `types/softState.ts` are
  ~480 lines that genuinely prevent the AI from touching the numbers. Credit where due.
- **The conductor is where the risk is.** 6,682 lines in `orchestrator/`, one 1,528-line
  file, one 676-line function coordinating fifteen subsystems.
- **Memory is display-heavy and storage-light.** 690 lines to render a dossier, 161 to
  store the memory, 184 to compress it for the prompt.
- **Combat has no directory.** There is no `engine/combat/`, no initiative, no turn queue.
  See file 07.
- **Design prototypes outweigh real UI in the search index**, which slows every future
  navigation of this repo, human or agent.

---

*Next: [03 — Design and plan review](03-design-and-plan-review.md)*
