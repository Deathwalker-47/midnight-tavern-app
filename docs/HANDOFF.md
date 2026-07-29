# HANDOFF — current live state

**Updated:** 2026-07-29
**Branch / runtime HEAD:** `main` at `04e83b7` (Task 5) before this docs commit; local, not pushed
**App version:** `0.2.8`, unsigned
**User-owned/untracked:** `.codex/`, `opencode.json` — preserve
**Active plan:** `Plan/next-phase-internal-beta.md`
**Detailed plan:** `docs/superpowers/plans/2026-07-29-internal-beta-completion.md`

## Fresh verification

- `npm run typecheck`: passed.
- `npm test`: core 498/40 files + UI 137/25 files = **635 tests**, passed (Task 5 added 4).
- Known noise: seven existing React `act(...)` warnings.
- Build/cargo/installer were intentionally not rerun after `350f805`; the human asked to defer the
  installer until all remaining Internal Beta work is complete.

## Non-negotiable authority rules

- Engine/DM owns gates, dice, effects, damage, death, budgets, loot, progression, and persistence.
- Models may propose identity/intent and write prose but may not mutate or contradict hard state.
- Every actual NPC/creature appearing in fiction must be in the character registry; ambient scenery,
  murals, statues, background crowds, “Nothing,” and “Something” are not characters.
- Registry membership and scene presence are separate. Only present, living actors participate.
- Rulings render before narrator streaming. Narrator prose may dramatize but must not quote internal
  dice/DC boilerplate or assert death without an authoritative `causedDeathOf`.

## What `350f805` changed

1. Added `orchestrator/npcIntroduction.ts`: one bounded structured classifier request proposes
   introduce/enter/leave; deterministic code validates grounding, template, name, duplicates, and
   ambient negatives.
2. Stages approved roster changes before the normal classifier and narrator context, then persists
   them atomically with the completed turn. Provider/narrator failure leaves no new row.
3. Removed post-narration character creation. The prior heuristic is only a bounded
   pre-classification catch-up for creatures already present in historical narration.
4. Normalizes every player intent to the sole present player. A reversed NPC-as-actor/player-as-target
   response is swapped back, preventing attacks on a current undocumented creature from being
   attributed to an older NPC such as `Dead man`.
5. Two strikes remain legal when the story action budget is two; skill gates still apply to the
   actual player and sealed action.
6. Universal actions config v2 applies `-4` success / `-8` critical-success damage to the target
   lethal resource when a melee/ranged action omitted damage. Existing explicit damage wins.
   Runtime schema normalization upgrades old persisted full-stat stories in memory.
7. Death is authoritative when a lethal resource reaches zero (resources clamp at zero). The
   authority guard rejects kill/death prose when no ruling reports `causedDeathOf`.
8. Narrator prompts treat ruling facts as private constraints, and safe fallback prose no longer
   repeats “resolves as success (total vs DC...)”.
9. Denied ruling cards include the actor name, making classifier/actor mistakes visible.

## Important live diagnosis

The tested Solo Leveling database proved Jinwoo already knew Basic Strike. The bad two-strike turn
was denied because the classifier returned `Dead man` as the player-intent actor and Jinwoo as its
target; `Dead man` was an older creature, while the current attacked creature had never entered the
registry. The new registrar + actor normalization address that chain. The prior Weapon Strike schema
had no health delta, so a successful strike could never kill mechanically; config v2 repairs that.

## Remaining ordered work

1. Task 5: bounded goal-driven NPC planning — **DONE (`04e83b7`)**. `planNpcActions` proposes via one
   bounded classifier request; deterministic validation (present candidate, sealed action/item/skill,
   present target, actor gate) + separate NPC budget; fail-closed to no action on malformed/timeout.
   Watch-out: fires a model call every full-stat turn with an idle present NPC — Task 9 should bound it.
2. Task 6: sealed non-combat provocation (threat/intimidation), without reacting to harmless talk.
3. Task 7: provider → core → bridge → store → Play safe-streaming smoke test.
4. Task 8: progressively verify and release mechanical beats.
5. Tasks 9–10: stage deadlines/telemetry and responsive model defaults.
6. Tasks 11–13: resumable Forge, card/persona/starting-gear acceptance, and remaining UX acceptance.
7. Task 14: eliminate seven React warnings.
8. Task 15: full Internal Beta gate, packaged manual acceptance, then create the final installer.
9. Task 16 signing/updater/CSP remains later/out of scope.

## Single next action

Start detailed-plan **Task 6: Extend Deterministic Provocation Beyond Combat** in
`packages/core/src/orchestrator/npcAgency.ts`. Write failing tests first: a sealed threat/intimidation
action targeting a present living NPC provokes a same-turn reaction, while harmless dialogue does NOT.
Add a sealed hostile/provocation predicate based on action category, stakes, and effects (never raw
prose). Today `planNpcReactions` only treats `category === "combat"` as provoking; broaden it to the
new predicate and keep the deterministic counter path. Run the agency + resolver suites, then commit
`core(orchestrator): react to sealed non-combat provocation`.

Do not build an installer yet. Generate it only after the remaining Internal Beta tasks (through Task
15) and complete verification, as requested by the human.
