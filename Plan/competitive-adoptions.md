> **DECOMMISSIONED 2026-08-12 - reference only, not a task list.**
> Every plan written before 2026-08-12 is retired by owner decision; anything here that had not
> already shipped by that date is **cancelled**, not deferred. Do not resume or cite this document
> as a reason to do work. See [`docs/PLAN-POLICY.md`](../docs/PLAN-POLICY.md).
> Behaviour this plan already produced is unaffected and stays defended by the test suite.

# Implementation Spec — Batch 3: Competitive Adoptions (v1)

**For: Claude Code / Codex. Standalone — §1 gives you every piece of context needed to implement this without reading the other planning documents.**

Four features, drawn from a competitive review of shipped products in this space. All four are cheap, all four reinforce (rather than dilute) the product's core promise, and none of them require a new model call or a new model role.

| # | Feature | Touches | Depends on |
|---|---------|---------|-----------|
| 1 | Advantage / disadvantage on d20 rolls | engine, schema, bootstrapper | engine (M2) |
| 2 | Difficulty setting | engine, stories table, settings | engine (M2) |
| 3 | Regenerate with feedback | swipe orchestrator, narrator prompt | swipe (Batch 2 §6) |
| 4 | Mechanical Journal | new read-model + append-only event log | rulings persistence, Batch 2 rollback |

Build order: **1 → 2 → 4 → 3**. Features 1 and 2 are pure engine work and must land with the engine test suite green before anything else. Feature 4 is next because it is the cheapest and it makes 1 and 2 verifiable by eye. Feature 3 is last because it depends on Batch 2's swipe machinery.

---

## 1. Context you need (read this first)

### 1.1 What the product is

A local-first desktop roleplay application where an AI narrates interactive stories, and **the game mechanics are enforced by deterministic code rather than by the AI**. The differentiator is integrity: dice, skills, inventory, and health are computed by an engine the model cannot influence, so failure genuinely happens and the world can genuinely refuse the player.

### 1.2 The four architectural invariants (never violate these)

1. **Only the engine writes mechanical (hard) state.** Models never write skills, items, resources, attributes, or health. A separate "analyzer" model writes narrative (soft) state — mood, relationships, observations — and is schema-forbidden from mechanical fields. This separation is called *the wall*.
2. **Difficulty is pre-assigned and frozen.** Every action's DC is generated once at story creation, then the schema is locked. No model assigns difficulty at runtime.
3. **Rulings are computed before the narrator writes, committed after it returns**, in one transaction per turn. The narrator receives already-decided outcomes and is instructed to narrate them exactly.
4. **Every number is shown to the player.** The roll math is displayed in full (`d20 (14) + STR (+3) + Blade Adept (+3) = 20 vs DC 15 → SUCCESS`). If the player cannot verify the system told the truth, the feature is wrong.

Corollary that governs this entire document: **any new mechanical input must be deterministic and traceable to frozen schema data or to explicit player configuration. Never to a model's runtime judgment.**

### 1.3 Repository layout

```
packages/
  core/src/            # all non-UI logic; no React, no DOM
    types/             # schema.ts, hardState.ts, softState.ts, actions.ts, events.ts
    store/             # db.ts, migrations/, repositories/
    engine/            # dice.ts, gate.ts, resolver.ts, ledger.ts, attributes.ts
    classifier/        # free text → catalog actions
    router/            # provider adapters, role→model assignment
    bootstrap/         # generate.ts, validate.ts, repair.ts, freeze.ts
    memory/            # analyzer.ts, softStore.ts, cardView.ts
    summarizer/        # chapter.ts, arc.ts
    orchestrator/      # turn.ts, context.ts, swipe.ts, delete.ts
    journal/           # ← NEW in this batch
  ui/                  # React
  shell/               # Tauri
```

Rules: `core` never imports from `ui`. All model output passes Zod validation at the boundary. No raw SQL outside `store/repositories/`.

### 1.4 Existing types this batch modifies

```ts
export type Outcome = "crit_success" | "success" | "failure" | "crit_failure";
export type MasteryRank = "novice" | "adept" | "expert" | "master";
export const MASTERY_MOD: Record<MasteryRank, number> = { novice: 1, adept: 3, expert: 5, master: 7 };

export interface ActionDef {
  id: string;
  category: "combat" | "social" | "exploration" | "crafting" | "utility";
  label: string;
  requiresSkill?: string;
  minRank?: MasteryRank;
  requiresItemKind?: "weapon" | "armor" | "consumable" | "tool" | "key" | "misc";
  governingAttribute?: string;      // attribute id; omit for flat/luck actions
  dc: number;                       // 5 (trivial) – 25 (near-impossible)
  opposed?: boolean;
  costs?: CostSpec;
  effects: Record<Outcome, EffectSpec>;
}

export type EffectSpec = {
  resourceDeltaSelf?: Record<string, number>;
  resourceDeltaTarget?: Record<string, number>;
  attributeDeltaSelf?: Record<string, number>;
  attributeDeltaTarget?: Record<string, number>;
  scaleByItemProp?: string;
  grantItem?: { itemId: string; qty: number };
  setFlag?: { flagId: string; value: boolean };
  narrationHint: string;
};

export type Condition =
  | { type: "skill"; skillId: string; minRank?: MasteryRank }
  | { type: "resource"; resourceId: string; min: number }
  | { type: "attribute"; attributeId: string; min: number }
  | { type: "item"; itemId: string }
  | { type: "flag"; flagId: string; value: boolean };

export interface CharacterHardState {
  characterId: string;
  isPlayer: boolean;
  templateId?: string;
  attributes: Record<string, number>;                 // scores, band 1..30
  resources: Record<string, { current: number; max: number }>;
  skills: { skillId: string; rank: MasteryRank; successCount: number }[];
  inventory: { itemId: string; qty: number }[];
  flags: Record<string, boolean>;
  alive: boolean;
}
```

### 1.5 Current roll math (before this batch)

```
total = d20 + attrMod(action.governingAttribute) + masteryMod(action.requiresSkill)
outcome = natural 20 ? crit_success
        : natural 1  ? crit_failure
        : total >= dc ? success : failure
```

`attrMod` comes from `engine/attributes.ts`: `scoreToMod(score)` is the single centralized derivation function (never inline the formula anywhere else); `attrScore(actor, attributeId)` returns the actor's score or a default of 10 (modifier 0). Opposed actions roll the same formula on both sides; higher total wins; ties defend.

### 1.6 Existing database tables

```sql
stories(id, title, created_at, schema_json, locked, active_persona_id)
characters(id, story_id, name, is_player, hard_json, soft_json, soft_tier)
messages(id, story_id, idx, role, content, created_at, variants_json, active_variant)
rulings(id, story_id, message_id, ruling_json)
chapters(id, story_id, idx, msg_from, msg_to, title, summary)
arcs(id, story_id, idx, chapter_from, chapter_to, title, doc_json)
turn_checkpoints(id, story_id, message_id, turn_index, hard_pre_json, soft_pre_json, world_pre_json, created_at)
world_soft(story_id, soft_json)
lorebooks / lorebook_entries / story_lorebooks
personas(id, name, description, is_default)
settings(key, value)
```

Migrations are numbered SQL files run in order at startup. This batch adds **005** and **006**.

### 1.7 The per-turn pipeline (for orientation)

```
submitTurn(storyId, playerText):
 1. persist player message
 2. classified = classify(storyId, playerText)          // free text → catalog actions
 3. for each intent: ruling = resolver.resolve(...)     // computed, NOT committed
 4. context = assembleContext(storyId, rulings)
 5. prose = narrator.stream(context)                    // rulings inline, marked authoritative
 6. TRANSACTION: persist narrator message; ledger.commit(ruling) for each; persist rulings
 7. async: analyzer patch → soft state; summarizer chapter/arc checks
```

---

## 2. Feature 1 — Advantage / Disadvantage

### 2.1 Rationale

Roll-twice-keep-higher/lower is a near-universal convention in this genre and the target audience expects it. More importantly, it is the mechanism that makes *positioning* matter: hiding before you strike, fighting exhausted, attacking a restrained enemy. Without it, tactical setup has no mechanical expression and the classifier's catalog actions feel interchangeable.

### 2.2 The critical design decision

**Advantage is never assigned by a model.** Competing products let the narrator decide when a check is easier — which is exactly the runtime model judgment this architecture exists to eliminate. Instead:

> Advantage and disadvantage are derived by the engine from **schema-declared conditions evaluated against current hard state**.

The bootstrapper generates `advantageWhen` / `disadvantageWhen` condition lists on actions at story creation, and they freeze with the rest of the schema. At resolve time the engine evaluates them against the actor's (and for opposed actions, the target's) hard state. Because the existing `Condition` type already covers flags, resources, attributes, items, and skills, this needs no new condition machinery.

This produces a genuinely better game loop: a `hide` action whose success sets flag `hidden`, plus `attack_melee` carrying `advantageWhen: [{type:"flag", flagId:"hidden", value:true}]`, makes stealth mechanically real — and every link in that chain is code.

### 2.3 Types

```ts
// types/actions.ts
export type RollMode = "normal" | "advantage" | "disadvantage";

// ActionDef gains (both optional, both frozen with the schema):
advantageWhen?: ConditionWithReason[];
disadvantageWhen?: ConditionWithReason[];

export interface ConditionWithReason {
  condition: Condition;
  reason: string;    // short, player-facing: "Target is unaware", "Exhausted"
}
```

`reason` is required because the ruling artifact must be able to tell the player *why* they got advantage. A modifier the player cannot explain is indistinguishable from the system cheating.

### 2.4 Roll mode resolution

New function in `engine/resolver.ts` (or a small `engine/rollMode.ts`):

```ts
export interface RollModeResult {
  mode: RollMode;
  advantageSources: string[];   // reasons whose conditions matched
  disadvantageSources: string[];
}

export function computeRollMode(
  schema: StorySchema,
  action: ActionDef,
  actor: CharacterHardState,
  target?: CharacterHardState,
): RollModeResult
```

Algorithm:

1. Evaluate every entry in `action.advantageWhen` against **the actor's** hard state using the existing condition evaluator (the same one the gate uses — reuse it, do not fork it). Collect the `reason` of each match into `advantageSources`.
2. Same for `action.disadvantageWhen` → `disadvantageSources`.
3. **Cancellation rule:** if both lists are non-empty, the mode is `normal`. Sources are still recorded and both are displayed, so the player sees "Hidden (advantage) and Exhausted (disadvantage) — cancelled."
4. If only advantage matched → `advantage`. If only disadvantage → `disadvantage`. If neither → `normal`.
5. **Multiple sources do not stack.** Three advantage conditions matching still yields exactly one advantage. This is deliberate: it keeps the effect bounded and the math legible.

For **opposed** actions, each side computes its own mode independently — the actor's conditions evaluate against the actor, the target's against the target. An attacker with advantage against a defender with disadvantage is a legitimate and dramatic outcome; do not try to net them against each other.

### 2.5 Dice

`engine/dice.ts` gains:

```ts
export interface DiceRoll {
  dice: number[];      // [14] for normal, [14, 8] for advantage/disadvantage
  usedIndex: number;   // index into dice[]
  natural: number;     // dice[usedIndex]
}

export function rollD20Mode(mode: RollMode, rng?: RNG): DiceRoll
```

- `normal` → one die, `usedIndex = 0`.
- `advantage` → two dice, `usedIndex` points at the **higher** value (on a tie, index 0).
- `disadvantage` → two dice, `usedIndex` points at the **lower** value (on a tie, index 0).

Keep the existing `rollD20(rng)` as the primitive; `rollD20Mode` calls it once or twice. RNG stays injectable for tests.

### 2.6 Crit determination — the subtle part

**Crits are determined by the used die only.**

```
natural === 20 → crit_success
natural === 1  → crit_failure
```

Not "any die shows 20." With advantage you roll two dice and keep the higher, so your crit chance nearly doubles (1 − 0.95² ≈ 9.75%) — that is the correct and expected behavior of this mechanic. With disadvantage, crit-failure chance rises identically. Do not add special handling; just make sure crit checks read `natural`, never `dice[0]`.

### 2.7 Resolver integration

In `resolve()`, insert the roll-mode step between the gate check and the roll:

1. Gate check (unchanged). On denial → ruling with `gate.allowed = false`, no roll, no effects. **Do not compute roll mode for denied actions.**
2. Pay costs (unchanged — costs are paid on attempt, win or lose).
3. `rollModeResult = computeRollMode(schema, action, actor, target)`.
4. `diceRoll = rollD20Mode(rollModeResult.mode, rng)`.
5. Build the modifier terms (see §5.1): attribute term, mastery term.
6. `total = diceRoll.natural + sum(terms)`.
7. Outcome per §2.6 and the DC comparison (DC now includes the difficulty offset — see Feature 2).
8. Populate the `RollRecord` with `dice`, `usedIndex`, `natural`, `rollMode`, both source lists, and the terms.

### 2.8 Bootstrapper changes

`bootstrap/generate.ts` Phase B (which produces items, actions, starting state, NPC templates) must be told to generate these conditions. Prompt rules to state explicitly:

- Add `advantageWhen` / `disadvantageWhen` to roughly **a quarter to a third of actions** — the ones where positioning, resources, or equipment plausibly matter. Sparse is correct; a catalog where every action has conditions is noise.
- **Maximum 2 conditions per list, per action.** More than that is unreadable in a ruling artifact.
- Every `reason` must be a short player-facing phrase (≤ 40 chars), not a rules explanation.
- Prefer conditions the player can *cause*: flags set by other catalog actions, resources they spend, items they carry. Conditions on immutable attributes are weak design (they never change) — allow but discourage.

`bootstrap/validate.ts` cross-validation additions (all feed the existing repair loop with precise messages):

- Every `condition` inside `advantageWhen`/`disadvantageWhen` references an existing skill / resource / attribute / item / flag id.
- ≤ 2 entries per list.
- Every `reason` is non-empty and ≤ 40 characters.
- **Dead-flag check:** for every flag referenced in an advantage/disadvantage condition, at least one action in the catalog can set that flag via `effects[*].setFlag`. If nothing can ever set it, the condition is unreachable — repair by either adding the flag to a plausible action's effects or dropping the condition. This one matters; unreachable conditions are silent dead weight.

### 2.9 Schema versioning

Bump `StorySchema.schemaVersion` from `1` to `2`. The reader must be tolerant: a v1 schema simply has no `advantageWhen`/`disadvantageWhen`, so every action resolves `normal`. **No data migration is required and existing frozen stories keep working** — do not write one.

### 2.10 UI data contract

The ruling artifact needs, per roll: `dice[]`, `usedIndex`, `rollMode`, `advantageSources[]`, `disadvantageSources[]`. Render both dice with the unused one visibly struck through or dimmed, label the mode, and list the reasons. When sources cancelled, show both lists and the cancellation. (The corresponding design work is a separate request; this section defines only the data the UI receives.)

### 2.11 Tests (blocking)

Seeded RNG throughout.

- Normal mode rolls exactly one die; `dice.length === 1`.
- Advantage keeps the higher; disadvantage keeps the lower; ties resolve to index 0 in both.
- Both dice are persisted in the ruling, not just the used one.
- Crit success fires on `natural === 20` when the *other* die is not 20; crit failure likewise.
- No crit when a discarded die shows 20 but the used die does not.
- One advantage condition and one disadvantage condition matching → `normal`, both source lists populated.
- Three advantage conditions matching → still exactly `advantage`, three reasons recorded.
- Opposed contest with attacker advantage and defender disadvantage → both modes applied independently.
- Gate-denied action produces no roll and no roll-mode computation.
- A v1 schema (no condition fields) resolves `normal` for every action.

---

## 3. Feature 2 — Difficulty setting

### 3.1 Rationale

A player-chosen difficulty is table stakes for the genre, and it solves a real problem: the same frozen schema has to serve someone who wants a power fantasy and someone who wants to be punished. Because it is chosen by the player and displayed in every ruling, it costs the integrity promise nothing.

### 3.2 The design decision

Difficulty is a **play setting, not a schema property.** The schema stays frozen and untouched; difficulty applies a transparent, bounded, player-controlled adjustment at resolve time, and **every ruling shows the adjustment**. A DC 15 action under Hard displays as `vs DC 15 → 17 (Hard)`, never as a silent 17.

Two levers only:

1. **`dcOffset`** — added to the DC of **player-side actions only**. (Applying it to NPC rolls too would cancel out and make the setting meaningless.)
2. **Damage multipliers** — `damageTakenMultiplier` scales damage dealt *to* player-side characters; `damageDealtMultiplier` scales damage dealt *by* them.

### 3.3 Types and presets

```ts
// types/difficulty.ts
export type DifficultyPreset = "story" | "standard" | "hard" | "brutal" | "custom";

export interface DifficultyConfig {
  preset: DifficultyPreset;
  dcOffset: number;                 // clamped to [-4, +4]
  damageTakenMultiplier: number;    // clamped to [0.25, 2.5]
  damageDealtMultiplier: number;    // clamped to [0.25, 2.5]
}

export const DIFFICULTY_PRESETS: Record<Exclude<DifficultyPreset, "custom">, Omit<DifficultyConfig, "preset">> = {
  story:    { dcOffset: -2, damageTakenMultiplier: 0.6, damageDealtMultiplier: 1.25 },
  standard: { dcOffset:  0, damageTakenMultiplier: 1.0, damageDealtMultiplier: 1.0  },
  hard:     { dcOffset: +2, damageTakenMultiplier: 1.3, damageDealtMultiplier: 0.9  },
  brutal:   { dcOffset: +4, damageTakenMultiplier: 1.6, damageDealtMultiplier: 0.8  },
};
```

Default for a new story: `standard`. `custom` lets power users set the three values directly, clamped to the ranges above.

### 3.4 DC application

```
dcEffective = clamp(action.dc + (isPlayerSide(actor) ? difficulty.dcOffset : 0), 5, 25)
```

The clamp to **[5, 25]** is important: it is the same band the bootstrapper assigns DCs within, so difficulty can never push an action outside the range the schema was balanced for. A DC 25 action under Brutal stays 25, not 29.

`isPlayerSide(actor)` = `actor.isPlayer === true`. (If party companions are later introduced as player-side, extend this one predicate — do not scatter the check.)

For **opposed** actions there is no DC, so `dcOffset` does not apply. Difficulty affects opposed contests only through the damage multipliers. Document this in the settings UI copy so it isn't perceived as a bug.

### 3.5 Damage application

Applied in `engine/ledger.ts` at the point deltas are computed, **before clamping to resource bounds**:

1. The multiplier applies **only to negative resource deltas** (damage). Positive deltas (healing, restoration) are never scaled — otherwise Story mode would weaken the player's own healing, which is backwards.
2. Choose the multiplier by *recipient*, not by actor: a delta landing on a player-side character uses `damageTakenMultiplier`; a delta landing on a non-player character uses `damageDealtMultiplier`.
3. `scaled = Math.round(base * multiplier)`.
4. **Minimum-bite rule:** if `base <= -1` and `scaled === 0`, set `scaled = -1`. A hit that connects always costs something; rounding must never silently nullify damage.
5. Then apply the existing clamping to `[0, max]` and the existing death check.
6. Attribute deltas are **never** scaled by difficulty. They are rare, structural, and scaling them would produce fractional attribute drift.

### 3.6 Persistence

Migration `005_difficulty.sql`:

```sql
ALTER TABLE stories ADD COLUMN difficulty_json TEXT;
```

Null is read as the `standard` preset (so existing stories need no backfill). Written at story creation and whenever the player changes it.

Also record the change as a journal event (Feature 4): `difficulty_changed`, with the before and after presets.

### 3.7 Changing difficulty mid-story

Allowed, and it takes effect from the **next turn onward only**. Never retroactive: committed rulings are historical fact and must not be recomputed. The journal entry makes the change visible in the record, which pre-empts the "why did this fight suddenly get harder" confusion.

### 3.8 Ruling provenance

Every ruling carries a `DifficultySnapshot` of the config in force when it was computed (see §5.1). This is what lets the journal render an accurate historical record even after the player changes the setting.

### 3.9 UI data contract

- Story creation flow: a difficulty picker, defaulting to Standard, with one line of plain description each.
- Story Settings: the same picker plus the `custom` fields, and a note that changes apply going forward.
- Ruling artifact: when `dcOffset !== 0`, show base → effective and the preset name. When a damage multiplier applied, show it in the effects line (`8 damage (×1.3 Hard)`).

### 3.10 Tests (blocking)

- Each preset produces its documented offsets and multipliers.
- `dcEffective` clamps at 5 and at 25 in both directions.
- `dcOffset` applies to a player actor and does **not** apply to an NPC actor.
- Opposed contests ignore `dcOffset` entirely.
- Negative deltas scale; positive deltas do not.
- Minimum-bite: base −1 at ×0.6 yields −1, not 0.
- Rounding is deterministic (`Math.round`) — assert exact values, e.g. base −5 at ×1.3 → −7 (6.5 rounds to 7... assert the actual language semantics and lock them in a test rather than assuming).
- Attribute deltas are unaffected by difficulty.
- Changing difficulty mid-story does not alter previously committed rulings or hard state.
- A story with `difficulty_json = NULL` behaves exactly as `standard`.

---

## 4. Feature 3 — Regenerate with feedback

### 4.1 Rationale

Swipe already exists (Batch 2 §6): it regenerates the narrator's prose for the latest turn while the dice outcome stands. Feedback makes that regeneration *steerable* — "shorter," "she wouldn't say that," "more tension" — instead of a blind reroll of the same prompt. It is the single most-loved small feature in competing products and it costs one optional string.

### 4.2 The invariant this must not break

**Swipe regenerates the telling, not the outcome.** The ruling is fixed, the dice are not re-rolled, hard state is untouched across every variant. Feedback does not change this in any way: it is a *style directive*, and it must be structurally incapable of altering mechanics.

Guardrails, all of which need a test:

1. Feedback text is inserted into the narrator prompt **in the style slot, before the framework authority clause** (which is always last and always wins). It can never override "the outcomes below are final."
2. Feedback is capped at **300 characters**. This bounds both the context cost and the prompt-injection surface.
3. Feedback is stored **on the variant record**, never appended to message content — so it never enters story history, never reaches the analyzer, and never appears in any subsequent turn's assembled context.
4. Feedback is never sent to the summarizer or the analyzer.

### 4.3 Types

Batch 2 added `messages.variants_json` and `messages.active_variant`. Formalize the variant shape:

```ts
export interface NarratorVariant {
  index: number;
  prose: string;
  feedback?: string;         // the steering note that produced THIS variant
  softPatchJson?: string;    // the analyzer patch produced from this variant's prose
  createdAt: number;
}
```

**Tolerant reader:** if `variants_json` parses as `string[]` (the earlier shape), upgrade it in memory to `NarratorVariant[]` with `index`, `prose`, and `createdAt = message.created_at`. Persist the upgraded shape on next write. No migration file needed.

### 4.4 Swipe with feedback — algorithm

`orchestrator/swipe.ts`, extending the existing `swipe(storyId)` to `swipe(storyId, feedback?: string)`:

1. Restrict to the latest narrator message (unchanged v1 limitation).
2. Validate `feedback`: trim; if longer than 300 chars, reject with a specific error (do not silently truncate — the user should know).
3. Restore the soft-state and world-state pre-images from this turn's checkpoint. **Do not touch hard state, rulings, or the ledger.**
4. Re-assemble the narrator context **identically to the original turn**, including the same rulings, then insert the feedback block if present:

```
[DIRECTION FOR THIS RETELLING — style and emphasis only; it does not change any outcome below]
<feedback text>
```

Placement: in the narrator system frame's style slot, after any user-authored story prompt and **before** the framework authority clause and the rulings block.

5. Stream the narrator → new prose.
6. Append a new `NarratorVariant` with the prose and the feedback; set `active_variant` to the new index.
7. Run the analyzer on the new prose → `SoftStatePatch` → apply it, and store it as `softPatchJson` on the variant.

### 4.5 Cycling between existing variants

Cycling `‹ ›` does **not** call any model. To switch to variant *n*:

1. Restore the soft/world pre-images from the turn checkpoint.
2. Apply variant *n*'s stored `softPatchJson`.
3. Set `active_variant = n`.

Hard state is never involved. If a variant has no stored patch (upgraded legacy variant), skip step 2 and leave soft state at the pre-image.

### 4.6 Quick-feedback presets

Ship a small set of canned strings the UI can offer as one-tap chips alongside the free-text field. These are plain constants in core so both the UI and tests reference the same list:

```ts
export const FEEDBACK_PRESETS = [
  { id: "shorter",      label: "Shorter",        text: "Tell this more concisely." },
  { id: "longer",       label: "More detail",    text: "Expand this with more sensory detail." },
  { id: "tension",      label: "More tension",   text: "Raise the tension; make the stakes feel sharper." },
  { id: "plainer",      label: "Less flowery",   text: "Use plainer, more direct prose." },
  { id: "different",    label: "Different take", text: "Take a noticeably different approach to narrating this." },
] as const;
```

### 4.7 UI data contract

The swipe control (existing) gains an optional feedback affordance: a small input revealed on demand plus the preset chips. The variant counter continues to display `‹ 2/3 ›`. When a variant was produced with feedback, expose that text on hover/expand so the player can see why it reads differently.

### 4.8 Tests (blocking)

- Hard state is byte-identical before and after a feedback swipe.
- The ruling is unchanged; no new dice are rolled; `dice[]` in the ruling is identical.
- Feedback appears in the assembled narrator prompt for the regeneration.
- Feedback does **not** appear in the assembled context of the *next* turn.
- Feedback is not present in the message content persisted to `messages`.
- Feedback > 300 chars is rejected with a specific error.
- The authority clause remains the last element of the narrator frame with feedback present.
- Cycling to an earlier variant restores that variant's soft patch and calls no model.
- A legacy `string[]` variants payload is read, upgraded, and written back in the new shape.

---

## 5. Feature 4 — Mechanical Journal

### 5.1 Rationale

Every ruling is already computed and persisted. Surfacing them as a browsable, exportable record costs almost nothing and produces the product's strongest trust artifact: a complete, verifiable log of every mechanical decision the engine ever made. It is also the fastest way to make Features 1 and 2 visibly correct during development.

**Scope boundary:** the journal is a **hard-state ledger only**. Narrative content lives in chapters and arc documents; the journal contains rolls, gates, effects, and mechanical milestones. Do not mix them — the separation is precisely what makes the journal verifiable.

### 5.2 Consolidated `Ruling` shape

Features 1 and 2 both extend the ruling, and the journal renders it, so here is the complete shape. This supersedes the earlier definition.

```ts
export interface Ruling {
  turnId: string;
  actorId: string;
  actionId: string;
  targetId?: string;
  gate: { allowed: boolean; reason?: string };
  roll?: RollRecord;
  opposedRoll?: RollRecord;              // the target's roll, for opposed actions
  effectsApplied: AppliedEffects | null;
  costsPaid?: CostSpec;
  difficulty: DifficultySnapshot;        // config in force when computed
}

export interface RollRecord {
  dice: number[];                        // [14] or [14, 8]
  usedIndex: number;
  natural: number;                       // dice[usedIndex]; crit determination reads THIS
  rollMode: RollMode;
  advantageSources: string[];
  disadvantageSources: string[];
  terms: RollTerm[];                     // ordered, displayable modifier breakdown
  modifier: number;                      // sum of terms[].value
  total: number;                         // natural + modifier
  dcBase: number;
  dcOffset: number;
  dcEffective: number;
  outcome: Outcome;
}

export interface RollTerm {
  label: string;                         // "STR", "Blade Adept"
  value: number;                         // +3
  kind: "attribute" | "mastery" | "other";
}

export interface AppliedEffects {
  base: EffectSpec;                                  // the schema's outcome-table entry
  resourceDeltaSelf?: Record<string, number>;        // final: post-scaling, post-clamp
  resourceDeltaTarget?: Record<string, number>;
  attributeDeltaSelf?: Record<string, number>;
  attributeDeltaTarget?: Record<string, number>;
  grantedItem?: { itemId: string; qty: number };
  flagSet?: { flagId: string; value: boolean };
  damageScale?: { multiplier: number; reason: string };   // e.g. 1.3, "Hard"
}

export interface DifficultySnapshot {
  preset: DifficultyPreset;
  dcOffset: number;
  damageTakenMultiplier: number;
  damageDealtMultiplier: number;
}
```

`terms` exists so the UI never re-derives the math. The ruling is self-describing: anything displayed comes from the record, not from a recomputation that could drift.

### 5.3 The event log

Most journal content is derivable from `rulings`, but some milestones (death, difficulty change, chapter boundaries) are not. Rather than reconstruct them fragilely at read time, write an **append-only event log** inside the same per-turn transaction that commits the ledger.

Migration `006_journal.sql`:

```sql
CREATE TABLE story_events(
  id TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  turn_index INTEGER,            -- nullable: some events are not turn-bound
  message_id TEXT,               -- nullable
  ruling_id TEXT,                -- set for kind='ruling'
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_story_events_story_turn ON story_events(story_id, turn_index);
CREATE INDEX idx_story_events_kind ON story_events(story_id, kind);
```

Event kinds and their payloads:

| kind | payload | written by |
|---|---|---|
| `ruling` | `{ rulingId }` (the ruling itself lives in `rulings`) | ledger commit |
| `gate_denied` | `{ actorId, actionId, reason }` | ledger commit (also emitted as a `ruling`; this kind exists for cheap filtering) |
| `skill_unlocked` | `{ characterId, skillId, via }` | ledger |
| `rank_up` | `{ characterId, skillId, from, to }` | ledger |
| `item_gained` / `item_lost` | `{ characterId, itemId, qty }` | ledger |
| `attribute_changed` | `{ characterId, attributeId, from, to }` | ledger |
| `death` | `{ characterId, causeRulingId? }` | ledger |
| `difficulty_changed` | `{ from: DifficultyConfig, to: DifficultyConfig }` | settings handler |
| `chapter_started` | `{ chapterId, idx, title }` | summarizer |
| `arc_completed` | `{ arcId, idx, title }` | summarizer |

**The engine is the only writer for every mechanical kind.** The wall applies here exactly as it does to hard state: no model output ever produces a journal event. Soft-state changes (mood, relationships, observations) do **not** appear in the journal.

### 5.4 Read model

`core/src/journal/journal.ts`:

```ts
export interface JournalQuery {
  storyId: string;
  kinds?: JournalEventKind[];      // default: all
  chapterIdx?: number;             // restrict to one chapter
  turnRange?: { from: number; to: number };
  actorId?: string;
  limit?: number;                  // default 200
  before?: number;                 // cursor: created_at, for pagination
}

export interface JournalEntry {
  id: string;
  kind: JournalEventKind;
  turnIndex?: number;
  createdAt: number;
  chapterIdx?: number;             // resolved from chapters by turn index
  summary: string;                 // one-line, pre-rendered, e.g.
                                   // "Kestrel — Attack (melee): d20 (18) + STR (+3) + Blade Adept (+3) = 24 vs DC 17 (Hard) → SUCCESS"
  ruling?: Ruling;                 // full record when kind === 'ruling'
  payload: unknown;                // typed per kind
}

export function getJournal(q: JournalQuery): JournalEntry[];
export function exportJournal(storyId: string, format: "markdown" | "csv"): string;
```

Implementation notes:

- Join `story_events` → `rulings` for `kind = 'ruling'`; resolve `chapterIdx` by locating the chapter whose `[msg_from, msg_to]` contains the turn index.
- `summary` is rendered **from the stored ruling**, never recomputed from the current schema or current difficulty. A ruling made under Standard must still read as Standard after the player switches to Brutal.
- Order by `created_at` ascending within a chapter; the UI groups by chapter.
- Pure read model. No writes, no model calls.

### 5.5 Export

`exportJournal` produces a plain artifact the player can keep or share:

- **markdown** — grouped by chapter with headings, one line per entry, monospace-friendly roll math.
- **csv** — one row per entry: `turn_index, chapter, kind, actor, action, dice, mode, modifier, dc_base, dc_effective, total, outcome, effects, difficulty_preset`.

Deterministic output for identical input (assert this in a test).

### 5.6 Rollback interaction — do not miss this

Batch 2's `delete last exchange` and `rewind to here` must also delete the corresponding `story_events` rows, in the same transaction as the message/ruling/checkpoint deletion. An orphaned journal event after a rewind is a visible correctness bug: the record would show a roll that no longer exists in the story.

Specifically:
- Delete-last: remove events where `turn_index` equals the deleted turn.
- Rewind-to-here: remove events where `turn_index >= target turn index`, plus any `chapter_started` / `arc_completed` events for summaries being deleted.
- `difficulty_changed` events are **not** turn-bound; leave them unless their `created_at` falls after the rewind point, in which case delete them too and restore the prior difficulty config on the story row.

### 5.7 UI data contract

A Journal view (per story, alongside Overview): chapter-grouped list of entries, filter chips by kind (`Rolls`, `Denied`, `Progression`, `Items`, `Milestones`), an actor filter, and an Export button. Entries render the full roll math in the system register. Denied-gate entries are visually distinct from failed rolls — refusing an action and failing a roll are different events and the journal is where that distinction is most legible.

### 5.8 Tests (blocking)

- Every committed ruling produces exactly one `ruling` event; no duplicates on retry.
- Rank-up, skill unlock, item gain/loss, attribute change, and death each produce their event with correct payload.
- `difficulty_changed` records both before and after configs.
- Journal entries render historical difficulty, not current: change difficulty after a turn and assert the old entry's summary is unchanged.
- Delete-last removes exactly that turn's events and no others.
- Rewind removes all events at or after the target turn, including chapter/arc events for deleted summaries.
- Filters and pagination return stable, correctly ordered results.
- `exportJournal` is deterministic for identical input, in both formats.
- No journal event is ever produced by analyzer or summarizer prose content (assert the analyzer path writes zero `story_events` rows).

---

## 6. Consolidated migrations

Run in order at startup, after Batch 2's `002`–`004`:

| File | Contents |
|---|---|
| `005_difficulty.sql` | `ALTER TABLE stories ADD COLUMN difficulty_json TEXT;` (NULL reads as `standard`) |
| `006_journal.sql` | `CREATE TABLE story_events(...)` + the two indexes (§5.3) |

No migration is needed for advantage/disadvantage (schema-internal, version-tolerant reader) or for variant feedback (tolerant reader upgrades the JSON shape in place).

---

## 7. Consolidated build order and acceptance

| Step | Work | Accepted when |
|---|---|---|
| 1 | Feature 1 — types, `rollD20Mode`, `computeRollMode`, resolver integration, bootstrapper generation + validation | Engine suite green including all §2.11 cases; a generated story contains conditions on 25–33% of actions with no dead flags |
| 2 | Feature 2 — difficulty config, DC offset, damage scaling in the ledger, persistence | All §3.10 cases green; the same scripted 50-turn playthrough run under each preset shows monotonically increasing player damage taken and no out-of-band DCs |
| 3 | Feature 4 — event log, read model, export, rollback cleanup | All §5.8 cases green; a 100-turn scripted playthrough produces a journal whose ruling count exactly equals the `rulings` row count, and rewind leaves zero orphans |
| 4 | Feature 3 — feedback plumbing, variant shape, cycling, presets | All §4.8 cases green; hard-state equality across 5 consecutive feedback swipes on the same turn |

Engine tests remain release-blocking at 100% branch coverage on `engine/`. Any failure in §2.11, §3.10, or §5.8 blocks the batch — these are the tests that prove the integrity claim, and the claim is the product.

---

## 8. Explicitly out of scope for this batch

Do not build these; they were considered and deferred deliberately.

- **Status effects, elemental reactions, initiative, turn-order combat.** A full combat subsystem is a v2 feature with its own schema surface. Advantage/disadvantage delivers most of the tactical texture at a fraction of the cost.
- **Gap-interview bootstrapping** (asking the user targeted questions to enrich a thin schema before freezing) — a v2 upgrade to story creation.
- **Difficulty affecting anything other than DC offset and damage multipliers.** No hidden fudging, no rubber-banding, no "mercy" rules. If it isn't visible in the ruling, it doesn't exist.
- **Model-assigned advantage.** Under no circumstances should the classifier, narrator, or any other role be given the ability to grant advantage or disadvantage. If a situation seems to warrant it and no condition covers it, the correct fix is a schema condition, not a model call.
- **Swipe on non-latest messages, or feedback that alters mechanics.** Both remain out of v1.
