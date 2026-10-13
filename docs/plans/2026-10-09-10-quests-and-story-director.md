# Plan 10 — Quests on an engine-owned Story Director

> ## ⛔ Do not start this plan until plans 08 and 09 are fully complete, with zero gaps
>
> **Owner's rule (2026-10-09):** this plan "should only be taken up once plan 8 and 9 are fully
> completed without any gaps." Plans 08 and 09 were marked SHIPPED on 2026-10-09, but their own
> close-out lists open items, and nothing they built has been played in a packaged build. **Shipped
> is not complete.** §0 lists every known gap and the procedure for proving each one closed. Until
> every row in §0 is closed — or waived in writing by the owner — no phase of this plan may start:
> not a prototype, not a "small head start" on the director, not a migration.

**Created:** 2026-10-09
**Supersedes:** [`2026-08-13-10-quests.md`](2026-08-13-10-quests.md), kept for history. Every owner
requirement, authority ruling and acceptance criterion in it is carried forward here (Appendix C maps
old → new). Where the two disagree, this plan wins and §1.3 says why.
**Covers:** owner finding 15 (the quest system, all six sub-points); the 2026-10-09 competitive
analysis of Friends & Fables, Craft, Infinite Worlds and Voyage (Appendix A); two live authority gaps
found while verifying this plan's premises (§1.2).
**Size:** XL — ten phases (P0–P9). Each ends green, committed and shippable on its own.
**Depends on:** plans **08 and 09, fully complete with zero gaps** (§0). This is the owner's rule.
**Strongly recommended first, not gated:** plan 02 (classifier fidelity) and plan 06 (narration
integrity). §0.4 explains why.
**Status:** Written 2026-10-09 at the owner's request. **NOT authorized for implementation.** Eligible
only when §0 is satisfied *and* the owner names it the active plan in `docs/HANDOFF.md`.

**PLAN-POLICY header fields**

- *Observed evidence:* owner finding 15 (v0.2.9 play-test, 2026-08-12/13); the source audit of
  2026-10-09 in §1, including two live authority gaps; the competitive evidence in Appendix A.
- *Owner decision that approved it:* the owner asked for this plan on 2026-10-09 ("generate an
  in-depth plan 10 … it should only be taken up once plan 8 and 9 are fully completed without any
  gaps"). Writing is approved. Implementation is not.
- *Acceptance criteria:* §12.

**Cross-cutting rules** (master index): the authority wall, the hard/soft split, bridge parity, the
frozen schema, strict TDD, never build on red, verify the premise. Nothing here relaxes any of them.
Quests and director triggers **do not extend the rulebook**: they reference only the effective
catalogue (frozen + enabled) and engine-owned config, and never create or alter an `ActionDef`,
`SkillDef` or item definition. Per D7 (answered 2026-10-09: *new stories only*), they apply to
stories forged after P4; existing stories play unchanged.

---

## 0. Entry gate — plans 08 and 09 complete, with zero gaps

Quests sit on top of everything plans 08 and 09 built: resource roles, costs, cooldowns, statuses,
passive/toggle/reaction skills, the universal pool, item archetypes, loot, weapon specials, config
overrides. Building rewards and objectives on mechanics nobody has played multiplies the cost of every
defect underneath. That is the reason for the gate, and the reason it is strict.

### 0.1 The gate list (as of 2026-10-09 — a floor, not a ceiling)

| # | Gap | Source | Closed when |
| --- | --- | --- | --- |
| G1 | No build since v0.2.9; the owner's machine was formatted | HANDOFF | A Windows build of current `main` is produced from source on the fresh toolchain and installed |
| G2 | The Rust shell and the S17b fs capability file have never been build-validated (no GTK in the agent container) | HANDOFF; WORKLOG S17b | `cargo check` / `tauri build` pass on the owner's machine, and Story Settings § CONFIG reads, reloads and restores `$APPDATA/config` in the packaged app |
| G3 | Plans 08 and 09 have never been play-tested | action plan "Outcome" | The owner plays at least one fresh Full Stats story through ≥ 2 chapters covering HANDOFF's checklist — Rulebook catalogue, Universal pool and Rulebook config in Story Settings; drinking a looted potion, then rewinding; a weapon special from loot after chapter 1; resting and the living card's Conditions block — and every defect found is fixed or explicitly accepted by the owner |
| G4 | Plan 09 §5.4: forge latency and cost never measured | action plan "Outcome" | Measured with a real provider on ≥ 3 forges and recorded in WORKLOG |
| G5 | Plan 09 §7.3: the Story Settings design deliverable not produced | action plan "Outcome"; design brief §5 | Delivered, and S14's interim choices reconciled with it |
| G6 | Plan 09 acceptance 1 and part of 3 "not met as written" — the forge stayed hybrid | action plan "Outcome" | Either a selection-only forge meets them as written, **or** the owner amends those criteria in writing (WORKLOG + the plan 09 file). Until one happens, it is a gap |
| G7 | Pool selection quality never judged with a real model (the saves plan 09 §12 wanted replayed were lost) | action plan "Outcome" | Judged by the owner on ≥ 2 fresh stories; misfits fixed or accepted |
| G8 | Equipment's `resource_capacity` effect is display-only — nothing in the engine applies it | HANDOFF (found in S6b) | Applied by the engine, or removed from everything that can produce it. A promise the engine does not keep is a gap in plan 08's economy |
| G9 | The engine's 100 % coverage gate is not part of `npm test` | HANDOFF | `npx vitest run --coverage` in `packages/core` reports 100 % engine coverage at gate time, recorded in WORKLOG |
| G10 | The suite has only been run in the Linux agent container | AGENTS.md; HANDOFF | `npm run typecheck && npm test` green on Linux **and** on the owner's Windows toolchain. If the Windows tinypool crash recurs, that is plan 07 P0-0 and must be resolved or explicitly accepted |

### 0.2 Gate procedure

- [ ] **0.2.1** Re-read plans 08 and 09, the action plan's "Outcome", HANDOFF, and every WORKLOG entry
      since 2026-10-09. Add any new 08/09 gap to the table above before checking it.
- [ ] **0.2.2** For every row, record evidence — a commit hash, a dated WORKLOG entry, or the owner's
      written decision — in a dated **"Plan 10 gate check"** WORKLOG entry.
- [ ] **0.2.3** **Only the owner can waive a row**, and a waiver must change the criterion in writing.
      An agent never treats a row as "close enough". If any row is open: stop, report which rows are
      open and what closing each needs, and do not start P1.
- [ ] **0.2.4** Re-verify §1 against source (`git log cdb1c5c..HEAD`). Closing the gaps will change
      code this plan cites. Correct the plan before implementing anything whose premise moved
      (cross-cutting rule 7), and say so in WORKLOG.

### 0.3 What the gate does not block

The two authority gaps in §1.2 are live today and have nothing to do with quests. They should be fixed
as a **standalone change as soon as the owner approves it** (it needs its own go-ahead under
PLAN-POLICY). If they are still open when this plan starts, P3 closes them first.

### 0.4 Strongly recommended before this plan (engineering advice, not part of the owner's gate)

- **Plan 02 — classifier fidelity.** Quest progress is computed from rulings and the journal. While the
  classifier force-fits free text into the wrong action (owner finding 19, the owner's own P0), quests
  will progress, complete and fail on misclassified actions, and a reward is permanent hard state.
- **Plan 06 — narration integrity.** Quests add authoritative facts the narrator must cover (progress,
  completion, the chosen reward). Each is one more thing today's authority audit can trip on.

---

## 1. Premises verified against source on 2026-10-09 (`main` @ `cdb1c5c`)

Line numbers are as of that commit. Re-verify at P0 (0.2.4).

### 1.1 Facts this plan builds on

| # | Fact | Where | Consequence |
| --- | --- | --- | --- |
| F1 | Flags are **per-character** hard state, written only by the ledger's `setFlag` mutation; actions set them through `EffectSpec.setFlag` | `types/hardState.ts:56`; `engine/ledger.ts:32,126`; `types/actions.ts:55` | There is no story-level flag. Every flag condition or objective names its subject — the player by default |
| F2 | `ConditionSchema` is already a deterministic predicate over one character's hard state (skill rank, resource, item, flag, attribute) | `types/conditions.ts` | It is the leaf of director conditions. No new predicate language for character state |
| F3 | The ledger's mutations cover every reward: `attributeDelta`, `setSkill` (rank), `grantItem`, `setFlag` | `engine/ledger.ts:20-52` | Rewards need no new ledger mutation. Runtime-item rewards use the existing loot finalizer |
| F4 | A turn resolves into an in-memory working ledger (`workingById`) **before** `assembleContext`, then persists everything in **one** transaction after narration, capturing the checkpoint first | `orchestrator/turn.ts:543, 1085, 1157-1167` | The director can evaluate the projected post-turn state *before* narration and commit with the turn — same-turn narration of quest progress without breaking invariant 4 |
| F5 | Checkpoints hold hard/soft/presence/identity/world pre-images. Runtime items, journal events and pool enablements are turn-scoped, undone by `deleteFromTurn` / `undoRuntimeItemsFromIdx` in all three history paths | `orchestrator/checkpoint.ts:23-63`; `orchestrator/history.ts:348-430` | New director and quest tables are turn-scoped and wired into **deleteLastTurn, rewindTo and deleteFromExchange**. Missing one of the three is the classic bug |
| F6 | The turn RNG is `cryptoRng` (not reproducible); swipe never re-resolves | `orchestrator/turn.ts:480`; ARCHITECTURE §12 invariant 6 | A `chance` condition rolls once and the roll is persisted. Swipe and variant selection never re-evaluate |
| F7 | The migration ladder head is 18 | `store/db.ts:550` | This plan adds 19 onward |
| F8 | Journal kinds run from `roll` to `pool_disabled`; none for quests or a director | `store/repositories/storyEvents.ts` | New kinds, each mapped to a Journal filter chip — CONTEXT records a past defect where a kind had no chip |
| F9 | A `death` event is journalled for every character in `ruling.causedDeathOf`, NPCs included | `orchestrator/turn.ts:430-438` | "Defeat N" progress is **derived** from the journal, not stored — rewind-safe for free |
| F10 | Context order: rulings and present characters' hard state always; then persona, character notes, world state, story memory, lore (800-token sub-budget), recent history. Default budget 8,192 tokens. The assembler computes `trimmed` and `approxTokens` but returns no structured breakdown; only **present** characters are described; lore activation is binary (`alwaysOn`, or a case-insensitive key substring match) | `orchestrator/context.ts:110-113, 424-458, 536-640` | New blocks slot in after the always-on blocks, with hard caps. The context report (P1) needs a structured return value |
| F11 | The forge installs the schema, selects pool entries, then enables them with `source: "forge"`; regeneration goes through `orchestrator/rulebook.ts` | `bootstrap/freeze.ts:120, 197, 249`; `orchestrator/rulebook.ts:296` | Starting quests are generated **after** pool enablement so they can reference the effective catalogue. Regeneration must regenerate or keep them deliberately |
| F12 | Mid-story enablement: sealed enum, ≤ 2 per chapter, chapter tier gate `TIER_UNLOCK_CHAPTERS` = common 0 / uncommon 1 / rare 3 / legendary 6 / mythical ∞ | `catalogue/midStory.ts:31`; `catalogue/plan.ts:14-20` | The pattern for mid-story quest proposals, and the tier ladder for gating quest difficulty |
| F13 | Model stages run under `runStage` with per-stage deadlines | `orchestrator/stagePolicy.ts:41, 84` | Every new model call is a named stage with a deadline and a deterministic fallback |
| F14 | Bridges: `packages/ui/src/bridge/core.ts` and `sqliteBridge.ts`; parity tests `poolParity.test.ts`, `catalogParity.test.ts`; turns go through `submitTurn(args: SubmitTurnArgs)` | `packages/ui/src/bridge/core.ts:546`; `packages/ui/test/bridge/` | New methods use a shared core module and get `directorParity.test.ts` / `questParity.test.ts` |
| F15 | Loot tiers: legendary and mythical require a milestone; `mythicalRequiresExplicitAuthorization: true`; `routineMaximumTier.quest = legendary`. `mythicalAuthorized` is read from `story.configSnapshot.mythicalLootAuthorized`, **which no code ever writes** | `config/equipment-loot.json`; `orchestrator/loot.ts:201` | Mythical is unreachable today — correct, fail-closed. This plan authorizes it **per reward**, never by setting that story-wide flag |
| F16 | Locations are soft state (`WorldSoftState.locations`), written by the analyzer — a model. The universal `move`/`navigate` actions set no hard location | `types/softState.ts:115-117`; `config/universal-actions.json` | The 2026-08-13 plan's `reach_location` objective **cannot be deterministic**. Dropped (§5.1) |
| F17 | A "side" is `TargetCandidate.hostile` — "the engine's only notion of a side" | `engine/targeting.ts:20-24` | "Defeat hostile X" uses the same hostility source as targeting. No new disposition logic |
| F18 | Item archetypes are engine-owned (`item.melee.light_weapon`, …) with per-tier props up to `mythical`; runtime item definitions record `archetype_id` (migration 18) | `config/universal-items.json`; WORKLOG S15a | Item rewards are an archetype id + tier, sealed when the quest is created; "acquire" objectives match on archetype |
| F19 | `CharacterRecord` has no type/role field (plan 04 not built); NPCs carry `hard.templateId` | `store/repositories/characters.ts:22` | Givers and targets are character ids or template ids |
| F20 | Chapter summaries are produced asynchronously after the turn commits | `orchestrator/turn.ts` (fire-and-forget summarizer) | A chapter-count condition can observe a boundary one turn late. Acceptable, documented in §4.2, never "fixed" by blocking turns on the summarizer |

### 1.2 Two live authority gaps found while verifying this plan

**A1 — a model-chosen label unlocks legendary loot.** The loot decision schema lets the model set
`sourceType: "quest"` (`orchestrator/loot.ts:40`). Whenever the turn has a successful ruling,
`milestoneAuthorized` becomes true for that award (`loot.ts:223-225`) and the source ceiling is
`legendary` (`routineMaximumTier.quest`). A model *saying* "quest" — while no quest system exists — is
enough for an item with 3 effects, +3 to checks and +2 to an attribute. That is a model setting a
budget, which CONTEXT invariant 2 forbids.

**A2 — milestone authorization perpetuates itself.** Committing any award labelled `quest` or
`milestone` journals a `milestone` event (`turn.ts:1271-1286`). From then on `milestoneEvents.length > 0`
(`loot.ts:197-200`) authorizes milestone-tier loot for **every later** award labelled `quest` or
`milestone` in that story, with no tie to any actual milestone.

Related: starting gear records `sourceType: "quest"` with the label "Character creation"
(`bootstrap/startingGear.ts:353`). Provenance only, but it is a third meaning of "quest" that has to go
once quests are real.

- [ ] **1.2.1** *(standalone — recommended now, needs the owner's go-ahead)* Remove `"quest"` from the
      model-facing enum in `orchestrator/loot.ts:40`. RED test first: a model-labelled quest award can
      no longer exceed `rare`. Leave `LootSourceTypeSchema` itself unchanged so persisted provenance still
      decodes.
- [ ] **1.2.2** *(P3)* Replace "any milestone event, ever" with **an engine milestone in this turn** —
      a quest or an arc completed this turn (D14).
- [ ] **1.2.3** *(P3)* Add `"starting"` to `LootSourceTypeSchema` for starting gear. New stories use it;
      legacy rows keep decoding as `"quest"`.

### 1.3 Where this plan disagrees with the 2026-08-13 plan 10

1. **`reach_location` is dropped** (F16). The old `narrative` kind becomes `reach_flag`, with a rule
   that the flag must be provably reachable (§5.1).
2. **Mythical authorization is per reward.** The old plan said a completed Nightmare quest is "exactly
   the explicit authorization" the loot config waits for — right in spirit, but the only existing switch
   is the story-wide `configSnapshot.mythicalLootAuthorized`. Setting it would authorize *every later*
   model-proposed mythical award in the story. Never set it (F15); authorize the one reward instead.
3. **Progress is derived, not stored.** Counters can desync from a rewound state; recomputation from
   hard state and journal facts cannot (F5, F9).
4. **Quests sit on a general Story Director** (§4) rather than a quest-only evaluator. The same
   machinery serves story beats, choices and anti-drift guidance — the shape Infinite Worlds and Voyage
   converged on (Appendix A).
5. **`availableWhen`** becomes a quest-owned director trigger whose effect is `offer_quest`.

---

## 2. Scope

### 2.1 In scope

1. **The Story Director** — an engine-owned trigger layer: deterministic conditions → bounded effects,
   evaluated once per turn on the projected post-turn state (§4).
2. **Quests** on top of the director — all six owner sub-points (§5).
3. **Anti-drift injection** — Objectives block, Director notes, Known cast, partial lore tier,
   quest-aware suggestions — and a measurement of whether it works (§6).
4. **Context transparency** — a per-turn context report, a "What the narrator saw" panel, and
   @-mentions in the composer (§7).
5. **UI** — active-quest strip, reward chooser, choice card, quest log, Journal chips, Story Settings →
   Quests & Director (§8).
6. **Closing A1 and A2** properly (§1.2, §5.6).

### 2.2 Out of scope

Appendix B lists every idea from the competitive analysis that does *not* belong here, with its
destination. In short: ruling-triggered narrator guidance and per-model sampler presets belong to
**plan 06**, because they address today's narration failures and must not wait behind this gate; a
pre-narration recall step needs a new memory plan; SRD content belongs to a pool-content plan;
illustration fields belong to the image roadmap; a hard location model belongs to a future Scene State
plan.

---

## 3. The authority model — settled before anything else

Carried from the 2026-08-13 plan §2 and extended to the director:

- **A quest is a contract about hard state.** Its definition — objectives, difficulty, reward options —
  is frozen when created. Its status changes are written only by the engine, from deterministic
  evidence. Its prose (title, summary, the giver's lines) is soft.
- **Quest and director records are engine-owned story records**, like the pool enablement set: written
  only by engine code, turn-scoped, journalled, never by a model. Character hard-state changes they cause
  (flags, rewards) go through `engine/ledger.ts` like every other hard-state write.
- **A model may propose a quest** — from sealed vocabularies, validated deterministically — **and
  narrate it.** A model may **never** author a trigger at runtime, mark an objective met, complete or
  fail a quest, choose or alter a reward, or write the flags quests read.
- **Director conditions read only engine facts:** hard state, presence, alive/dead, the turn count,
  completed chapters, quest statuses, earlier firings, this turn's rulings, and an engine-rolled chance.
  **Never soft state, never prose, never a model's judgement.** Infinite Worlds' AI-judged "specific
  situation" triggers are deliberately not copied. A narrative beat has to become an action whose
  outcome sets a flag — classifier → engine → ledger — which is exactly what the old plan's `narrative`
  objective intended.
- **Director effects are hard, soft or UI.** Hard effects become staged ledger mutations committed with
  the turn. Soft effects are narrator guidance that never states a mechanical outcome. UI effects are
  notices and choices; they never enter the STORY register (plan 06's lesson about the recap).
- **Grant ≠ enable** (plan 09 §3.3). A reward may *grant* a skill already in the effective catalogue.
  Nothing in this plan enables a pool entry.
- **Mythical is reachable only through the chosen reward of a completed Nightmare quest** (§5.4).

This is the section that, if wrong, lets a model grant itself a mythical item. Every §11 test that
guards it is a release blocker.

---

## 4. The Story Director (P2)

### 4.1 Data model — `packages/core/src/types/director.ts` (new)

```ts
/** `q.<questId>.*` quest engine only · `d.*` director/story · `p.*` player triggers and choice
 *  answers · unprefixed = action outcomes (existing). The validator enforces who writes what. */
export const FlagIdSchema = z.string().regex(/^([qdp]\.)?[a-z0-9_.]+$/).max(64);

export const DirectorSubjectSchema = z.discriminatedUnion("of", [
  z.object({ of: z.literal("player") }),
  z.object({ of: z.literal("character"), characterId: z.string() }),
  z.object({ of: z.literal("template"), templateId: z.string() }), // any living character from it
]);

export const DirectorConditionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hard"), subject: DirectorSubjectSchema, condition: ConditionSchema }), // F2
  z.object({ type: z.literal("alive"), subject: DirectorSubjectSchema, value: z.boolean() }),
  z.object({ type: z.literal("present"), subject: DirectorSubjectSchema, value: z.boolean() }),
  z.object({ type: z.literal("turn_at_least"), turn: z.number().int().min(0) }),
  z.object({ type: z.literal("chapters_at_least"), chapters: z.number().int().min(0) }),
  z.object({ type: z.literal("quest_status"), questId: z.string(), status: QuestStatusSchema }),
  z.object({ type: z.literal("fired"), triggerId: z.string(), value: z.boolean() }), // prerequisite / blocker
  z.object({
    type: z.literal("ruling_this_turn"),
    actor: DirectorSubjectSchema.optional(),
    actionId: z.string().optional(),
    category: ActionCategorySchema.optional(),
    outcome: z.enum(["success", "failure", "any"]).default("success"), // success includes crit_success
  }),
  z.object({ type: z.literal("chance"), percent: z.number().int().min(1).max(99) }),
]);

export const DirectorEffectSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set_flag"), subject: DirectorSubjectSchema, flagId: FlagIdSchema, value: z.boolean() }),
  z.object({ type: z.literal("guide_narrator"), text: z.string().trim().min(1).max(280),
             when: z.enum(["this_turn", "next_turn"]) }),
  z.object({ type: z.literal("notice"), text: z.string().trim().min(1).max(200) }),
  z.object({ type: z.literal("offer_quest"), questId: z.string() }),
  z.object({ type: z.literal("fail_quest"), questId: z.string() }),
  z.object({
    type: z.literal("offer_choice"),
    prompt: z.string().trim().min(1).max(200),
    options: z.array(z.object({ id: z.string(), label: z.string().trim().min(1).max(80), setsFlag: FlagIdSchema }))
      .min(2).max(4),
  }),
]);

export const DirectorTriggerSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/).max(48),
  label: z.string().trim().min(1).max(60),
  when: z.array(DirectorConditionSchema).min(1).max(6), // AND. OR = two triggers.
  effects: z.array(DirectorEffectSchema).min(1).max(4),
  repeat: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("once") }),
    z.object({ mode: z.literal("cooldown"), turns: z.number().int().min(1).max(50) }),
  ]).default({ mode: "once" }),
  priority: z.number().int().min(-10).max(10).default(0),
  source: z.enum(["forge", "quest", "player", "engine"]),
  enabled: z.boolean().default(true),
});
```

**Deliberately absent:** damage, healing or any resource change; item grants; attribute or skill
changes; story endings. Anything that changes a character's power goes through a ruling (a visible card)
or the quest reward path (a player choice). Infinite Worlds lets a trigger set any value — that is the
hole this design closes. Story endings and victory/defeat conditions are a reasonable later effect;
recorded as a candidate in Appendix B, not built.

### 4.2 Evaluation — `packages/core/src/engine/director.ts` (pure; under the engine's 100 % coverage gate)

```ts
export function evaluateDirector(input: {
  triggers: readonly DirectorTrigger[];   // enabled, for this story
  state: ProjectedState;                  // workingById + presence + alive, after all of this turn's resolution
  facts: TurnFacts;                       // turn count, completed chapters, quest statuses, this turn's rulings, firing history
  rng: Rng;                               // the turn's rng — used only by `chance`
}): DirectorOutcome;                      // { firings, mutations, guidance, notices, offers }
```

Semantics, each with its own test:

1. **One pass per turn**, after everything that changes the working ledger — player intents, NPC
   actions, reactions, end-of-turn cooldown/status ticks, upkeep, recovery — and after loot
   determination; **before** `assembleContext` (F4).
2. **Order:** priority descending, then id. A `fired` condition sees firings from all earlier turns and
   from triggers earlier in this pass (Infinite Worlds' ordering rule).
3. **No cascades:** flags set by this pass are visible from the **next** turn. One pass, never a loop.
4. **Caps:** at most `MAX_FIRINGS_PER_TURN` (3) firings; any others are re-checked next turn. `once`
   never fires twice; `cooldown` respects its cooldown.
5. **Chance:** rolled once per eligible evaluation with the turn's rng. The roll is persisted whether or
   not the trigger fired, so neither a swipe nor a retry can reroll into a different result.
6. **Determinism:** same triggers + state + facts + recorded rolls ⇒ same outcome. Property test with a
   seeded rng.
7. **Turn count:** the number of committed exchanges. P2 first checks whether an engine counter exists;
   if not, it is derived from narrator message indices, and the derivation is unit-tested.
8. **Chapters:** `chapters_at_least` reads the chapter count committed before this turn began. Because
   summaries are asynchronous (F20), a boundary may be observed one turn late. Tests run against a
   settled store; the lag is documented in Story Settings, not hidden.

### 4.3 Turn integration — `orchestrator/turn.ts`

- [ ] **4.3.1** Build `ProjectedState` and `TurnFacts` from `workingById`, the staged NPC transitions
      and this turn's rulings; call `evaluateDirector`; apply its `mutations` to `workingById` so they
      commit with the turn; pass `guidance` to `assembleContext`; stage firings, notices and offers.
- [ ] **4.3.2** Write firings and offers inside the existing commit transaction (F4), after the
      checkpoint capture.
- [ ] **4.3.3** Swipe and variant selection never call the director (invariant 6). Test: swipe →
      firings and hard state byte-identical.
- [ ] **4.3.4** `next_turn` guidance is read from the previous turn's firings, so rewinding or deleting
      that turn removes it automatically.
- [ ] **4.3.5** Retry (`turnOperations.claimRetry`): nothing from the director is persisted before the
      commit, so a retried turn re-evaluates cleanly. Test the crash-before-commit case.
- [ ] **4.3.6** Cost: the director is pure and local. Budget **< 5 ms per turn at 40 triggers**;
      measure and record. Per-turn model calls added by this whole plan: **zero**.

### 4.4 Validation — `packages/core/src/director/validate.ts`

- Every reference resolves: characters, templates, quests, triggers (`fired`), actions and categories in
  the **effective** catalogue, flags (namespace rules).
- Per-story caps: ≤ 12 forge triggers; ≤ 4 triggers per quest; ≤ 20 player triggers (P9); ≤ 40 enabled.
- `guide_narrator` and `notice` text: length caps; rejected if it quotes dice, DCs, modifiers or engine
  labels (share plan 06's deny-list if it exists by then).
- A trigger that can never fire — unsatisfiable conditions, an unreachable flag — is a **warning**
  shown in Story Settings, not an error.

### 4.5 Persistence — migration 19

- `story_director_triggers` — `story_id, trigger_id, source, definition_json, created_turn_index`
  (NULL for forge/install). Turn-created rows are removed by `deleteFromTurn`.
- `director_firings` — `id, story_id, turn_index, message_id, trigger_id, fired, chance_roll, effects_json,
  created_at`. Turn-scoped.
- `story_pending_choices` — `id, story_id, turn_index, source ('director' | 'quest_offer' | 'quest_reward'),
  prompt, options_json, answered_option_id, answered_at`. Turn-scoped.
- All SQL in `store/repositories/director.ts`.
- [ ] **4.5.1** Wire `deleteFromTurn` for all three tables into **deleteLastTurn, rewindTo and
      deleteFromExchange** (`history.ts:348-430`). One test per path.
- [ ] **4.5.2** Answering a choice between turns applies its `set_flag` through the ledger in its own
      transaction and is recorded at the **offering** turn's index. Rewinding to the offering turn
      restores the pre-turn checkpoint (undoing the flag) and deletes the choice; rewinding to a later
      turn keeps both. Test both.

### 4.6 Journal and bridge

- New `StoryEventKind`s: `director_fired`, `choice_offered`, `choice_answered` → a **"Story"** filter
  chip. A test asserts every event kind maps to a chip.
- Bridge, both backends, through a shared core module, with `directorParity.test.ts`:
  `listDirectorTriggers`, `listDirectorFirings`, `listPendingChoices`, `answerChoice`.

---

## 5. Quests (P3, P4, P8)

### 5.1 Objectives — premise-corrected

```ts
export const QuestObjectiveSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("defeat"), templateId: z.string().optional(), characterId: z.string().optional(),
             hostileOnly: z.boolean().default(true), count: z.number().int().min(1).max(20) }),
  z.object({ kind: z.literal("acquire_item"), archetypeId: z.string().optional(), itemKind: ItemKindSchema.optional(),
             count: z.number().int().min(1).max(10) }),
  z.object({ kind: z.literal("reach_flag"), flagId: FlagIdSchema }),            // replaces `narrative`
  z.object({ kind: z.literal("learn_skill"), skillId: z.string(), minRank: MasteryRankSchema.default("novice") }),
  z.object({ kind: z.literal("attribute_at_least"), attributeId: z.string(), min: z.number().int() }),
  z.object({ kind: z.literal("use_action"), actionId: z.string().optional(), category: ActionCategorySchema.optional(),
             successOnly: z.boolean().default(true), count: z.number().int().min(1).max(20) }),
  z.object({ kind: z.literal("survive_turns"), turns: z.number().int().min(1).max(100) }),
  z.object({ kind: z.literal("keep_alive"), characterId: z.string(), turns: z.number().int().min(1).max(100) }),
]);
```

- **`reach_location` is dropped** (F16). "Reach the temple" becomes `reach_flag` on a flag set by an
  action outcome (for example a forge-authored `enter_sanctum` action) or by a quest-owned trigger that
  reads such a flag. A hard location model is out of scope (Appendix B).
- **Reachability rule for `reach_flag`:** the validator must prove the flag can be set — by an action
  outcome in the effective catalogue, or by a quest-sourced trigger. A quest whose objective can never
  be met is rejected at creation. This is where the old plan's "measure the rejection rate" risk lives.
- **Every objective compiles to director conditions**, so quest progress and the director are one
  engine, not two.
- **Progress is derived, never stored.** `defeat` counts `death` events (F9) for matching characters
  since activation; `use_action` counts rulings since activation; `survive_turns` and `keep_alive`
  subtract turn counts; the rest read hard state. Rewind therefore cannot desync progress, and the UI's
  "2/3" is a recomputation.
- [ ] **5.1.1** Extend the `death` event payload with `hostileToPlayer`, taken from the same source as
      `TargetCandidate.hostile` (F17) at the moment of death. Legacy events without it count as not
      hostile.

### 5.2 Definitions and status

```ts
export const QuestDifficultySchema = z.enum(["light", "moderate", "hard", "brutal", "nightmare"]);
export const QuestStatusSchema = z.enum(["offered", "active", "completed", "rewarded", "failed", "expired"]);

export const QuestDefSchema = z.object({
  id: z.string(),
  storyId: z.string(),
  title: z.string().trim().min(1).max(80),
  summary: z.string().trim().min(1).max(240),             // soft prose: shown, and injected (§6)
  scope: z.enum(["personal", "story"]),                   // sub-point 3: specific → sweeping
  difficulty: QuestDifficultySchema,
  giverCharacterId: z.string().optional(),
  objectives: z.array(QuestObjectiveSchema).min(1).max(4),
  rewardOptions: z.array(QuestRewardOptionSchema).min(1).max(4), // engine-derived (§5.4)
  failWhen: z.array(DirectorConditionSchema).max(3).default([]), // e.g. the giver is dead
  expiresAfterTurns: z.number().int().min(5).max(500).optional(),
  origin: z.enum(["forge", "mid_story", "player"]),
  createdTurnIndex: z.number().int().nullable(),           // null = forge
});
```

- Status changes are written only by the engine, as quest events (§5.7): `offered → active →
  completed → rewarded`, or `→ failed` / `→ expired`.
- Forge quests start `active` — sub-point 1, "just to get things starting". Mid-story quests start
  `offered` and become `active` through a choice (D11).

### 5.3 Difficulty gating (sub-point 4)

- No Brutal or Nightmare at creation (carried).
- Brutal requires ≥ `TIER_UNLOCK_CHAPTERS.rare` (3) completed chapters; Nightmare requires ≥
  `TIER_UNLOCK_CHAPTERS.legendary` (6). Reusing the pool's ladder (F12) keeps one source of truth for
  the story's power curve (D16).
- At most one Nightmare quest offered or active at a time, and at most one per arc (D16). Nightmare is
  "extremely rare and near-impossible" by construction, not by hope.

### 5.4 Rewards (sub-point 6) — owner decision **D6 is still open**

Reward options are computed by the engine from difficulty when the quest is created, then frozen. A
model cannot inflate them. The proposed table, carried from the 2026-08-13 plan:

| Difficulty | Attribute | Skill upgrade | Skill **grant** | Item tier |
| --- | --- | --- | --- | --- |
| Light | — | — | — | common |
| Moderate | +1 | +1 rank | common tier | uncommon |
| Hard | +1 | +1 rank | uncommon tier | rare |
| Brutal | +2 | +2 ranks | rare tier | legendary |
| Nightmare | +3 | +2 ranks | legendary tier | **mythical** |

- `attribute_upgrade` → `attributeDelta` through the ledger, clamped (`clampAttribute`). The attribute is
  chosen by the player at reward time (D13).
- `skill_upgrade` → `setSkill` rank + n, capped at `master`, on a skill the player has learned, chosen at
  reward time.
- `skill_grant` → `setSkill` at `novice`, only for a skill **already in the effective catalogue** and
  within the tier. It never enables a pool entry (grant ≠ enable).
- `item` → an `archetypeId` and tier frozen at creation, materialized at choice time through
  `finalizeLootProposal` with `sourceType: "quest"`, `milestoneAuthorized: true`, and
  **`mythicalAuthorized: quest.difficulty === "nightmare"` for this reward only**. Never write
  `configSnapshot.mythicalLootAuthorized` (F15, §1.3).

### 5.5 The reward moment (carried, hardened)

- [ ] **5.5.1** Completion is detected by the director in the same turn as the deciding ruling (D10). It
      writes `quest_completed` and creates a pending choice with `source: 'quest_reward'`.
- [ ] **5.5.2** `chooseQuestReward(storyId, questId, optionId, params?)` validates against the frozen
      options and the player's current state, applies through the ledger (or the loot finalizer for an
      item) in one transaction, writes `quest_reward_chosen` at the **completion turn's** index, and moves
      the quest to `rewarded`.
- [ ] **5.5.3** **Single-shot and idempotent:** a unique constraint on (`story_id`, `quest_id`) in
      `quest_rewards`, plus a status check. Tests: a second call is refused; two concurrent calls grant
      once; a refused call changes nothing.
- [ ] **5.5.4** Rewinding to the completion turn: the quest is no longer complete and the reward is
      un-granted — pre-turn checkpoint plus `deleteFromTurn`; a runtime-item reward is removed by
      `undoRuntimeItemsFromIdx`, which must therefore see the reward's instance (record it on the reward
      row, the way `ruling.loot` is recorded). Rewinding to a later turn keeps both. Test each reward
      kind.
- [ ] **5.5.5** Non-blocking: the next turn can be played before choosing. The reward waits in the quest
      log with a badge (D12).
- [ ] **5.5.6** The next turn's narrator receives the granted reward as an authoritative fact in the
      ruling-facts block, not as free prose (old §7.4).

### 5.6 Closing A1 and A2 for good (first step of P3)

- [ ] **5.6.1** If 1.2.1 has not shipped, do it now.
- [ ] **5.6.2** `quest` provenance only from the reward path; `starting` for starting gear (1.2.3).
- [ ] **5.6.3** Milestone authorization for model-proposed loot = an engine milestone **in this turn**
      (a quest or an arc completed), per D14. Regression tests for A1 and A2.

### 5.7 Persistence — migration 20

- `story_quests` — frozen definitions; `created_turn_index` NULL for forge; turn-created rows removed by
  `deleteFromTurn`.
- `quest_events` — `story_id, quest_id, turn_index, kind (offered | activated | completed | failed |
  expired | rewarded), payload_json`. Current status is a fold over events.
- `quest_rewards` — unique (`story_id`, `quest_id`); `turn_index, option_id, params_json, granted_json`
  (including any runtime item instance id).
- Journal kinds `quest_offered`, `quest_accepted`, `quest_completed`, `quest_failed`, `quest_expired`,
  `quest_reward_chosen` → a **"Quests"** chip.
- All SQL in `store/repositories/quests.ts`; history wiring in all three paths; bridge `listQuests`,
  `getQuest` (with derived progress), `acceptQuest`, `chooseQuestReward`; `questParity.test.ts`.

### 5.8 Generation at forge (sub-point 1) — P4

- [ ] **5.8.1** After pool enablement in `bootstrapStory` (F11), one bounded structured call proposes
      3–5 starting quests: one or two Light, one Moderate, one Hard; never Brutal or Nightmare. The model
      picks from **sealed vocabularies** built from the effective catalogue — template and character ids,
      skill ids, action ids and categories, archetype ids, reachable flag ids. It never sees or sets
      rewards.
- [ ] **5.8.2** Validate (§5.1 rules); repair with the exact validation error through the forge's
      existing repair loop; drop whatever is still invalid after the repair budget.
- [ ] **5.8.3** Deterministic fallback so story creation never blocks: if fewer than two valid quests
      remain, add template quests from engine-owned config (`config/quest-templates.json` — "defeat N
      hostile `<template>`", "learn `<skill>`", "acquire a `<kind>`", …), overridable through the user's
      config (plan 09 §4c).
- [ ] **5.8.4** Record the rejection rate across forges. Target: ≥ 3 valid quests in ≥ 90 % of forges
      without the fallback.
- [ ] **5.8.5** Rulebook regeneration (`orchestrator/rulebook.ts`): starting quests are regenerated with
      the rulebook only if no quest has progressed; otherwise they are kept and re-validated, and any
      that became invalid are expired with a journal entry.
- [ ] **5.8.6** No Stats stories get no quest mechanics. Soft goals for them are a recorded candidate,
      not part of this plan.

### 5.9 Mid-story proposals — P8

- At a chapter boundary, at most **one** proposal per chapter (cf. two enablements per chapter, F12), as a
  named `runStage` stage with a deadline and the fallback "propose nothing". Sealed vocabularies; the giver
  must be a registered, living character present in the scene; tier gate per §5.3; starts `offered`;
  journalled; turn-scoped.
- Never injected into the classifier prompt (old §6.3).

---

## 6. Anti-drift injection (sub-point 5) — P5 and P6

"With this we will never forget our goals, so inject it wherever need be." The cheapest, highest-value
part — and the one that must be measured rather than assumed.

- [ ] **6.1 Objectives block** — after "Present characters (hard state)", through `pushIfFits` with a hard
      cap (≤ 3 active quests, ~200 tokens): title, one-line summary, and the **unmet** objectives with
      derived progress. It can never displace rulings or present hard state, which are always-on (F10).
- [ ] **6.2 Director notes** — this turn's `this_turn` guidance plus last turn's `next_turn` guidance,
      ≤ 2 notes of ≤ 280 characters, titled "Director notes (story direction — never mechanical truth)".
      The authority clause stays last in the system frame (invariant 5).
- [ ] **6.3 Known cast** — one line per registered, living, **absent** character who is a quest giver
      or target, or was present in the last 5 turns; ≤ 8 lines (~120 tokens). Example: "Daen — village
      archer, off-scene since turn 41". Today the narrator sees only present characters (F10). Hypothesis
      worth measuring: fewer re-invented or duplicated actors (plan 03, finding 5). Untested — do not claim
      it.
- [ ] **6.4 Partial lore tier** — Craft's Pinned / Partial / Searchable mapped onto the existing lorebook:
      entries gain an optional `summary` (≤ 120 chars) and an activation mode `partial`. The summary is
      always listed under "Known lore" (~150 tokens in total); the full entry is injected only on a key
      match. The existing `alwaysOn` and keyword modes are unchanged. Separable — may ship on its own.
- [ ] **6.5 Suggestions** — unmet objectives feed `suggestPlayerActions` (and plan 11's funnel, if it
      exists by then) so Possible Moves can advance a quest.
- [ ] **6.6 Never in the classifier prompt** — biasing classification toward quest actions would make
      finding 19 worse.
- [ ] **6.7 Measure** — a harness over a fixed set of transcripts: how often committed prose references
      an active objective (before vs after), narrator contradictions of objectives, and context tokens per
      block. Record in WORKLOG. No drift-reduction claim without it.

Budget: the default context budget is 8,192 tokens (F10). These blocks add ≤ ~470 tokens, paid for by
history trimming, and the context report (§7) makes the trade visible. Raising the default budget is an
owner / plan 06 decision, not this plan's.

---

## 7. Context transparency — P1 (built first, so every later phase can be checked with it)

Friends & Fables' "Working Context" — an editable panel of what its GM is looking at — is what reviewers
credit for its continuity. MT's version follows the product's own rule, *the math is always visible*,
extended to memory.

- [ ] **7.1** `assembleContext` also returns a structured `ContextReport`: per block, its title, tokens,
      and status (included, dropped or truncated) with its items — lore entries and the key that matched,
      characters described, quests, notes and pins, history messages kept and dropped — plus the budget,
      the total and `trimmed`. Pure and unit-tested. **No change to the prompt itself:** a golden test
      proves the prompt text is byte-identical before and after.
- [ ] **7.2** Persist one compact report per narrator message variant: turn-scoped, removed by all three
      history paths, size-capped. Store block texts, not a raw prompt dump (D18).
- [ ] **7.3** UI: a collapsed "What the narrator saw" row under each narrator message, beside the ruling
      cards — the block list with token bars, dropped and truncated markers, and matched lore keys.
- [ ] **7.4** **@-mentions in the composer.** Typing `@` opens a picker over registered characters, lore
      entries, active quests and held items. Picks travel as `pins` (ids) on `SubmitTurnArgs`, and the
      `@token` is replaced by the plain name in the player text, so the classifier sees ordinary prose. The
      assembler adds a "Pinned this turn" block after the Objectives block (≤ 3 pins, ≤ ~400 tokens),
      shown in the report. Pins are soft context only: they never reach the classifier or the engine.
- [ ] **7.5** Bridge `getContextReport(storyId, messageId)`; `submitTurn` accepts `pins`; parity test.

---

## 8. UI — P5 (play-testable slice) and P7 (full)

The design brief already asks the quest questions (`2026-08-13-DESIGN-BRIEF.md` §2). P5 ships the
minimum the owner needs to play-test; P7 implements the design deliverable.

**P5 — play-testable slice**

- Active-quest strip on Play: one line, collapsible — the brief's "presence without stealing attention".
- Reward chooser: up to four cards, attribute/skill pickers (D13), plain refusal reasons.
- Choice card for `offer_choice` and quest offers (accept / decline).
- Notices render as system cards, never in the STORY register.
- Journal chips "Quests" and "Story".

**P7 — full**

- Quest log (a Journal section or its own tab — the brief's open question): five difficulty tiers that
  read at a glance without a rainbow; states offered / active / completed / rewarded / failed / expired;
  derived progress; giver; reward.
- Story Settings → **Quests & Director**: quests, triggers (read-only), firing history, validation
  warnings, the chapter-lag note (§4.2.8).
- Living card: giver and target badges (optional).

---

## 9. Optional — P9: player authoring (only if D17 says yes)

Infinite Worlds' world toolkit is its best feature, and Voyage's Studio builds quests from a
conversation. A constrained version for MT:

- Player-authored triggers: conditions from the sealed vocabulary; effects limited to `guide_narrator`,
  `notice`, `offer_choice`, and `set_flag` in the `p.*` namespace. They can never write `q.*` flags,
  offer, complete or fail quests, or change anyone's power.
- Player-authored quests: allowed as goals for anti-drift, but **reward-less** (recommended) or capped at
  Light — otherwise a player can author trivial quests to farm rewards.
- Validated, journalled, enable/disable, exported and imported as JSON next to the user config
  (plan 09 §4c).

---

## 10. Implementation order

Every phase: RED first, then green, typecheck clean, engine coverage 100 %, committed, WORKLOG and
HANDOFF updated. A phase that needs an unanswered owner decision stops at that decision.

| Phase | Content | User-visible? | Needs |
| --- | --- | --- | --- |
| **P0** | Gate check (§0) and premise re-verification (§1) | no | the gate |
| **P1** | Context report, inspector row, @-mentions (§7) | yes | D18 |
| **P2** | Director core: types, validation, pure evaluation, turn integration, migration 19, history wiring, journal, bridge read methods (§4) | journal only | D10 |
| **P3** | Quest core: types, objective compiler, derived progress, rewards, reward path, A1/A2 closure, migration 20, bridge (§5.1–5.7) | no | D6, D13, D14 |
| **P4** | Starting quests at forge, the fallback, rejection-rate measurement (§5.8) | new stories | D11, D16 |
| **P5** | Play-testable UI slice, Objectives block, Director notes (§6.1–6.2, §8 P5) | yes | D12 |
| **P6** | Known cast, partial lore, suggestions, the measurement harness (§6.3–6.7) | yes | — |
| **P7** | Full quest log and the Story Settings section (§8 P7) | yes | design deliverable |
| **P8** | Mid-story quest proposals (§5.9) | yes | D15 |
| **P9** | Optional player authoring (§9) | yes | D17 |

**Owner play-test checkpoints:** after P1 (the inspector on a real story); after P5 (complete a quest,
choose a reward, rewind across it); after P6 (drift measurement over a long session); after P8.

---

## 11. Testing strategy (on top of cross-cutting rule 5)

- **Pure director (engine):** table-driven tests for every condition and effect; ordering,
  prerequisites, blockers, caps, cooldowns, `once`; chance with a seeded rng; a determinism property
  test; 100 % branch coverage (it lives under `src/engine`).
- **Turn integration:** firings written in the turn's transaction; same-turn guidance present in the
  narrator context; swipe byte-identical; rewind, delete and exchange-delete remove firings, choices and
  quest events and revert flags; retry after a crash before commit.
- **Quests:** the objective compiler; progress derivation across rewind; completion on the killing blow;
  the reward is single-shot (sequential and concurrent); rewind un-grants attribute, skill and item
  rewards; Nightmare → mythical only through the reward path; a model-labelled quest award stays ≤ rare
  (A1); milestone authorization does not perpetuate itself (A2).
- **Context:** golden test that the prompt is unchanged by the report; caps respected; rulings and present
  hard state never dropped; pins never reach the classifier.
- **Bridge parity** for every new method; **Journal chip coverage** for every new event kind.
- **UI (React Testing Library):** reward chooser, choice card, quest strip, inspector row, @-picker.
- **Live (owner):** the checkpoints in §10.

---

## 12. Acceptance criteria

Carried from the 2026-08-13 plan (1–8), strengthened:

1. No model can mark an objective met, complete or fail a quest, author a trigger at runtime, or grant or
   choose a reward.
2. Objectives complete only from deterministic engine evidence; progress is derived, never stored.
3. Rewards are derived from difficulty by the engine; a mythical item is reachable **only** through the
   chosen reward of a completed Nightmare quest.
4. Rewind, delete and exchange-delete un-complete quests and un-grant rewards exactly; swipe changes
   nothing mechanical.
5. Choosing a reward is single-shot and idempotent, including under concurrent calls.
6. Active quests appear in the narrator context under a hard cap and never displace rulings or present
   hard state.
7. New Full Stats stories get 3–5 starting quests, none Brutal or Nightmare, with a deterministic
   fallback; the rejection rate is measured.
8. Suite green; typecheck clean; both bridges expose the same quest, director and context surface.

New:

9. The director is deterministic, single-pass, capped and journalled, is never re-evaluated by swipe, and
   persists its chance rolls.
10. Director conditions never read soft state, prose or a model's judgement; flag namespaces stop any
    non-quest trigger from satisfying a quest objective.
11. A1 and A2 are closed, with regression tests.
12. Every narrator message has a context report; the inspector shows included and dropped blocks;
    @-pins appear in the context and the report, never in classifier input.
13. Measured and recorded: objective reference rate before and after; forge quest rejection rate;
    director time per turn (< 5 ms at 40 triggers); model calls added (forge +1 bounded, mid-story ≤ 1
    per chapter, per turn **0**).
14. Engine coverage 100 %; a Windows build validated; the owner's play-test checkpoints passed.

---

## 13. Owner decisions

| # | Decision | Recommendation | Blocks |
| --- | --- | --- | --- |
| D6 | Reward types and the difficulty → reward table (§5.4) — carried, still open | Accept as proposed | P3 |
| D10 | Narrate quest progress in the **same** turn (director before narration) or the next | Same turn | P2 |
| D11 | Forge quests start active; mid-story quests must be accepted | Yes | P4 |
| D12 | Must a reward be chosen before the next turn? | No — non-blocking, with a badge | P5 |
| D13 | The player picks the attribute or skill for an upgrade reward at choice time | Yes | P3 |
| D14 | Loot milestone authorization = an engine milestone in this turn (quest or arc completed) | Yes | P3 |
| D15 | Quest failure: the giver's death fails personal quests; no time limits by default | Yes | P8 |
| D16 | Nightmare needs ≥ 6 completed chapters, one at a time, ≤ 1 per arc; Brutal needs ≥ 3 | Yes | P4 |
| D17 | Player authoring (P9) — and if yes, player-authored quests carry no reward | Decide after P8 | P9 |
| D18 | The inspector shows each block's text (local data) but no raw-prompt dump | Yes | P1 |

---

## 14. Risks

- **Reward duplication** on retry, swipe or rewind — the most dangerous failure, because it silently
  inflates the player's power. §5.5.3–5.5.4 guard it; test adversarially.
- **Classifier dependence** — misclassified actions progress quests wrongly, and the reward is
  permanent. Doing plan 02 first is the mitigation (§0.4).
- **Objective expressiveness and forge rejections** — without hard locations, many natural quests need
  action-set flags. Measure in P4, and grow the template config before growing the model's freedom.
- **Context pressure** — the default budget is 8,192 tokens. The new blocks are capped and visible in the
  report; history pays first.
- **Narration conflict** — guidance is soft, labelled and below the authority clause; plan 06's audit
  covers it.
- **Scope** — XL. Every phase ships on its own, and P1 is worth having even if the plan stops there.
- **Complexity creep in the director** — no damage, item or attribute effects, no loops, no
  model-judged conditions. Adding any of them needs a new owner decision.
- **Player authoring as a cheat vector** — flag namespaces plus reward-less player quests.

---

## Appendix A — Competitive evidence (2026-10-09)

Four products, compared because each answers the question this plan answers: *who decides what
happened, and how does the story keep hold of its goals?* Several sources are review sites with their own
scoring, or competitors of the product they describe. fables.gg, infiniteworlds.app and alpha.voyage.io
render only client-side, so their facts come from documentation, wikis, launch coverage and hands-on
reviews.

| | Friends & Fables | Craft | Infinite Worlds | Voyage |
| --- | --- | --- | --- | --- |
| Maker / status | Same company as Craft; maintenance mode, large updates paused until 2027 | F&F's ground-up successor; open beta, summer 2026 | Reportedly a solo developer ("Friendly Fox") | Latitude, the AI Dungeon studio; open beta 26 Aug 2026, 1.0 targeted for early 2027 |
| Who decides outcomes | Mostly code around 5e (their words: "code and logic to handle reasoning, memory, and rules"); narrative combat is model-tracked | The model, with dice tools and file edits; schema limits "keep the AI GM honest" | The model writes prose **and** stats in one pass; deterministic triggers run afterwards | A "World Engine" holds state — health, inventory, currency, geography, relationships, permadeath; skill checks against stats. Custom resources are moved by the GM "as the fiction demands" |
| Quests and story beats | Encounters; the Working Context | GM instructions that are default, narratively triggered or tool-triggered | A trigger language: turn, value comparisons, chance, prerequisites/blockers, AI-judged situations (≤ 10) → guidance, notices, objective changes, choices, game end | Studio quests "trigger when the party reaches a place or changes a value"; abilities unlocked by bosses and quests |
| Memory | Memories every 5 turns; editable Working Context; @-mentions | Pinned / Partial / Searchable files plus a research helper over files and transcript | Last 2–8 turns verbatim + a rolling summary (turn 8, then every 6) + hidden `secretInfo` | World Engine state; "enhanced"/"max" memory tiers with no published figures |
| Price | Free 25 turns/day; $19.95–39.95/month | Free (limited); $19.99–199.99/month | Credits, no subscription; 3 free turns/day | Free public servers + a limited demo; $14.99–99.99/month, shared with AI Dungeon |
| Multiplayer | Up to 6; only the host pays | Not at review time | No | Public servers up to 8; private co-op up to 4; DM mode |
| Arcanum score | 3.9 (Determinism 5, Longevity 2) | 4.3 | not rated | 4.4 (Determinism 5, NPC fidelity 5, Memory 4.25) |
| Main complaints | Errors snowball in long campaigns; five combat rewrites | Slow turns; garbles recent events; plays the player's character | Summaries lose detail; arbitrary GM; downtime | Inventory misbehaves; rewrites the player's dialogue; Studio limited to Latitude's ruleset; narrator quality |

**What the evidence says about this plan**

- **The two strongest products split on the core question.** Latitude spent about five years and at
  least six prototypes building an engine that keeps state apart from the story — in RuntimeWire's
  words, "betting AI roleplay needs rules after all". That is MT's thesis. F&F's team went the other way,
  to a strong model with a light harness, because their scaffolding "created invisible walls". This plan
  stays on Latitude's side and is stricter than Latitude: in MT, conditions and rewards are code, not a
  GM's judgement.
- **Triggers are the common answer to "how does a story keep its shape"** — an explicit trigger language
  in Infinite Worlds, place/value quest triggers in Voyage, narratively and tool-triggered instructions
  in Craft. The director is MT's version, minus model-judged conditions.
- **Visible working memory beats invisible memory.** F&F's Working Context and Craft's visibility tiers
  are what make their continuity debuggable. §7 is MT's version.
- **Where every product leaks:** inventory and sheet bookkeeping (Voyage, F&F); values moved by a model
  (Voyage's custom resources, Infinite Worlds' tracked items); the narrator playing the player's character
  (Voyage, Craft). MT's ledger-only writes and derived progress are the direct answer, which is why the
  reward path has to be the most heavily tested code in this plan.

**Sources:**
[Craft docs](https://www.craftrpgs.com/docs) (agent tools, dice, computed fields, context visibility,
progressive disclosure, context rot, GM instructions, research tool, game starts, energy, platform limits,
content policy) ·
[Craft launch post](https://www.craftrpgs.com/blog/craft-a-new-approach-to-ai-rpgs) ·
[Craft pricing](https://www.craftrpgs.com/pricing) ·
[Arcanum: Craft review](https://arcanumrpgs.com/blog/craft-review/) ·
[Arcanum: F&F review](https://arcanumrpgs.com/blog/friends-and-fables-review/) ·
[Arcanum: F&F guide](https://arcanumrpgs.com/blog/friends-and-fables-guide/) ·
[Arcanum: F&F pricing](https://arcanumrpgs.com/blog/friends-and-fables-pricing/) ·
[Arcanum: F&F vs Voyage](https://arcanumrpgs.com/blog/friends-and-fables-vs-voyage/) ·
[F&F combat patch notes](https://fables.gg/patch-notes/prepare-for-combat) ·
[DreamGen: F&F review](https://dreamgen.com/blog/articles/friends-and-fables-review) ·
[IW wiki: how it works](https://infiniteworlds.mywikis.wiki/wiki/How_Infinite_Worlds_works) ·
[IW wiki: trigger events](https://infiniteworlds.mywikis.wiki/wiki/Trigger_events) ·
[IW wiki: storyteller models](https://infiniteworlds.mywikis.wiki/wiki/Storyteller_AI) ·
[IW wiki: FAQ](https://infiniteworlds.mywikis.wiki/wiki/Frequently_Asked_Questions) ·
[IW game-creation guide](https://github.com/sabreking/IWGameCreationGuide) ·
[Arcanum: Voyage review](https://arcanumrpgs.com/blog/voyage-review/) ·
[Arcanum: Voyage guide](https://arcanumrpgs.com/blog/voyage-guide/) ·
[Arcanum: Voyage Studio](https://arcanumrpgs.com/blog/voyage-studio/) ·
[RuntimeWire: Latitude opens Voyage](https://runtimewire.com/article/latitude-opens-voyage-ai-roleplay-world-engine) ·
[TechCrunch: Voyage unveiled](https://techcrunch.com/2026/04/21/voyage-is-an-ai-rpg-platform-for-creating-custom-gaming-worlds-with-ai-generated-npc-interactions/) ·
competitor pages: [RoleForge](https://roleforge.ai/blog/best-ai-game-master-tools-compared/),
[Questsmith](https://www.thequestsmith.com/en/blog/infinite-worlds-ai-vs-questsmith),
[DungeonsDeep](https://dungeonsdeep.ai/blog/best-emerging-ai-rpg-platforms-2026).

---

## Appendix B — Borrowed ideas that do not belong in this plan

| Idea | Source | Goes to | Why not here |
| --- | --- | --- | --- |
| Ruling-triggered narrator guidance — inject "how to narrate a death / a critical failure / a reaction" only when such a ruling occurs | Craft (tool-triggered GM instructions) | Plan 06 | It fixes today's narration coverage; putting it behind the 08/09 gate would delay a fix for a P0-adjacent problem |
| Per-model sampler presets and quirk notes; warn on risky combinations | Infinite Worlds (model-specific instruction blocks, crowd-sourced model notes) | Plan 06 | Plan 06 diagnosed the degenerate prose as repetition-penalty driven; fix it now |
| A pre-narration recall step over transcript and lore, returning cited facts | Craft (research tool) | A new memory plan | Adds latency and BYOK cost per turn; no recall failure has been observed yet |
| SRD 5.2 (CC-BY-4.0 — verify before use) as pool and NPC-template content | F&F builds on the SRD | A pool-content plan | Content, not mechanics; relevant because the owner's taxonomy files are lost |
| Structured illustration fields; character expressions; visual-novel presentation | Infinite Worlds; Craft | The image roadmap | Presentation |
| A hard location / geography model | Voyage's World Engine | A future Scene State plan (CONTEXT invariants 6–7) | Needed for deterministic "reach X"; large |
| GM personality presets (cozy → hardcore) | Voyage | Plan 06 / difficulty | Narrator tone plus the existing difficulty setting |
| Permadeath with a successor who inherits the world | Voyage | A future plan, if wanted | A product decision, not a quest mechanic |
| Story endings / victory and defeat conditions | Infinite Worlds | A candidate director effect | Deliberately excluded from the first director |

**Not copied, on purpose:** a model writing state (Craft's file edits, Infinite Worlds' tracked items);
AI-judged trigger conditions; tactical battle maps (F&F rewrote combat five times); god-mode edits of hard
state (Infinite Worlds' Storyteller Mode); hosted credits, creator revenue share and multiplayer, which do
not fit a local-first, bring-your-own-key product.

---

## Appendix C — Traceability to the 2026-08-13 plan

| 2026-08-13 plan | This plan |
| --- | --- |
| §1 owner sub-points 1–6 | §5.8 (1), §2 and §10 (2), `scope` in §5.2 (3), §5.3 (4), §6 (5), §5.4–5.5 (6) |
| §2 authority | §3, extended to the director |
| §2 objective kinds | §5.1 — `reach_location` dropped, `narrative` → `reach_flag`, three kinds added |
| §2.1 confirm `setFlag` | §1.1 F1 — confirmed: ledger-applied and checkpointed with hard state |
| §3 data model, reward table | §5.2, §5.4 — mythical authorized per reward |
| §4 persistence, §4.1 checkpoint | §5.7, §4.5 — turn-scoped tables and derived progress |
| §5 generation | §5.8, §5.9 |
| §6 anti-drift | §6 — plus Director notes, Known cast, partial lore, measurement |
| §7 reward moment | §5.5 |
| §8 implementation order | §10 |
| §9 acceptance | §12 — 1–8 carried, 9–14 new |
| §10 risks | §14 |
