# HANDOFF - current live state

**Updated:** 2026-08-12 (Plan 13 re-verified against source; **v0.2.9 built — first installer to
contain Plan 13**; owner is play-testing)
**Branch / source baseline:** local `main` @ `fe9d014` + a docs commit. `ba49114` was the last
**pushed** commit — four commits ahead of origin. **Not pushed** — the human has not asked.
**App version:** `0.2.9`, unsigned. MSI + NSIS built 2026-08-12 15:56 and copied to
`~/Desktop/MidnightTavern-0.2.9/`. Bundles also at
`packages/shell/src-tauri/target/release/bundle/{msi,nsis}/`.
**User-owned/untracked:** `.agents/`, `.codex/`, `opencode.json` - preserve
**Active plan:** none. `Audit/2026-08-02-PRODUCT-AUDIT/13-implementation-plan-final.md` is complete
and now says so at the top of the file. Its Deferred queue (Plans 21/19/20/18/23/10B) is open,
unscheduled, and **the owner has not picked one** — do not assume it is next.

## Verification state

Measured this session on a clean tree at `ba49114`:

- `npm run typecheck`: **clean** in both workspaces.
- `npm test`: core **670 / 46 files**, UI **183 / 26 files**, **853 total**, all passing.

> Note: prior HANDOFF revisions said 47/27 *files*. That was a miscount — the real figures are
> **46/26**. Test counts (670/183) were always right, so no test was ever lost.

No native/package build was run. Before any packaged or provider-acceptance claim, run the focused
suites plus full typecheck/tests, direct builds, and `cargo check` in `packages/shell/src-tauri`.

## What landed this session

**`d8dc46f` — docs: record Plan 13 completion in the plan itself + amend two stale acceptance
criteria.** Docs only, one file, +95/−2. No source touched, so the suite is unchanged.

Plan 13 had **no checkboxes at all**, so its completion existed only as a claim in WORKLOG/HANDOFF.
All 22 steps were re-verified individually against source (see the 2026-08-12 WORKLOG entry for the
per-step evidence), and the document now carries a `Status: ✅ COMPLETE` header, a 22-item checklist,
and the six deferred plans as **open** checkboxes.

Two acceptance criteria in the plan were stale and are struck through + amended in place:

- **Step 0.3** demanded zero `submitTurnLegacy` hits while also requiring the eight-phase comment —
  which names that function — to survive. Now tests for a definition/call/export; returns zero.
- **Step 3.8** demanded zero `JSON.stringify` under `packages/ui/src/screens/`, which **Step 6.1 of
  the same plan** deliberately violates for the Diagnostics export. Now excludes that file; returns
  zero.

Neither was a code defect. Also recorded: Phase 3 landed 833 tests vs a projected 835 (the split
differs, the coverage does not).

## Things a stale briefing may get wrong

- `AGENTS.md:21` was already fixed in `ba49114`. It correctly says there is no active plan. Do not
  "fix" it again.
- `docs/WORKLOG.md` says "Newest first" in its header but the protocol is **append**, so the newest
  entry is at the **bottom**. Read the tail, not the head.
- Plan 13's `turn.ts:651` reference for the unbounded `store.rulings.listByStory(storyId)` read has
  drifted — it is now at **`turn.ts:502`**. The read itself is still there and still unbounded; it
  belongs to Plan 19.

## Non-negotiable rules

- Models may propose actors, intents, soft state, and prose. The engine owns mechanics, ids, gates,
  budgets, effects, damage, death, persistence, rollback, and active scene membership.
- Every actual individual NPC/creature in committed prose must be registry-backed. Do not create
  characters for scenery, depictions, crowds, pronouns, ordinals, or prose-transition words.
- Only present living actors participate. Player and NPC action budgets remain separate.
- A later name reveal enriches one actor; active-branch/variant evidence controls current aliases and
  presence.
- Do not weaken threshold-backed death or ruling-before-prose behavior.
- Preserve browser/native bridge parity and user-owned untracked paths. Do not push.
- Release/signing/updater/CSP work is a later phase — do not start it unless this file says so.

## Single next action

**Wait for the owner's v0.2.9 play-test result, then let it decide the fork.** Until 2026-08-12 no
packaged build had ever contained Plan 13 (newest installer was v0.2.8 from 08-02 03:44; earliest
Plan 13 commit was `e990cb6` on 08-05 14:33), so none of it has been exercised in the shell.

**The fork this resolves.** Plan 19 is XL (1–3 months) and is justified almost entirely by NPC
misbehaviour observed in v0.2.8 — a build predating Phase 2's disposition fix aimed at exactly that.
If NPCs still misbehave in 0.2.9, Plan 19 is urgent and worth its cost. If Phase 2 fixed the felt
problem, Plan 19 drops to "eventual" and Plan 18 (onboarding, L) is a better use of the same months.
**Do not start an XL before this evidence exists.**

Highest-value test is the original failure on the existing *Cyraeth Adventure* save: does a **failed**
`Reassure Survivor` still trigger a Daen punch? (It should not — a losing contest of nerve is no
longer read as violence.) Secondary: NPC ruling cards carrying a reason, opposed contests showing
both sides' dice, the Journal's new "Boundaries" and "Interrupted" chips, a real chapter number in
the header, and the Diagnostics screen (opt-in — enable it in Settings first).

While that testing happens, **Plan 21 is the safe parallel task**: it touches bootstrap schema
validation only, no gameplay or UI surface, so it cannot collide with whatever the play-test surfaces.

The deferred queue below is a 10-day-old audit's sense of priority, formed before Plan 13 shipped —
a menu, not an instruction. In dependency order (explicitly *not* priority order):

| Plan | Scope | Size | State |
| --- | --- | --- | --- |
| 21 | Decompose `validateStorySchema` (`bootstrap/validate.ts:130`, 224 lines, returns prose `string[]`) into one validator per concern with typed codes | M | Unblocked; blocks nothing. Verified premise still holds. |
| 19 | One shared actor/scene/event model; `turn/` phase split; migration 17 | XL, 1–3 mo | Preconditions hold (ladder still at 16). Root cause of the NPC-behaviour issues. |
| 20 | Port the v2 memory system (facts/embeddings/consolidator/retrieval/drift) | XL | Needs Plan 19 landed first. |
| 18 | First-run onboarding + a premise engineered to hit a denial in <5 min | L | Unblocked now that Phases 3 and 5 shipped. |
| 23 | Art direction + portrait pipeline | XL | Step 1 (CSS/token rules) separable and cheap. Needs an owner call on portrait source. |
| 10B | User-selectable image generation | FUTURE | Owner-classified as future; recorded, not scheduled. |

A play-test of the packaged app would be worth more than any of these right now: Plan 13 Phase 2
shipped the disposition fix for the NPC misbehaviour, and **whether that actually worked in play
determines whether Plan 19 is urgent or merely eventual.** That evidence does not exist yet.
