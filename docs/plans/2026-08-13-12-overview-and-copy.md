# Plan 12 — Overview redesign and slot documentation

**Created:** 2026-08-13
**Covers owner findings:** 26 (Overview is "all over the place"; separate arc and chapter sections),
27 (the universal slots/tier panel explains tiers but never explains slots)
**Size:** M
**Depends on:** nothing. The Story Settings catalogue browser moved to plan 09 §6, where the content
it browses is defined.
**Status:** Planned. Not authorized.

---

## 1. Finding 26 — Overview redesign

### Current state

`packages/ui/src/screens/Overview.tsx`. Per the 2026-07-31 WORKLOG entry (Task 15A.7), the current
behaviour is:

- the latest persisted **chapter** is the primary reading document until an arc exists;
- once an arc exists, the **arc** is primary by default;
- selecting a summarized timeline chapter opens that historical chapter document, with a
  "Back to current arc" affordance;
- the immutable premise is a small separately-labelled "Original story premise" block;
- two columns, stacking below 760px.

So the pieces the owner wants **already exist** — arc, chapters, premise. The complaint is that they
are presented as one shifting primary document with a timeline, rather than as distinct sections.
That is a **layout and information-hierarchy problem, not a data problem.**

- [ ] **1.1** Confirm the above against current source before designing. The WORKLOG entry is from
      2026-07-31 and later work may have changed it.

### The owner's ask, restated

> "Show arc details (more condensed info) and chapter details (more detailed info on what all
> happened) there. On separate sections. I hope we have concept of arc."

Yes — `ArcRecord` and `ChapterRecord` both exist, with `listArcs` / `listChapters` on both bridges,
and `summarizer/arc.ts` produces a structured multi-section arc document.

### Design direction

Three stacked sections, always present, no mode-switching:

1. **Premise** — immutable, compact, clearly marked as the story's fixed origin.
2. **Arc** — the condensed synthesis. If several arcs exist, the latest is expanded and earlier ones
   collapse.
3. **Chapters** — the detailed record, newest first, each expandable.

The current design's "primary document switches depending on what exists" is the thing that reads as
"all over the place". Replacing it with three fixed sections is the whole fix.

- [ ] **1.2** Empty states matter here and are currently a source of confusion: a new story has a
      premise, no chapters, no arc. Each section needs an honest empty state ("The summarizer writes
      a chapter every N turns") rather than vanishing, so the player learns the structure.
- [ ] **1.3** Preserve the existing accessibility work — timeline entries support Enter/Space and
      expose selected state. Do not regress it.
- [ ] **1.4** Preserve the 760px stacking behaviour.
- [ ] **1.5** Design deliverable — see the design brief.

### Steps

- [ ] **1.6** RED: a story with premise only renders three sections, two with empty states.
- [ ] **1.7** RED: a story with chapters but no arc renders the chapters section populated and the
      arc section empty — **not** a chapter promoted into the arc slot.
- [ ] **1.8** RED: a story with an arc renders both, arc condensed and chapters detailed.
- [ ] **1.9** RED: keyboard navigation and selected-state semantics survive.
- [ ] **1.10** Implement. UI-only; no bridge or core change expected. If one is needed, add it to
      both bridges with a parity test.

## 2. Finding 27 — explain the slots

### Current state

The panel renders (from the owner's screenshot):

```
§ EQUIPMENT   Universal slots and tier policy          7 slots · config v1
Items are not pregenerated with the rulebook. The DM Ruling creates deserved rewards on demand,
and only equipped items grant their active effects.
SLOTS · primary · secondary · head · body · utility · accessory 1 · accessory 2
[Common / Uncommon / Rare / Legendary / Mythical cards, each explaining effects and bonuses]
```

The slot names are listed as a bare inline run; the tiers get a card each with real explanation. The
asymmetry is the complaint.

Source of truth: `packages/core/src/config/equipment-loot.json` —

```json
"slots": ["primary", "secondary", "head", "body", "utility", "accessory_1", "accessory_2"]
```

The config carries **only the names**. There is no description field, which is why the UI can only
list them.

### Design

- [ ] **2.1** Add a `slotDescriptions` map to `equipment-loot.json` and bump its `version` to 2.
      **Check first** whether `mechanicsConfigVersions.equipmentLoot` being snapshotted into frozen
      rulebooks means a version bump changes behaviour for existing stories — if it does, add the
      descriptions **without** bumping the version, since documentation is not a mechanics change.
      This is exactly the kind of detail that silently breaks old saves; verify it.
- [ ] **2.2** Write the copy. Proposed:

| Slot | Copy |
| --- | --- |
| primary | Your main weapon or focus — the item most attacks and skills use. |
| secondary | An off-hand item: a shield, a second weapon, or a casting focus. |
| head | Helmets, hoods, circlets — usually defensive or perceptive. |
| body | Armour and robes. Your main protection. |
| utility | A tool you keep to hand: rope, lockpicks, a lantern, a medkit. |
| accessory 1 | A ring, amulet, or charm. Usually a passive bonus. |
| accessory 2 | A second accessory slot. |

- [ ] **2.3** Render slots as cards matching the tier cards, so both halves of the panel have the
      same visual weight. Small design deliverable.
- [ ] **2.4** State the rule the owner will ask about next: **only equipped items grant effects** —
      it is already in the panel's intro line; make sure it survives the redesign.

## 3. Acceptance criteria

1. Overview shows Premise, Arc, and Chapters as three fixed sections with honest empty states, and
   never promotes a chapter into the arc slot.
2. Keyboard navigation, selected state, and the 760px stacking all survive.
3. Every equipment slot has a one-line explanation rendered with the same weight as the tier cards.
4. Adding slot descriptions does not alter mechanics for existing frozen rulebooks.
5. Suite green; typecheck clean.

## 4. Risks

- **Low risk overall** — this is the safest plan in the set and a good candidate for a first
  implementation pass to re-establish rhythm.
- The one real trap is §2.1: bumping a config version that frozen rulebooks snapshot. Verify before
  bumping.
