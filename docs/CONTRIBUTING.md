# Contributing & Development Guide

How to work in this repository: the conventions, the boundaries, and the checklist for adding a feature without breaking the guarantees the product is built on.

Read [`../ARCHITECTURE.md`](../ARCHITECTURE.md) first — the invariants there are not style preferences, they are the product.

## Setup

```bash
npm install            # all workspaces
npm test               # verify a green baseline
npm run typecheck      # root type gate
```

For UI-only work, `cd packages/ui && npm run dev` gives you the interface in a browser against the in-memory core — no Rust, no native build. For real persistence and the desktop host, `cd packages/shell && npm run tauri dev`.

## The boundaries (non-negotiable)

1. **`core` never imports from `ui`.** Logic lives in core; the UI consumes it through the CoreBridge.
2. **Hard state is written only by the engine ledger.** If your feature changes mechanical state, it goes through the ledger — never through the analyzer, the narrator, or any other model path.
3. **The analyzer emits only non-mechanical fields.** The `SoftStatePatch` schema enforces this; keep it that way.
4. **All model output is Zod-validated** at the boundary (`router/structured.ts`). Never trust raw model JSON.
5. **All SQL lives in `store/repositories/`.** Add a repository method; don't scatter queries.
6. **Core stays webview-portable.** No `node:` built-ins on the store path.
7. **Every CoreBridge method is implemented in both backends** (in-memory and SQLite). This is the single most common way a change passes tests and fails in the app — check it every time.

## Adding a feature end to end

A typical feature touches these layers in order:

1. **Types** (`core/src/types/`) — add the type and its Zod schema together.
2. **Migration** (`core/src/store/`) — if persistence changes, add a versioned migration. Pre-release, prefer a clean schema over data-migration logic (there are no shipped databases to preserve).
3. **Repository** (`core/src/store/repositories/`) — typed CRUD; no SQL elsewhere.
4. **Core logic** — the module that owns the behavior (engine, memory, orchestrator, …). Keep engine code pure.
5. **CoreBridge** — add the method to the interface and **both** backend implementations.
6. **UI** — screen/component + Zustand wiring, in the correct visual register (story vs system).
7. **Tests** — see below. A feature is not done until it is green across build, typecheck, and tests in every affected workspace.

## Testing expectations

- **Engine changes** must keep 100% branch coverage and add table-driven, seeded-RNG cases for every new branch. Engine test failures are release blockers, permanently.
- **Model-facing changes** rely on Zod for structural validity; add golden-file or contract tests for behavior.
- **History-integrity changes** (swipe/delete/rewind) must assert: hard state byte-identical across a turn's variants, no dice re-rolled on swipe, the authority clause last on every narrator call, and exact atomic restoration on delete/rewind.
- **UI changes** should run without React `act(...)` warnings.

```bash
# per package
cd packages/core && npm run coverage
cd packages/ui   && npm test
# root
npm run build && npm run typecheck && npm test
```

## Conventions

- **TypeScript everywhere**, `type: module`, explicit types on public boundaries.
- **Types and Zod schemas are defined together** and exported from the module's `index.ts`.
- **Model roles are named** Narrator, Classifier, Analyzer, Summarizer, Story AI — use these labels in code and UI.
- **Determinism is a feature.** Anything that affects a mechanical outcome must be a pure function of frozen schema data and current hard state, plus an injectable RNG. If you find yourself asking a model to decide a mechanic, stop — the answer is schema data, not a model call.
- **Prose never writes the ledger.** If a feature seems to need the narrator to change state, it is designed wrong.

## Where the specs live

- Behavior source of record: [`../Plan/`](../Plan/) (high-level, low-level, v2, attributes, competitive adoptions).
- Visuals: [`../Design/`](../Design/) (versioned handoffs, screens, prototypes).
- Current state and remaining work: [`../Audit/PROJECT_STATUS_AUDIT.md`](../Audit/PROJECT_STATUS_AUDIT.md).
- The v2 memory port: [`../Plan/v2-memory-system.md`](../Plan/v2-memory-system.md).

When code and a plan disagree on *behavior*, the plan is authoritative and the code is a bug; when they disagree on *look*, the design handoff is authoritative.
