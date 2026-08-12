# Plan 01 — Entitlement lockdown

**Created:** 2026-08-13
**Covers owner findings:** 2 (expired trial still allowed play), 3 (testing workaround — **done**,
see §Appendix)
**Size:** M
**Depends on:** nothing.
**Blocked on owner decision D1.**
**Status:** Planned. Not authorized.

---

## 1. Evidence

Verified against the live save and source.

- `settings.trialStartedAt = 1784724637190` → 2026-07-22T12:50:37Z. Trial is 14 days
  (`TRIAL_DURATION_MS`, `packages/core/src/licensing/trial.ts:22`) → expired 2026-08-05T12:50:37Z.
- No `licenseCache` row existed, so `evaluateCachedLicense` returned `{ status: "unlicensed" }`.
- Six messages, three of them `role='player'`, were written **after** that instant — the newest on
  2026-08-12, seven days past expiry.

The player could open any story from the Library and submit unlimited turns.

## 2. Root cause

Entitlement is scoped, by design and by doc comment, to a single question — *may this user create a
story?* — and the rest was delegated to "a UI decision" that was then never implemented.

```ts
// packages/core/src/licensing/trial.ts:76-84
export type Entitlement =
  | { canCreateStory: true; via: "license" | "trial"; trial?: TrialStatus }
  | { canCreateStory: false; reason: "trial-expired"; trial: TrialStatus };
// "Existing stories are never gated here — that is a UI decision keyed off
//  `canCreateStory` for the *creation* action only."
```

There are exactly **three** entitlement consumers in the whole UI, all creation-only:

| File | Line | What it gates |
| --- | --- | --- |
| `packages/ui/src/screens/Library.tsx` | 81, 197 | "New story" button + upsell banner |
| `packages/ui/src/screens/Wizard.tsx` | 234, 414 | gated wizard screen |
| `packages/ui/src/screens/StoryBlueprint.tsx` | 228 | save refusal |

`Play.tsx` never imports `useSettingsStore`. `playStore.submit` (`playStore.ts:202`) calls
`getBridge().submitTurn(...)` directly. `sqliteBridge.submitTurn` (`sqliteBridge.ts:426`) calls
`core.submitTurn(...)` with no gate. `packages/core/src/orchestrator/` contains **zero** occurrences
of trial/licence/entitlement. `git log -S"entitlement"` over `Play.tsx` and `playStore.ts` returns
nothing — the check never existed.

**Two aggravating factors:**

1. **Fail-open.** All three gates read `entitlement ? entitlement.canCreateStory : true`
   (`Library.tsx:81`, `Wizard.tsx:234`) — creation is permitted until `settingsStore.load()`
   resolves, and permanently if it throws.
2. **Enforcement lives only in React render code.** Neither bridge's `createStory` re-checks, so
   even the creation gate is cosmetic — anything reaching the bridge bypasses it.

**The app also makes a promise it does not keep.** `Library.tsx:212` renders:

> "Reading every story on your shelf stays open forever. Playing on — new turns and new stories —
> needs a license."

That is the intended behaviour, written in the product's own voice, and unimplemented.

## 3. Owner decision D1 — required before implementing

The current code gates creation only. The Library copy promises play is gated too. The owner asked
for "the whole story tab locked".

**Recommended:** implement what the copy already promises — **reading stays open forever, generating
is gated.** Specifically: the story list, transcript, journal, overview, character dossiers and
living cards remain fully readable; the composer, swipe/retry, and story creation are locked.

That is more humane than locking the whole tab (a player keeps access to everything they wrote) and
it matches the existing marketing copy, so no copy has to change.

- [ ] **D1 answered by owner.** Record the answer here before proceeding.

## 4. Design — own the gate in core, mirror it in both bridges

The UI must render *consequences*, never be the enforcement point.

### 4.1 Widen `Entitlement` into a capability record

```ts
// packages/core/src/licensing/trial.ts
export interface Entitlement {
  canCreateStory: boolean;
  /** NEW — may the user cause new model-generated content in an existing story? */
  canGenerate: boolean;
  via: "license" | "trial" | "none";
  reason?: "trial-expired";
  trial?: TrialStatus;
}
```

Computed by the same deterministic licence+trial fold that exists today. **Update the doc comment at
lines 80-84, which currently asserts the opposite of the new behaviour** — leaving it would mislead
the next agent exactly as it misled this one.

### 4.2 Enforce at every generative core entry point

A typed error, thrown as the **first statement**, before any persistence:

```ts
// packages/core/src/licensing/index.ts
export class EntitlementError extends Error {
  constructor(readonly capability: "create_story" | "generate", readonly reason: "trial-expired") {
    super(`Entitlement denied: ${capability} (${reason}).`);
    this.name = "EntitlementError";
  }
}
```

Entry points to guard:

| Function | File | Capability |
| --- | --- | --- |
| `submitTurn` | `orchestrator/turn.ts` | `generate` |
| `retryTurnOperation` | `orchestrator/turn.ts` | `generate` |
| `swipeLastTurn` | `orchestrator/history.ts` | `generate` |
| `suggestActions` | `orchestrator/suggestions.ts` | `generate` |
| story bootstrap | `bootstrap/index.ts` | `create_story` |
| `regenerateRulebook` | `orchestrator/rulebook.ts` | `create_story` |

**Critical ordering requirement for `submitTurn`:** the refusal must happen *before* step 1 persists
the player message, otherwise a refused turn leaves an orphan player line and a dangling
`turn_operations` row. Assert this in the test by checking message count is unchanged.

Follow the module's existing injection style (`rng`, `now` are already injectable) — accept an
optional pre-resolved entitlement so tests do not need a licensing fixture in every turn test.

### 4.3 Bridge parity

`packages/ui/src/bridge/core.ts` (in-memory) **must simulate the identical refusal**. If it does
not, every UI test passes against a permissive stub and the packaged app behaves differently — the
exact failure mode this repo has hit before.

## 5. Implementation steps

### Phase A — RED

- [ ] **5.1** `packages/core/test/licensing/licensing.test.ts` — extend the existing `describe("trial")`
      block (currently ~lines 163-208): `resolveEntitlement` returns `canGenerate: false` for an
      expired trial with no licence, `true` under a valid licence, `true` under an active trial.
- [ ] **5.2** `packages/core/test/orchestrator/turn.test.ts` — `submitTurn` against a store whose
      `trialStartedAt` is 15 days old and has no `licenseCache` rejects with `EntitlementError`
      **and writes nothing**: assert `store.messages.listByStory(storyId)` length is unchanged and
      no `turn_operations` row was created.
- [ ] **5.3** Same for `swipeLastTurn`, `retryTurnOperation`, `suggestActions`, bootstrap.
- [ ] **5.4** `packages/ui/test/screens/Play.test.tsx` — currently contains **zero** occurrences of
      trial/entitlement/licence. With
      `useSettingsStore.setState({ entitlement: { canGenerate: false, reason: "trial-expired", ... } })`,
      the composer is disabled and a lock notice renders in place of Send.
- [ ] **5.5** `packages/ui/test/bridge/` — parity test: both bridges return an identical
      `Entitlement` for the same trial/licence inputs, and both `submitTurn` implementations refuse.
- [ ] **5.6** Fail-open regression: with `entitlement === undefined` (store still loading), the
      composer is **disabled**, not enabled. Decide and lock in fail-*closed* for generation while
      keeping reading open.

### Phase B — implement

- [ ] **5.7** Widen `Entitlement`; fix the stale doc comment.
- [ ] **5.8** Add `EntitlementError`; guard all six entry points, refusing before any write.
- [ ] **5.9** Mirror in `bridge/core.ts`; keep `sqliteBridge.ts` a thin pass-through.
- [ ] **5.10** `playStore.ts` — map `EntitlementError` to a new `TurnErrorKind` (`"entitlement"`) so
      Play can render a licence notice rather than a generic failure.
- [ ] **5.11** `Play.tsx` — disable the composer, render the upsell with a route to Settings.
      `App.tsx:89-99` already has the right precedent (the `modelDependent` setup gate that
      redirects). Reuse that shape rather than inventing a new one.
- [ ] **5.12** Fix the three existing fail-open reads to fail closed.

### Phase C — verify

- [ ] **5.13** Typecheck + both suites green. Bridge parity test passing.
- [ ] **5.14** Manually: revert the testing unlock (§Appendix), confirm the app locks generation and
      still reads everything, then re-apply the unlock.

## 6. Acceptance criteria

1. With an expired trial and no licence, `submitTurn` refuses and persists nothing.
2. Reading — library, transcript, journal, overview, dossiers, living cards — remains fully open.
3. The composer is disabled with an honest notice that routes to Settings.
4. A valid licence or active trial restores generation with no other behaviour change.
5. Both bridges refuse identically.
6. Entitlement fails **closed** for generation while the store is loading.
7. No orphan player message or `turn_operations` row is left by a refusal.

## 7. Risks

- **Locking out the owner mid-test.** This plan is deliberately last in Wave 1 for that reason, and
  the §Appendix unlock must be verified working before it lands.
- **Existing saves.** No schema change; nothing to migrate.

---

## Appendix — the testing unlock (finding 3, already delivered)

No source was changed, as the owner requested. A script writes two rows into the app's own
`settings` table:

- `licenseCache` → a cached-valid judgement. `evaluateLicense()` →
  `core.evaluateCachedLicense(store)` (`sqliteBridge.ts:859`) reads **cache only, never the
  network**, so this is stable; the network call (`validateLicenseKey`) fires only when a key is
  pasted in Settings (`Settings.tsx:239`).
- `trialStartedAt` → reset to now, as a second line of defence if the licence row is ever cleared.

Script: `<scratchpad>/unlock.mjs`. It backs the DB up first and supports `--revert`. **The app must
be closed before running it.**

```bash
node "<scratchpad>/unlock.mjs" "C:/Users/anuji/AppData/Roaming/com.midnighttavern.app/midnight-tavern.db"
```

This is local test tooling for the owner's own build on their own machine, and is deliberately not
part of the shipped product. It must never be committed into the app or referenced by product code.
