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

Current runtime HEAD is `75dfe6c` on local `main`, followed by a docs-only handoff commit. The fresh
baseline is core 528/42 files + UI 147/25 files = **675 tests**, with clean typecheck. Direct UI
production build and `cargo check` pass. Seven known React `act(...)` warnings remain. The app is
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
- Task 10 (`a2656e4`): recommendation config v2 makes Gemini Flash the shipped responsive narrator
  default, labels it `Fast`, retains Claude Opus as the explicit `Quality` choice, and keeps the
  browser mirror and Role Matrix reset contract in parity.
- Task 11 (`80e3b44`): bootstrap permits one structured repair by default and bounds every
  provider-backed fragment to 45 seconds. Immediate caller cancellation is distinct from timeout
  even when a provider ignores abort. Validated fragments are stored in a versioned Forge operation
  (native SQLite settings, browser local storage), writes are serialized and ID-safe, installed
  stories cannot be duplicated by stale recovery state, and Wizard/Blueprint creation offer
  truthful resume or discard/edit controls after navigation or restart. Failed rulebook replacement
  leaves the installed schema/version untouched.
- Task 12 (`b348f83`): three literal V2/V3 card/persona fixtures lock prompt-time macro expansion,
  accepted attribute terminology, exact named possessions, scenery/model-decoy exclusion, and raw
  creation-source preservation. Forge refreshes mechanics from the preserved card instead of stale
  preview values. With attached card/persona prose, runtime inventory accepts only deterministically
  verified carried/wielded/worn/kept/holstered/strapped/packed gear; premise-only Forge can still use
  bounded actor-foundation proposals.
- Task 13 (`3ebd58d`, `e0f210d`, `6dab752`, `75dfe6c`): suggestions reject
  registered-but-absent character names and use bounded repair; failed lorebook saves visibly retain
  the exact draft and retry safely; lorebook hierarchy remains acceptance-tested; multi-character
  roster tests prove dossier/loadout routes carry the selected registry id; and regeneration
  failure leaves installed mechanics plus unsaved settings visible before retrying from the retained
  checkpoint.

Important semantic detail: an ordinary narrator/provider error now completes the turn using safe
deterministic prose. Approved staged NPC transitions therefore commit with that successful fallback
turn. Genuine cancellation or a truly failed operation still leaves no partial exchange or registry
mutation.

Do not add encounter gating to the NPC planner yet. There is no authoritative encounter-active fact,
and combat-ruling heuristics would suppress the accepted non-combat agency from Task 5. The planner
call is bounded and measured; revisit only after a sealed encounter-state model exists.

Your immediate task is detailed-plan Task 14: eliminate all seven React `act(...)` warnings without
masking real lifecycle failures.

1. Trace `packages/ui/src/screens/Play.tsx` (`RulingBlock` reveal timer and drawer/mount async work)
   and `packages/ui/src/screens/Overview.tsx` with codebase-memory-mcp.
2. In the focused Play and Overview suites, make React's `not wrapped in act(...)` console error
   fail the test so each warning is observable as a red contract.
3. Fix test synchronization first: drive reveal timers inside `act`, await pending store/bridge
   work, and ensure every mounted screen settles before cleanup. Change runtime code only if this
   exposes a genuine lifecycle bug.
4. Run the complete UI suite and confirm there is no warning stderr, then run full typecheck/tests
   and the direct production UI build.
5. Commit coherently and record exact warning-free evidence in WORKLOG.

Then continue in order without waiting for the human:

- Task 15: full Internal Beta verification and packaged manual acceptance; only then build the final
  installer and report its exact path and SHA-256.
- Do not start Task 16 signing/updater/CSP.

Before every stop: keep tests green, make coherent commits, tick the detailed plan, append
`docs/WORKLOG.md`, overwrite `docs/HANDOFF.md` with one next action, and refresh this prompt with the
actual current commit, verification counts, semantic decisions, and remaining work.
