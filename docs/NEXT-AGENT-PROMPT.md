# Copy-paste prompt for the next coding agent

Continue Midnight Tavern in `C:\Users\anuji\Documents\midnight-tavern-app`.

You are the engineering manager and hands-on implementation agent. Continue autonomously and
sequentially; do not ask the human to decide TypeScript architecture. Do not push. Preserve
untracked `.codex/` and `opencode.json`.

First read, in full: `AGENTS.md`, `docs/HANDOFF.md`, newest `docs/WORKLOG.md`,
`Plan/next-phase-internal-beta.md`, and
`docs/superpowers/plans/2026-07-29-internal-beta-completion.md`. Use codebase-memory-mcp first for
code discovery and re-index if stale. Run `npm run typecheck` and `npm test` before editing.

Current runtime HEAD is `350f805` on local `main` (plus a following docs-only handoff commit). Fresh
verification is 494 core + 137 UI = 631 tests and clean typecheck. Seven known React `act(...)`
warnings remain. App version is unsigned 0.2.8. The user explicitly said not to build an installer
yet; package only after all remaining Internal Beta work is complete.

Critical product rules:

- Deterministic engine/DM owns gates, dice, effects, damage, death, budgets, loot, progression, and
  persistence. Models only propose/classify/write prose.
- Every real NPC/creature in fiction belongs in the registry. Only present, living registry actors
  may classify, act, or appear in active narrator context. Ambient depictions are not actors.
- Rulings appear before prose. Prose cannot quote internal ruling arithmetic or declare death unless
  hard state actually reached the lethal threshold and the ruling reports `causedDeathOf`.
- Two player actions are allowed when the configured player action budget is two. NPC budgets are
  separate.

What just landed:

- `npcIntroduction.ts` performs one bounded structured introduce/enter/leave proposal and
  deterministic grounding/template/name validation.
- Approved transitions are staged before classification/narration and committed atomically. A
  failed narrator leaves no proposed row. Post-narration prose can no longer create registry rows;
  the old recognizer is only pre-classification historical catch-up.
- Player-intent actor is forced to the sole present player; reversed NPC/player actor-target output
  is corrected. This fixes the live case where an older `Dead man` was made actor because the current
  creature was undocumented.
- Universal actions config v2 adds fallback target HP damage (`-4` success, `-8` crit) to
  mechanically empty melee/ranged actions, including old persisted full-stat stories at runtime.
  Explicit action damage is preserved.
- The ledger already marks death at lethal resource `<= 0` (clamped to zero). Authority guard now
  rejects narrator kill/death claims without `causedDeathOf`.
- Ruling fallback prose is natural, not duplicated dice/DC boilerplate. Denied UI cards identify
  their actor.

Start with detailed-plan Task 5: write RED tests for a present living NPC choosing aid, flee,
surrender, converse, or exploit-opening behavior on a non-combat player turn. Keep obvious
counter/flee/surrender deterministic. Use at most one small bounded structured request for ambiguous
goal-driven choices, restricted to sealed actions, present targets, existing items/skills, and a
separate NPC encounter budget. Timeout, malformed output, invalid IDs, dead/absent actors, or failed
gates must become no NPC action without blocking narration. Then implement the smallest correct
slice, run focused tests, typecheck, and full tests, and commit.

Continue in order through Tasks 6–15: non-combat provocation; end-to-end safe-streaming proof;
verified mechanical-beat streaming; stage deadlines/telemetry; responsive model defaults; resumable
Forge; card/persona/starting-gear and UX acceptance; warning cleanup; full Internal Beta packaged
acceptance. Do not start Task 16 signing/updater/CSP.

Before stopping, always: run fresh verification, make coherent commits with
`Co-Authored-By: Codex <noreply@openai.com>`, tick the plan, append WORKLOG, overwrite HANDOFF with
one next action, and update this prompt. Only after Tasks 5–15 are complete and green should you build
the installer and provide its exact path and SHA-256 to the human.
