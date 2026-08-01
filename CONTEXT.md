# Midnight Tavern Domain Context

This glossary records product terms that must mean the same thing in core, UI, tests, and handoffs.
It complements `ARCHITECTURE.md`; it does not replace the detailed implementation plans.

## Ubiquitous language

- **Universal action family:** A versioned, engine-owned semantic family such as `attack_natural` or
  `search`. It guides forge specialization and deterministic defaults; it is not itself a runtime
  character command.
- **Story action:** One frozen executable `ActionDef` in a story rulebook. It owns gates, DC, costs,
  effects, and outcome hints. All player and NPC mechanical intents reference this catalogue.
- **Capability loadout:** A character's hard-state skills, attributes, resources, and equipment. It
  determines which story actions can pass the engine gate; it is not a second action catalogue.
- **NPC template:** A forge-authored hard-state seed for a known key actor. A runtime proposal may
  select the exact template but cannot override its mechanics.
- **Emergent NPC:** A grounded consequential actor introduced during play without an exact template.
  The registrar may select a bounded list of existing sealed skill ids; the engine validates and
  grants them at novice rank.
- **Natural attack:** The engine-owned gate-legal baseline combat action available when a full-stat
  story has no equivalent ungated natural-family action. It still uses normal dice, rulings, effects,
  budgets, persistence, and death thresholds.
- **Registry membership:** Persistent identity in a story's character registry.
- **Scene presence:** Whether a registered living character is currently eligible to act or be
  targeted. Registry membership does not imply presence.
- **Scene observation:** An evidence-backed claim about an individual actor in one accepted message
  variant: introduction, mention, identity reveal, entry, exit, or incapacitation. It carries a
  message/variant reference and exact evidence span; a model proposal without evidence is not an
  observation.
- **Scene State:** The engine-owned active view of registry identities, aliases, presence,
  disposition/goals, current trigger events, and scene affordances for one narrative timeline.
  Prose is evidence supplied to this model, not an alternative scene database.
- **Narrative Beat Plan:** A bounded storyteller proposal for approved actors, ordinary dialogue and
  action beats, presence changes, identity reveals, and affordances before prose is generated. The
  engine reconciles it into a Narrative Contract; it is never mechanical authority.
- **NPC trigger event:** A stable current-scene event that may justify an NPC mechanical response,
  such as an explicit hostile attempt or committed harm. It is consumed by an accepted response so
  prior prose cannot be replayed as a fresh action.
- **Scene affordance:** A typed meaningful opportunity tied to an actor, interactable, hazard, exit,
  open question, or goal. Possible Moves compose from affordances rather than arbitrary nearby
  words.
- **Narrative coverage:** The causal depiction of one current authoritative ruling in prose. A
  current ruling must be covered exactly once; a generic mechanical recap or mention of an old
  ruling does not count.

## Invariants

1. A story has exactly one executable action catalogue; characters never own model-authored actions.
2. Models may propose identity, sealed ids, intent, and prose. They never author or mutate executable
   effects, gates, ranks, attributes, resources, equipment, damage, death, budgets, or persistence.
3. Template mechanics win over runtime proposals. Existing-character presence transitions cannot
   rewrite hard-state capability.
4. Unknown, duplicate, or excessive capability proposals cannot create unknown mechanics.
5. Only present living registry actors participate in mechanics, and every mechanical action is
   resolved by the engine before narration may describe its outcome.

## Task 15G target invariants

The current runtime does not yet satisfy the following invariants. They are the accepted target for
`docs/superpowers/plans/2026-08-02-npc-scene-system-redesign.md` and must not be claimed as landed
until the plan's tests are green.

6. Every individual actor in committed narration resolves to one registry identity in the same
   active timeline. Background collectives and scenery are explicitly non-character observations.
7. Identity, aliases, presence, rulings, narration, trigger consumption, and active-variant Scene
   State commit and roll back as one operation.
8. `opposed` describes how a roll is resolved; it does not imply hostility. NPC retaliation requires
   an explicit hostile current event or a validated persisted agenda.
9. Recent prose may inform style and context but cannot itself authorize a new NPC mechanical
   action. Every reactive intent references one unconsumed trigger event.
10. Ruling artifacts own mechanical detail and render before prose. Provider fallback status remains
    separate UI metadata and never becomes an appended story paragraph.
