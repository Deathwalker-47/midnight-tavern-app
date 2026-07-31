# Copy-paste prompt for the next coding agent

Continue Midnight Tavern in `C:\Users\anuji\Documents\midnight-tavern-app`.

Act as the engineering manager and hands-on implementation agent. Work autonomously and
sequentially; this repository forbids parallel coding agents. Do not ask the human to choose
TypeScript architecture. Do not push. Preserve the user-owned untracked `.codex/` directory and
`opencode.json`.

Start by reading, in full:

1. `AGENTS.md`
2. `docs/HANDOFF.md`
3. the newest relevant entries in `docs/WORKLOG.md`
4. `Plan/next-phase-internal-beta.md`, especially Task 15A
5. `docs/superpowers/plans/2026-07-31-packaged-beta-remediation.md`

Use codebase-memory-mcp before text search for code discovery and re-index if structural symbols
are stale. Run `npm run typecheck` and `npm test` before source edits unless HANDOFF records a fresh
green baseline from the same uninterrupted logical task. Use strict red -> observe failure ->
minimal implementation -> green TDD. Before claiming completion, follow
verification-before-completion. Every PowerShell command must begin with explicit
`Set-Location -LiteralPath 'C:\Users\anuji\Documents\midnight-tavern-app'`; the desktop working-folder
hint is known to be ignored.

## Current state

The branch is local `main` at source commit `3b0a05e` before the current documentation closeout. It
is not pushed. The app is unsigned v0.2.8. The previous automated Internal Beta gate passed, but the human's
first provider-backed packaged pass found seven source defects. The old package is stale for these
fixes. The human explicitly asked not to build another installer until all fixes are done.

Fresh pre-remediation baseline on 2026-07-31:

- typecheck passed;
- core 546 tests in 42 files and UI 147 tests in 25 files = 693 tests passed;
- only `.codex/` and `opencode.json` were untracked before the new docs;
- earlier configured core coverage was 100% statements/branches/functions/lines;
- direct core/UI builds and `cargo check` passed;
- the earlier unsigned v0.2.8 package built and started, but does not contain Task 15A.

## What the human observed

1. The automatic chapter summary is squeezed into the left timeline while the static premise owns
   the large Overview pane.
2. Every Character page shows the same global “Story so far”; Mentality is empty and Mood,
   Location, or Goal are empty for several characters, especially the player.
3. Cancelling Forge leaves the user unable to start a truly new Forge.
4. Possible Moves are consistently unavailable.
5. Play sometimes jumps to the transcript start and requires manual scrolling back.
6. “Attack it again” produced a provider error plus unresolved target while both an older Dead man
   and the current `shadow_entity` were present.
7. The current hostile creature does not attack independently.

## Confirmed causes

- `packages/ui/src/screens/Overview.tsx`: when chapters exist but no arc exists, the large pane uses
  premise fallback while chapter summaries remain only in `ChapterCard` timeline entries.
- `packages/core/src/memory/dossier.ts::getCharacterDossier`: `storySummary` is the latest global arc
  plot summary or last three global chapter summaries, so all characters share it.
- `packages/core/src/orchestrator/turn.ts::runBackground`: analyzer input maps only `character.soft`
  and filters undefined records. Bootstrap player and NPC introduction paths can create hard-only
  character records.
- `packages/ui/src/screens/StoryBlueprint.tsx::forgeStory`: any retained operation forces reuse of
  its request, operation id, start time, and checkpoint. Cancellation keeps it by design; discard is
  not an awaited atomic fresh-start transition.
- `packages/core/src/orchestrator/suggestions.ts::suggestPlayerActions`: exact structured output is
  required after bounded repair; any final failure throws. Packaged logs showed HTTP 429 and
  malformed tiny classifier responses.
- Target continuity is fixed at `3b0a05e`: the orchestrator derives at most one focus from the
  newest recent authoritative player ruling, validates that it remains present and alive, and
  classifier recovery uses it only for continuation wording when no explicit name switches target.
- `packages/core/src/orchestrator/npcAgency.ts::planNpcActions`: provider errors return `[]`.
  `planNpcReactions` is deterministic but requires an already resolved provocation. No persisted,
  validated hostility fact supports safe autonomous fallback.
- `packages/ui/src/screens/Play.tsx`: follow/latest intent is based chiefly on delayed React state;
  content/layout height changes are not robustly anchored.

The packaged provider was rate limited (HTTP 429). Treat this honestly as external degradation,
but make safe local fallbacks work. Never fake a successful model call.

## Dependency-ordered implementation

Follow `docs/superpowers/plans/2026-07-31-packaged-beta-remediation.md` exactly, one coherent commit
per slice:

1. **Forge lifecycle - complete.** RED tests proved cancel/retained state had no Start-new action.
   Fresh start now waits for queued writes, clears exactly the retained operation id, and only then
   uses a new story/operation id with no resume checkpoint. The UI exposes **Resume saved Forge** and
   **Start new Forge**; clear failure blocks replacement visibly. Focused 8/8, UI 149, core 546,
   total 695, and typecheck pass.
   The original task was: add RED tests for cancel -> Start new Forge using a new story/operation id
   without a resume checkpoint and for the durable-clear race. Implement explicit **Resume saved
   Forge** and **Start new Forge** choices plus awaited id-safe clearing.
2. **Character memory/dossiers - complete at `2032832`.** Every registry insertion now receives a
   primary player or secondary NPC soft envelope, and completed turns repair legacy present rows
   before analysis. Analyzer ops are restricted to the supplied present registry ids; unknown,
   non-present, cross-story, and unknown relationship targets cannot create or alter characters.
   **Character history** now uses only that character's backstory, observations, and authoritative
   actor/target events, with honest **Not observed yet** states. Focused core 67/5, focused UI 2/1,
   complete core 550/43 and UI 150/25 (700 total), and typecheck passed.
3. **Attack target continuity - complete at `3b0a05e`.** The newest recent authoritative player
   ruling may supply one present living non-player focus for pronoun/continuation recovery. Explicit
   names override; dead, absent, stale, unknown, or multi-target focus fails closed. Focused suites
   passed 80/3; complete core 558/44 and UI 150/25 (708 total), and typecheck passed.
4. **Possible Moves fallback.** On provider error/malformed final output, return five unique
   scene-grounded deterministic suggestions using committed scene anchors, present living registry
   names, and legal sealed labels. Never invent items/skills or pre-assert success. Caller abort
   remains abort. Suggestions remain insert-only and receive normal rulings when sent.
5. **Independent hostile NPC agency.** Extend bounded NPC introduction with a small disposition
   contract, validate explicit hostility before persisting an engine-owned fact, and use that fact
   to choose a legal sealed damaging action if the planner provider degrades. Route through normal
   gate/resolver/ruling/state. Test neutral/dead/absent/no-action/budget/rollback negatives. Combine
   reaction and goal spending under one NPC per-turn budget.
6. **Scroll anchoring.** Test initial/latest, near-bottom streaming, historical reading, drawer and
   layout growth, and Jump to latest. Track follow mode synchronously and preserve the exact reader
   viewport while not following.
7. **Overview hierarchy.** Test no chapter, chapters without arc, and closed arc. Latest/selected
   automatic chapter summary is primary until arc synthesis exists; premise becomes compact context.
8. **Final gate/package.** Typecheck, all tests, configured coverage, direct core/UI builds, cargo
   check, codebase-memory re-index, baton docs, then one unsigned package build and refreshed hashes.

## Non-negotiable authority rules

- Engine/DM owns gates, dice, effects, damage, death, budgets, target legality, loot, progression,
  persistence, and rollback. Models propose identity/intent and write prose only.
- Every actual fictional NPC/creature must be registry-backed. Scenery, murals, statues, background
  crowds, “Nothing,” and “Something” are not characters.
- Registry membership and scene presence are separate. Only present, living actors participate.
- Rulings render before narrator streaming. Narration cannot assert death unless health reaches the
  lethal threshold and the ruling reports `causedDeathOf`.
- Two player strikes remain legal under a two-action player budget. NPC budget is separate.
- Pronoun focus may reuse only one unique recent present living target; never list order.
- Provider degradation may reduce variety but must not disable safe affordances or proven hostile
  behavior. Fallbacks cannot invent mechanics.
- Browser/native bridge parity is mandatory. Keep native/`node:` imports out of the webview path.
- Hard-state, registry, presence, hostility, and narration transitions must remain atomic and
  rollback-safe.

## Exact next action

Do only detailed-plan Task 4 next. Add RED tests for provider error, malformed output after bounded
repairs, caller abort, absent/dead characters, an empty sealed action catalog, and sparse committed
scene context. When safe context exists, return five unique deterministic fallback suggestions
using only recent committed scene anchors, present living registry names, and legal sealed action
labels. Never invent items or skills, mention absent/dead characters, or pre-assert success. Abort
must remain abort. Suggestions remain insert-only, so sending one still passes through normal
classification, gates, rulings, effects, and budgets. Run focused suggestion/bridge/Play suites,
typecheck, and all tests before committing. Update the active plan, append WORKLOG, overwrite
HANDOFF, and refresh this prompt with the actual commit and one next task.

Do not mix hostility, scroll, Overview, or packaging into the Possible Moves commit.
Do not build an installer yet. Do not start Task 16.

Before every stop: keep tests green, make coherent commits with the required Co-Authored-By trailer,
tick only evidenced checklist items, append `docs/WORKLOG.md`, overwrite `docs/HANDOFF.md` with one
next action, and refresh this prompt with actual commits, verification, semantic decisions, and
remaining work.
