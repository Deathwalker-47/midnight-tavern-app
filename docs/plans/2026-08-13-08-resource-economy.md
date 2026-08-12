# Plan 08 — Resource economy and skill mechanics

**Created:** 2026-08-13
**Covers owner findings:** 16 (repeat-action penalty too harsh, scope it per-target), 21 (weapons
carry a stamina cost), 22 (Health / Mana / Stamina on every character), 23 (skill overhaul: mana
cost, types, duration, targets, cooldown, passives), 24 (recovery model)
**Size:** XL — the largest schema change since the engine was written.
**Depends on:** plan 05 (proves the deterministic-variation approach). Blocks plans 09 and 10.
**Blocked on owner decisions D5 and D7.**
**Status:** Planned. Not authorized.

---

## 1. Finding 16 — the repeat penalty is already target-scoped, but brutal

### What is actually there

```json
// packages/core/src/config/progression.json
"repetitionWindowTurns": 5,
"repetitionMultipliers": [1, 0.5, 0.25, 0],
"outcomeBaseXp": { "crit_failure": 4, "failure": 6, "success": 10, "crit_success": 15 },
"maximumAward": 20
```

```ts
// packages/core/src/orchestrator/turn.ts:673-680
const recentSimilarUses = priorRulings
  .slice(-5)
  .filter((record) =>
    record.ruling.actorId === intent.actorId &&
    record.ruling.actionId === intent.actionId &&
    record.ruling.targetId === intent.targetId      // <-- ALREADY target-scoped
  ).length;
```

**Half the owner's request is already implemented.** The window already keys on `targetId`, so
attacking a *different* character does reset the counter. Two real defects remain:

1. **The curve is punishing.** The 4th consecutive use earns **zero** XP. With only two or three
   skills early on, and a weak enemy needing several hits, the player is on 0 XP almost immediately —
   exactly the owner's complaint.
2. **The window is wrong.** `priorRulings` is `store.rulings.listByStory(storyId)` — *every ruling
   ever* — and `.slice(-5)` takes the last five **globally**, not the last five by this actor, and
   not "within this fight". An NPC reaction ruling landing between the player's attacks silently
   consumes window slots. `repetitionWindowTurns: 5` is never actually read by this code path.

### Fix

- [ ] **1.1** Soften the curve. Proposed `repetitionMultipliers: [1, 0.8, 0.6, 0.5, 0.4]` with a
      floor of 0.4 rather than 0 — grinding is discouraged, never pointless. **Owner decision.**
- [ ] **1.2** Scope the window to the actor and to the current scene/fight rather than to the last
      five global rulings. Minimum viable: filter `priorRulings` by `actorId` **first**, then take the
      last `repetitionWindowTurns`. Better: bound by the current chapter or by an engine-owned
      encounter id if plan 04/09 introduces one.
- [ ] **1.3** Make the code actually read `repetitionWindowTurns` instead of the hard-coded `-5`.
- [ ] **1.4** Confirm whether NPC-actor rulings should count toward the player's window at all —
      they should not. Filtering by `actorId` (1.2) fixes this as a side effect; assert it in a test.
- [ ] **1.5** Read `packages/core/src/engine/progression.ts` `computeXpAward` before changing the
      config: the multiplier is clamped by `Math.min(Math.max(0, recentSimilarUses), length-1)`, so
      lengthening the array changes the plateau index. Verify the clamp still behaves.

## 2. Finding 22 — Health / Mana / Stamina on every character

### Current state

`ResourceDefSchema` (`packages/core/src/types/schema.ts:38`) is fully general: the forge invents a
story's resources. The Solo Leveling story generated `health, mana, fatigue, coins, xp`; Cyraeth
generated `health, mana, stamina, wealth_silver`. Exactly one is marked `lethal`.

Generic NPCs get **only** lethal resources (`instantiate.ts:114-120`), so an NPC has no mana or
stamina at all — they cannot pay a skill cost even in principle.

### Design

Introduce **canonical resource roles** rather than hard-coding three resource ids. The forge keeps
naming and theming them; the engine gains a stable way to find them.

```ts
// ResourceDefSchema gains:
  /** Stable engine-facing role. Exactly one lethal `health`; at most one each of mana/stamina. */
  role: z.enum(["health", "mana", "stamina", "currency", "experience", "other"]).optional(),
```

- The forge must emit a `health`, a `mana` and a `stamina` role for every Full-Stats story
  (validated in `bootstrap/validate.ts`).
- Theming is preserved — a story may call stamina "Grit" or mana "Aether"; only the `role` is fixed.
- `instantiateGeneric` grants health **and** mana **and** stamina, so NPCs can pay costs.
- [ ] **2.1** Legacy stories have no `role`. Add a deterministic inference for existing schemas
      (`lethal` → health; id/label matching `mana|aether|essence` → mana; `stamina|fatigue|grit` →
      stamina) so old saves keep working **without a schema rewrite**. Note that Solo Leveling's
      `fatigue` is an *inverted* stamina (0 is good) — decide explicitly whether inference should
      touch it or leave it `other`. **Recommendation: leave it `other`; do not silently invert a
      live story's economy.**

## 3. Finding 21 — weapons carry a stamina cost

`ItemDefSchema.props` is already `Record<string, number>` and `resolver.ts` already reads a
conventional `damage` prop for scaling. So `props.staminaCost` needs no schema change — but an
untyped convention is how the `damage` prop ended up needing a fallback inference.

- [ ] **3.1** Add a typed optional field instead: `staminaCost: z.number().int().min(0).optional()`
      on `ItemDefSchema` and on the runtime item definition used by the loot system.
- [ ] **3.2** In `resolver.ts`, when an action has `requiresItemKind: "weapon"`, add the equipped
      weapon's `staminaCost` to the attempt cost. **Attempt costs are paid win or lose** (existing
      resolver behaviour) — confirm that is the intended feel with the owner; it is the D&D-ish
      answer and matches "cost to swing".
- [ ] **3.3** Insufficient stamina must **deny at the gate**, not fail the roll, with a distinct
      gate code (`insufficient_resource`) so the ruling card explains it. `checkGate` already checks
      affordability of `action.costs`; extend it to include item-derived costs so the gate and the
      resolver agree. **They must use one shared function — a divergence here means the gate
      permits what the resolver cannot pay.**
- [ ] **3.4** Clamp `staminaCost` on untrusted/generated definitions the way `MAX_ITEM_DAMAGE_BONUS`
      already clamps damage.

## 4. Finding 23 — the skill overhaul

### Current `SkillDefSchema` (`types/schema.ts:115`)

```ts
{ id, name, description, tier, prerequisites, unlockPaths, masteryAdvance, advancedUses? }
```

No cost, no cooldown, no type, no duration, no targeting. Skills today are purely *gates* on actions.

### Proposed extension

```ts
export const SkillTypeSchema = z.enum([
  "active",     // invoked deliberately
  "passive",    // always on, never invoked
  "reaction",   // triggers on an event
  "toggle",     // on/off, may drain per turn
]);

export const SkillDefSchema = z.object({
  // ...existing...
  skillType: SkillTypeSchema.default("active"),
  /** Resource cost to invoke. Keyed by resource ROLE, not id, so themed names still work. */
  cost: z.record(z.enum(["mana", "stamina", "health"]), z.number().int().min(0)).optional(),
  /** Turns before reuse. 0/absent = no cooldown. */
  cooldownTurns: z.number().int().min(0).optional(),
  /** How long the effect persists, in turns. Absent = instantaneous. */
  durationTurns: z.number().int().min(0).optional(),
  targeting: z.object({
    scope: z.enum(["self", "single", "multiple", "all_allies", "all_enemies", "area"]),
    maxTargets: z.number().int().min(1).optional(),
  }).optional(),
});
```

### New engine state — cooldowns and active effects

Cooldowns are **hard state** and need a home:

```ts
// CharacterHardState gains:
  /** skillId -> the turn index at which it becomes usable again. */
  cooldowns: Record<string, number>;
  /** Active timed effects, engine-owned, ticked deterministically. */
  activeEffects: Array<{ sourceSkillId: string; expiresAtTurn: number; /* effect payload */ }>;
```

- [ ] **4.1** Cooldowns and effect expiry tick in the **ledger**, once per committed turn, and must
      be captured in the turn checkpoint so rewind restores them exactly. This is the single most
      likely place to break invariant 7 (delete/rewind restores hard state exactly). Add an explicit
      rollback test.
- [ ] **4.2** Passive skills must never be invocable — the classifier must not be able to emit an
      intent for one, and the gate must refuse it. Add both checks.
- [ ] **4.3** `advancedUses` already exists and is rank-gated; make sure the new fields compose with
      it rather than duplicating it.

## 5. Finding 24 — recovery (owner decision D5)

The owner's brief: *"make it feel like a genuine currency, but don't inconvenience the user all the
time. A tad bit easier than normal."*

**`ResourceDefSchema.regenPerScene` already exists** (`schema.ts:44`) and is optional. Confirm
whether anything currently applies it — grep the engine; if nothing reads it, it is a dormant field.

Proposed blended model:

| Mechanism | Applies to | Feel |
| --- | --- | --- |
| Per-scene regen | stamina — generous, most of it back each scene | stamina is a *pacing* resource within a fight, not a between-fights chore |
| Slow per-turn trickle | mana — small, always on | you can always cast eventually |
| Rest action | health — an engine-owned universal `recover` action already exists in the family registry | deliberate, costs narrative time |
| Consumables | all three | the interesting, scarce option |

- [ ] **5.1** Owner confirms. This is a feel decision and should be tuned in play, so make every
      number config-driven in `progression.json` (or a new `economy.json`) rather than hard-coded.
- [ ] **5.2** Regen ticks in the ledger, is checkpointed, and is deterministic.
- [ ] **5.3** Never let regen resurrect a dead character — clamp only for `alive` actors and never
      cross the death threshold upward without an explicit revive effect.

## 6. Migration and owner decision D7

This plan changes the **frozen schema**. D7 decides the cost:

- **Recommended: new stories only.** Existing saves keep their frozen rulebook and behave exactly as
  today. The existing "regenerate rulebook" path is offered as an explicit opt-in upgrade.
- Migrating a frozen rulebook in place would need to invent mana/stamina pools, costs and cooldowns
  for content that was never authored with them — inventing hard state for existing characters,
  which is precisely what the ledger-only rule exists to prevent.

- [ ] **6.1** Owner answers D7 before implementation begins.
- [ ] **6.2** Whatever the answer, add `schemaVersion: 3` and keep v1/v2 fully loadable. The existing
      `normalizeLegacyStorySchema` preprocessor is the pattern to follow.

## 7. Implementation order (one commit per numbered group)

1. §1 repeat penalty — smallest, immediately felt, no schema change. **Ship this first and alone.**
2. §2 resource roles + legacy inference.
3. §3 weapon stamina cost.
4. §4 skill schema + cooldown/effect state + ledger ticking + checkpoint.
5. §5 recovery.

## 8. Acceptance criteria

1. Repeating an action against the same target degrades XP gently to a floor, never to zero; a
   different target resets it; NPC rulings never consume the player's window.
2. Every Full-Stats character, including generic NPCs, has health, mana and stamina.
3. A weapon attack costs stamina; insufficient stamina **denies at the gate** with a clear reason,
   and gate and resolver never disagree about affordability.
4. Active skills cost resources and respect cooldowns; passive skills cannot be invoked.
5. Cooldowns and timed effects survive rewind/delete byte-identically.
6. Legacy v1/v2 stories load and play unchanged.
7. Engine branch coverage stays at 100%; suite green; typecheck clean.

## 9. Risks

- **Biggest risk in the whole plan set.** This touches the gate, the resolver, the ledger, the
  checkpoint, and the frozen schema simultaneously. Do not attempt it as one changeset.
- **Rewind correctness.** New hard state (cooldowns, active effects) must be in the checkpoint or
  invariant 7 breaks silently — rollback would restore health but not cooldowns.
- **Balance.** Adding costs to actions that were previously free makes every story harder overnight.
  Ship §3 and §4 behind the new `schemaVersion` so existing saves are unaffected.
- **Inverted resources.** Solo Leveling's `fatigue` counts *up*. Do not let role inference silently
  invert a live economy (2.1).
