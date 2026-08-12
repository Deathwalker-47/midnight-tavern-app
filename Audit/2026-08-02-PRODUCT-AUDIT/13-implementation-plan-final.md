> **DECOMMISSIONED 2026-08-12 - reference only, not a task list.**
> Every plan written before 2026-08-12 is retired by owner decision. Plan 13 was **executed** and
> shipped in v0.2.9; its **deferred queue (Plans 21 / 19 / 20 / 18 / 23 / 10B) is cancelled**, not
> deferred. The diagnosis chapters in this folder remain useful reference; their priority ordering
> and work items do not. See [`docs/PLAN-POLICY.md`](../../docs/PLAN-POLICY.md).

# 13 — Final Implementation Plan (executable, zero-ambiguity)

**Written:** 2026-08-02. **Grounded at:** `main` @ `3566c25`.
**Supersedes for execution purposes:** the sequencing in [11 §1](11-implementation-plans.md).
Plan 11 stays authoritative for *findings and rationale*; this file is what a coder follows.

**Baseline measured, not quoted:** 792 tests (632 core / 160 UI). `Plan/next-phase-internal-beta.md:6`
still says 579 and `README.md:250` still says 393. Both are wrong. Step 0.1 fixes them.

---

## Status: ✅ COMPLETE (executable scope)

**All 22 steps across Phases 0–6.1 are implemented, tested, and committed.** The Deferred queue
(§ end of file — Plans 21/19/20/18/23/10B) was never part of this pass and remains open.

| | |
| --- | --- |
| **Completed** | 2026-08-05 (Phases 0–2 on 2026-08-02; Phases 3–6.1 on 2026-08-05) |
| **Independently re-verified** | 2026-08-12 against `main` @ `ba49114`, clean tree |
| **Final counts** | **853 tests** — core **670 / 46 files**, UI **183 / 26 files** |
| **Typecheck** | clean in both workspaces |
| **Verification method** | every step's code change confirmed present in source, not inferred from the worklog |

**Verification notes — read before trusting an acceptance grep below.** Two acceptance criteria in
this document are self-superseding and will "fail" if re-run literally. Both were checked; neither
is a defect, and both are annotated in place at their step:

- **Step 0.3** demands zero `submitTurnLegacy` hits *and* that the eight-phase comment survive — but
  that comment names the function. See the amended criterion at Step 0.3.
- **Step 3.8** demands zero `JSON.stringify` in `packages/ui/src/screens/` — Step 6.1, which lands
  later, deliberately adds one for the Diagnostics JSON export. See the amended criterion at Step 3.8.

**Ledger note.** Phase 3 landed **833** (core 655 / UI 178) against a projected 835 (core 658 /
UI 177). Every Phase 3 step's behaviour change is present in source; the difference is which files
the tests landed in, which this plan explicitly anticipated ("treat the split as the check, not the
exact total", Step 3.8). The final total of 853 clears every ledger checkpoint.

### Completion checklist

**Phase 0 — Truth and safety**
- [x] 0.1 — Correct the stale test counts
- [x] 0.2 — Record the two undocumented defects in `CONTEXT.md`
- [x] 0.3 — Delete `submitTurnLegacy`

**Phase 1 — Memory reaches the model**
- [x] 1.1 — Name map wider than the present set
- [x] 1.2 — Inject character observations into the narrator prompt
- [x] 1.3 — Inject world soft state into the narrator prompt
- [x] 1.4 — Asymptotic delta scale for relationship saturation (M-7)
- [x] 1.5 — Optional thread id in Zod + lazy backfill on read
- [x] 1.6 — Enable the analyzer for No-Stats stories (all three statMode gates)

**Phase 2 — The DM behaves in character**
- [x] 2.1 — Graded disposition, derived and threaded into the counter-action chooser

**Phase 3 — Make it visible**
- [x] 3.1 — Type `Ruling.loot[].effects` in core, then format it in the UI
- [x] 3.2 — Select the ruling variant from the structured gate `code`, not a regex over prose
- [x] 3.3 — Emit the `npc` variant, and give it an honest reason
- [x] 3.4 — Route classifier failures to the `classifier-unavailable` ruling register
- [x] 3.5 — Render the opposed detail the engine already computed
- [x] 3.6 — The missing sixth Journal filter, and the last two JSON leaks
- [x] 3.7 — Stop fabricating the chapter number in the persistent header
- [x] 3.8 — Phase integration: prove the register is consistent, and record the count

**Phase 4 — Prove immutability**
- [x] 4.1 — Swipe immutability regression test + rewind logging

**Phase 5 — Suggestions**
- [x] 5.1 — Replace `sceneAnchors` with typed anchors

**Phase 6 — Observability**
- [x] 6.0 — Make the `"fallback"` stage outcome real
- [x] 6.1 — Local, opt-in counters and a Diagnostics screen

**Deferred queue — open, not scheduled.** Pick deliberately with the owner; see the full section at
the end of this file for each item's scope, blockers, and start condition.
- [ ] Plan 21 — Decompose `validateStorySchema` (**M**; blocked by nothing, unblocks nothing)
- [ ] Plan 19 — Land the NPC scene/actor model (**XL**, 1–3 months; owns the unbounded-rulings-read fix)
- [ ] Plan 20 — Port the v2 memory system (**XL**; needs Plan 19 landed first)
- [ ] Plan 18 — First-run onboarding (**L**; unblocked now that Phases 3 and 5 have shipped)
- [ ] Plan 23 — Art direction and a portrait pipeline (**XL**; Step 1 separable and cheap)
- [ ] Plan 10B — User-selectable image generation (**FUTURE / roadmap**; owner-classified, not scheduled)

---

## 0. How this differs from Plan 11, and why

I re-read every source file Plan 11 cites. Nine of its claims needed correcting before the work
could be specified without guesswork. **Read this table before starting; three of these change
scope materially.**

| # | Plan 11 said | Source says | Consequence |
| --- | --- | --- | --- |
| **1** | **Plan 9**: "swipe lets a player reroll until the narrator writes the outcome they wanted" | **False.** `history.ts:148` reads `store.rulings.listByMessage(narrator.id)` and passes those exact `Ruling` objects to `generateGuardedNarration`. It never calls `classify`, `resolve`, or `commit`. `MessageActions.tsx:103-124` already renders a `ROLL LOCKED ⚄` badge whose title is *"This turn committed a ruling — swiping rewrites the prose, never the outcome."* | **Plan 9 drops from M to XS.** The behaviour is shipped and unlabelled-as-tested. Step 4.1 adds the missing regression test and the rewind-logging half only. |
| **2** | **Plan 5**: thread ids need "migration 17" | Threads live inside `world_soft.soft_json` as JSON (`db.ts:152-155`), not in a column. A SQL migration would need `json_insert` over an array of objects. | **No migration at all.** Step 1.5 makes `id` optional in Zod and backfills lazily on read. Migration 17 stays reserved for Plan 19, so Plan 11's "sequence one migration, not two" instruction becomes moot. |
| **3** | **Plan 25.1**: "check whether Midnight Tavern overwrites relationships; if it does, port exponential smoothing" | It does **not** overwrite. `memory/softStore.ts:82` *accumulates* (`(existing?.trust ?? 0) + op.trustDelta`) then clamps. The analyzer emits **deltas**, not absolute observed values, so Memory-Keeper's `new = (1-α)·old + α·observed` has no `observed` to blend toward. | **25.1 is closed as not-applicable.** The real defect is saturation (M-7), and the correct fix is an asymptotic delta scale, not smoothing. Step 1.4. |
| **4** | **Plan 7**: "thread the engine-owned disposition into `chooseCounterAction`"; use a hostile/wary/neutral/friendly/allied ladder | There is no graded disposition anywhere. `npcIntroduction.ts:22` defines exactly one boolean: `NPC_HOSTILE_TO_PLAYER_FLAG = "npc_hostile_to_player"`, stored in `hard.flags`. The five-rung ladder does not exist. | Step 2.1 must **derive** a graded disposition from the boolean flag + soft-state relationship trust. Specified fully below; do not assume it exists. |
| **5** | **Plan 2**: "reuse `nameFor` (`context.ts:483`)" | `nameFor` is backed by `nameById` built from `present`, which is filtered to `requestedIds.has(record.id) && record.present` (`context.ts:477-483`). A relationship pointing at an **absent** character therefore still renders a raw id. | Step 1.1 needs a name map wider than the present set. Reusing `nameFor` as-is does not close M-8. |
| **6** | **Plan 6**: change `context.ts:498-503` and `turn.ts` | There are **three** statMode gates, not two: retrieval at `context.ts:498`, background accumulation at `turn.ts:1214`, and a third inside `history.ts:169` (`if (schema.statMode === "full")` around swipe's `runAnalyzer`). Missing the third means a No-Stats swipe silently stops accumulating. | Step 1.6 covers all three. |
| **7** | **Plan 22**: "delete the text processing; enumerate the catalog and run `checkGate`" | Gate enumeration **already exists** — `context.ts:341-372` runs `checkGate` over every schema action and feeds the survivors to the model as `CURRENTLY GATE-ALLOWED ACTIONS` (`suggestions.ts:246-249`). The defect is narrower: `sceneAnchors` (the reversed word bag) is *also* fed in, at `suggestions.ts:243`, and is the sole input to `deterministicFallbackSuggestions` (`suggestions.ts:77`). | Step 5.1 replaces `sceneAnchors` with typed anchors. It does **not** rebuild gate enumeration, which is already correct. |
| **8** | **Plan 19**: delete `submitTurnLegacy` as part of the XL turn split | `submitTurnLegacy` (`turn.ts:399`) is referenced by nothing. It is not in `turn.ts`'s export list and not in `orchestrator/index.ts`. It is dead code today. | Step 0.3 deletes it now, in minutes, instead of waiting months for Plan 19. |
| **9** | **Plan 14**: "a `formatEffect()` helper belongs next to the equipment types" | The root cause is upstream of formatting: `Ruling.loot[].effects` is declared `z.array(z.unknown()).optional()` at `types/events.ts:154`. `Play.tsx:1385` stringifies because the type carries no shape. | Step 3.1 types the field in core first, then formats. Formatting an `unknown` is the bug, not the fix. |

**Two additional defects I found that no audit file records.** Both are folded in below.

- **`Journal.tsx` has six `JournalKind` values but only five filter chips.** `"boundary"` (assigned at `Journal.tsx:263-266` for `chapter_started` / `arc_completed` / `rulebook_regenerated`) has no entry in `FILTERS` (`Journal.tsx:24-31`), so selecting *any* chip hides chapter and arc boundaries entirely. Step 3.6.
- **`StageMetric["outcome"]` declares `"fallback"` but `runStage` never emits it** (`stagePolicy.ts`; the persisted Zod enum in `turnOperations.ts` mirrors the same dead variant). Every stage that degrades to its fallback is recorded as `timeout` or `error`, so telemetry cannot distinguish "degraded gracefully" from "failed". Step 6.1 depends on fixing this, or the counters it adds will be wrong on arrival.

**One performance note, recorded but not scheduled:** `turn.ts:651` calls `store.rulings.listByStory(storyId)` — every ruling in the story — on every turn, solely to compute `recentSimilarUses` from the last five matching entries. On a 400-turn story that is a full-table scan per turn. Not urgent, not free. Fix it inside Plan 19's phase split, where the read is already moving.

---

## 1. Sequence, dependencies, and gates

Phases are ordered by dependency, not by value. Within a phase, steps are ordered; across phases,
a later phase may not start until the earlier one is green.

```
Phase 0  Truth & safety        0.1 → 0.2 → 0.3         (independent, ~1 day)
Phase 1  Memory reaches model  1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6   (~3 days)
Phase 2  DM behaves in character  2.1                  (~2 days, needs nothing from Phase 1)
Phase 3  Make it visible       3.1 → 3.2 → 3.3 → 3.4 → 3.5 → 3.6 → 3.7 → 3.8  (~4 days)
Phase 4  Prove immutability    4.1                     (~0.5 day)
Phase 5  Suggestions           5.1                     (~2 days)
Phase 6  Observability         6.0 → 6.1               (~3 days)
────────────────────────────── gate: full suite green, counts recorded ──────────
Deferred  Plan 21 → Plan 19 → Plan 20 → Plan 18 → Plan 23 → Plan 10B
```

**Hard dependency edges, stated explicitly so they are not violated:**

- `1.1 → 1.2`. Observations render on the same line as relationships. If names are not fixed first,
  1.2's "no raw id in any prompt" assertion will fail for reasons unrelated to 1.2.
- `1.5 → 1.6`. No Stats turns on the analyzer for a whole new population of stories. Ship trait
  supersession first or every No-Stats character accumulates permanent contradictions from turn one.
- `2.1 → 3.3`. The `npc` ruling variant renders a **reason**. Before 2.1 the only honest reason is
  "the engine treated your opposed check as an attack", which is the bug. Do not ship 3.3 first.
- `3.2 → 3.3`. Both edit the variant-selection branch of `rulingToArtifact`. Doing 3.3 first means
  rewriting it twice.
- `3.1 → 3.6`. Both touch `Journal.tsx` detail rows.
- `6.0 → 6.1`. The `"fallback"` outcome fix must land before counters are built on stage metrics.

**Every step follows the repo's existing discipline, which is non-negotiable here:** write the
failing test, run it, record the RED output, then edit production code. `AGENTS.md` and the plans
under `docs/superpowers/plans/` both require this, and the audit credits the project for actually
doing it (README §"What is genuinely well built").

**Commands.** `npm run typecheck` · `npm test --workspaces --if-present` ·
`npx vitest run <path>` for a focused file (from the relevant package directory).

### Test-count ledger — the single source of truth for every "expected total"

Measured baseline **792** (632 core / 160 UI), verified green with a clean typecheck at `3566c25`.
Each phase's acceptance criteria quotes the **cumulative** figure from this table. If a per-step
line elsewhere in this file disagrees with this table, **this table wins** — the step lines were
drafted per-phase and the cumulative chain is authoritative.

| After phase | Tests added | Cumulative | Note |
| --- | --- | --- | --- |
| baseline | — | **792** | 632 core / 160 UI |
| Phase 0 | 0 | **792** | doc edits + a pure deletion; count must not move |
| Phase 1 | +9 | **801** | |
| Phase 2 | +10 | **811** | |
| Phase 3 | +24 | **835** | core +7, UI +17 |
| Phase 4 | +2 | **837** | |
| Phase 5 | +1 | **838** | |
| Phase 6.0 | +6 | **844** | 843 is also correct — see the step's note on the superseded blocks |
| Phase 6.1 | +12 | **856** | 7 counter + 3 bridge + 2 screen |

**Treat the per-workspace split as the real check, not the total.** If a step's tests land in a
different file than specified the total still holds but the split will not, and that discrepancy is
worth catching at the phase boundary rather than three phases later.

---

## Phase 0 — Truth and safety

Nothing here changes runtime behaviour. It exists so the next six phases are read against accurate
documents and a smaller file.

### Step 0.1 — Correct the stale test counts

**Closes:** Plan 12 step 3, and file 01 §4's "stale claims" table.

**Why first.** Two documents in this repo state a test count, and both are wrong by ~40% and ~100%.
Every agent and human who reads them calibrates against a number that has not been true for weeks.
A reader who catches one stale number stops trusting the rest of the document — and the rest of these
documents is what the remaining phases are executed from.

**Files to modify**

- `Plan/next-phase-internal-beta.md:6`
- `README.md:250`

**Production edit — exact**

1. `Plan/next-phase-internal-beta.md:6` currently reads:

   ```
   Baseline when the phase started (HEAD `f6e9622`): **579 tests** (core 453 / ui 126). Tauri `0.2.5`.
   ```

   Replace with:

   ```
   Baseline when the phase started (HEAD `f6e9622`): **579 tests** (core 453 / ui 126). Tauri `0.2.5`.
   Current baseline (HEAD `3566c25`, measured 2026-08-02): **792 tests** (core 632 / ui 160).
   ```

   Keep the original line. It is a historical record of where the phase started and deleting it
   destroys that; the new line states where it is now.

2. `README.md:250` — replace the `393 tests (311 core, 82 UI)` claim with
   `792 tests (632 core, 160 UI)`. Read the surrounding sentence and preserve its grammar; do not
   blind-substitute.

**Do not** add the `**Status:**` line to every plan document (Plan 12 steps 1-2). That is 12+ files
of judgement calls about what is SHIPPED vs PARTIAL, and getting one wrong is worse than having none
— an agent that reads `SHIPPED` on something partial builds on a foundation that is not there. It is
scheduled as its own reviewed pass after Phase 6, not smuggled into a counts fix.

**RED test:** none. Documentation only.

**Acceptance criteria**

- `grep -rn "393 tests\|579 tests" README.md Plan/` returns only the historical line in
  `next-phase-internal-beta.md:6`, in a sentence that explicitly says "when the phase started".
- No `.ts` or `.tsx` file changed. `git diff --stat` shows exactly two files.

**Rollback:** `git checkout -- README.md Plan/next-phase-internal-beta.md`.

---

### Step 0.2 — Record the two undocumented defects in `CONTEXT.md`

**Closes:** nothing in the audit. These are findings from this plan's own source review (see §0).

**Why.** `CONTEXT.md` is the file that records known-unsatisfied invariants (see its "Task 15G
target invariants" section, lines 57-73). It is already the right home for "this is known to be
wrong and here is the ticket." Both defects below are fixed later in this plan; recording them
first means that if the plan is interrupted, the knowledge survives.

**File to modify:** `CONTEXT.md`, appended after line 73 (the end of the invariants block).

**Production edit — exact text to append**

```markdown
## Known defects with scheduled fixes

These are confirmed in source and scheduled in
`Audit/2026-08-02-PRODUCT-AUDIT/13-implementation-plan-final.md`. They are recorded here so an
agent reading this file does not rediscover them.

- **Journal filter chips are incomplete.** `packages/ui/src/screens/Journal.tsx` assigns six
  `JournalKind` values but `FILTERS` (`:24-31`) exposes five. `boundary` events — `chapter_started`,
  `arc_completed`, `rulebook_regenerated` — are reachable only under "All"; any chip selection hides
  them. Fixed in plan step 3.6.
- **`StageMetric` declares an outcome it never emits.** `orchestrator/stagePolicy.ts` types
  `outcome` to include `"fallback"`, and the persisted Zod enum in
  `store/repositories/turnOperations.ts` mirrors it, but `runStage` only ever emits `ok`,
  `cancelled`, `timeout`, or `error`. A stage that degraded gracefully to its fallback is recorded
  as an outright failure, so stage telemetry cannot distinguish the two. Fixed in plan step 6.0.
```

**RED test:** none. Documentation only.

**Acceptance criteria:** `CONTEXT.md` contains both entries; no source file changed.

**Rollback:** `git checkout -- CONTEXT.md`.

---

### Step 0.3 — Delete `submitTurnLegacy`

**Closes:** the first half of W-6 (file 07), and removes Plan 19's step 3 from Plan 19's scope.

**Why now rather than inside Plan 19.** Plan 11 schedules this deletion as part of an XL phase split
that is months away. It does not need to wait: the function has no callers. Carrying a second,
diverging implementation of the turn pipeline for months is exactly how "fixed in one path, not the
other" bugs are born, and Phase 1 and Phase 2 both edit code that `submitTurnLegacy` also contains a
stale copy of.

**Evidence it is dead — verify this yourself before deleting, do not take it on faith:**

```bash
cd "C:\Users\anuji\Documents\midnight-tavern-app"
grep -rn "submitTurnLegacy" --include=*.ts --include=*.tsx packages/
```

Expect exactly one hit: the declaration at `packages/core/src/orchestrator/turn.ts:399`. It is
absent from `orchestrator/index.ts`'s export list and from `packages/core/src/index.ts`.
**If the grep returns any other hit, stop and do not delete — re-scope this step to a deprecation
comment instead.**

**File to modify:** `packages/core/src/orchestrator/turn.ts`

**Production edit**

Delete the entire `submitTurnLegacy` function — declaration line 399 through its closing brace
(~line 555, immediately before `runTurnOperation`'s doc comment). Delete any import that becomes
unused as a result; `npm run typecheck` will name them (`noUnusedLocals` is on).

**Preserve the eight-phase comment.** Lines 413-554 inside that function carry the clearest
statement of the intended turn order anywhere in the repo, and file 02 §2.1 quotes it as such. Before
deleting, lift it verbatim into a block comment directly above `runTurnOperation` (line 568),
introduced with:

```ts
/**
 * The intended per-turn order, preserved verbatim from the retired `submitTurnLegacy`. This is the
 * product's core insight — compute (3) strictly precedes narrate (5), and commit (6) is atomic:
 *
 *   1. Persist the player message
 *   2. Classify — turn free text into a catalog action
 *   3. Resolve every intent into a staged ruling, nothing committed yet
 *   4. Assemble narrator context with rulings inline as facts
 *   5. Stream the narrator prose
 *   6. Persist prose + commit rulings in ONE transaction
 *   7. Fire-and-forget: analyzer patch, chapter/arc summaries
 *   8. Return prose + rulings for dice toasts
 */
```

**RED test:** none — this is a pure deletion. The existing suite is the regression net.

**Acceptance criteria**

- ~~`grep -rn "submitTurnLegacy" packages/` returns zero hits.~~ **Amended 2026-08-12.** As written
  this contradicts the criterion three lines below it ("the eight-phase comment survives"), because
  that comment names the retired function: `turn.ts:396` reads *"preserved verbatim from the retired
  `submitTurnLegacy`"*. A deliberate historical reference in a comment is not dead code. The correct
  check — verified passing on 2026-08-12 — tests for a *definition, call, or export* rather than any
  mention of the string:

  ```bash
  grep -rnE "submitTurnLegacy[[:space:]]*\(|function submitTurnLegacy|submitTurnLegacy[,;}]|export.*submitTurnLegacy" packages/*/src/
  ```

  This returns zero hits. Ignore `packages/core/dist/` entirely; it is a gitignored build artifact
  (`.gitignore:7`) and may hold stale symbols indefinitely.
- `npm run typecheck` passes.
- `npm test --workspaces --if-present` passes with **no change in test count** (792). A dropped test
  means something did reference it; revert and investigate.
- `packages/core/src/orchestrator/turn.ts` is ~157 lines shorter.
- The eight-phase comment survives, above `runTurnOperation`.

**Rollback:** `git checkout -- packages/core/src/orchestrator/turn.ts`.

---

## Phase 1 — Memory reaches the model

### Step 1.1 — Name map wider than the present set

**Closes:** M-8 (file 05 §3.3). **Effort: XS.**

**Root cause.** `packages/core/src/summarizer/injector.ts:45` renders raw ids in relationship lines:
```ts
.map((r) => `${r.toCharacterId}(trust ${r.trust.toFixed(1)}...)`)
```
And `packages/core/src/orchestrator/context.ts:477-483` builds `nameById` from the present set only,
so any absent character (dead, off-scene) renders as a raw UUID in `RULING:` lines.

**Files to modify**
- `packages/core/src/summarizer/injector.ts`
- `packages/core/src/orchestrator/context.ts`

**RED test — write first**

File: `packages/core/test/summarizer/summarizer.test.ts`, append to `describe("injector — condensing")`:

```ts
it("condenseSoftSlice renders relationship names, never raw ids", () => {
  let soft = newSoftState("mara", "Mara");
  soft = { ...soft, relationships: [
    { toCharacterId: "story-1:scene:warden", trust: -0.9, power: 0.5, feeling: "fears" },
  ]};
  const nameOf = (id: string) => id === "story-1:scene:warden" ? "The Warden" : undefined;
  const line = condenseSoftSlice(soft, nameOf);
  expect(line).toContain("The Warden");
  expect(line).not.toContain("story-1:scene:warden");
});

it("condenseSoftSlice falls back to a humanised label for unresolvable ids", () => {
  let soft = newSoftState("mara", "Mara");
  soft = { ...soft, relationships: [
    { toCharacterId: "story-1:scene:unknown-xyz", trust: 0.3, power: 0 },
  ]};
  const line = condenseSoftSlice(soft, () => undefined);
  expect(line).not.toMatch(/story-1:scene:/);
});
```

Run: both fail because `condenseSoftSlice` currently takes no `nameOf` parameter.

**Production edit**

1. `injector.ts` — change `condenseSoftSlice` signature:
```ts
export function condenseSoftSlice(
  soft: CharacterSoftState,
  nameOf: (id: string) => string | undefined = () => undefined
): string
```
In the relationship map, replace `r.toCharacterId` with:
```ts
nameOf(r.toCharacterId) ?? r.toCharacterId.split(":").at(-1) ?? r.toCharacterId
```
The `.split(":").at(-1)` strips the `story-1:scene:` prefix as a safe fallback.

2. `injector.ts` — `buildMemoryBlock` signature gains a resolver:
```ts
export async function buildMemoryBlock(
  store: Store,
  storyId: string,
  presentIds: string[],
  nameOf: (id: string) => string | undefined = () => undefined
): Promise<MemoryBlock>
```
Pass `nameOf` through to every `condenseSoftSlice` call inside.

3. `context.ts` — add `listByStory` (all characters, not just present) before building `nameById`:
```ts
const allChars = await store.characters.listByStory(storyId);
const nameById = new Map<string, string>();
for (const r of allChars) nameById.set(r.id, r.name);
for (const r of present) nameById.set(r.id, r.name); // present wins
const nameFor = (id: string) => nameById.get(id) ?? id;
```
Then pass `nameFor` to `buildMemoryBlock`:
```ts
const memoryBlock = await buildMemoryBlock(store, storyId, presentIds, nameFor);
```

If `store.characters.listByStory` does not exist, add it to
`packages/core/src/store/repositories/characters.ts` — it is `listPresentByStory` with the
`AND present = 1` clause removed. Register nothing new on the `Store` interface; it is the same
repository object.

**Acceptance criteria**
- Both new tests GREEN; three pre-existing `condenseSoftSlice` tests still pass.
- `npm run typecheck` clean.
- `expect(line).not.toMatch(/:scene:/)` holds for any condensed slice.

**Rollback:** `git checkout -- packages/core/src/summarizer/injector.ts packages/core/src/orchestrator/context.ts packages/core/test/summarizer/summarizer.test.ts`

---

### Step 1.2 — Inject character observations into the narrator prompt

**Closes:** M-1 (file 05 §3.1) — the primary memory wiring gap. **Effort: S.**

**Root cause.** `buildMemoryBlock` returns `{ arc?, chapters[], softSlices[] }`.
`assembleContext` uses `arc` and `chapters` but never uses `softSlices`. Confirm:
```bash
grep -n "softSlices" packages/core/src/orchestrator/context.ts
```
Expect zero hits.

**Files to modify**
- `packages/core/src/orchestrator/context.ts`
- `packages/core/test/orchestrator/context.test.ts` (create if absent)

**RED test — write first**

Test name: `"assembleContext includes soft-state observations in the memory block"`

```ts
it("assembleContext includes soft-state observations in the memory block", async () => {
  const store = await openStore(":memory:");
  // seed story + character with soft.observations = [{ turnIdx: 3, text: "drew a dagger" }]
  // call assembleContext
  const { userBlock } = await assembleContext(store, storyId, playerText, [], opts);
  expect(userBlock).toContain("drew a dagger");
});
```

Run: fails because `softSlices` is never appended.

**Production edit**

In `assembleContext`, after the block that pushes `storyMemory` (arc + chapters), add:

```ts
if (memoryBlock.softSlices.length > 0) {
  const softBlock = [
    "CHARACTER OBSERVATIONS (recent, from committed turns):",
    ...memoryBlock.softSlices,
  ].join("\n");
  pushIfFits("softObservations", softBlock);
}
```

Place this **after** `storyMemory` and **before** the raw recent-history loop so it shares the same
drop priority as chapter summaries (drops before raw history, never before rulings or hard state).

**Acceptance criteria**
- New test GREEN.
- Full suite ≥ **795** (ledger).
- `npm run typecheck` passes.

**Rollback:** `git checkout -- packages/core/src/orchestrator/context.ts packages/core/test/orchestrator/context.test.ts`

---

### Step 1.3 — Inject world soft state into the narrator prompt

**Closes:** M-2 (file 05 §3.2). **Effort: XS.**

**Root cause.** `buildMemoryBlock` does not include `WorldSoftState`. The world overview and
unresolved threads are written by the analyzer but never assembled into the narrator context.

**Files to modify**
- `packages/core/src/summarizer/injector.ts`
- `packages/core/src/orchestrator/context.ts`

**RED test — write first**

File: `packages/core/test/summarizer/summarizer.test.ts`, append to `describe("buildMemoryBlock")`:

```ts
it("buildMemoryBlock includes world overview when set", async () => {
  await applySoftPatch(store, STORY_ID,
    { characterOps: [], worldOps: [{ op: "set_overview_hint", text: "war looms in the north" }] }, 1);
  const block = await buildMemoryBlock(store, STORY_ID, []);
  expect(block.worldOverview).toBe("war looms in the north");
});

it("buildMemoryBlock includes unresolved threads", async () => {
  await applySoftPatch(store, STORY_ID,
    { characterOps: [], worldOps: [{ op: "add_thread", title: "The debt", note: "owed to a fence" }] }, 1);
  const block = await buildMemoryBlock(store, STORY_ID, []);
  expect(block.unresolvedThreads).toHaveLength(1);
  expect(block.unresolvedThreads[0]).toContain("The debt");
});
```

**Production edit**

1. `injector.ts` — extend `MemoryBlock`:
```ts
export interface MemoryBlock {
  arc?: string;
  chapters: string[];
  softSlices: string[];
  worldOverview?: string;
  unresolvedThreads: string[];
}
```
In `buildMemoryBlock` body, after soft slices:
```ts
const worldSoft = await store.worldSoft.get(storyId);
const worldOverview = worldSoft?.overview ?? undefined;
const unresolvedThreads = (worldSoft?.unresolvedThreads ?? [])
  .filter(t => !t.resolved)
  .map(t => `${t.title}${t.note ? `: ${t.note}` : ""}`);
return { arc, chapters, softSlices, worldOverview, unresolvedThreads };
```

2. `context.ts` — after the `softObservations` block from 1.2:
```ts
if (memoryBlock.worldOverview || memoryBlock.unresolvedThreads.length > 0) {
  const parts = ["WORLD STATE:"];
  if (memoryBlock.worldOverview) parts.push(`Overview: ${memoryBlock.worldOverview}`);
  if (memoryBlock.unresolvedThreads.length > 0)
    parts.push(`Open threads: ${memoryBlock.unresolvedThreads.join(" · ")}`);
  pushIfFits("worldState", parts.join("\n"));
}
```

**Acceptance criteria**
- Both new tests GREEN; existing `buildMemoryBlock` tests still pass.
- `npm run typecheck` passes.

**Rollback:** `git checkout -- packages/core/src/summarizer/injector.ts packages/core/src/orchestrator/context.ts`

---

### Step 1.4 — Asymptotic delta scale for relationship saturation (M-7)

**Closes:** M-7 (file 05 §3.7). **Effort: XS.**

**Root cause.** `packages/core/src/memory/softStore.ts:82-83`:
```ts
trust: clamp((existing?.trust ?? 0) + op.trustDelta, -1, 1)
```
Once trust reaches ±1 it is pinned permanently. A single `trustDelta: 0.9` saturates in one turn.
The fix is an asymptotic scale: each delta is attenuated by proximity to the boundary.

**File to modify:** `packages/core/src/memory/softStore.ts`

**RED test — write first**

File: `packages/core/test/memory/softStore.test.ts`, append to `adjust_relationship` suite:

```ts
it("large delta does not pin trust at 1 — subsequent negative delta still moves it", () => {
  let s = applyCharacterOp(base(),
    { op: "adjust_relationship", toCharacterId: "k", trustDelta: 0.95, powerDelta: 0 }, 0);
  expect(s.relationships[0]!.trust).toBeLessThan(1);
  const before = s.relationships[0]!.trust;
  s = applyCharacterOp(s,
    { op: "adjust_relationship", toCharacterId: "k", trustDelta: -0.3, powerDelta: 0 }, 1);
  expect(s.relationships[0]!.trust).toBeLessThan(before);
});
```

Also update the existing saturation test at line 83 — with asymptotic scale,
`0.7 + 0.9*(1-0.7) = 0.97`, not 1.0:
```ts
expect(rel.trust).toBeCloseTo(0.97, 2); // was toBe(1)
```

**Production edit**

Add a pure helper above `applyCharacterOp`:
```ts
function asymptoticDelta(current: number, delta: number): number {
  if (delta === 0) return 0;
  const towardBoundary = (delta > 0 && current > 0) || (delta < 0 && current < 0);
  return towardBoundary ? delta * (1 - Math.abs(current)) : delta;
}
```

In the `adjust_relationship` branch, replace the linear accumulation:
```ts
const newTrust = clamp(
  (existing?.trust ?? 0) + asymptoticDelta(existing?.trust ?? 0, op.trustDelta),
  -1, 1
);
const newPower = clamp(
  (existing?.power ?? 0) + asymptoticDelta(existing?.power ?? 0, op.powerDelta ?? 0),
  -1, 1
);
```

**Acceptance criteria**
- New test GREEN; updated saturation test GREEN.
- `npm run typecheck` passes.

**Rollback:** `git checkout -- packages/core/src/memory/softStore.ts packages/core/test/memory/softStore.test.ts`

---

### Step 1.5 — Optional thread id in Zod + lazy backfill on read

**Closes:** Plan 5 (file 11 §Plan 5). **Effort: XS.**

**Root cause.** `WorldSoftState.unresolvedThreads` items have no stable `id`. Threads live in
`world_soft.soft_json` as JSON (`db.ts:152-155`), not in a column, so a SQL migration would need
`json_insert` over an array of objects. The correct fix is Zod `.transform` + lazy backfill.

**Files to modify**
- `packages/core/src/types/softState.ts` (`StoryThreadSchema`)
- `packages/core/src/memory/softStore.ts` (`applyWorldOp` for `add_thread`)

**RED test — write first**

File: `packages/core/test/memory/softStore.test.ts`, append to `applyWorldOp` suite:

```ts
it("add_thread assigns a stable id", () => {
  const w = applyWorldOp(newWorldSoftState(),
    { op: "add_thread", title: "The debt", note: "owed to a fence" });
  expect(typeof w.unresolvedThreads[0]!.id).toBe("string");
  expect(w.unresolvedThreads[0]!.id.length).toBeGreaterThan(0);
});

it("legacy thread without id gets a backfilled id on parse", () => {
  const raw = { unresolvedThreads: [{ title: "Old", note: "", resolved: false }],
                locations: [], overview: "" };
  const parsed = WorldSoftStateSchema.parse(raw);
  expect(parsed.unresolvedThreads[0]!.id).toBeDefined();
});
```

**Production edit**

1. `types/softState.ts` — update `StoryThreadSchema`:
```ts
export const StoryThreadSchema = z.object({
  id: z.string().optional().transform(v => v ?? crypto.randomUUID()),
  title: z.string(),
  note: z.string(),
  resolved: z.boolean(),
});
```

2. `softStore.ts` — in `applyWorldOp` for `add_thread`, add `id: crypto.randomUUID()` to the new
   thread object so freshly created threads always carry an id without relying on the transform.

**Acceptance criteria**
- Both new tests GREEN.
- `npm run typecheck` passes. No migration file added.

**Rollback:** `git checkout -- packages/core/src/types/softState.ts packages/core/src/memory/softStore.ts`

---

### Step 1.6 — Enable the analyzer for No-Stats stories (all three statMode gates)

**Closes:** M-3 (file 05 §3.4). **Effort: S.**

**Root cause.** Three independent guards prevent the analyzer from running on No-Stats stories:

1. `packages/core/src/orchestrator/context.ts:498` — `buildMemoryBlock` only called when
   `statMode === "full"`.
2. `packages/core/src/orchestrator/turn.ts:1214` — `runBackground` only called when
   `statMode === "full"`.
3. `packages/core/src/orchestrator/history.ts:169` — swipe's `runAnalyzer` call is inside
   `if (schema.statMode === "full")`.

No-Stats stories accumulate zero soft memory. Characters have no observations, no mood, no
relationships. The narrator has no memory of anything that happened.

**Files to modify**
- `packages/core/src/orchestrator/context.ts`
- `packages/core/src/orchestrator/turn.ts`
- `packages/core/src/orchestrator/history.ts`

**RED test — write first**

File: `packages/core/test/orchestrator/turn.test.ts`, append:

```ts
it("No-Stats story: runBackground fires the analyzer and creates a soft profile", async () => {
  const store = await openStore(":memory:");
  const schema = makeStory({ storyId: "s1", statMode: "none" });
  await store.stories.insert({ id: "s1", title: schema.title, createdAt: 0, schema, locked: true });
  // insert player character
  // submit a turn with scripted router
  const char = await store.characters.get(playerId);
  expect(char?.soft).toBeDefined();
});
```

**Production edit**

1. `context.ts:498` — remove the `statMode === "full"` guard around `buildMemoryBlock`. The block
   is budget-gated; an empty block costs nothing.

2. `turn.ts:1214` — change:
```ts
if (schema.statMode === "full") { runBackground(...) }
```
to:
```ts
runBackground(...)
```
Inside `runBackground`, chapter/arc summarizers already check thresholds internally; they fire or
not based on settings, not a hard gate. `runAnalyzer` has no statMode guard of its own.

3. `history.ts:169` — remove the `if (schema.statMode === "full")` wrapper around the swipe
   `runAnalyzer` call. Keep the inner `try/catch`.

**Acceptance criteria**
- New test GREEN.
- `npm run typecheck` passes.
- Full suite ≥ **801** — Phase 1 complete (ledger).

**Rollback:** `git checkout -- packages/core/src/orchestrator/context.ts packages/core/src/orchestrator/turn.ts packages/core/src/orchestrator/history.ts`

---

## Phase 2 — The DM behaves in character

### Step 2.1 — Graded disposition, derived and threaded into the counter-action chooser

**Closes:** D-1 and D-2 (file 06 §3). **Effort: M.** This is the phase.

**Root cause, both halves.**

*D-1 — every opposed contest is an attack.* `packages/core/src/orchestrator/npcAgency.ts:77-90`:
```ts
export function isProvocation(action, ruling, stakes?): boolean {
  return (
    action.category === "combat" ||
    action.opposed === true ||          // ← fires on a staring contest
    dealsTargetHarm(action) ||
    dealtCommittedTargetHarm(ruling) ||
    stakes === "danger" ||
    stakes === "opposed"                // ← and again here
  );
}
```
`opposed === true` covers *persuade against resistance*, *intimidate*, *out-stare*, *haggle*. The
function's own doc comment at `:75` says beneficial and harmless acts are not provocations. The
implementation contradicts it. `CONTEXT.md` invariant 8 states the target directly: *"`opposed`
describes how a roll is resolved; it does not imply hostility."*

*D-2 — every NPC answers identically.* `chooseCounterAction` (`npcAgency.ts:107-127`) takes
`(schema, npc, attackerId)` and returns the **first** catalog action that is `category === "combat"`,
deals target harm, and passes the gate. Reordering `schema.actions` changes every NPC's behaviour in
the game.

**The disposition data does not exist as Plan 11 describes it.** This is correction #4 in §0. The
only engine-owned disposition fact is one boolean, `npcIntroduction.ts:22`:
```ts
export const NPC_HOSTILE_TO_PLAYER_FLAG = "npc_hostile_to_player";
```
set on `hard.flags` at `npcIntroduction.ts:301-323` when prose explicitly shows the NPC attacking the
player. There is no hostile/wary/neutral/friendly/allied ladder anywhere. It must be **derived** from
that boolean plus the soft-state relationship trust the analyzer already maintains.

**Files to modify**
- `packages/core/src/orchestrator/npcAgency.ts`
- `packages/core/src/orchestrator/turn.ts` (call sites only)
- `packages/core/test/orchestrator/npcAgency.test.ts`

**RED tests — write all four first, observe all four fail**

File: `packages/core/test/orchestrator/npcAgency.test.ts`

```ts
describe("deriveDisposition", () => {
  it("returns hostile when the engine flag is set, regardless of trust", () => {
    const npc = makeHard({ flags: { [NPC_HOSTILE_TO_PLAYER_FLAG]: true } });
    const soft = softWithTrust("npc-1", 0.9);
    expect(deriveDisposition(npc, soft)).toBe("hostile");
  });
  it("returns wary at trust <= -0.4 with no flag", () => {
    expect(deriveDisposition(makeHard({ flags: {} }), softWithTrust("npc-1", -0.5))).toBe("wary");
  });
  it("returns friendly at trust >= 0.4 with no flag", () => {
    expect(deriveDisposition(makeHard({ flags: {} }), softWithTrust("npc-1", 0.6))).toBe("friendly");
  });
  it("returns neutral with no flag and no relationship", () => {
    expect(deriveDisposition(makeHard({ flags: {} }), undefined)).toBe("neutral");
  });
});

describe("isHostileAct vs isOpposedContest", () => {
  it("a bare opposed social action is NOT a hostile act", () => {
    const action = makeAction({ id: "persuade", category: "social", opposed: true });
    expect(isHostileAct(action, makeRuling({}), undefined)).toBe(false);
    expect(isOpposedContest(action)).toBe(true);
  });
  it("a combat action IS a hostile act", () => {
    const action = makeAction({ id: "strike", category: "combat" });
    expect(isHostileAct(action, makeRuling({}), undefined)).toBe(true);
  });
  it("an action whose committed ruling dealt target harm IS a hostile act", () => {
    const action = makeAction({ id: "shove", category: "utility" });
    const ruling = makeRuling({ effectsApplied: { resourceDeltaTarget: { hp: -3 }, narrationHint: "" } });
    expect(isHostileAct(action, ruling, undefined)).toBe(true);
  });
});

describe("planNpcReactions — disposition gating", () => {
  it("a failed opposed SOCIAL action against a neutral NPC produces no counter-attack", () => {
    // schema has persuade(social, opposed) and strike(combat, harms)
    const intents = planNpcReactions(ctxWith({
      action: "persuade", npcFlags: {}, trust: 0,
    }));
    expect(intents).toHaveLength(0);
  });
  it("a genuine attack still produces a counter-attack", () => {
    const intents = planNpcReactions(ctxWith({ action: "strike", npcFlags: {}, trust: 0 }));
    expect(intents).toHaveLength(1);
    expect(intents[0]!.actionId).toBe("strike");
  });
  it("two differently-disposed NPCs answer the same hostile act differently", () => {
    const hostile = planNpcReactions(ctxWith({
      action: "strike", npcFlags: { [NPC_HOSTILE_TO_PLAYER_FLAG]: true }, trust: 0 }));
    const friendly = planNpcReactions(ctxWith({ action: "strike", npcFlags: {}, trust: 0.8 }));
    expect(hostile[0]!.actionId).not.toEqual(friendly[0]?.actionId ?? null);
  });
});
```

**Production edit — exact**

1. **Add the disposition type and deriver** in `npcAgency.ts`, above `isProvocation`:

```ts
/** Engine-derived stance of one NPC toward one actor. Ordered least→most cooperative. */
export type NpcDisposition = "hostile" | "wary" | "neutral" | "friendly";

/** Trust at or below this reads as wary; at or above the positive twin, friendly. */
export const WARY_TRUST_THRESHOLD = -0.4;
export const FRIENDLY_TRUST_THRESHOLD = 0.4;

/**
 * Derive a graded disposition from the two facts the engine actually owns: the validated
 * hostility flag (authoritative, set only from explicit narrated attacks on the player) and the
 * analyzer's accumulated relationship trust (advisory). The flag always wins — a validated
 * hostile actor is hostile no matter what the analyzer thinks.
 */
export function deriveDisposition(
  npc: CharacterHardState,
  npcSoft: CharacterSoftState | undefined,
  towardId: string
): NpcDisposition {
  if (npc.flags[NPC_HOSTILE_TO_PLAYER_FLAG] === true) return "hostile";
  const trust = npcSoft?.relationships.find((r) => r.toCharacterId === towardId)?.trust ?? 0;
  if (trust <= WARY_TRUST_THRESHOLD) return "wary";
  if (trust >= FRIENDLY_TRUST_THRESHOLD) return "friendly";
  return "neutral";
}
```

2. **Split `isProvocation` in two.** Keep the old name exported as a deprecated alias for one
   release so nothing outside this file breaks silently:

```ts
/**
 * A genuinely offensive act. Deliberately EXCLUDES bare `opposed` and bare `stakes === "opposed"`
 * (CONTEXT.md invariant 8): a contest of nerve or persuasion is not violence.
 */
export function isHostileAct(
  action: ActionDef,
  ruling: Ruling,
  stakes?: MechanicalIntent["stakes"]
): boolean {
  return (
    action.category === "combat" ||
    dealsTargetHarm(action) ||
    dealtCommittedTargetHarm(ruling) ||
    stakes === "danger"
  );
}

/** A direct contest that is not violence. Warrants a response, never an attack. */
export function isOpposedContest(action: ActionDef): boolean {
  return action.opposed === true && !dealsTargetHarm(action);
}

/** @deprecated Use isHostileAct / isOpposedContest. Retained one release for external callers. */
export const isProvocation = isHostileAct;
```

3. **Rewrite `chooseCounterAction`** to take disposition and select by preference order:

```ts
function chooseCounterAction(
  schema: StorySchema,
  npc: CharacterHardState,
  attackerId: string,
  disposition: NpcDisposition,
  wasHarmed: boolean
): MechanicalIntent | undefined {
  const weaponId = heldWeaponId(schema, npc);
  const build = (action: ActionDef): MechanicalIntent => ({
    actorId: npc.characterId,
    actionId: action.id,
    targetId: attackerId,
    stakes: action.category === "combat" ? "danger" : "uncertain",
    confidence: 1,
    ...(action.requiresItemKind === "weapon" && weaponId ? { itemId: weaponId } : {}),
  });
  const legal = (action: ActionDef) => checkGate(schema, npc, build(action)).allowed;
  const harmful = schema.actions.filter((a) => a.category === "combat" && dealsTargetHarm(a));
  const nonHarmful = schema.actions.filter((a) => !dealsTargetHarm(a) && a.opposed === true);
  const social = schema.actions.filter((a) => a.category === "social" && !dealsTargetHarm(a));

  // Preference order by disposition. Every candidate still passes the same gate the player does;
  // this only changes WHICH sealed action is proposed, never whether the engine adjudicates it.
  const order: ActionDef[][] =
    disposition === "hostile" ? [harmful, nonHarmful, social]
    : disposition === "wary"  ? (wasHarmed ? [harmful, nonHarmful, social] : [nonHarmful, social])
    : disposition === "friendly" ? [social, nonHarmful]
    : (wasHarmed ? [harmful, nonHarmful, social] : [nonHarmful, social]); // neutral

  for (const tier of order) {
    const found = tier.find(legal);
    if (found) return build(found);
  }
  return undefined; // Silence is correct. A manufactured punch is not.
}
```

4. **Thread it through `planNpcReactions`.** Extend `NpcReactionContext` with an optional soft
   lookup, defaulted so existing tests compile:

```ts
export interface NpcReactionContext {
  // ...existing fields unchanged...
  /** Soft profiles keyed by characterId, for disposition. Absent ⇒ every NPC reads as neutral. */
  softById?: ReadonlyMap<string, CharacterSoftState>;
}
```

In the loop body, replace the `isProvocation` call and the `chooseCounterAction` call:

```ts
const stakes = stakesByTurnId?.get(ruling.turnId);
const hostile = isHostileAct(action, ruling, stakes);
const contest = isOpposedContest(action);
if (!hostile && !contest) continue;

const npc = workingById.get(targetId);
if (!npc || !npc.alive) continue;
// ...existing budget/attacker guards unchanged...

const disposition = deriveDisposition(npc, softById?.get(targetId), ruling.actorId);
const wasHarmed = dealtCommittedTargetHarm(ruling);
// A pure contest never justifies harm from anyone but an already-hostile actor.
if (contest && !hostile && disposition !== "hostile" && !wasHarmed) {
  const response = chooseCounterAction(schema, npc, ruling.actorId, disposition, false);
  if (!response) continue;
  intents.push(response);
  spent.set(targetId, (spent.get(targetId) ?? 0) + 1);
  continue;
}
const reaction = chooseCounterAction(schema, npc, ruling.actorId, disposition, wasHarmed);
if (!reaction) continue;
```

5. **`planHostileNpcFallback` (`npcAgency.ts:272-287`) also calls `chooseCounterAction`.** It already
   filters on `flags[NPC_HOSTILE_TO_PLAYER_FLAG] !== true`, so pass `"hostile"` and `true`
   explicitly: `chooseCounterAction(input.schema, npc, playerId, "hostile", true)`.

6. **`turn.ts` call site.** Where `planNpcReactions({ ... })` is invoked, add `softById`. The present
   roster is already fetched there; build the map from `record.soft` and skip characters without one.

**Acceptance criteria**
- All ten new tests GREEN.
- `DEFAULT_NPC_ENCOUNTER_BUDGET = 1` and every existing presence/alive/gate guard unchanged — diff
  `planNpcReactions`'s guard block and confirm only the predicate and chooser lines moved.
- Full suite green, count ≥ **811** — Phase 2 complete (ledger).
- Manual: losing an opposed social check against a friendly NPC produces no damage ruling.

**Rollback:** `git checkout -- packages/core/src/orchestrator/npcAgency.ts packages/core/src/orchestrator/turn.ts packages/core/test/orchestrator/npcAgency.test.ts`

**Note.** This is a targeted fix to one file. Plan 19 (deferred) is the structural cure — the
predicates here become inputs to its event model. Doing this first removes a user-visible absurdity
in days rather than months, and the two do not conflict.

---

## Phase 3 — Make it visible

This phase closes the audit's UI cluster: U-2, U-6, U-7, U-8, U-9, U-10, U-11 (file 08), and the
Journal filter defect recorded in §0 that no audit file caught. **Nothing here invents a new
surface.** Every step either renders state the engine already computes and the UI already receives,
or types a field so it *can* be rendered. That framing matters for scoping: file 08 §5 lists eight
"cheapest path" items and seven of them are wiring, not design.

**One structural rule for the whole phase.** Two steps (3.2 and 3.3) edit the same
variant-selection branch of `rulingToArtifact` (`packages/ui/src/screens/Play.tsx:153-245`), and two
steps (3.1 and 3.6) edit the same `Journal.tsx` detail-row construction. Doing them out of order
means writing the same code twice. The order below is not a preference.

**Phase 2 is a hard prerequisite for 3.3 only.** 3.1, 3.2 and 3.4-3.7 have no dependency on Phase 2
and can start immediately.

---

### Step 3.1 — Type `Ruling.loot[].effects` in core, then format it in the UI

**Closes:** the loot-effects third of U-6 (file 08 §U-6). **Effort: S.** This is correction #9 in §0.

**Root cause is in core, not the UI.** `packages/core/src/types/events.ts:154` declares the field
with no shape at all:

```ts
effects: z.array(z.unknown()).optional(),
```

The producer already has the typed value — `packages/core/src/orchestrator/turn.ts:997` assigns
`effects: award.definition.effects`, and `ItemDefinition.effects` is
`z.array(EquipmentEffectSchema).default([])` (`packages/core/src/types/equipment.ts:90`), a
seven-arm discriminated union on `type` (`equipment.ts:37-75`). So a fully typed value is
constructed, then widened to `unknown` by the ruling schema, and the UI is left holding an
`unknown` it cannot do anything with except serialise it —
`packages/ui/src/screens/Play.tsx:1385`:

```ts
effects: (item.effects ?? []).map((effect) => JSON.stringify(effect)),
```

which lands in `LootAward`'s effect list (`packages/ui/src/components/LootAward.tsx:53`) and prints
`{"type":"attribute_score","attributeId":"might","amount":2}` on a player-facing card. Plan 14 step
2 proposes "a `formatEffect()` helper belongs next to the equipment types" — correct destination,
wrong starting point. **You cannot format an `unknown`.** Type it first; the formatter then falls
out of the discriminated union with exhaustiveness checking, and any future arm added to
`EquipmentEffectSchema` becomes a compile error here rather than a JSON leak in production.

**Files to modify**
- `packages/core/src/types/events.ts`
- `packages/core/src/engine/equipment.ts` (new exported `formatEquipmentEffect`)
- `packages/ui/src/screens/Play.tsx`

**RED test — write first, run first, record the failure**

File: `packages/core/test/v7EquipmentLoot.test.ts`, appended as a new top-level `describe` after
`describe("V7 loot validation", …)` (which closes at the end of the file):

```ts
describe("formatEquipmentEffect", () => {
  it("formats an attribute_score effect as signed prose", () => {
    expect(formatEquipmentEffect({ type: "attribute_score", attributeId: "might", amount: 2 }))
      .toBe("+2 Might");
  });

  it("formats a negative amount with a minus sign", () => {
    expect(formatEquipmentEffect({ type: "skill_check", skillId: "stealth", amount: -1 }))
      .toBe("−1 Stealth checks");
  });

  it("formats every arm of the union without emitting JSON punctuation", () => {
    const all: EquipmentEffect[] = [
      { type: "attribute_score", attributeId: "might", amount: 2 },
      { type: "skill_check", skillId: "lockpicking", amount: 1 },
      { type: "action_check", actionId: "pick_lock", amount: 1 },
      { type: "resource_capacity", resourceId: "hp", amount: 4 },
      { type: "action_enable", actionId: "parry" },
      { type: "skill_enable", skillId: "blade", rank: "adept" },
      { type: "lifestyle", capabilityId: "warm", description: "You never sleep cold." },
    ];
    for (const effect of all) {
      const text = formatEquipmentEffect(effect);
      expect(text).not.toMatch(/[{}"[\]]/);
      expect(text.length).toBeGreaterThan(0);
    }
  });

  it("LootRulingSchema rejects an effect that is not a valid EquipmentEffect", () => {
    const base = {
      itemInstanceId: "i1", itemDefinitionId: "d1", ownerCharacterId: "c1",
      name: "Vale Saber", tier: "rare" as const, quantity: 1, provenanceSummary: "Encounter cleared",
    };
    expect(() => LootRulingSchema.parse({ ...base, effects: [{ type: "not_a_real_effect" }] }))
      .toThrow();
    expect(LootRulingSchema.parse({
      ...base, effects: [{ type: "attribute_score", attributeId: "might", amount: 2 }],
    }).effects).toHaveLength(1);
  });
});
```

Add `formatEquipmentEffect`, `LootRulingSchema` and `type EquipmentEffect` to the existing
`from "../src/index.js"` import block at the top of that file.

Run `npx vitest run test/v7EquipmentLoot.test.ts` from `packages/core`. Expect all four RED:
the first three because `formatEquipmentEffect` does not exist, the fourth because
`z.array(z.unknown())` accepts anything.

**Production edit**

1. `packages/core/src/types/events.ts` — import the effect schema alongside the tier import at
   line 14, then replace line 154.

```ts
import { ItemTierSchema, EquipmentEffectSchema } from "./equipment.js";
```

```ts
  effects: z.array(EquipmentEffectSchema).optional(),
```

2. `packages/core/src/engine/equipment.ts` — append a pure formatter. It lives beside the other
   equipment functions (this file already exports `equippedEffects` at `:284`), so core and UI
   share one rendering of an effect and cannot drift.

```ts
/** "pick_lock" → "Pick Lock". Ids are the only labels a ruling carries for these. */
function label(id: string): string {
  return id.replace(/[_-]+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

function signed(amount: number): string {
  return amount >= 0 ? `+${amount}` : `−${Math.abs(amount)}`;
}

/**
 * One equipment effect as a player-facing sentence fragment. Exhaustive over
 * `EquipmentEffectSchema` — adding an arm to that union without adding a case here is a compile
 * error, which is the point: it is what stops a raw object reaching a loot card again.
 */
export function formatEquipmentEffect(effect: EquipmentEffect): string {
  switch (effect.type) {
    case "attribute_score":
      return `${signed(effect.amount)} ${label(effect.attributeId)}`;
    case "skill_check":
      return `${signed(effect.amount)} ${label(effect.skillId)} checks`;
    case "action_check":
      return `${signed(effect.amount)} ${label(effect.actionId)}`;
    case "resource_capacity":
      return `${signed(effect.amount)} max ${label(effect.resourceId)}`;
    case "action_enable":
      return `Enables ${label(effect.actionId)}`;
    case "skill_enable":
      return `Grants ${label(effect.skillId)} at ${effect.rank}`;
    case "lifestyle":
      return effect.description;
  }
}
```

Import `EquipmentEffect` in that file's type import block if it is not already present.

3. `packages/ui/src/screens/Play.tsx:1385` — replace the stringify with the shared formatter.

```ts
    effects: (item.effects ?? []).map(formatEquipmentEffect),
```

Add `formatEquipmentEffect` to Play.tsx's existing `@midnight-tavern/core` import. If the bridge
re-exports the surface rather than importing core directly, follow the pattern already used for
other core imports in that file — do not add a second import path for the same package.

**Acceptance criteria**
- All four new tests GREEN.
- `npm run typecheck` clean in both workspaces. In particular `Play.tsx:1385` no longer type-checks
  against `unknown`, which is the proof the widening is gone.
- `grep -n "JSON.stringify" packages/ui/src/screens/Play.tsx` returns zero hits.
- A loot card with an `attribute_score` effect renders `+2 Might`, not `{"type":…}`.
- Full suite ≥ **815** (ledger: 811 + 4).

**Rollback:** `git checkout -- packages/core/src/types/events.ts packages/core/src/engine/equipment.ts packages/ui/src/screens/Play.tsx packages/core/test/v7EquipmentLoot.test.ts`

---

### Step 3.2 — Select the ruling variant from the structured gate `code`, not a regex over prose

**Closes:** U-10 (file 08 §U-10), and it is the precondition for 3.3. **Effort: S.**

**Root cause.** `rulingToArtifact`'s denied branch decides which of three refusal cards to render by
pattern-matching a human-readable sentence — `packages/ui/src/screens/Play.tsx:157-161`:

```ts
    const variant = /action budget|actions per turn|overflow/i.test(reason)
      ? "budget-exceeded"
      : /target|clarif/i.test(reason)
        ? "unresolved"
        : "denied";
```

`GateVerdict` already carries a machine code — `packages/core/src/types/events.ts:91-103` enumerates
`schema_unlocked`, `unknown_action`, `actor_dead`, `skill_required`, `rank_required`,
`item_required`, `cannot_afford`, `prerequisite_failed`, `action_budget_exceeded` — and
`checkGate` sets it on every denial through one helper (`packages/core/src/engine/gate.ts:39-43`).
Rewording the budget message at `packages/core/src/engine/actionBudget.ts:33` silently downgrades a
budget refusal to a generic DENIED card, and today `/target|clarif/i` matches any reason merely
*mentioning* a target — `skill_required` phrasing about a target would misroute.

**There is a real gap in core that must be closed for this to work, and Plan 17 step 4 does not
mention it.** The budget refusal ruling is not built by `checkGate`; it is hand-constructed at
`packages/core/src/orchestrator/turn.ts:271-288`, and its gate literal omits the code entirely
(`turn.ts:284`):

```ts
    gate: { allowed: false, reason },
```

So switching the UI to read `r.gate.code` without fixing this makes every budget refusal render as
`denied`. Fix core first, in the same step.

**`unresolved` is not a gate code and must not be faked into one.** Unresolved targets come from the
classifier, not the gate — `packages/core/src/classifier/classify.ts:215`, `:233`, `:266`, `:308`
and `:455` all raise an `unresolved_target` *recovery issue*, and that path renders through
`ClassifierRecovery` (`Play.tsx:1150-1163`, `:1552-1615`), not through a `Ruling`. A denied `Ruling`
therefore never legitimately means "needs clarification". Keep the `unresolved` variant reachable
from the classifier path in 3.4; in this step the ruling-derived mapping is exactly two outcomes.

**Files to modify**
- `packages/core/src/orchestrator/turn.ts`
- `packages/ui/src/screens/Play.tsx`

**RED test — write first**

File: `packages/core/test/orchestrator/turn.test.ts`, appended:

```ts
it("a budget-refusal ruling carries the action_budget_exceeded gate code", async () => {
  // Story with actionBudget 1; classifier returns two player intents.
  const result = await submitTurn(router, store, storyId, "I strike, then I sprint away.");
  const refused = result.rulings.filter((ruling) => !ruling.gate.allowed);
  expect(refused).toHaveLength(1);
  expect(refused[0]!.gate.code).toBe("action_budget_exceeded");
});
```

File: `packages/ui/test/screens/Play.test.tsx`, appended:

```ts
it("renders the budget-exceeded variant from the gate code, not the reason text", async () => {
  const bridge = makeMemoryBridge();
  bridge.listRulings = async () => [
    {
      turnId: "hero:sprint:budget",
      messageId: "m1",
      actorId: "hero",
      actionId: "sprint",
      actionLabel: "Sprint",
      gate: { allowed: false, code: "action_budget_exceeded", reason: "Reworded entirely." },
      effectsApplied: null,
    },
  ];
  setBridge(bridge);
  render(<Play storyId="story-1" />);
  const card = await screen.findByRole("group", { name: /ACTION BUDGET/ });
  expect(card).toHaveAttribute("data-variant", "budget-exceeded");
});

it("renders denied for a skill_required gate code whose reason mentions a target", async () => {
  const bridge = makeMemoryBridge();
  bridge.listRulings = async () => [
    {
      turnId: "hero:pick_lock",
      messageId: "m1",
      actorId: "hero",
      actionId: "pick_lock",
      gate: {
        allowed: false,
        code: "skill_required",
        reason: "Requires Lockpicking — not learned; choose another target.",
      },
      effectsApplied: null,
    },
  ];
  setBridge(bridge);
  render(<Play storyId="story-1" />);
  const card = await screen.findByRole("group", { name: /DENIED/ });
  expect(card).toHaveAttribute("data-variant", "denied");
});
```

Both UI tests fail today: the first because the reworded reason no longer matches the budget regex,
the second because `/target|clarif/i` matches "target" and renders `unresolved`. Match the existing
bridge-stub and render idioms already used in `packages/ui/test/screens/Play.test.tsx`; do not
introduce a second mocking style.

**Production edit**

1. `packages/core/src/orchestrator/turn.ts:284` — set the code the schema already allows.

```ts
    gate: { allowed: false, reason, code: "action_budget_exceeded" },
```

2. `packages/ui/src/screens/Play.tsx:157-161` — replace the regex ladder with a code lookup.

```ts
    // The gate's machine code is authoritative. Never parse the reason: it is player-facing prose
    // and rewording it must not change which card the player sees (U-10).
    const variant: RulingArtifactVariant =
      r.gate.code === "action_budget_exceeded" ? "budget-exceeded" : "denied";
```

Delete nothing else in that branch: the `label`, `reason` and `detailRows` construction at
`Play.tsx:162-172` is correct as written, and its `variant === "unresolved"` ternary arms become
dead but harmless — 3.4 makes `unresolved` reachable again from the classifier path, so leave them.

**Acceptance criteria**
- All three new tests GREEN.
- `grep -nE "test\(reason\)|/action budget|/target\|clarif/" packages/ui/src/screens/Play.tsx`
  returns zero hits — no UI decision reads English any more.
- No `Ruling`-derived code path can produce `unresolved`; verified by
  `grep -n '"unresolved"' packages/ui/src/screens/Play.tsx` returning only label/ternary text, no
  variant assignment.
- `npm run typecheck` clean. Full suite ≥ **818** (ledger: 815 + 3).

**Rollback:** `git checkout -- packages/core/src/orchestrator/turn.ts packages/ui/src/screens/Play.tsx packages/core/test/orchestrator/turn.test.ts packages/ui/test/screens/Play.test.tsx`

---

### Step 3.3 — Emit the `npc` variant, and give it an honest reason

**Closes:** the first and most severe consequence of U-2 (file 08 §U-2 item 1), and the UI half of
D-1 (file 06). **Effort: S. Requires Phase 2 (step 2.1) to be green.**

**Root cause, two halves.** `RulingArtifactVariant` declares `npc`
(`packages/ui/src/components/RulingArtifact.tsx:64`), `LABEL_BY_VARIANT` gives it
`"RULING · NPC"` (`:103`), and `accentFor` handles it (`:114`) — the renderer is complete.
`rulingToArtifact` can never emit it: the allowed-and-rolled branch computes
`opposed ? "opposed" : VARIANT_BY_OUTCOME[outcome]` (`packages/ui/src/screens/Play.tsx:179`) with no
actor test anywhere. And NPC rulings genuinely reach that branch — `turn.ts:887-905` resolves every
intent from `planNpcReactions` and pushes the result into the same `rulings` array the UI renders.

So when an NPC acts against the player, the card is indistinguishable from the player's own, and it
states no reason. File 08 §U-2 is precise about why that matters: *"The player sees an unexplained
attack and concludes the AI made it up — the precise accusation the product exists to refute."*

**Why this waits for Phase 2.** The reason must be true. Before step 2.1, the only honest sentence
is "the engine treated your opposed check as an attack" — which is the D-1 bug, not an explanation.
After 2.1, `deriveDisposition` exists and the reaction path knows *which* stance produced the
action, so the card can say something a player can act on.

**Files to modify**
- `packages/core/src/orchestrator/npcAgency.ts` (return the reason alongside the intent)
- `packages/core/src/orchestrator/turn.ts` (stamp it onto the resolved ruling)
- `packages/core/src/types/events.ts` (one optional field on `RulingSchema`)
- `packages/ui/src/screens/Play.tsx` (emit the variant, render the reason)

**RED tests — write first**

File: `packages/core/test/orchestrator/npcAgency.test.ts`, appended:

```ts
describe("planNpcReactionsDetailed", () => {
  it("returns the disposition and a reason beside each intent", () => {
    const planned = planNpcReactionsDetailed(ctxWith({ action: "strike", npcFlags: {}, trust: 0 }));
    expect(planned).toHaveLength(1);
    expect(planned[0]!.disposition).toBe("neutral");
    expect(planned[0]!.reason).toMatch(/struck|harmed/i);
  });

  it("planNpcReactions still returns bare intents (existing callers unchanged)", () => {
    const intents = planNpcReactions(ctxWith({ action: "strike", npcFlags: {}, trust: 0 }));
    expect(intents[0]!.actionId).toBe("strike");
    expect((intents[0] as Record<string, unknown>)["reason"]).toBeUndefined();
  });
});
```

File: `packages/ui/test/screens/Play.test.tsx`, appended:

```ts
it("renders the npc variant with its reason when the actor is not the player", async () => {
  const bridge = makeMemoryBridge();
  bridge.listPresentCast = async () => [
    { characterId: "hero", name: "Kestrel", isPlayer: true, alive: true },
    { characterId: "warden", name: "The Warden", isPlayer: false, alive: true },
  ];
  bridge.listRulings = async () => [
    {
      turnId: "warden:strike",
      messageId: "m1",
      actorId: "warden",
      actionId: "strike",
      actionLabel: "Strike",
      targetId: "hero",
      gate: { allowed: true },
      roll: { d20: 15, modifier: 2, total: 17, dc: 14, outcome: "success" },
      effectsApplied: null,
      npcReactionReason: "You struck them first.",
    },
  ];
  setBridge(bridge);
  render(<Play storyId="story-1" />);
  const card = await screen.findByRole("group", { name: /NPC/ });
  expect(card).toHaveAttribute("data-variant", "npc");
  expect(screen.getByTestId("ruling-reason")).toHaveTextContent("You struck them first.");
});
```

The UI test fails twice over: the variant is `success`, and `RulingArtifact` renders `reason` only
inside the denied-family branch (`RulingArtifact.tsx:318-355`).

**Production edit**

1. `packages/core/src/types/events.ts` — add one optional field to `RulingSchema`, after
   `causedDeathOf` (`:182`). It is soft, explanatory metadata: it records *why the engine proposed
   this NPC action*, and nothing reads it to adjudicate anything.

```ts
  /**
   * Why the engine proposed this NPC reaction, in player-facing words. Advisory and display-only —
   * never an input to a gate, roll, or effect. Absent on every player ruling.
   */
  npcReactionReason: z.string().max(200).optional(),
```

2. `packages/core/src/orchestrator/npcAgency.ts` — return the richer shape from a new function and
   keep the existing one as a thin projection, so Phase 2's tests and every current caller compile
   untouched.

```ts
export interface PlannedNpcReaction {
  intent: MechanicalIntent;
  disposition: NpcDisposition;
  /** Player-facing justification, derived from sealed signals only. */
  reason: string;
}

/** As {@link planNpcReactions}, but carrying the disposition and reason behind each choice. */
export function planNpcReactionsDetailed(ctx: NpcReactionContext): PlannedNpcReaction[] {
  // … body is Phase 2's planNpcReactions, with the two push sites changed to push
  // { intent, disposition, reason } instead of the bare intent.
}

export function planNpcReactions(ctx: NpcReactionContext): MechanicalIntent[] {
  return planNpcReactionsDetailed(ctx).map((planned) => planned.intent);
}
```

Build the reason from the same sealed facts the decision already used — never from prose:

```ts
function reactionReason(
  disposition: NpcDisposition,
  wasHarmed: boolean,
  actorName: string,
  action: ActionDef
): string {
  if (wasHarmed) return `${actorName} harmed them with ${action.label}.`;
  if (disposition === "hostile") return `They were already hostile to ${actorName}.`;
  return `${actorName} opened a contest with ${action.label}.`;
}
```

`actorName` comes from the caller. Extend `NpcReactionContext` with an optional
`nameById?: ReadonlyMap<string, string>` and fall back to the raw id — `turn.ts` already builds
exactly this map at `turn.ts:789`, so pass it in rather than building a second one.

3. `packages/core/src/orchestrator/turn.ts:880-905` — switch to the detailed planner and stamp the
   reason after `resolve`, alongside the existing `causedDeathOf` assignment at `:902`.

```ts
      const plannedNpcReactions = planNpcReactionsDetailed({
        schema,
        priorRulings: rulings.slice(0, playerRulingCount),
        workingById,
        present: new Map(presentRoster.map((character) => [character.id, character.isPlayer])),
        stakesByTurnId,
        nameById,
        // softById added by step 2.1 — keep it.
      });
      const npcReactionIntents = plannedNpcReactions.map((planned) => planned.intent);
      for (const planned of plannedNpcReactions) {
        const intent = planned.intent;
        // … existing resolve/commit body unchanged …
        if (died.length) result.ruling.causedDeathOf = died;
        result.ruling.npcReactionReason = planned.reason;
        rulings.push(result.ruling);
        staged.push(result);
      }
```

Leave `reactedNpcIds` (`turn.ts:913`) reading from `npcReactionIntents` so the planner-candidate
filter behaves identically.

4. `packages/ui/src/screens/Play.tsx` — emit the variant. `rulingToArtifact` needs to know who the
   player is; thread a predicate rather than a second cast lookup.

```ts
function rulingToArtifact(
  r: Ruling,
  nameOf: (id: string) => string,
  isPlayerActor: (id: string) => boolean = () => true
): RulingArtifactVM | undefined {
```

At `Play.tsx:179`, replace the variant expression:

```ts
  const npcActed = !isPlayerActor(r.actorId);
  const variant: RulingArtifactVariant = npcActed
    ? "npc"
    : opposed
      ? "opposed"
      : VARIANT_BY_OUTCOME[outcome];
```

and add the reason to the returned VM (the field already exists on `RulingArtifactVM` at
`Play.tsx:141`):

```ts
    ...(npcActed && r.npcReactionReason ? { reason: r.npcReactionReason } : {}),
```

`RulingBlock` (`Play.tsx:1363-1371`) gains the predicate as a prop and forwards it; both call sites
(`Play.tsx:1058` and `:1122`) pass
`isPlayerActor={(id) => cast.find((c) => c.characterId === id)?.isPlayer !== false}`. Default it to
"is the player" so an unknown id never mislabels a player ruling as an NPC one. `RulingBlock` must
also forward `reason` — it already does, at `Play.tsx:1422`.

5. `packages/ui/src/components/RulingArtifact.tsx` — render `reason` for the `npc` variant. Add it
   after the `body` assignment (`:365-369`), before the `resultLine` block at `:375`:

```tsx
      {variant === "npc" && props.reason ? (
        <div
          style={{ fontSize: 12.5, color: "var(--secondary)", marginTop: 8 }}
          data-testid="ruling-reason"
        >
          {props.reason}
        </div>
      ) : null}
```

Reuse `data-testid="ruling-reason"` deliberately: it is the same semantic row as the denied branch's
reason (`:344`), and one test id for one concept keeps the component's contract small.

**Acceptance criteria**
- All three new tests GREEN, and every Phase 2 test still GREEN — `planNpcReactions` keeps its
  signature and return type.
- `npcReactionReason` appears on NPC rulings only:
  `expect(result.rulings.filter(r => r.npcReactionReason).every(r => r.actorId !== playerId))`.
- No hard-state field reads `npcReactionReason`:
  `grep -rn "npcReactionReason" packages/core/src/engine/` returns zero hits. The authority wall is
  untouched — this field is display metadata and must never reach the engine.
- `npm run typecheck` clean. Full suite ≥ **821** (ledger: 818 + 3).

**Rollback:** `git checkout -- packages/core/src/types/events.ts packages/core/src/orchestrator/npcAgency.ts packages/core/src/orchestrator/turn.ts packages/ui/src/screens/Play.tsx packages/ui/src/components/RulingArtifact.tsx packages/core/test/orchestrator/npcAgency.test.ts packages/ui/test/screens/Play.test.tsx`

---

### Step 3.4 — Route classifier failures to the `classifier-unavailable` ruling register

**Closes:** the third consequence of U-2 (file 08 §U-2 item 3) and U-11 (file 08 §U-11). **Effort: S.**

**Root cause, one concept split across two surfaces.** The `classifier-unavailable` variant is
declared (`packages/ui/src/components/RulingArtifact.tsx:69`), labelled
`"DM RULING · CLASSIFIER UNAVAILABLE"` (`:108`), coloured `--dead` (`:113`), and given its own
`"UNAVAILABLE"` headline inside the no-die branch (`:341`). It is unreachable. The live path renders
an `InlineNotice` instead — `Play.tsx:1150-1163` mounts `ClassifierRecovery`, whose body is a
`severity="warn"` notice (`Play.tsx:1577-1613`).

The result is that the product's three refusal states are rendered in two different registers: a
gate denial and a budget refusal look like world rulings, and an infrastructure failure looks like a
software error. File 08 §U-2 names the cost: *"it teaches the player to distrust the register."*

The same confusion is mirrored in the Journal, which files `classifier_recovery` under the
**denied** filter — `packages/ui/src/screens/Journal.tsx:248-251`:

```ts
    event.kind === "denied" ||
        event.kind === "action_budget_exceeded" ||
        event.kind === "classifier_recovery"
      ? "denied"
```

A provider timeout is not a world refusal. Filing it as one *in the audit trail whose whole job is
to make that distinction checkable* is the worst possible place for the error, which is why U-11 and
the U-2 item belong in one step rather than two: they are the same category mistake in two files.

**What must not change.** `ClassifierRecovery` carries real affordances the notice earned — Retry
saved turn, Edit/Clarify target, Configure Classifier, Dismiss (`Play.tsx:1598-1609`) — and
`shouldSurfaceClassifierRecovery` (`Play.tsx:1539-1550`) deliberately suppresses diagnostic-only
issues. Keep both. This step changes the *register* the failure is announced in and adds the
`unresolved` case; it does not delete the recovery controls.

**Files to modify**
- `packages/ui/src/screens/Play.tsx`
- `packages/ui/src/screens/Journal.tsx`

**RED test — write first**

File: `packages/ui/test/screens/Play.test.tsx`, appended:

```ts
it("announces a provider timeout as a classifier-unavailable ruling, keeping retry", async () => {
  render(<Play storyId="story-1" />);
  usePlayStore.setState({
    classifierRecovery: {
      policy: "narration_only",
      issues: [{ kind: "timeout", message: "The classifier did not answer in time." }],
    },
  });
  const card = await screen.findByRole("group", { name: /CLASSIFIER UNAVAILABLE/ });
  expect(card).toHaveAttribute("data-variant", "classifier-unavailable");
  expect(screen.queryByTestId("ruling-die")).toBeNull();
  expect(screen.getByRole("button", { name: /Configure Classifier/ })).toBeInTheDocument();
});

it("announces an unresolved target as the unresolved ruling variant", async () => {
  render(<Play storyId="story-1" />);
  usePlayStore.setState({
    classifierRecovery: {
      policy: "partial_mechanics",
      issues: [{ kind: "unresolved_target", message: "Name who you mean." }],
    },
  });
  const card = await screen.findByRole("group", { name: /NEEDS CLARIFICATION/ });
  expect(card).toHaveAttribute("data-variant", "unresolved");
});
```

File: `packages/ui/test/screens/Journal.test.tsx`, appended:

```ts
it("files classifier_recovery as interrupted, never as denied", async () => {
  const bridge = makeMemoryBridge();
  bridge.getStory = async () => story();
  bridge.listPresentCast = async () => [
    { characterId: "hero", name: "Kestrel", isPlayer: true, alive: true },
  ];
  bridge.listStoryJournal = async () => ({
    events: [
      { ...event("recovery-1", 3, 0, 3), kind: "classifier_recovery" },
      { ...event("denial-1", 4, 0, 4), kind: "denied" },
    ],
  });
  setBridge(bridge);

  render(<Journal storyId="story-1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Denied" }));
  expect(screen.queryByText(/Classifier Recovery/i)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Interrupted" }));
  expect(screen.getByText(/Classifier Recovery/i)).toBeInTheDocument();
});
```

The Journal test fails on the last two lines: there is no "Interrupted" chip, and the event is
visible under "Denied".

**Production edit**

1. `packages/ui/src/screens/Play.tsx` — replace the `InlineNotice` body of `ClassifierRecovery`
   (`:1577-1613`) with a `RulingArtifact` in the refusal register, keeping the button cluster as the
   artifact's children region. Derive the variant from the structured issue kinds, never from text:

```ts
/** An unresolved actor/target is a clarification request; anything else is infrastructure. */
function recoveryVariant(
  recovery: ClassifierRecoveryMetadata
): "unresolved" | "classifier-unavailable" {
  return recovery.issues.some(
    (issue) => issue.kind === "unresolved_target" || issue.kind === "unresolved_action"
  )
    ? "unresolved"
    : "classifier-unavailable";
}
```

The card body becomes:

```tsx
  const variant = recoveryVariant(props.recovery);
  return (
    <div style={S.errorWrap} data-testid="classifier-recovery">
      <RulingArtifact
        variant={variant}
        reason={
          variant === "unresolved"
            ? "The DM could not tell who or what you meant, so nothing was resolved."
            : "The DM's classifier was unreachable this turn, so no mechanics were resolved."
        }
        hint="Your turn is saved. No roll, cost, XP, loot, or equipment change occurred."
        detailRows={props.recovery.issues.map((issue, index) => ({
          label: labels[issue.kind].toUpperCase(),
          value: `${issue.message}${issue.count ? ` (${issue.count})` : ""}`,
        }))}
        animate={false}
      />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 9 }}>
        {/* the four existing buttons from :1598-1609, verbatim */}
      </div>
    </div>
  );
```

Keep the `labels` map (`Play.tsx:1560-1571`) — it is now the detail-row label source. Keep the
`shouldSurfaceClassifierRecovery` guard at the call site (`Play.tsx:1150-1151`) exactly as it is.
Drop the now-unused `kind`/`primary`/`unresolvedTarget` locals only if `noUnusedLocals` flags them;
`unresolvedTarget` is still needed for the "Clarify target" button label.

2. `packages/ui/src/screens/Journal.tsx` — give interruptions their own kind and chip.

At `:11`, extend the union:

```ts
type JournalKind =
  | "roll" | "denied" | "progression" | "item-equipment" | "milestone" | "boundary" | "interrupted";
```

At `:24-31`, add the chip (placement after "Denied" keeps the refusal-adjacent grouping readable):

```ts
  { key: "denied", label: "Denied" },
  { key: "interrupted", label: "Interrupted" },
```

At `:248-251`, remove `classifier_recovery` from the denied arm and give it its own branch **above**
it, so the `denied` test no longer sees it:

```ts
    event.kind === "classifier_recovery"
      ? "interrupted"
      : event.kind === "denied" || event.kind === "action_budget_exceeded"
        ? "denied"
```

At `:226`, extend `glyphFor` — `⌁` is already the app's interruption glyph (it is the
filtered-empty state's glyph at `Journal.tsx:190`):

```ts
  return kind === "roll" ? "◈" : kind === "denied" ? "⊘" : kind === "interrupted" ? "⌁"
    : kind === "progression" ? "◆" : kind === "item-equipment" ? "❖" : kind === "milestone" ? "★" : "│";
```

At `:386`, `kindGlyph` must not colour it `--failure` (that is the denial colour and reusing it
would undo the point of the step) — add `kind === "interrupted" ? "var(--brass)"` before the
`progression` arm.

**Acceptance criteria**
- All three new tests GREEN.
- `grep -n "classifier_recovery" packages/ui/src/screens/Journal.tsx` shows it in exactly one arm,
  mapping to `"interrupted"`.
- Selecting "Denied" in the Journal shows zero `classifier_recovery` rows; selecting "Interrupted"
  shows only those.
- All three refusal states in Play now render through `RulingArtifact`:
  `grep -c "InlineNotice" packages/ui/src/screens/Play.tsx` decreases by at least one, and no
  classifier failure path constructs an `InlineNotice`.
- `npm run typecheck` clean. Full suite ≥ **824** (ledger: 821 + 3).

**Rollback:** `git checkout -- packages/ui/src/screens/Play.tsx packages/ui/src/screens/Journal.tsx packages/ui/test/screens/Play.test.tsx packages/ui/test/screens/Journal.test.tsx`

---

### Step 3.5 — Render the opposed detail the engine already computed

**Closes:** U-8 and U-8b (file 08 §U-8). **Effort: S.**

**Root cause.** The defender's side of an opposed contest is computed by the resolver, persisted on
the ruling, mapped into the component's props, and then never read. Trace it end to end:

- Core persists nine defender fields on `RollRecord` — `opposedD20`, `opposedDice`,
  `opposedUsedIndex`, `opposedRollMode`, `opposedAdvantageSources`, `opposedDisadvantageSources`,
  `opposedModifier`, `opposedTotal`, and the attribute/mastery breakdown
  (`packages/core/src/types/events.ts:70-83`).
- `rulingToArtifact` maps them into `rollVM.opposed` — `dice`, `usedIndex`, `rollMode` and a merged
  `reasons` array at `packages/ui/src/screens/Play.tsx:213-216`.
- `RulingRoll["opposed"]` declares all four (`packages/ui/src/components/RulingArtifact.tsx:50-54`).
- **`MathBlock` reads only `attacker`, `defender`, `attackerFormula` and `defenderFormula`**
  (`RulingArtifact.tsx:216-224`). `DieBlock` is never rendered for the defender at all — it takes
  the whole `roll` and reads `roll.dice` (`:156`), i.e. the attacker's.

So an opposed roll shows two totals and two formulas, and silently drops both defenders' dice and
every advantage/disadvantage reason on either side. File 08 §U-8: *"The engine did the work of being
transparent and the UI declines to show it."*

**U-8b, same card.** `accentFor` returns `var(--teal)` for `opposed` regardless of who won
(`RulingArtifact.tsx:114`). The stamp beneath it is already outcome-correct, because `StampBlock`
reads `outcomeStamp(roll.outcome)` (`:267`) — so the card's border says "neutral contest" while its
stamp says "you lost". Fix the border, not the stamp.

**Files to modify**
- `packages/ui/src/components/RulingArtifact.tsx`

No core change and no `Play.tsx` change: every value this step renders is already in the props.

**RED test — write first**

File: `packages/ui/test/components/RulingArtifact.test.tsx`, appended:

```ts
function opposedRoll(): RulingRoll {
  return roll({
    outcome: "failure",
    d20: 9,
    dice: [9, 14],
    usedIndex: 0,
    rollMode: "disadvantage",
    disadvantageSources: ["Wounded"],
    modifier: 2,
    total: 11,
    dc: 0,
    opposed: {
      attacker: "Kestrel 11",
      defender: "The Warden 18",
      attackerFormula: "d20 9 + 2",
      defenderFormula: "d20 16 + 2",
      dice: [16, 4],
      usedIndex: 0,
      rollMode: "advantage",
      reasons: ["High ground", "Wounded"],
    },
  });
}

describe("RulingArtifact — opposed", () => {
  it("renders the defender's dice, marking the discarded one", () => {
    render(<RulingArtifact variant="opposed" roll={opposedRoll()} animate={false} />);
    const dice = screen.getAllByTestId("ruling-die").map((n) => n.textContent);
    expect(dice).toContain("16");
    expect(screen.getAllByTestId("ruling-die-discarded").map((n) => n.textContent)).toContain("4");
  });

  it("lists the advantage and disadvantage reasons for the contest", () => {
    render(<RulingArtifact variant="opposed" roll={opposedRoll()} animate={false} />);
    const reasons = screen.getByTestId("ruling-opposed-reasons");
    expect(reasons).toHaveTextContent("High ground");
    expect(reasons).toHaveTextContent("Wounded");
  });

  it("colours a lost opposed contest with the failure accent, not teal", () => {
    const { container } = render(
      <RulingArtifact variant="opposed" roll={opposedRoll()} animate={false} />
    );
    const card = container.querySelector('[data-variant="opposed"]') as HTMLElement;
    expect(card.style.borderLeft).toContain("var(--failure)");
  });

  it("colours a won opposed contest with the success accent", () => {
    const won = { ...opposedRoll(), outcome: "success" as const };
    const { container } = render(<RulingArtifact variant="opposed" roll={won} animate={false} />);
    const card = container.querySelector('[data-variant="opposed"]') as HTMLElement;
    expect(card.style.borderLeft).toContain("var(--success)");
  });
});
```

All four RED: no defender dice are rendered, there is no `ruling-opposed-reasons` node, and the
border is teal in both colour cases.

**Production edit**

1. `RulingArtifact.tsx:114` — drop `opposed` from the flat-teal arm so it falls through to the
   outcome lookup at `:120`. `npc` keeps teal: an NPC action is a register, not an outcome the
   player won or lost.

```ts
  if (props.variant === "npc") return "var(--teal)";
```

2. `DieBlock` (`:130-182`) currently derives its dice from a whole `RulingRoll`. Give it the two
   values it actually uses so it can render either side, and update its one existing call site.

```ts
function DieBlock(props: {
  dice: number[];
  usedIndex?: number;
  color: string;
  animate: boolean;
  reduced: boolean;
  crit: boolean;
}): ReactNode {
```

Inside, replace `const dice = roll.dice?.length ? roll.dice : [roll.d20];` with
`const { dice } = props;` and `roll.usedIndex` with `props.usedIndex`. In `RollRow` (`:272-282`)
the call becomes:

```tsx
      <DieBlock
        dice={roll.dice?.length ? roll.dice : [roll.d20]}
        {...(roll.usedIndex !== undefined ? { usedIndex: roll.usedIndex } : {})}
        color={color}
        animate={animate}
        reduced={reduced}
        crit={crit}
      />
```

3. `MathBlock`'s opposed branch (`:216-224`) — render the defender's dice beneath the two formulas,
   then the reasons. Insert after the `attackerFormula || defenderFormula` block, still inside the
   `roll.opposed ?` arm:

```tsx
            {roll.opposed.dice?.length ? (
              <div style={{ marginTop: 5 }} data-testid="ruling-opposed-dice">
                <DieBlock
                  dice={roll.opposed.dice}
                  {...(roll.opposed.usedIndex !== undefined
                    ? { usedIndex: roll.opposed.usedIndex }
                    : {})}
                  color={color}
                  animate={animate}
                  reduced={reduced}
                  crit={false}
                />
              </div>
            ) : null}
            {roll.opposed.rollMode && roll.opposed.rollMode !== "normal" ? (
              <div style={{ color: "var(--teal)", fontFamily: FONT.mono, fontSize: 10.5, marginTop: 3 }}>
                DEFENDER {roll.opposed.rollMode.toUpperCase()}
              </div>
            ) : null}
            {roll.opposed.reasons?.length ? (
              <div
                style={{ color: "var(--muted)", fontSize: 11.5, marginTop: 3 }}
                data-testid="ruling-opposed-reasons"
              >
                {roll.opposed.reasons.join(" · ")}
              </div>
            ) : null}
```

`MathBlock` already receives `color`, `animate` and `reduced` (`:184-190`), so nothing new threads
through.

**Acceptance criteria**
- All four new tests GREEN; every existing `RulingArtifact.test.tsx` test still GREEN — the
  `DieBlock` signature change must not alter the attacker rendering, which those tests already pin
  (`ruling-die` / `ruling-die-discarded` / `aria-label` "N discarded").
- No field declared on `RulingRoll["opposed"]` (`RulingArtifact.tsx:46-55`) is unread:
  `grep -n "opposed\." packages/ui/src/components/RulingArtifact.tsx` covers `attacker`, `defender`,
  `attackerFormula`, `defenderFormula`, `dice`, `usedIndex`, `rollMode`, `reasons`.
- Reduced motion still collapses the new dice — they route through the same `DieBlock`, so this is
  satisfied by construction rather than by a new guard. Confirm no new `animationName` was added
  outside `anim()`.
- `npm run typecheck` clean. Full suite ≥ **828** (ledger: 824 + 4).

**Rollback:** `git checkout -- packages/ui/src/components/RulingArtifact.tsx packages/ui/test/components/RulingArtifact.test.tsx`

---

### Step 3.6 — The missing sixth Journal filter, and the last two JSON leaks

**Closes:** the undocumented Journal defect recorded in §0, plus the two remaining thirds of U-6
(file 08 §U-6 items 1 and 2). **Effort: XS. Requires 3.1** — the loot row below uses the formatter
3.1 adds, and both steps edit the same `details` array in `toJournalEvent`.

**Root cause — a filter that hides events.** `JournalKind` has **six** members
(`packages/ui/src/screens/Journal.tsx:11`):

```ts
type JournalKind = "roll" | "denied" | "progression" | "item-equipment" | "milestone" | "boundary";
```

`toJournalEvent` assigns `"boundary"` to `chapter_started`, `arc_completed` and
`rulebook_regenerated` (`Journal.tsx:263-266`). `FILTERS` lists **five** plus All
(`Journal.tsx:24-31`) — there is no `boundary` entry. The filter predicate is
`kind === "all" || event.kind === kind` (`Journal.tsx:94`), so chapter and arc boundaries are
reachable **only** under "All"; selecting any chip whatsoever hides every structural marker in the
story. `glyphFor` even has a boundary glyph ready — the `"│"` fallthrough at `Journal.tsx:226` is
reached by nothing else.

File 08 §1.3 calls the Journal *"the strongest V7-conformant screen"* and credits it with *"all five
required filters plus All"*. That is accurate against V7 and still leaves a sixth kind stranded —
which is exactly why this defect appears in no audit file.

**Root cause — the JSON leaks.** Two `JSON.stringify` calls remain in the Journal's detail rows
after 3.1:

- `Journal.tsx:304` — `{ label: "Dice", value: JSON.stringify(roll.dice ?? [roll.d20]) }` prints
  literally `[14,7]`.
- `Journal.tsx:368` — `details.push({ label: "Record", value: JSON.stringify(event.payload) })`
  appends the entire raw payload to **every** expanded entry, unconditionally.

Plan 14 step 3 wants the raw record kept behind a developer disclosure gated on diagnostics (Plan
11). **Plan 11 is not in this plan's scope**, so there is no diagnostics flag to gate on. Delete the
row rather than inventing a settings surface for it; the Markdown/CSV export
(`Journal.tsx:135-154`) already exists for anyone who needs the underlying data, and this step adds
the two rows the payload was actually being read for.

**Files to modify**
- `packages/ui/src/screens/Journal.tsx`

**RED test — write first**

File: `packages/ui/test/screens/Journal.test.tsx`, appended:

```ts
it("keeps chapter and arc boundaries reachable from a filter chip", async () => {
  const bridge = makeMemoryBridge();
  bridge.getStory = async () => story();
  bridge.listPresentCast = async () => [
    { characterId: "hero", name: "Kestrel", isPlayer: true, alive: true },
  ];
  bridge.listStoryJournal = async () => ({
    events: [
      { ...event("boundary-1", 20, 1, 20), kind: "chapter_started", actorId: undefined },
      { ...event("roll-1", 21, 1, 21), kind: "roll" },
    ],
  });
  setBridge(bridge);

  render(<Journal storyId="story-1" />);
  fireEvent.click(await screen.findByRole("button", { name: "Boundaries" }));
  expect(screen.getByText(/Chapter Started/i)).toBeInTheDocument();
  expect(screen.queryByText(/No matching events/i)).not.toBeInTheDocument();
});

it("renders dice as readable numbers and never dumps the raw payload", async () => {
  const bridge = makeMemoryBridge();
  bridge.getStory = async () => story();
  bridge.listPresentCast = async () => [
    { characterId: "hero", name: "Kestrel", isPlayer: true, alive: true },
  ];
  bridge.listStoryJournal = async () => ({
    events: [
      {
        ...event("roll-1", 5, 0, 5),
        kind: "roll",
        payload: {
          ruling: {
            turnId: "hero:strike",
            actorId: "hero",
            actionId: "strike",
            gate: { allowed: true },
            effectsApplied: null,
            roll: {
              d20: 14, dice: [14, 7], usedIndex: 0, rollMode: "advantage",
              modifier: 2, total: 16, dc: 12, outcome: "success",
            },
            loot: [
              {
                itemInstanceId: "i1", itemDefinitionId: "d1", ownerCharacterId: "hero",
                name: "Vale Saber", tier: "rare", quantity: 1,
                provenanceSummary: "Encounter cleared",
                effects: [{ type: "attribute_score", attributeId: "might", amount: 2 }],
              },
            ],
          },
        },
      },
    ],
  });
  setBridge(bridge);

  render(<Journal storyId="story-1" />);
  fireEvent.click(await screen.findByRole("button", { expanded: false }));
  expect(screen.getByText("14, 7")).toBeInTheDocument();
  expect(screen.getByText(/\+2 Might/)).toBeInTheDocument();
  expect(screen.queryByText("Record")).not.toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/\{"/);
});
```

Three assertions fail today: there is no "Boundaries" chip, dice render as `[14,7]`, and a "Record"
row is present.

**Production edit**

1. `Journal.tsx:24-31` — add the sixth chip. Place it last: boundaries are structural markers, not
   mechanical outcomes, and the first five keep their V7 order.

```ts
  { key: "milestone", label: "Milestones" },
  { key: "boundary", label: "Boundaries" },
```

(If 3.4 landed first, the `interrupted` chip from that step sits after `denied`; this one still goes
last. `FILTERS` is then seven entries plus All, and `Journal.tsx:181` renders them all with no code
change — it maps over the array.)

2. `Journal.tsx:304` — render dice as numbers, emphasising the used one so the presentation matches
   `DieBlock`'s discard semantics rather than inventing a second one.

```ts
      {
        label: "Dice",
        value: (roll.dice ?? [roll.d20])
          .map((die, index) =>
            (roll.dice?.length ?? 1) > 1 && index !== (roll.usedIndex ?? 0)
              ? `${die} (discarded)`
              : String(die)
          )
          .join(", "),
      },
```

3. `Journal.tsx:368` — delete the `Record` row outright and replace it with the loot detail the
   payload was standing in for. This is the row that pairs with 3.1: the same
   `formatEquipmentEffect` renders effects identically in the loot card and the audit trail, so the
   two surfaces cannot disagree about what an item does.

```ts
  if (ruling?.loot?.length) {
    for (const item of ruling.loot) {
      details.push({
        label: "Loot",
        value: `${item.name} · ${item.tier}${item.quantity > 1 ? ` ×${item.quantity}` : ""}`,
      });
      if (item.effects?.length) {
        details.push({
          label: "Effects",
          value: item.effects.map(formatEquipmentEffect).join(" · "),
        });
      }
    }
  }
```

Import `formatEquipmentEffect` from the bridge's core re-export, matching how `Journal.tsx:4-8`
already imports `Ruling` and `StoryEvent`. **Delete** the line at `:368`; do not comment it out.

4. `Journal.tsx:226` and `:386` — the boundary glyph `"│"` is already the fallthrough and its colour
   is already `var(--teal)`. Verify by reading both functions; no edit should be needed. If 3.4
   added an `interrupted` arm, confirm `boundary` still falls through to `"│"`.

**Acceptance criteria**
- Both new tests GREEN, and every existing `Journal.test.tsx` test still GREEN.
- Every `JournalKind` member has a `FILTERS` entry. Mechanically:
  `FILTERS.filter(f => f.key !== "all").length` equals the number of union members — assert it in
  the test file so the two can never drift again.
- `grep -n "JSON.stringify" packages/ui/src/screens/Journal.tsx` returns zero hits.
- Combined with 3.1, `grep -rn "JSON.stringify" packages/ui/src/screens/` returns zero hits — U-6 is
  fully closed at that point.
- `npm run typecheck` clean. Full suite ≥ **830** (ledger: 828 + 2).

**Rollback:** `git checkout -- packages/ui/src/screens/Journal.tsx packages/ui/test/screens/Journal.test.tsx`

---

### Step 3.7 — Stop fabricating the chapter number in the persistent header

**Closes:** U-7 (file 08 §U-7), which is Plan 16. **Effort: S.**

**Root cause.** The `CH n` shown beside the story title on every screen is arithmetic over the
transcript length, not engine state — `packages/ui/src/app/App.tsx:273-277`:

```ts
/** Fallback chapter label until real chapter data threads through (roughly ~20 msgs/chapter). */
function chapterLabelFor(messageCount: number): string {
  const chapter = Math.max(1, Math.floor(messageCount / 20) + 1);
  return `CH ${chapter}`;
}
```

It is called at `App.tsx:217` with `usePlayMessageCount()` (`:214`, `:261-265`), which reads
`usePlayStore(s => s.messages.length)` — so the header's chapter number also moves when the player
is on a non-Play screen and the transcript store is stale or empty. The code's own comment concedes
the whole thing.

**The real data is one call away and already on the bridge.** `bridge.listChapters(storyId)` is
declared at `packages/ui/src/bridge/core.ts:520`, implemented against
`store.chapters.listByStory` at `packages/ui/src/bridge/sqliteBridge.ts:578-580`, returns
`ChapterRecord[]` with a monotonic `idx` (`packages/core/src/types/records.ts:92-101`), and is
already consumed by Overview (`packages/ui/src/screens/Overview.tsx:135`). No bridge work, no core
work — Plan 16 step 2 ("expose the current chapter through the bridge") is already done.

**The honest empty state matters as much as the number.** The summarizer writes a chapter only when
it crosses its threshold, so a young story legitimately has zero rows. Plan 16 step 3 is right:
show **"Chapter in progress"**, not `CH 1`. Inventing `CH 1` for an unsummarized story is the same
defect at a smaller scale.

**Files to modify**
- `packages/ui/src/app/App.tsx`

**RED test — write first**

File: `packages/ui/test/app/App.test.tsx`, appended:

```ts
it("shows the engine's chapter count in the header, not a message-count guess", async () => {
  const bridge = makeMemoryBridge();
  bridge.getStory = async () => storyRecord("s1");
  bridge.listChapters = async () => [
    { id: "c0", storyId: "s1", idx: 0, msgFrom: 0, msgTo: 19, title: "The Ash Road", summary: "…" },
    { id: "c1", storyId: "s1", idx: 1, msgFrom: 20, msgTo: 39, title: "The Glass Gate", summary: "…" },
    { id: "c2", storyId: "s1", idx: 2, msgFrom: 40, msgTo: 59, title: "The Debt", summary: "…" },
  ];
  setBridge(bridge);
  useStoriesStore.setState({ current: storyRecord("s1"), currentStatus: "ready" });
  usePlayStore.setState({ messages: [] }); // 0 messages: the old formula would say CH 1

  render(<App />);
  expect(await screen.findByText("CH 3")).toBeInTheDocument();
});

it("says the chapter is in progress when the summarizer has written none", async () => {
  const bridge = makeMemoryBridge();
  bridge.getStory = async () => storyRecord("s1");
  bridge.listChapters = async () => [];
  setBridge(bridge);
  useStoriesStore.setState({ current: storyRecord("s1"), currentStatus: "ready" });
  usePlayStore.setState({ messages: new Array(45).fill(message()) }); // old formula: CH 3

  render(<App />);
  expect(await screen.findByText("Chapter in progress")).toBeInTheDocument();
  expect(screen.queryByText(/^CH \d/)).not.toBeInTheDocument();
});
```

Both RED: the first renders `CH 1`, the second `CH 3`. Reuse whatever story/message factory
`App.test.tsx` already defines rather than adding new ones.

**Production edit**

`packages/ui/src/app/App.tsx` — replace the derivation inside `Header` (`:206-217`). Fetch on story
change only; the header is mounted on every route, so this must not re-run per render.

```tsx
  const [chapterCount, setChapterCount] = useState<number | undefined>(undefined);
  const storyId = current?.id;
  useEffect(() => {
    if (!storyId) {
      setChapterCount(undefined);
      return;
    }
    let cancelled = false;
    void getBridge()
      .listChapters(storyId)
      .then((chapters) => {
        if (!cancelled) setChapterCount(chapters.length);
      })
      .catch(() => {
        // A header label must never break the shell. Absent count → "Chapter in progress".
        if (!cancelled) setChapterCount(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [storyId]);

  const title = storyOpen ? current?.title ?? "Opening story…" : screenTitle(route);
  const chapterLabel = storyOpen
    ? chapterCount && chapterCount > 0
      ? `CH ${chapterCount}`
      : "Chapter in progress"
    : undefined;
```

Add `useState` to the existing React import at `App.tsx:14` (`useEffect` is already imported).

**Delete `chapterLabelFor` and its comment entirely** (`App.tsx:273-277`) — Plan 16 step 4. Then
delete `usePlayMessageCount` (`:261-265`) and the `requirePlayStore` indirection (`:267-271`) **only
if** `messageCount` has no other reader; it does have one, the `{messageCount} messages` span at
`:232-234`, so **keep all three**. Do not remove the play-store import.

The stale-transcript concern above is now scoped to the message counter alone, which is honestly
labelled "messages" and is therefore not a fabrication — leave it.

**Acceptance criteria**
- Both new tests GREEN.
- `grep -n "chapterLabelFor\|messageCount / 20" packages/ui/src/app/App.tsx` returns zero hits.
- No number in the app chrome is derived from `messages.length` except the span explicitly labelled
  "messages".
- The header renders within one frame of story open and never throws when `listChapters` rejects —
  covered by the `.catch` above; add a third test only if `App.test.tsx` already has a bridge-
  rejection idiom to copy.
- `npm run typecheck` clean. Full suite ≥ **832** (ledger: 830 + 2).

**Rollback:** `git checkout -- packages/ui/src/app/App.tsx packages/ui/test/app/App.test.tsx`

---

### Step 3.8 — Phase integration: prove the register is consistent, and record the count

**Closes:** nothing new. This step exists because 3.1-3.7 each touched one surface, and the phase's
actual claim — *every mechanical state the engine produces is now visible in one consistent
register* — is a property of the seven together that none of them tests alone.

**Why a dedicated step.** Three of the seven edit `Play.tsx`, two edit `RulingArtifact.tsx`, two
edit `Journal.tsx`. The per-step tests pin each change in isolation; nothing yet asserts that
`rulingToArtifact` is now *total* over the variant set, or that no serialiser output survives
anywhere in a player-facing screen. Both are one-line greps to check and easy to regress.

**Files to modify**
- `packages/ui/test/screens/Play.test.tsx` (integration assertions only)

No production code should change in this step. **If it does, a prior step was incomplete — go back
and fix it there**, so the failing test and its fix stay in the same commit.

**RED test — write first**

File: `packages/ui/test/screens/Play.test.tsx`, appended as a new `describe`:

```ts
describe("Phase 3 — register consistency", () => {
  it("rulingToArtifact can emit every declared variant except stacked", () => {
    // `stacked` is deliberately still unreachable — see the note below.
    const emitted = new Set<string>();
    for (const ruling of REGISTER_FIXTURES) {
      const vm = rulingToArtifact(ruling.ruling, (id) => id, ruling.isPlayerActor);
      if (vm) emitted.add(vm.variant);
    }
    expect(emitted).toEqual(
      new Set([
        "success", "failure", "crit-success", "crit-failure",
        "opposed", "npc", "denied", "budget-exceeded",
      ])
    );
  });

  it("every refusal state renders in the SYSTEM ruling register, never as an app notice", async () => {
    for (const variant of ["denied", "budget-exceeded", "unresolved", "classifier-unavailable"]) {
      const { container, unmount } = render(
        <RulingArtifact variant={variant as RulingArtifactVariant} reason="r" animate={false} />
      );
      expect(container.querySelector(`[data-variant="${variant}"]`)).not.toBeNull();
      expect(screen.getByTestId("ruling-denied-glyph")).toHaveTextContent("⊘");
      unmount();
    }
  });

  it("no player-facing screen emits serialiser output", () => {
    const sources = [
      readFileSync("src/screens/Play.tsx", "utf8"),
      readFileSync("src/screens/Journal.tsx", "utf8"),
    ];
    for (const source of sources) expect(source).not.toMatch(/JSON\.stringify/);
  });
});
```

`rulingToArtifact` must be exported from `Play.tsx` for the first test — it is currently
module-private (`Play.tsx:153`). Export it; it is a pure function and exporting it is the smallest
change that makes the phase's central claim testable.

Build `REGISTER_FIXTURES` as a local array in the test file: one `Ruling` per expected variant,
reusing the shapes already written in 3.2's and 3.3's tests.

**Production edit**

One line, in `packages/ui/src/screens/Play.tsx:153`:

```ts
export function rulingToArtifact(
```

**Then run the full gate, in this order:**

```bash
cd "C:\Users\anuji\Documents\midnight-tavern-app"
npm run typecheck
npm test --workspaces --if-present
```

**Record the resulting count** in the same place Step 0.1 corrected — append one line to
`Plan/next-phase-internal-beta.md` stating the post-Phase-3 total and the split. Do not edit
`README.md` again; one moving number in one file is the discipline Step 0.1 established.

**Two deliberate non-goals of this phase, stated so they are not mistaken for oversights.**

- **`stacked` stays unreachable.** File 08 §U-2 item 2 and Plan 13 step 3 both want a player action
  and an NPC reaction to render as one exchange card. `RulingArtifact` supports it
  (`RulingArtifact.tsx:356-364` takes `rolls: [RulingRoll, RulingRoll]`), but the UI has no reliable
  way to pair the two rulings: `resolve` derives `turnId` as `actorId + ":" + actionId`
  (`packages/core/src/engine/resolver.ts:291`), so a reaction's `turnId` records the *NPC's* action,
  not the player ruling that provoked it, and `buildStream` groups purely by `messageId`
  (`Play.tsx:293-299`). Pairing them needs a causal link on the ruling — which is precisely what
  Plan 19's event model provides. Guessing at the pairing from adjacency would produce a card that
  is confidently wrong about causation, in the one component whose job is to be trustworthy about
  causation. **Defer to Plan 19.**
- **U-9 (live action-budget counter) and U-12 (the 12-character minimum) are not in this phase.**
  Both are composer behaviour, not engine-state surfacing: U-9 needs a client-side estimate of how
  many actions a draft contains, which is the classifier's job and cannot be done honestly in the
  composer; U-12 (`Play.tsx:808-811`) is a two-line deletion but changes what the engine is asked to
  adjudicate, so it belongs with a turn-path change rather than a rendering one. Schedule both after
  Phase 5, where suggestions and composer affordances are already being reworked.

**Acceptance criteria**
- All three integration tests GREEN.
- `npm run typecheck` passes with zero errors in both workspaces.
- `npm test --workspaces --if-present` passes. Expected total: **835** — Phase 3 complete (ledger:
  811 + 24, i.e. core 651 + 7 = 658; UI 160 + 17 = 177). Treat the split as the check, not the
  exact total — if a step's tests
  landed in a different file than specified the total holds but the split will not, and that is
  worth knowing before Phase 4.
- ~~`grep -rn "JSON.stringify" packages/ui/src/screens/` returns zero hits.~~ **Amended 2026-08-12.**
  This was correct when Phase 3 closed, but Step 6.1 — a later phase in this same plan — deliberately
  adds one at `Diagnostics.tsx:56` to serialise the diagnostics export payload. That is a file
  download, not a player-facing JSON leak, which is what this criterion exists to catch. The correct
  check, which passes today: **`grep -rn "JSON.stringify" packages/ui/src/screens/ | grep -v
  Diagnostics.tsx` returns zero hits.**
- Manual pass, five minutes, on a Full Stats story: an NPC action shows `RULING · NPC` with a
  reason; an opposed contest shows both sides' dice; a denial, a budget refusal and a forced
  classifier failure all render as `⊘` cards; the Journal's "Boundaries" chip shows chapter starts;
  the header reads `CH n` or "Chapter in progress" and never a guess.
- `Plan/next-phase-internal-beta.md` carries the new count.

**Rollback (whole phase, in dependency-reverse order):**

```bash
git checkout -- packages/ui/src/app/App.tsx packages/ui/src/screens/Journal.tsx \
  packages/ui/src/components/RulingArtifact.tsx packages/ui/src/screens/Play.tsx \
  packages/core/src/orchestrator/turn.ts packages/core/src/orchestrator/npcAgency.ts \
  packages/core/src/engine/equipment.ts packages/core/src/types/events.ts \
  packages/ui/test/app/App.test.tsx packages/ui/test/screens/Journal.test.tsx \
  packages/ui/test/screens/Play.test.tsx packages/ui/test/components/RulingArtifact.test.tsx \
  packages/core/test/orchestrator/turn.test.ts packages/core/test/orchestrator/npcAgency.test.ts \
  packages/core/test/v7EquipmentLoot.test.ts Plan/next-phase-internal-beta.md
```

---

## Phase 4 — Prove immutability

Phase 4 adds no behaviour. Swipe immutability is **already shipped and already correct** — this
phase pins it with a test so it cannot silently regress, and closes the one half of Plan 9 that
genuinely is missing (rewind is invisible to the journal).

### Step 4.1 — Swipe immutability regression test + rewind logging

**Closes:** Plan 9 (file 11 §Plan 9), and the "authority versus the undo button" argument in
[06 §6](06-gap-analysis-dm-authority.md). **Effort: XS** — not M, because two of Plan 9's five
steps are already shipped.

**The defect, stated honestly.** Plan 9 claims "a player can reroll until the narrator writes the
outcome they wanted." **That is false, and I verified it line by line.** `swipeLastTurn`
(`packages/core/src/orchestrator/history.ts:113`) reads the already-committed rulings at
`history.ts:148-149`:

```ts
const rulingRecords = await store.rulings.listByMessage(narrator.id);
const rulings: Ruling[] = rulingRecords.map((r) => r.ruling);
```

and passes those exact `Ruling` objects into `generateGuardedNarration` (`history.ts:167-175`). It
never calls `classify`, `resolve`, or `commit`; `history.ts:144` says so in a comment — *"Hard state
+ rulings are deliberately NOT touched."* Only soft/world is rolled to the pre-image
(`restoreSoftWorld`, `history.ts:145`) so the analyzer re-reads from the same start. The UI already
tells the player: `MessageActions.tsx:103-124` renders a `ROLL LOCKED ⚄` badge titled *"This turn
committed a ruling — swiping rewrites the prose, never the outcome."*

**So Plan 9 steps 1-4 are done.** What is actually missing is two things. **(a)** No test asserts
dice immutability across a swipe. `history.test.ts:160` (*"swipe regenerates prose as a new active
variant without re-committing state"*) asserts hard state is unchanged, but never compares the
ruling's `roll` object across variants — so a future refactor that re-resolved dice while leaving
net hard state coincidentally equal would pass. **(b)** Plan 9 step 5 — *"log every rewind to the
Mechanical Journal"* — is not implemented. `rewindTo` (`history.ts:352-370`), `deleteLastTurn`
(`history.ts:315-340`) and `deleteFromExchange` (`history.ts:373-398`) each call
`store.events.deleteFromTurn(storyId, fromIdx)` and write **no** event of their own. There is no
`turn_rewound` member in `StoryEventKindSchema` (`store/repositories/storyEvents.ts:4-27`) — the
journal cannot represent a rewind at all. The record is therefore not merely incomplete, it is
misleading: a rewound story reads as though those turns never happened.

**Files to modify**

- `packages/core/src/store/repositories/storyEvents.ts` (add the event kind)
- `packages/core/src/orchestrator/history.ts` (emit the event from all three truncating ops)
- `packages/core/test/orchestrator/history.test.ts` (both tests)

**RED test — write first, run first, record the failure**

File: `packages/core/test/orchestrator/history.test.ts`, appended inside
`describe("history ops — swipe / delete / rewind (§6)", ...)` (opens at `history.test.ts:123`).

Test 1 — name it exactly `"swipe never re-resolves: ruling id, dice and DC are identical across variants"`:

```ts
it("swipe never re-resolves: ruling id, dice and DC are identical across variants", async () => {
  const router = new ScriptedRouter({ classified: CLASSIFIED, narratorProse: "First telling." });
  await submitTurn(router, store, STORY_ID, "I strike the post.", {});

  const narratorIdx = (await store.messages.nextIdx(STORY_ID)) - 1;
  const narrator = await store.messages.getByIndex(STORY_ID, narratorIdx);
  const before = await store.rulings.listByMessage(narrator!.id);

  router.script.narratorProse = "A completely different telling.";
  const result = await swipeLastTurn(router, store, STORY_ID);
  expect(result.variants).toHaveLength(2);

  const after = await store.rulings.listByMessage(narrator!.id);
  // The ruling rows are the SAME rows: not re-inserted, not re-rolled, not re-ordered.
  expect(after.map((r) => r.ruling.turnId)).toEqual(before.map((r) => r.ruling.turnId));
  expect(after.map((r) => r.ruling.roll)).toEqual(before.map((r) => r.ruling.roll));
  expect(after.map((r) => r.ruling.gate)).toEqual(before.map((r) => r.ruling.gate));
  expect(after.map((r) => r.ruling.effectsApplied)).toEqual(
    before.map((r) => r.ruling.effectsApplied)
  );
  expect(after).toHaveLength(before.length); // no second commit appended rulings
});
```

This is a **characterization test**: it is expected to pass GREEN on first run, because the
behaviour is already correct. That is the point — it is a tripwire, not a bug fix. Prove it is a
real tripwire before moving on: temporarily change `history.ts:148` to
`const rulingRecords = await store.rulings.listByMessage(narrator.id + "-nope");` and confirm the
test FAILS. Revert that edit immediately. **Do not skip this inversion check** — a characterization
test that cannot fail is worse than no test, because it advertises coverage that does not exist.

Test 2 — name it exactly `"rewindTo journals a turn_rewound event that survives truncation"`. This
one is genuinely RED:

```ts
it("rewindTo journals a turn_rewound event that survives truncation", async () => {
  const router = new ScriptedRouter({ classified: CLASSIFIED, narratorProse: "Turn one." });
  await submitTurn(router, store, STORY_ID, "I strike the post.", {});
  router.script.narratorProse = "Turn two.";
  await submitTurn(router, store, STORY_ID, "I strike again.", {});

  const keepIdx = 1; // narrator of the first exchange; turn two is discarded
  await rewindTo(store, STORY_ID, keepIdx);

  const events = await store.events.listByStory(STORY_ID, { kinds: ["turn_rewound"], limit: 10 });
  expect(events).toHaveLength(1);
  expect(events[0]!.payload["fromIdx"]).toBe(2);
  expect(events[0]!.payload["operation"]).toBe("rewind");
  expect(events[0]!.turnIndex).toBeLessThan(2); // else deleteFromTurn would erase it
});
```

Run both: `npx vitest run test/orchestrator/history.test.ts` from `packages/core`. Test 1 GREEN
(after the inversion check), test 2 RED — `"turn_rewound"` is not a legal `StoryEventKind`, so the
Zod enum rejects the filter argument and TypeScript fails to compile the test.

**Production edit**

1. `packages/core/src/store/repositories/storyEvents.ts` — add one member to
   `StoryEventKindSchema` (the enum currently ends at `"classifier_recovery"`, line 26). Append
   **after** it so existing persisted rows are untouched:

```ts
  "classifier_recovery",
  "turn_rewound",
]);
```

   No migration. `kind` is a `TEXT` column, not a SQL enum, and the Zod enum is the only validator.

2. `packages/core/src/orchestrator/history.ts` — add one private helper above `deleteLastTurn`
   (which opens at `history.ts:315`):

```ts
/**
 * Journal a truncation so the mechanical record stays honest (Plan 9 step 5). The event is written
 * at `fromIdx - 1` — one turn BEFORE the truncation point — because `events.deleteFromTurn` in the
 * same transaction deletes every event at `turnIndex >= fromIdx`. Recorded at `fromIdx` it would
 * delete itself.
 */
async function journalTruncation(
  store: Store,
  storyId: string,
  fromIdx: number,
  operation: "rewind" | "delete_last" | "delete_from_exchange"
): Promise<void> {
  const story = await requireStory(store, storyId);
  await store.events.insert({
    id: randomUUID(),
    storyId,
    turnIndex: Math.max(0, fromIdx - 1),
    kind: "turn_rewound",
    payload: { operation, fromIdx },
    rulebookVersion: story.rulebookVersion ?? 1,
    createdAt: Date.now(),
  });
}
```

   Add the import at the top of the file, beside the existing `../store/index.js` import:

```ts
import { randomUUID } from "../util/uuid.js";
```

   `randomUUID` comes from `util/uuid.ts`, **not** `node:crypto` — core must stay webview-portable
   (see `CONTEXT.md`; core has exactly one `node:` import and it is not on this path).

3. `history.ts` — call it as the **last statement inside each of the three existing
   `store.transaction` callbacks**, so the journal entry lands atomically with the truncation or not
   at all. Insert after the `invalidateSummariesFrom` line in each:

   - `deleteLastTurn`, after `history.ts:338`:
     `await journalTruncation(store, storyId, fromIdx, "delete_last");`
   - `rewindTo`, after `history.ts:368`:
     `await journalTruncation(store, storyId, fromIdx, "rewind");`
   - `deleteFromExchange`, after `history.ts:396`:
     `await journalTruncation(store, storyId, fromIdx, "delete_from_exchange");`

   Ordering matters: it must come **after** `events.deleteFromTurn` (`:334`, `:364`, `:392`), never
   before, or the delete sweeps up the entry it is meant to preserve.

4. `packages/core/src/orchestrator/journal.ts` — `summarizeStoryEvent` (`:63`) already has a generic
   tail at `:101-102` that renders `humanize(kind)` plus the JSON payload, so `turn_rewound` gets
   `Turn Rewound - {"operation":"rewind","fromIdx":2}` for free. **Add an explicit branch** anyway,
   because that generic line is exactly the raw-JSON leak Plan 14 / step 3.6 is removing. Insert
   immediately before the `attribute_advanced` branch at `journal.ts:66`:

```ts
  if (event.kind === "turn_rewound") {
    const operation = event.payload["operation"];
    const fromIdx = event.payload["fromIdx"];
    const label =
      operation === "rewind"
        ? "Rewound"
        : operation === "delete_last"
          ? "Deleted last exchange"
          : "Deleted from exchange";
    return `${label} - discarded turns from index ${typeof fromIdx === "number" ? fromIdx : "?"}`;
  }
```

**Do not** add an Ironman toggle (Plan 9 step 6). It is a story-creation schema change, a settings
surface, and a product decision, and it is explicitly marked optional in Plan 9. It is not smuggled
into a logging step.

**Acceptance criteria**

- `npx vitest run test/orchestrator/history.test.ts` (from `packages/core`) — both new tests GREEN,
  and all 16 pre-existing tests in that file still GREEN.
- The inversion check was performed and recorded: with `history.ts:148` deliberately broken, test 1
  FAILS. The edit is reverted; `git diff packages/core/src/orchestrator/history.ts` shows no trace
  of it.
- `grep -n "turn_rewound" packages/core/src/store/repositories/storyEvents.ts` returns exactly one
  hit, and it is the **last** member of the enum.
- `grep -c "journalTruncation" packages/core/src/orchestrator/history.ts` returns `4` — one
  declaration plus three call sites.
- `grep -n "node:crypto" packages/core/src/orchestrator/history.ts` returns zero hits.
- `npm run typecheck` clean.
- `npm test --workspaces --if-present` passes at **837** tests. Entering Phase 4 the suite is
  792 + 43 = 835 (Phase 1 adds 9, Phase 2 adds 10, Phase 3 adds 24); this step adds 2. Core +2.
- No migration file added; `store/db.ts`'s ladder still stops at 16.

**Rollback:** `git checkout -- packages/core/src/orchestrator/history.ts packages/core/src/orchestrator/journal.ts packages/core/src/store/repositories/storyEvents.ts packages/core/test/orchestrator/history.test.ts`

---

## Phase 5 — Suggestions

### Step 5.1 — Replace `sceneAnchors` with typed anchors

**Closes:** W-1 (file 07) / Plan 22 (file 11 §Plan 22). **Effort: S** — narrower than Plan 22's M,
because the expensive half is already built and correct.

**The defect, scoped precisely.** Plan 22 says *"delete the text processing; enumerate the catalog
and run `checkGate`."* **The second half already exists and is correct — do not rebuild it.**
`assemblePlayerSuggestionContext` (`packages/core/src/orchestrator/context.ts:304`) maps every
schema action through `checkGate` and keeps only survivors at `context.ts:351-371`:

```ts
availableActions = story.schema.actions
  .map((action) => ({ action, gate: checkGate(story.schema, actor, {...}, ...) }))
  .filter((candidate) => candidate.gate.allowed)
  .slice(0, 20)
```

and those survivors reach the model as `CURRENTLY GATE-ALLOWED ACTIONS` at
`suggestions.ts:245-248`. The gate path is done. **The actual defect is `sceneAnchors`.**
`buildSceneAnchors` (`context.ts:276-295`) takes the latest narrator tail, keeps words of 4+
characters that are not stop-words (`suggestionWords`, `context.ts:262-274`), **reverses the word
order** (`context.ts:292`, comment: *"Reverse word order so a long opening favors the live scene at
its end"*), and returns up to 40 of them as "anchors". That word bag is fed to the model at
`suggestions.ts:243` and — the part that actually damages the product — is the **sole** input to
`deterministicFallbackSuggestions` (`suggestions.ts:77`), which grabs `anchors[0]` and `anchors[1]`
positionally (`suggestions.ts:83`) and interpolates them into player-facing sentences like
`` `Ask ${npc.name} what they know about ${primaryAnchor}.` `` (`suggestions.ts:95`). Since the bag
is reversed prose, `primaryAnchor` is whichever long word happened to fall last in the paragraph.
That is where *"Ask Sorel what they know about slowly"* comes from. The fallback fires on **every**
model failure or schema-validation failure (`suggestions.ts:275-278`), which is precisely when the
player is already having a degraded experience.

Note that today's `UNSAFE_FALLBACK_ANCHORS` blocklist (`suggestions.ts:56-62`) is a five-word patch
over this — `absent`, `dead`, `dies`, `elsewhere`, `killed` — which is the tell that the input is
untyped. With typed anchors the blocklist becomes unnecessary, because an anchor can no longer be an
arbitrary word from the prose.

**Files to modify**

- `packages/core/src/orchestrator/context.ts` (`PlayerSuggestionContext`, `buildSceneAnchors`,
  `assemblePlayerSuggestionContext`)
- `packages/core/src/orchestrator/suggestions.ts` (`deterministicFallbackSuggestions`, the prompt)
- `packages/core/test/orchestrator/suggestions.test.ts`

**RED test — write first, run first, record the failure**

File: `packages/core/test/orchestrator/suggestions.test.ts`, appended inside
`describe("context-grounded possible moves", ...)` (opens at `suggestions.test.ts:152`).

Test name: `"assemblePlayerSuggestionContext returns typed anchors, not a word bag"`:

```ts
it("assemblePlayerSuggestionContext returns typed anchors, not a word bag", async () => {
  const { store, story } = await seedStory();
  stores.push(store);

  const context = await assemblePlayerSuggestionContext(store, story);

  // Typed anchors must be present
  expect(context.sceneAnchors).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "character", name: expect.any(String) }),
    ])
  );
  // No raw word-bag strings — every anchor must be an object with a `kind` field
  for (const anchor of context.sceneAnchors) {
    expect(typeof anchor).toBe("object");
    expect((anchor as { kind: string }).kind).toMatch(/^(character|item|location|thread)$/);
  }
});
```

Run: `npx vitest run test/orchestrator/suggestions.test.ts` from `packages/core`. Fails because
`sceneAnchors` is currently `string[]` and the test expects objects.

**Production edit**

**1. `context.ts` — replace the `sceneAnchors` type in `PlayerSuggestionContext` (`:233`).**

Replace:
```ts
  sceneAnchors: string[];
```
with:
```ts
  sceneAnchors: SceneAnchor[];
```

Add the new type immediately above `PlayerSuggestionContext` (before line 214):
```ts
export type SceneAnchorKind = "character" | "item" | "location" | "thread";

export interface SceneAnchor {
  kind: SceneAnchorKind;
  /** The display name or label — never a raw id, never a word-bag token. */
  name: string;
}
```

**2. `context.ts` — replace `buildSceneAnchors` (`:276-295`) entirely.**

Delete the existing function and replace with:
```ts
function buildSceneAnchors(
  visible: CharacterRecord[],
  player: CharacterRecord | undefined,
  world: WorldSoftState | null | undefined
): SceneAnchor[] {
  const anchors: SceneAnchor[] = [];
  const seen = new Set<string>();

  function add(anchor: SceneAnchor): void {
    const key = `${anchor.kind}:${anchor.name.toLowerCase()}`;
    if (!seen.has(key)) { seen.add(key); anchors.push(anchor); }
  }

  // Present non-player characters (most useful for dialogue suggestions).
  for (const c of visible) {
    if (!c.isPlayer) add({ kind: "character", name: c.name });
  }

  // Player's current location.
  const loc = player?.soft?.current.location?.trim();
  if (loc) add({ kind: "location", name: loc });

  // World locations that match the player's location or are listed in world state.
  if (world) {
    for (const wl of world.locations.slice(0, 6)) {
      add({ kind: "location", name: wl.name });
    }
    // Open narrative threads — give the fallback something to reference.
    for (const t of world.unresolvedThreads.filter((t) => !t.resolved).slice(0, 4)) {
      add({ kind: "thread", name: t.title });
    }
  }

  return anchors.slice(0, 20);
}
```

The `SUGGESTION_STOP_WORDS` constant (`context.ts:237-244`), `suggestionWords` (`context.ts:262-274`),
`normalizedSuggestionText` (`context.ts:258-260`), and `tailExcerpt` (`context.ts:250-255`) are all
still used by other parts of `assemblePlayerSuggestionContext` — do **not** delete them.

**3. `context.ts` — update the call site in `assemblePlayerSuggestionContext` (`:395`).**

Replace:
```ts
    sceneAnchors: buildSceneAnchors(narratorText, visible, player),
```
with:
```ts
    sceneAnchors: buildSceneAnchors(visible, player, world),
```

The `narratorText` argument is no longer needed by `buildSceneAnchors`. It is still used on the
lines above (`:316-317`) for `normalizedNarrator` — do not remove those lines.

**4. `suggestions.ts` — update `deterministicFallbackSuggestions` (`:64-150`).**

The function currently destructures `context.sceneAnchors` as `string[]`. Replace the anchor
extraction block (`:77-84`) with typed-anchor equivalents:

```ts
  const characterAnchors = context.sceneAnchors
    .filter((a) => a.kind === "character")
    .map((a) => a.name);
  const locationAnchors = context.sceneAnchors
    .filter((a) => a.kind === "location" || a.kind === "thread")
    .map((a) => a.name);

  const primaryAnchor = locationAnchors[0] ?? characterAnchors[1];
  const secondaryAnchor = locationAnchors[1] ?? locationAnchors[0];
  if (!primaryAnchor || !secondaryAnchor) return [];
```

Remove the `allCharacterNameWords` set and the three `.filter` calls that depended on it (`:72-80`)
— they existed only to strip character names from the word bag. With typed anchors, character names
are already in their own bucket and never appear in `locationAnchors`. Remove `UNSAFE_FALLBACK_ANCHORS`
(`suggestions.ts:56-62`) and its import — it is no longer referenced.

**5. `suggestions.ts` — update the model prompt (`:242-244`).**

Replace:
```ts
          "EXACT LIVE-SCENE ANCHORS:",
          context.sceneAnchors.join(", "),
```
with:
```ts
          "SCENE ANCHORS (typed):",
          context.sceneAnchors
            .map((a) => `${a.kind}: ${a.name}`)
            .join(", ") || "(none)",
```

**Acceptance criteria**

- New test GREEN; all pre-existing tests in `suggestions.test.ts` still GREEN (the existing
  `sceneAnchors` assertions at `suggestions.test.ts:168-169` must be updated to match the new
  object shape — they currently assert `expect(context.sceneAnchors).toContain("sorel")` and
  `expect(context.sceneAnchors).toContain("burden")`; replace with
  `expect(context.sceneAnchors.some((a) => a.name === "sorel")).toBe(true)` and
  `expect(context.sceneAnchors.some((a) => a.kind === "character" || a.kind === "location")).toBe(true)`).
- `npm run typecheck` clean — `sceneAnchors: string[]` must not appear anywhere.
- `grep -rn "UNSAFE_FALLBACK_ANCHORS" packages/` returns zero hits.
- `grep -rn "buildSceneAnchors" packages/core/src/` returns exactly two hits: the declaration and
  the call site in `assemblePlayerSuggestionContext`.
- `npm test --workspaces --if-present` passes at **838** tests (837 + 1). Core +1.
- The deterministic fallback, when triggered with a seeded store that has a present NPC and a world
  location, produces suggestions that name the NPC and the location — not arbitrary prose words.

**Rollback:** `git checkout -- packages/core/src/orchestrator/context.ts packages/core/src/orchestrator/suggestions.ts packages/core/test/orchestrator/suggestions.test.ts`

---

## Phase 6 — Observability

Two steps, in order. 6.0 makes the stage-outcome vocabulary honest; 6.1 counts things on top of it.
The edge `6.0 → 6.1` is hard: build counters on today's outcomes and the "degraded gracefully"
bucket is permanently zero while its traffic hides inside `timeout` and `error`.

### Step 6.0 — Make the `"fallback"` stage outcome real (it is declared and never emitted)

**Closes:** §0's second undocumented defect, recorded in `CONTEXT.md` by Step 0.2. **Effort: S.**

**Root cause.** `packages/core/src/orchestrator/stagePolicy.ts:25` declares
`outcome: "ok" | "fallback" | "timeout" | "cancelled" | "error"`, and the persisted enum at
`packages/core/src/store/repositories/turnOperations.ts:30` mirrors it
(`z.enum(["ok", "fallback", "timeout", "cancelled", "error"])`). No code path emits `"fallback"`.
`runStage` has exactly four `emit(...)` calls — `emit("cancelled")` at `stagePolicy.ts:90` and
`:141`, `emit("ok")` at `:135`, and `emit(timedOut ? "timeout" : "error")` at `:144` — and the
line immediately after that last one, `return options.fallback();` (`:145`), is the graceful
degradation the metric just failed to describe. Every stage that survived on its deterministic
fallback is filed as an outright failure. That is not a cosmetic mislabel: three of the four
fallbacks are load-bearing product behaviour — `fallback: () => planHostileNpcFallback(npcPlanInput)`
(`turn.ts:944`), the sealed classifier recovery at `turn.ts:735-751`, and
`fallback: () => undefined` in `authorityGuard.ts:434` / `:449`, which is what triggers
`usedSafeFallback: true` and the player-facing `fallbackReason`. Verify the whole claim in one
command before starting:

```bash
cd "C:\Users\anuji\Documents\midnight-tavern-app"
grep -rn '"fallback"' packages/core/src/orchestrator/stagePolicy.ts \
  packages/core/src/store/repositories/turnOperations.ts
grep -n "emit(" packages/core/src/orchestrator/stagePolicy.ts
```

Expect the variant in both type positions and zero `emit("fallback")`.

**The shape of the fix.** `outcome` becomes the *disposition* (what the caller got) and a new
optional `cause` carries *why* it was not `ok`:

| outcome | means | cause |
| --- | --- | --- |
| `ok` | the stage returned its own value | absent |
| `fallback` | the stage failed; the deterministic fallback produced the value; the turn continued | `"timeout"` or `"error"` |
| `cancelled` | the caller aborted; the abort propagated | absent |
| `error` | the stage failed **and** the fallback itself threw; nothing usable | `"timeout"` or `"error"` |

`"timeout"` disappears as an *outcome* and reappears as a *cause*, which is where it always
belonged — a timeout is not a disposition, it is a reason. The persisted enum keeps `"timeout"`
so save files written by the shipped build still parse; a Zod `.transform` maps the legacy value
forward on read. No migration.

One trap: the classifier's fallback closure at `turn.ts:736-738` reads its own not-yet-emitted
metric off the tail of the array (`stageMetrics.at(-1)?.outcome === "timeout"`). Under the new
order the emit moves after the fallback runs, so that peek would read the *previous* stage's
metric and silently mislabel every classifier recovery. The fix removes the peek entirely by
passing the cause into `fallback` as an argument.

**Files to modify**
- `packages/core/src/orchestrator/stagePolicy.ts`
- `packages/core/src/store/repositories/turnOperations.ts`
- `packages/core/src/orchestrator/turn.ts` (the classifier fallback closure only)
- four test files (below)

**RED test — write first**

1. File: `packages/core/test/orchestrator/stagePolicy.test.ts`, append to
   `describe("runStage — deadlines, fallbacks, telemetry")`:

```ts
it("records outcome fallback with cause timeout when a hung stage degrades gracefully", async () => {
  const { schedule, trigger } = controllableSchedule();
  const metrics: StageMetric[] = [];
  const pending = runStage<string[]>(
    "npc_planner",
    () => new Promise<string[]>(() => {}),
    {
      deadlineMs: 20_000,
      fallback: () => [],
      onMetric: (m) => metrics.push(m),
      schedule,
    }
  );
  await Promise.resolve();
  trigger();
  await expect(pending).resolves.toEqual([]);
  expect(metrics[0]).toMatchObject({
    stage: "npc_planner",
    outcome: "fallback",
    cause: "timeout",
  });
});

it("records outcome fallback with cause error when the stage throws", async () => {
  const metrics: StageMetric[] = [];
  const value = await runStage(
    "narrator",
    async () => {
      throw new Error("provider 500");
    },
    { deadlineMs: 1_000, fallback: () => "safe", onMetric: (m) => metrics.push(m) }
  );
  expect(value).toBe("safe");
  expect(metrics[0]).toMatchObject({ outcome: "fallback", cause: "error" });
});

it("passes the failure cause to the fallback factory", async () => {
  const seen: string[] = [];
  await runStage(
    "classifier",
    async () => {
      throw new Error("boom");
    },
    {
      deadlineMs: 1_000,
      fallback: (cause) => {
        seen.push(cause);
        return 0;
      },
    }
  );
  expect(seen).toEqual(["error"]);
});

it("records outcome error and rethrows when the fallback itself throws", async () => {
  const metrics: StageMetric[] = [];
  await expect(
    runStage(
      "authority_audit",
      async () => {
        throw new Error("stage down");
      },
      {
        deadlineMs: 1_000,
        fallback: () => {
          throw new Error("fallback down");
        },
        onMetric: (m) => metrics.push(m),
      }
    )
  ).rejects.toThrow("fallback down");
  expect(metrics[0]).toMatchObject({ outcome: "error", cause: "error" });
});

it("excludes fallback execution time from durationMs", async () => {
  const metrics: StageMetric[] = [];
  let clock = 0;
  await runStage(
    "narrator",
    async () => {
      throw new Error("boom");
    },
    {
      deadlineMs: 1_000,
      now: () => (clock += 10),
      fallback: () => {
        clock += 1_000; // an expensive deterministic fallback
        return "safe";
      },
      onMetric: (m) => metrics.push(m),
    }
  );
  expect(metrics[0]!.durationMs).toBeLessThan(1_000);
});
```

2. File: `packages/core/test/store/v7Repositories.test.ts`, append as its own `it` (do **not**
   fold it into the long round-trip test at `:269`):

```ts
it("reads a legacy timeout stage metric forward to fallback/timeout", async () => {
  const store = await openStore(":memory:");
  await store.turnOperations.upsert({
    id: "op-legacy",
    storyId: "s1",
    playerMessageId: "pm-1",
    state: "error",
    stageMetrics: [
      { stage: "narrator", startedAt: 350, durationMs: 60_000, outcome: "timeout" },
    ],
    createdAt: 1,
    updatedAt: 2,
  });
  expect((await store.turnOperations.get("op-legacy"))?.stageMetrics).toEqual([
    { stage: "narrator", startedAt: 350, durationMs: 60_000, outcome: "fallback", cause: "timeout" },
  ]);
});
```

Run:
```bash
cd packages/core && npx vitest run test/orchestrator/stagePolicy.test.ts test/store/v7Repositories.test.ts
```
All six fail — `cause` does not exist, `"fallback"` is never emitted, a throwing fallback
currently propagates with an `error` metric that carries no cause, and the legacy row reads back
verbatim.

**Production edit**

1. `packages/core/src/orchestrator/stagePolicy.ts` — replace the `StageMetric` interface at `:21-26`:

```ts
/** Why a stage did not return its own value. A timeout is a cause, never a disposition. */
export type StageFailureCause = "timeout" | "error";

export interface StageMetric {
  stage: TurnStage;
  startedAt: number;
  durationMs: number;
  /**
   * What the CALLER got. `ok` = the stage's own value; `fallback` = the deterministic fallback
   * stood in and the turn continued; `cancelled` = the caller aborted; `error` = the fallback
   * itself threw and nothing usable was produced.
   */
  outcome: "ok" | "fallback" | "cancelled" | "error";
  /** Present whenever `outcome` is `fallback` or `error`. */
  cause?: StageFailureCause;
}
```

2. Same file — `fallback` takes the cause. Replace the `fallback` field of `RunStageOptions<T>`
   at `:42-43`:

```ts
  /** Deterministic fallback produced on timeout/error. Should not throw; if it does, `runStage` rethrows. */
  fallback: (cause: StageFailureCause) => T;
```

3. Same file — replace `emit` (`:80-86`) so it accepts the cause and snapshots the duration
   *before* the fallback runs:

```ts
  const emit = (
    outcome: StageMetric["outcome"],
    durationMs: number,
    cause?: StageFailureCause
  ): void => {
    try {
      options.onMetric?.({
        stage,
        startedAt,
        durationMs,
        outcome,
        ...(cause ? { cause } : {}),
      });
    } catch {
      /* telemetry must never break a turn */
    }
  };
  const elapsed = (): number => Math.max(0, now() - startedAt);
```

4. Same file — update the four call sites. `:90` becomes `emit("cancelled", elapsed());`,
   `:135` becomes `emit("ok", elapsed());`, `:141` becomes `emit("cancelled", elapsed());`,
   and the tail of the `catch` (`:144-145`) becomes:

```ts
    const cause: StageFailureCause = timedOut ? "timeout" : "error";
    const durationMs = elapsed(); // measured before the fallback runs
    try {
      const value = options.fallback(cause);
      emit("fallback", durationMs, cause);
      return value;
    } catch (fallbackError) {
      // The contract says a fallback must not throw. If one does, the turn genuinely has no
      // usable value — report it as `error` and propagate rather than inventing one.
      emit("error", durationMs, cause);
      throw fallbackError;
    }
```

5. `packages/core/src/store/repositories/turnOperations.ts` — replace `StageMetricSchema`
   (`:20-31`). The input enum keeps `"timeout"` for legacy rows; the transform normalises it:

```ts
const StageMetricSchema = z
  .object({
    stage: z.enum([
      "classifier",
      "npc_introduction",
      "npc_planner",
      "narrator",
      "authority_audit",
    ]),
    startedAt: z.number().int().nonnegative(),
    durationMs: z.number().nonnegative(),
    // "timeout" is accepted on READ only: rows written before the outcome/cause split use it as
    // an outcome. Normalised below. Nothing new ever writes it.
    outcome: z.enum(["ok", "fallback", "timeout", "cancelled", "error"]),
    cause: z.enum(["timeout", "error"]).optional(),
  })
  .transform((metric) =>
    metric.outcome === "timeout"
      ? { ...metric, outcome: "fallback" as const, cause: "timeout" as const }
      : metric
  );
```

`TurnOperationSchema.parse` runs on both `upsert` (`:138`) and `toRecord` (`:100`), so the
normalisation applies on write and on read; a legacy row is rewritten in its new shape the next
time its operation is upserted.

6. `packages/core/src/orchestrator/turn.ts` — replace the classifier fallback closure
   (`:735-751`) so it reads the cause from its argument instead of the metric array:

```ts
          fallback: (cause) => {
            const timedOut = cause === "timeout";
            return recoverClassifierFailure(
              schema,
              classifierInput,
              [{
                kind: timedOut ? "timeout" : "provider_error",
                message: timedOut
                  ? "The classifier exceeded its deadline; sealed local recovery was applied."
                  : "The classifier failed; sealed local recovery was applied.",
                retryable: true,
              }],
              timedOut ? "StageTimeout" : "ClassifierError"
            );
          },
```

The other three fallbacks (`turn.ts:675`, `turn.ts:944`, `authorityGuard.ts:434` and `:449`) are
zero-arg arrow functions and remain valid under the new signature — a function that ignores its
parameter is assignable. Do not edit them.

7. Update the six existing assertions that name a `"timeout"` outcome. Each becomes
   `outcome: "fallback", cause: "timeout"`:
   - `packages/core/test/orchestrator/stagePolicy.test.ts:63` and `:76` — replaced wholesale by
     the new tests above; delete the two superseded `it` blocks
     (`"returns the deterministic fallback and aborts a hung stage on timeout"` keeps its abort
     assertion, so keep that one and only change its metric expectation).
   - `packages/core/test/orchestrator/authorityGuard.test.ts:395` and `:445`.
   - `packages/core/test/orchestrator/turn.test.ts:873` and `:943`.
   - `packages/core/test/orchestrator/authorityGuard.test.ts:484` and `:590` (`outcome: "error"`)
     become `outcome: "fallback", cause: "error"` — both are stages whose fallback succeeded.

**Acceptance criteria**
- `grep -rn 'emit("fallback"' packages/core/src/orchestrator/stagePolicy.ts` returns one hit.
- `grep -rn 'outcome === "timeout"' packages/core/src packages/ui/src` returns zero hits.
- `grep -rn "stageMetrics.at(-1)" packages/core/src` returns zero hits.
- All six new tests GREEN; the eight amended assertions GREEN.
- `npm run typecheck` clean (the `fallback` signature change is checked at all five call sites).
- `npm test --workspaces --if-present` — count rises from 838 to 844 (six added, none removed;
  the two superseded `stagePolicy` blocks are replaced by named successors, so net +6 requires
  deleting exactly one of them — if your count lands at 843, that is correct and expected).
- A legacy `outcome: "timeout"` row still parses. Guaranteed by the `v7Repositories` test.

**Rollback:** `git checkout -- packages/core/src/orchestrator/stagePolicy.ts packages/core/src/store/repositories/turnOperations.ts packages/core/src/orchestrator/turn.ts packages/core/test/orchestrator/stagePolicy.test.ts packages/core/test/orchestrator/authorityGuard.test.ts packages/core/test/orchestrator/turn.test.ts packages/core/test/store/v7Repositories.test.ts`

---
### Step 6.1 — Local, opt-in counters and a Diagnostics screen

**Closes:** Plan 11 / W-10 (file 11 §Plan 11). **Effort: M.** **Blocked on 6.0.**

**Root cause.** `packages/core/src/observability/logger.ts` is 21 lines: a `DiagnosticLogger`
interface and `NOOP_DIAGNOSTIC_LOGGER`. That is the entire observability surface in core. It is
re-exported from `packages/core/src/router/index.ts:89-93` and consumed by exactly one module —
`makeRouter` (`router.ts:225`, `:230-236`). Nothing counts anything. The product's central claims
— *the DM says no*, *the authority wall rejects contradicting prose*, *a hung stage degrades
instead of failing* — all happen, all are individually observable in a log line, and none is
countable. The owner cannot answer "how often did the DM refuse me last session?" and neither can
a bug report.

**Scope, decided.** Plan 11 lists eight counter families. Seven are buildable against seams that
exist today; one is not, and is dropped here rather than faked:

| Plan 11 counter | Decision | Seam |
| --- | --- | --- |
| `gate.denied` by code | **In.** One bucket per `GateVerdict["code"]` — the nine values at `types/events.ts:92-102`. | Every committed `Ruling` carries `gate: GateVerdictSchema` (`types/events.ts:172`). Count from the returned rulings; do **not** thread a logger into `checkGate` (`gate.ts:99`), which is pure. |
| `authorityGuard.draftRejected` | **In.** | `GuardedNarrationResult.repairCount` (`authorityGuard.ts:57`). |
| `authorityGuard.safeSummaryUsed` | **In.** | `GuardedNarrationResult.usedSafeFallback` (`authorityGuard.ts:58`), surfaced as `SubmitTurnResult.usedNarratorFallback` (`turn.ts:122`). |
| `classifier.failed` / `.recovered` | **Merged into one.** There is no "failed and not recovered" path — `recoverClassifierFailure` always produces a sealed turn. Two counters would always be equal. One counter: `classifier.recovered`. | `SubmitTurnResult.classifierRecovered` (`turn.ts:116`). |
| `provider.retried` / `.failed` | **In.** | The router already logs `llm.request.retrying` (`router.ts:300`) and `llm.request.failed` (`router.ts:312`) through the injected `DiagnosticLogger`. Count by **wrapping the logger passed to `makeRouter`** (`sqliteBridge.ts:121`), not by editing `router.ts`. |
| `turn.latency` by stage | **In, as sum + count.** Two counters per stage, so mean latency is `total ÷ count` and the store stays a flat integer map with no histogram machinery. | `StageMetric.durationMs`. |
| stage fallbacks | **In — this is what 6.0 unlocked.** One bucket per `(stage, cause)`. | `StageMetric.outcome === "fallback"` with `metric.cause`. Before 6.0 this bucket does not exist. |
| `story.turnCount` at abandon | **Out.** There is no abandon signal anywhere in the app — no session-close, no story-close, no unload hook. Building one is a product decision, not an observability task. Recorded here as explicitly not built. | — |

**Persistence: the `settings` table, not a new table.** `SettingsRepo` (`repositories/settings.ts`)
is already a typed, Zod-validated key→value store used for exactly this class of install-global
state (`ROLE_MAP_SETTING_KEY`, `contextBudget` at `context.ts:474`, the license cache at
`licensing/license.ts:71`). The counter set is a bounded integer map — under 2 KB — so a dedicated
table buys nothing and costs a migration. **Migration 17 is reserved for Plan 19** (§0 item 2); do
not consume it here. `db.ts:477` is version 16 and the ladder must stay clean.

**Opt-in and local-only, enforced in code.** A `diagnosticsEnabled` boolean setting, default
`false`. When it is false, `recordTurnCounters` is a no-op and no counter row is ever written.
Nothing here touches the network — the only `fetch` in the app is the router's, and this step adds
no call site.

**Files to modify / create**
- `packages/core/src/observability/counters.ts` (new)
- `packages/core/src/observability/index.ts` (new — barrel)
- `packages/core/src/index.ts` (export the barrel)
- `packages/ui/src/bridge/sqliteBridge.ts` (wiring + the logger wrapper)
- `packages/ui/src/bridge/core.ts` (three `CoreBridge` methods + the memory-bridge stubs)
- `packages/ui/src/screens/Diagnostics.tsx` (new)
- `packages/ui/src/screens/registry.ts`, `packages/ui/src/app/router.ts`, `packages/ui/src/app/App.tsx` (route)
- `packages/ui/src/screens/Settings.tsx` (link from the existing `id="diagnostics"` section, `:464`)

**RED test — write first**

1. File: `packages/core/test/observability/counters.test.ts` (new file, new directory).

```ts
import { describe, expect, it } from "vitest";
import {
  countersForTurn,
  mergeCounters,
  EMPTY_DIAGNOSTIC_COUNTERS,
} from "../../src/observability/counters.js";

describe("countersForTurn — a pure fold from one turn's outputs to counter deltas", () => {
  it("counts each gate denial under its own code", () => {
    const deltas = countersForTurn({
      rulings: [
        { gate: { allowed: false, code: "cannot_afford" } },
        { gate: { allowed: false, code: "cannot_afford" } },
        { gate: { allowed: false, code: "actor_dead" } },
        { gate: { allowed: true } },
      ],
      stageMetrics: [],
      classifierRecovered: false,
      usedNarratorFallback: false,
      narratorRepairCount: 0,
    });
    expect(deltas["gate.denied.cannot_afford"]).toBe(2);
    expect(deltas["gate.denied.actor_dead"]).toBe(1);
    expect(deltas["gate.allowed"]).toBe(1);
  });

  it("counts a stage fallback under its stage AND its cause", () => {
    const deltas = countersForTurn({
      rulings: [],
      stageMetrics: [
        { stage: "npc_planner", startedAt: 0, durationMs: 20_000, outcome: "fallback", cause: "timeout" },
        { stage: "narrator", startedAt: 0, durationMs: 900, outcome: "ok" },
      ],
      classifierRecovered: false,
      usedNarratorFallback: false,
      narratorRepairCount: 0,
    });
    expect(deltas["stage.fallback.npc_planner.timeout"]).toBe(1);
    expect(deltas["stage.fallback.narrator.timeout"]).toBeUndefined();
  });

  it("accumulates latency as a sum and a count per stage", () => {
    const deltas = countersForTurn({
      rulings: [],
      stageMetrics: [
        { stage: "narrator", startedAt: 0, durationMs: 900, outcome: "ok" },
        { stage: "narrator", startedAt: 0, durationMs: 1_100, outcome: "ok" },
      ],
      classifierRecovered: false,
      usedNarratorFallback: false,
      narratorRepairCount: 0,
    });
    expect(deltas["stage.durationMs.narrator"]).toBe(2_000);
    expect(deltas["stage.runs.narrator"]).toBe(2);
  });

  it("counts classifier recovery, narrator repairs, and the safe summary", () => {
    const deltas = countersForTurn({
      rulings: [],
      stageMetrics: [],
      classifierRecovered: true,
      usedNarratorFallback: true,
      narratorRepairCount: 2,
    });
    expect(deltas["classifier.recovered"]).toBe(1);
    expect(deltas["authorityGuard.draftRejected"]).toBe(2);
    expect(deltas["authorityGuard.safeSummaryUsed"]).toBe(1);
  });

  it("always counts the turn itself, so every rate has a denominator", () => {
    const deltas = countersForTurn({
      rulings: [],
      stageMetrics: [],
      classifierRecovered: false,
      usedNarratorFallback: false,
      narratorRepairCount: 0,
    });
    expect(deltas["turn.completed"]).toBe(1);
  });
});

describe("mergeCounters", () => {
  it("adds deltas onto an existing set without mutating either input", () => {
    const base = { "turn.completed": 3, "gate.denied.actor_dead": 1 };
    const merged = mergeCounters(base, { "turn.completed": 1, "provider.retried": 2 });
    expect(merged).toEqual({
      "turn.completed": 4,
      "gate.denied.actor_dead": 1,
      "provider.retried": 2,
    });
    expect(base["turn.completed"]).toBe(3);
  });

  it("starts from an empty set", () => {
    expect(mergeCounters(EMPTY_DIAGNOSTIC_COUNTERS, { "turn.completed": 1 })).toEqual({
      "turn.completed": 1,
    });
  });
});
```

2. File: `packages/ui/test/bridge/sqliteBridge.test.ts`, append:

```ts
it("does not persist counters while diagnostics are disabled", async () => {
  const bridge = await makeSqliteBridge();
  expect(await bridge.getDiagnosticsEnabled()).toBe(false);
  await bridge.submitTurn({ storyId: "s1", playerText: "look around" });
  expect(await bridge.readDiagnosticCounters()).toEqual({});
});

it("persists counters across a reopen once diagnostics are enabled", async () => {
  const bridge = await makeSqliteBridge();
  await bridge.setDiagnosticsEnabled(true);
  await bridge.submitTurn({ storyId: "s1", playerText: "look around" });
  const first = await bridge.readDiagnosticCounters();
  expect(first["turn.completed"]).toBe(1);
  await bridge.submitTurn({ storyId: "s1", playerText: "again" });
  expect((await bridge.readDiagnosticCounters())["turn.completed"]).toBe(2);
});

it("clearDiagnosticCounters empties the set", async () => {
  const bridge = await makeSqliteBridge();
  await bridge.setDiagnosticsEnabled(true);
  await bridge.submitTurn({ storyId: "s1", playerText: "look around" });
  await bridge.clearDiagnosticCounters();
  expect(await bridge.readDiagnosticCounters()).toEqual({});
});
```

Match the existing file's fixture style — it already builds a bridge over a fake store and asserts
against `core.submitTurn` spies (`sqliteBridge.test.ts:255-267`, `:346-362`). Reuse that harness;
do not invent a second one.

3. File: `packages/ui/test/screens/Diagnostics.test.tsx` (new).

```ts
it("shows the opt-in explanation and no counters until diagnostics are enabled", async () => {
  setBridge(makeMemoryBridge());
  render(<Diagnostics />);
  await waitFor(() => expect(screen.getByText("Local diagnostics")).toBeInTheDocument());
  expect(screen.getByText(/never uploaded/i)).toBeInTheDocument();
  expect(screen.getByText(/Turn on local diagnostics to start counting/i)).toBeInTheDocument();
});

it("renders one row per recorded counter with its value", async () => {
  const bridge = makeMemoryBridge();
  setBridge(bridge);
  await bridge.setDiagnosticsEnabled(true);
  await bridge.__seedDiagnosticCounters({ "turn.completed": 12, "gate.denied.actor_dead": 3 });
  render(<Diagnostics />);
  const row = await screen.findByTestId("counter-gate.denied.actor_dead");
  expect(within(row).getByText("3")).toBeInTheDocument();
  expect(within(screen.getByTestId("counter-turn.completed")).getByText("12")).toBeInTheDocument();
});
```

Run:
```bash
cd packages/core && npx vitest run test/observability/counters.test.ts
cd ../ui && npx vitest run test/bridge/sqliteBridge.test.ts test/screens/Diagnostics.test.tsx
```
All fail: the module, the three bridge methods, and the screen do not exist.

**Production edit**

1. `packages/core/src/observability/counters.ts` (new):

```ts
/**
 * Local, opt-in diagnostic counters (Plan 11 / W-10).
 *
 * A flat integer map. `countersForTurn` is a PURE fold from one turn's already-computed outputs to
 * a delta map — it performs no I/O, imports no store, and is therefore testable in isolation and
 * safe on the webview path. Persistence and the opt-in gate live in the app layer, not here.
 *
 * Counter keys are dotted and stable. `total ÷ runs` gives mean stage latency; keeping only sums
 * avoids shipping a histogram for a developer panel.
 */
import { z } from "zod";
import type { GateVerdict, Ruling } from "../types/index.js";
import type { StageMetric } from "../orchestrator/stagePolicy.js";

/** Hard cap so a bug can never grow the map without bound; the closed key set is far below it. */
export const MAX_DIAGNOSTIC_COUNTERS = 64;

export const DiagnosticCountersSchema = z
  .record(z.string().min(1), z.number().int().nonnegative())
  .refine((map) => Object.keys(map).length <= MAX_DIAGNOSTIC_COUNTERS, {
    message: `A diagnostic counter set may hold at most ${MAX_DIAGNOSTIC_COUNTERS} keys.`,
  });
export type DiagnosticCounters = z.infer<typeof DiagnosticCountersSchema>;

export const DIAGNOSTIC_COUNTERS_SETTING_KEY = "diagnosticCounters";
export const DIAGNOSTICS_ENABLED_SETTING_KEY = "diagnosticsEnabled";

export const EMPTY_DIAGNOSTIC_COUNTERS: DiagnosticCounters = Object.freeze({});

export interface TurnCounterInput {
  /** Only `gate` is read; the parameter is widened so callers may pass full rulings. */
  rulings: readonly Pick<Ruling, "gate">[] | readonly { gate: GateVerdict }[];
  stageMetrics: readonly StageMetric[];
  classifierRecovered: boolean;
  usedNarratorFallback: boolean;
  /** `GuardedNarrationResult.repairCount` — how many drafts the authority auditor rejected. */
  narratorRepairCount: number;
}

/** Pure: one turn's outputs → counter deltas. Never throws. */
export function countersForTurn(input: TurnCounterInput): DiagnosticCounters {
  const deltas: Record<string, number> = { "turn.completed": 1 };
  const bump = (key: string, by = 1): void => {
    deltas[key] = (deltas[key] ?? 0) + by;
  };

  for (const { gate } of input.rulings) {
    if (gate.allowed) bump("gate.allowed");
    else bump(`gate.denied.${gate.code ?? "unspecified"}`);
  }
  for (const metric of input.stageMetrics) {
    bump(`stage.runs.${metric.stage}`);
    bump(`stage.durationMs.${metric.stage}`, Math.round(metric.durationMs));
    if (metric.outcome === "fallback" || metric.outcome === "error") {
      bump(`stage.${metric.outcome}.${metric.stage}.${metric.cause ?? "error"}`);
    }
  }
  if (input.classifierRecovered) bump("classifier.recovered");
  if (input.usedNarratorFallback) bump("authorityGuard.safeSummaryUsed");
  if (input.narratorRepairCount > 0)
    bump("authorityGuard.draftRejected", input.narratorRepairCount);
  return deltas;
}

/** Pure: add `deltas` onto `base`, returning a new map. Neither input is mutated. */
export function mergeCounters(
  base: DiagnosticCounters,
  deltas: DiagnosticCounters
): DiagnosticCounters {
  const merged: Record<string, number> = { ...base };
  for (const [key, value] of Object.entries(deltas)) {
    merged[key] = (merged[key] ?? 0) + value;
  }
  return merged;
}
```

2. `packages/core/src/observability/index.ts` (new):

```ts
export {
  NOOP_DIAGNOSTIC_LOGGER,
  type DiagnosticData,
  type DiagnosticLogger,
} from "./logger.js";
export {
  DiagnosticCountersSchema,
  DIAGNOSTIC_COUNTERS_SETTING_KEY,
  DIAGNOSTICS_ENABLED_SETTING_KEY,
  EMPTY_DIAGNOSTIC_COUNTERS,
  MAX_DIAGNOSTIC_COUNTERS,
  countersForTurn,
  mergeCounters,
  type DiagnosticCounters,
  type TurnCounterInput,
} from "./counters.js";
```

3. `packages/core/src/index.ts` — add `export * from "./observability/index.js";` after line 22.
   `router/index.ts:89-93` already re-exports the three logger symbols; a duplicate star re-export
   of the *same* binding is legal in TypeScript and emits no error. If `npm run typecheck` disagrees
   in your version, delete the logger re-export block in `router/index.ts:89-93` instead — nothing
   outside `router/` imports them from that path.

4. `packages/ui/src/bridge/sqliteBridge.ts` — add the persistence helpers near `requireStory`
   (`:127`), so both `submitTurn` and `retryTurnOperation` can use them:

```ts
  async function diagnosticsEnabled(): Promise<boolean> {
    return (
      (await store.settings.get(core.DIAGNOSTICS_ENABLED_SETTING_KEY, z.boolean())) ?? false
    );
  }

  /** Fold a turn's outputs into the persisted counter set. Opt-in; never throws into the turn. */
  async function recordTurnCounters(input: core.TurnCounterInput): Promise<void> {
    try {
      if (!(await diagnosticsEnabled())) return;
      const current =
        (await store.settings.get(
          core.DIAGNOSTIC_COUNTERS_SETTING_KEY,
          core.DiagnosticCountersSchema
        )) ?? core.EMPTY_DIAGNOSTIC_COUNTERS;
      await store.settings.set(
        core.DIAGNOSTIC_COUNTERS_SETTING_KEY,
        core.DiagnosticCountersSchema,
        core.mergeCounters(current, core.countersForTurn(input))
      );
    } catch (error) {
      diagnosticsLogger.warn("diagnostics.counters.failed", { error: diagnosticError(error) });
    }
  }
```

`z` is already available to this module via `core`'s dependency; if it is not imported here, add
`import { z } from "zod";` at the top — `packages/core/package.json:18` pins `zod ^3.24.1` and the
UI resolves it through the workspace.

5. Same file — in `submitTurn`, collect the metrics and fold them once, after the turn returns.
   Inside the `try` at `:369`, before the `core.submitTurn` call:

```ts
        const turnStageMetrics: core.StageMetric[] = [];
```

then change the `onStageMetric` forwarding at `:379` to tee into that array:

```ts
          onStageMetric: (metric: core.StageMetric) => {
            turnStageMetrics.push(metric);
            args.onStageMetric?.(metric);
          },
```

(the conditional spread is no longer needed — the handler is now always installed), and after the
`diagnosticsLogger.info("turn.submit.completed", …)` call at `:382`:

```ts
        await recordTurnCounters({
          rulings: result.rulings,
          stageMetrics: turnStageMetrics,
          classifierRecovered: result.classifierRecovered,
          usedNarratorFallback: result.usedNarratorFallback,
          narratorRepairCount: turnStageMetrics.filter(
            (m) => m.stage === "narrator" && m.outcome !== "cancelled"
          ).length - 1,
        });
```

`repairCount` is not on `SubmitTurnResult`, and adding it there is a core API change this step does
not need: the narrator stage runs once per attempt, so *attempts − 1* is the rejected-draft count
by construction (`authorityGuard.ts:497` — one `runNarrator` per loop iteration). Clamp at zero
inside `countersForTurn` via `if (input.narratorRepairCount > 0)`, which it already does.

6. Same file — apply the identical two edits to `retryTurnOperation` (`:426-447`). A retried turn is
   a turn; not counting it makes every rate wrong on exactly the sessions most worth inspecting.

7. Same file — wrap the logger passed to `makeRouter` (`:121`) so provider retries and failures land
   in the counter set. Insert above `currentRouter`:

```ts
  /** Counts the two provider events the router already logs. Adds no new call site in core. */
  const countingLogger: core.DiagnosticLogger = {
    debug: (event, data) => diagnosticsLogger.debug(event, data),
    info: (event, data) => diagnosticsLogger.info(event, data),
    warn: (event, data) => {
      diagnosticsLogger.warn(event, data);
      if (event === "llm.request.retrying") void bumpCounter("provider.retried");
    },
    error: (event, data) => {
      diagnosticsLogger.error(event, data);
      if (event === "llm.request.failed") void bumpCounter("provider.failed");
    },
  };
```

with a small sibling of `recordTurnCounters`:

```ts
  async function bumpCounter(key: string): Promise<void> {
    try {
      if (!(await diagnosticsEnabled())) return;
      const current =
        (await store.settings.get(
          core.DIAGNOSTIC_COUNTERS_SETTING_KEY,
          core.DiagnosticCountersSchema
        )) ?? core.EMPTY_DIAGNOSTIC_COUNTERS;
      await store.settings.set(
        core.DIAGNOSTIC_COUNTERS_SETTING_KEY,
        core.DiagnosticCountersSchema,
        core.mergeCounters(current, { [key]: 1 })
      );
    } catch {
      /* a counter must never break a provider call */
    }
  }
```

Then change `logger: diagnosticsLogger` at `:121` to `logger: countingLogger`. The router's own
behaviour is untouched — `makeRouter` takes `logger?: DiagnosticLogger` (`router.ts:109`) and calls
it inside a `try/catch` that already swallows throws (`router.ts:230-236`).

8. `packages/ui/src/bridge/core.ts` — add four methods to `CoreBridge` (after
   `exportStoryJournal`, `:505`):

```ts
  /** Local diagnostics (Plan 11). Opt-in, never uploaded, and off by default. */
  getDiagnosticsEnabled(): Promise<boolean>;
  setDiagnosticsEnabled(enabled: boolean): Promise<void>;
  readDiagnosticCounters(): Promise<DiagnosticCounters>;
  clearDiagnosticCounters(): Promise<void>;
```

Import `type DiagnosticCounters` from core alongside `StageMetric` (`core.ts:58`, `:143`).
Implement them in `makeSqliteBridge` over the same two setting keys, and in `makeMemoryBridge`
(`:1004`) over two module-local variables plus a test-only seeder:

```ts
  let memDiagnosticsEnabled = false;
  let memCounters: DiagnosticCounters = {};
  // …in the returned object:
    async getDiagnosticsEnabled() { return memDiagnosticsEnabled; },
    async setDiagnosticsEnabled(enabled) { memDiagnosticsEnabled = enabled; },
    async readDiagnosticCounters() { return { ...memCounters }; },
    async clearDiagnosticCounters() { memCounters = {}; },
    /** Test-only seam used by the Diagnostics screen test; not on `CoreBridge`. */
    async __seedDiagnosticCounters(counters: DiagnosticCounters) { memCounters = { ...counters }; },
```

Declare `__seedDiagnosticCounters` on the memory bridge's *return type* only (an intersection
`CoreBridge & { __seedDiagnosticCounters(...): Promise<void> }`), so it never appears on the
production interface.

9. `packages/ui/src/screens/Diagnostics.tsx` (new). A read-only panel. Requirements, all
   mechanically checkable:

- Heading `<h1>Local diagnostics</h1>`; a lede containing the exact phrase *"never uploaded"*.
- A single toggle bound to `getDiagnosticsEnabled` / `setDiagnosticsEnabled`, labelled
  **"Count local diagnostics"**, with `aria-checked` reflecting state.
- When disabled: the sentence *"Turn on local diagnostics to start counting."* and no counter rows.
- When enabled: a real `<table>` with `<caption>Counters since the last reset</caption>` and a
  `<th scope="col">` per column (`Counter`, `Value`) — a data table needs table semantics, not
  styled divs. One `<tr data-testid={`counter-${key}`}>` per key, keys sorted with
  `localeCompare`, values rendered with `toLocaleString()`.
- A derived row per stage showing mean latency: `stage.durationMs.<s> ÷ stage.runs.<s>`, rounded to
  a whole millisecond, rendered as `stage.meanMs.<s>`. Computed at render; never persisted.
- **Export** button reusing the Journal's proven pattern verbatim (`Journal.tsx:142-148`):
  `new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" })` →
  object URL → `anchor.download = "midnight-tavern-diagnostics.json"` → `URL.revokeObjectURL`.
  The payload is `{ exportedAt: new Date().toISOString(), counters }` — counters only. No story
  text, no prompts, no character names, no provider keys: the counter keys are a closed dotted set
  and the values are integers, so the export is structurally incapable of carrying user content.
- **Reset** button calling `clearDiagnosticCounters`, behind a confirm step (a two-click
  arm/confirm, matching how the app handles other destructive local actions).
- One sentence stating what this is: *"A developer panel. These numbers describe this install only
  and are not analytics."* Plan 11 step 2 asks for exactly this and the UI must say it.

10. Route wiring, three files:
- `packages/ui/src/app/router.ts:12-28` — add `"diagnostics"` to `ROUTES`.
- `packages/ui/src/screens/registry.ts` — `const Diagnostics = lazy(() => import("./Diagnostics.js").then((m) => ({ default: m.Diagnostics })));` and `diagnostics: Diagnostics,` in the `registry` record.
- `packages/ui/src/app/App.tsx:293` — add `diagnostics: "Diagnostics",` to the title map, and add
  `"diagnostics"` to the Settings nav item's `activeOn` array (`:43`) so the ⚙ stays lit.

11. `packages/ui/src/screens/Settings.tsx` — inside the existing `<section id="diagnostics">`
    (`:464-484`), below the "Open logs folder" button, add a second `Button variant="system"`
    labelled **"View local counters"** that calls `navigate("diagnostics")`. The section already
    exists and already explains local-only logging; this is the entry point, not a new section.

**Acceptance criteria**
- All 7 counter tests (5 `countersForTurn` + 2 `mergeCounters`), 3 bridge tests, and 2 screen tests
  GREEN. Suite ≥ **856** (844 after 6.0, + 12 here).
- `npm run typecheck` clean across both workspaces.
- `git diff --stat packages/core/src/store/db.ts` is empty — **no migration was added** and
  version 17 is still unused: `grep -c "version: 17" packages/core/src/store/db.ts` returns `0`.
- With diagnostics off (the default), `readDiagnosticCounters()` returns `{}` after a turn.
  Asserted by the first bridge test.
- `grep -rn "checkGate" packages/core/src/engine/gate.ts` shows the signature unchanged — no logger,
  no counter, still pure.
- `grep -rn "fetch\|http" packages/ui/src/screens/Diagnostics.tsx packages/core/src/observability/`
  returns zero hits. Local-only is verified, not asserted in prose.
- `countersForTurn` imports nothing from `store/` — `grep -n "store" packages/core/src/observability/counters.ts` returns zero hits.
- The exported JSON contains only `exportedAt` and integer-valued counters. Assert in the screen
  test by parsing the blob and checking `Object.values(parsed.counters).every(Number.isInteger)`.

**Rollback:** `git checkout -- packages/core/src/index.ts packages/ui/src/bridge/sqliteBridge.ts packages/ui/src/bridge/core.ts packages/ui/src/screens/registry.ts packages/ui/src/screens/Settings.tsx packages/ui/src/app/router.ts packages/ui/src/app/App.tsx packages/ui/test/bridge/sqliteBridge.test.ts && rm -rf packages/core/src/observability/counters.ts packages/core/src/observability/index.ts packages/core/test/observability packages/ui/src/screens/Diagnostics.tsx packages/ui/test/screens/Diagnostics.test.tsx`

---
## Deferred queue

Six plans deliberately out of this pass, in dependency order. Each paragraph states the scope, why
it is not here, and the specific condition that starts it. **This order is not a priority ranking** —
Plan 21 is smallest and first because it unblocks nothing but is blocked by nothing either, and the
two XLs behind it are ordered by what they feed.

**Plan 21 — Decompose `validateStorySchema`** (file 11 §Plan 21; closes W-5; **M**). One function,
`bootstrap/validate.ts:130`, at cyclomatic 65 / cognitive 153 across 224 lines, split into one pure
validator per concern (attributes, skills, actions, items, tiers, starting state, cross-references),
each returning typed violations with a stable machine code, with `validateStorySchema` reduced to a
thin composition and the `repair.ts` loop retargeted at codes instead of prose feedback. It is
deferred because it is a pure refactor of a function whose behaviour nothing in Phases 0-6 changes,
and because Plan 21 step 1 is *characterisation tests first* — capturing current behaviour across
valid schemas, every individual invalid case, and the repair loop is most of the work and cannot be
compressed. Two things must be true before it starts: the full suite green at the Phase 6 exit gate
so the characterisation tests are written against a known-good tree, and **Step 6.1 landed** —
Plan 21 step 5 wants the repair loop capped *and instrumented*, and "repairs forever" only becomes a
visible, countable event once a counter exists to put it in. Without 6.1 that step degrades to a
silent cap, which is a worse product than a visible hang.

**Plan 19 — Land the NPC scene/actor model** (file 11 §Plan 19; closes D-3, W-6; **XL**). The
already-written, wholly unstarted `docs/superpowers/plans/2026-08-02-npc-scene-system-redesign.md`:
one shared actor/scene/event model replacing the eight private opinions currently held by the
registrar, regex promotion, classifier, reaction heuristic, NPC planner, narrator, analyzer, and
suggestion tokenizer — new `types/scene.ts`, `orchestrator/sceneReconciler.ts`,
`narrativeBeatPlan.ts`, `npcCapabilityProvisioner.ts`, `store/repositories/characterAliases.ts`,
the `orchestrator/turn/` phase split, and migration 17. It is deferred because it is 1-3 months and
because Phase 2's disposition work is the correct thing to ship first: Plan 19's own step 1 says
*do Plan 7 first* — that removes the user-visible absurdity in days, this removes its cause in
months, and Phase 2's split predicates become inputs to the event model rather than being thrown
away. **The recorded-but-unscheduled perf issue belongs to this plan, and only to this plan.**
`packages/core/src/orchestrator/turn.ts:651` runs `store.rulings.listByStory(storyId)` — which is
`SELECT * FROM rulings WHERE story_id = ?` with no limit (`repositories/rulings.ts:78-81`) — on
every turn, for the sole purpose of the `recentSimilarUses` computation at `turn.ts:824-831`, where
the result is immediately narrowed by `.slice(-5)` and then filtered. Every ruling in the story is
deserialised through `RulingSchema` so that five records can be inspected: on a 400-turn story that
is a full-table scan and 400 Zod parses per turn. Fixing it standalone means touching the read that
Plan 19's phase split is already moving, then touching it again — so it waits, and lands as part of
the split with a bounded `listRecentByStory(storyId, limit)` (or an actor/action-scoped query, which
is the semantically correct read: today's `.slice(-5)` takes the last five *rulings* and then filters
them, so it can legitimately return 0 when five matching uses exist just outside the window). Two
conditions start it: Phase 2 shipped and green, and the migration ladder still at 16 with 17
unclaimed — which Step 6.1's use of the `settings` table deliberately preserves.

**Plan 20 — Port the v2 memory system** (file 11 §Plan 20; closes M-4, M-9, M-10, M-11; **XL**).
The five modules named in `Plan/v2-memory-system.md` and absent from disk: `memory/facts.ts`,
`embeddings.ts`, `consolidator.ts`, `retrieval.ts`, `drift.ts`, plus a migration for vectors and
facts, all under the plan's own non-negotiable rule — *everything ported is soft state; none of it
can ever write, imply, or reconstruct hard state*. It is deferred for the single clearest reason in
this document: Phase 1 wires up memory that **already exists and the narrator already cannot see**,
in days. Building semantic retrieval over a store the narrator cannot read produces a better index
of an unread book. Plan 20 also inherits an ordering constraint from Phase 1 — Step 1.2 raises M-9
(the FIFO observation cap with no consolidation) from medium to high, because once observations
reach the prompt, silently discarded ones start costing something, so consolidation must sequence
early inside this plan rather than late. Three things must be true before it starts: **all of
Phase 1 shipped and green** (otherwise the premise is wrong), Plan 19 landed so the fact store keys
against the shared actor model instead of a heuristic's private idea of who exists, and the webview
constraint held — embeddings in-process via `transformers.js`, and core still carrying **zero**
`node:` imports on the shared path (Plan 11 §Plan 20 step 3 says "exactly one, `util/uuid.ts`"; that
is stale — `util/uuid.ts:13-15` is `globalThis.crypto.randomUUID()` and
`grep -rn 'from "node:' packages/core/src` returns no import, only that file's explanatory comment.
The constraint is therefore stricter than the plan states, not looser). Drift detection lands last
within the plan: policing consistency is meaningless until the model can see the memory it is meant
to be consistent with.

**Plan 18 — First-run onboarding** (file 11 §Plan 18; closes U-4; **L**). A `FirstRun.tsx` screen
and `CoachMark.tsx` component, a `hasCompletedFirstRun` flag in settings, an `App.tsx` gate, coach
marks on the ruling artifact / action budget / dossier / journal, inline key validation that ends in
a real successful generation, and — the load-bearing piece — a bundled guided premise whose third or
fourth turn is *engineered to be denied*, so every new player sees a denial artifact inside five
minutes. It is deferred because the thing the tour points at is being rebuilt underneath it: Phase 3
changes what a ruling artifact renders (typed loot effects, the `npc` and opposed variants, the
sixth Journal filter chip) and Phase 5 changes what the suggestion chips contain. A tour written
against the pre-Phase-3 UI teaches a UI that will not exist, and re-recording it is most of the cost
of building it. What unblocks it: **Phases 3 and 5 both shipped**, so the four surfaces the coach
marks attach to are final. Expect to iterate regardless — the category's own founders say they redid
their tutorial many times and it is still not right — which is itself an argument for not spending
that iteration budget on a moving target.

**Plan 23 — Art direction and a portrait pipeline** (file 11 §Plan 23; closes U-3, U-13; **XL**).
Codify the visual rules first (limited palette with a near-black anchor, consistent low-sun long
shadows, flat graphic shapes, heavy negative space, silhouette-first characters), then static
character portraits to replace the two-letter initials in the dossier, roster, and party strip, then
a two-or-three-frame idle, then an asset pipeline, and scene plates last. It is deferred because
it is a labour budget rather than a setting — Banner Saga's look was hand-drawn frame-by-frame with
rotoscoped reference, a dedicated lead artist, and an outsourced studio, funded by $723,886 — and
because the cheapest version of it is not an art commission at all: **imported V2/V3 character cards
are PNGs the importer already parses**, which is an art pipeline that costs nothing to fund. What
unblocks it, and it is not a code dependency: an owner decision on whether portraits come from
imported cards, from commissioned art, or from Plan 10B's generator, because all three feed the same
slot and picking two means paying twice. Step 1 alone (the CSS/token-layer rules) is separable and
genuinely cheap, and can be lifted out and done in a week at any time without committing to the rest.

**Plan 10B — User-selectable image-generation provider and model** (file 11 §Plan 10B; **FUTURE /
roadmap**). Provider-agnostic, bring-your-own-key, off-by-default image generation derived from
narration the engine already produces: a user setting on the same pattern as the existing
model-provider configuration, asynchronous so image latency never gates a turn, with per-session
cost caps. It is deferred because the owner classified it that way in their own words — *"That is a
future plan"* — and this document does not schedule against that. It is recorded so the roadmap
reflects real intent, not so it gets built. Note the one property that makes it fit where combat did
not: an image is a *rendering* of a turn, never an input to adjudication, so it stays entirely
outside the hard-state and authority surfaces. What must be true first is a product answer, not a
code change: **the owner's open question — per-scene, per-character-portrait, or per-turn
illustration — has to be decided before this can be planned at all**, because the three have very
different prompt-continuity requirements and very different per-session costs. The continuity half
is also the real design work and it is a memory problem, which means it wants Plan 20's fact store
underneath it; a character described once and re-invented per image is visual drift, and it fails
for exactly the reasons prose drift does.

---



