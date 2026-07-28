# Architecture

This document explains how Midnight Tavern is built and, more importantly, *why*. It is the reference a new engineer should read after the [README](README.md) to understand the data model, the per-turn pipeline, the prompt contracts, and the invariants that everything else protects.

The authoritative behavioral specifications live in [`Plan/`](Plan/); this document is the navigable summary of them as realized in code.

---

## 1. The thesis

AI roleplay tools fail at *mechanics* because they delegate mechanics to the model. The model is asked to decide whether an attack lands, how much damage it deals, whether a locked door opens — and language models are systematically bad at this. They grant unearned rewards, forget prior state, and rewrite outcomes to please the player. The result is a game with no stakes: nothing the player does can truly fail, because the narrator can always decide it succeeded.

Midnight Tavern's answer is to make **mechanics a property of the program, not the prompt.** The model never decides an outcome; it narrates outcomes the engine already decided. This single choice drives every architectural decision below.

## 2. The hard/soft wall

The central invariant. State is split in two, with a different sole writer for each half:

| | **Hard state** | **Soft state** |
|---|---|---|
| Contents | attributes, resources, skills+ranks, inventory, flags, alive/dead | identity, personality, mood, relationships, observations, locations, threads |
| Sole writer | **the engine ledger** | **the analyzer model** |
| Written from | deterministic resolution of catalog actions | narrative prose, via typed patch operations |
| Can a model write it? | **Never** | Yes — but only non-mechanical fields (enforced by schema) |
| Storage | `characters.hard_json`, runtime item rows | `characters.soft_json`, `world_soft` |

The two are joined only at render time (living cards, dossiers, context assembly). Because prose is not a code path that can reach the ledger, a hallucinated grant in the narrator's text is inert: it was never asked to produce mechanical truth, and the engine had already produced it before the narrator wrote.

This is the property to protect in every change. Any new feature that touches state must declare which side of the wall it is on and respect the corresponding writer.

## 3. Workspaces and dependency direction

```
packages/ui      React desktop UI. Presentation only. Never imports engine internals.
   │  (calls)
   ▼
CoreBridge       A single typed façade. Two implementations:
   │              - an in-memory backend (fast, for the browser dev server and tests)
   │              - a Tauri/SQLite backend (the real desktop app)
   ▼
packages/core    All non-UI logic. Never imports from ui.
   │
   ▼
packages/shell   Tauri host (Rust). IPC + the SQLite driver that core's store talks to.
```

Rules enforced by convention and review:

- **`core` never imports `ui`.** One direction only.
- **Every CoreBridge method is implemented in *both* backends.** A feature that exists only in the memory backend will pass tests and fail in the packaged app; the audit calls this out as a recurring risk, so parity is a review gate.
- **`core`'s store path stays webview-portable** — no `node:` built-ins on the path that runs inside the Tauri webview, so the same code runs under both drivers.

## 4. Data model (the frozen schema)

When a story is created, a **StorySchema** is generated and then **frozen** (`locked = true`). The engine refuses to operate on an unlocked schema. The schema is the rulebook, and it does not change during play. Its principal parts:

- **AttributeDef[]** — the story's attributes (e.g. STR/DEX/… — *generated per story*, not a fixed six). Each has a score and a description; a single centralized function derives the modifier from the score.
- **ResourceDef[]** — HP, stamina, mana, etc.; one is marked lethal (reaching 0 = death).
- **SkillDef[]** — learnable skills with prerequisites, unlock paths, and a deterministic mastery-advance rule.
- **ItemDef[]** — items with kinds (weapon/armor/consumable/…) and numeric props.
- **ActionDef[] (the Action Catalog)** — the heart of the gate. Every action carries: an optional required skill and mastery rank, an optional required item kind, an optional governing attribute, a **pre-assigned DC**, an optional opposed flag, optional attempt costs, optional advantage/disadvantage conditions, and a full **outcome table** mapping `crit_success | success | failure | crit_failure` to deterministic effects.
- **NpcTemplate[]**, **StartingState**, and the `statMode` (`none | light | full`).

Two consequences worth internalizing:

1. **The classifier's action id is a Zod enum built from *this story's* catalog.** The classifier physically cannot emit an action that does not exist in the frozen schema.
2. **Difficulty is data, not judgment.** DCs are assigned once, by the bootstrapper, and validated to sit in a fixed band. No runtime model input sets difficulty.

Hard state (`CharacterHardState`) mirrors the schema's mechanical shape per character; soft state (`CharacterSoftState`, `WorldSoftState`) holds everything narrative and is forbidden mechanical fields at the type level.

## 5. The engine (`packages/core/src/engine/`)

Pure, deterministic, and the most heavily tested code in the repo. Built and proven before any model-facing code.

- **`dice.ts`** — d20 primitive with injectable RNG (seeded in tests); advantage/disadvantage roll two dice and keep the higher/lower, with crit determined by the *used* die only.
- **`gate.ts`** — `checkGate(schema, actor, intent)`: verifies the action exists, the actor is alive, required skill is learned, mastery rank is met, required item kind is held, costs are affordable, and all conditions hold — returning the first failure reason. Pure, no I/O.
- **`rollMode.ts`** — derives advantage/disadvantage from *frozen schema conditions* evaluated against current hard state (never from a model). Both-present cancels to normal; sources are recorded for display.
- **`resolver.ts`** — the resolution pipeline for one action: gate → pay attempt costs → compute modifier terms (attribute + mastery) → roll → outcome (nat 20/1 override; else total vs effective DC) → assemble a `Ruling`. Opposed actions roll both sides. Nothing is committed here.
- **`ledger.ts`** — the **only** writer of hard state. Applies outcome effects with clamping (0..max), inventory changes, flag sets, difficulty damage scaling, mastery success-count advancement, and death. 
- **`attributes.ts`, `difficulty.ts`, `conditions.ts`, `progression.ts`, `unlock.ts`, `equipment.ts`** — the supporting deterministic systems (score→modifier derivation, the transparent difficulty adjustment, condition evaluation shared with the gate, mastery rank-ups, skill unlocking, and equipment effects).

Everything here is a pure function of `(schema, hard state, intent, rng)`. That purity is what makes 100% branch coverage achievable and what makes the integrity claim testable rather than rhetorical.

## 6. Models and the router (`packages/core/src/router/`)

Five roles, each independently assignable to any provider/model with its own sampler profile:

| Role | Job | Sampler disposition |
|---|---|---|
| **Narrator** | writes the next story beat | warm (creative) |
| **Classifier** | free text → catalog actions | cold (deterministic) |
| **Analyzer** | prose → soft-state patch | cold |
| **Summarizer** | messages → chapters/arcs | mid |
| **Story AI** | premise → frozen schema (bootstrap) | mid |

- **`providers/openaiCompat.ts` + `registry.ts`** — a single OpenAI-compatible adapter serves the provider set; each provider is a profile over that adapter.
- **`modelCatalog.ts` + `recommend.ts`** — a curated catalog tags models with the roles they suit and their tier, and supplies recommended defaults; the dropdowns are role-aware, and free-text model ids are always allowed (marked "advanced").
- **`samplers.ts`** — the full sampler surface with per-role default profiles (e.g. classifier at temperature 0, narrator warm) exposed as named presets.
- **`structured.ts`** — `callStructured<T>(role, prompt, zodSchema)`: requests JSON, parses, Zod-validates, and on failure re-prompts with the exact validation error, up to a repair limit, before surfacing an honest error. Every JSON-emitting role goes through this, which is why malformed model output can never become corrupt state.

## 7. The per-turn pipeline (`packages/core/src/orchestrator/`)

`turn.ts` implements the sequence in the README precisely. The parts that matter:

1. Persist the player message.
2. **Classify** the text into catalog intents (always — one cheap call per turn; missed intent is never guessed at from message length).
3. For each intent, **resolve** a `Ruling` — computed, **not committed**.
4. **Assemble context** (`context.ts`) under a token budget with a fixed priority order: system frame + authority rules (never dropped) → this turn's rulings (never dropped) → present-character hard-state snapshot → persona/protagonist → soft-state slices → latest arc + recent chapter summaries → triggered lorebook entries → raw recent messages (trimmed first). Physical prompt ordering additionally places byte-stable content first so provider prompt caches hit.
5. **Stream the narrator**, with rulings inline and marked authoritative.
6. **Commit atomically**: persist the narrator message, apply each ruling via the ledger, persist the rulings and the turn checkpoint — one transaction.
7. **Async, off the critical path**: run the analyzer to patch soft state; run the summarizer's chapter/arc checks.

`authorityGuard.ts` enforces that the framework authority clause is composed *last* in the narrator frame, after any user system prompt — the guardrail that lets Story Blueprints carry a custom system prompt without ever being able to override mechanics. `checkpoint.ts`, `history.ts`, and the swipe/delete/rewind paths implement history integrity against per-turn state pre-images. `journal.ts` maintains the append-only mechanical event log.

## 8. Memory (`packages/core/src/memory/` + `summarizer/`)

The current, intentionally minimal system:

- **`analyzer.ts`** — after each narrator reply, emits a `SoftStatePatch` (typed `set`/`append`/`observe`/`adjust_relationship`/world ops) that `softStore.ts` merges. It is schema-forbidden from mechanical fields; a test proves a mechanical field in a patch fails validation.
- **`cardView.ts` / `dossier.ts`** — read-only projections joining hard + soft into the living card and the full character dossier (including reverse-resolved relationships — who points at this character).
- **`summarizer/`** — `chapter.ts` compresses message blocks into `{title, summary}`; `arc.ts` compresses chapters into a structured, multi-section arc document; `injector.ts` condenses the latest arc + recent chapters + present-character soft slices into the memory block the context assembler places under budget.

This "remembers, does not yet police or retrieve semantically" design is deliberate for v1. The v2 upgrade — local embeddings and semantic recall, a consolidated narrative-fact store, and drift detection, all strictly soft-state — is specified in [`Plan/v2-memory-system.md`](Plan/v2-memory-system.md).

## 9. Persistence (`packages/core/src/store/`)

- **`db.ts`** — opens the database and runs versioned migrations (`001_init.sql` and onward; migrations are embedded so no filesystem is required at runtime).
- **`betterSqliteDriver.ts`** — the real driver; a parallel in-memory driver backs tests and the browser dev server.
- **`repositories/`** — one typed repository per table (stories, characters, messages, rulings, chapters, arcs, world soft, lorebooks, personas, checkpoints, story events, runtime items, settings, …). **All SQL lives here**; nothing else in the codebase issues raw queries. `codec.ts` centralizes JSON (de)serialization of the typed payloads.

One SQLite file per install; stories are rows, not files.

## 10. Bootstrapping a story (`packages/core/src/bootstrap/`)

Two-phase generation keeps each model output small enough to be reliable:

- **Phase A** — premise → `{ statMode, attributes, resources, tiers, skills }`.
- **Phase B** — Phase A → `{ items, actions (with DCs + governing attributes + outcome tables), startingState, npcTemplates }`.

`validate.ts` then runs cross-checks beyond Zod (every referenced skill/attribute/item/flag exists; the catalog meets minimum coverage; DCs sit in band; advantage/disadvantage flags are reachable), feeding precise messages into `repair.ts`'s repair loop. `freeze.ts` locks the schema. A character card, when imported, seeds the premise and identity — but mechanics always come from the bootstrapper, never the card.

## 11. The desktop shell (`packages/shell/`)

A Tauri v2 host: a Rust process exposing IPC and the SQLite driver, wrapping the React UI in a native window. The UI selects the SQLite backend before mounting and fails visibly rather than silently falling back to memory. Packaging (signing, notarization, auto-update) is configured but not yet complete — see the status audit.

## 12. Invariants — the list to defend

If you change the code, do not break these. Each is backed by tests.

1. **Only the ledger writes hard state.** No model output path reaches it.
2. **The analyzer never emits mechanical fields.** Enforced at the schema level.
3. **The schema is frozen at forge time.** Blueprint/identity edits after play affect only future narration, never the rulebook.
4. **Rulings are computed before prose and committed after, in one transaction.**
5. **The authority clause is always last in the narrator frame.**
6. **Swipe never re-rolls the dice.** Hard state is byte-identical across a turn's variants; only the telling changes.
7. **Delete/rewind restore hard state, soft state, world state, and derived summaries exactly and atomically.**
8. **Difficulty and advantage are data, never runtime model judgment**, and both are shown to the player.
9. **Every CoreBridge method exists in both backends**, and the store path stays webview-portable.

## 13. Where to look next

- Behavioral source of record: [`Plan/high-level-plan.md`](Plan/high-level-plan.md), [`Plan/low-level-plan.md`](Plan/low-level-plan.md), [`Plan/low-level-plan-v2.md`](Plan/low-level-plan-v2.md), [`Plan/attribute-integration.md`](Plan/attribute-integration.md), [`Plan/competitive-adoptions.md`](Plan/competitive-adoptions.md)
- Current state: [`Audit/PROJECT_STATUS_AUDIT.md`](Audit/PROJECT_STATUS_AUDIT.md)
- Per-package detail: [`packages/core/README.md`](packages/core/README.md), [`packages/ui/README.md`](packages/ui/README.md), [`packages/shell/README.md`](packages/shell/README.md)
- The v2 memory port: [`Plan/v2-memory-system.md`](Plan/v2-memory-system.md)
