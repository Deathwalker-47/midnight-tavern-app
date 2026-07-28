# WORKLOG — append-only agent journal

Newest first. **Append** entries; never edit past ones. Each entry: date, agent/session, what
landed, why, verification, and any gotcha the next agent needs. Live state is in
[`HANDOFF.md`](HANDOFF.md); this is the history.

---

## 2026-07-28 — Internal Beta exit: bridge drift guard, restart proof, act() cleanup

Completed the remaining Internal-Beta-exit plan items (1, 3, 4). Final baseline:
**core 454 / 36 files, ui 133 / 25 files = 587 tests**, typecheck clean.

**Item 1 — CoreBridge de-duplication (drift guard).** The in-memory bridge (`bridge/core.ts`)
hand-mirrors core's catalog because it must not value-import core's native runtime into the eager
webview bundle (a deliberate, load-bearing boundary — see the static-type vs dynamic-runtime import
split in that file). Rather than break that boundary, added
`packages/ui/test/bridge/catalogParity.test.ts`, which asserts the in-memory bridge's public catalog
surface is identical to canonical `@midnight-tavern/core`. It **immediately caught real drift**:
`MEMORY_KNOWN_MODELS` listed 8 of core's 14 models and mis-tiered direct GPT-4o. Resynced it to
canonical (source of truth: `core/src/router/model-recommendations.config.json`). Drift now fails CI.

**Item 3 — restart persistence proof.** `packages/core/test/store/persistence.test.ts`: opens a real
file-backed store (`openStore` over better-sqlite3), writes story+message+setting, closes, reopens a
fresh connection to the same file, asserts all restored. Closes the audits' unproven beta gate at the
durability-contract level (the packaged Tauri driver shares the same contract via `openStoreWith`).

**Item 4 — React act() warnings 31 → 7.** Play: guarded the two mount-load effects when the
`debugState` preview prop is set (preview must not do IO). StorySettings tests: flushed the mount
config-load with a trailing `act()`. Residual 7 (5 `RulingBlock` reveal-timer + 1 Play + 1 Overview)
are animation/async-reveal noise in two tests — left for a follow-up, tracked in the plan.

**Caveat for next agent:** the item-1 commit shows large line churn on `core.ts` — that's CRLF vs LF
noise (repo has no `.gitattributes`, `core.autocrlf=false`); content is correct. If you touch this a
lot, consider adding a `.gitattributes` (`* text=auto eol=lf`) in a dedicated normalization commit.

**Next:** Internal-Beta-exit code items are done. Remaining before calling the phase closed: (a) mop
up the last 7 act() warnings if desired, (b) confirm the human's manual packaged-app pass. After
that, the **later** phase is release/sellable (signing, updater, CSP, live-model acceptance).

---

## 2026-07-28 — Internal Beta exit: kickoff + card-import consolidation

**Context:** Full-code review (via codebase-memory graph) + next-phase decision. Chose the
**Internal Beta exit** track (see `Plan/next-phase-internal-beta.md`). Established this agent-handoff
mechanism (`AGENTS.md`, `docs/HANDOFF.md`, this log, the plan checklist).

**Landed — card-import consolidation (plan item 2):**
- Retired the orphaned `CardCreator` screen. It was registered but no nav path reached it, and its
  primary "Use this card" button had no handler. Deleted `packages/ui/src/screens/CardCreator.tsx`
  and its test; removed it from `app/router.ts` (ROUTES), `screens/registry.ts`, and `app/App.tsx`
  (nav `activeOn` + route-label map).
- Enriched the **working** import path — Library's modal (`packages/ui/src/screens/Library.tsx`):
  drag-and-drop drop zone (`data-testid="import-drop-zone"`), character trait chips, and a
  "Sparse card" warning (`data-testid="import-sparse-warning"`) when a card has no openings/lore.
- Tests: `Library.test.tsx` import coverage 1 → 3 (happy-path→Blueprint, drag-drop, sparse-card).

**Gotcha for next agent:** the bridge's `CardImportResult.spec` string **already** contains the
`"Card format …"` prefix (see `sqliteBridge.ts` importCard). Do not add another prefix in the UI.

**Verification:** `npm run typecheck` clean; UI suite 24 files / 126 tests green. (Core unchanged at
453.) Net test delta: −2 (CardCreator) +2 (new import tests) = 126 UI.

**Next:** plan item 1 — de-duplicate the CoreBridge (`core.ts` vs `sqliteBridge.ts`).
