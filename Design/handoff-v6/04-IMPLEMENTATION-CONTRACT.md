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

---

# v6 contracts (supersede v5 attribute contract)

## §Attributes (1–10)
```
AttributeDef { id, name, abbrev, description, min:1, max:10, defaultScore, locked?:boolean, lockReason?:string }
scoreToModifier(score) = score - 5        // single source; score 1..10 → mod -4..+5
// locked attribute: locked:true, no roll, no modifier; NOT a 0-score
```
Raw `d20 + attrMod`; skilled `d20 + attrMod + masteryMod`; opposed symmetric. Count soft 3–6; >6 only
if card/setting defines. Card-defined scores are preserved verbatim (see §MechanicSource).

## §XP / mastery
```
SkillState { id, rank:'novice'|'adept'|'expert'|'master', xpInRank:number }
xpThreshold(rank) = { novice:100, adept:250, expert:625 }[rank]   // ×2.5; master = none
ActionDef.xpProfile { base:number, dcScaling:number, noveltyBonus?:number }
// engine award: base × outcomeMult × dcScale × diminishing(sceneRepeat)
//   outcomeMult: success 1.0, crit-success 1.5, failure 0.25, crit-failure 0.1, denied 0
//   diminishing: same action vs <=DC in-scene → 1.0,0.5,0.25,0 by repeat #
```
Only the engine writes XP/rank. Classifier tags, never writes. Narrator/Analyzer never write XP.
Rewind/delete rolls XP+rank back with the exchange. Regen wipes XP under the old rulebook.

## §MechanicSource provenance
```
MechanicSource = 'card' | 'persona' | 'blueprint' | 'cue' | 'generated'   // precedence in this order
DetectedStat { attrId, name, abbrev, score|locked, source:MechanicSource, appliesTo:'world'|'player' }
```
Card defines the world/character system; persona sets player scores/skills but may NOT rename/replace
an explicit card attribute catalog. Every explicit constraint carries its source.

## §Macros
Expansion at prompt/display assembly; card text never rewritten.
```
MacroContext { user, char, persona, group[], groupNotMuted[], cardFields{...}, history{ lastMessage, lastUserMessage, lastCharMessage, lastMessageId, swipeId } }
MacroReport { supported:[{name,resolved}], unknown:[{name,rawText,field,required:boolean}] }
```
Supported set per `01-UX-SPEC §Macros`. Unknown → preserved + reported; block creation only when
`required`. Each macro spec records: value, context, eval-time, deterministic?, absent-context
behavior, allowed surfaces (card fields / blueprint / lorebook / examples / opening / display).

## §Scene entities
```
SceneEntity { id, aliases:string[], mentionedAtExchange, kind:'provisional'|'instantiated', templateId?, hardStateId? }
```
Derived from narrated mentions + card/lore identities; provisional entities get stable app IDs;
included in the classification roster; hard state instantiated lazily from NPC template/generic
defaults; identity reconciled later without changing historical IDs; rewind before first mention
removes it. No Analyzer/Narrator writes it.

## §Universal actions (sealed foundation, every Full Stats story)
`attack/harm · defend/avoid · move/overcome-obstacle · observe/investigate · influence/deceive ·
use-item · assist · recover/rest` (8 families; a story action specializes exactly one). Each defines category, governing-attribute rule,
skill-optional/required, item/target reqs, default DC/opposed behavior, denial behavior, XP
eligibility, prompt representation, and how a story action (`knife_lunge`) specializes/aliases it.
Free text stays the interface; story actions specialize rather than replace.

## §Forge progress events
```
ForgeEvent { phaseId, fragmentId?, completedUnits, totalUnits, attempt, maxAttempts,
             requestStartedAt, lastProgressAt, recoverable:boolean, retainedArtifacts:string[] }
```
UI renders discrete steps + substep + attempt from this; no synthesized %. Completed phases retained
across later failure; only the invalid fragment repairs (cap 2); provider timeout + cancellation are
distinct outcomes.

## §Rulebook versions / regeneration
```
RulebookVersion { versionId, createdAt, sealed:true }
RegenTxn { fromVersion, toVersion, wipe:[...], preserve:[...], archiveRulings:true, snapshotId, atomic:true }
```
Wipe: sealed schema, hard-state mechanics, rulings, checkpoints, XP/ranks, mechanical NPC sheets,
inventory/resources/flags. Preserve: title/ID, imported card + source, persona, blueprint, lorebooks,
prose transcript, message variants, non-mechanical attachments. Old rulebook usable until new one
validates; atomic install or rollback; retained snapshot for a limited period.

## §Primary provider
```
primaryProviderId?: ProviderId    // persisted UX default; NOT a routing override
```
Exactly one when a valid provider exists; none otherwise. Supplies: initial provider in model
browsing, suggested provider for new/unassigned roles, fallback candidate for an invalid binding.
Never: rewrites valid role bindings, routes every role through itself, merges inventories, or changes
on save/validate of another provider. Model IDs always travel with their provider ID; inventories
stay per-provider. Migration for installs without a stored primary: derive from valid role usage or
first valid provider, mark migration-chosen, let the user confirm — never infer "most recently saved".
7 acceptance scenarios in `02-STATES-AND-FLOWS §Primary`.