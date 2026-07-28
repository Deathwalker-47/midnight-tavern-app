# Continuation prompt for the next coding agent

You are continuing Midnight Tavern in:

`C:\Users\anuji\Documents\midnight-tavern-app`

Act as the engineering manager and implementation agent. Work sequentially, test-first, and do not
ask the human to make TypeScript or architecture decisions. Do not push. Preserve the user-owned
untracked `.codex/` directory and `opencode.json`.

## Mandatory orientation

Before editing:

1. Read `AGENTS.md` completely.
2. Read `docs/HANDOFF.md` completely; it is the current authoritative baton.
3. Read the newest entries in `docs/WORKLOG.md`.
4. Read `Plan/next-phase-internal-beta.md`.
5. Read `docs/superpowers/plans/2026-07-29-internal-beta-completion.md`, especially Task 3 onward.
6. Use codebase-memory-mcp first for code discovery (`search_graph`, `trace_path`,
   `get_code_snippet`); re-index the repository if the graph is stale.
7. Run `npm run typecheck` and `npm test` before building on the branch.

## Current repository state

- Branch: `main`, local and not pushed.
- Runtime HEAD before the final documentation commit: `2e4cf07`
  (`fix(play): show rulings before narration`).
- Prior structural commit: `de443cf`
  (`core(orchestrator): make scene presence authoritative`).
- Expected verified baseline: core 480 tests in 39 files; UI 137 tests in 25 files; 617 total.
- `npm run typecheck`, `npm test`, `npm run build`, and
  `cargo check` under `packages/shell/src-tauri` are green.
- Known test noise: seven React `act(...)` warnings. Task 14 owns that cleanup.
- App version remains unsigned `0.2.8`.
- Fresh installers:
  - NSIS:
    `packages/shell/src-tauri/target/release/bundle/nsis/Midnight Tavern_0.2.8_x64-setup.exe`
    SHA-256 `B438E441A51C7C503E59F97A3794349485C919818EDAA565F6A4E4834F55798F`
  - MSI:
    `packages/shell/src-tauri/target/release/bundle/msi/Midnight Tavern_0.2.8_x64_en-US.msi`
    SHA-256 `9F2717FB8BE186F191120F053D53625727B2279B3CB178E82E990AC3032588B8`

## Product invariants you must preserve

- Deterministic engine/DM authority owns gates, dice, effects, costs, death, loot, progression,
  budgets, and persisted state. Models may propose/classify/write prose but may not mutate or
  overrule mechanics.
- Every real NPC appearing in fiction must belong to the character registry.
- Registry membership is not scene presence. Only persisted present characters may enter active
  classification/context/agency, while dossier/history use the full registry.
- Narrator prose must not introduce unregistered characters or contradict immutable rulings.
- DM rulings must remain visible before the first narrator prose delta.
- Ambient scenery, murals, statues, crowds-as-background, and grammar false positives such as
  “Nothing moves” must never become characters.
- Universal actions, progression, configuration, model defaults, and formulas are engineering-owned
  and versioned.

## What just landed

1. Task 2 is complete. Migration 12 snapshots `characters.present` in checkpoints. Rewind restores
   it. Turn classification, context, analyzer, suggestions, NPC agency, swipe, and native cast views
   use `listPresentByStory`; full-registry views remain complete.
2. The core turn contract now emits `onRulings` before `thinking`, `streaming`, or any `onDelta`.
   Both bridges thread it. `playStore.pendingRulings` renders the ruling above live prose and clears
   it after the authoritative snapshot reload.
3. The entity heuristic rejects sentence-initial quantifiers such as Nothing/Something. Migration
   13 removes the existing unused `:scene:nothing` phantom and its checkpoint keys.
4. The structured classifier now allows two bounded repairs rather than one because the live
   Electron Hub `gpt-4o-mini` route produced two consecutive invalid shapes. Sealed deterministic
   recovery remains the fail-closed fallback.

## Single next action: Task 3

Implement **Task 3: Add an Engine-Validated NPC Introduction Contract** from the detailed plan.

Start with failing tests in a new
`packages/core/test/orchestrator/npcIntroduction.test.ts`. Cover:

- approved template introduction;
- bounded generic introduction;
- duplicate normalized name reuses an existing registry row;
- enter, leave, and re-entry update scene presence without deleting registry membership;
- invalid template rejection;
- mural/statue/crowd/background negatives;
- malformed structured output and cancellation;
- no proposed NPC can act until it is approved and present.

Then add `packages/core/src/orchestrator/npcIntroduction.ts` with one bounded structured classifier
request and deterministic validation. The proposal may contain `introduce | enter | leave`, name,
optional existing id/template id, and grounding. Validate grounding against the player text, recent
narration, blueprint, existing registry, or an approved sealed template. Reuse an existing row by
normalized name before creating a stable per-story id. Stage approved transitions before narration,
pass the resulting present roster to context, and commit transitions atomically with the turn.

Add the narrator constraint:

> You may portray only the registered present characters listed below. Do not introduce another
> person, creature, speaking intelligence, or named NPC in prose.

Do not let this model stage choose mechanics. It only proposes identity/presence transitions; the
engine validates them.

After Task 3, proceed to Task 4: remove post-narration heuristic creation as an authority path.
Retain a narrowly explicit legacy catch-up only if tests prove it is needed for old stories.

## Remaining ordered work

Continue through the detailed plan one coherent green commit at a time:

1. Task 3 — validated NPC introduction/presence contract.
2. Task 4 — close heuristic NPC authority path.
3. Task 5 — bounded goal-driven NPC planning.
4. Task 6 — deterministic non-combat provocation.
5. Task 7 — provider-to-Play streaming proof.
6. Task 8 — verified mechanical-beat streaming.
7. Task 9 — stage deadlines, deterministic fallbacks, and latency telemetry.
8. Task 10 — responsive model defaults.
9. Tasks 11–13 — forge durability and remaining product acceptance risks.
10. Task 14 — eliminate React warnings.
11. Task 15 — Internal Beta exit gate and packaged human acceptance.

Task 16 (signing, updater, CSP, sellable distribution) remains out of scope until the Internal Beta
gate is genuinely complete.

## Working protocol

- Write the failing test, run it and record the RED failure, implement the smallest correct change,
  then rerun focused tests.
- Maintain browser/native bridge parity.
- Never import Node/native dependencies into the eager webview path.
- Before each commit run at least `npm run typecheck` and the relevant suites; before handoff run the
  full `npm test`.
- Use small imperative commits with scope prefixes and the trailer
  `Co-Authored-By: Codex <noreply@openai.com>`.
- Before stopping: tick the detailed plan, append `docs/WORKLOG.md`, overwrite `docs/HANDOFF.md`
  with the new live state and one next action, and leave the tracked tree clean.
