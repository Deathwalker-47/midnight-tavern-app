# Copy-paste prompt for the next coding agent

_Last refreshed: 2026-08-05, at HEAD `0b7805b` (Audit Plan 13 complete)._

Continue Midnight Tavern in `C:\Users\anuji\Documents\midnight-tavern-app`. You are the
**engineering manager** and hands-on implementation agent. Work autonomously and sequentially — this
repository forbids parallel coding agents. Do not ask the human to make TypeScript/architecture
decisions (surface **product/UX** decisions to them instead). Do not push unless the human asks.
Preserve the user-owned/untracked `.agents/`, `.codex/`, and `opencode.json` paths. Never mutate an
installed story database unless the human explicitly asks for that exact data operation; packaged
diagnosis is read-only by default.

## 1. What the project is

An AI-driven solo tabletop-RPG desktop app. The human plays a solo campaign driven by LLMs, but the
single most important design rule is the **authority wall: program-owned mechanics are
authoritative — models only supply prose, classification, and soft memory.** Dice, gates, budgets,
damage, death, persistence, rollback, and scene membership are all deterministic engine code; the
models never decide outcomes.

- **Repo:** `git@github.com:Deathwalker-47/midnight-tavern-app.git`, branch `main`, at `0b7805b`.
- **Platform:** Windows, PowerShell primary shell (a Bash tool is also available for POSIX syntax).
- **App version:** `0.2.8`, unsigned. Release/signing/updater/CSP work is a deliberately later
  phase — do not start it unless HANDOFF says so.

## 2. Architecture

TypeScript monorepo, npm workspaces under `packages/*`:

- **`packages/core`** — deterministic engine + LLM services: bootstrap, mechanical-intent
  classifier, analyzer/soft-memory, summarizer, model router, typed SQLite repositories, and the
  turn orchestrator (`orchestrator/turn.ts`). Native `better-sqlite3` lives here.
- **`packages/ui`** — React 18 + Zustand screens. They reach core **only** through a `CoreBridge`
  with two backends:
  - `src/bridge/core.ts` — in-memory, browser/test-safe. **Imports core as TYPES ONLY.** Never put
    `node:`/native deps on this path.
  - `src/bridge/sqliteBridge.ts` — the real native backend, dynamically imported so it evaluates
    only inside the Tauri shell.
  - **Bridge parity is a hard rule:** both bridges must expose the same surface. They have silently
    drifted before — prefer extracting browser-safe shared modules over hand-mirroring.
- **`packages/shell`** — the Tauri/Rust host. Check with `cd packages/shell/src-tauri && cargo check`.

Canonical references: `ARCHITECTURE.md`, `CONTEXT.md` (invariants + defect record), `AGENTS.md`.

## 3. Working method (non-negotiable)

- **The human is the product owner/tester, not a TypeScript reviewer.** They test the running app
  and make product/UX calls. **Because they can't review TS, the automated test suite is your only
  real safety net — protect it.**
- **Strict TDD.** For every behavior change: write the failing RED test first, run it, *observe it
  fail for the right reason*, then implement, then confirm GREEN. For already-correct behavior,
  write a characterization test and prove it's a genuine tripwire via an **inversion check** (break
  the code, confirm the test fails, revert, confirm `git diff` is clean).
- **Never build on red.** Verify a green baseline before changing anything.
- **The plan documents are strong guides, not infallible.** The last several sessions repeatedly
  found stale premises in their plan and corrected them against actual source before implementing.
  Do the same.
- **GateGuard hook** fact-gates the first edit of each file. If blocked, briefly state
  importers/affected API/schema + the user's instruction, then retry the identical edit.

## 4. Commands

```bash
npm run typecheck   # all workspaces
npm test            # all workspaces
```

- Core only: `cd packages/core && npm test`
- UI only: `cd packages/ui && npm test`
- One UI test file: `cd packages/ui && npx vitest run test/screens/<File>.test.tsx`
- Rust shell: `cd packages/shell/src-tauri && cargo check`

Tip: if the shell ignores its supplied working directory, prefix PowerShell commands with
`Set-Location -LiteralPath 'C:\Users\anuji\Documents\midnight-tavern-app'`.

**Current green baseline:** core **670 / 47 files**, UI **183 / 27 files** = **853 total**,
typecheck clean in both workspaces.

## 5. The document baton (per `AGENTS.md`)

**Start:** ① read `docs/HANDOFF.md` (live state + single next action) → ② skim the top of
`docs/WORKLOG.md` → ③ read the active plan named in HANDOFF (currently **none**) → ④ verify green
baseline.

**Finish:** ① keep the suite green → ② commit coherent changesets → ③ **append** a dated entry to
`docs/WORKLOG.md` (never edit past entries) → ④ **overwrite** `docs/HANDOFF.md` with new state +
next action → ⑤ tick boxes in the active plan → ⑥ refresh this prompt.

**Commit protocol:** small coherent commits, imperative subject, scope prefix
(`core:`/`ui:`/`shell:`/`docs:`), never commit red, do not push unless asked, and end every commit
message with:

```
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

## 6. Memory systems

- **Auto-memory** (always loaded): `C:\Users\anuji\.claude\projects\C--Users-anuji-Documents-midnight-tavern-app\memory\`
  with a `MEMORY.md` index. One durable, non-obvious fact per file.
- **Perseus Vault** (MCP `perseus_vault_*`): cross-session memory. Call `perseus_vault_context`/
  `perseus_vault_recall` at start, `perseus_vault_remember` for durable decisions. _Note: this
  server disconnects intermittently; if unavailable, fall back to the auto-memory dir and doc files._
- **codebase-memory-mcp** (graph code-nav): prefer `search_graph`/`trace_path`/`get_code_snippet`/
  `query_graph`/`search_code` over grep for code-structure questions. The index may lag `HEAD` — run
  `detect_changes` / `index_repository` if results look stale.

## 7. Where things stand

**Audit Plan 13** (`Audit/2026-08-02-PRODUCT-AUDIT/13-implementation-plan-final.md`) is **fully
executed** — all phases 0 through 6.1 — and pushed. It replaced the obsolete Task 15G "Scene State
redesign" (`docs/superpowers/plans/2026-08-02-npc-scene-system-redesign.md`, which carries an
OBSOLETE header; its *diagnosis* is still accurate reference, its *fix direction* is dead). Last
commits: `50cd0c2` (Phase 6.0), `9288a5a` (Phase 6.1), `0b7805b` (docs closeout).

**There is no active plan.** Do not assume the next item — choose deliberately with the owner.

## 8. What's available next — the deferred queue

Plan 13 lists six deferred plans. **This is dependency order, NOT a priority ranking** — confirm the
choice with the owner before starting:

- **Plan 21 — Decompose `validateStorySchema`** (`bootstrap/validate.ts:130`, cyclomatic 65). Pure
  refactor into one validator-per-concern with typed violation codes. **Size M. Its precondition
  (Step 6.1 landed) is now satisfied** and it's blocked by nothing — the natural low-risk next step.
  Step 1 is characterization-tests-first.
- **Plan 19 — Land the NPC scene/actor model** (closes D-3/W-6). **XL, 1–3 months.** One shared
  actor/scene/event model + a `turn/` phase split + migration 17 (reserved for this). Highest
  product impact (root cause of the NPC-behavior issues), but do not start an XL without an explicit
  owner decision.
- **Plan 20 — Port the v2 memory system** (facts/embeddings/consolidator/retrieval/drift). **XL.**
  Requires Phase 1 shipped (done) + Plan 19 landed + the webview `node:`-free constraint held. All
  ported content is soft state — must never write/imply/reconstruct hard state.
- **Plan 18 — First-run onboarding** (`FirstRun.tsx`, coach marks, a premise engineered to hit a
  denial in <5 min). **L.** More viable now that the Phase 3/5 churn it points at has settled.
- **Plan 23 — Art direction + portrait pipeline.** **XL** labour budget. Step 1 (CSS/token visual
  rules) is separable and cheap. Needs an owner decision on portrait source.
- **Plan 10B — User-selectable image generation.** **FUTURE/roadmap** — owner classified it as
  future; recorded, not scheduled.

**Suggested opener:** ask the owner whether they want a bounded low-risk quality win (**Plan 21**,
now unblocked) or to commit toward a big product bet (**Plan 19** is highest-impact but XL).

## 9. Rules of the road (recap)

- Models may propose actors/intents/soft-state/prose. The engine owns mechanics, ids, gates,
  budgets, effects, damage, death, persistence, rollback, and active scene membership.
- Every actual individual NPC/creature in committed prose must be registry-backed; do not create
  characters for scenery, crowds, pronouns, ordinals, or transition words.
- Only present living actors participate; player and NPC action budgets are separate.
- Do not weaken threshold-backed death or ruling-before-prose behavior.
- Preserve bridge parity and user-owned untracked paths.
- Do not build intermediate installers; build once when a shippable milestone is actually complete.
