# Live Combat Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: execute this plan sequentially with
> test-driven-development and verification-before-completion. This repository forbids parallel
> coding agents; complete and commit one task before starting the next. Preserve deterministic
> framework authority, atomic persistence, and browser/native bridge parity.

**Origin:** Second provider-backed packaged human pass (Solo Leveling RPG story, Gemini classifier).
Four defects were reported with screenshots; root causes were traced to source before this plan.

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

- [ ] **Step 1:** Write a failing test in `npcAgency.test.ts` — seed a present creature with
  `instantiateGeneric`-shaped hard state (**no skills, no inventory**, lethal resource only), a schema
  whose ONLY offensive action gates on a skill/weapon, then have the player attack it and assert the
  creature produces its OWN authoritative counter ruling targeting the player with committed damage.
  (This reproduces the live shadow_entity bug exactly.)
- [ ] **Step 2:** Observe RED — today `chooseCounterAction` finds no gate-legal attack, so no counter.
- [ ] **Step 3:** Implement decision (A): a config-owned universal `natural_attack` (category combat, no
  `requiresSkill`/`requiresItemKind`, `defaultTargetDamage` so it deals implicit damage) present in every
  full-stat catalog. Confirm the resolver already damages it via the config-v2 path.
- [ ] **Step 4:** Full suite green; add a negative test (a peaceful present NPC still does not attack; a
  dead creature still never acts). Watch the existing fixture tests — `attack_wild` already models a
  no-requirement attack, so fixture-based tests may already pass; the gap is generated catalogs.
- [ ] **Step 5:** Commit `core: guarantee a gate-legal natural attack so creatures fight back`.

### Task 2 (P1): Meaningful melee damage — scale by attribute/weapon, and/or balance forge HP

**Files:**
- Modify: `packages/core/src/engine/resolver.ts` (+ universal-actions config)
- Modify (optional): `packages/core/src/bootstrap/generate.ts`
- Test: `packages/core/test/resolver.test.ts` (or `v7Resolver.test.ts`), bootstrap generate test

- [ ] **Step 1:** Failing test — an implicit-melee strike by a higher-STR attacker deals more than the
  flat `-4` (attribute modifier and/or weapon prop contributes).
- [ ] **Step 2:** Observe RED (flat `-4` regardless of attacker).
- [ ] **Step 3:** Scale implicit melee/ranged damage by the governing-attribute modifier (and equipped
  weapon prop when present), keeping a sane floor. Consider a forge rule sizing creature lethal
  resource to expected per-hit damage so encounters resolve in a reasonable turn count.
- [ ] **Step 4:** Verify existing damage tests still pass (they encode the old flat default — update
  intentionally, not by number-fudging).
- [ ] **Step 5:** Commit `core(engine): scale implicit strike damage by attacker power`.

### Task 3 (P1): Fewer "no prose" turns — provider retry + richer deterministic fallback

**Files:**
- Modify: `packages/core/src/router/*` (retry/backoff)
- Modify: `packages/core/src/orchestrator/authorityGuard.ts` (fallback prose states the ruling)
- Test: router retry test, `authorityGuard.test.ts`

- [ ] **Step 1:** Failing tests — a transient provider error retries once before falling back; the
  deterministic fallback prose names the committed outcome (e.g. "the strike lands for 4 damage")
  instead of a generic line, WITHOUT asserting any unrecorded mechanic.
- [ ] **Step 2:** Observe RED.
- [ ] **Step 3:** Add bounded retry/backoff (respect the stage deadline from `stagePolicy.ts`); enrich
  `safeSummary` from ruling facts (allowed/outcome/committed effect) while keeping the authority wall.
- [ ] **Step 4:** Full authority + turn suites green.
- [ ] **Step 5:** Commit `core: retry transient provider errors and enrich safe fallback prose`.

### Task 4 (P2): Resolve ambiguous "attack" via recent target + presence hygiene

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

Complete when Tasks 1–4 are checked with fresh RED→GREEN evidence, `npm test` + typecheck are green, and
the WORKLOG/HANDOFF record what landed and what remains. The human then rebuilds the installer and
repeats the live Solo Leveling journey: attack the shadow entity → it counter-attacks through a visible
DM ruling with meaningful damage; provider hiccups still produce readable prose; an ambiguous "attack"
continuation resolves to the correct present living target.

## Progress log (update as you go — exact stopping point for the next agent)

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
