# 04 · Implementation Contract — v5

Normative contracts the UI binds to. Field names are suggestions; the guarantees are the contract.
Supersedes v4 §J override and v4 §N1/§N2 studies (now LOCKED below).

## §Roles — activation matrix (normative)
```
statMode = none (No Stats):   { narrator: ACTIVE, classifier: OFF, resolver: OFF, analyzer: OFF,
                                summarizer: OFF, storyAI: OFF }
statMode = full (Full Stats): { narrator: ACTIVE, classifier: ACTIVE, resolver: ACTIVE,
                                analyzer: ACTIVE, summarizer: THRESHOLD, storyAI: FORGE/UPGRADE }
```
OFF = no request, no fallback, no retry, no cost. Global role configuration does NOT authorize a
role's use in a No Stats story. No Stats surfaces only Narrator/provider/network/cancel/persistence
errors; any mechanical-role error in active No Stats play is a contract violation.

## §Attributes (LOCKED — reference/attribute-integration.md is source of truth)
```
AttributeDef { id, name, abbrev, description, defaultScore }   // StorySchema.attributes: [] when none
ActionDef.governingAttribute?: string                          // on the ACTION, not the skill
CharacterHardState.attributes: Record<string,number>           // missing → read as 10 (+0)
EffectSpec.attributeDeltaSelf?/attributeDeltaTarget?           // ONLY the ledger writes attributes
Condition | { type:"attribute", attributeId, min }             // e.g. STR >= 14
scoreToMod(score) = floor((score - 10) / 2)                    // single source; clamp band 1..30
```
Roll: raw `d20 + attrMod`; skilled `d20 + attrMod + masteryMod`; flat `d20`; opposed both sides
symmetric. Attributes are static (no leveling by use); mastery still advances by use. No point-buy in
v1; dev/schema view edits scores post-freeze only. Classifier never sees attributes. Analyzer is
forbidden from mechanical fields incl. attributes (add attribute paths to its must-reject tests).

## §Catalog immutability (N1, LOCKED)
Sealed schema immutable in play. Runtime changes only state flags on **pre-existing IDs**; a
reveal/unlock references an existing definition ID. No model/controller creates/rewrites/deletes
definitions. Reveal state checkpointed, rewound, audited with its causing exchange. No sixth model
role. Versioned rulebook amendments = deferred future work (removed from implementation-ready).

## §Narrator authority (J, LOCKED global-only)
Single source of truth `roles.narrator = { provider, model }`. Story Settings is read-only + link.
`story.narratorOverride` does **not** exist in v5. At most one editable Narrator selector.

## §Switching & migration guarantees
Historical exchanges/outcomes immutable. Full→No Stats preserves the sealed rulebook + hard state and
deactivates the four roles; a boundary marker records the point. No Stats→Full Stats either forges a
new sealed rulebook (checkpoint first; future exchanges only) or resumes a paused one (no
regeneration). Legacy `light`: one-time migration to exactly one of the two final modes, with
pre-migration backup and rollback; no permanent third mode.

## Carried from v4 (contracts unchanged)
Forge phase events (attribute phases added; no fake %), active-story lifecycle, background-generation
(No Stats has only a `narrating` phase), error taxonomy (Full Stats), exchange indivisibility +
rewind/delete split.