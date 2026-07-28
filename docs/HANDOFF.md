# HANDOFF — current live state (the baton)

> Overwrite this file each time you stop. It always describes **now** and the **single next action**.
> History goes in [`WORKLOG.md`](WORKLOG.md). Protocol is in [`/AGENTS.md`](../AGENTS.md).

**Updated:** 2026-07-28
**Branch:** `main`
**Tree:** clean up to the last commit; card-import work committed this session.
**Suite:** green — core 453, ui 126 (`npm run typecheck && npm test`).
**Active plan:** [`Plan/next-phase-internal-beta.md`](../Plan/next-phase-internal-beta.md) — Internal Beta exit.

## Where we are

Phase = **Internal Beta exit**. Done so far: plan **item 2** (card-import consolidation) — Library's
import modal is now the single import path; the dead `CardCreator` screen is retired.

## Next action (start here)

**Plan item 1 — de-duplicate the CoreBridge.** `packages/ui/src/bridge/core.ts` (in-memory) and
`packages/ui/src/bridge/sqliteBridge.ts` (native) hand-mirror the same surface and have drifted.
Extract browser-safe shared modules (model catalog, capability/sampler metadata, recommendations)
that both backends import, so there is one source of truth. Keep the suite green at every step; this
refactor is invisible to the human tester and relies on tests as the safety net.

Start by mapping the divergence:
```bash
cd packages/ui && npx vitest run test/bridge   # existing bridge parity tests
```
Then diff the two files' exported surfaces and pull shared constants/logic into
`packages/ui/src/bridge/shared/` (or a `packages/core` browser-safe export) — never pull `node:` or
native deps into the `core.ts` path.

## Watch-outs

- `CardImportResult.spec` already includes the `"Card format …"` prefix — don't double it.
- GateGuard hook fact-gates the first edit of each file (see AGENTS.md → Rules of the road).
- Do **not** start release/signing/updater/CSP work — that's a later phase.
