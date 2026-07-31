# HANDOFF - current live state

**Updated:** 2026-07-31
**Branch / source HEAD:** `main` at `4237735` before the following docs-only closeout commit; local,
not pushed
**App version:** `0.2.8`, unsigned
**User-owned/untracked:** `.codex/`, `opencode.json` - preserve
**Active plan:** `Plan/next-phase-internal-beta.md`
**Detailed plan:** `docs/superpowers/plans/2026-07-29-internal-beta-completion.md`

## Current outcome

All planned source changes through Task 15's automated gate are complete. The interrupted desktop
turn did not corrupt the build: no cargo/tauri/installer process remained, all three release
artifacts existed with the expected 2026-07-31 timestamps, and the packaged release stayed alive
for an isolated eight-second startup smoke test. Do not repeat the expensive package build unless a
later source change invalidates these artifacts.

Internal Beta is not being overclaimed. Automated evidence is green, but detailed-plan Task 15
Steps 2, 3, and 5 remain partial until the human completes the visual/provider-backed packaged
journey. Task 16 signing/updater/CSP is later work and remains out of scope.

## Fresh verification

- `npm run typecheck`: passed in **12.351 s**.
- `npm test`: core **546/42 files** + UI **147/25 files** = **693 tests**, passed in **20.616 s**.
- UI suite stderr is clean; React `act(...)` warning guards remain active.
- `npm --workspace @midnight-tavern/core run coverage`: **100% statements, branches, functions,
  and lines** across configured engine files; 546 tests passed in **11.615 s**.
- Direct core build: passed in **4.123 s**.
- Direct UI production build: passed in **8.067 s**.
- `cargo check`: passed; cargo duration **3.76 s**.
- Root packaging flow: passed and reported both Windows bundles complete. The interrupted turn did
  not retain a trustworthy total packaging duration, so no duration is invented here.
- Packaged release smoke: isolated profile, alive after **8 seconds**, then only that newly launched
  process was stopped. The user's already-running installed app was not touched.

## Unsigned v0.2.8 artifacts

- Portable release executable:
  `packages/shell/src-tauri/target/release/midnight-tavern.exe`
  - 22,791,168 bytes
  - SHA-256 `F2BE3989C2CF57611EADF31D841E3A1EE197E832D3927F9E3E8B6E8B7584D36F`
- MSI:
  `packages/shell/src-tauri/target/release/bundle/msi/Midnight Tavern_0.2.8_x64_en-US.msi`
  - 9,261,056 bytes
  - SHA-256 `077504A87FC1A76FCFFDBE99820589503692ECC84C93ABB6330F900D1780F661`
- NSIS installer:
  `packages/shell/src-tauri/target/release/bundle/nsis/Midnight Tavern_0.2.8_x64-setup.exe`
  - 5,614,826 bytes
  - SHA-256 `74E258DDCF878D40022E9EC3B7BD54618AED12BDFAA859541FA7897E2196E7BA`

These are unsigned internal-beta artifacts. Windows reputation warnings are expected until Task 16.

## What just landed - Task 15 source gate (`4237735`)

The configured core coverage command initially exposed real untested engine branches despite the
ordinary suite being green. Deterministic tests now cover equipment/loot boundaries, sparse
progression fallbacks, attribute advancement guards, item-enabled action gates, explicit XP ledger
behavior, resolver attribute/equipment/opposed-roll effects, natural-roll precedence, deception,
and unknown action labels. Two provably unreachable branches were simplified without changing the
public contract. The configured engine coverage gate is now genuinely 100% in all four dimensions.

## Runtime foundation complete

1. Tasks 1-2: authoritative registry/presence split, rollback pre-images, ruling-before-prose,
   quantifier phantom cleanup.
2. Tasks 3-4 (`350f805`): bounded NPC introduction/presence, actor normalization, legal two-action
   turns, default attack damage, health-threshold death, natural authority fallback.
3. Task 5 (`04e83b7`): validated same-turn goal-driven NPC actions under a separate budget.
4. Task 6 (`b753de3`): sealed non-combat provocation.
5. Tasks 7-8 (`fccab2c`, `09da205`): provider-to-Play streaming and verified mechanical beat release.
6. Tasks 9a-9b (`2b43325`, `a803f76`): bounded provider stages, deterministic fallbacks, durable
   latency/outcome metrics, and immediate cancellation.
7. Task 10 (`a2656e4`): responsive Gemini Flash narrator default with explicit fast/quality labels.
8. Task 11 (`80e3b44`): bounded, durable, resumable Forge.
9. Task 12 (`b348f83`): macro-safe card acceptance and source-authoritative starting gear.
10. Task 13 (`3ebd58d` through `75dfe6c`): grounded suggestions and product recovery/navigation.
11. Task 14 (`f1d8a4a`): warning-free, warning-guarded React test lifecycle.
12. Task 15 source gate (`4237735`): 100% configured engine coverage and unsigned beta packages.

## Non-negotiable product and authority rules

- Engine/DM owns gates, dice, effects, damage, death, budgets, loot, progression, and persistence.
- Models may propose identity/intent and write prose but may not mutate or contradict hard state.
- Every actual fictional NPC or creature must be registry-backed. Ambient scenery, murals, statues,
  background crowds, "Nothing," and "Something" are not characters.
- Registry membership and scene presence are separate. Only present, living actors participate.
- Rulings render before narrator streaming. Prose may dramatize but may not quote internal dice/DC
  boilerplate or assert death without an authoritative `causedDeathOf`.
- Two player actions remain legal when the configured player budget is two. NPC budget is separate.
- Do not add NPC encounter gating until an authoritative encounter-active fact exists.
- Preserved card/persona source is authoritative for accepted identity/mechanics and attached-source
  starting possessions; model output cannot rename accepted concepts or add unverified inventory.

## Evidence boundary

Automated tests directly cover real-file SQLite close/reopen persistence, story create/import paths,
playthrough and history synchronization, NPC registration/presence/agency, ruling-before-delta and
safe progressive narration, Forge persistence/resume/retry, grounded suggestions, macros, literal
cross-card acceptance, and source-authoritative starting gear. The package-start smoke proves the
release executable initializes, but it does not substitute for human visual/provider-backed use.

## Single next action

Use the NSIS installer above for one packaged human acceptance pass, recording screenshots or notes:

1. create a premise story and import a card story;
2. play a consequential two-action turn and confirm both rulings appear before prose;
3. meet and attack a newly introduced creature, confirming the correct registry/presence row,
   separate NPC response, natural prose, health damage, and death only at zero health;
4. close the app, reopen it, and continue the same story without transcript/ruling/state drift;
5. verify Forge resume/retry, suggestions, macros, cross-card gear, and Role Matrix provider/model/
   sampler controls;
6. append the observed result to `docs/WORKLOG.md`; if green, check Task 15 Steps 2, 3, and 5 and
   mark the Internal-Beta exit criteria complete. If any defect appears, preserve screenshots and
   add a focused failing test before changing runtime code.

Do not start Task 16 signing/updater/CSP until this acceptance pass is recorded and the human asks
to enter the later release phase.
