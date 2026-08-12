# Plan 03 — Entity registry integrity

**Created:** 2026-08-13
**Covers owner findings:** 5 (duplicate "And Daen"), plus a second defect found while
investigating: raw `shadow_entity` id/name.
**Size:** M
**Depends on:** nothing.
**Status:** Planned. Not authorized.

---

## 1. Evidence

Live save, story `ab1c6258` (Cyraeth Adventure):

```
ab1c6258-...:scene:daen        "Daen"        present
ab1c6258-...:scene:and-daen    "And Daen"    present   <-- duplicate
ab1c6258-...:scene:marta       "Marta"       present
ab1c6258-...:scene:kellan      "Kellan"      present
```

The originating narrator prose:

> "I'm Marta. This is my grandson Kellan." *A nod toward the archer.* **"And Daen speaks for our
> village when things go wrong at bad hours."**

A sentence-initial conjunction was absorbed into the proper name. Both rows are present, both render
in the Present strip and living cards, and both are mechanically real.

Second defect, story `2debfbce` (Solo Leveling RPG):

```
id="shadow_entity"  name="shadow_entity"  tier=secondary  present
```

Every other NPC carries a `<storyId>:scene:<slug>` id and a humanised name. This row has a raw
snake_case string as **both** id and display name, and renders that way in the Present strip, the
living card, and the ruling artifact ("Shadow_entity's Natural attack fails").

## 2. Root cause

### 2.1 "And Daen" — a missing stop-word class

`packages/core/src/orchestrator/sceneEntityPromotion.ts` already carries three rejection sets:

| Set | Line | Rejects |
| --- | --- | --- |
| `NON_CHARACTER_IDENTITIES` | ~105 | anybody, anyone, everyone, someone, something … |
| `NON_CHARACTER_PROPER_ACTORS` | ~120 | the above **plus** `first`, `second`, `third` … |
| `GENERIC_HUMAN_ACTORS` | ~93 | boy, child, elder, girl, man, woman … |

These were added by migration 16's cleanup of the phantom `He` / `It` / `Third` rows. Pronouns and
ordinals are rejected. **Leading conjunctions and other sentence-initial function words are not.**
At the start of a quoted sentence, "And" satisfies the proper-name casing test exactly as a real
name would, so `And Daen` parses as a two-word proper name.

The bug class is *sentence-initial capitalisation is not evidence of a proper noun*. The existing
sets enumerate specific offending words; they do not encode the general rule.

### 2.2 `shadow_entity` — a different creation path

The id equals the name equals a raw identifier, and the id lacks the `:scene:` prefix that
`sceneEntityPromotion` generates. So this row was **not** created by narrated-entity discovery. The
two candidate paths are:

- `ensureHardState` (`orchestrator/turn.ts:226`) — when an intent references an unknown
  `characterId`, it inserts `{ id: characterId, name: templateHint ?? characterId }`. **A classifier
  that invents an actorId string therefore creates a character named after that string.**
- `mergeNarratedEntityTransitions` introducing a registrar proposal with a model-supplied id.

`ensureHardState` is the likely culprit and is the more dangerous of the two, because it means model
output becomes a registry identity with no grammar validation at all.

- [ ] **2.3** **Confirm which path created it before fixing.** Query `story_events` and
      `turn_operations` for story `2debfbce` for the first appearance of `shadow_entity`; check
      whether it appears in a `classified.npcIntents`/`playerIntents` `actorId` before it appears in
      the characters table. Record the answer in this plan. Do not fix blind.

## 3. Design

### 3.1 Reject sentence-initial function words (general rule, not a longer list)

Add to `sceneEntityPromotion.ts`:

```ts
/**
 * Function words that satisfy proper-name casing only because they begin a sentence or a quoted
 * clause. A capitalised token here is never the first token of a personal name.
 */
const SENTENCE_INITIAL_FUNCTION_WORDS = new Set([
  "and", "but", "or", "nor", "for", "yet", "so",          // coordinating conjunctions
  "if", "when", "while", "because", "although", "though", "since", "unless", "until", "after",
  "before", "as", "that", "which", "who", "whom", "whose",  // subordinators / relatives
  "then", "now", "here", "there", "still", "just", "even", "also", "again", "once",
  "a", "an", "the", "this", "that", "these", "those",
  "in", "on", "at", "by", "to", "of", "with", "from", "into", "onto", "over", "under",
  "not", "no", "yes", "well", "oh", "ah", "hey", "look", "listen",
]);
```

**Rule:** when a candidate name's **first** token (lowercased) is in this set, drop that token and
re-evaluate the remainder. If the remainder is still a valid candidate name, use it; if nothing
remains, reject the candidate entirely.

This is strictly better than rejecting the whole candidate: "And Daen" correctly becomes **"Daen"**,
which then merges with the existing `:scene:daen` row through the alias/coreference path that
already exists in `mergeNarratedEntityTransitions` (`turn.ts:137`). That is the desired outcome —
not a rejected observation, but a correctly attributed one.

**Do not apply this to non-initial tokens.** "Beatrice And Daen" is not a name either, but multi-word
names legitimately contain lowercase particles ("van der Berg", "de Luca"), and the existing
`properDisplayName` handling must not be disturbed. Restrict the rule to token index 0.

### 3.2 Humanise and namespace ids from `ensureHardState`

Independent of 2.3's outcome, `ensureHardState` must never mint a display name from a raw
identifier:

- If a character must be created there, derive the display name with the same
  `properDisplayName` / de-slugging used by `sceneEntityPromotion` (`shadow_entity` → "Shadow
  Entity"), and namespace the id as `<storyId>:scene:<slug>` for consistency.
- Better: **refuse**. An intent naming an unknown actor is a classifier error, and plan 02's
  grounding gate should already drop it. Consider making `ensureHardState` throw for an unknown
  non-player id once plan 02 has landed, rather than silently inventing a character.
- [ ] Decide between "humanise" and "refuse" once 2.3 identifies the path. Prefer **refuse** if
      plan 02 has landed; **humanise** if this plan ships first.

### 3.3 Cleanup migration for existing saves

Existing bad rows persist. Follow the precedent of migration 16 exactly — it deleted only *exact*,
*unused*, auto-generated rows and preserved anything mechanically referenced.

New migration (take the next free number; **17 is no longer reserved** — Plan 19 is cancelled per
`docs/PLAN-POLICY.md`, but confirm the current ladder head before choosing):

- Delete character rows whose name's first token is in `SENTENCE_INITIAL_FUNCTION_WORDS` **and**
  which are referenced by **zero** rulings, story events, or checkpoints, **and** where a row with
  the remainder-name exists in the same story.
- Scrub their presence/identity dimensions from turn checkpoints, as migration 16 did.
- **Never** delete a row that any ruling references — that would orphan mechanical history.
- Separately, rename (do not delete) rows whose display name matches `/^[a-z0-9]+(_[a-z0-9]+)+$/`
  to their humanised form, preserving id and all references.

## 4. Implementation steps

### Phase A — RED

- [ ] **4.1** `packages/core/test/orchestrator/sceneEntityPromotion.test.ts`:
  - the exact Marta/Kellan/Daen prose yields candidates `Marta`, `Kellan`, `Daen` — and **no**
    `And Daen`.
  - `"And Daen speaks..."` in isolation yields `Daen`.
  - `"But Marta refused."` yields `Marta`.
  - a legitimate name that merely starts with a listed word as part of the name is not mangled —
    e.g. `"Andrei nodded."` yields `Andrei`, not `rei`. **This is the critical regression test:**
    the rule must match whole tokens, never prefixes.
  - `"The woman studied you"` still yields the existing generic-human behaviour, unchanged.
- [ ] **4.2** Coreference: given an existing `:scene:daen` row, the prose above produces an
  *update/alias*, not a second introduction.
- [ ] **4.3** `ensureHardState` with an unknown id produces either a humanised name or a typed
  refusal (per 3.2), never a raw snake_case display name.
- [ ] **4.4** Migration test: a fixture DB containing `And Daen` (unreferenced) + `Daen` ends with
  only `Daen`; a fixture where `And Daen` **is** referenced by a ruling keeps both rows and only
  renames. Follow the existing migration-test pattern in `packages/core/test/store/`.

### Phase B — implement

- [ ] **4.5** Add `SENTENCE_INITIAL_FUNCTION_WORDS` and the token-0 strip-and-retry rule.
- [ ] **4.6** Resolve 2.3, then apply 3.2.
- [ ] **4.7** Write the migration.

### Phase C — verify

- [ ] **4.8** Typecheck + both suites green.
- [ ] **4.9** Run the migration against a **copy** of the owner's live save and report before/after
  character lists. Never run it against the original.

## 5. Acceptance criteria

1. The exact Cyraeth prose no longer creates "And Daen".
2. It correctly attributes the mention to the existing "Daen".
3. Names beginning with a function-word *prefix* (Andrei, Butler, Orson, Forrest, Thelma) are
   untouched — whole-token matching only.
4. No character is ever displayed with a raw snake_case name.
5. The migration removes the owner's existing "And Daen" row without touching any
   mechanically-referenced row.
6. Suite green; migration ladder consistent.

## 6. Risks

- **Over-stripping.** Mitigated by whole-token matching and test 4.1's `Andrei` case. This is the
  single most likely way to break this fix — do not use `startsWith`.
- **Migration deleting real history.** Mitigated by the zero-reference precondition and by copying
  migration 16's proven shape.
- Both bridges are unaffected (core-only change), so no parity work.
