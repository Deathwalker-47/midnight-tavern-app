> **DECOMMISSIONED 2026-08-12 - reference only, not a task list.**
> Every plan written before 2026-08-12 is retired by owner decision; anything here that had not
> already shipped by that date is **cancelled**, not deferred. Do not resume or cite this document
> as a reason to do work. See [`docs/PLAN-POLICY.md`](../docs/PLAN-POLICY.md).
> Behaviour this plan already produced is unaffected and stays defended by the test suite.

# Attribute Integration — Design Specification

A fully scoped spec for adding character **attributes** (STR/DEX/etc.-style raw capability stats) to the application. Attributes were missing from the original design, which modeled only skills (trained capability) and actions. This document defines how attributes slot into the already-locked architecture without disturbing the hard/soft wall, the per-turn pipeline, the classifier, the analyzer, or the summarizer.

This supplements — does not replace — `low-level-plan.md`, `claude-code-batch2.md`, and the design brief. It is the single source of truth for attributes; §14 lists exactly which lines of those documents need the deltas folded in. All decisions (D1–D11) and prior batch-2 decisions still hold.

Scope note: the blast radius is small. Only three components change behaviorally — the **bootstrapper** (generates attributes), the **engine** (uses them in the roll and can adjust them), and the **UI** (shows them in the system register). The narrator gets them as read context. Nothing else moves. §12 makes that explicit.

---

## 1. What attributes are (and why skills didn't cover it)

- **Skill** = "can this character do this specific trained thing, and how well?" (binary unlock + mastery rank). Already built.
- **Attribute** = "what is this character's raw underlying capability?" — independent of training. New.

Two things break without attributes, and both matter to the target audience (tabletop/CRPG/LitRPG players):

1. **Untrained/raw actions can't reflect who the character is.** Today "shove the door," "resist the poison," or "notice the ambush" with no matching skill rolls `d20 + 0` for everyone — a brute and a scholar are identical on a raw physical check.
2. **No build identity.** Two characters with the same skills are mechanically identical; there's no brute-vs-face differentiation. Attributes are what make builds feel distinct.

Attributes fill exactly that layer: the constant capability underneath the skill tree.

## 2. Locked decisions

| # | Decision | Resolution |
|---|----------|-----------|
| A1 | Source | **Generated per-story by the bootstrapper**, like resources/skills — not a fixed universal six. The set fits the premise's genre. |
| A2 | Count | **Soft guideline 3–6 in the prompt; no hard cap.** The model may exceed 6 (and may assign high scores) when an imported card/persona specifies attributes or the story/genre demands a wider capability space. Validation never fails on count. |
| A3 | statMode binding | `none` → no attributes. `light` → a compact attribute set with simple checks and little-to-no skill tree. `full` → attributes + full skill tree + items + action catalog. (This gives `light` a concrete meaning: "attributes without the skill-tree overhead.") |
| A4 | Mutability | **Essentially static.** Fixed at character creation; changed only through explicit gated catalog effects applied by the engine (an item, a curse, a story boon). No XP/leveling of attributes in v1. Skills still advance by mastery; attributes do not advance by use. |
| A5 | Representation | Store a familiar **score** (1–20 typical, 10–11 = average; may exceed 20 for superhuman) and derive an integer **modifier** via one centralized, tested function (§10). Players see "STR 16 (+3)". |
| A6 | Calibration | Modifiers stay small so they don't blow past the 5–25 DC band when stacked with mastery (§10). |

## 3. The core change — one new term in the roll

Everything mechanical about attributes reduces to adding one term to the resolver. No new resolution path.

```
before:  total = d20 + masteryMod(skill)                         vs DC
after:   total = d20 + attrMod(governingAttribute) + masteryMod(skill)   vs DC
```

- **Raw action** (no `requiresSkill`): `total = d20 + attrMod`. (This is the whole point of attributes — untrained checks now vary by character.)
- **Skilled action**: `total = d20 + attrMod + masteryMod`.
- **Action with neither skill nor governing attribute** (pure luck/flat): `total = d20`.
- Crit rules unchanged: natural 20 ⇒ crit success, natural 1 ⇒ crit failure, regardless of modifiers.
- **Opposed** actions: both sides roll `d20 + attrMod + masteryMod`; higher total wins; ties defend (existing rule). Symmetric.

Example ruling: `d20 (14) + STR (+3) + Blade Adept (+3) = 20 vs DC 15 → SUCCESS`. Raw check: `d20 (11) + DEX (+2) = 13 vs DC 12 → SUCCESS`.

## 4. Data model additions

All in `core/src/types/`, each with a matching Zod schema. These extend the structures in `low-level-plan.md §2`.

### 4.1 On the frozen `StorySchema`
```ts
export interface AttributeDef {
  id: string;              // "str", "dex", "reflexes", "power"…  (genre-dependent)
  name: string;            // "Strength"
  abbrev: string;          // "STR"
  description: string;     // what it governs, for the bootstrapper/UI/narrator
  defaultScore: number;    // typical starting score for an average character (usually ~10)
}
// StorySchema gains:  attributes: AttributeDef[];   // [] when statMode === "none"
```

### 4.2 On `ActionDef` (the Action Catalog)
```ts
// ActionDef gains:
governingAttribute?: string;   // attribute id whose modifier applies; omit for flat/luck actions
```
The governing attribute lives on the **action** (the unit of resolution), not the skill — the same skill may appear in actions governed by different attributes.

### 4.3 On character state (`CharacterHardState`, `NpcTemplate`, `StartingState`)
```ts
attributes: Record<string, number>;   // attributeId -> score
```
For generic NPCs instantiated without a full attribute set, missing attributes default to score **10 (modifier 0)** at read time — never write a full block for a throwaway NPC.

### 4.4 On `EffectSpec` (engine-applied attribute changes, A4)
```ts
// EffectSpec gains (both optional; used rarely, e.g. items/curses/boons):
attributeDeltaSelf?: Record<string, number>;    // e.g. { str: +1 }
attributeDeltaTarget?: Record<string, number>;  // e.g. { dex: -2 }
```
Applied only by the ledger, clamped to an absolute band (see §10). No model ever writes an attribute.

### 4.5 On `Condition` (attribute prerequisites — small, optional, high value)
```ts
// add a variant:
| { type: "attribute"; attributeId: string; min: number }   // score threshold
```
Lets a skill require, e.g., `STR ≥ 14` to learn — consistent with existing skill/resource/item/flag prerequisites.

## 5. Engine changes (`core/src/engine/`)

1. **`attributes.ts` (new):** `scoreToMod(score: number): number` (the one derivation function, §10) and `attrScore(actor, attributeId): number` (returns the actor's score or the schema `defaultScore`/10 fallback).
2. **`resolver.ts`:** in the modifier calc, add `attrMod = scoreToMod(attrScore(actor, action.governingAttribute))` when the action has a governing attribute; sum with the existing mastery modifier. Opposed contests add the term on both sides. No other logic changes.
3. **`gate.ts`:** evaluate the new `attribute` `Condition` variant (score ≥ min) alongside the existing prerequisite checks.
4. **`ledger.ts`:** apply `attributeDeltaSelf/Target` with clamping to the absolute band; the modifier re-derives automatically on next read (nothing caches modifiers). This is the only path that mutates an attribute.
5. **Tests (blocking):** raw-action rolls vary by attribute; skilled rolls sum both terms; missing-attribute fallback = 0; attribute prerequisite gating; ledger attribute delta + clamp; opposed contests symmetric; `scoreToMod` table exhaustively verified.

## 6. Bootstrapper changes (`core/src/bootstrap/`)

Attributes are foundational (skills' prerequisites and actions' governing attribute reference them), so **generate them early in Phase A**. Phase A output becomes `{ statMode, attributes, resources, tiers, skills }`; Phase B (`{ items, actions, startingState, npcTemplates }`) then assigns each action a `governingAttribute` and each character its starting scores.

### 6.1 Generation prompt rules (the A2 refinement, stated to the model)
- If `statMode === "none"` → `attributes: []`.
- Otherwise, generate an attribute set that fits the premise's genre, each with id/name/abbrev/description/defaultScore.
- **Count:** "Generally produce 3–6 attributes. However, if an imported character/story card or persona specifies particular attributes, honor them. And if the story or character concept calls for a broader capability space (e.g., a superhero setting with many distinct power axes) or unusually high capability, you may produce more than 6 attributes and/or assign high scores." No upper limit is enforced.
- **Card/persona honoring (A2):** if the seeding card or persona contains explicit attribute-like data or strong narrative cues ("unnaturally strong," "godlike reflexes"), create matching attributes and set the protagonist's starting scores to reflect them — including scores above the normal band when justified.
- Assign starting scores for every character in `startingState` and each `npcTemplate`; use the generation bands in §10.1 for ordinary characters and exceed them only with narrative justification.
- `light` mode: produce the compact attribute set and lean on attribute-only checks; generate little-to-no skill tree (A3).

### 6.2 Cross-validation additions (`validate.ts`)
- Every `governingAttribute` referenced by an action exists in `attributes`.
- Every `attribute`-type `Condition` references an existing attribute.
- `startingState` and every `npcTemplate` provide a score for every attribute (or rely on documented default).
- All scores within the absolute band `1..30` (§10). **Do not** validate the count against any cap.
- Existing checks unchanged.

## 7. statMode semantics (updated, A3)

| statMode | Attributes | Skills | Items | Action catalog | Rolls |
|---|---|---|---|---|---|
| `none` | none | none | none | none | none — pure narration |
| `light` | compact set (few attrs) | little to none | optional/minimal | present, mostly attribute-governed | `d20 + attrMod` on most actions |
| `full` | full set | full tree | full | full | `d20 + attrMod + masteryMod` |

`light` is now meaningfully distinct: it's the "roll against raw capability, no skill-tree bookkeeping" tier.

## 8. Pipeline & role touchpoints

- **Classifier:** *no change.* It still maps free text → catalog actions. The governing attribute is carried by the action definition; the classifier never needs to know attributes exist. Do not add attributes to its prompt.
- **Narrator:** the hard-state snapshot in context assembly (`low-level-plan.md §7.3` item 3) now includes attributes so prose can reflect them ("her powerful frame forces the door"). Read-only context; the narrator never sets them (the authority clause already forbids inventing mechanics).
- **Analyzer:** *no change and must stay that way.* Attributes are hard state; the analyzer's Zod schema forbids mechanical fields. Add attribute paths to the "must reject" test so an analyzer patch can never touch an attribute.
- **Summarizer:** may narrate an attribute change if one occurred (e.g., "the curse left her weakened") but does not track attributes mechanically.
- **Per-turn pipeline order:** unchanged. Attributes only add a term inside `resolver.resolve` (step 3) and an optional effect inside `ledger.commit` (step 6).

## 9. Character sourcing recap (where scores come from)

1. **Bootstrapper** generates the attribute set and every character's starting scores from premise + any seeding card/persona.
2. **Imported cards / personas** with explicit attributes or strong cues drive matching attributes and scores (A2).
3. **Generic NPCs** promoted to hard state via `NpcTemplate` use the template's scores, or the default-10 fallback for any attribute the template omits.
4. **Dev/advanced schema view** may edit individual scores post-freeze (consistent with M5.4). **No manual point-buy chargen UI in v1** (candidate for v2).

## 10. Score ↔ modifier system and balance

### 10.1 Derivation (recommended, audience-familiar)
```
mod = floor((score - 10) / 2)
```
| Score | 6–7 | 8–9 | 10–11 | 12–13 | 14–15 | 16–17 | 18–19 | 20–21 | 22–23 |
|-------|-----|-----|-------|-------|-------|-------|-------|-------|-------|
| Mod   | −2  | −1  | 0     | +1    | +2    | +3    | +4    | +5    | +6    |

Generation bands (ordinary characters): scores mostly **8–16** (mods −1..+3), with a signature stat up to **18** (+4). Heroic up to 20 (+5). Superhuman / card-specified may exceed 20. Absolute stored band for clamping: **1..30**.

### 10.2 Why this stays balanced
Typical total modifier = attrMod (−1..+4) + masteryMod (0..+7) ≈ **0..+11** against the fixed **DC 5–25** band — sane. Superhuman characters with very high attributes will dominate low/mid-DC actions, which is **correct** (a super-strong character *should* auto-pass "lift the gate"); their challenge comes from the high-DC actions the bootstrapper assigns for that power level. The DC scale never changes; character competence varies through modifiers. This is exactly what makes attributes matter.

### 10.3 One derivation function
`scoreToMod` is the sole place the score→mod rule lives; the UI, the ruling artifact, and the resolver all call it. It is trivially and exhaustively unit-tested. Never inline the formula anywhere else.

## 11. UI / design integration (for the design thread)

Attributes render exclusively in the **system register** (cool accent, monospace, tabular numerals) — same wall as resources/skills. Additions:

1. **Living Card drawer — sheet zone:** add a compact **Attributes** block: `STR 16 (+3)` rows (score + derived modifier), before or alongside resources. Keep it tight.
2. **Character Dossier (batch-2 point 7):** a full attributes section — each attribute's name, score, modifier, and its description available (inline or on hover). Sits in the dossier's system-register zone with the sheet.
3. **RulingArtifact (the signature element) — update required:** the roll breakdown must now display **multiple modifier terms** cleanly: `d20 (14) + STR (+3) + Blade Adept (+3) = 20 vs DC 15 → SUCCESS`, and the raw-check form `d20 (11) + DEX (+2) = 13 vs DC 12`. Design a layout that accommodates 1–3 stacked terms without crowding the artifact or breaking the die-settle → count-up → stamp motion. This is the one place attributes touch the product's signature moment — treat it with care; the count-up should sum the visible terms.
4. **"Recently changed" markers** apply to attribute scores too, on the rare occasions an effect changes one.
5. **No attribute authoring UI in the Story Blueprint editor** for v1 — attributes come from generation/card content. (The dev-view schema editor is the only place scores are hand-edited.) Do not add a point-buy screen.

## 12. What does NOT change (scope fence)

- The hard/soft wall. Attributes are hard state; only the engine writes them.
- The per-turn pipeline order and transaction semantics.
- The classifier's job and prompt (it never sees attributes).
- The analyzer's prohibition on mechanical fields (now extended to attributes in tests).
- Mastery advancement (unchanged; attributes don't advance by use).
- The DC band (5–25) and crit rules.
- Tokens, the two-register system, and the Ruling animation's core motion (only its internal layout gains term rows).

## 13. Edge cases

- **Missing attribute on a character:** read as score 10 (mod 0). Covers generic NPCs.
- **Action with no governing attribute:** attrMod term = 0 (flat/luck actions, and all actions in a `none`-mode story — which has no rolls anyway).
- **`light` mode with no skills:** actions resolve as `d20 + attrMod`; the mastery term is simply absent.
- **Attribute-gated skill learning:** the `attribute` `Condition` is checked at unlock like any prerequisite.
- **Effect drops a score below 1 or above 30:** clamp to the band; modifier re-derives.
- **Superhuman totals vs low DCs:** intended auto-success; not a bug (see §10.2).

## 14. How this folds into the existing documents

Rather than regenerating batch-2, fold these deltas in when convenient:
- **`low-level-plan.md`** — add `AttributeDef` and the `attributes`/`governingAttribute`/`attributeDelta*`/attribute-`Condition` fields to §2; add attribute generation to the M5 bootstrapper (Phase A) and its validation; add the attribute term to the M2 resolver and the §7.3 narrator snapshot; update the statMode table (§7 here) and the v1 exclusions (no point-buy chargen).
- **`claude-code-batch2.md`** — the character dossier (point 7) `Dossier` type gains an `attributes` section.
- **Design brief / batch-2 design doc** — Living Card sheet zone, dossier, and the RulingArtifact multi-term layout (§11).

## 15. v1 exclusions / v2 candidates
- Manual point-buy character creation (v2).
- Attribute advancement/leveling by play (deliberately excluded to preserve determinism; v2 could add engine-driven milestone increases).
- Derived/secondary stats computed from attributes (e.g., carry weight, initiative) — out of scope for v1; can be added as `defaultScore`-style derivations later.
