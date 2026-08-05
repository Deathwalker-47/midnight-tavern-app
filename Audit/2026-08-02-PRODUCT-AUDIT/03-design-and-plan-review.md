# 03 — Design and Plan Review: what the documents say vs what shipped

**Audited at `e1e0d86`.** Every "landed / not landed" verdict below was checked against
source files on disk, not against checkboxes.

> **Revision 2026-08-02 (turn 2) — three corrections from the owner, applied in place.**
>
> 1. **Turn-based combat and Banner Saga-style animation were never planned.** I audited the
>    repo's own docs for provenance and the plan files are clean: **zero** hits for
>    `banner saga`, `turn.based`, `turn order`, `tactics` or `battle system` anywhere outside
>    `Audit/` and `.agents/`. The only `initiative` mentions are **deferrals** written
>    2026-07-23 (`Plan/competitive-adoptions.md:706`, `README.md:277`,
>    `Plan/attribute-integration.md:204`) — they predate this audit and argue *against* building
>    combat depth. No agent inserted a tactics layer. **What §5.1 and §9.4 below scored as a
>    missing "third pillar" was my framing error, not a gap in your plans**; both are corrected
>    below. The file that looks alarming — `2026-08-01-live-combat-remediation.md`, written the
>    day before — contains no grid, initiative, positioning or animation concepts at all
>    (verified by search); it is a bug-fix plan built from five of your own reported symptoms.
> 2. **The real roadmap item is player-selectable image generation** — provider + model chosen
>    in settings, images rendered during the story when enabled. This is a *future* plan and it
>    is **recorded nowhere in the repo**: a search for `image.?gen`, `text.?to.?image`,
>    `stable diffusion`, `sdxl`, `dall`, `imagen` across all `.md`/`.ts`/`.tsx`/`.json` outside
>    `Audit/` returns **zero hits**. It is the one genuinely unplanned pillar-adjacent feature,
>    and §9.4 has been rewritten to say so instead of the combat claim.
> 3. **The archived design handoffs were your deliberate cleanup**, not drift or loss — commit
>    `3566c25` "archived old designs to prevent bloat" (see §6 note).
>
> `Plan/v2-memory-system.md`'s upstream, **Memory-Keeper**, was also audited directly this turn
> (105 passing tests observed). §3 now reflects what that upstream actually delivers.

---

## What this means (read this first)

This project documents itself unusually well — eight planning documents, three design
handoffs, seven generations of HTML prototypes, a 1,572-line worklog. That is a genuine
strength and most teams do not have it.

But documentation this dense creates a specific risk: **the documents start to feel like
the product.** I checked every major plan against the code, and the pattern is consistent:

- Plans that were *executed* were executed **very well** — checkboxes are honest, commits
  are real, tests exist. I found no case of a plan claiming work that did not land.
- The problem is the opposite one: **a large volume of accepted, high-quality design has
  never been started**, and nothing in the repo distinguishes "designed" from "shipped"
  at a glance. A reader of `Design/HANDOFF-V7-DESIGN-INSTRUCTIONS.md` or
  `Plan/v2-memory-system.md` would reasonably assume they describe the app. They describe
  an app that does not exist yet.

The headline number: **of the two largest outstanding plans — the v2 memory system and the
NPC scene redesign — 0% of either has landed.** Both are precisely the plans that address
the two problems this product exists to solve.

---

## 1. Scorecard

| Document | Status on disk | Verdict |
| --- | --- | --- |
| `Plan/high-level-plan.md` | Architecture shipped essentially as written | **Landed** |
| `Plan/low-level-plan.md` (M1–M12) | Engine, store, router, bootstrap all present | **Landed** |
| `Plan/low-level-plan-v2.md` | History/variants/checkpoints present | **Landed** |
| `Design/HANDOFF-V5` | Two story modes, attributes, role matrix — all present | **Landed** |
| `Design/HANDOFF-V6` | Superseded in part by V7 | Partially landed |
| `Design/HANDOFF-V7` | Ruling artifact, budget, 7 slots, journal — mixed | **Partial** |
| `docs/superpowers/plans/2026-08-01-live-combat-remediation.md` | Tasks 1–6 **verified in source** | **Landed** |
| `docs/superpowers/plans/2026-08-02-npc-scene-system-redesign.md` | Tasks 1–10 | **0% landed** |
| `Plan/v2-memory-system.md` | 5 named modules | **0% landed** |
| `Plan/attribute-integration.md` | Attributes present in engine + types | **Landed** |
| `Plan/competitive-adoptions.md` | Reference document | n/a |
| `Plan/next-phase-internal-beta.md` | Beta exit criteria | In progress |

---

## 2. The high-level plan: shipped as designed

`Plan/high-level-plan.md` is a 217-line architectural brief, and the shipped code matches
it closely. Its §3 states the thesis precisely:

> *"The reliable solution is to make the **program**, not any model, the authority over
> mechanical state. The model is reduced to a prose renderer."*
> — `Plan/high-level-plan.md:36`

And §4 principle 3:

> *"Mechanical state (the 'ledger') and narrative state live in **separate stores with
> separate writers**, joined only at render time. This separation is structural, not
> conventional."*
> — `Plan/high-level-plan.md:42`

**Verified shipped.** `engine/ledger.ts:69` is the sole hard-state writer;
`types/softState.ts:128–175` is a `.strict()` closed union with no mechanical operations.
The separation is structural exactly as promised. The eight-step per-turn flow in §9
(`high-level-plan.md:143–150`) matches the implemented pipeline in
`orchestrator/turn.ts:413–554` step for step.

This is the part of the project that is genuinely finished, and it deserves to be said
plainly.

### 2.1 But the plan explicitly deferred the anti-drift goal

This is the single most important thing in this file, and it is easy to miss.

The user's stated goal (a) is *"fight memory drift."* The high-level plan's own §8.2 says:

> *"**First release scope — remembers, does not police.** Memory records and evolves but
> does not yet detect or correct narrative inconsistency. Automated drift detection is
> deferred."*
> — `Plan/high-level-plan.md:108`

And §11 defers semantic recall:

> *"Semantic/vector search... Vector search is deferred."* — `Plan/high-level-plan.md:161`

And §13 puts *"Automated narrative drift detection and correction"* under **Later
releases** (`high-level-plan.md:188`).

**So the product's own founding document scoped the anti-drift feature out of v1.** The
engine solves *mechanical* drift (fabricated skills, invented items, wrong HP) completely
and by design. It never claimed to solve *narrative* drift, and it does not.

This is not dishonesty by the team — it is a clear, documented, defensible v1 cut. But it
means the current build delivers roughly **half** of the user's stated goal (a): the
mechanical half is done, the narrative half was deliberately postponed and the plan that
would deliver it has not started. Any external messaging that claims "solves memory drift"
today is ahead of the code. See file 05.

---

## 3. `Plan/v2-memory-system.md` — the plan that would deliver goal (a), 0% built

This is a strong 241-line plan to port designs from *Memory-Keeper* (a Python/FastAPI
memory service). **Turn-2 note: that upstream has now been audited directly** at
`C:/Users/anuji/Documents/Memory-Keeper/Memory-Keeper` (`main` @ `547c9b6`) and it is real and
substantially complete — `105 passed, 5 skipped in 13.95s` observed, two store backends, 12
route modules, snapshots + rollback, narrator-voice drift tracking. So this plan is porting
from a working system, not from a sketch, and its effort estimates in file 05 have been reduced
accordingly. **But the upstream contains no enforcement either**: drift detection there is an
LLM judge running in a fire-and-forget background task
(`api/pipeline.py:85-87` → `analyzer/drift_detector.py:40`) whose only output is a log row and a
politely-worded correction note injected on the *next* turn
(`api/context_formatter.py:21-34,178-180`). The one design that would make it preventive — a
synchronous gate — is explicitly `Status: **Proposed / not implemented**`
(`docs/design-notes/sync-drift-check.md:3`, verified: zero `sync_drift` hits in the codebase).
**Porting it therefore buys detection and advice, not prevention.** Its own status line is
honest:

> *"**Status:** plan (not yet implemented)."* — `Plan/v2-memory-system.md:3`

Its §1 diagnosis is remarkable, because the team identified the same three gaps I found
independently by reading the code:

> *"v1 memory **remembers** but does three things minimally: it retrieves nothing
> semantically..., it stores narrative facts only as free-text observations (no structure,
> no dedup, no conflict resolution), and it does not **police** consistency (the model can
> drift and nothing notices)."*
> — `Plan/v2-memory-system.md:9`

**The team already knows.** That matters for how you read file 05: I am not telling you
something new about the diagnosis, I am confirming it from source and adding severity,
plus one failure the plan does *not* mention (observations never reach the prompt at all).

The plan's governing rule is also exactly right and shows real architectural discipline:

> *"**Everything ported is soft state. None of it can ever write, imply, or reconstruct
> hard state.**"* — `Plan/v2-memory-system.md:13`

**Verified not landed.** All five named modules are absent from disk:

| Planned module | On disk |
| --- | --- |
| `packages/core/src/memory/facts.ts` | **MISSING** |
| `packages/core/src/memory/embeddings.ts` | **MISSING** |
| `packages/core/src/memory/consolidator.ts` | **MISSING** |
| `packages/core/src/memory/drift.ts` | **MISSING** |
| `packages/core/src/memory/retrieval.ts` | **MISSING** |

A repo-wide search of `packages/core/src` for `transformers.js`, `embedding`, or `cosine`
returns **zero** TypeScript hits. There is no vector storage, no semantic retrieval, and
no drift detector anywhere in the product.

**Severity: critical to the product thesis.** This is the plan that turns "we store
memory" into "we beat memory drift."

---

## 4. `2026-08-02-npc-scene-system-redesign.md` — the plan that would deliver goal (b), 0% built

The most important document in the repository. It is a read-only forensic diagnosis of a
real save (`Cyraeth Adventure`), and it names the root cause with unusual precision:

> *"registrar, regex promotion, classifier, reaction heuristic, NPC planner, narrator,
> analyzer, and suggestion tokenizer do not share one actor/scene/event model."*

It documents, in the project's own words, exactly the failures the user is asking about:
actors appearing in prose with no registry row; absent actors that cannot return; an NPC
punching the player because *every* `opposed` action was treated as provocation; the same
punch replaying as a fresh attack because the planner re-read prose instead of consuming
events; 10 Health lost with no narrated cause; and the engine appending `"X succeeds.
Hint."` to story prose on narrator timeout.

**Verified not landed — every primary file is absent:**

| Plan artifact | On disk |
| --- | --- |
| `packages/core/src/types/scene.ts` | **MISSING** |
| `packages/core/src/orchestrator/sceneReconciler.ts` | **MISSING** |
| `packages/core/src/orchestrator/narrativeBeatPlan.ts` | **MISSING** |
| `packages/core/src/orchestrator/npcCapabilityProvisioner.ts` | **MISSING** |
| `packages/core/src/store/repositories/characterAliases.ts` | **MISSING** |
| `orchestrator/turn/` (phase split) | **MISSING** — `turn.ts` still monolithic at 1,528 lines |
| Migration 17 (aliases) | **MISSING** — ladder stops at 16 (`store/db.ts:82–618`) |

`b57d7d6` is literally titled *"docs: design authoritative NPC scene system"* — the plan
landed as a document and nothing else. Everything before it (`c6abef6`, `32a7ac2`,
`bd4f99d`) was point-patching the *old* heuristics, which is exactly what the plan says
must stop.

`CONTEXT.md` is telling the truth when it says invariants 6–10 are not satisfied.
**Severity: critical.** See file 06.

---

## 5. `2026-08-01-live-combat-remediation.md` — 100% landed, and verified

Credit where it is due. This plan has all six tasks checked, and **I verified the claims
in source rather than trusting the boxes:**

| Claim | Verification |
| --- | --- |
| Task 1: universal `attack_natural` family exists, no skill/item requirement | **CONFIRMED** — `config/universal-actions.json:6` defines `attack_natural` with `defaultTargetDamage {success: 4, crit_success: 8}` and no `requiresSkill` |
| Task 1: canonical action synthesized when absent | **CONFIRMED** — `config/registry.ts:307–319` appends `universal_natural_attack` when no natural-family action exists |
| Task 3: universal registry v4 | **CONFIRMED** — `config/universal-actions.json:2` reads `"version": 4`; 31 families defined |

The progress log is unusually good practice — each entry records the RED failure observed,
what changed, the exact test count, and the next step. Task 1 even records a **wrong
hypothesis that was found and discarded** (`live-combat-remediation.md:30–34`), warning
future agents not to chase it. That is exemplary engineering hygiene.

### 5.1 It is not a combat system, and it was never meant to be

This plan made same-turn retaliation work. It did **not** build a combat system. Verified
by search across `packages/core/src` for `initiative|turnOrder|statusEffect|positioning`:
**two hits, neither real** — a local variable named `review` in `authorityGuard.ts`, and
one string in `universal-actions.json`.

There is no initiative order, no turn queue, no status effects, no positioning, no ranges,
no cover, and no action economy beyond the player's 1–5 budget. Combat today is:
classify → single d20 vs DC → apply damage → NPC may answer with one natural attack.

> **Revision (turn 2): the "stated pillar" sentence that stood here is withdrawn.** Turn 1
> treated turn-based combat plus Banner Saga animation as a product pillar and scored its
> absence as a hole. Owner clarification 2: it was **never planned**. The code observation
> above is unchanged and now reads as scope discipline: the repo deferred a combat subsystem
> deliberately and said so three times, in July, before this audit existed
> (`Plan/competitive-adoptions.md:706`, `README.md:277`, `Plan/attribute-integration.md:204`).
> The `README.md:277` "Later" line is a roadmap parking space for an optional feature, not an
> unmet commitment. This plan fixing same-turn retaliation is also **not** creeping toward
> tactics: it makes a present creature able to respond at all, which matches Isekai Zero's own
> baked-in rule that *"NPCs always fight back — they don't just stand there."* Withdrawn in
> file 07 as W-2; the direct recommendation on adopting a Banner Saga battle system is in
> file 10 §9.

---

## 6. Design handoffs V5 → V6 → V7: direction of travel

> **Revision (turn 2): the older handoff generations are archived, by the owner, on purpose.**
> Commit `3566c25` "archived old designs to prevent bloat" removed the V2-V4 handoff trees and
> replaced them with `Design/handoff-archive.rar` (1,217,948 bytes). V5, V6, V7 and
> `handoff-v7/` all remain on disk, so every document cited in this section is still readable.
> Nothing was lost and no cleanup action is needed here — see file 02 for the resolved
> map-hazard note.

Three generations of design instruction, each superseding parts of the last. Reading them
in order shows a clear and sensible direction: **from "does the engine work" toward "can
the player see that the engine worked."**

- **V5** (579 lines) settled the structural questions: exactly two story modes (`none` /
  `full`, with legacy `light` migrated not silently reinterpreted), attribute scores
  clamped 1–30, and a model-role matrix specifying which of the six roles is active per
  mode. **This landed** — the V5 audit confirms it and the code matches.
- **V6** (546 lines) — largely superseded; `HANDOFF-V7:46–96` enumerates exactly which V6
  decisions V7 overrides (attribute scale, universal actions, progression math, model
  recommendations). Clean supersession discipline.
- **V7** (639 lines) is the current target and is almost entirely about **making mechanics
  legible**: the DM Ruling artifact rendered above the prose (§5), player action budget
  1–5 default 2 (§3), contextual suggestions (§5), a seven-slot universal loadout (§7),
  five item tiers and loot from rulings (§8), a full character profile (§9), and a
  **Mechanical Journal** (§11).

**V7 is a design document with no accompanying implementation plan.** Unlike the combat
and NPC work, there is no `docs/superpowers/plans/*-v7-*.md` breaking it into tasks with
files and tests. Parts of it exist in code (`components/RulingArtifact.tsx` at 426 lines,
`orchestrator/journal.ts` at 292, `engine/actionBudget.ts` at 36, `engine/equipment.ts` at
404 with 7 slots, `orchestrator/loot.ts` at 195), so it is being implemented
opportunistically rather than systematically. File 08 covers what actually reaches the
screen.

---

## 7. A designed behaviour that undermines the thesis: No Stats mode

Not a bug — a documented decision with a consequence I do not think was intended.

`Audit/V5_IMPLEMENTATION_STATUS_2026-07-23.md` specifies the model-role matrix:

| Mode | Narrator | Bootstrapper | Mechanics | Classifier | **Analyzer** | **Summarizer** |
| --- | --- | --- | --- | --- | --- | --- |
| **No Stats** | Active | Silent | Silent | Silent | **Silent** | **Silent** |
| Full Stats | Active | Active | Active | Active | Active | Active |

*"No Stats (`none`) | Pure prose. Only the narrator model is active. There are no
attributes, skills, actions, checks, rulings, mastery gains, or mechanical background-model
calls."*

The analyzer and summarizer being silent in No Stats mode means **No Stats stories
accumulate no memory whatsoever** — no observations, no relationship tracking, no chapter
summaries, no arc.

This is confirmed at the assembler: `orchestrator/context.ts:498–500` returns
`{ softSlices: [], chapters: [], arc: undefined }` unless `statMode === "full"`, and raw
history is hard-capped at 8 messages (`context.ts:503`).

**Why this matters commercially:** No Stats is the mode a SillyTavern user will try first,
because it is the mode that looks like what they already use. In that mode Midnight Tavern
is **strictly worse at memory than SillyTavern**, which at least has summarization
extensions. The product's best argument is invisible in the doorway most new users walk
through. **Severity: high.** See files 05 and 08.

---

## 8. Where the prior audits are now stale

Both prior audits were accurate when written. This report supersedes them here:

### `Audit/PROJECT_STATUS_AUDIT.md` (22 July 2026)

| Prior claim | Status now |
| --- | --- |
| *"393 tests: 311 core and 82 UI"* | **Stale.** Now **792** (632 core / 160 UI), all green |
| *"knowledge graph contains 2,449 nodes and 5,765 relationships"* | **Stale.** Now 6,749 nodes / 17,808 edges |
| *"136 TypeScript/TSX files"* | **Stale.** Now 256 TS + 129 HTML |
| *"a user still cannot confirm an imported card into a playable story"* | **Superseded** — importer path exists; see file 08 for the current UX gap |
| *"Installer bundle: environment-blocked (WiX/TLS)"* | **Superseded** — NSIS and MSI bundles were produced and hashed per the combat plan's log |
| *"Overall condition: Advanced alpha"* | Still fair, but the *reason* has moved: the blockers are no longer data integrity, they are narrative-layer capability |

### `Audit/V5_IMPLEMENTATION_STATUS_2026-07-23.md` (23 July 2026)

| Prior claim | Status now |
| --- | --- |
| *"V5 design has been implemented across core, bridge, shell, UI"* | **Still true** |
| *"late alpha / internal beta-candidate"* | Still fair |
| *"remaining work is primarily packaged-app acceptance testing..."* | **Now materially understated.** Since 23 July the team has found and documented two *architectural* gaps (NPC scene model, v2 memory) that are not release-validation risks — they are unbuilt subsystems |

**The most important correction to both:** they characterise the remaining work as
*release engineering* (signing, installers, acceptance passes). As of `e1e0d86` the
critical path is no longer release engineering. It is two unbuilt subsystems that the
product's core promise depends on.

### The README is stale too

`README.md` claims *"393 tests (311 core, 82 UI)"* — off by roughly 2×. It also describes
the build as *"Advanced alpha... core loop works end to end,"* which is true but does not
mention that narrative memory does not reach the narrator (file 05) or that NPC scene
identity is unmodelled (file 06).

---

## 9. What this review concludes

1. **Execution quality is high.** Where a plan was worked, it was worked properly: honest
   checkboxes, real commits, RED→GREEN evidence, discarded-hypothesis notes. I found no
   plan that overclaimed.
2. **Planning volume has outrun execution capacity.** Two critical plans and one full
   design generation (V7) are outstanding simultaneously. That is more open design than a
   small team can land, and it creates a persistent doc-vs-reality gap.
3. **The two unbuilt plans are the two that deliver the user's stated goals.** This is the
   central finding of the whole audit. The engine half of the thesis is finished; the
   narrative half is designed and unstarted.
4. ~~**The third pillar — turn-based combat with Banner Saga feel — has no plan at all.**~~
   **Withdrawn (turn 2): there is no third combat pillar.** Turn-based combat and Banner Saga
   animation were never planned; their absence is scope discipline, and the repo's own July
   deferral lines prove the decision predates this audit. See §5.1 and file 07 W-2.
   **What replaces it is a real documentation gap:** the owner's actual roadmap item is
   **player-selectable image generation** — user picks provider and model in settings, images
   are generated during the story when enabled — and that feature appears **nowhere in the
   repo**. Zero hits for `image.?gen`, `text.?to.?image`, `stable diffusion`, `sdxl`, `dall` or
   `imagen` across all `.md`/`.ts`/`.tsx`/`.json` outside `Audit/`. It has no design note, no
   plan slice, no settings surface, and no place in the provider abstraction that already
   exists for text models. As a future plan that is fine — but it should be written down before
   it is designed twice or forgotten. See file 11 for the roadmap slice.
5. **Nothing in the repo marks a document as aspirational.** A `Status:` header on every
   plan and design (as `v2-memory-system.md:3` already does correctly) would prevent a
   reader — or an AI agent — from mistaking a design for the product. Cheap fix, real
   value. See file 11, plan #12.

---

*Next: [04 — Competitive research](04-competitive-research.md)*
