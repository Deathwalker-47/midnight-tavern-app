# Copy-paste prompt for the next coding agent

Continue Midnight Tavern in `C:\Users\anuji\Documents\midnight-tavern-app`.

Act as the engineering manager and hands-on implementation agent. Work autonomously and
sequentially; this repository forbids parallel coding agents. Do not ask the human to choose
TypeScript architecture. Do not push. Preserve the user-owned untracked `.codex/` directory and
`opencode.json`.

Start by reading, in full:

1. `AGENTS.md`
2. `docs/HANDOFF.md`
3. the newest entries in `docs/WORKLOG.md`
4. `Plan/next-phase-internal-beta.md`, especially completed Task 15A
5. `docs/superpowers/plans/2026-07-31-packaged-beta-remediation.md`

Use codebase-memory-mcp before text search for code discovery and re-index if structural symbols
are stale. Use strict RED -> observe failure -> minimal implementation -> GREEN TDD for any new
defect. Before claiming completion, follow verification-before-completion. Every PowerShell command
must begin with explicit
`Set-Location -LiteralPath 'C:\Users\anuji\Documents\midnight-tavern-app'`; the desktop working-
folder hint is known to be ignored.

## Current repository state

The branch is local `main`; the last source commit is `f6c526b` plus the documentation closeout that
contains this prompt. Nothing is pushed. The app is unsigned v0.2.8. Only `.codex/` and
`opencode.json` should remain untracked. Task 15A's seven source defects are complete and the next
action is human packaged acceptance, not speculative source work. Do not start Task 16 signing,
updater, or CSP work unless the human explicitly requests it.

Fresh final gate on 2026-07-31:

- root typecheck passed;
- core 578 tests / 44 files and UI 156 tests / 25 files = 734 tests passed;
- configured core coverage is 100% statements/branches/functions/lines;
- core/UI production build, Tauri release/package build, and standalone `cargo check` passed;
- codebase memory was re-indexed at 6,207 nodes / 15,714 edges;
- the release executable stayed alive for an isolated eight-second startup smoke.

Fresh NSIS installer for the human:
`packages/shell/src-tauri/target/release/bundle/nsis/Midnight Tavern_0.2.8_x64-setup.exe`

- bytes: 5,619,121
- SHA-256: `AC06D7ED7678A8F4BABBED7DA9F758917D3C699516C7E3E757A7BA4FEFC5B349`

MSI alternative:
`packages/shell/src-tauri/target/release/bundle/msi/Midnight Tavern_0.2.8_x64_en-US.msi`

- bytes: 9,261,056
- SHA-256: `AAC815ADF63B33867022640C020A97BB2151B4BE58E5C66A904CF7C4A3C266BF`

## The seven completed remediation slices

1. **Forge lifecycle (`fab2088`).** A retained Forge exposes both **Resume saved Forge** and **Start
   new Forge**. Fresh start awaits queued writes, clears exactly the retained operation id, and
   creates a new request/operation with no resume checkpoint. Clear failure blocks replacement.
2. **Registry-owned character memory (`2032832`).** Every inserted player/NPC has a soft envelope;
   legacy present rows are repaired before background analysis. Analyzer updates cannot create
   unknown/non-present/cross-story characters. **Character history** uses only the selected
   character's backstory, observations, and authoritative actor/target events. Missing Mentality,
   Mood, Location, and Goal are honestly labeled unobserved.
3. **Recent target continuity (`3b0a05e`).** Pronoun/continuation attacks can reuse only one newest
   authoritative player-ruling target that is still present, living, and non-player. Explicit names
   override; dead, absent, stale, unknown, and multi-target focus fail closed.
4. **Possible Moves degradation (`2c5c738`).** Provider errors or exhausted repair yield five
   deterministic choices only from rich committed scene anchors, present living registry actors,
   and non-combat gate-legal sealed actions. Sparse context yields none, caller abort remains abort,
   and suggestions stay insert-only.
5. **Hostile NPC agency (`ad25b9c`).** Only explicit committed narrator evidence in which one
   unambiguous present living registry actor attacks the player can set the rollback-safe
   `npc_hostile_to_player` hard flag. Planner failure/timeout/empty/invalid/omission gives an eligible
   hostile actor one gate-legal sealed damaging fallback through normal resolver/ruling/state
   authority. Neutral, ambiguous, dead, absent, and action-less cases fail closed; reactions share
   the NPC's one-action budget.
6. **Play anchoring (`a0b5a98`).** Follow-latest intent updates synchronously; React changes anchor
   before paint; bounded resize observation covers measured growth. Historical reading stays fixed
   through streaming/drawer reflow, and **Jump to latest** resumes following.
7. **Overview hierarchy (`f6c526b`).** Latest/selected persisted chapter summary is primary until an
   arc exists. A persisted arc is primary by default afterward, but summarized chapter cards remain
   mouse/keyboard selectable with pressed state and a **Back to current arc** path. The immutable
   premise is compact, separately labeled context. The layout stacks below 760px.

## Non-negotiable architecture and authority

- Engine/DM owns gates, dice, effects, damage, death, budgets, target legality, loot, progression,
  persistence, and rollback. Models propose identity/intent and write prose only.
- Every actual fictional NPC/creature must be registry-backed. Scenery, murals, statues, background
  crowds, "Nothing," and "Something" are not characters.
- Registry membership and scene presence differ. Only present, living actors participate.
- Rulings render before narrator streaming. Narration cannot assert death unless health reaches the
  lethal threshold and the ruling reports `causedDeathOf`.
- Two player strikes are legal under the two-action player budget. NPC budget is separate.
- Provider degradation can reduce variety but cannot invent mechanics, silently claim success, or
  disable a safe deterministic affordance/established hostile behavior.
- Browser and SQLite bridge parity is mandatory. Keep native/`node:` imports out of the webview path.
- Character, presence, hostility, ruling, hard-state, and narration transitions must stay atomic
  and rollback-safe.

The human's provider returned HTTP 429 in the first installed pass. Treat that as external
degradation and report it honestly; do not fake a successful provider call. The deterministic
fallbacks above must still work.

## Exact next action

Ask the human to test the fresh NSIS package, or consume their new test report if one is already
provided. The affected acceptance checklist is:

1. Cancel Forge, separately verify resume and a truly fresh Forge.
2. Exercise initial/latest scroll, historical reading, reflow, and Jump to latest.
3. Open Possible Moves normally and while the provider is degraded.
4. Meet a new creature; verify registry identity/presence and character-specific dossier fields.
5. Attack twice within the player budget, then say "attack it again" with an older NPC present;
   verify the newest living target is selected.
6. Verify the hostile creature independently attacks through a visible ruling and only engine health
   can cause death.
7. Verify Overview chapter-primary/premise-supporting hierarchy before an arc and arc-primary plus
   keyboard chapter drill-down afterward.
8. Close/reopen and confirm persistence.

If a defect is reported, reproduce it against this source/artifact baseline, add a failing test,
fix the smallest authoritative owner, run the proportionate focused tests and full gate, then
append WORKLOG and overwrite HANDOFF/NEXT-AGENT-PROMPT again. If acceptance passes, record that
human evidence and close Internal Beta; do not infer or fabricate a pass.
