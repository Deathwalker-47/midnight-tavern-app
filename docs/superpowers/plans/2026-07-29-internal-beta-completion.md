# Internal Beta Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: execute this plan sequentially with
> test-driven-development and verification-before-completion. This repository forbids parallel
> coding agents; complete and commit one task before starting the next.

**Goal:** Close every Internal Beta gap in dependency order while preserving deterministic
framework authority, atomic persistence, bridge parity, and recoverable long-running operations.

**Architecture:** First separate story-wide character registration from current scene presence.
Then make NPC introductions and scene transitions structured engine-owned stages that run before
narration, followed by deterministic and bounded NPC agency. Once the authoritative turn pipeline
is complete, close verified streaming/latency, Forge reliability, packaged acceptance, UI test
warnings, and finally the later release-security phase.

**Tech Stack:** TypeScript, Zod, SQLite, Vitest, React, Zustand, Vite, Tauri 2, Rust.

## Global Constraints

- Work sequentially; never run parallel coding agents in this repository.
- The engine owns gates, dice, effects, costs, deaths, loot, progression, action budgets, scene
  presence, registry writes, and committed state.
- Models may propose structured data and write prose; all proposals are schema-validated and
  engine-approved before persistence or narration.
- Every actual NPC introduced into fiction receives a character-registry row.
- Scenery, crowds-as-background, murals, statues, and non-character nouns never receive rows.
- Registry membership does not imply scene presence.
- Only present, living characters may classify, act, appear in the party strip, or enter the
  narrator's present-character hard-state block.
- Narration may not contradict immutable rulings and may not introduce an unregistered NPC.
- Player and NPC action budgets remain separate.
- Bridge parity is mandatory; browser-safe paths cannot import `node:` or native dependencies.
- Each behavior change follows red → observed failure → minimal implementation → green.
- Each task ends with `npm run typecheck`, relevant focused tests, `npm test`, a worklog/handoff
  update, and a coherent commit.
- Do not add, delete, or overwrite `.codex/` or `opencode.json`.
- Signing, updater provisioning, and strict CSP remain after the Internal Beta exit gate.

## File Responsibility Map

- `packages/core/src/store/db.ts` — versioned SQLite migrations.
- `packages/core/src/store/repositories/characters.ts` — registry records and scene-presence access.
- `packages/core/src/orchestrator/checkpoint.ts` — rollback pre-images for presence and characters.
- `packages/core/src/orchestrator/sceneEntityPromotion.ts` — bounded legacy/catch-up recognition.
- `packages/core/src/orchestrator/npcIntroduction.ts` — new structured introduction/transition stage.
- `packages/core/src/orchestrator/npcAgency.ts` — deterministic reactions and bounded NPC choices.
- `packages/core/src/orchestrator/turn.ts` — ordered turn stages and atomic commit.
- `packages/core/src/orchestrator/context.ts` — immutable narrative contract and present cast.
- `packages/core/src/orchestrator/authorityGuard.ts` — verified chunk release.
- `packages/core/src/router/router.ts` — request deadlines and stage timing.
- `packages/core/src/config/model-recommendations.json` — responsive role defaults.
- `packages/core/src/bootstrap/generate.ts` — Forge stages, repairs, and validation.
- `packages/ui/src/bridge/core.ts` / `sqliteBridge.ts` — parity for presence and operation progress.
- `packages/ui/src/state/playStore.ts` — streamed deltas and durable operation state.
- `packages/ui/src/screens/StoryBlueprint.tsx` / `Wizard.tsx` / `StorySettings.tsx` — durable Forge and
  regeneration UX.
- `packages/ui/src/screens/Play.tsx` / `Overview.tsx` — final warning cleanup and visible telemetry.

---

### Task 1: Persist Registry Membership Separately from Scene Presence

**Files:**
- Modify: `packages/core/src/store/db.ts`
- Modify: `packages/core/src/store/repositories/characters.ts`
- Modify: `packages/core/src/orchestrator/turn.ts`
- Test: `packages/core/test/store/repositories.test.ts`
- Test: `packages/core/test/store/db.test.ts`

**Interfaces:**
- Produces: `CharacterRecord.present: boolean`
- Produces: `CharacterRepo.listPresentByStory(storyId): Promise<CharacterRecord[]>`
- Produces: `CharacterRepo.setPresent(id, present): Promise<void>`
- Migration: version 11, `character_scene_presence`

- [x] **Step 1: Write failing repository tests**

```ts
it("keeps registered characters while filtering scene presence", async () => {
  await store.characters.insert({ ...npc, present: false });
  expect((await store.characters.listByStory(storyId)).map((c) => c.id)).toContain(npc.id);
  expect(await store.characters.listPresentByStory(storyId)).toEqual([]);
  await store.characters.setPresent(npc.id, true);
  expect((await store.characters.listPresentByStory(storyId)).map((c) => c.id)).toEqual([npc.id]);
});
```

- [x] **Step 2: Run the focused tests and observe the missing API failure**

Run:

```powershell
npm --prefix packages/core test -- test/store/repositories.test.ts test/store/db.test.ts
```

Expected: TypeScript/Vitest fails because `present`, `listPresentByStory`, and `setPresent` do not
exist.

- [x] **Step 3: Add migration 11 and repository support**

```ts
export interface CharacterRecord {
  id: string;
  storyId: string;
  name: string;
  isPlayer: boolean;
  present: boolean;
  hard: CharacterHardState;
  soft?: CharacterSoftState;
  softTier?: SoftTier;
}
```

Migration SQL:

```sql
ALTER TABLE characters ADD COLUMN present INTEGER NOT NULL DEFAULT 1;
CREATE INDEX idx_characters_story_present
  ON characters(story_id, present, is_player, name);
```

Repository behavior:

```ts
listPresentByStory(storyId) {
  return db
    .all<Row>(
      "SELECT * FROM characters WHERE story_id = ? AND present = 1 ORDER BY is_player DESC, name",
      storyId
    )
    .then((rows) => rows.map(toRecord));
}
```

- [x] **Step 4: Run focused tests, typecheck, and the complete suite**

```powershell
npm run typecheck
npm --prefix packages/core test -- test/store/repositories.test.ts test/store/db.test.ts
npm test
```

- [x] **Step 5: Commit**

```powershell
git add packages/core/src/store/db.ts packages/core/src/store/repositories/characters.ts packages/core/src/orchestrator/turn.ts packages/core/test/store/repositories.test.ts packages/core/test/store/db.test.ts
git commit -m "core(store): separate character registry from scene presence"
```

### Task 2: Make Presence Authoritative and Rollback-Safe

**Files:**
- Modify: `packages/core/src/store/db.ts`
- Modify: `packages/core/src/store/repositories/checkpoints.ts`
- Modify: `packages/core/src/orchestrator/checkpoint.ts`
- Modify: `packages/core/src/orchestrator/turn.ts`
- Modify: `packages/core/src/orchestrator/context.ts`
- Modify: `packages/ui/src/bridge/core.ts`
- Modify: `packages/ui/src/bridge/sqliteBridge.ts`
- Test: `packages/core/test/orchestrator/history.test.ts`
- Test: `packages/core/test/orchestrator/npcAgency.test.ts`
- Test: `packages/ui/test/bridge/sqliteBridge.test.ts`
- Test: `packages/ui/test/bridge/memoryBridge.test.ts`

**Interfaces:**
- Consumes: `CharacterRepo.listPresentByStory`, `CharacterRepo.setPresent`
- Produces: checkpoint `presencePreJson: string`
- Migration: version 12, `checkpoint_scene_presence`

- [x] **Step 1: Write failing tests for absent NPC exclusion and rewind**

```ts
expect(classifierPrompt).not.toContain("retired-guard");
expect(result.rulings.some((r) => r.actorId === "retired-guard")).toBe(false);
expect((await store.characters.get("retired-guard"))?.present).toBe(false);
await rewindTo(store, storyId, priorTurn);
expect((await store.characters.get("retired-guard"))?.present).toBe(true);
```

- [x] **Step 2: Observe failures**

```powershell
npm --prefix packages/core test -- test/orchestrator/history.test.ts test/orchestrator/npcAgency.test.ts
npm --prefix packages/ui test -- test/bridge/sqliteBridge.test.ts test/bridge/memoryBridge.test.ts
```

- [x] **Step 3: Snapshot presence and switch every present-cast consumer**

```ts
const present = Object.fromEntries(roster.map((character) => [character.id, character.present]));
```

Use `listPresentByStory` in `runTurnOperation`, `assembleContext`, native `listPresentCast`, and the
in-memory bridge equivalent. Restore every saved boolean in `applyRestore`.

- [x] **Step 4: Verify bridge parity, history, and full suite**

```powershell
npm run typecheck
npm --prefix packages/core test -- test/orchestrator/history.test.ts test/orchestrator/npcAgency.test.ts
npm --prefix packages/ui test -- test/bridge/sqliteBridge.test.ts test/bridge/memoryBridge.test.ts
npm test
```

- [x] **Step 5: Commit**

```powershell
git commit -am "core(orchestrator): make scene presence authoritative"
```

Completed in `de443cf`. Migration 12 persists checkpoint presence pre-images; rewind restores every
saved boolean; classifier/context/NPC agency/analyzer/suggestions/native cast all use the present
roster while dossier/history retain the complete registry. Focused RED failures were observed for
absent-NPC agency, rewind, and native bridge filtering before implementation.

### Task 3: Add an Engine-Validated NPC Introduction Contract

**Files:**
- Create: `packages/core/src/orchestrator/npcIntroduction.ts`
- Modify: `packages/core/src/orchestrator/turn.ts`
- Modify: `packages/core/src/orchestrator/context.ts`
- Modify: `packages/core/src/orchestrator/index.ts`
- Test: `packages/core/test/orchestrator/npcIntroduction.test.ts`
- Test: `packages/core/test/orchestrator/npcAgency.test.ts`

**Interfaces:**
- Produces:

```ts
interface NpcIntroductionProposal {
  operation: "introduce" | "enter" | "leave";
  characterId?: string;
  name: string;
  templateId?: string;
  grounding: string;
}

interface ApprovedNpcTransition {
  character: CharacterRecord;
  operation: "introduce" | "enter" | "leave";
}
```

- [x] **Step 1: Write failing structured-stage tests**

Cover template introduction, generic bounded introduction, duplicate-name reuse, leave/re-entry,
invalid template rejection, mural/crowd rejection, cancellation, and malformed provider output.

- [x] **Step 2: Observe failures**

```powershell
npm --prefix packages/core test -- test/orchestrator/npcIntroduction.test.ts
```

- [x] **Step 3: Implement one bounded structured request and deterministic validation**

Use the classifier role with a strict Zod schema. The model may propose; the engine verifies that
the name/grounding appears in player text, recent narration, blueprint, or an approved template.
Reuse an existing registry row by normalized name before creating a stable per-story id.

- [x] **Step 4: Stage transitions before narration and commit them atomically**

Pass approved present characters into `assembleContext`. Add this narrator rule:

```text
You may portray only the registered present characters listed below. Do not introduce another
person, creature, speaking intelligence, or named NPC in prose.
```

- [x] **Step 5: Verify and commit**

```powershell
npm run typecheck
npm --prefix packages/core test -- test/orchestrator/npcIntroduction.test.ts test/orchestrator/npcAgency.test.ts test/orchestrator/authority.test.ts
npm test
git commit -am "core(orchestrator): validate NPC introductions before narration"
```

Completed in `350f805`. The bounded registrar validates template/generic identity and grounding,
reuses normalized registry rows, stages introduce/enter/leave before classification and narration,
and commits only with the complete turn. A narrator failure leaves no proposed row behind.

### Task 4: Retire Heuristic Promotion as an Authority Path

**Files:**
- Modify: `packages/core/src/orchestrator/sceneEntityPromotion.ts`
- Modify: `packages/core/src/orchestrator/turn.ts`
- Test: `packages/core/test/orchestrator/npcIntroduction.test.ts`

**Interfaces:**
- `discoverNarratedSceneEntities` becomes legacy catch-up only.
- New turns rely exclusively on `ApprovedNpcTransition`.

- [x] **Step 1: Write a failing test proving unknown narrator prose cannot create a row**
- [x] **Step 2: Observe the current heuristic creating the row**
- [x] **Step 3: Remove post-narration heuristic writes; retain bounded migration/catch-up behind an
  explicit legacy-story path**
- [x] **Step 4: Run introduction, agency, authority, history, and persistence suites**
- [x] **Step 5: Commit with `core(orchestrator): close heuristic NPC authority path`**

Completed as part of `350f805`. Generated prose cannot create registry rows. The old deterministic
recognizer remains only as a pre-classification catch-up for already-persisted narration.

### Task 5: Add Goal-Driven Bounded NPC Planning

**Files:**
- Modify: `packages/core/src/orchestrator/npcAgency.ts`
- Modify: `packages/core/src/orchestrator/turn.ts`
- Modify: `packages/core/src/orchestrator/context.ts`
- Test: `packages/core/test/orchestrator/npcAgency.test.ts`

**Interfaces:**

```ts
interface NpcActionProposal {
  actorId: string;
  actionId: string;
  targetId?: string;
  itemId?: string;
  skillId?: string;
  reason: string;
  confidence: number;
}
```

- [x] **Step 1: Write failing tests for aid, flee, surrender, converse, and exploit-opening choices**
- [x] **Step 2: Observe no goal-driven ruling on a non-combat player turn**
- [x] **Step 3: Keep counter/flee/surrender deterministic; use one small structured request only for
  ambiguous choices; validate actor/target/action/item/skill against present state and sealed catalogs**
- [x] **Step 4: Prove timeout/malformed output becomes no action without blocking narration**
- [x] **Step 5: Verify and commit with `core(orchestrator): add bounded goal-driven NPC planning`**

Completed in `04e83b7`. `planNpcActions` fires one bounded classifier request only when a present,
living, non-player NPC has not already reacted; deterministic code validates actor/action/target/
item/skill against present scene state, the sealed catalog, and the actor's gate before the engine
resolves each intent. Separate per-NPC encounter budget; fail-closed to no action on
malformed/timeout so narration is never blocked. Four tests cover exploit-opening on a non-combat
turn, ally aid via a sealed support action, validation rejection, and planner-error fail-closed.
NOTE for next agent: the planner issues a model call on every full-stat turn that has an idle
present NPC — Task 9 (stage deadlines/telemetry) should bound and instrument it. Deterministic
flee/surrender remain catalog-dependent; the fixture catalog has no flee/surrender action, so those
goals flow through the validated model path today.

### Task 6: Extend Deterministic Provocation Beyond Combat

**Files:**
- Modify: `packages/core/src/orchestrator/npcAgency.ts`
- Test: `packages/core/test/orchestrator/npcAgency.test.ts`

- [x] **Step 1: Write failing intimidation/threat tests and harmless-dialogue negatives**
- [x] **Step 2: Observe no reaction**
- [x] **Step 3: Add a sealed hostile/provocation predicate based on action category, stakes, and
  effects; never use raw prose alone**
- [x] **Step 4: Run agency and resolver suites**
- [x] **Step 5: Commit with `core(orchestrator): react to sealed non-combat provocation`**

Completed in `b753de3`. `isProvocation(action, ruling, stakes)` provokes on combat category, an
opposed contest, a sealed/committed target-harm effect, or classifier stakes of danger/opposed —
never prose. `turn.ts` threads `intent.stakes` (keyed by `ruling.turnId`) into `planNpcReactions`.
Healing/aid, harmless non-opposed dialogue, and self-directed actions draw no reaction. Four tests
cover damaging intimidation, a damage-free opposed contest, a harmless greeting, and healing the
creature. Core 502 (+4) + UI 137 = 639 green.

### Task 7: Prove Streaming from Provider to Play UI

**Files:**
- Modify: `packages/core/test/orchestrator/authorityGuard.test.ts`
- Modify: `packages/ui/test/bridge/sqliteBridge.test.ts`
- Modify: `packages/ui/test/screens/Play.test.tsx`
- Modify only if a test fails: `packages/ui/src/bridge/sqliteBridge.ts`, `playStore.ts`

- [x] **Step 1: Add a multi-delta provider → core → bridge → store → Play smoke test**
- [x] **Step 2: Observe the first boundary that drops or coalesces safe deltas**
- [x] **Step 3: Thread the same `onDelta` callback through that boundary**
- [x] **Step 4: Assert the first safe paragraph is visible before the provider promise resolves**
- [x] **Step 5: Verify and commit with `ui(play): prove end-to-end verified streaming`**

Completed in `fccab2c`. Proof task — NO boundary dropped or coalesced deltas, so no source changed.
`onDelta` was already threaded provider → `generateGuardedNarration` (safe-paragraph release) →
`turn.ts` → `sqliteBridge.submitTurn` → `playStore` (`proseBuffer += delta`) → `Play`
(`data-testid="play-prose-buffer"`, shown while `operationPhase === "streaming"`). Three temporal
tests gate the provider promise and assert the first safe paragraph is delivered/rendered while it is
still pending, at the core, bridge, and Play boundaries respectively. core 503 (+1) + UI 139 (+2) =
642 green.

### Task 8: Release Verified Mechanical Beats Incrementally

**Files:**
- Modify: `packages/core/src/orchestrator/authorityGuard.ts`
- Test: `packages/core/test/orchestrator/authorityGuard.test.ts`

**Interfaces:**

```ts
interface NarrativeBeat {
  text: string;
  assertedRulingIds: string[];
}
```

- [ ] **Step 1: Write failing accepted/rejected mechanical-beat tests**
- [ ] **Step 2: Observe whole-draft buffering**
- [ ] **Step 3: Verify each complete beat deterministically against immutable rulings; release safe
  beats, replace unsafe beats with `safeSummary`, and never expose rejected text**
- [ ] **Step 4: Run authority and turn suites**
- [ ] **Step 5: Commit with `core(orchestrator): stream verified mechanical beats`**

### Task 9: Add Stage Deadlines, Fallbacks, and Telemetry

**Files:**
- Create: `packages/core/src/orchestrator/stagePolicy.ts`
- Modify: `packages/core/src/orchestrator/turn.ts`
- Modify: `packages/core/src/classifier/classify.ts`
- Modify: `packages/core/src/orchestrator/authorityGuard.ts`
- Modify: `packages/core/src/store/repositories/turnOperations.ts`
- Test: `packages/core/test/orchestrator/turn.test.ts`

**Interfaces:**

```ts
type TurnStage = "classifier" | "npc_introduction" | "npc_planner" | "narrator" | "authority_audit";
interface StageMetric {
  stage: TurnStage;
  startedAt: number;
  durationMs: number;
  outcome: "ok" | "fallback" | "timeout" | "cancelled" | "error";
}
```

- [ ] **Step 1: Write fake-clock timeout and duplicate-turn tests**
- [ ] **Step 2: Observe unbounded waits**
- [ ] **Step 3: Apply configured deadlines and deterministic fallbacks; persist metrics without
  exposing provider internals in prose**
- [ ] **Step 4: Verify restart/retry/cancel behavior**
- [ ] **Step 5: Commit with `core(orchestrator): bound turn stages and record latency`**

### Task 10: Make Responsive Models the Default

**Files:**
- Modify: `packages/core/src/config/model-recommendations.json`
- Modify: `packages/core/test/router/modelConfig.test.ts`
- Modify: `packages/ui/test/bridge/catalogParity.test.ts`

- [ ] **Step 1: Write failing expectations for a responsive narrator preset and speed/quality label**
- [ ] **Step 2: Observe the slower default**
- [ ] **Step 3: Update versioned configuration; keep Opus-class models as explicit quality choices**
- [ ] **Step 4: Run model config and bridge parity tests**
- [ ] **Step 5: Commit with `core(config): prefer responsive narrator defaults`**

### Task 11: Make Forge Progress Truthful, Bounded, and Recoverable

**Files:**
- Modify: `packages/core/src/bootstrap/generate.ts`
- Modify: `packages/core/src/bootstrap/repair.ts`
- Modify: `packages/ui/src/bridge/core.ts`
- Modify: `packages/ui/src/bridge/sqliteBridge.ts`
- Modify: `packages/ui/src/screens/StoryBlueprint.tsx`
- Modify: `packages/ui/src/screens/Wizard.tsx`
- Test: `packages/core/test/bootstrap/generate.test.ts`
- Test: `packages/ui/test/screens/StoryBlueprint.test.tsx`
- Test: `packages/ui/test/screens/Wizard.test.tsx`

- [ ] **Step 1: Write tests for stage timing, one bounded repair, timeout fallback, resume, and cancel**
- [ ] **Step 2: Observe stalled or non-durable progress**
- [ ] **Step 3: Persist a Forge operation with explicit stage/progress/detail/timing; keep the old
  story/rulebook until complete success**
- [ ] **Step 4: Verify navigation away/re-entry and native/browser bridge parity**
- [ ] **Step 5: Commit with `core(bootstrap): make forge bounded and resumable`**

### Task 12: Lock Card Attributes, Macros, and Starting Gear

**Files:**
- Modify: `packages/core/src/bootstrap/prompts.ts`
- Modify: `packages/core/src/bootstrap/generate.ts`
- Modify: `packages/core/src/macros/engine.ts`
- Test: `packages/core/test/bootstrap/generate.test.ts`
- Test: `packages/core/test/macros/macros.test.ts`
- Create: `packages/core/test/bootstrap/crossCardAcceptance.test.ts`

- [ ] **Step 1: Add three literal card/persona fixtures with explicit attributes, possessions, and
  `{{user}}` / `{{char}}` macros**
- [ ] **Step 2: Observe any substitution, dropped macro, or missing carried gear**
- [ ] **Step 3: Preserve explicit concepts/names and instantiate only explicitly carried starting gear**
- [ ] **Step 4: Run bootstrap, macro, equipment, and cross-card suites**
- [ ] **Step 5: Commit with `core(bootstrap): preserve card identity and starting gear`**

### Task 13: Close Remaining Product Acceptance Risks

**Files:**
- Modify/test: `packages/core/src/orchestrator/suggestions.ts`
- Modify/test: `packages/ui/src/screens/Lorebook.tsx`
- Modify/test: `packages/ui/src/screens/Characters.tsx`
- Modify/test: `packages/ui/src/screens/CharacterDossier.tsx`
- Modify/test: `packages/ui/src/screens/StorySettings.tsx`

- [ ] **Step 1: Add acceptance tests for grounded suggestions, retry preserving draft, lorebook
  hierarchy, dossier/loadout navigation, and regeneration persistence**
- [ ] **Step 2: Observe each failing behavior independently**
- [ ] **Step 3: Implement one failing behavior at a time, committing each screen/service slice**
- [ ] **Step 4: Run all core/UI tests and production UI build**
- [ ] **Step 5: Record packaged acceptance evidence in WORKLOG**

### Task 14: Eliminate the Seven React Test Warnings

**Files:**
- Modify: `packages/ui/test/screens/Play.test.tsx`
- Modify: `packages/ui/test/screens/Overview.test.tsx`
- Modify only if behavior is wrong: `packages/ui/src/screens/Play.tsx`, `Overview.tsx`

- [ ] **Step 1: Make stderr warnings fail the focused tests**
- [ ] **Step 2: Observe five `RulingBlock`, one `Play`, and one `Overview` failures**
- [ ] **Step 3: Flush reveal timers and await mount loads inside React `act`**
- [ ] **Step 4: Run the complete UI suite and confirm clean stderr**
- [ ] **Step 5: Commit with `test(ui): eliminate remaining act warnings`**

### Task 15: Internal Beta Exit Gate

**Files:**
- Modify: `Plan/next-phase-internal-beta.md`
- Modify: `docs/HANDOFF.md`
- Append: `docs/WORKLOG.md`

- [ ] **Step 1: Run typecheck, all tests, coverage, production build, and `cargo check` independently**
- [ ] **Step 2: Test create/import → play → close → reopen → continue in the packaged app**
- [ ] **Step 3: Test NPC introduction/presence/agency, safe streaming, Forge, suggestions, macros, and
  cross-card acceptance in the packaged app**
- [ ] **Step 4: Record exact commands, counts, durations, warnings, artifact paths, and hashes**
- [ ] **Step 5: Check the Internal Beta exit boxes only when every criterion has evidence**

### Task 16: Later Release Security and Distribution

**Files:**
- Modify: `packages/shell/src-tauri/tauri.conf.json`
- Modify: `packages/shell/RELEASE.md`
- Modify: `packages/shell/updater/latest.json`

- [ ] **Step 1: Provision Windows/macOS signing identities and updater keys outside the repository**
- [ ] **Step 2: Tighten CSP after enumerating required provider/network origins**
- [ ] **Step 3: Build signed MSI/NSIS/macOS artifacts and verify signatures**
- [ ] **Step 4: Publish updater metadata with verified hashes/signatures**
- [ ] **Step 5: Run install, upgrade, rollback, and clean-uninstall acceptance**

## Completion Definition

The plan is complete only when Tasks 1–15 are checked with fresh evidence, the Internal Beta
checklist is green, the seven React warnings are gone, and packaged acceptance proves the complete
user journey. Task 16 is the subsequent sellable-release phase and must not be conflated with
Internal Beta readiness.
