# Plan 11 — Suggestion taxonomy

**Created:** 2026-08-13
**Covers owner finding:** 30 (suggestions are often irrelevant; categorise them from a move taxonomy)
**Size:** M
**Depends on:** nothing hard. Benefits from plan 10 (quest-aware suggestions) and plan 09 (a richer
action catalogue to draw from).
**Status:** Planned. Not authorized.

---

## 1. Current state

```ts
// packages/core/src/orchestrator/suggestions.ts:11
export const SuggestedActionSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["action", "move", "dialogue"]),   // <-- only three, and they are FORM not INTENT
  text: z.string().trim().min(1).max(240),
  actionId: z.string().optional(),
  rationale: z.string().trim().min(1).max(160).optional(),
});
```

`suggestPlayerActions` generates "five or six optional, context-grounded player choices", with a
`deterministicFallbackSuggestions` path when the model is unavailable.

The existing `kind` describes the **form** of the suggestion (is it an action, a movement, a line of
dialogue). The owner wants the **intent** — obvious / good / evil / dominating / clever / dangerous.
These are orthogonal: "punch the guard" is form=action, intent=dangerous. Keep both.

## 2. The taxonomy source

`RPG-Move-Taxonomy.txt` (owner-supplied) — roughly **700 move archetypes across ~30 categories**
(core archetypes, power/dominance, social, manipulation, intelligence, risk, clever/unconventional,
economic, conflict, emotional, character-expression, strategic, NPC-specific, world/faction,
meta-player, "what would an actual human do", plus ~20 combat-specific categories).

**700 is far too many to hand a model per turn.** Sending the full list would blow the prompt budget
and produce worse results, not better. **The real work of this plan is the selection policy, not the
list.** That is also why this is engineering, not design.

## 3. Design — a two-stage funnel

### Stage 1 — deterministic candidate narrowing (engine-owned, no model)

Reduce ~700 archetypes to ~20-30 *situationally plausible* ones using only sealed facts:

| Signal | Effect on the candidate pool |
| --- | --- |
| Is combat active? (any hostile present, or a combat ruling this turn) | admit the combat categories; suppress economic/faction |
| Is a non-hostile NPC present? | admit social, manipulation, NPC-specific |
| Player resource state (low health / low mana / low stamina) | admit desperation, escape, defensive, recovery |
| Player's learned skills and equipped gear | admit ability/weapon-specific archetypes only if actually usable |
| Active quest objectives (plan 10) | admit archetypes that advance an unmet objective |
| Recent repetition | suppress archetypes chosen in the last N turns, so the list stays fresh |

This runs in code, is testable, and costs nothing.

- [ ] **3.1** Build the taxonomy into a versioned config
      `packages/core/src/config/move-taxonomy.json` with the same discipline as
      `universal-actions.json`: `{ version, categories: [{ id, label, archetypes: [{ id, label,
      admitWhen: [...] }] }] }`. The `admitWhen` predicates are the Stage-1 signals above.
- [ ] **3.2** Curate on the way in. The owner gave full latitude ("add what you feel is missing,
      remove what is not needed"). Recommended removals: near-duplicates across categories (`Divide
      and conquer` appears in both manipulation and strategic; `Brave`/`Cynical`/`Petty` appear in
      both emotional and character-expression), and archetypes the engine cannot possibly support
      today (summoning, transformation, time-stop) — **hold those back until plan 09 gives them real
      actions**, or they will generate suggestions that the classifier then has to refuse.
      Record every removal with a reason so the curation is reviewable.
- [ ] **3.3** Some archetypes are pure flavour over the same mechanical action (`Heroic move` and
      `Cowardly move` may both be "attack"). That is fine and desirable — the archetype colours the
      *phrasing*, the `actionId` stays the mechanical truth.

### Stage 2 — model selects and phrases (bounded)

Hand the model the ~20-30 narrowed archetypes plus the existing scene context, and ask for six
suggestions, each tagged with the archetype it embodies.

```ts
export const SuggestedActionSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["action", "move", "dialogue"]),        // unchanged — FORM
  /** NEW — the intent archetype, from the narrowed candidate set. */
  archetypeId: z.string().min(1),
  /** NEW — its display category, for grouping in the UI. */
  archetypeCategory: z.string().min(1),
  text: z.string().trim().min(1).max(240),
  actionId: z.string().optional(),
  rationale: z.string().trim().min(1).max(160).optional(),
});
```

### Stage 3 — deterministic post-validation (engine-owned)

- [ ] **3.4** Reject any suggestion whose `archetypeId` was not in the narrowed set — the model may
      not smuggle in an archetype the situation does not warrant.
- [ ] **3.5** Reject any suggestion whose `actionId` is not in the sealed catalogue **and** whose
      gate the player would fail. A suggestion the player cannot act on is worse than no suggestion —
      this is a large part of the owner's "not all suggestions are relevant".
- [ ] **3.6** Enforce **diversity**: at most two suggestions from the same category, so the list is
      not six variations of "attack". Deterministic, applied after validation.
- [ ] **3.7** Backfill from the deterministic fallback if fewer than four survive.

## 4. Curation of the moral archetypes

The taxonomy includes deliberately cruel options (`Torture`, `Betrayal`, `Human shield`,
`Gaslighting`). The owner wants them available — this is a mature RPG and meaningful evil choices are
part of the genre.

- [ ] **4.1** Keep them, but never let the *rationale* field editorialise approvingly. The rationale
      should state the tactical consequence, not sell the act.
- [ ] **4.2** The UI must present them as available options, not as recommendations — a design
      question, and the one genuinely design-shaped part of this plan. Carry it in the design brief.
- [ ] **4.3** Exclude archetypes involving sexual content with the taxonomy's `Seduction`/`Flirt`
      entries from auto-suggestion unless the story's own blueprint establishes that register; the
      player can always type it themselves. Suggestion is endorsement in a way that free text is not.

## 5. Implementation steps

- [ ] **5.1** RED: Stage-1 narrowing is a pure function — combat active admits combat archetypes and
      suppresses economic; a lone player with no NPC present yields no social archetypes; low health
      admits desperation.
- [ ] **5.2** RED: a model suggestion citing an archetype outside the narrowed set is dropped.
- [ ] **5.3** RED: a suggestion whose `actionId` fails the player's gate is dropped.
- [ ] **5.4** RED: diversity cap — six suggestions never contain three from one category.
- [ ] **5.5** RED: fewer than four survivors triggers deterministic backfill.
- [ ] **5.6** Implement the config, the narrowing function, the prompt change, and the validators.
- [ ] **5.7** Bridge: `suggestActions` already exists on both bridges; the return type gains two
      fields. Update **both** and add a parity test.

## 6. Acceptance criteria

1. Every suggestion carries an archetype and category the situation actually admits.
2. No suggestion proposes an action the player would be denied.
3. Six suggestions never cluster in one category.
4. The taxonomy config is versioned and its curation decisions are documented.
5. Suggestions degrade gracefully to the deterministic fallback.
6. Suite green; typecheck clean; bridge parity test passing.

## 7. Risks

- **Prompt bloat.** Even 30 archetypes plus scene context adds tokens to a call that fires on every
  turn the player opens the drawer. Measure it.
- **Curation is opinionated** and the owner gave latitude — but record the reasoning (3.2) so it can
  be argued with rather than silently re-litigated.
- **Suggestion quality is hard to test objectively.** The tests above verify *validity*, not
  *relevance*. Relevance needs the owner's judgement in play; say so rather than claiming the tests
  prove the feature works.
