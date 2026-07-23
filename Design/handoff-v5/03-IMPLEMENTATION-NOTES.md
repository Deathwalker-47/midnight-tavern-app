# 03 · Implementation Notes — v5 (separate pipelines)

Two distinct per-story pipelines, chosen by `statMode` (`none` = No Stats, `full` = Full Stats).
`light` exists only as a legacy value handled by migration — never a live mode.

## No Stats pipeline (statMode = none)
```
player message
  → assemble context (blueprint, persona, triggered lorebooks, recent transcript)  [local, no model]
  → Narrator (the only model call)
  → stream reply → persist exchange
```
No Classifier, resolver/ledger, Analyzer, Summarizer, or Story AI call — ever. No attributes, dice,
rulings, mastery, or mechanical inventory exist. Continuity is local assembly only; no automatic
analyzer-authored evolution or auto-summary. Any long-history compression must be an explicit,
visible action reusing the **global Narrator** (never a silent Summarizer call).

## Full Stats pipeline (statMode = full)
```
player message
  → Classifier (free text → catalog action; never sees attributes)
  → gate (skill/resource/item/flag + attribute prerequisites)
  → resolver: total = d20 + attrMod(governingAttribute) + masteryMod(skill)   [deterministic]
  → ledger (commit hard-state deltas incl. rare attributeDeltaSelf/Target, clamped 1–30)
  → Narrator (hard-state snapshot incl. attributes as read-only context)
  → Analyzer (soft state; forbidden from hard/mechanical fields incl. attributes)
  → Summarizer at thresholds
```
Story AI runs only at forge or an explicit No Stats→Full Stats upgrade. Models never write hard
state. One `scoreToMod` function is the sole score→modifier derivation (UI, ruling, resolver all
call it).

## Attribute engine touchpoints (reference/attribute-integration.md)
`attributes.ts` (scoreToMod + attrScore fallback 10) · `resolver.ts` (+attrMod term; opposed both
sides) · `gate.ts` (attribute Condition {min}) · `ledger.ts` (only writer of attributes) · Classifier
prompt unchanged · Bootstrapper generates attributes early in Phase A.

## Frozen catalog (N1)
Definitions immutable post-forge; runtime mutates only state (learned/locked/hidden/revealed/
available/mastery). Reveal/unlock references an existing sealed ID; checkpointed, audited,
rewindable with its causing exchange. No sixth "Controller" model role — controller = deterministic
engine logic.

## Migration of legacy `light`
First open → one-time two-destination decision → No Stats (pause, preserve historical sheet) or Full
Stats (keep skills/actions/resources, generate missing attribute layer + mappings, validate,
checkpoint, future exchanges only). Pre-migration backup; earlier turns never reinterpreted.