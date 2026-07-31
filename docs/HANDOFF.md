# HANDOFF - current live state

**Updated:** 2026-07-31
**Branch / HEAD:** local `main` at `ad629f7` before the current Forge source/docs commit; not pushed
**App version:** `0.2.8`, unsigned
**User-owned/untracked:** `.codex/`, `opencode.json` - preserve
**Active plan:** `Plan/next-phase-internal-beta.md`, Task 15A
**Detailed plan:** `docs/superpowers/plans/2026-07-31-packaged-beta-remediation.md`

## Current outcome

The first provider-backed packaged acceptance pass found seven source defects, so the prior v0.2.8
artifacts are stale for acceptance even though the automated gate that produced them was green. Do
not start Task 16 and do not rebuild an installer after each fix. Complete Task 15A sequentially,
run the combined gate, then package the final source state once.

Task 15A slice 1 is complete. A retained Forge now offers **Resume saved Forge** and **Start new
Forge**. Fresh start waits for queued retained writes, clears exactly the old operation id, then
creates a new story/operation without a resume checkpoint. If durable clearing fails, replacement is
blocked with a visible error instead of racing or overwriting saved work. The next slice is durable
character-specific memory and dossier semantics.

## Fresh baseline before remediation

- `npm run typecheck`: passed on 2026-07-31.
- `npm test`: core **546/42 files** + UI **147/25 files** = **693 tests**, passed.
- After Forge tests: core **546/42 files** + UI **149/25 files** = **695 tests**, passed.
- Working tree before docs: only user-owned `.codex/` and `opencode.json` were untracked.
- Prior automated release gate at `8ab7a68`: configured engine coverage 100% in all four metrics,
  direct core/UI builds passed, `cargo check` passed, and unsigned v0.2.8 packages built.
- That package evidence remains useful history, but its artifacts must not be offered as containing
  any Task 15A fix.

## Packaged findings and grounded causes

1. **Overview:** chapters without a closed arc put the live automatic summary only in the narrow
   timeline while the large pane falls back to the immutable premise.
2. **Dossiers:** `getCharacterDossier` explicitly chooses global arc/chapter summaries for every
   character. Player/bootstrap and promoted-NPC paths may also create hard-only records, and
   `runBackground` omits present characters without soft state from analyzer input.
3. **Forge:** cancellation correctly retains checkpoints, but `forgeStory` always reuses any
   retained request/operation. Discard is secondary and asynchronous, leaving no clear atomic path
   to start a new operation.
4. **Possible Moves:** `suggestPlayerActions` throws after malformed/provider-failed structured
   output. Packaged provider logs showed HTTP 429 and tiny invalid responses, so the UI always lands
   on “Suggestions are unavailable.”
5. **Attack error:** universal-action recovery can target only an explicitly named present
   character or the sole non-player character. “Attack it again” becomes ambiguous when an older
   registry NPC is also present, even when the newest committed ruling identifies the current foe.
6. **NPC does not attack:** deterministic reaction requires a resolved provocation; goal-driven
   `planNpcActions` returns `[]` on any provider failure. There is no persisted engine-approved
   hostility fact for a safe provider-independent attack.
7. **Scroll jump:** Play’s follow/latest decision is held mainly in asynchronous React state; DOM
   replacement and layout-height changes can reset the transcript before the effect re-anchors or
   preserves the reader viewport.

The packaged log’s 429s are real provider rate limiting, not proof of a local crash. Remediation
must degrade safely and honestly; it must not manufacture mechanics or conceal provider status.

## Task 15A order

1. Forge fresh start vs checkpoint resume. **Complete.**
2. Character-specific history and durable soft-state participation.
3. Recent living target focus for pronoun continuation attacks.
4. Deterministic scene-grounded suggestion fallback.
5. Validated persisted hostility and provider-independent hostile NPC action.
6. Play scroll anchoring.
7. Overview chapter/premise hierarchy.
8. Full tests/typecheck/coverage/build/cargo, baton refresh, then one package build.

## Non-negotiable product and authority rules

- Engine/DM owns gates, dice, effects, damage, death, budgets, target legality, persistence, and
  rollback. Models propose identity/intent and write prose only.
- Every actual fictional NPC/creature that appears is registry-backed. Scenery, crowds, statues,
  murals, “Nothing,” and “Something” are not characters.
- Registry membership and scene presence are separate. Only present, living actors participate.
- DM rulings render before narrator streaming. Prose cannot assert death without authoritative
  health-threshold death and `causedDeathOf`.
- Two player actions remain legal when the player budget is two. NPC budget is separate.
- Target continuity may reuse only one unique recent present living target; never roster order.
- Suggestions remain insert-only and still pass through normal classification/ruling on send.
- Provider degradation may reduce variety but must not disable safe affordances or proven hostile
  behavior.
- Browser/native bridge parity is mandatory; keep native dependencies out of the webview bridge.
- Preserve `.codex/` and `opencode.json`; do not push.

## Single next action

Implement detailed-plan Task 2 using TDD:

1. Add core RED tests proving bootstrap players and introduced NPCs always have a soft-state
   envelope and that background analysis includes every present registry character.
2. Add two-character dossier RED tests proving neither dossier uses global plot or the other
   character's observations/events.
3. Implement insertion defaults plus lazy repair for older hard-only records; restrict analyzer ops
   to known present ids.
4. Build Character history only from that character's evidence, rename the UI section, and render
   honest not-observed states.
5. Run focused core/UI tests, typecheck, all tests, update every baton document, and commit.

Do not mix targeting, suggestions, NPC hostility, scroll, or Overview changes into the character
memory commit.
