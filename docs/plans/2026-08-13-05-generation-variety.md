# Plan 05 — Generation variety

**Created:** 2026-08-13
**Covers owner finding:** 6 ("All new characters created with all attributes 10, there is generally
a huge lack of variety throughout not just here. Check all random generations like this and spice
them up a little")
**Size:** M
**Depends on:** nothing. Deliberately sequenced **before** plan 08 to prove the deterministic
variation approach on a small surface first.
**Blocked on owner decision D4.**
**Status:** Planned. Not authorized.

---

## 1. Evidence and root causes

Four separate sources of flatness, all confirmed in source.

### 1.1 Generic NPCs have no attributes at all

```ts
// packages/core/src/bootstrap/instantiate.ts:109-135  instantiateGeneric
return {
  characterId, isPlayer: false,
  attributes: {},           // <-- EMPTY
  resources, skills, inventory: [], flags: {}, alive: true,
};
```

Every NPC promoted from narration (Marta, Kellan, Daen, "And Daen") gets `attributes: {}`, so the
living card falls back to each `AttributeDef.defaultScore` — which the forge sets to 10 across the
board. That is the literal cause of "STR 10 / AGI 10 / END 10 / INT 10 / AFF 10 / RES 10" on every
card the owner screenshotted.

Worse than cosmetic: `resolver.ts` derives the attribute modifier from the actor's score, so **every
generic NPC has an identical +0 modifier on every check**. There is no mechanical difference between
a frail villager and a trained archer.

### 1.2 Generic NPC health is a constant

```ts
// instantiate.ts:91
const GENERIC_ENCOUNTER_HITS = 6;
```

Every generic NPC gets exactly six baseline natural hits of lethal resource — hence every card
reading `24 / 24`.

### 1.3 The forge is not asked for varied NPC templates

`NpcTemplateSchema` (`packages/core/src/types/schema.ts:159`) *does* support per-template
`attributes` and `resources`, so template NPCs **can** differ. Whether they actually do depends on
the Phase B prompt.

- [ ] **1.3a** Read `packages/core/src/bootstrap/prompts.ts` and record whether the NPC-template
      prompt asks for differentiated stats or merely for a list of NPCs. Do not assume.

### 1.4 Everything else that is uniform

- [ ] **1.4a** Audit and record actual current spread for each of: starting gear
      (`bootstrap/startingGear.ts`), skill grants at generic instantiation (always novice / 0
      successes), DC distribution across the generated catalogue, loot tier selection
      (`orchestrator/loot.ts`), and suggested actions. Report the measured spread before changing
      anything — "spice it up" needs a baseline.

## 2. The hard constraint

Attributes, resources and skills are **hard state**. Variety must therefore be:

- **Engine-derived and deterministic** — seeded, reproducible, and never a runtime model judgement;
  or
- **Forge-authored inside the frozen schema** — generated once at bootstrap, validated into bands,
  then immutable.

A model must never roll a stat at runtime. That is the authority wall, and it is also what makes
rollback and swipe work: a swipe must not change an NPC's strength.

## 3. Design — deterministic seeded variation within validated bands

### 3.1 The seed

```ts
// packages/core/src/bootstrap/variation.ts  (new)
/**
 * Deterministic per-character variation. The seed is derived from stable identity only, so the
 * same character always gets the same spread — across restarts, rollbacks, swipes, and re-reads.
 */
export function variationSeed(storyId: string, characterId: string): number;

export function variedAttributes(
  schema: StorySchema,
  characterId: string,
  profile: VariationProfile
): Record<string, number>;
```

Use a small, well-understood hash (FNV-1a or xxhash32 over `${storyId}:${characterId}`) → a seeded
PRNG. **Do not use `Math.random()`** — it would break determinism, rollback equivalence, and the
`swipe never re-rolls` invariant.

### 3.2 Variation profiles

```ts
type VariationProfile =
  | { kind: "generic" }                          // narration-promoted NPC
  | { kind: "template"; templateId: string }     // forge-authored, respects authored values
  | { kind: "role"; role: CharacterRole };       // once plan 04 lands
```

Proposed spreads (**owner decision D4**):

| Profile | Attribute spread | Lethal resource |
| --- | --- | --- |
| generic / neutral | baseline ±2 | `GENERIC_ENCOUNTER_HITS` ±1 hit |
| creature | baseline ±3, skewed toward physical attributes | ±2 hits |
| enemy | baseline ±3 | ±2 hits |
| party / ally | baseline ±2, one attribute favoured (+3) so allies feel individual | ±1 hit |
| template | **authored values win entirely** — never vary a forge-authored sheet | authored |

Rules that must hold regardless of the numbers chosen:

- Clamp to the schema's validated range (1..20, or the `superhuman` maximum) — `StorySchemaSchema`
  already enforces this in its `superRefine`, so a bad spread will surface as a Zod failure, which
  is the desired failure mode.
- Respect `lockedAtZero` attributes: they stay 0, always.
- Sum-preserving is **not** required, and deliberately so — some NPCs should simply be weaker.

### 3.3 Where it is applied

`instantiateGeneric` gains the variation, and — importantly — **starts producing a populated
`attributes` map** instead of `{}`. Check every consumer of `hard.attributes` for an assumption that
generic NPCs have none:

- [ ] **3.3a** Grep for `attributes` reads in `resolver.ts`, `attributes.ts`, `cardView.ts`,
      `dossier.ts`, `npcAgency.ts` and confirm each handles a populated map for a non-player. This
      is the most likely source of a regression.

## 4. Implementation steps

### Phase A — RED

- [ ] **4.1** `packages/core/test/bootstrap/variation.test.ts` (new):
  - the same `(storyId, characterId)` produces identical attributes across 100 calls — **determinism
    is the load-bearing property**;
  - different characterIds in the same story produce different spreads;
  - every produced score is within the schema's validated range;
  - a `lockedAtZero` attribute stays 0;
  - a template profile returns the authored values byte-identical.
- [ ] **4.2** `instantiate.test.ts`: two generic NPCs in the same story no longer have identical
  attributes, and neither has an empty attribute map.
- [ ] **4.3** Rollback equivalence: instantiate an NPC, capture a checkpoint, roll back, re-derive —
  attributes are byte-identical. This proves the swipe/rewind invariants survive.
- [ ] **4.4** Characterization of the four other flat surfaces from 1.4a, so the "before" is locked
  in before it is changed.

### Phase B — implement

- [ ] **4.5** Write `variation.ts`.
- [ ] **4.6** Apply to `instantiateGeneric`; leave `instantiateFromTemplate` authoritative.
- [ ] **4.7** Widen `GENERIC_ENCOUNTER_HITS` into a seeded range around the same centre — keep the
  existing constant as the midpoint so current balance is preserved on average.
- [ ] **4.8** Address 1.3a's finding in the forge prompt if templates are in fact undifferentiated.
- [ ] **4.9** Address the other surfaces from 1.4a, **one commit each**, so any balance regression can
  be bisected.

### Phase C — verify

- [ ] **4.10** Typecheck, both suites, and specifically the resolver/ledger/difficulty/playthrough
  suites — this change moves numbers that those tests assert on. Expect to update fixtures, and
  scrutinise every fixture change: an updated expectation that hides a real behaviour change is the
  failure mode here.
- [ ] **4.11** Existing saves: NPCs already persisted keep their stored (flat) attributes. **Do not
  migrate them** — rewriting persisted hard state to add variety would violate the ledger-only rule
  for no player benefit. New NPCs vary; old ones stay as they are. State this to the owner.

## 5. Acceptance criteria

1. Two generic NPCs in the same story have visibly different attributes and health.
2. The same NPC has identical attributes after restart, rollback, and swipe.
3. No score ever falls outside the schema's validated range; locked attributes stay 0.
4. Template NPCs keep their authored values exactly.
5. Existing persisted NPCs are untouched.
6. The engine coverage gate (100% branches under `src/engine/**`) still passes.
7. Suite green; typecheck clean.

## 6. Risks

- **Balance drift.** Varying NPC health and attributes changes encounter difficulty everywhere.
  Mitigate by centring every range on today's constant, so the *average* encounter is unchanged.
- **Fixture churn.** Many core tests assert exact numbers. Budget for it, and review each change.
- **Determinism is the whole game here.** If variation is not perfectly reproducible, swipe and
  rewind silently change NPC stats and the product's core promise breaks. Test 4.1 and 4.3 are not
  optional.
