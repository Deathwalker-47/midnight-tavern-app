# Copy-paste prompt for the next coding agent

Continue Midnight Tavern in `C:\Users\anuji\Documents\midnight-tavern-app`.

Act as engineering manager and hands-on implementation agent. Work autonomously and sequentially;
this repository forbids parallel coding agents. Do not ask the human to choose TypeScript
architecture. Do not push. Preserve the user-owned/untracked `.agents/`, `.codex/`, and
`opencode.json` paths. Never mutate an installed story database unless the human explicitly asks for
that exact data operation; packaged diagnosis is read-only by default.

Read in full before editing: `AGENTS.md`, `CONTEXT.md`, `docs/HANDOFF.md`, the newest
`docs/WORKLOG.md` entries, and Tasks 15A-15F in `Plan/next-phase-internal-beta.md`. Use
codebase-memory-mcp before text search and re-index if symbols are stale. For defects, follow strict
RED -> observe the intended failure -> minimal implementation -> GREEN. Begin every PowerShell
command with an explicit `Set-Location -LiteralPath
'C:\Users\anuji\Documents\midnight-tavern-app'` because the shell sometimes ignores its supplied
working directory.

Before stopping, run fresh typecheck and complete tests, run the relevant native/build gates, append
WORKLOG, overwrite HANDOFF, update this prompt and the active plan, and commit coherent green
changes with the required co-author trailer. Build one installer only after the current defect list
is complete or when the human asks for a fresh packaged test.

## Current repository state

- Local `main` source ends at `bd4f99d` (`core: reconcile narrated villager identities`), followed
  by a documentation closeout; not pushed.
- Unsigned app version `0.2.8`; Tasks 15A-15F source and automated gates are complete.
- Fresh gates: core **632 / 45 files**, UI **160 / 25 files**, **792 tests total**; typecheck,
  `cargo check`, `git diff --check`, and the optimized package build passed.
- Preferred installer:
  `packages/shell/src-tauri/target/release/bundle/nsis/Midnight Tavern_0.2.8_x64-setup.exe`
  SHA-256 `F2D782561AD92527FA496638189EC1CA40524C7504E0449B380C7115A8443FB7`.
- MSI alternative:
  `packages/shell/src-tauri/target/release/bundle/msi/Midnight Tavern_0.2.8_x64_en-US.msi`
  SHA-256 `ACEE3C638CFE3C488F77CA6D78195547A40BE69C42FA5FCB9DB11EDF38590402`.
- Both installers and the standalone executable are intentionally unsigned.

## Affected installed story and evidence locations

The installed story is `Cyraeth Adventure`, id
`ab1c6258-e244-4e7d-9147-1b0d3396a2c7`.

- Database: `C:\Users\anuji\AppData\Roaming\com.midnighttavern.app\midnight-tavern.db`
- WAL/SHM may be active beside it; use SQLite URI `mode=ro` plus `PRAGMA query_only=ON`.
- Native log: `C:\Users\anuji\AppData\Local\com.midnighttavern.app\logs\midnight-tavern.log`

The user explicitly said not to repair the current story in place; they will rewind and retry. The
prior agent queried the database and log read-only and made no save writes.

## Complete latest-turn diagnosis

The story had 13 messages at inspection. The latest operation completed successfully in roughly
77.2 seconds. NPC introduction, classifier, NPC planner, narrator, authority audit, save, and
background analyzer all completed. The classifier selected `Reassure Survivor` against Daen. The
deterministic ruling was valid: d20 6 + 0 vs DC 8, failure. There was no health/death mutation and no
provider error.

The narrator provider returned 3,691 characters. The authority model accepted the response, but the
old deterministic keyword guard detected death-language in a later unseen beat. Because an earlier
prefix had already been safely released, the engine persisted only 1,866 characters: the accepted
prefix plus the factual `Reassure Survivor fails` recap. This produced the visible “narrated death
wasn't backed by a DM ruling” warning. The rejected raw remainder is not recoverable from the DB or
log because it was deliberately never persisted.

The full transcript and state establish the canonical scene actors:

- `Daen` is the first man; prose says “Daen - apparently the first man's name”.
- `Daenin` is the younger man with the bow; prose uses a descriptor-first appositive.
- `Mera` is the older woman, later referred to as the woman; her name appears as a dialogue vocative.
- The large dog is distinct.
- The earlier forest creature is historical/absent.
- `First man`, `Woman`, `Younger man`, and `Older woman` were provisional rows, not four additional
  villagers. `First man` and broad `Woman` must not be active duplicates after replay.

All inspected character soft records had empty identity/current/relationship/observation data, and
`world_soft` was null even though background analysis completed. Record this as a separate live
acceptance signal. Do not claim it fixed merely because actor registration is fixed.

The NPC planner returned no mechanical actions on this social turn. That is not evidence that the
hostile agency system failed: the player was reassuring suspicious villagers, not attacking a
hostile living NPC. Test autonomous/retaliatory NPC mechanics separately with a hostile actor and a
legal sealed action.

## What Task 15F changed

`packages/core/src/orchestrator/sceneEntityPromotion.ts` now:

- extracts bounded third-person name explanations such as Daen/first man;
- extracts descriptor-first appositives such as younger man/Daenin;
- resolves an unambiguous dialogue vocative to the nearest unclaimed provisional person;
- prefers a specific overlapping label (`Older woman`) over its broad duplicate (`Woman`);
- emits narration-grounded aliases alongside canonical identity candidates.

`packages/core/src/orchestrator/turn.ts` now removes conflicting non-leave registrar transitions
when deterministic narration proves that their displayed label aliases another canonical row. The
turn integration fixture proves `Daen` remains active, `First man` stays inactive, `Younger man`
becomes `Daenin`, `Older woman` becomes `Mera`, and `Woman` stays inactive in one atomic commit.

`packages/core/src/orchestrator/authorityGuard.ts` now treats questions, modal/counterfactual danger,
explicit negation, and incomplete attempts as non-assertive death-language. It still deterministically
rejects concrete unruled `falls dead`, `died`, `was slain`, and kill assertions. Do not weaken this
authority boundary: narrator prose never decides tracked life state.

The RED/GREEN regressions are in:

- `packages/core/test/orchestrator/sceneEntityPromotion.test.ts`
- `packages/core/test/orchestrator/authorityGuard.test.ts`
- `packages/core/test/orchestrator/turn.test.ts`

## Exact next action

Do not invent another source change before packaged replay evidence. Ask the human to install the
fresh NSIS artifact, rewind only the latest affected exchange, and replay the same social action.
Then inspect the new UI plus log/database read-only and verify:

1. Present contains the player, `Daen`, and the genuinely established villagers/creatures.
2. `First man` and broad `Woman` do not return as separate present NPCs.
3. The provisional younger/older rows are enriched to `Daenin` and `Mera` rather than duplicated.
4. The narration is not truncated merely because dialogue mentions hypothetical or negated death.
5. The ruling remains visible before prose; any genuine death remains threshold-backed.
6. The operation returns to idle with no stale warning.
7. Character/world soft-memory fields gain evidence after a clear exchange. If they remain empty,
   open a new Task 15G for analyzer response normalization/patch persistence with a fresh RED test.

Checkpoint semantics deliberately retain registered identity history. Therefore provisional alias
shells already captured by the affected old checkpoint may remain visible in Characters as
historical/absent after rewind. The current batch guarantees they are not activated as separate
present actors; deleting or merging historical rows in the user's save requires separate explicit
product authority and must not be improvised.

## Non-negotiable architecture

- Program-owned mechanics are authoritative and versioned. Models provide prose, classification,
  bounded actor proposals, and soft memory only.
- Every actual fictional NPC/creature that appears must be registry-backed, but registry membership
  and current presence are separate.
- A later unambiguous identity reveal enriches the same actor. Scenery, crowds, statues, murals,
  pronouns, ordinal transitions, and vague nouns are not characters.
- Only present, living actors participate. NPC and player action budgets remain separate.
- Rulings render before narrator streaming. Damage/death requires deterministic resource changes;
  narrator prose cannot override them.
- Preserve browser/native bridge parity. Do not edit historical Design handoff prototypes. Do not
  begin signing/updater/CSP work during this phase.
