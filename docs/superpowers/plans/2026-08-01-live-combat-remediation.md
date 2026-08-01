# Live Combat Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: execute this plan sequentially with
> test-driven-development and verification-before-completion. This repository forbids parallel
> coding agents; complete and commit one task before starting the next. Preserve deterministic
> framework authority, atomic persistence, and browser/native bridge parity.

**Origin:** Second provider-backed packaged human pass (Solo Leveling RPG story, Gemini classifier),
plus the product owner's follow-up that NPCs should receive story-appropriate capabilities when they
are created and forged stories need substantially broader action and skill variety.

**Goal:** Make same-turn combat actually a fight — enemies attack back, damage is meaningful — and make
provider degradation degrade gracefully with honest prose, without weakening engine authority.

**Tech Stack:** TypeScript, Zod, SQLite, Vitest, React, Zustand, Vite, Tauri 2, Rust.

## Reported symptoms → root cause (verified in code before writing this plan)

1. **"Shadow entity still does not attack me."** A present, hostile ("stirring and volatile") NPC that
   the player attacks repeatedly never counter-attacks.
   - **VERIFIED ROOT CAUSE (corrected after tracing the code — the first hypothesis below was wrong):**
     `bootstrap/instantiate.ts::instantiateGeneric` builds a creature with no matching template as
     `{ attributes: {}, resources: {lethal: median}, skills: [], inventory: [] }` — **no skills, no
     weapon.** The generated offensive action "Weapon Strike" gates on the **Basic Strike skill** (and
     likely a weapon). `orchestrator/npcAgency.ts::chooseCounterAction` requires
     `checkGate(schema, npc, intent).allowed`, which DENIES (`skill_required`) for a skill-less
     creature. So no gate-legal attack exists → `chooseCounterAction` (and `planHostileNpcFallback`,
     which calls it) return nothing → the creature literally cannot fight back. `instantiateGeneric`'s
     own comment claims a generic foe "can deal damage" — it cannot.
   - **Discarded hypothesis (do NOT chase this):** "`dealsTargetHarm` ignores config-v2 implicit
     damage." FALSE — `requireStory` (turn.ts:127) applies `applyUniversalActionDefaults` BEFORE the
     orchestrator/npcAgency see the schema, so the injected `-4/-8` IS present in `action.effects`, and
     `dealsTargetHarm` correctly returns true for Weapon Strike. Harm detection is fine; the gate is the
     wall.
   - **FIX DIRECTION:** creatures need a **gate-legal natural attack** (no skill/weapon requirement).
     Preferred: a program/config-owned universal "natural attack / unarmed strike" family (like the
     fixture's `attack_wild`) that every full-stat catalog is guaranteed to contain, carrying implicit
     `defaultTargetDamage`. Then any present creature can answer. Alternatives: seed generic NPCs with a
     basic natural-attack skill, or have `chooseCounterAction` fall back to a program-owned unarmed
     intent the resolver recognizes. The engine must still resolve it (gates/dice/damage) — no
     prose-derived attacks.
2. **"How was damage calculated? the entity has ~100 health and attack dealt only 4 damage."** Flat
   `-4` default, STR 10 → `+0` modifier (adds nothing), no weapon damage prop on the universal strike →
   4/hit = ~25 hits to kill. Generated creature HP (~100) is mismatched to baseline damage.
3. **"No Prose sometime."** `authorityGuard.ts::safeSummary` ("For a breath, the scene holds…") is shown
   when the provider (Gemini) fails or the audit rejects the draft with nothing salvageable. Frequent
   Gemini errors/429 → frequent no-narrative turns.
4. **"Error" — "Mechanics safely paused · Provider error / Unresolved target."** Classifier failed AND
   deterministic recovery could not resolve the target because "Attack" was ambiguous between two
   present NPCs (stale "Dead man" + shadow_entity). `targetFocus.deriveRecentPlayerTargetId` exists but
   is not applied to this recovery path; stale present NPCs worsen ambiguity.
5. **"Actions and skills feel too limited."** Phase A merely asks for 4-8 skills, while Phase B emits
   exactly four actions per category (20 total). The v2 universal registry contains only 14 semantic
   families and contains no crafting family at all, despite crafting being a required category.
   Forge-time NPC templates may carry skills, but an emergent registry NPC receives none and the NPC
   action-planner prompt omits its learned skills. The result is narrow player choice and weak NPC
   differentiation even when the premise supports more.

## Global Constraints

- Work sequentially; never run parallel coding agents in this repository.
- The engine owns gates, dice, effects, costs, deaths, loot, progression, action budgets, scene
  presence, registry writes, target legality, and committed state. Models propose; they never mutate.
- No prose-derived mechanics. NPC attacks must be gate-legal sealed actions resolved by the engine.
- Player and NPC action budgets remain separate; NPC reactions use their own encounter budget.
- Bridge parity is mandatory; browser-safe paths cannot import `node:` or native dependencies.
- Each behavior change follows red → observed failure → minimal implementation → green.
- Each task ends with `npm run typecheck`, focused tests, `npm test`, a WORKLOG/HANDOFF update, and a
  coherent commit. Do NOT add/delete/overwrite `.codex/` or `opencode.json`. Do not push unless asked.
- Do not build a new installer until the human asks (they rebuild to test).

## File Responsibility Map

- `packages/core/src/config/*` (+ `engine/`) — universal-action implicit-damage config + damage math.
- `packages/core/src/engine/resolver.ts` — where implicit melee/ranged damage is applied and scaled.
- `packages/core/src/orchestrator/npcAgency.ts` — harm detection, counter/fallback action selection.
- `packages/core/src/bootstrap/generate.ts` — creature HP / baseline-damage balance at forge time.
- `packages/core/src/orchestrator/authorityGuard.ts` — richer deterministic fallback prose.
- `packages/core/src/router/*` — provider retry/backoff before fallback.
- `packages/core/src/classifier/*` + `orchestrator/turn.ts` — apply `targetFocus` to ambiguous recovery.
- `packages/core/src/orchestrator/npcIntroduction.ts` — scene-presence hygiene (retire absent NPCs).

---

### Task 1 (P0): NPCs can attack back — creatures need a gate-legal natural attack

**Files (likely):**
- Modify: `packages/core/src/config/registry.ts` (define a universal `natural_attack` / unarmed family
  with `defaultTargetDamage`, no skill/item requirement) and/or `applyUniversalActionDefaults` so every
  full-stat catalog is guaranteed to contain one.
- Possibly modify: `packages/core/src/bootstrap/generate.ts` (emit/guarantee the natural attack in the
  frozen catalog) and/or `packages/core/src/bootstrap/instantiate.ts` (so a generic creature can use it).
- Verify (probably NO change): `packages/core/src/orchestrator/npcAgency.ts` — `chooseCounterAction`
  already picks the first gate-legal harmful combat action; once a no-requirement attack exists in the
  catalog it will select it. Only touch it if a fallback-to-program-owned-intent path is chosen instead.
- Test: `packages/core/test/orchestrator/npcAgency.test.ts` (end-to-end via `submitTurn`) +
  a config/generate test that every full-stat catalog contains a no-requirement damaging attack.

**Design decision to make first (pick one, document it):**
- (A) Config-owned universal natural attack in the sealed catalog (preferred — one source of truth,
  every creature can use it, engine resolves it normally). OR
- (B) `chooseCounterAction` emits a program-owned unarmed intent when no cataloged attack is gate-legal
  (keeps the catalog unchanged but the resolver must recognise the synthetic action). (A) is cleaner.

- [x] **Step 1:** Write a failing test in `npcAgency.test.ts` — seed a present creature with
  `instantiateGeneric`-shaped hard state (**no skills, no inventory**, lethal resource only), a schema
  whose ONLY offensive action gates on a skill/weapon, then have the player attack it and assert the
  creature produces its OWN authoritative counter ruling targeting the player with committed damage.
  (This reproduces the live shadow_entity bug exactly.)
- [x] **Step 2:** Observe RED — today `chooseCounterAction` finds no gate-legal attack, so no counter.
- [x] **Step 3:** Implement decision (A): a config-owned universal `natural_attack` (category combat, no
  `requiresSkill`/`requiresItemKind`, `defaultTargetDamage` so it deals implicit damage) present in every
  full-stat catalog. Confirm the resolver already damages it via the config-v3 path.
- [x] **Step 4:** Full suite green; add a negative test (a peaceful present NPC still does not attack; a
  dead creature still never acts). Watch the existing fixture tests — `attack_wild` already models a
  no-requirement attack, so fixture-based tests may already pass; the gap is generated catalogs.
- [x] **Step 5:** Commit `core: guarantee a gate-legal natural attack so creatures fight back`.

### Task 2 (P0): Assign story-grounded NPC capabilities at creation

**Domain decision:** Do not add a second per-character action catalogue. A story action is the
single frozen executable definition; an NPC capability loadout is the character's learned skills,
attributes, resources, and equipped items that make a subset of those actions gate-legal. The model
may select only sealed story skill ids; the engine validates and instantiates them.

**Files:** `orchestrator/npcIntroduction.ts`, `bootstrap/instantiate.ts`,
`orchestrator/npcAgency.ts`, and their focused tests.

- [x] Failing tests: a grounded emergent NPC may propose at most three sealed skill ids; known ids
  are learned at novice rank, unknown/duplicate ids are filtered, and template NPCs retain their
  authored loadout.
- [x] Add bounded `skillIds` to new-actor proposals and expose concise sealed skills to the registrar.
  Never accept model-authored ranks, actions, effects, equipment, attributes, or resource values.
- [x] Include learned skills and gate-relevant state in NPC planner context so proposals reflect what
  each actor owns; the engine gate remains authoritative.
- [x] Full verification and commit `core: assign sealed skill loadouts when NPCs enter the registry`.

### Task 3 (P1): Broaden universal families and forge-time skill/action variety

**Files:** `config/universal-actions.json`, `config/registry.ts`, `types/actions.ts`,
`bootstrap/prompts.ts`, `bootstrap/generate.ts`, `bootstrap/validate.ts`, and focused tests.

- [x] Failing tests: several distinct families exist in every category (including crafting); a new
  forge produces six actions per category (30 total), includes a natural attack, and has a broader
  bounded skill set grounded in the premise.
- [x] Introduce universal registry v4 with balanced families such as grapple/control, intimidate/
  empathize, track/navigate/decipher, and craft/repair/harvest/concoct/dismantle. Families remain
  semantic; Phase B specializes them into story-specific executable actions.
- [x] Raise the generated catalogue to 30 and the skill target to 6-10. Require semantic diversity
  without forcing irrelevant magic, crafting, social, or combat mechanics into every premise.
- [x] Ensure each key hostile template has action-enabling capability or explicitly relies on the
  baseline natural attack; support/social NPCs receive role-appropriate skills.
- [x] Verify provider token/deadline budgets and resume checkpoints, then commit
  `core(bootstrap): broaden story-grounded skills and action families`.

### Task 4 (P1): Meaningful melee damage — scale by attribute/weapon, and/or balance forge HP

**Files:**
- Modify: `packages/core/src/engine/resolver.ts` (+ universal-actions config)
- Modify (optional): `packages/core/src/bootstrap/generate.ts`
- Test: `packages/core/test/resolver.test.ts` (or `v7Resolver.test.ts`), bootstrap generate test

- [x] **Step 1:** Failing test — an implicit-melee strike by a higher-STR attacker deals more than the
  flat `-4` (attribute modifier and/or weapon prop contributes).
- [x] **Step 2:** Observe RED (flat `-4` regardless of attacker).
- [x] **Step 3:** Scale implicit melee/ranged damage by the governing-attribute modifier (and equipped
  weapon prop when present), keeping a sane floor. Consider a forge rule sizing creature lethal
  resource to expected per-hit damage so encounters resolve in a reasonable turn count.
- [x] **Step 4:** Verify existing damage tests still pass (they encode the old flat default — update
  intentionally, not by number-fudging).
- [x] **Step 5:** Commit `core(engine): scale implicit strike damage by attacker power`.

### Task 5 (P1): Fewer "no prose" turns — provider retry + richer deterministic fallback

**Files:**
- Modify: `packages/core/src/router/*` (retry/backoff)
- Modify: `packages/core/src/orchestrator/authorityGuard.ts` (fallback prose states the ruling)
- Test: router retry test, `authorityGuard.test.ts`

- [x] **Step 1:** Failing tests — a transient provider error retries once before falling back; the
  deterministic fallback prose names the committed outcome (e.g. "the strike lands for 4 damage")
  instead of a generic line, WITHOUT asserting any unrecorded mechanic.
- [x] **Step 2:** Observe RED.
- [x] **Step 3:** Add bounded retry/backoff (respect the stage deadline from `stagePolicy.ts`); enrich
  `safeSummary` from ruling facts (allowed/outcome/committed effect) while keeping the authority wall.
- [x] **Step 4:** Full authority + turn suites green.
- [x] **Step 5:** Commit `core: retry transient provider errors and enrich safe fallback prose`.

### Task 6 (P2): Resolve ambiguous "attack" via recent target + presence hygiene

**Files:**
- Modify: `packages/core/src/classifier/*` and/or `orchestrator/turn.ts`
- Modify: `packages/core/src/orchestrator/npcIntroduction.ts` (retire absent NPCs)
- Test: `targetFocus.test.ts` / `turn.test.ts` / `npcIntroduction.test.ts`

- [ ] **Step 1:** Failing test — classifier fails on an ambiguous "attack it again" with two present
  NPCs; recovery resolves to the recent unique living target via `deriveRecentPlayerTargetId` instead of
  "unresolved target".
- [ ] **Step 2:** Observe RED (today it fails closed).
- [ ] **Step 3:** Thread `targetFocus` into the recovery/target-resolution path; add presence hygiene so
  an NPC no longer in the scene leaves the present cast (reducing ambiguity like stale "Dead man").
- [ ] **Step 4:** Verify fail-closed still holds when the recent target is genuinely ambiguous.
- [ ] **Step 5:** Commit `core(orchestrator): resolve ambiguous attack via recent target`.

## Completion Definition

Complete when Tasks 1–6 are checked with fresh RED→GREEN evidence, `npm test` + typecheck are green, and
the WORKLOG/HANDOFF record what landed and what remains. The human then rebuilds the installer and
repeats the live Solo Leveling journey: attack the shadow entity → it counter-attacks through a visible
DM ruling with meaningful damage; provider hiccups still produce readable prose; an ambiguous "attack"
continuation resolves to the correct present living target.

## Progress log (update as you go — exact stopping point for the next agent)

- **2026-08-01 (Task 5 complete at `e7548ab`):**
  - Three intended RED failures proved 429 responses did not retry, safe fallback omitted the
    actor/action/outcome, and unsafe narration hints could leak invented death/damage/loot.
  - Provider calls now make at most three attempts for network errors and HTTP 408/409/425/429/5xx,
    inside the original timeout/cancellation guard. Backoff starts at 250ms; Retry-After is honored
    but capped at two seconds. Permanent failures fail immediately.
  - Streaming retries only before the first visible delta, preventing duplicated prose.
  - Deterministic fallback names the ruling actor, action, and outcome. Only non-mechanical,
    contradiction-free hints may be appended; recorded deaths come only from `causedDeathOf`.
  - Fresh gate: typecheck; core 596 / UI 156 = 752 tests. A root build also refreshed local Tauri
    bundles unnecessarily; do not treat them as acceptance artifacts or rebuild them.
  - **NEXT:** Task 6 RED test for recent-target recovery plus explicit-evidence presence hygiene.

- **2026-08-01 (Task 4 complete at `e43ae50`):**
  - Three intended RED failures proved natural attacks remained flat, weapon damage was ignored when
    a generated attack omitted `scaleByItemProp`, and generic NPCs inherited player-scale health.
  - Combat attack damage now adds the positive governing-attribute modifier and a bounded item
    damage prop. A weapon-required attack infers the conventional `damage` prop when omitted.
  - Any combat involving a generic NPC uses a deterministic six-hit floor against the lethal
    resource, immediately repairing already-created 100-health fallback creatures. Newly created
    generic NPCs receive a six-baseline-hit lethal pool; named templates retain authored durability.
  - Model-provided item damage is clamped to 0-20 before it enters authoritative mutations.
  - Fresh gate: typecheck; core 592 / UI 156 = 748 tests; direct core/UI builds. Death/rollback/
    history/difficulty suites remained green; no installer was built.
  - **NEXT:** Task 5 RED tests for transient provider retries and richer ruling-derived fallback prose.

- **2026-08-01 (Task 3 complete at `e3a4801`):**
  - RED observed for registry version/balance, cross-category family validation, 30-action prompts,
    6-10 skill bounds, and output budgets.
  - Universal registry v4 now has at least six semantic families in combat, social, exploration,
    crafting, and utility. Forge output is exactly six actions/category (30 total), with at least
    four distinct families/category and a protected ungated `attack_natural` action.
  - Full-stat Phase A accepts only 6-10 generated premise-grounded skills. Foundation guidance gives
    key NPC templates role-appropriate sealed skills while hostile creatures may rely on the natural
    baseline. Family/category mismatches fail both fragment and final validation.
  - Action batch output budgets scale from 5,000 to 7,500 tokens, repair to 9,000, and per-fragment
    deadline to 60 seconds. Retained fragments/checkpoints remain unchanged.
  - Repeated Windows worker-pool EPIPE crashes were eliminated by making the core Vitest gate use one
    deterministic worker. Fresh gate: typecheck; core 588 / UI 156 = 744 tests; core/UI builds.
  - **NEXT:** Task 4 RED tests for meaningful implicit damage and encounter-health balance.

- **2026-08-01 (Task 2 complete at `41c5963`):**
  - RED observed in four focused assertions: generic instantiation ignored sealed skill ids, the
    registrar prompt exposed no skill catalogue, excess proposals were silently accepted, and the
    NPC planner omitted gate-relevant hard state.
  - New-actor proposals may select at most three sealed story skill ids. Generic instantiation
    filters unknown ids, deduplicates known ids, and grants only novice rank with zero successes.
    Template actors retain their authored loadout and existing-character presence transitions
    cannot rewrite capability state.
  - The registrar sees concise sealed skill ids/names/descriptions; the NPC planner sees attributes,
    resources, learned skills, and inventory. Engine gates remain authoritative.
  - Fresh gate: typecheck passed; core 585 / UI 156 = 741 tests passed.
  - **NEXT:** Task 3 RED tests for a balanced v4 family registry, 30 generated actions, and a bounded
    premise-grounded 6-10 skill set.

- **2026-08-01 (Task 1 complete at `bd968fb`):**
  - RED observed at both boundaries: `applyUniversalActionDefaults` returned no natural action, and a
    promoted NPC with `skills: []` / `inventory: []` produced only the player's ruling.
  - Universal config v3 adds `attack_natural`; runtime normalization appends the canonical
    `universal_natural_attack` only when a full-stat story has no gate-legal natural-family action.
    Its normal resolver path supplies dice, visible ruling, implicit `-4/-8` lethal-resource damage,
    and committed state. Persisted older catalogues are not mutated.
  - Browser fallback config mirrors native core exactly. Existing neutral/dead/absent actor tests
    continue to fail closed.
  - Fresh gate: typecheck passed; core 580 / UI 156 = 736 tests passed.
  - **NEXT:** Task 2 failing registrar/instantiation tests for bounded sealed-skill NPC loadouts.

- **2026-08-01 (session paused here — this is the exact stopping point):**
  - Plan created from the second packaged human pass (Gemini, Solo Leveling RPG).
  - **Diagnosis phase DONE and verified against source.** Task 1's root cause was traced, an initial
    wrong hypothesis was found and discarded (see the Task-1 root-cause note), and the CORRECT cause is
    confirmed: `instantiateGeneric` makes creatures with `skills:[]`/`inventory:[]`, so they cannot pass
    the gate of a skill/weapon-gated attack, so `chooseCounterAction` returns nothing → no counter.
  - Verification evidence gathered this session: read `npcAgency.ts` (`dealsTargetHarm`,
    `chooseCounterAction`, `planHostileNpcFallback`), `config/registry.ts::applyUniversalActionDefaults`
    (confirms implicit `-4/-8` damage injection), `turn.ts::requireStory` line 127 (confirms the schema
    is normalized BEFORE npcAgency sees it — so harm-detection is NOT the bug), and
    `bootstrap/instantiate.ts::instantiateGeneric` (confirms no skills/inventory).
  - **NO source code changed yet.** No test written yet. Repo is green at HEAD `14e320c`
    (core 578 / UI 156 = 734), typecheck clean, tree clean (only `.codex/`, `opencode.json`).
  - **NEXT AGENT — start at Task 1, Step 1** (the failing test above reproduces the shadow_entity bug).
    Then Tasks 2→3→4 in order. Damage/`no-prose`/ambiguous-target root causes in the symptom section
    above are diagnosed but NOT yet source-verified as deeply as Task 1 — verify each before implementing.
  - Do not push; do not build an installer until the human asks.
