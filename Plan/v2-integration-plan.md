> **DECOMMISSIONED 2026-08-12 - reference only, not a task list.**
> Every plan written before 2026-08-12 is retired by owner decision; anything here that had not
> already shipped by that date is **cancelled**, not deferred. Do not resume or cite this document
> as a reason to do work. See [`docs/PLAN-POLICY.md`](../docs/PLAN-POLICY.md).
> Behaviour this plan already produced is unaffected and stays defended by the test suite.

# V2 Integration Plan — Batch 2 on top of the shipped V1

Source specs: `Plan/low-level-plan-v2.md` (behavior/data — authoritative) + `Design/handoff-v2/`
(look/copy/motion — authoritative). Building on the completed V1 (all 30 tracked tasks done).

## Ground truth: what already exists vs. what V2 needs

**Core present:** `router/{roles,router,structured,providers}`, `memory/{analyzer,cardView,softStore,prompt}`,
`orchestrator/{context,turn}`, one migration (`001_init`, embedded in `db.ts` — no filesystem at runtime),
v1 per-story `lorebook` table + repo, global `personas` table, async Store + SQLite driver + CoreBridge façade.

**Core missing (new modules):** `router/modelCatalog.ts(+json)`, `router/recommend.ts`, `router/samplers.ts`,
`memory/lorebook.ts` (global rewrite), `orchestrator/swipe.ts`, `orchestrator/delete.ts`.

**DB missing:** migrations 002 (global lorebooks + m2m), 003 (`stories.active_persona_id`),
004 (`turn_checkpoints` + `messages.variants_json/active_variant`). All added as embedded `MIGRATIONS[]` entries.

**UI missing screens:** `CharacterDossier`, `RoleMatrix` (also embedded in Settings + Wizard step 3),
`StoryBlueprint`. Plus upgrades to Play (message actions), Lorebook (library view), StorySettings (attach panels),
Settings + Wizard (RoleMatrix), Personas/CardCreator split.

**Bridge:** every feature needs new CoreBridge methods + parallel impls in BOTH backends (memory stub + sqliteBridge).

## Sequencing decision
Commit the current uncommitted session work FIRST (bridge façade, randomUUID fix, Tauri driver) as its own
reviewed baseline — V2 is large and should not pile onto an unreviewed diff. Then build V2 in dependency order.

## Phases (each ends green: build + tests + typecheck)

**Phase 0 — commit baseline.** Focused commits of current work. No new code.

**Phase 1 — Model config spine (v2 points 1,5,8).** `samplers.ts` (full SamplerProfile + role presets),
`modelCatalog.ts(+json)`, `recommend.ts` (`modelsForRole`, `defaultAssignmentFor`); extend `RoleBinding` with
`source` + `samplersDirty`; widen `SamplersSchema`. Rename role → **Story AI** everywhere. Bridge: catalog +
recommend methods. UI: `RoleMatrixRow`, `SamplerPanel` components + `RoleMatrix` screen; embed in Settings + Wizard.
Guardrail: json-mode-risk warning (non-blocking). No engine change.

**Phase 2 — Blueprint + prompt-authority guardrail (point 3).** Blueprint record/fields; map into soft identity +
narrator STYLE slot. Edit `context.ts`/narrator builder so the framework authority clause is composed LAST,
after user systemPrompt/postHistory. **Blocking test:** authority clause present + last for every narrator call,
any blueprint. `StoryBlueprint` screen + Library/import/dossier entry points.

**Phase 3 — Global lorebooks (point 2).** Migration 002 replaces the v1 per-story `lorebook` table with global
`lorebooks` + `lorebook_entries` + `story_lorebooks` m2m. **Decision: fresh schema, NO data-copy logic** (no
shipped DBs pre-release) — drop/replace cleanly. Rewrite `memory/lorebook.ts` (global CRUD, attach/detach,
`listAttached`). Update context lorebook step to scan all attached+enabled lorebooks + always_on. Card-import
tie-in (`character_book` → lorebook + auto-attach). Bridge rewrite. UI: Lorebook library view + StorySettings attach panel.

**Phase 4 — Persona attach (point 4).** Migration 003. `setActiveForStory`/`getActivePersona`. Context persona
slot resolves via active persona. UI: persona picker in new-story overlay + StorySettings row.

**Phase 5 — Swipe/delete/rewind (point 6) — the risky one.** Migration 004. Write `turn_checkpoints` pre-images
INSIDE the existing per-turn commit transaction in `turn.ts`. `orchestrator/swipe.ts` (regenerate telling, never
re-roll; restore soft/world pre-image, re-run narrator+analyzer, append variant) and `delete.ts` (delete-last =
full checkpoint restore + summary rebuild; rewind = restore-before + truncate). **Blocking tests** per §6.
UI: MessageActions cluster (swipe counter, locked-die glyph, ⋯ menu, rewind-confirm).

**Phase 6 — Character dossier (point 7).** `getCharacterDossier` in `cardView.ts` (hard+soft join + reverse
relationships). Bridge method. `CharacterDossier` screen; reachable from roster + Play drawer. Pure read model.

**Phase 7 — DesignSystem specimens + final cross-cutting verification.**

## Non-negotiable guardrails (carried from spec)
- Dice never re-rolled on swipe; hard state byte-identical across variants.
- Analyzer never touches mechanical state; framework authority clause always last in narrator frame.
- Rulebook frozen at forge time; blueprint edits affect only future narration style/identity.
- Every bridge method implemented in BOTH backends. Core stays webview-portable (no `node:` builtins on store path).

## Decisions (locked with user)
- **Scope:** build all phases (0–7) autonomously; check in at phase boundaries or real blockers.
- **Migration 002:** fresh schema, no v1 data-copy logic (no shipped DBs pre-release).
- **New screens:** hand-port markup/styles/copy from `Design/handoff-v2/screens/*.dc.html` into React, matching V1 screen conventions.
