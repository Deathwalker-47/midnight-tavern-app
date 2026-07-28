# WORKLOG — append-only agent journal

Newest first. **Append** entries; never edit past ones. Each entry: date, agent/session, what
landed, why, verification, and any gotcha the next agent needs. Live state is in
[`HANDOFF.md`](HANDOFF.md); this is the history.

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
