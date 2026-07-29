# HANDOFF - current live state

**Updated:** 2026-07-29
**Branch / runtime HEAD:** `main` at `b348f83` before the following docs commit; local, not pushed
**App version:** `0.2.8`, unsigned
**User-owned/untracked:** `.codex/`, `opencode.json` - preserve
**Active plan:** `Plan/next-phase-internal-beta.md`
**Detailed plan:** `docs/superpowers/plans/2026-07-29-internal-beta-completion.md`

## Fresh verification

- `npm run typecheck`: passed.
- `npm test`: core 527/42 files + UI 144/25 files = **671 tests**, passed.
- Direct core/UI production builds and `cargo check`: passed.
- Known noise: seven existing React `act(...)` warnings, reserved for Task 14.
- No installer was produced. Do not run the root build/package flow until Task 15.

## What just landed - Task 12 (`b348f83`)

Card imports now retain identity and only install possessions actually established by their source:

- three literal V2/V3 card/persona fixtures cover supported macros, typed attribute names/scores,
  exact multi-word possessions, scenery decoys, model-proposed decoys, and source immutability;
- persona/card macros are reevaluated immediately before Forge prompts, including accepted mechanics
  that would otherwise reuse stale import-preview substitutions;
- raw card/persona data remains unexpanded in the creation snapshot for future regeneration;
- transient resolved prose reaches actor-foundation prompts and deterministic gear installation;
- multi-word and possessive names such as `Saint Orra Compass`, `Moon-Eater Blade`,
  `Ash-Warden's Ring`, `Vesper Key Dagger`, and `Blue Glass Amulet` survive exactly;
- only carried/wielded/worn/kept/holstered/strapped/packed gear is installed from attached sources;
  room displays, racks, generic ownership wording, and unverified model additions are excluded;
- premise-only Forge can still use bounded actor-foundation gear, while an empty verified source gets
  neutral basic personal effects.

RED evidence captured stale `{{user}}` mechanics, genericized named gear, incorrect apostrophe
capitalization, and a museum-display sword entering player inventory.

## Runtime foundation already complete

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
- Preserved card/persona source is the authority for accepted identity/mechanics and attached-source
  starting possessions; model output cannot rename accepted concepts or add unverified inventory.

## Remaining ordered work

1. Task 13: remaining product/UX acceptance and bridge parity.
2. Task 14: eliminate all seven React `act(...)` warnings.
3. Task 15: full Internal Beta gate, packaged manual acceptance, then create the final installer.
4. Task 16 signing/updater/CSP remains later and out of scope.

## Single next action

Start detailed-plan **Task 13** test-first. Independently pin and inspect:

1. suggestions grounded in the current scene and legal sealed actions;
2. retry/regenerate preserving the user's draft and visible recovery context;
3. lorebook hierarchy and parent/child navigation;
4. Characters -> dossier -> loadout navigation with the correct character selected;
5. Story Settings rulebook regeneration retaining the preserved creation source and installed state
   until full replacement success.

Fix one failing behavior at a time and keep native/browser bridge parity. Run focused suites after
each slice, then full typecheck/tests, direct core/UI build, and update all handoffs. Do not build an
installer yet.
