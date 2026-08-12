# Plan 06 — Narration integrity

**Created:** 2026-08-13
**Covers owner findings:** 11 (degenerate prose), 12 (remove the DM one-liner recap), 13 ("Full
narration unavailable this turn")
**Size:** L
**Depends on:** nothing.
**Adopts:** `docs/plans/2026-08-13-Narration-drop-bug-fix-plan.md` (the owner's own draft) — see §2.
**Status:** Planned. Not authorized.

---

## 1. The three findings are ONE causal chain

This is the most important thing to understand before touching anything.

```
narrator model produces degenerate prose (finding 11)
        ↓
authority audit cannot verify it against the rulings (finding 13)
        ↓
the app substitutes a deterministic factual recap (finding 12)
```

**Finding 12 is not a separate feature to remove — it is the visible symptom of 13.** Confirmed in
source: `packages/core/src/orchestrator/authorityGuard.ts` builds the fallback prose as one sentence
per ruling —

```
"Jinwoo's Natural attack fails. The natural attack misses its target."
"Jinwoo's Weapon Strike critically fails. You overextend and take a punishing counter."
"Shadow_entity's Natural attack succeeds. The natural attack lands cleanly."
```

— and that string **replaces** the narrator draft. It is not appended to good prose. Every owner
screenshot showing those one-liners also shows the "Full narration unavailable this turn" notice
directly beneath them, which is consistent.

**Therefore: do not implement "remove the recap".** Removing it would leave a turn with *no* prose at
all when the audit fails, which is worse. The correct fix is to make the audit stop failing (§3),
and to make the recap read less like a bug when it legitimately does fire (§5).

- [ ] **1.1** Before writing any code, prove the above by grepping `authorityGuard.ts` for every
      writer of `prose` and confirming the deterministic builder is only ever used as a *replacement*
      (`usedSafeFallback: true`) and never concatenated onto a successful draft. If that proves
      false, **stop and rewrite this plan** — the owner's belief that it appears on every turn would
      then be literally correct and the fix is different.

## 2. Relationship to the owner-supplied plan

`docs/plans/2026-08-13-Narration-drop-bug-fix-plan.md` is a strong, evidence-backed plan and is
**adopted wholesale** for the audit-reliability work (its Phases 0–10). Two of its central claims are
independently confirmed in source:

| Claim | Confirmed at |
| --- | --- |
| The audit disables the repair loop, so one formatting slip suppresses the narration | `authorityGuard.ts:122` — `{ maxRepairs: 0, ... }` |
| `review()` accepts on an empty contradiction array while ignoring `obeysRulings` | `authorityGuard.ts:125` — `ok: result.contradictions.length === 0` |

That second one is an **authority-integrity defect**, not merely a reliability one: a response of
`{"obeysRulings": false, "contradictions": []}` is currently accepted as approval. Fix it in the same
changeset.

**This plan adds three things that draft does not cover.** Execute the owner's plan, plus §3, §4, §5
below.

## 3. Finding 11 — the degenerate prose (not covered by the adopted draft)

### Evidence

```
"...answers better left buried forever undisturbed beneath waters darker than pitch eternal cold
 silence reigns supreme always waiting patient hungry eternal endless unending—"
"...amen end transmission cease signal terminate connection goodbye farewell adieu—"
```

Punctuation-free run-on, escalating synonym chains, terminal em-dashes. This is classic
**repetition-penalty-driven degeneration**: the model is penalised for reusing tokens, so it walks
ever further from natural phrasing rather than closing a sentence.

Live config from the owner's `settings.roleMap`:

```
narrator: provider "nanogpt", model "deepseek/deepseek-v4-pro"
samplers: temperature 0.8, topP 0.95, frequencyPenalty 0.3, presencePenalty 0.3
```

### Diagnosis — which of the three is it?

- [ ] **3.1** Determine whether `deepseek/deepseek-v4-pro` is in the curated catalogue
      (`packages/core/src/router/modelCatalog.ts`) or was entered as free-text "advanced". Record the
      answer. If free-text, this is substantially **owner configuration**, and the app's job is to
      warn, not to prevent.
- [ ] **3.2** Determine whether `frequencyPenalty`/`presencePenalty` are actually forwarded to the
      provider by `packages/core/src/router/providers/openaiCompat.ts`. If they are not, the sampler
      panel is lying and that is an app bug in its own right.
- [ ] **3.3** Check `maxTokens` for the narrator role and whether the observed drafts were
      truncated (~5,375 chars in the owner's evidence — compare against the configured budget). A
      draft cut mid-sentence would independently explain the trailing em-dashes.

### The app's responsibility

Whatever 3.1–3.3 conclude, a non-expert must not be able to silently configure the storyteller into
gibberish. Two engine-owned protections, neither of which touches the authority wall:

- [ ] **3.4 — Recommended sampler profile for the narrator role.** `samplers.ts` already carries
      per-role defaults. Frequency/presence penalties above ~0.2 are actively harmful for long-form
      prose. Lower the *recommended* narrator defaults to `frequencyPenalty: 0, presencePenalty: 0`
      and let temperature carry the variety. **Do not silently rewrite the owner's saved values** —
      change the recommendation, and offer a "reset to recommended" affordance that already exists
      in the Role Matrix.
- [ ] **3.5 — A prose sanity check, engine-side and deterministic.** Before the authority audit,
      run a cheap structural check on the draft and treat failure as a *narrator* failure (retryable
      against the narrator, not the verifier):
  - mean sentence length above a threshold (proposed: > 60 words) across the draft, or
  - a sentence-terminator ratio below a threshold (proposed: < 1 terminator per 80 words), or
  - the same token repeated > N times in a 50-token window.

  These are objective text statistics, not judgement, so they belong in the engine. Put them in a
  new `packages/core/src/orchestrator/proseSanity.ts` with a pure
  `assessProse(text): { ok: boolean; reason?: string }` and 100% branch coverage — it is cheap to
  test exhaustively and it will be load-bearing.
- [ ] **3.6** Wire 3.5 so a failing draft triggers the **existing narrator repair path** (regenerate
      once) before falling back, and is reported as `narrator_unavailable` in the adopted plan's
      typed outcome model — not as an audit failure. Getting this attribution right is what makes
      the UI notice truthful.

## 4. Finding 12 — make the recap honest, do not delete it

The owner's ask ("remove them completely, prose should only contain proper prose") is right in
spirit. The resolution:

- [ ] **4.1** Once §3 and the adopted plan land, the recap should become **rare**. Measure it: add a
      counter for fallback-vs-accepted narration to the existing opt-in diagnostics
      (`packages/core/src/observability/counters.ts`). Report the ratio to the owner after one play
      session before doing anything further.
- [ ] **4.2** Render the recap in the **SYSTEM register**, not the STORY register. Today it is
      rendered as narrator prose in serif, which is precisely why it reads as "the prose ended with a
      DM one-liner" — it is wearing the story's clothes. Rendering it as a system-register block,
      visually continuous with the ruling cards it summarises, makes it self-evidently a mechanical
      recap rather than bad writing. **This is the single highest-value change in this plan for the
      owner's actual complaint** and it is a UI-only change in `packages/ui/src/screens/Play.tsx`.
- [ ] **4.3** Do **not** persist the recap as a narrator message *variant* that later swipes can
      cycle to. Confirm the adopted plan's Phase 6 covers this (it does — "no duplicate degraded
      variants") and that it is implemented.
- [ ] **4.4** Never send recap text to the analyzer, summarizer, or NPC discovery as if it were
      narration. Confirm against the adopted plan's Phase 5.

## 5. Finding 13 — the notice copy

The adopted plan's Phase 7 tabulates correct copy per failure kind and fixes the "Change narrator
model" button naming the wrong role. Two additions:

- [ ] **5.1** The current copy is alarming ("couldn't be verified against the DM rulings") for what
      is, to a player, a storytelling hiccup. Rewrite toward graceful degradation. Proposed:
      > **The storyteller stumbled this turn.** Your dice results below are final and already
      > applied. The scene description didn't come through, so here's what happened in plain terms.
- [ ] **5.2** Keep the mechanical guarantee visible — that the *dice already counted* is the
      reassuring part and the current copy buries it.

## 6. Implementation order

1. The adopted plan's Changeset 1 (`core: harden authority audit contract`) — the contract, the
   semantic consistency fix at `authorityGuard.ts:125`, ruling-index bounds.
2. The adopted plan's Changeset 2 (`core: repair and classify verifier failures`) — one bounded
   verifier repair, typed outcomes, diagnostics.
3. **This plan's §3** — prose sanity + narrator recommended samplers.
4. The adopted plan's Changeset 3 (`ui: correct narration recovery flow`) — plus **this plan's §4.2
   and §5**.
5. The adopted plan's Changeset 4 (structured-output capability probing) — optional hardening.

## 7. Acceptance criteria

1. `{"obeysRulings": false, "contradictions": []}` is **rejected**, not accepted.
2. A repairably malformed audit response releases the original verified draft after one extra
   verifier call, without regenerating prose or rerolling anything.
3. A degenerate draft is caught by `assessProse` and attributed to the **narrator**, not the
   verifier, and the UI offers the narrator model as the fix.
4. The fallback recap renders in the SYSTEM register and is never mistaken for prose.
5. The fallback is never persisted as a swipeable variant and never reaches the analyzer.
6. Diagnostics report the fallback ratio so "is it fixed?" is measurable rather than felt.
7. All the adopted plan's own acceptance criteria (its §"Acceptance criteria summary", 13 items).
8. Suite green, typecheck clean, bridge parity maintained for the new typed outcome.

## 8. Risks

- **The adopted plan is large** (10 phases). Changesets 1–3 are the immediate fix; Changeset 4 is
  hardening and may be deferred without leaving the app broken. Say so to the owner rather than
  presenting all ten phases as mandatory.
- **§3.5's thresholds are guesses.** Calibrate them against the owner's captured bad drafts *and*
  against known-good drafts from the same story before shipping, or they will reject legitimate
  atmospheric prose. Store the fixtures in the test suite.

## 9. Authority-wall note

Nothing here grants a model authority. `assessProse` is deterministic text statistics. The audit
change makes acceptance *stricter*. The recap remains engine-generated from sealed rulings.
