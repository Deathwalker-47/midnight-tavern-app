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

## Invariants

1. A story has exactly one executable action catalogue; characters never own model-authored actions.
2. Models may propose identity, sealed ids, intent, and prose. They never author or mutate executable
   effects, gates, ranks, attributes, resources, equipment, damage, death, budgets, or persistence.
3. Template mechanics win over runtime proposals. Existing-character presence transitions cannot
   rewrite hard-state capability.
4. Unknown, duplicate, or excessive capability proposals cannot create unknown mechanics.
5. Only present living registry actors participate in mechanics, and every mechanical action is
   resolved by the engine before narration may describe its outcome.
