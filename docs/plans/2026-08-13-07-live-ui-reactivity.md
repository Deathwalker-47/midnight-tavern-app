# Plan 07 — Live UI reactivity and play-screen polish

**Created:** 2026-08-13
**Covers owner findings:** 10 (living cards never auto-update), 18 (cards from the old story persist
after switching), 28 (Present strip shows non-present characters), 29 (composer should auto-expand),
14 (NPC failure renders blue). Plus **P0-0**, the flaky root test suite.
**Size:** M
**Depends on:** nothing. Item 28's data question overlaps plan 04's taxonomy but is fixable now.
**Status:** Planned. Not authorized.

---

## P0-0 — Fix the flaky root test suite first

Not an owner finding, but it undermines the only safety net the project has.

`npm test` at the root **fails**: all UI test files pass, then a tinypool worker dies with
`Error: Worker exited unexpectedly`. Core pins workers to 1 for exactly this Windows/Node-24
instability:

```ts
// packages/core/vitest.config.ts:7-11
// Native SQLite plus Node's process pool intermittently exits with EPIPE on Windows when
// many files run concurrently. A single worker is slower but makes the primary safety gate
// deterministic ...
minWorkers: 1,
maxWorkers: 1,
```

`packages/ui/vite.config.ts:31` has no such pinning.

- [ ] **P0-0.1** Add `minWorkers: 1, maxWorkers: 1` to the `test` block in
      `packages/ui/vite.config.ts`, with a comment pointing at the core config's rationale.
- [ ] **P0-0.2** Run root `npm test` three times consecutively; all three must pass. Record timings
      — if the UI suite becomes unacceptably slow, fall back to `pool: "forks"` with
      `singleFork: true` and note the trade-off.

---

## 1. Findings 10 + 18 — living cards are a load-time snapshot

### Root cause

`playStore.readPlaySnapshot` (`packages/ui/src/state/playStore.ts:122`) fetches everything in one
shot — messages, rulings, advancement events, `listPresentCast`, recovery inspection — and it is
called from **`load(storyId)` only**. `submit()` appends the new messages and rulings to state
directly but never re-reads `cast`, and never invalidates the open living card.

The living card itself is fetched from `drawerCharacterId`, which lives in **`uiStore`**, not
`playStore`. Two consequences:

- **Finding 10:** after a turn commits, hard state has changed in SQLite but nothing tells the
  drawer or the strip to re-read. Navigating away and back calls `load()` again, which is exactly
  the owner's described workaround.
- **Finding 18:** `uiStore.drawerCharacterId` is **not** cleared when the active story changes, so a
  card belonging to the previous story stays mounted and renders stale data for a character that
  is not in the new story at all.

Note the Present strip *did* appear to update for the owner — because new characters arrive via
`submit()`'s own path in some cases. Treat the strip and the drawer as one problem with one fix; do
not fix them separately.

### Design

Introduce an explicit **story-state revision counter** rather than ad-hoc refetching.

```ts
// playStore
interface PlayState {
  // ...
  /** Bumped whenever committed story state may have changed (turn, swipe, delete, rewind). */
  stateRevision: number;
  refreshCast: () => Promise<void>;
}
```

- Bump `stateRevision` at the end of `submit`, `swipeLast`, `selectVariant`, `deleteLastTurn`,
  `rewindTo`, `deleteFromExchange`, and after a successful `retry`.
- The living-card `useEffect` in `Play.tsx` depends on `[drawerCharacterId, stateRevision]`, so it
  refetches whenever either changes.
- `refreshCast()` re-runs `listPresentCast` and is called on the same bumps.

Why a counter rather than pushing updated hard state through the turn result: the turn result
already carries rulings, but a living card is a **join** of hard + soft + equipment
(`memory/cardView.ts`), and soft state is written asynchronously by the analyzer *after* the turn
returns. A counter lets the card re-read the authoritative join once, instead of the UI trying to
reconstruct it. It also keeps the bridge surface unchanged.

- [ ] Consider a second bump when background analysis settles (`SubmitTurnResult.background`
      resolves), so soft-state changes (mood, relationships) also appear without navigation. Guard
      it so a failed background pass does not bump.

### Steps

- [ ] **1.1** RED `packages/ui/test/screens/Play.test.tsx`: mount Play with an open drawer, submit a
      turn whose ruling changes the character's health, assert the rendered card shows the new
      value **without** remounting. Use the existing bridge stub; increment the stubbed
      `getLivingCard` return between calls.
- [ ] **1.2** RED: with a drawer open on story A, switch to story B; assert the drawer is closed and
      no card from A is rendered.
- [ ] **1.3** RED: after a turn introduces a new present character, the Present strip includes them
      without navigation.
- [ ] **1.4** Implement `stateRevision` + `refreshCast`; wire the bumps.
- [ ] **1.5** Clear `drawerCharacterId` on story change. Best place: `uiStore`'s story-change action,
      or a `useEffect` in Play keyed on `storyId`. Prefer clearing in the store so every consumer
      benefits.
- [ ] **1.6** Watch for `act()` warnings — this repo has a warning guard and a history of failures
      here. Wrap async state settles properly rather than suppressing.

---

## 2. Finding 28 — Present strip must show only in-scene characters

### Current behaviour

`listPresentCast(storyId)` returns characters with `present = 1`. The owner is seeing characters who
are registry-present but not in the current scene — because `present` is a single boolean that
conflates "in this story" with "in this scene right now".

**This is the same modelling gap `CONTEXT.md` names:** *"Registry membership does not imply
presence"* — the codebase has the concept but only one flag to express it, and presence is only ever
retired by explicit narrated evidence (a leave, or an exact roster sentence like "You are alone
now"). Nothing expires it when a scene simply moves on.

### Options

| Option | Cost | Correctness |
| --- | --- | --- |
| A. Tighten presence retirement heuristics | S | Partial — still evidence-driven, still misses scene changes |
| B. Add an explicit scene/location id and scope presence to it | L | Correct, but this is scene-state modelling |
| C. Expire presence when a character has not been mentioned or acted for N turns | M | Pragmatic, deterministic, reversible |

**Recommendation: C now, B only if the owner later wants real locations.** C is engine-owned and
deterministic: presence expires after N narrator turns without the character appearing in committed
prose, in a ruling, or in an accepted scene observation. Re-mention restores presence. N should be
configurable and default to 3.

**Do not** let a model decide presence — that is the authority wall. The *evidence* (was the name in
committed prose) is deterministic text matching over already-committed content.

- [ ] **2.1** Owner decision: confirm option C and the value of N.
- [ ] **2.2** RED test: a character not mentioned for N turns leaves the Present strip; mentioning
      them again restores them; a character who acted mechanically this turn never expires.
- [ ] **2.3** Implement in core (presence derivation), not in the UI — both bridges must agree.

---

## 3. Finding 14 — NPC failure renders blue

### Root cause

`packages/ui/src/components/RulingArtifact.tsx:114` — `accentFor()` returns `var(--teal)` for
`variant === "npc"` **before** it ever consults the roll outcome:

```ts
if (props.variant === "npc") return "var(--teal)";
```

The `npc` variant was introduced (Plan 13 step 3.3) to give NPC actions their own register so a
player cannot mistake an NPC action for their own. It overshot: it also overrode the
success/failure colour, so an NPC failure is teal exactly like an NPC success.

### Design

Keep the NPC *register* (the `RULING · NPC` label, the reason line) but let **failure** own the
colour. The owner's instruction (finding 14) is exact and needs no design round-trip:

> "NPC success and failure both are blue which is odd. Make it so that failure is red for everyone,
> success can remain blue."

So: NPC **failure** and **crit-failure** take the failure accent; NPC **success** and
**crit-success** keep teal, preserving the NPC register for the non-alarming case.

```ts
if (props.variant === "npc") {
  const outcome = props.roll?.outcome;
  return outcome === "failure" || outcome === "crit-failure"
    ? outcomeVar(outcome)
    : "var(--teal)";
}
```

- [ ] **3.1** RED test in `packages/ui/test/components/RulingArtifact.test.tsx`: an `npc` variant
      with a `failure` roll renders the failure accent; with `crit-failure`, the crit-failure
      accent; with `success` **and** `crit-success`, still teal.
- [ ] **3.2** Implement; verify the `stacked` variant (which takes its colour from the final roll)
      is unaffected, and that the left border, background tint and stamp all follow the same accent
      — `accentFor` feeds all three, so one change covers them.
- [ ] **3.3** Check the `--dead` token has enough contrast against `--bg2-card` for the stamp border
      at 2px. If it does not, that is the one thing here worth raising with design; otherwise ship it.

---

## 4. Finding 29 — composer auto-expand

Currently a fixed-height input. Requirement: grow with content up to ~4 lines, then scroll
internally.

- [ ] **4.1** RED test: typing 6 lines' worth of text leaves the textarea at its 4-line max height
      with `overflow-y: auto`. jsdom does not lay out text, so assert on the **style/attribute
      contract** (e.g. computed `rows`, or a `data-lines` attribute the component sets), not on
      pixel height. Decide the testable contract before implementing.
- [ ] **4.2** Implement in `Play.tsx`'s composer: on input, reset `height = "auto"` then set
      `height = min(scrollHeight, maxHeight)`. Recompute on window resize and when the drawer
      toggles (the composer's width changes, so wrapping changes).
- [ ] **4.3** Preserve existing behaviour: Enter sends, Shift+Enter newlines, Esc closes the drawer
      (all documented in the composer's helper row). Do not regress these.
- [ ] **4.4** Reset to single-line height after a successful send.

---

## 5. Acceptance criteria

1. Root `npm test` passes three times consecutively.
2. An open living card reflects health/mana/skill changes immediately after a turn commits, with no
   navigation.
3. Switching stories closes the drawer; no card from the previous story ever renders.
4. The Present strip shows only characters actually in the scene, by a deterministic rule.
5. NPC failures are visually distinct from NPC successes.
6. The composer grows to ~4 lines then scrolls, preserving Enter/Shift+Enter/Esc.
7. No new `act()` warnings; the UI warning guard stays clean.
8. Bridge parity unchanged (§1 and §4 are UI-only; §2 is core-side and must be mirrored).

## 6. Risks

- **§2 is the only risky item here** and it touches presence semantics, which several other systems
  read (NPC agency candidates, classifier `presentCharacters`, context assembly). Changing presence
  changes who can act. Land it separately from the cosmetic fixes, with its own commit, so it can be
  reverted independently.
- §1's revision counter could cause refetch storms if bumped inside a render path. Bump only in
  async action handlers, never during render.
