# @midnight-tavern/core

All non-UI logic for Midnight Tavern: the deterministic mechanics engine, the model router, story generation, memory, persistence, and the turn orchestrator. This package has **no React and no DOM** and is consumed by the UI through a single typed façade (`src/index.ts`).

For the architecture and the invariants this package protects, read [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) first.

## Module map

| Directory | Responsibility |
|---|---|
| `types/` | The frozen `StorySchema`, hard/soft state, the Action Catalog, rulings and records — every type paired with a Zod schema. |
| `engine/` | **Deterministic.** Dice, gate, roll-mode, resolver, ledger, attributes, difficulty, conditions, progression, unlock, equipment. Pure functions; the ledger is the sole writer of hard state. |
| `classifier/` | Maps player free text onto zero or more Action Catalog actions (the action id is a per-story Zod enum). |
| `bootstrap/` | Two-phase story generation, cross-validation, repair loop, and schema freeze; card-import mechanics seeding. |
| `memory/` | The analyzer (prose → soft-state patch), the soft store (patch merge), and the living-card / dossier read projections. |
| `summarizer/` | Chapters, arc documents, and the memory injector that condenses them for context assembly. |
| `router/` | Provider adapters (OpenAI-compatible), role→model routing, the curated model catalog + recommendations, sampler profiles, and structured-output validation/repair. |
| `importer/` | Chara Card V2/V3 parsing from PNG (embedded data), raw JSON, and URL; mapping to blueprint/soft identity. |
| `orchestrator/` | The per-turn pipeline, context assembly, the authority guard, swipe/delete/rewind against turn checkpoints, and the mechanical journal. |
| `macros/` | The prompt template/macro engine used during prompt assembly. |
| `store/` | The SQLite driver (plus an in-memory driver), versioned migrations, and typed repositories — the only place raw SQL lives. |
| `licensing/` | The trial clock and merchant-of-record license validation. |
| `config/`, `util/`, `observability/` | Configuration registry, id/uuid helpers, and logging. |

## The rules that keep this package correct

1. **The ledger (`engine/ledger.ts`) is the only writer of hard state.** Nothing else mutates attributes, resources, skills, inventory, flags, or alive/dead.
2. **The analyzer cannot emit mechanical fields.** The `SoftStatePatch` schema forbids them; a test proves a mechanical field fails validation.
3. **All model output is Zod-validated at the boundary** via `router/structured.ts`. Malformed output triggers a repair attempt, never corrupt state.
4. **All SQL lives in `store/repositories/`.** No queries anywhere else.
5. **This package stays webview-portable.** The store path avoids `node:` built-ins so it runs identically under the Tauri driver and the in-memory test driver.
6. **The frozen schema is authoritative and immutable during play.** The gate refuses an unlocked schema.

## Scripts

```bash
npm test          # vitest
npm run test:watch
npm run coverage  # V8 coverage — the engine is held to 100% branch coverage
npm run typecheck # tsc (source + tests)
npm run build     # tsc
```

## Tests

`test/` mirrors `src/` (engine, bootstrap, classifier, memory, orchestrator, router, store, summarizer, importer, licensing, macros). The engine suite is table-driven with a seeded RNG and is the release-blocking core of the whole project: if it is not green, nothing ships. Around 300 core test cases run here.

## Dependencies

Deliberately minimal: `better-sqlite3` (persistence) and `zod` (validation). Everything else is standard library. The small dependency surface is intentional — this package is the trust boundary of the product.
