# Master plan index — 2026-08-13 play-test remediation

**Created:** 2026-08-13
**Status:** PLANNING. No implementation authorized yet.
**Owner decision required before dev starts:** yes — see "Owner decisions outstanding".
**Supersedes:** nothing. This is the first plan set created after `docs/PLAN-POLICY.md` took
effect, so it is the only eligible body of work. Every pre-2026-08-12 plan is cancelled.

## How to use this index

The owner delivered 31 numbered findings from the v0.2.9 play-test. They are grouped below into
**13 workstream plans**, each in its own file. Each file is self-contained: an agent can pick up
any one of them without reading the others, except where a `Depends on` line says otherwise.

If you are an agent resuming this work:

1. Read `docs/HANDOFF.md` for which plan (if any) is *active*.
2. Read this index for the dependency order.
3. Read only the plan file you are executing.
4. Tick its checkboxes as you go, and update the status table here when a plan completes.

**Do not start any plan that the owner has not explicitly activated.** Several carry product
decisions that are the owner's to make, flagged per-plan and summarized at the bottom.

## Verified baseline at planning time

Measured on a clean tree at `b19d4b8`:

- `npm run typecheck` — clean in both workspaces.
- Core **670 tests / 46 files**; UI **183 tests / 26 files**; **853 total**, all passing.
- Root `npm test` currently *fails* on Windows/Node 24 — a tinypool worker dies **after** all UI
  tests pass. Core pins `maxWorkers: 1` for this (`packages/core/vitest.config.ts:10`); the UI
  config (`packages/ui/vite.config.ts:31`) does not. Fixed as task P0-0 in plan 07.
- App version 0.2.9, installed and play-tested. Narrator bound to `deepseek/deepseek-v4-pro`
  via nanogpt at temperature 0.8, topP 0.95, frequency/presence penalty 0.3.

## The 31 findings, mapped

| # | Finding (owner's words, abbreviated) | Plan | Severity |
| --: | --- | --- | --- |
| 1 | Decommission old plan docs | **DONE** — `b19d4b8`, see `docs/PLAN-POLICY.md` | — |
| 2 | Trial expired but play continued; lock the story surface | 01 | High |
| 3 | Fake licence workaround for testing, no code change | **DONE** — see plan 01 §Appendix | — |
| 4 | "I was not reassuring any survivors" | 02 | **P0** |
| 5 | Duplicate entity "And Daen" | 03 | High |
| 6 | All attributes 10; no variety in any random generation | 05 | High |
| 7 | Character types: User / Party / Secondary / Enemies | 04 | Medium |
| 8 | Three umbrella sections + rich User panel | 04 | Medium |
| 9 | Only User/Party loadouts editable | 04 | Medium |
| 10 | Living cards do not auto-update | 07 | High |
| 11 | Degenerate prose | 06 | High |
| 12 | Remove the DM one-liner recap from prose | 06 | High |
| 13 | "Full narration unavailable this turn" | 06 | High |
| 14 | NPC failure renders blue; failure should be red | 07 | Low |
| 15 | Quest system | 10 | Feature |
| 16 | Reduce repeat-action XP penalty; scope it per-target | 08 | Medium |
| 17 | Natural attack should be denied or learnable | 02 §0 — **CLOSED, not a bug** | — |
| 18 | Living cards from old story persist after switching | 07 | High |
| 19 | Player messages misclassified constantly | 02 | **P0** |
| 20 | Universal items catalogue | 09 | Feature |
| 21 | Weapons carry a stamina cost | 08 | Feature |
| 22 | Health / Mana / Stamina on every character by default | 08 | Feature |
| 23 | Skill overhaul: mana cost, types, duration, targets, cooldown, passives | 08 | Feature |
| 24 | Health/stamina/mana recovery model | 08 | Feature |
| 25 | Action + skill catalogues far richer; universal skills; new settings UI | 09 | Feature |
| 26 | Redesign Overview; separate arc and chapter sections | 12 | Medium |
| 27 | Slots not explained in the universal slots/tier policy | 12 | Low |
| 28 | Only in-scene characters in the Present strip | 07 | Medium |
| 29 | Composer should auto-expand to ~4 lines | 07 | Low |
| 30 | Suggestions need categorising from a move taxonomy | 11 | Medium |
| 31 | Weapon special skills with cooldowns, scaling by rarity | 09 | Feature |

## The plan files

| Plan | Title | Covers | Size | Depends on |
| --- | --- | --- | --- | --- |
| 01 | Entitlement lockdown | 2, 3 | M | — |
| 02 | Classifier fidelity | 4, 19, 17 | L | — |
| 03 | Entity registry integrity | 5 | M | — |
| 04 | Character taxonomy and panels | 7, 8, 9 | L | 08 (resources) for the rich panel |
| 05 | Generation variety | 6 | M | — |
| 06 | Narration integrity | 11, 12, 13 | L | — |
| 07 | Live UI reactivity and play-screen polish | 10, 14, 18, 28, 29 | M | — |
| 08 | Resource economy and skill mechanics | 16, 21, 22, 23, 24 | XL | — |
| 09 | Content catalogues | 20, 25, 31 | XL | 08 |
| 10 | Quests | 15 | XL | 08, 09 |
| 11 | Suggestion taxonomy | 30 | M | — |
| 12 | Overview and settings UI | 26, 27 | M | — |
| — | `2026-08-13-DESIGN-BRIEF.md` | the prompt to hand to Claude for design work | — | — |

Plan 06 additionally **adopts** the owner-supplied
`docs/plans/2026-08-13-Narration-drop-bug-fix-plan.md` rather than replacing it; see plan 06 for the
specific amendments.

## Recommended execution order

Three waves. Each wave ends green, committed, and shippable.

**Wave 1 — correctness (nothing new, make what exists honest).**
`02` → `06` → `03` → `07` → `01`

Rationale: item 19 is the owner's own P0 and it poisons every other observation — while
misclassification is live, no other gameplay judgement can be trusted. Narration integrity (06) is
next because degenerate prose plus the audit fallback is what the owner sees most often. 03 and 07
are contained, high-visibility, low-risk. 01 last in the wave because it *reduces* the owner's
ability to test and should land only once testing is otherwise comfortable.

**Wave 2 — foundations (schema changes, one migration).**
`05` → `08` → `04`

Rationale: 08 changes the resource and skill model, which 04's rich User panel wants to display and
which 05's variety scheme must respect. Doing 05 first is cheap and de-risks 08 by proving the
deterministic-variation approach on a small surface. All three should land inside **one** migration
if possible — see plan 08 §Migration.

**Wave 3 — content and features (the big product bets).**
`09` → `11` → `10` → `12`

Rationale: 09 defines the catalogues that 10's quest rewards and 11's suggestions both draw from.
12 is independent and can slot anywhere; it is last only because it is the least painful today.

**Do not start Wave 3 without an explicit owner go-ahead per plan.** 09 and 10 are each XL and
together represent the largest change since the engine was written.

## Cross-cutting rules every plan must obey

These are not negotiable and are repeated in each plan file:

1. **The authority wall.** Program-owned mechanics stay authoritative. Models may supply prose,
   classification, and soft memory only. No plan may let a model author or mutate executable
   effects, gates, ranks, attributes, resources, equipment, damage, death, budgets, or persistence.
2. **The hard/soft split.** Hard state is written only by `engine/ledger.ts`. Soft state is written
   only by the analyzer. Any new field must declare which side it is on. Anything with mechanical
   consequence is hard state, full stop — including party membership and quest reward grants.
3. **Bridge parity.** Every `CoreBridge` method must exist and behave identically in
   `packages/ui/src/bridge/core.ts` (browser-safe, TYPES-ONLY import of core, never `node:`) and
   `packages/ui/src/bridge/sqliteBridge.ts`. Prefer extracting a shared browser-safe module over
   hand-mirroring. Every plan that touches the bridge must add a parity test.
4. **Frozen schema.** A story's schema is frozen at forge time. New mechanics must either live in
   the schema (and therefore only affect *new* stories, or arrive through an explicit migration
   with a rulebook regeneration path) or live in engine-owned universal config. Never mutate a
   frozen schema in place during play.
5. **Strict TDD.** Write the failing RED test first, run it, confirm it fails for the right reason,
   then implement, then confirm GREEN. For behaviour that is already correct, write a
   characterization test and prove it is a real tripwire by deliberately breaking the source,
   watching the test fail, reverting, and confirming `git diff` is clean.
6. **Never build on red.** Verify the baseline before changing anything.
7. **Verify the premise.** These plans were written against source read on 2026-08-13. If a step's
   stated premise no longer matches the code, stop and correct the plan before implementing. Say so
   in the worklog. The previous session found several stale premises in its plan and was right to.

## Owner decisions outstanding

Implementation of these plans is blocked on the owner until each is answered. They are product
calls, not engineering calls.

| # | Decision | Plan | Why it blocks |
| --: | --- | --- | --- |
| D1 | Should an expired trial block **play** as well as creation, or only creation? Reading existing stories stays open either way. | 01 | Determines whether the whole Play surface locks. |
| ~~D2~~ | ~~Natural/unarmed attack~~ — **ANSWERED 2026-08-13.** Owner: "If only natural attack is exempt like that and anyone can use it then its fine. Its a problem if he can use other skills as well like this." Verified: the gate correctly DENIED the epic `shadow_extraction` skill; natural attack is the only ungated action. **Closed as working-as-designed.** | 02 §0 | — |
| D3 | Character types: confirm the final list. Proposed: **User, Party, Ally, Neutral, Rival, Enemy, Creature, Background**. | 04 | The whole taxonomy and its migration hang off it. |
| D4 | Attribute variety: how wide a spread? Proposed default ±3 around the story baseline, wider for named templates. | 05 | Affects perceived difficulty everywhere. |
| D5 | Recovery model: rest-based, per-scene regen, consumable-based, or a blend? Owner asked for "a tad bit easier than normal". | 08 | Defines the whole economy's feel. |
| D6 | Quest rewards: confirm the four reward types and the difficulty→reward tiering. | 10 | Determines reward-table shape. |
| D7 | Is a **new story required** to see Wave 2/3 features, or must existing saves migrate? Migration of a frozen rulebook is materially more expensive. | 05, 08, 09 | Single biggest cost driver in Wave 2 and 3. |

D7 is the most important. My recommendation: **new stories only** for Wave 2 and 3 schema changes,
with existing saves continuing to work unchanged under their frozen rulebook, plus the existing
"regenerate rulebook" path offered as an opt-in upgrade. Migrating a frozen schema in place risks
every invariant the engine defends, for saves that are currently test data.

## Status

**All twelve plans and the design brief are written.** Nothing is authorized for implementation.

| Plan | File | Written | Implemented |
| --- | --- | --- | --- |
| 01 Entitlement lockdown | `…-01-entitlement-lockdown.md` | ✅ | — |
| 02 Classifier fidelity | `…-02-classifier-fidelity.md` | ✅ | — |
| 03 Entity registry integrity | `…-03-entity-registry-integrity.md` | ✅ | — |
| 04 Character taxonomy | `…-04-character-taxonomy.md` | ✅ | — |
| 05 Generation variety | `…-05-generation-variety.md` | ✅ | — |
| 06 Narration integrity | `…-06-narration-integrity.md` | ✅ | — |
| 07 Live UI reactivity | `…-07-live-ui-reactivity.md` | ✅ | — |
| 08 Resource economy | `…-08-resource-economy.md` | ✅ | — |
| 09 Content catalogues | `…-09-content-catalogues.md` | ✅ | — |
| 10 Quests | `…-10-quests.md` | ✅ | — |
| 11 Suggestion taxonomy | `…-11-suggestion-taxonomy.md` | ✅ | — |
| 12 Overview and copy | `…-12-overview-and-copy.md` | ✅ | — |
| Design brief | `…-DESIGN-BRIEF.md` | ✅ | n/a |
| (adopted) Narration drop | `…-Narration-drop-bug-fix-plan.md` | owner-supplied | — |

### Findings that turned out NOT to be bugs

| Finding | Verdict | Evidence |
| --- | --- | --- |
| 17 — natural attack ungated | **Working as designed.** The gate correctly DENIED `utility_command_shadow` (needs the epic `shadow_extraction`) with `skill_required`. Only the engine-owned universal natural attack is ungated, which the owner confirmed is acceptable. Residual: it is *labelled* like a learned skill. | Plan 02 §0 |
| 16 (half) — repeat penalty ignores target | **Already implemented.** `turn.ts:673` already filters on `targetId`. The real defects are the punishing curve (4th use earns zero XP) and a window that counts the last five rulings *globally* rather than per-actor. | Plan 08 §1 |
| 12 — a DM one-liner is appended to every prose | **Misdiagnosed symptom.** That text is the deterministic recap that *replaces* prose when the authority audit fails — not an appendix. Deleting it would leave failed turns with no prose at all. The fix is to stop the audit failing, and to stop rendering the recap in the STORY register. | Plan 06 §1 |
| 26 — Overview lacks arc/chapter concepts | **Data already exists** (`ArcRecord`, `ChapterRecord`, both bridges). It is a layout and hierarchy problem, not a data problem. | Plan 12 §1 |

### Architecture change adopted 2026-08-13 — selection-based enablement

The owner proposed, and plan 09 now follows, a **universal pool + per-story enablement** model
instead of generating a bigger catalogue per story:

- A **universal pool** (~3,000 pre-authored actions/skills, drawn from the owner-supplied taxonomy)
  ships as versioned config and is **never sent to a model at runtime**.
- The forge **selects** 40–70 actions and 20–40 skills that fit the premise.
- The player can enable/disable entries by hand.
- Mid-story, a model may propose enabling something from the pool — never invent one.

**Why this is better than what was planned before**, and worth understanding before scheduling:

1. **Per-turn cost is decoupled from pool size.** The classifier prompt carries the catalogue every
   turn forever; under enablement it carries only the enabled subset, so the pool can grow without
   any runtime cost. This was the owner's own concern and it was correct.
2. **It removes the largest risk in the plan set.** The previous plan required the forge to *author*
   90 full `ActionDef`s in structured output; it already needed budget increases for 30. Selecting
   ids is a far smaller, more reliable call.
3. **Frozen rulebooks can now grow** in a controlled way, so a story that goes somewhere unanticipated
   is no longer stuck with a catalogue that does not fit.

**The two rules that keep it safe:** *enable ≠ learn* (enabling makes a skill exist in the world; the
character must still learn it through the existing unlock paths and gate), and the enablement set is
**hard state that must be checkpointed**, or rewind will leave mid-story unlocks stranded.

The owner also granted engineering authority to author the mechanical attributes (DC, costs,
cooldowns, outcome tables) for pool entries, bounded by the machine-checkable balance rules in
plan 09 §4.5.

### Cross-plan dependencies worth knowing before scheduling

- **02 and 09 are two halves of one defect.** 02 makes the engine honest about poor action fits; 09
  makes poor fits rare by growing the catalogue. Shipping 02 alone will make the game feel *more*
  inert, because honest declining exposes how little the rulebook covers. Warn the owner when 02
  lands.
- **08 blocks 09 and 10.** Costs, cooldowns and resource roles must exist before universal skills,
  weapon specials, or quest rewards can be defined.
- **04 wants 08.** The rich User panel displays mana and stamina, which 08 introduces. Either
  sequence 08 first or ship the panel with health only.
- **05 before 08.** 05 proves the deterministic seeded-variation approach on a small surface before
  08 applies the same discipline to the whole economy.
