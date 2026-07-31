# Copy-paste prompt for the next coding agent

Continue Midnight Tavern in `C:\Users\anuji\Documents\midnight-tavern-app`.

Act as the engineering manager and hands-on implementation agent. Work autonomously and
sequentially; this repository forbids parallel coding agents. Do not ask the human to decide
TypeScript architecture. Do not push. Preserve the user-owned untracked `.codex/` directory and
`opencode.json`.

Start by reading, in full:

1. `AGENTS.md`
2. `docs/HANDOFF.md`
3. the newest entries in `docs/WORKLOG.md`
4. `Plan/next-phase-internal-beta.md`
5. `docs/superpowers/plans/2026-07-29-internal-beta-completion.md`

Use codebase-memory-mcp before text search for code discovery and re-index the checkout if stale.
Run `npm run typecheck` and `npm test` before any source edit. Use test-driven development for every
behavioral change and verification-before-completion before claiming success. Always run PowerShell
commands after an explicit `Set-Location -LiteralPath
'C:\Users\anuji\Documents\midnight-tavern-app'`; the desktop working-directory hint has been ignored
in past sessions.

## Current state

The source HEAD is `4237735` on local `main`, followed by a docs-only Task 15 closeout commit. It is
not pushed. The app is unsigned v0.2.8. All planned source work through the automated Internal Beta
gate is complete. The final codebase-memory fast index contains 6,188 nodes and 15,596 edges.

Fresh evidence from 2026-07-31:

- typecheck passed in 12.351 seconds;
- core 546/42 files plus UI 147/25 files = 693 tests, passed in 20.616 seconds;
- UI test stderr is clean and guarded against React `act(...)` regressions;
- the configured core engine coverage gate passed at 100% statements, branches, functions, and
  lines (546 tests, 11.615 seconds);
- direct core build passed in 4.123 seconds;
- direct UI production build passed in 8.067 seconds;
- `cargo check` passed in 3.76 cargo-reported seconds;
- root packaging passed; Tauri reported both Windows bundles complete;
- the packaged release stayed alive through an isolated eight-second startup smoke test.

Do not repeat the expensive package build unless a new source change invalidates the artifacts.
The prior desktop turn looked like it crashed during the long Rust/package phase, but the build had
completed. Independent inspection found no stranded packaging process and validated all artifacts.
The user's separately installed/running app was not touched.

## Artifacts

- Release EXE:
  `packages/shell/src-tauri/target/release/midnight-tavern.exe`
  - 22,791,168 bytes
  - SHA-256 `F2BE3989C2CF57611EADF31D841E3A1EE197E832D3927F9E3E8B6E8B7584D36F`
- MSI:
  `packages/shell/src-tauri/target/release/bundle/msi/Midnight Tavern_0.2.8_x64_en-US.msi`
  - 9,261,056 bytes
  - SHA-256 `077504A87FC1A76FCFFDBE99820589503692ECC84C93ABB6330F900D1780F661`
- NSIS:
  `packages/shell/src-tauri/target/release/bundle/nsis/Midnight Tavern_0.2.8_x64-setup.exe`
  - 5,614,826 bytes
  - SHA-256 `74E258DDCF878D40022E9EC3B7BD54618AED12BDFAA859541FA7897E2196E7BA`

These are unsigned Internal Beta artifacts. Windows reputation warnings are expected. Signing,
updater provisioning, and strict CSP are Task 16 and remain out of scope until the human explicitly
starts the later release phase.

## Non-negotiable product rules

- Deterministic engine/DM owns gates, dice, effects, damage, death, player/NPC budgets, loot,
  progression, and persistence. Models only propose/classify/write prose.
- Every real fictional NPC or creature that appears must be registry-backed. Registry membership
  and scene presence are separate persisted facts. Only present, living registry actors may act,
  classify, appear in the party strip, or enter narrator hard-state context.
- Scenery, murals, statues, background crowds, and quantifier nouns such as "Nothing" or
  "Something" are not characters.
- DM rulings render before the first narrator delta. Prose may dramatize but cannot quote internal
  dice/DC arithmetic or assert death unless hard state reached the lethal threshold and the ruling
  reports `causedDeathOf`.
- Two player actions/strikes remain legal when the configured player budget is two. NPC actions use
  a separate budget.
- Hard-state transitions and narration commit atomically. Narrator prose never creates characters
  or invents mechanics.
- Accepted card/persona source is authoritative for identity, mechanics, and attached-source
  carried starting gear. Model output cannot rename accepted concepts or add unverified inventory.
- Do not add encounter gating to NPC planning until an authoritative encounter-active fact exists;
  combat-ruling heuristics would incorrectly suppress accepted non-combat agency.

## Implemented work

- Tasks 1-2: authoritative registry/presence split, presence-only consumers, checkpoint pre-images,
  ruling-before-stream ordering, and prevention/migration cleanup of quantifier phantoms.
- Tasks 3-4 (`350f805`): bounded validated NPC introduce/enter/leave stage before classification;
  player actor/target normalization; legal two-action turns; engine-owned default attack damage;
  death only when the lethal resource reaches zero; natural authority-safe fallback prose.
- Task 5 (`04e83b7`): validated goal-driven present NPC actions under a separate budget.
- Task 6 (`b753de3`): deterministic sealed non-combat provocation.
- Tasks 7-8 (`fccab2c`, `09da205`): provider-to-Play streaming and progressively verified
  mechanical beat release without exposing unaudited authority contradictions.
- Tasks 9a-9b (`2b43325`, `a803f76`): bounded classifier/introduction/planner/narrator/audit stages,
  deterministic fallbacks, durable latency/outcome metrics, and immediate cancellation even when a
  provider ignores abort.
- Task 10 (`a2656e4`): Gemini Flash responsive narrator default, Opus quality option, and bridge/
  Role Matrix recommendation parity.
- Task 11 (`80e3b44`): bounded, durable, resumable Forge with safe checkpoint replacement and
  native/browser parity.
- Task 12 (`b348f83`): macro-safe literal V2/V3 card acceptance, raw-source preservation, refreshed
  mechanics, and deterministically verified carried/worn starting gear.
- Task 13 (`3ebd58d`, `e0f210d`, `6dab752`, `75dfe6c`): absent-character suggestion rejection,
  lorebook draft retry, hierarchy acceptance, selected-character drill-in, and safe rulebook
  regeneration recovery.
- Task 14 (`f1d8a4a`): warning-free and warning-guarded React test lifecycle.
- Task 15 source gate (`4237735`): genuine 100% configured engine coverage, including equipment,
  loot, progression, advancement, gates, ledger, resolver, natural-roll, deception, and unknown
  action boundaries.

Ordinary narrator/provider failure completes the turn using deterministic safe prose. Approved
staged NPC transitions therefore commit with that successful fallback turn. Genuine cancellation
or a truly failed operation still leaves no partial exchange or registry mutation.

## Exact remaining work

Do not begin a new source feature. The single remaining Internal Beta action is the human's
visual/provider-backed packaged acceptance pass using the NSIS installer:

1. create a premise story and import a card story;
2. play a consequential two-action turn and confirm both ruling cards appear before prose;
3. meet and attack a newly introduced creature, confirming the correct registry/presence row,
   separate NPC response, natural narrator prose, authoritative health loss, and death only at zero;
4. close the app, reopen it, and continue the same story with transcript/rulings/hard state intact;
5. verify Forge resume/retry, grounded suggestions, macro resolution, cross-card starting gear, and
   the full Role Matrix provider/model/sampler controls.

Automated tests already cover every corresponding deterministic contract, including real-file
SQLite close/reopen. The packaged startup smoke only proves initialization; it does not prove visual
or live-provider behavior. Do not check detailed-plan Task 15 Steps 2, 3, or 5 without the human's
observations. If they report a defect, preserve their screenshot/context, reproduce it with a
focused failing test, implement the smallest authority-safe fix, rerun typecheck/tests/coverage/
direct builds/cargo check, rebuild v0.2.8 artifacts, update hashes, and repeat the affected packaged
acceptance step.

If the human confirms the entire pass is green, append the result to `docs/WORKLOG.md`, check Task 15
Steps 2, 3, and 5, mark the Internal-Beta exit criteria complete in
`Plan/next-phase-internal-beta.md`, overwrite `docs/HANDOFF.md` with the next human-approved phase,
and commit the docs. Do not start Task 16 automatically.

Before every stop: keep tests green, create coherent commits with the required Co-Authored-By
trailer, tick only evidenced checklist items, append `docs/WORKLOG.md`, overwrite `docs/HANDOFF.md`
with one next action, and refresh this prompt with the actual current commit, verification counts,
semantic decisions, artifacts, and remaining work.
