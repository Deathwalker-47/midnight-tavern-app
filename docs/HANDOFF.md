# HANDOFF - current live state

**Updated:** 2026-08-13 (v0.2.9 play-tested by the owner; 31 findings returned; plan set started)
**Branch / source baseline:** local `main`. `ba49114` remains the last **pushed** commit — several
commits ahead of origin. **Not pushed** — the human has not asked.
**App version:** `0.2.9`, unsigned, installed at `%LOCALAPPDATA%\Midnight Tavern`, actively
play-tested. Installers on the owner's Desktop at `~/Desktop/MidnightTavern-0.2.9/`.
**User-owned/untracked:** `.agents/`, `.codex/`, `opencode.json` — preserve.

**Active plan:** none yet. The plan **set** at `docs/plans/2026-08-13-*` is written but **not
authorized**. `docs/plans/2026-08-13-00-MASTER-INDEX.md` is the entry point.

## ⛔ Planning rules changed on 2026-08-12

Every plan document written before 2026-08-12 is **decommissioned** by owner decision — see
[`docs/PLAN-POLICY.md`](PLAN-POLICY.md). Anything in `Plan/`, `Audit/`, or `docs/superpowers/plans/`
that had not shipped is **cancelled, not deferred**, including Audit Plan 13's entire deferred queue
(Plans 21/19/20/18/23/10B). Only plans in `docs/plans/` dated after 2026-08-12 may be worked on.
Shipped *behaviour* is unaffected and stays defended by the test suite.

## Verification state

Measured this session on a clean tree at `b19d4b8`:

- `npm run typecheck`: **clean** in both workspaces.
- Core **670 tests / 46 files**; UI **183 tests / 26 files**; **853 total**, all passing.
- ⚠️ Root `npm test` **fails** — but not on an assertion. Every UI file passes, then a tinypool
  worker dies (`Worker exited unexpectedly`). Core pins `maxWorkers: 1` for this known Windows/Node
  24 instability (`packages/core/vitest.config.ts:10`); `packages/ui/vite.config.ts:31` does not.
  **Run the workspaces separately to get a truthful result.** Fix is task P0-0 in plan 07.
- Bridge parity verified mechanically: **85/85** `CoreBridge` methods present in both backends.

No build, no `cargo check`, no installer this session. Docs and plans only — no source touched, so
the suite is unchanged.

## What landed this session

- `b19d4b8` — decommissioned every pre-2026-08-12 plan; added `docs/PLAN-POLICY.md`, banners on all
  17 retired plan/audit docs, retargeted `ARCHITECTURE.md`'s stale "Plan/ is authoritative" claims,
  and recorded in `CONTEXT.md` that **invariant 9 is actively violated** (see below).
- `4fd1af7` — master index mapping all 31 owner findings to 13 workstream plans.
- `9630b86` — plans 01 (entitlement lockdown) and 02 (classifier fidelity, the owner's P0).
- (this commit) — plans 03, 07, and the design brief.

## Findings established from the live save (read-only, via a copy)

These are verified facts, not inferences. Do not re-derive them.

1. **The NPC "unprovoked punch" is TWO defects, not one.**
   - Turn 12 (the reported one): stored classifier output was
     `social_reassure_survivor … stakes=opposed`. The old `isProvocation` fired on
     `stakes === "opposed"`; Plan 13 Phase 2's `isHostileAct` removed that clause. **Fixed.**
   - Turn 14: **no player ruling existed at all**, so the deterministic path could not have fired.
     The attack came from `classified.npcIntents` — the *classifier* proposed it from prose, and
     `orchestrator/turn.ts:666` merges those straight into the resolve loop with **no** disposition,
     hostility, or trigger check. **This is the live violation of `CONTEXT.md` invariant 9.** Plan 02
     step 5.8 closes it cheaply. It does **not** require the (now cancelled) Plan 19.
2. **The gate is intact — owner finding 17 is NOT a bug.** `utility_command_shadow` (requires the
   epic `shadow_extraction`) was correctly **DENIED `skill_required`**. `combat_basic_strike` passed
   because a Dagger is equipped in `secondary`. Only `universal_natural_attack` is ungated, by
   design, and the owner has confirmed that is acceptable.
3. **Finding 19 (P0, misclassification) cannot be fixed by a confidence threshold.** The reported
   misclassification carried `confidence: 1`. See plan 02 for the grounding/fit design.
4. **Generic NPCs have no attributes at all.** `instantiateGeneric`
   (`packages/core/src/bootstrap/instantiate.ts:109`) returns `attributes: {}`, so living cards fall
   back to the schema default — that is why every NPC shows STR/AGI/END/INT/AFF/RES all 10. Their
   health is likewise identical (24/24) because `GENERIC_ENCOUNTER_HITS = 6` is a constant.
5. **"And Daen" is a real registry row** (`…:scene:and-daen`) created by a sentence-initial
   conjunction being absorbed into a proper name. `shadow_entity` has a raw snake_case id **and**
   display name, from a different creation path.
6. **The owner's narrator is `deepseek/deepseek-v4-pro` via nanogpt** at temperature 0.8, topP 0.95,
   frequency/presence penalty 0.3 — directly relevant to findings 11/12/13.

## Non-negotiable rules

- Models may propose actors, intents, soft state, and prose. The engine owns mechanics, ids, gates,
  budgets, effects, damage, death, persistence, rollback, and active scene membership.
- Hard state is written only by `engine/ledger.ts`; soft state only by the analyzer.
- Bridge parity: every `CoreBridge` method exists and behaves identically in both backends;
  `bridge/core.ts` imports core as TYPES ONLY and never touches `node:`/native.
- A story's schema is frozen at forge time. Never mutate it in place during play.
- Do not weaken threshold-backed death or ruling-before-prose behaviour.
- Release/signing/updater/CSP work is a later phase — do not start it unless this file says so.
- Do not push. Preserve user-owned untracked paths.

## Single next action

**Wait for the owner to review the plan set and authorize a wave. Do not implement anything.**

All twelve plans plus the design brief are written and committed under `docs/plans/2026-08-13-*`.
`docs/plans/2026-08-13-00-MASTER-INDEX.md` is the entry point: it maps all 31 findings, records the
four findings that turned out **not** to be bugs, lists the cross-plan dependencies, and carries the
open owner decisions.

The owner's stated sequence is explicit and must be respected:

> finalize the plans → owner reviews → owner returns with design decisions → **then** development
> starts.

**Six owner decisions are open** (D1, D3–D7; D2 is answered and closed). **D7 is the largest cost
driver** — whether Wave 2/3 schema changes require a new story or must migrate existing saves. The
recommendation on record is *new stories only*, with the existing rulebook-regeneration path offered
as an opt-in upgrade, because migrating a frozen rulebook would mean inventing hard state for
existing characters — exactly what the ledger-only rule exists to prevent.

`docs/plans/2026-08-13-DESIGN-BRIEF.md` is ready to hand to Claude. It was trimmed once on owner
instruction (only what a designer actually needs) and then revised after the plans were written,
which surfaced one genuinely new item: **§3, rendering the narration fallback recap in the SYSTEM
register instead of the STORY register.** That is a small change with a large perceived-quality
payoff — it is the actual fix for the owner's "every prose ends with a DM one-liner" complaint, since
that text is a mechanical recap currently wearing the story's serif clothes.

When implementation is eventually authorized, the recommended first pass is **plan 07's P0-0** (pin
the UI vitest workers) so the root test suite stops failing, then **plan 02** (the owner's P0).
