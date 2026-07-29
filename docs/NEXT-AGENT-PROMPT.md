# Copy-paste prompt for the next coding agent

Continue Midnight Tavern in `C:\Users\anuji\Documents\midnight-tavern-app`.

Act as the engineering manager and hands-on implementation agent. Work autonomously and
sequentially; do not ask the human to decide TypeScript architecture. Do not push. Preserve the
user-owned untracked `.codex/` directory and `opencode.json`.

Start by reading, in full:

1. `AGENTS.md`
2. `docs/HANDOFF.md`
3. the newest entries in `docs/WORKLOG.md`
4. `Plan/next-phase-internal-beta.md`
5. `docs/superpowers/plans/2026-07-29-internal-beta-completion.md`

Use codebase-memory-mcp before text search for code discovery and re-index the checkout if stale.
Run `npm run typecheck` and `npm test` before editing. Use test-driven development for every
behavioral change and verification-before-completion before claiming success.

Current runtime HEAD is `a803f76` on local `main`, followed by a docs-only handoff commit. The fresh
baseline is core 518/41 files + UI 140/25 files = **658 tests**, with clean typecheck. Direct core/UI
production builds and `cargo check` pass. Seven known React `act(...)` warnings remain. The app is
unsigned v0.2.8.

The human explicitly said not to build an installer until all remaining Internal Beta work is done.
Do not run the root `npm run build`, because the shell workspace invokes `tauri build`. Use direct
core/UI workspace builds plus `cargo check` until Task 15.

Critical product rules:

- Deterministic engine/DM owns gates, dice, effects, damage, death, player/NPC budgets, loot,
  progression, and persistence. Models only propose/classify/write prose.
- Every real NPC or creature appearing in fiction must be registry-backed. Registry membership and
  scene presence are different facts. Only present, living registry actors may participate.
  Scenery, murals, statues, background crowds, "Nothing," and "Something" are not characters.
- DM rulings must render before the first narrator delta. Prose may dramatize but cannot quote
  internal dice/DC arithmetic or assert death unless hard state reached the lethal threshold and the
  ruling reports `causedDeathOf`.
- Two player strikes/actions remain legal when the configured player action budget is two. NPC
  actions have their own budget.
- Hard-state transitions and narration are atomic. Narrator prose never creates characters or
  invents mechanical effects.

What is already implemented:

- Tasks 1-2: character registry/presence split, presence-only active consumers, rollback-safe
  checkpoint pre-images, ruling-before-stream ordering, and cleanup/prevention of quantifier
  phantoms.
- Tasks 3-4 (`350f805`): one bounded engine-validated NPC introduce/enter/leave stage before
  classification; actor/target normalization to the present player; two-action legality; default
  melee/ranged lethal-resource damage for mechanically empty attacks; death only at lethal resource
  zero; natural authority-safe fallback prose.
- Task 5 (`04e83b7`): present idle NPCs may pursue validated sealed aid/converse/flee/surrender/
  exploit goals through one bounded structured request and a separate NPC budget. Invalid, dead,
  absent, malformed, timed-out, or failed-gate proposals become no action.
- Task 6 (`b753de3`): deterministic non-combat provocation uses sealed opposition, danger, or
  committed target harm; harmless aid/dialogue does not provoke.
- Tasks 7-8 (`fccab2c`, `09da205`): safe prose reaches Play before provider completion; accepted
  mechanical prose releases beat-by-beat behind whole-draft audit and a per-beat deterministic death
  guard.
- Task 9a (`2b43325`): reusable `runStage` deadline/fallback/telemetry policy.
- Task 9b (`a803f76`): classifier, NPC introduction, NPC planner, narrator, and authority audit all
  have explicit deadlines and deterministic fallbacks. Migration 14 persists ordered
  `StageMetric[]` on turn operations; restart retains metrics; retry clears and re-records them;
  submit/retry native bridge callbacks are parity-tested. Genuine user cancellation propagates
  immediately even if a provider ignores abort.

Important semantic detail: an ordinary narrator/provider error now completes the turn using safe
deterministic prose. Approved staged NPC transitions therefore commit with that successful fallback
turn. Genuine cancellation or a truly failed operation still leaves no partial exchange or registry
mutation.

Do not add encounter gating to the NPC planner yet. There is no authoritative encounter-active fact,
and combat-ruling heuristics would suppress the accepted non-combat agency from Task 5. The planner
call is bounded and measured; revisit only after a sealed encounter-state model exists.

Your immediate task is detailed-plan Task 10: make responsive models the versioned defaults.

1. Inspect `packages/core/src/config/model-recommendations.json` and its core/UI parity consumers.
2. Add failing tests in `packages/core/test/router/modelConfig.test.ts` and
   `packages/ui/test/bridge/catalogParity.test.ts` proving the recommended narrator default favors
   responsiveness and labels distinguish speed from quality.
3. Observe the current slower default.
4. Make the smallest versioned configuration change. Keep Opus-class models available as explicit
   quality choices; do not remove them or hard-code UI-only alternatives.
5. Run focused tests, `npm run typecheck`, `npm test`, direct core/UI workspace builds, and
   `cargo check`.
6. Commit `core(config): prefer responsive narrator defaults` with the required
   `Co-Authored-By: Codex <noreply@openai.com>` trailer.

Then continue in order without waiting for the human:

- Task 11: truthful bounded durable/resumable/cancellable Forge operations.
- Task 12: card attributes, macros, and starting gear acceptance.
- Task 13: remaining UX acceptance and bridge parity.
- Task 14: eliminate the seven React `act(...)` warnings.
- Task 15: full Internal Beta verification and packaged manual acceptance; only then build the final
  installer and report its exact path and SHA-256.
- Do not start Task 16 signing/updater/CSP.

Before every stop: keep tests green, make coherent commits, tick the detailed plan, append
`docs/WORKLOG.md`, overwrite `docs/HANDOFF.md` with one next action, and refresh this prompt with the
actual current commit, verification counts, semantic decisions, and remaining work.
