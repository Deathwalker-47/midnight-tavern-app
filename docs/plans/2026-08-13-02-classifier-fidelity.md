# Plan 02 — Classifier fidelity

**Created:** 2026-08-13
**Covers owner findings:** 4 ("I was not reassuring any survivors"), 19 ("player messages get
classified into wrong actions all the time — P0 must fix"), 17 (natural attack — **closed, see
§0**)
**Size:** L
**Depends on:** nothing. Partially *relieved by* plan 09 (richer catalogues) — see §2.
**Status:** Planned. Not authorized.

---

## 0. Finding 17 is closed — the gate is intact

The owner suspected Jinwoo used a skill he had not learned. **He did not.** Verified against the
live save (story `2debfbce`, Solo Leveling RPG) by reading every player ruling and comparing each
action's `requiresSkill` against the player's learned skills:

| Ruling | Action | Requires | Player has it | Verdict |
| --- | --- | --- | --- | --- |
| 27 | `utility_command_shadow` | `shadow_extraction` (epic) | **no** | **DENIED `skill_required`** ✅ |
| 30–54 | `combat_basic_strike` | `basic_strike` + item kind `weapon` | yes, Dagger equipped in `secondary` | ALLOWED ✅ |
| 53 | `universal_natural_attack` | — (engine-owned, ungated by design) | n/a | ALLOWED ✅ |

The gate refused the epic skill exactly as designed. The owner has confirmed that an ungated
natural attack available to everyone is acceptable; the problem would only be *other* skills
leaking through, and none do.

**One real (cosmetic) defect remains from this finding:** the narrator and the ruling card both
render `universal_natural_attack` as "Natural attack", which reads like a named skill and is what
made it look like an ungated ability. Fix in §4.

- [ ] **0.1** Add a characterization test locking in that a story action whose `requiresSkill` the
      actor lacks produces `gate.allowed === false` with code `skill_required`, and prove it is a
      real tripwire (break `checkGate`'s skill branch, watch it fail, revert, `git diff` clean).
      File: `packages/core/test/gate.test.ts`.

---

## 1. The actual P0: the classifier force-fits

### Evidence

Player typed:

> "I don't know where I am. A creature with claw-hands was hunting me in those woods. **Try to
> assure them by showing your empty hands** to Daen and the archer."

Stored classifier output for that turn (`turn_operations` op `1eee3606`):

```
player intent: social_reassure_survivor  target=Daen  stakes=opposed  confidence=1
```

That is a **model** decision, not a deterministic fallback: `confidence: 1` sailed past
`CONFIDENCE_THRESHOLD` (0.6, `packages/core/src/classifier/prompt.ts`), so `filterConfident`
(`classify.ts:76`) kept it. Nothing downstream could second-guess it.

The action it chose is hyper-specific:

```
social_reassure_survivor  "Reassure Survivor"
  "Comfort a traumatized refugee or townsfolk to build trust and gather vital news."
  category=social  opposed=false  dealsTargetHarm=false  dc=10
```

Marta, Kellan and Daen are villagers in their own home, not traumatized refugees. The player was
performing a *gesture of peace*, which this rulebook has no action for.

### Root cause — two halves, and both must be fixed

**Half A — the classifier has no way to decline, and no pressure to.** `CLASSIFIER_SYSTEM`
(`packages/core/src/classifier/prompt.ts:~140-190`) tells the model how to fill in an intent but
never tells it that returning **zero** intents is a first-class, often-correct answer. There is no
requirement to justify a match, no requirement to quote the span of player text that constitutes
the attempt, and no negative examples. A language model handed a catalogue and a sentence will
almost always pick the nearest catalogue entry.

**Half B — the catalogue is too small and too specific to cover ordinary play.** The Solo Leveling
story has **20** actions; Cyraeth has 30. `CATALOG_MIN_ACTIONS = 30`
(`packages/core/src/types/actions.ts:88`). When only ~6 social actions exist and they are as narrow
as "Reassure Survivor", "Provoke Rival", "Court Negotiation", the nearest-match distance for *any*
ordinary sentence is large. **Finding 19 and finding 25 are the same defect from opposite ends.**

Fixing only Half A converts wrong actions into "no action", which is more honest but makes the game
feel inert. Fixing only Half B gives the model more ways to be wrong. Both are required. Half A is
this plan; Half B is plan 09.

---

## 2. Design — the "attempt evidence" contract

Add a deterministic, engine-side check that a proposed intent is *grounded in the player's own
words*, and give the classifier an explicit, rewarded way to say "this is just talk".

This does **not** move authority to the model — it *removes* authority from the model, by making a
model proposal insufficient on its own. The engine still owns the final say.

### 2.1 New wire contract

Every proposed intent must carry the exact substring of the player's message that constitutes the
attempt, plus a fit grade:

```ts
// packages/core/src/types/index.ts — extend MechanicalIntent
{
  actorId: string;
  actionId: string;
  targetId?: string;
  itemId?: string;
  skillId?: string;
  stakes: Stakes;
  confidence: number;
  /** NEW — verbatim span from the player's message that constitutes this attempt. */
  evidenceSpan: string;
  /** NEW — how well the catalogue action matches what the player described. */
  fit: "exact" | "close" | "stretch";
}
```

`fit` is deliberately separate from `confidence`. Today a model can be *confident* it has picked the
nearest catalogue entry while that entry is a poor fit. Splitting them lets the engine reject a
confident stretch.

### 2.2 Deterministic grounding check (engine-owned, new module)

New file `packages/core/src/classifier/grounding.ts`:

```ts
export type GroundingVerdict =
  | { grounded: true }
  | { grounded: false; reason: "span_not_in_message" | "span_too_short" | "no_verb_support" };

export function checkGrounding(
  playerMessage: string,
  action: ActionDef,
  intent: MechanicalIntent
): GroundingVerdict;
```

Rules, in order:

1. **Span must be real.** `evidenceSpan`, normalized (lowercase, collapse whitespace, strip
   punctuation), must appear as a contiguous substring of the normalized player message. A model
   that paraphrases has not found evidence — reject. Prevents hallucinated justification.
2. **Span must be substantive.** At least 3 words, or 1 word if that word is a verbatim match of the
   action's label/id/alias. Blocks "try" as evidence for anything.
3. **Verb support.** The span must contain at least one token that appears in the action's `label`,
   `id`, `aliases`, or `description`, after stemming to a common prefix of ≥4 characters. This is
   the check that catches the reported bug: span "assure them by showing your empty hands" shares
   `assur`≈`reassur` — **this would pass**, which is correct and honest. It is not a lexical problem.

Rule 3 alone does not solve the reported case. That is deliberate — the real filter is 2.3.

### 2.3 The `fit` gate (this is what actually fixes the report)

The engine refuses to resolve a `stretch`:

| `fit` | Engine behaviour |
| --- | --- |
| `exact` | Resolve normally. |
| `close` | Resolve normally. |
| `stretch` | **Do not resolve.** Drop to narration-only for that intent and append a note to `freeText` so the narrator still plays the beat as pure fiction. |

And the prompt (§3) defines the grades with worked examples so `stretch` is the honest answer for
"assure them by showing empty hands" against an action that means "comfort a traumatized refugee".

**Why this works where a confidence threshold does not:** confidence asks "am I sure this is the
best catalogue entry?" — and it genuinely was the best of 20. `fit` asks "is the best entry actually
what the player did?" — and it plainly was not.

### 2.4 No-intent is a first-class answer

Add a required field to the classifier response:

```ts
{ playerIntents: [...], npcIntents: [...], freeText: string,
  /** NEW — when playerIntents is empty, why. Forces deliberate declining. */
  noIntentReason?: "pure_dialogue" | "pure_description" | "no_matching_action" | "ambiguous" }
```

Requiring a *reason* makes declining a deliberate act rather than an omission, which measurably
reduces force-fitting.

---

## 3. Prompt changes

File: `packages/core/src/classifier/prompt.ts`.

- [ ] **3.1** Add to `CLASSIFIER_SYSTEM`, near the top so it is not buried:
  ```
  - Returning ZERO player intents is correct and common. Most player messages are dialogue,
    description, or intent to move the scene, not a mechanical attempt. Do not reach for the
    nearest catalogue action. If nothing genuinely matches, return playerIntents: [] with a
    noIntentReason.
  ```
- [ ] **3.2** Define the `fit` grades explicitly, with these exact worked examples:
  ```
  fit=exact   The player named the action or described precisely what it does.
              "I pick the lock" -> exploration_pick_lock  (exact)
  fit=close   The player described something the action plainly covers, in other words.
              "I try to talk the guard down" -> social_influence_guard  (close)
  fit=stretch The chosen action is merely the NEAREST available one; its definition does not
              actually describe what the player did. RETURN THIS HONESTLY.
              "I show my empty hands to prove I mean no harm"
                -> social_reassure_survivor ("comfort a traumatized refugee")  (stretch)
              A stretch will be played as narration, which is the correct outcome.
  ```
- [ ] **3.3** Require `evidenceSpan` and forbid paraphrase: "evidenceSpan must be copied character
      for character from the player's message. Do not rewrite, summarise, or translate it."
- [ ] **3.4** Add the `noIntentReason` enum and require it when `playerIntents` is empty.
- [ ] **3.5** Include each action's `description` in the catalogue block sent to the model. Verify
      first whether it is already included — if it is, note that in the worklog and skip. Without
      the definition the model cannot judge fit at all.
- [ ] **3.6** Keep `CONFIDENCE_THRESHOLD` at 0.6. Do **not** raise it; the reported failure had
      confidence 1.0 and raising the bar would only suppress genuine low-confidence hits.

---

## 4. Natural-attack presentation (residual of finding 17)

- [ ] **4.1** Give `universal_natural_attack` a clearer label. Proposed: **"Unarmed Attack"** with
      description "Strike with fists, claws, teeth or whatever you have — available to everyone,
      no weapon or training required." File: `packages/core/src/config/universal-actions.json`
      and/or wherever the universal natural attack ActionDef is materialised
      (`applyUniversalActionDefaults` in `packages/core/src/config/registry.ts`).
- [ ] **4.2** In the ruling card, mark engine-owned universal actions with a small `UNIVERSAL` chip
      so the player can tell an always-available fallback from a learned skill.
      File: `packages/ui/src/components/RulingArtifact.tsx`, `packages/ui/src/screens/Play.tsx`
      (`rulingToArtifact`). Design input needed — see the design brief.
- [ ] **4.3** Verify no story-generated action is allowed to reuse the id
      `universal_natural_attack`; add a validator check if absent.

---

## 5. Implementation steps (strict TDD)

### Phase A — RED tests

- [ ] **5.1** `packages/core/test/classifier/grounding.test.ts` (new):
  - span not present in message → `span_not_in_message`
  - span present but 1 vague word → `span_too_short`
  - span present, substantive, verb-supported → `grounded: true`
  - paraphrased span ("showed empty hands" vs "showing your empty hands") → rejected
- [ ] **5.2** `packages/core/test/classifier/classify.test.ts`:
  - **the reported case**: message = the exact Cyraeth text, model returns
    `social_reassure_survivor` with `fit: "stretch"`, confidence 1 → **zero** player intents
    resolved, `freeText` carries a narration note.
  - same but `fit: "close"` → intent resolved normally.
  - model returns an intent whose `evidenceSpan` is not in the message → dropped, and the drop is
    reported in `ClassifierRecoveryMetadata`.
  - model returns `playerIntents: []` with `noIntentReason: "pure_dialogue"` → clean
    narration-only turn, **not** flagged as a recovery/error (this is the normal path, and must not
    light up the classifier-error UI).
- [ ] **5.3** `packages/core/test/orchestrator/turn.test.ts`: a full turn where the only intent is a
  `stretch` commits a narrator message and **zero** rulings, and does not enter `classifier_error`.
- [ ] **5.4** Backwards compatibility: a stored intent from before this change (no `evidenceSpan`,
  no `fit`) still decodes and resolves. Persisted `turn_operations.classified` rows contain old
  shapes — make the new fields optional in the Zod schema with a documented default of
  `fit: "close"`, and add a decode test over a captured legacy row.

### Phase B — implement

- [ ] **5.5** Extend `MechanicalIntent` + the classifier Zod schema
  (`buildClassifierSchema` in `prompt.ts`) with `evidenceSpan` and `fit`, both optional at the type
  level for legacy decode but **required in the model-facing schema**.
- [ ] **5.6** Write `grounding.ts` per §2.2.
- [ ] **5.7** In `classify.ts`, after `filterConfident`, add a `filterGrounded` pass that drops
  ungrounded and `stretch` intents, counting them into the existing dropped-intent reporting so
  `AMBIGUITY_NOTE` still reaches `freeText`.
- [ ] **5.8** Apply the same filter to `npcIntents`. **This is important and easy to miss:** the
  classifier's `npcIntents` flow straight into the resolve loop at
  `packages/core/src/orchestrator/turn.ts:666` with no justification check at all, which is the
  live violation of `CONTEXT.md` invariant 9 recorded on 2026-08-12. Requiring `evidenceSpan` +
  `fit` on NPC intents closes it cheaply, and this is the reason the second unprovoked Daen punch
  happened. **Do not skip 5.8.**
- [ ] **5.9** Update the deterministic recovery paths
  (`recoverExplicitCatalogPlayerIntents`, `recoverUniversalPlayerIntent`) to emit
  `evidenceSpan` (they already match verbatim, so the span is the matched phrase) and
  `fit: "exact"`.

### Phase C — verify

- [ ] **5.10** `npm run typecheck` clean; core and UI suites green per-workspace.
- [ ] **5.11** Re-run the exact Cyraeth message through a real provider and confirm it now returns
  either no intent or a `stretch`. Record the result in the worklog.

---

## 6. Acceptance criteria

1. The exact reported message no longer produces a `Reassure Survivor` ruling.
2. A genuine mechanical attempt ("I attack the shadow with my dagger") still resolves, with no
   regression in the existing classifier suite.
3. An intent whose `evidenceSpan` is absent from the player message is never resolved.
4. `playerIntents: []` with a `noIntentReason` is a clean narration turn and does **not** surface
   the classifier-error UI.
5. NPC intents are subject to the identical grounding and fit gate (invariant 9).
6. Legacy persisted classified payloads still decode.
7. Natural attack is presented so a player can tell it from a learned skill.
8. Suite green, typecheck clean, bridge parity untouched (this plan does not change the bridge).

## 7. Risks

- **Over-suppression.** If the model grades everything `stretch`, the game goes inert. Mitigate by
  logging the fit distribution to the local diagnostics counters (opt-in, already exists) and
  reviewing after one play session before tuning.
- **Latency.** No extra model call is added — the fields ride on the existing response. Token cost
  rises slightly from including descriptions (§3.5).
- **This plan makes the catalogue's narrowness *more* visible**, because honest declining exposes
  how little the rulebook covers. That is the correct order — plan 09 then fills the gap. Say so to
  the owner rather than letting it read as a regression.

## 8. Authority-wall note

Nothing here grants a model new power. It adds two engine-side filters over model output and one
required justification field. The engine's gate, dice, and effects are untouched.
