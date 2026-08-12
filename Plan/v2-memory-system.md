> **DECOMMISSIONED 2026-08-12 - reference only, not a task list.**
> Every plan written before 2026-08-12 is retired by owner decision; anything here that had not
> already shipped by that date is **cancelled**, not deferred. Do not resume or cite this document
> as a reason to do work. See [`docs/PLAN-POLICY.md`](../docs/PLAN-POLICY.md).
> Behaviour this plan already produced is unaffected and stays defended by the test suite.

# v2 Memory System — Porting Memory-Keeper into Midnight Tavern

**Status:** plan (not yet implemented). **Prerequisite:** shipped v1 memory (analyzer + soft store + chapter/arc summaries).
**Companion source of designs:** [Memory-Keeper](https://github.com/Deathwalker-47/Memory-Keeper) — a standalone Python/FastAPI memory service. We are porting its *designs*, not its process.

---

## 1. Why, and the one rule that governs everything

v1 memory **remembers** but does three things minimally: it retrieves nothing semantically (recall is "latest arc + recent chapters + present-character slices"), it stores narrative facts only as free-text observations (no structure, no dedup, no conflict resolution), and it does not **police** consistency (the model can drift and nothing notices). Memory-Keeper solved all three, in production-shaped code: local embeddings + semantic search, a structured **Fact** store with a **consolidator** (redundancy/conflict/supersession), and **drift detection** for both characters and the narrator, with graded correction notes.

Those are exactly our gaps. But Memory-Keeper was built for a different architecture, and porting it naively would breach our core invariant. **The rule that governs this entire port:**

> **Everything ported is soft state. None of it can ever write, imply, or reconstruct hard state.**

Memory-Keeper's fact extractor pulls "facts" from prose. In our world, a mechanical fact ("has a legendary sword", "HP is 40", "learned Lockpicking") is owned by the engine ledger and may **only** originate from a committed ruling — never from prose extraction. If we let a prose-derived fact store carry mechanical claims, we would reintroduce exactly the hallucinated-state laundering the whole product exists to prevent. So the ported Fact store is **narrative-only**, and it is filtered at the schema level to make mechanical facts unrepresentable. This is the non-negotiable design center of the port; every section below serves it.

Two more framing decisions, both already settled for this project and reaffirmed here:

- **No separate service, no HTTP seam.** Memory-Keeper is a FastAPI server; we fold its ideas into `packages/core` TypeScript modules. We port the algorithms and data shapes, not the process boundary. (An internal HTTP seam was explicitly rejected for this product.)
- **Embeddings run locally, in-process, offline.** Memory-Keeper uses `sentence-transformers/all-MiniLM-L6-v2`. We use the same model family via **`transformers.js`** so it runs inside the app with no network and no Python. Vectors are stored in SQLite (v1 deferred vector storage precisely so v2 could add it here).

---

## 2. What Memory-Keeper has, and the disposition of each part

A frank inventory (from its `memory_keeper/analyzer/` and `store/models.py`), with the decision for each:

| Memory-Keeper capability | Our disposition |
|---|---|
| `embeddings.py` — MiniLM local embeddings + cosine similarity | **Port** → `memory/embeddings.ts` (transformers.js), vectors in SQLite. |
| Semantic search over stored memory | **Port** → a retrieval step feeding context assembly. |
| `fact_extractor.py` — subject-predicate-object facts w/ category + confidence | **Port, narrative-only** → `memory/facts.ts`; mechanical categories forbidden by schema. |
| `state_consolidator.py` — redundancy / conflict / supersession | **Port** → `memory/consolidator.ts`, operating on narrative facts only. |
| `relationship_extractor.py` + `RelationshipDynamic` | **Merge** into our existing analyzer relationship ops (already soft state); adopt its richer fields. |
| `arc_extractor.py` + `NarrativeArc` | **Already have it** (`summarizer/arc.ts`). Adopt any missing arc fields; do not duplicate. |
| `character_analyzer.py` — identify + tier characters | **Already have it** (analyzer auto-creates soft profiles with tiers). Keep ours. |
| `narrator_analyzer.py` / `NarratorState` | **Map** onto our `WorldSoftState`; adopt useful fields. |
| `drift_detector.py` (character) + `narrator_drift_detector.py` | **Port** → `memory/drift.ts`; policing is a *v2* addition (v1 was "remember, don't police"). |
| `context_formatter.py` — graded correction notes (gentle/moderate/firm) | **Port** → drift notes injected in the narrator **STYLE** slot, subordinate to the authority clause. |
| Snapshots + rollback (`MemorySnapshot`, snapshot routes) | **Already have it, better** — our `turn_checkpoints` + delete/rewind are per-turn and atomic. Do **not** port; reuse. |
| FastAPI routes, SillyTavern adapter, `setExtensionPrompt` injection | **Discard.** We own the context assembler; a side-channel that models ignore is irrelevant to us. |

The net new modules are therefore small: embeddings, a narrative-fact store, a consolidator, and drift detection — plus wiring into the existing analyzer, context assembler, and one migration.

---

## 3. Architecture of the ported system

```
                       (existing v1, unchanged in shape)
 narrator prose ──► analyzer ──► SoftStatePatch ──► softStore  (mood, relationships, observations)
                                                        │
        v2 additions ───────────────────────────────────┼───────────────────────────────
                                                        ▼
                              memory/facts.ts   extract narrative facts (SPO + category + confidence)
                                                        │            NARRATIVE ONLY — mechanical categories rejected
                                                        ▼
                              memory/embeddings.ts  embed each fact + each chapter/arc + each observation
                                                        │            (transformers.js, local; vectors → SQLite)
                                                        ▼
                              memory/consolidator.ts  periodically dedup / resolve conflicts / mark superseded
                                                        │
   player turn ─► context assembler ◄────── memory/retrieval.ts  semantic top-K over facts+summaries+observations
                        │                                            filtered to present characters + query = latest turn
                        ▼
                  narrator prompt: … memory block (now semantic) … [drift correction note, STYLE slot] … [AUTHORITY CLAUSE — last]
                                                        ▲
                              memory/drift.ts  compare new prose vs established soft profile / world → graded note
```

Every arrow above moves **soft** data. The hard-state ledger, the resolver, and the frozen schema are untouched by this entire subsystem. That is the whole point.

---

## 4. Data model additions (`packages/core/src/types/`)

All new types are soft state and live behind Zod schemas that **structurally forbid mechanical content**.

```ts
// The narrative fact — ported from Memory-Keeper's Fact, minus anything mechanical.
export type NarrativeFactCategory =
  | "personality" | "backstory" | "preference" | "relationship_note"
  | "world_detail" | "location" | "event" | "belief" | "secret";
//  NOTE: there is deliberately NO "possession", "stat", "skill", "resource", or "ability" category.
//  Mechanical truth is the ledger's, not a prose-derived fact's.

export interface NarrativeFact {
  id: string;
  storyId: string;
  subjectCharacterId?: string;      // who/what the fact is about (optional for world facts)
  category: NarrativeFactCategory;  // Zod enum above — mechanical categories are unrepresentable
  statement: string;                // "distrusts the Baron", "grew up on the salt coast"
  confidence: number;               // 0–1, from the extractor
  firstSeenTurn: number;
  lastSeenTurn: number;
  supersededBy?: string;            // set by the consolidator when a newer fact overrides this
  status: "active" | "superseded" | "conflicted";
}

export interface MemoryEmbedding {
  id: string;
  storyId: string;
  refKind: "fact" | "chapter" | "arc" | "observation";
  refId: string;                    // id of the fact/chapter/arc/observation embedded
  vector: Float32Array;             // stored as BLOB
  model: string;                    // embedding model id, for migration safety
}

export interface DriftFinding {
  id: string;
  storyId: string;
  turnIndex: number;
  scope: "character" | "narrator";
  subjectCharacterId?: string;
  severity: "gentle" | "moderate" | "firm";
  items: string[];                  // the specific inconsistencies
  acknowledged: boolean;
}
```

**The guardrail is the `NarrativeFactCategory` enum.** Because "possession/stat/skill/resource/ability" are not category values, a fact asserting the player owns a sword or has 40 HP cannot be represented, and Zod rejects any extractor output that tries. A test must assert this directly: feed the extractor prose that clearly implies a mechanical grant and prove no mechanical fact is produced (the grant, if real, came from a ruling and is already in the ledger; if hallucinated, it dies here).

---

## 5. Database additions (one migration)

`store/migrations/00X_memory_v2.sql` (embedded in `MIGRATIONS[]` like the others):

```sql
CREATE TABLE narrative_facts(
  id TEXT PRIMARY KEY, story_id TEXT NOT NULL,
  subject_character_id TEXT, category TEXT NOT NULL, statement TEXT NOT NULL,
  confidence REAL NOT NULL, first_seen_turn INTEGER, last_seen_turn INTEGER,
  superseded_by TEXT, status TEXT NOT NULL);
CREATE INDEX idx_facts_story_subject ON narrative_facts(story_id, subject_character_id);
CREATE INDEX idx_facts_story_status  ON narrative_facts(story_id, status);

CREATE TABLE memory_embeddings(
  id TEXT PRIMARY KEY, story_id TEXT NOT NULL,
  ref_kind TEXT NOT NULL, ref_id TEXT NOT NULL,
  vector BLOB NOT NULL, model TEXT NOT NULL);
CREATE INDEX idx_emb_story_kind ON memory_embeddings(story_id, ref_kind);

CREATE TABLE drift_findings(
  id TEXT PRIMARY KEY, story_id TEXT NOT NULL, turn_index INTEGER NOT NULL,
  scope TEXT NOT NULL, subject_character_id TEXT, severity TEXT NOT NULL,
  items_json TEXT NOT NULL, acknowledged INTEGER NOT NULL DEFAULT 0);
```

New typed repositories: `narrativeFacts.ts`, `memoryEmbeddings.ts`, `driftFindings.ts` (all SQL stays in `store/repositories/`, per the project rule).

**Vector search in SQLite:** v1's scale (a single player's one story) is small enough that a **brute-force cosine scan over the story's embeddings is fine** — load the story's vectors, score, take top-K. No ANN index needed for v1-of-v2. If a story's embedding count ever grows large enough to matter, add `sqlite-vec` as a drop-in later; the repository boundary makes that swap local. Do not prematurely add an ANN dependency.

---

## 6. New core modules

### 6.1 `memory/embeddings.ts`
- `embed(texts: string[]): Promise<Float32Array[]>` via transformers.js with `all-MiniLM-L6-v2` (or the current small MiniLM); lazy-load the model once (singleton), mirroring Memory-Keeper's lazy loader.
- `cosine(a, b): number`.
- Bundle the model with the app; **never fetch at runtime** (offline-first). Record the model id on every stored vector so a future model change is a detectable migration, not silent corruption.

### 6.2 `memory/facts.ts`
- `extractFacts(exchange, presentCharacters): Promise<NarrativeFact[]>` — a `callStructured` analyzer-role call returning facts against the Zod schema (mechanical categories impossible). Port Memory-Keeper's SPO+confidence prompt, restated for narrative-only output with an explicit prohibition ("never state possessions, stats, skills, health, or abilities — those are tracked by the game engine, not by you").
- Runs in the same async, post-turn, off-critical-path slot as the existing analyzer — memory extraction never blocks the player.
- Newly extracted facts are embedded (6.1) and stored; a fact matching an existing one (high cosine + same subject) bumps `lastSeenTurn` instead of duplicating.

### 6.3 `memory/consolidator.ts`
- Port `state_consolidator`: periodically (e.g. at each chapter boundary, reusing the summarizer's cadence) analyze a subject's active facts for **redundant groups**, **conflicts**, and **superseded** facts, then apply: merge redundant, mark older-of-conflict `conflicted`, set `supersededBy`/`status="superseded"` on outdated facts.
- Operates on **narrative facts only**. It has no concept of and no access to hard state. There is nothing mechanical for it to conflict over — which is exactly why it's safe.
- Conflicts are surfaced to the player in the dossier ("the story has said contradictory things about X"), not silently resolved by guessing.

### 6.4 `memory/retrieval.ts`
- `retrieve(storyId, queryText, presentCharacterIds, k): RetrievedMemory[]` — embed the query (the latest turn), brute-force cosine over the story's `fact|chapter|arc|observation` vectors, bias toward present characters and recency, return top-K with provenance.
- This **augments** the existing injector, it does not replace it: the never-dropped items (system frame, this turn's rulings, hard-state snapshot) are unchanged; the *memory block* (previously "latest arc + recent chapters + present slices") becomes "latest arc + **semantically retrieved** facts/summaries/observations relevant to the current moment", still under the same token budget and drop-priority rules in the context assembler.

### 6.5 `memory/drift.ts`
- Port both `drift_detector` (character) and `narrator_drift_detector`. After a narrator reply, compare it against the subject's established soft profile (traits, known narrative facts, prior behavior) and the world profile; produce a `DriftFinding` with severity and specific items, or nothing.
- Runs async, post-turn, off the critical path. A finding does **not** block, rewrite, or re-roll anything.
- **This is the v1→v2 policy change**, stated plainly: v1 deliberately "remembers but does not police". v2 adds policing — but policing here means *nudging the next narration*, never touching mechanics or the current message.

### 6.6 Correction notes — the placement guardrail
Port `context_formatter`'s graded notes (gentle/moderate/firm), but the placement is ours and it is strict: a drift correction note is inserted into the narrator prompt's **STYLE slot**, in the same region as a user-authored system prompt, and therefore **before and subordinate to the framework authority clause, which remains last**. A drift note can ask the narrator to keep a character consistent; it can never license the narrator to alter a decided outcome. Add this to the existing "authority clause is last" test: with a drift note present, the authority clause is still the final element.

---

## 7. Pipeline changes (small and contained)

The per-turn pipeline (`orchestrator/turn.ts` + `context.ts`) changes in exactly two places, both already-async or already-assembly:

1. **Context assembly** calls `retrieval.ts` to build the memory block, and appends any current `DriftFinding` correction note into the STYLE slot. Never-dropped items and budget rules are unchanged.
2. **The post-turn async block** gains three fire-and-forget steps alongside the existing analyzer/summarizer: extract+embed facts, run drift detection, and (on chapter cadence) run consolidation.

Nothing on the **critical path** (classify → resolve → assemble → narrate → commit) changes timing except the retrieval read, which is a local vector scan. The ledger transaction is untouched.

## 8. Interaction with history integrity (must not regress)

v2 memory rows are per-story soft data and must participate in delete/rewind exactly as summaries do:

- **Rewind-to-here / delete-last** must delete `narrative_facts`, `memory_embeddings`, and `drift_findings` whose originating turn is at or after the truncation point (mirroring how chapters/arcs are invalidated), in the same atomic operation.
- Facts whose `firstSeenTurn` is before the cut but `lastSeenTurn` is after it should have `lastSeenTurn` rolled back rather than be deleted — or, simplest and safe, be re-derivable on the next turns. Prefer the conservative choice: never leave a fact or vector that references a truncated turn.
- Because vectors are derived data, an acceptable v1-of-v2 simplification is to **drop and lazily rebuild** a story's embeddings after a rewind rather than surgically prune — correctness over cleverness.

Add these to the existing history-integrity test suite; an orphaned fact or vector after a rewind is a correctness bug in the subsystem whose entire job is trustworthy memory.

## 9. UI touchpoints (small)

- **Character Dossier** gains a "What the story knows" section: active narrative facts grouped by category, with conflicts flagged. Read-only; still the soft/system separation.
- **Drift** surfaces quietly — an optional, dismissible indicator when a firm finding exists — never a modal, never mid-scene. Policing should feel like a considerate editor, not an alarm.
- No change to the mechanical journal: drift and facts are **narrative**, so they do not appear there. The journal stays hard-state-only. Keeping these two records separate is itself a feature — one is verifiable truth, the other is evolving interpretation.

## 10. Build order

1. **Embeddings** (`embeddings.ts`, bundled model, repository) + the migration. Prove local, offline embedding + cosine with a test.
2. **Narrative facts** (`facts.ts`, extraction, dedup-on-embed, repository) — with the mechanical-category-rejection test as the gate. This test is the port's most important single check.
3. **Retrieval** (`retrieval.ts`) wired into context assembly, behind the existing budget/priority rules.
4. **Consolidator** (`consolidator.ts`) on the chapter cadence.
5. **Drift** (`drift.ts` + graded notes) in the STYLE slot, with the reinforced authority-last test.
6. **History-integrity wiring** (delete/rewind cleanup) + tests.
7. **UI**: dossier "what the story knows" + the quiet drift indicator.

Each step ends green (build + typecheck + tests) before the next, matching the project's phase discipline.

## 11. Guardrails restated (the checklist for this subsystem)

1. **Everything here is soft state.** No module in this subsystem can write hard state; none has access to the ledger.
2. **Mechanical facts are unrepresentable.** The category enum forbids them; a test proves prose implying a grant produces no mechanical fact.
3. **Embeddings are local and offline.** Bundled model, no runtime fetch, model id stored per vector.
4. **Drift never blocks, rewrites, or re-rolls.** It produces a note for the *next* narration only.
5. **Correction notes are subordinate to the authority clause**, which remains last in the narrator frame.
6. **Delete/rewind leaves no orphan facts or vectors.** Prefer drop-and-rebuild over surgical pruning.
7. **The mechanical journal stays hard-state-only.** Narrative facts and drift live in the dossier, not the journal.
8. **No separate service, no HTTP seam, no Python.** Designs are ported into `packages/core` TypeScript modules; the process boundary is not.

## 12. What we deliberately do *not* port

- Memory-Keeper's **FastAPI server, routes, and SillyTavern `setExtensionPrompt` adapter** — we own the context assembler; a side-channel models ignore is pointless here.
- Its **snapshot/rollback tables** — our per-turn `turn_checkpoints` + atomic delete/rewind already do this, and do it better (per-turn and transactional rather than manual session snapshots).
- Its **fact model's mechanical latitude** — we keep the structure and drop the ability to assert anything the engine owns.
- Any **ANN/vector-index dependency** — brute-force cosine is sufficient at v1-of-v2 scale; revisit only if a real story's embedding count demands it.
