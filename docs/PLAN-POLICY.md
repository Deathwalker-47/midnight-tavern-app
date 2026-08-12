# Plan policy — what counts as work, and what does not

**Effective 2026-08-12. Set by the product owner. This file overrides any planning guidance in
`AGENTS.md`, `ARCHITECTURE.md`, `CONTEXT.md`, `README.md`, or any document under `Plan/`,
`Audit/`, or `docs/superpowers/plans/`.**

## The rule

> **Every plan document written before 2026-08-12 is DECOMMISSIONED.** Any work item in those
> documents that was not already implemented and shipped by 2026-08-12 is **cancelled**, not
> deferred, not backlogged, not "eventual". Only plans created **after 2026-08-12** are eligible
> to be worked on.

An agent picking up this repo must not resume, schedule, or cite a pre-2026-08-12 plan as a reason
to do anything. If a pre-2026-08-12 document proposes work you think is valuable, that work has to
be re-proposed in a new plan and re-approved by the owner on its current merits. It does not carry
forward automatically, and its old priority ordering carries no weight.

## Why

The pre-2026-08-12 plans were written against a product that had never been play-tested in a
packaged build. Audit Plan 13 was the last of them, and it shipped in v0.2.9 on 2026-08-12 — the
first installer that ever contained it. The owner's play-test of that build produced concrete,
observed defects that supersede the audit's speculative priority ordering. Planning from the old
documents means planning from assumptions that real play has now replaced.

## What is decommissioned

Everything below is **reference only**. Read it to understand history or a diagnosis; never read it
as a task list.

| Path | Status |
| --- | --- |
| `Plan/high-level-plan.md`, `low-level-plan.md`, `low-level-plan-v2.md` | Decommissioned as plans. Still the best prose description of *why* the shipped engine is shaped the way it is. |
| `Plan/attribute-integration.md`, `competitive-adoptions.md`, `v2-integration-plan.md` | Decommissioned. |
| `Plan/v2-memory-system.md` | Decommissioned (was deferred "Plan 20"). |
| `Plan/next-phase-internal-beta.md` | Decommissioned. |
| `Audit/2026-08-02-PRODUCT-AUDIT/13-implementation-plan-final.md` | **Executed** and complete; its six-item *deferred queue* (Plans 21/19/20/18/23/10B) is **cancelled**. |
| `Audit/2026-08-02-PRODUCT-AUDIT/*` (all other files) | Decommissioned as plans. The diagnosis chapters remain useful reference. |
| `Audit/PROJECT_STATUS_AUDIT.md`, `Audit/V5_IMPLEMENTATION_STATUS_2026-07-23.md` | Historical snapshots. Stale by definition. |
| `docs/superpowers/plans/*` | Decommissioned. `2026-08-02-npc-scene-system-redesign.md` was already marked obsolete. |

**Important:** decommissioning a plan does **not** decommission the behaviour it already produced.
Everything shipped is defended by the test suite and by the invariants in `CONTEXT.md` and
`ARCHITECTURE.md` §12. Those invariants stand on their own and remain binding. Do not "clean up"
working code because the plan that motivated it is now retired.

## What replaces them

`docs/HANDOFF.md` names the single active plan, or says there is none. New plans live in
`docs/plans/` with a `YYYY-MM-DD-` prefix and must state, at the top: the observed evidence that
motivated them, the owner decision that approved them, and their acceptance criteria.

## The one thing that does not change

The authority wall. Program-owned mechanics stay authoritative; models supply only prose,
classification, and soft memory. No plan — new or old — may weaken it, the hard/soft state split,
bridge parity, or threshold-backed death.
