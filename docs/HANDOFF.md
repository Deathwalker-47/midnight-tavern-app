# HANDOFF - current live state

**Updated:** 2026-08-02
**Branch / source baseline:** local `main` at `bd4f99d`; this documentation closeout follows; not pushed
**App version:** `0.2.8`, unsigned
**User-owned/untracked:** `.agents/`, `.codex/`, `opencode.json` - preserve
**Active plan:** `Plan/next-phase-internal-beta.md`; Tasks 15A-15F automated/source work complete

## Current outcome

Task 15F repairs the two defects exposed by the latest installed `Cyraeth Adventure` exchange. The
installed save was inspected read-only and was never edited.

The latest turn itself was mechanically valid. NPC introduction, classifier, NPC planner, narrator,
and authority audit all completed; the operation committed in about 77.2 seconds. `Reassure
Survivor` correctly failed on d20 6 + 0 vs DC 8. There was no provider failure. The narrator returned
3,691 characters, but the deterministic death guard accepted only a 1,866-character prefix before
substituting a factual recap and the warning shown in the screenshot.

The full transcript established this canonical cast:

- `Daen` is the person initially described as the first man.
- `Daenin` is the younger man with the bow.
- `Mera` is the older woman, later shortened in prose to the woman.
- The large dog is a separate creature.
- The earlier forest creature is historical and absent from the village scene.

The source fix in `bd4f99d` now understands bounded third-person name explanations, descriptor-first
appositives, and unambiguous dialogue vocatives. Narration-grounded aliases suppress conflicting
model registrar transitions, so `First man` is not activated beside `Daen`, `Younger man` is enriched
to `Daenin`, `Older woman` is enriched to `Mera`, and the overlapping broad `Woman` transition is
discarded. The complete turn remains atomic.

The death guard now distinguishes a concrete tracked-state assertion from questions,
counterfactual/modal danger, explicit negation, and incomplete attempts. Dialogue such as “could
have killed you” or “does not mean anyone is dead” can remain in the narration. Concrete unruled
`falls dead`, `died`, `was slain`, and kill assertions are still rejected unless deterministic
mechanics recorded `causedDeathOf` after a lethal resource reached zero.

## Save boundary and replay expectation

Do not manually edit the installed database. The human explicitly intends to rewind the latest
exchange and replay it under this build.

After rewind/replay:

1. The Present strip should contain the player, `Daen`, `Daenin`, `Mera`, and the large dog when the
   replayed prose establishes all of them.
2. `First man` and broad `Woman` must stay inactive rather than appearing as separate present NPCs.
3. Hypothetical or negated death-language must not truncate otherwise valid narrator prose.
4. Any real narrated death must still require deterministic damage and `causedDeathOf`.
5. Because rollback deliberately retains registered identity history, old provisional alias rows
   already captured by the affected checkpoint may remain in Characters as historical/absent. This
   batch does not mutate or delete the user's current save.

## Additional read-only finding

All present NPC soft records in the inspected save had empty identity/current/relationship fields,
and `world_soft` was null even though the background analyzer completed. This is a distinct
provider-backed dossier-memory acceptance signal. Task 15F does not claim it is repaired. Recheck it
after the clean replay; if fields remain empty after an exchange with clear character evidence,
open the next source task against analyzer output/patch persistence rather than altering this save.

The latest NPC planner returned no mechanical NPC action. That was not itself an authority failure:
the player attempted social reassurance, not a hostile attack, and the villagers responded in
ordinary narrator dialogue. Continue separate packaged NPC-agency acceptance with an actually
hostile, living NPC and a legal sealed action.

## Fresh verification

- Focused actor/authority/turn regression suite: **48 tests / 3 files**, passed.
- `npm run typecheck`: passed.
- `npm test`: core **632 / 45 files**, UI **160 / 25 files**, **792 total**, passed.
- `cargo check`: passed.
- `git diff --check`: passed.
- `npm run build`: passed core, UI/Vite, optimized Rust, MSI, and NSIS packaging.

## Fresh test artifacts

- Preferred NSIS installer:
  `packages/shell/src-tauri/target/release/bundle/nsis/Midnight Tavern_0.2.8_x64-setup.exe`
  - bytes: `5625514`
  - SHA-256: `F2D782561AD92527FA496638189EC1CA40524C7504E0449B380C7115A8443FB7`
- MSI alternative:
  `packages/shell/src-tauri/target/release/bundle/msi/Midnight Tavern_0.2.8_x64_en-US.msi`
  - bytes: `9269248`
  - SHA-256: `ACEE3C638CFE3C488F77CA6D78195547A40BE69C42FA5FCB9DB11EDF38590402`
- Standalone app executable:
  `packages/shell/src-tauri/target/release/midnight-tavern.exe`
  - bytes: `22799360`
  - SHA-256: `1FCE44034D661BEA2430B404016FD551881318863584EDA41951433694FA4C61`
- All report `NotSigned`, expected until the later signing/release phase.

## Non-negotiable authority and domain rules

- Models may introduce actors and write prose. The registry owns persistent identity/presence; the
  engine owns gates, dice, effects, damage, death, budgets, persistence, rollback, loot, and
  progression.
- Every actual fictional NPC/creature that appears must be registry-backed. A later unambiguous name
  reveal enriches the same actor; scenery, crowds, depictions, pronouns, and ordinals do not become
  characters.
- Registry membership and scene presence differ. Only present, living actors participate.
- Rulings render before narrator streaming. Prose cannot assert a tracked death without
  threshold-backed `causedDeathOf`. Player and NPC budgets remain separate.
- Preserve browser/native bridge parity and the user-owned `.agents/`, `.codex/`, and
  `opencode.json`. Do not push.

## Single next action

Install the fresh NSIS artifact over the previous build, rewind only the latest affected Cyraeth
exchange, and replay the same social action. Capture the resulting Present strip, full narration,
and warning state. Then inspect the log and database read-only to verify canonical actor rows,
presence, ruling/operation completion, and whether character/world soft memory gained evidence. Do
not infer another source fix until that packaged replay establishes the remaining boundary.
