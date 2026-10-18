# HANDOFF - current live state

**Updated:** 2026-10-18 (first Windows build of plans 08 + 09: **v0.3.0 built, installed and launched**
on the owner's freshly formatted machine; see the 2026-10-18 WORKLOG entry)
**Branch / source baseline:** `main` + this session's branch
`claude/multi-agent-architecture-windows-build-4dbd11` (icons, version bump, docs — no logic change).
The owner authorized pushing completed steps straight to `origin/main` (2026-10-09) and, on 2026-10-18,
granted a standing "make all decisions, no need to wait for permission".
**App version:** `0.3.0` — the first installer containing plans 08 + 09. Unsigned. Installed per-user at
`%LOCALAPPDATA%\Midnight Tavern`; data at `%APPDATA%\com.midnighttavern.app` (fresh DB, migrations 1–18,
no stories yet, no provider configured).

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
- **Live authority gap A1:** the loot model may set `sourceType: "quest"` (`orchestrator/loot.ts:40`);
  with any successful ruling that makes the award milestone-authorized with a `legendary` ceiling
  (`loot.ts:223-225`). A model label alone unlocks legendary loot. Not fixed — minimal standalone fix
  (drop `"quest"` from the model-facing enum, plus a RED test) recommended in plan 10 §1.2.1.
- **A2:** committing any `quest`/`milestone`-labelled award journals a `milestone` event
  (`turn.ts:1271-1286`), after which `milestoneEvents.length > 0` (`loot.ts:197-200`) milestone-authorizes
  every later such award in the story. Fix is in plan 10 §5.6 (D14).
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
ineligible until its §0 gate closes. Optional and small: approve the standalone A1 fix (plan 10 §1.2.1).
