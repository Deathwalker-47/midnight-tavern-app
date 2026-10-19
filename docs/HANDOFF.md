# HANDOFF - current live state

**Updated:** 2026-10-19 (**A1's twin closed** on `main`, `34e2cfb`: the loot model can no longer label its
award `milestone`, so legendary loot waits for plan 10. That was the owner's decision. Earlier, on
2026-10-18: first Windows build of plans 08 + 09, **v0.3.0**, installed and launched on the owner's
freshly formatted machine; **A1 closed**, `39e8d72`. See the WORKLOG entries for both dates.)
**Branch / source baseline:** `main`. The owner authorized pushing completed steps straight to
`origin/main` (2026-10-09), restated on 2026-10-18: **push to `main`, no PR** — and granted a standing
"make all decisions, no need to wait for permission". Push after each step.
**App version:** `0.3.0` — the first installer containing plans 08 + 09. Unsigned. Installed per-user at
`%LOCALAPPDATA%\Midnight Tavern`; data at `%APPDATA%\com.midnighttavern.app` (fresh DB, migrations 1–18,
no stories yet, no provider configured). The installed build **predates the A1 fix and its twin** (loot-schema
changes, no migration); the next build picks them up.

**Owner's machine was formatted (reported 2026-10-09) and re-provisioned on 2026-10-18.** Lost for good:
the live saves (Cyraeth Adventure, Solo Leveling RPG), the trial-unlock script, local agent tooling, the
owner's taxonomy source files. Now installed: Node 22.23.2, Rust 1.99.1 (rustup, MSVC target), VS 2022
Build Tools (MSVC 14.44 + Windows SDK). No global git identity is set on this machine.

**Active plan:** none. The last one —
[`docs/plans/2026-10-09-plans-08-09-action-plan.md`](plans/2026-10-09-plans-08-09-action-plan.md) — is
complete; its "Outcome" section lists what shipped, what did not, and why. Per AGENTS.md, the next plan
is picked deliberately with the owner.

**Plan 10 (quests)** — [`docs/plans/2026-10-09-10-quests-and-story-director.md`](plans/2026-10-09-10-quests-and-story-director.md)
— written, **not authorized**, and gated by the owner on plans 08 + 09 having zero gaps (its §0, G1–G10).
Gate rows with evidence as of 2026-10-18: **G1 closed**, **G9 closed**, **G10 closed for Node 22**, **G2
build half closed** (reload/restore in the packaged app still to be clicked). G3–G8 remain open.

## Building the Windows installer (verified 2026-10-18)

```bash
npm ci                                   # repo root
cd packages/shell && npm run build:windows
```

This machine's repo lives under OneDrive, so builds set
`CARGO_TARGET_DIR=%LOCALAPPDATA%\midnight-tavern-build\target` (keeps the multi-GB `target/` out of the
synced folder). Bundles then land in `%LOCALAPPDATA%\midnight-tavern-build\target\release\bundle\{msi,nsis}\`.
The icon set is committed now (source `packages/shell/app-icon.svg`, a placeholder mark). Full recipe and
the remaining signing/updater blockers: `packages/shell/RELEASE.md`.

## Planning rules

Every plan written before 2026-08-12 is decommissioned ([`docs/PLAN-POLICY.md`](PLAN-POLICY.md)).
Plans 01-07 and 11-12 of the 2026-08-13 set, and plan 10's 2026-10-09 rewrite (which supersedes
`2026-08-13-10-quests.md`), remain written but **not authorized**. Plan 10 additionally carries the
owner's zero-gap gate on plans 08 and 09 (its §0).

## What plans 08 + 09 shipped (complete — detail in the action plan and WORKLOG S1–S18)

Plan 08: XP repeat curve, resource roles + v3 contract, weapon stamina costs, action cooldowns, timed
statuses, `learn_skill` routing fix, passive / toggle / reaction skills, targeting scopes, recovery
model (`economy.json`, `take_rest`, `consume_item`), the forge emitting v3, and the UI surfacing for all
of it. Plan 09: the universal pool (63 archetypes / 222 entries), per-story enablement (migration 17),
forge-time and mid-story selection, Story Settings catalogue + pool browser, finer item kinds and item
archetypes (migration 18), looted consumables, weapon specials, and user config overrides in
`$APPDATA/config`. Open from those plans: plan 09 §5.4 unmeasured, §7.3 design deliverable, and
acceptance 1 / part of 3 unmet as written because the forge stayed hybrid.

## Verification state

2026-10-18 on Windows 11 / Node 22.23.2: `npm run typecheck` clean; **root** `npm test` green — core
**901 / 68 files**, UI **211 / 32 files** = **1112**; engine coverage **100 %**
(`npx vitest run --coverage` in `packages/core` — not part of `npm test`, run it after any
`src/engine` change); UI production build 457.2 kB / 126.5 kB gzip; `tauri build` clean (no Rust
warnings in the app crate). The Windows/Node 24 tinypool crash (plan 07 P0-0) did not occur on Node 22.
After the A1 fix (same machine): typecheck clean; root `npm test` green — core **903 / 69 files**, UI
**211 / 32 files** = **1114**. After the twin fix (2026-10-19, same machine, on top of the B6/B7/B11 fixes):
typecheck clean; root `npm test` green — core **912 / 69 files**, UI **215 / 33 files** = **1127**. No
`src/engine` change in either fix, so coverage was not re-run.

## Facts established earlier (still true — do not re-derive)

- The classifier's `npcIntents` are merged into resolution at `orchestrator/turn.ts:666` with no
  disposition check (live violation of `CONTEXT.md` invariant 9; plan 02, not authorized).
- Generic NPCs get `attributes: {}` and only lethal resources (`bootstrap/instantiate.ts`); S2 adds mana
  and stamina, plan 05 (not authorized) adds attribute variety.
- `ResourceDef.regenPerScene` exists in rulebooks but nothing applies it; S7's `economy.json` is the
  recovery model now, and `regenPerScene` stays ignored.
- Runtime items live outside hard state and checkpoints. Anything a turn does to them must be recorded
  on its rulings and undone in `orchestrator/history.ts undoRuntimeItemsFromIdx` (loot: `ruling.loot`;
  consumption: `ruling.itemConsumed`). A used-up instance stays at quantity 0 for that reason; rewind does
  not re-equip a slot it held.
- The owner's taxonomy files are **permanently lost**. Engineering authors the pool itself under the
  owner's existing grants — see the action plan.
- Equipment's `resource_capacity` effect is display-only: nothing in the engine applies it (plan 10 G8).
- `store.transaction` queues and does not nest. Code that must write inside a turn's commit uses a
  stage-then-write split (e.g. `stagePoolEnablement` / `writeStagedEnablement`).
- The pool JSON is bundled into the UI (the memory bridge imports it). Fine at 222 entries; at ~3,000
  (~1.5 MB raw) it should be loaded lazily.
- The design deliverable for the Story Settings surfaces (plan 09 §7.3, design brief §5) has not been
  produced; S14 made reasonable calls (see WORKLOG S14) that a designer may revise.
- **Authority gap A1 — CLOSED 2026-10-18 (`39e8d72`, plan 10 §1.2.1):** the loot model could set
  `sourceType: "quest"`, which with any successful ruling made the award milestone-authorized under the
  `legendary` quest ceiling. `"quest"` is now gone from the model-facing enum (`orchestrator/loot.ts:42`);
  `LootSourceTypeSchema` keeps it, so persisted provenance and starting gear still decode. Regression test:
  `packages/core/test/lootSourceAuthority.test.ts`.
- **A1's twin — CLOSED 2026-10-19 (`34e2cfb`, owner decision; plan 10 §1.2.1b):** the `milestone` label
  was just as model-facing. The ruling `milestoneAuthorized` checked was always the last *successful* one,
  so `"milestone"` alone unlocked legendary loot. `"milestone"` is now gone from the model-facing enum too
  (`loot.ts:42`), and `milestoneAuthorized` is a literal `false` for every model award (`loot.ts:232`).
  The adjudicator prompt no longer invites either label and tells the model not to propose legendary or
  mythical items. **Legendary loot is unreachable until plan 10's engine milestones exist (§1.2.2 /
  §5.6.3), as mythical is.** The regression tests are in the same file, now parameterized over both labels.
- **A2 — inert for model loot since 2026-10-19, not redesigned.** Committing a `quest`/`milestone`-labelled
  award still journals a `milestone` event (`turn.ts:1271-1286`, unchanged). But no model award can carry
  either label now, and `loot.ts` no longer reads milestone events. Milestone events already journalled in
  old stories still count as milestone evidence for attribute advancement (`milestoneEvidence`), as
  `chapter_started` events do. The real design (an engine milestone in this turn) is plan 10 §5.6.3 (D14).
- `mythicalAuthorized` is read from `story.configSnapshot.mythicalLootAuthorized`, which **no code
  writes** — mythical loot is unreachable today (fail-closed, correct).
- Flags are per-character hard state (`types/hardState.ts:56`); there is no story-level flag. Locations
  are soft state written by the analyzer, so nothing location-based can be a deterministic condition yet.
- The bundle icons used to be git-ignored and were lost with the old machine; they are committed now.
  Regenerate from `packages/shell/app-icon.svg` with `npx tauri icon` (then delete `android/`, `ios/`).

## Non-negotiable rules

- Models may propose actors, intents, soft state, pool enablement (analyzer only, guarded) and prose.
  The engine owns mechanics, ids, gates, budgets, effects, damage, death, persistence, rollback.
- Hard state is written only by `engine/ledger.ts`; soft state only by the analyzer.
- Bridge parity: every `CoreBridge` method exists and behaves identically in both backends;
  `bridge/core.ts` imports core as TYPES ONLY (plus vetted browser-safe deep imports).
- A story's rulebook is frozen at forge time. The enabled pool set (plan 09) is the one sanctioned,
  checkpointed, journalled way a story's catalogue grows.
- New `CharacterHardState` fields must carry Zod defaults so old checkpoints still decode on rewind.

## Single next action

**The owner play-tests v0.3.0** — it is installed and open on the first-run screen. Connect a provider
(Settings → Role Matrix afterwards to bind roles), forge one fresh **Full Stats** story and play ≥ 2
chapters. Worth trying: Story Settings → Rulebook catalogue / Universal pool / Rulebook config (press
Open, Reload and Restore defaults — closes the rest of G2); drink a looted potion, then rewind; a weapon
special from loot after chapter 1; resting and the living card's Conditions block. Note forge time for
≥ 3 forges if possible (G4). Report findings with screenshots; each becomes a fix or an explicit accept.

Then **choose the next plan**. Recommendation unchanged: **02 (classifier fidelity)** — the owner's own
P0 — then 06 (narration integrity); 04 (character panels) if visible UI work is preferred. Plan 10 stays
ineligible until its §0 gate closes.

**A1 and its twin are both closed** (2026-10-18 / 2026-10-19). Once the next build is installed, **expect
no legendary loot**: `rare` is the ceiling for every awarded item until plan 10. That is by design, not a
bug to report. The installed v0.3.0 still predates both fixes.
