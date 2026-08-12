# AGENTS.md — operating protocol for coding agents

> ## ⛔ Read [`docs/PLAN-POLICY.md`](docs/PLAN-POLICY.md) before you plan anything
>
> **Every plan document written before 2026-08-12 is DECOMMISSIONED**, by owner decision. Anything
> in `Plan/`, `Audit/`, or `docs/superpowers/plans/` that had not shipped by 2026-08-12 is
> **cancelled** — not deferred. That includes Audit Plan 13's deferred queue (Plans 21/19/20/18/23/10B).
> Only plans created **after 2026-08-12**, living in `docs/plans/`, may be worked on. Do not resume
> or cite an old plan as a reason to do anything. Shipped *behaviour* is unaffected — it is defended
> by the test suite and the invariants in `CONTEXT.md` and `ARCHITECTURE.md` §12.

This repo is worked on by AI coding agents **sequentially** (not in parallel). This file is the
contract that lets any agent pick up where the last one stopped without losing context. Human
CONTRIBUTING guidance lives in [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md); this file is the
agent-to-agent baton.

## Roles

- **Product owner / tester:** the human. Not a TypeScript reviewer. They test the running app and
  make product/UX calls. Surface product decisions to them; do **not** ask them to make
  TS/architecture decisions.
- **Engineering manager (you, the agent):** drive design + implementation autonomously. The
  **automated test suite is the primary safety net** because the human cannot review TS.

## Start-here checklist (do this before touching code)

1. Read [`docs/HANDOFF.md`](docs/HANDOFF.md) — the current live state and the *next action*.
2. Skim the top (most recent) entries of [`docs/WORKLOG.md`](docs/WORKLOG.md) — what recently landed and why.
3. Read the active plan named in HANDOFF — it will be a file under `docs/plans/` dated after
   2026-08-12. If HANDOFF names none, there is none: pick the next plan deliberately with the
   human before starting. **Never** adopt a pre-2026-08-12 plan, however unfinished it looks; see
   [`docs/PLAN-POLICY.md`](docs/PLAN-POLICY.md).
4. Verify the baseline is green before you change anything:
   ```bash
   npm run typecheck
   npm test
   ```
   If it is **not** green on a clean tree, fix that first and log it — do not build on red.

## Finish-here checklist (do this before you stop)

1. Keep the suite green: `npm run typecheck && npm test`.
2. Commit coherent changesets (see Commit protocol).
3. **Append** a dated entry to `docs/WORKLOG.md` (never edit past entries).
4. **Overwrite** `docs/HANDOFF.md` with the new live state and the single next action.
5. Tick the relevant boxes in the active `Plan/…` checklist.

## Commands

- Everything (all workspaces): `npm test`, `npm run typecheck`, `npm run build`
- Core only: `cd packages/core && npm test`
- UI only: `cd packages/ui && npm test`
- One UI test file: `cd packages/ui && npx vitest run test/screens/<File>.test.tsx`
- Desktop shell (Rust): `cd packages/shell/src-tauri && cargo check`

## Architecture (one paragraph)

TypeScript monorepo. `packages/core` = the deterministic game engine + LLM services (bootstrap,
classifier, analyzer, summaries, typed SQLite repositories). `packages/ui` = React/Zustand screens
that talk to core **only** through a `CoreBridge` with two backends: `bridge/core.ts` (in-memory,
for browser/tests) and `bridge/sqliteBridge.ts` (native). `packages/shell` = the Tauri/Rust host.
Design rule: **program-owned mechanics are authoritative; models only supply prose, classification,
and soft memory.** See [`ARCHITECTURE.md`](ARCHITECTURE.md).

## Rules of the road

- **Bridge parity:** the two bridges (`core.ts`, `sqliteBridge.ts`) must expose the same surface.
  They have drifted before (JSON-capability bug). Prefer extracting browser-safe shared modules over
  hand-mirroring. Never import `node:`/native deps into the `core.ts` (webview) path.
- **Tests are the contract.** Add/adjust tests for every behavior change; keep the suite green.
- **A hook (GateGuard) fact-gates the first edit of each file.** When blocked, briefly state
  importers/affected API/schema and the user's instruction, then retry the identical edit. It can be
  silenced for a session with the env var `ECC_GATEGUARD=off` (do not change committed config without
  the human asking).
- **Design/handoff-v2…v7** are historical HTML prototypes (7 near-duplicate copies). Treat as
  read-only reference, not runtime code.
- Release/signing/updater/CSP work is a **later** phase — do not start it unless HANDOFF says so.

## Commit protocol

- Small, coherent commits; imperative subject; scope prefix (`ui:`, `core:`, `shell:`, `docs:`).
- Do not commit red. Do not push unless the human asks.
- End commit messages with the Co-Authored-By trailer the harness requires.
