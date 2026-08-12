# Plan 04 — Character taxonomy, sections, and loadout permissions

**Created:** 2026-08-13
**Covers owner findings:** 7 (character types + "is the whole system equipped to support all this?"),
8 (three umbrella sections + rich User panel), 9 (only User/Party loadouts editable)
**Size:** L
**Depends on:** plan 08 for the resources the rich User panel displays. Design brief item 1.
**Blocked on owner decision D3.**
**Status:** Planned. Not authorized.

---

## 1. Answering finding 7's real question: "is the whole system equipped to support all this?"

**Short answer: no, not yet — and the reason matters.**

Today a character's "type" is expressed by two fields that were never meant to carry it:

| Field | Where | Values | Side of the wall |
| --- | --- | --- | --- |
| `isPlayer` | `characters.is_player`, `CharacterHardState.isPlayer` | boolean | **hard** |
| `soft.tier` | `characters.soft_tier`, `SoftTierSchema` | `"primary" \| "secondary"` | **soft** |

`SoftTierSchema` (`packages/core/src/types/softState.ts:14`) is literally two values and lives in
**soft state**, whose sole writer is the analyzer model. That is the blocker:

> **Party membership has mechanical consequence** — a party member helps you in combat, can be
> targeted by aid actions, and (per finding 9) is the only non-User character whose loadout you may
> edit. Anything with mechanical consequence is **hard state** and may never be written by a model.

So the taxonomy cannot be bolted onto `soft.tier`. It needs a new hard-state field with an explicit
engine-owned writer. That is the whole cost of finding 7, and it is why this plan is L rather than S.

There is a third field with adjacent meaning: `flags[NPC_HOSTILE_TO_PLAYER_FLAG]`
(`packages/core/src/orchestrator/npcIntroduction.ts`), a hard-state boolean set only from validated
narrated evidence of an attack on the player. **Enemy status already exists** — it is just not
surfaced as a type, and it is binary rather than part of a taxonomy.

## 2. Owner decision D3 — the type list

Proposed, superseding the owner's initial four:

| Type | Meaning | Mechanical consequence |
| --- | --- | --- |
| `user` | the player's own character | exactly one per story; loadout editable |
| `party` | travels with the player, helps in and out of combat | loadout editable; eligible for ally-directed actions |
| `ally` | friendly but not travelling with you | none yet; may be recruited to `party` |
| `neutral` | ordinary NPCs, bystanders, non-threatening creatures | none |
| `rival` | opposed but not violent — competes, obstructs | disposition floor; never auto-attacks |
| `enemy` | hostile | derives the existing hostile flag; NPC agency may act |
| `creature` | non-intelligent beast or monster | no social actions targeted at it |
| `background` | crowds, scenery collectives — **not** individual actors | **never** registry-backed as an actor; see §2.1 |

- [ ] **2.1** `background` is deliberately *not* a character type in the registry. `CONTEXT.md`
      already forbids creating characters for scenery, crowds, and pronouns. Keep that rule. If the
      owner wants crowds represented, they are a *scene* concept, not a character — flag it back
      rather than quietly creating rows.
- [ ] **2.2** Owner confirms the list before implementation.

## 3. Design

### 3.1 New hard-state field

```ts
// packages/core/src/types/hardState.ts
export const CharacterRoleSchema = z.enum([
  "user", "party", "ally", "neutral", "rival", "enemy", "creature",
]);
export type CharacterRole = z.infer<typeof CharacterRoleSchema>;

// on CharacterHardState:
  /** Engine-owned relationship class. Written only by the ledger / explicit engine transitions. */
  role: CharacterRole;
```

**Writer discipline.** Only these may change `role`:

- forge time — the player is `user`; NPC templates may declare a starting role.
- a **deterministic engine transition** — e.g. the existing hostile-flag validation promotes to
  `enemy`; a party-recruit action (if plan 09 adds one) promotes to `party`.
- an **explicit player action in the UI** — recruit/dismiss a party member.

A model may **propose** a role in the registrar payload; the engine validates it against the
proposal rules above and may downgrade but never auto-promote to `party` or `user`.

### 3.2 Migration

Take the next free migration number (confirm the ladder head first; **17 is no longer reserved**
since Plan 19 is cancelled).

Backfill for existing saves:

```
is_player = 1                              -> "user"
flags.npc_hostile_to_player = true         -> "enemy"
soft_tier = 'primary' and not player       -> "ally"
everything else                            -> "neutral"
```

- [ ] **3.3** `soft.tier` stays as-is and keeps its current meaning (how deeply the analyzer tracks
      the character). Do **not** delete it and do **not** overload it. Two fields, two jobs.

### 3.4 Loadout permissions (finding 9)

Authorization must live where it cannot be bypassed — **core**, mirrored in both bridges.

```ts
// packages/core/src/engine/equipment.ts (or a new authz helper)
export function mayEditLoadout(actor: CharacterHardState): boolean {
  return actor.role === "user" || actor.role === "party";
}
```

- `equipItem` / `unequipSlot` throw a typed `LoadoutForbiddenError` for any other role.
- The UI hides/disables the "Equipment & loadout" affordance, but **the UI is not the gate** — a
  test must prove the bridge refuses even when called directly.
- [ ] **3.5** Both `bridge/core.ts` and `bridge/sqliteBridge.ts` must refuse identically. Add a
      parity test.

### 3.5 Three sections (finding 8)

Grouping is a pure projection over `role`:

```
User    <- role === "user"
Party   <- role === "party"
NPC     <- everything else
```

Order fixed: User, Party, NPC. Within NPC, sort by presence then name. The **type tag** shown on each
card is the `role` itself.

The rich User panel is a design deliverable (design brief item 1). Its data needs — three resources,
attributes, skills with progression, equipped items per slot — are all already available via
`getCharacterDossier` and `getCharacterInventory`; **no new bridge method should be needed.** Verify
that before designing, and if a new one is required, add it to both bridges.

## 4. Implementation steps

### Phase A — RED

- [ ] **4.1** `packages/core/test/types/hardState.test.ts` — `role` is required on new hard state;
      an unknown role fails Zod.
- [ ] **4.2** Migration test: a fixture with a player, a hostile-flagged NPC, a `primary`-tier NPC
      and a plain NPC backfills to `user` / `enemy` / `ally` / `neutral`.
- [ ] **4.3** `mayEditLoadout` truth table across all seven roles.
- [ ] **4.4** `equipItem` on a `neutral` character throws `LoadoutForbiddenError` — asserted against
      **both** bridges.
- [ ] **4.5** A model-proposed `role: "party"` in a registrar payload is **not** honoured; the actor
      lands as `neutral` or `ally` per the validation rules.
- [ ] **4.6** UI: Characters screen renders three sections in fixed order with correct membership;
      the loadout affordance is absent for a `neutral`.

### Phase B — implement

- [ ] **4.7** Add `CharacterRoleSchema` + the field; thread through `instantiatePlayer`,
      `instantiateFromTemplate`, `instantiateGeneric`.
- [ ] **4.8** Write the migration.
- [ ] **4.9** Add the authz helper and wire it into equipment entry points in core + both bridges.
- [ ] **4.10** Derive `enemy` from the existing hostile flag rather than duplicating state — the
      flag stays the source of truth for *how* hostility was validated; `role` is the projection.
      **Do not create two competing truths.**
- [ ] **4.11** Rebuild the Characters screen per the design deliverable.

### Phase C — verify

- [ ] **4.12** Typecheck + both suites green + bridge parity test.
- [ ] **4.13** Run the migration against a **copy** of the owner's save; report the resulting role
      distribution across all 11 stories.

## 5. Acceptance criteria

1. Every character has an engine-owned `role`; no model can promote to `user` or `party`.
2. Existing saves backfill sensibly and the owner's Cyraeth/Solo Leveling casts land in believable
   sections.
3. Loadouts are editable only for `user` and `party`, enforced in core and refused identically by
   both bridges when called directly.
4. The Characters screen shows User / Party / NPC in fixed order with per-character type tags.
5. `soft.tier` is unchanged and still means analyzer tracking depth.
6. Suite green; typecheck clean.

## 6. Risks

- **Two sources of truth for hostility.** The single biggest risk here. `role === "enemy"` and
  `flags.npc_hostile_to_player` must never disagree. Derive one from the other (4.10); do not let
  both be independently writable.
- **Migration on 11 live stories.** Test on a copy first (4.13).
- Depends on plan 08 for mana/stamina to exist before the rich panel can show them. Sequence
  accordingly, or ship the panel with health only and add bars in 08.
