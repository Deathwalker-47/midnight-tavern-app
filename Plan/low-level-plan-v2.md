# Implementation Spec — Batch 2 (for Claude Code)

Addendum to `low-level-plan.md`. Same architecture, decisions (D1–D11), repo layout, and the hard/soft wall all still hold. This spec adds eight feature areas. Where a point touches the locked engine or the per-turn pipeline, the guardrail notes are **non-negotiable** — they exist to preserve the determinism USP. Build these after Milestone C (stories exist); points 1/5/8 can land alongside M3; point 6 depends on M6; points 2/3/4/7 depend on M7.

Role naming: the five model roles are **Narrator, Classifier, Analyzer, Summarizer, Story AI** (Story AI = the bootstrapper, D9). Use these labels everywhere user-facing.

---

## 1 & 5. Provider→model selection, per-role recommendations, and the role matrix

Points 1 and 5 are one system: an interactive **role matrix** where each of the five roles picks a provider, then a model (dropdown, recommendation-aware), then samplers (point 8).

### Data
Add a curated, bundled, updatable **model catalog** — `core/src/router/modelCatalog.ts` loading `modelCatalog.json`:

```ts
export interface CatalogModel {
  id: string;                 // provider model id, e.g. "google/gemini-2.5-flash"
  provider: ProviderId;
  label: string;              // display name
  recommendedFor: RoleId[];   // roles this model is a good fit for
  tier: "recommended" | "advanced";
  contextTokens: number;
  supportsJsonMode: boolean;
  samplerDefaults: Partial<Record<RoleId, SamplerProfile>>; // optional per-role tuning
  notes?: string;
}
```

Model lists change constantly, so **do not treat the bundle as the source of truth for availability**. Populate each provider's dropdown from, in order: (a) the provider's live model list when it exposes one (OpenRouter's `/models`, etc.), else (b) the bundled catalog, else (c) free-text entry. Then **layer curated metadata on by `id`**: recommendation badge, tier, sampler defaults. A model the user types that isn't in the catalog is allowed and marked `tier: "advanced"` with generic sampler defaults.

### Core
- `router/roles.ts` already holds `RoleAssignment { role, provider, model, samplers }`, persisted in `settings`. Extend with a `source: "recommended" | "manual"` flag so the UI can show whether the user overrode a recommendation.
- `router/recommend.ts`: `modelsForRole(role, provider): RankedModel[]` — returns the provider's models with catalog `recommendedFor.includes(role)` first (badged), then the rest, then a free-text affordance. `defaultAssignmentFor(role): RoleAssignment` — the app's shipped recommendation per role (used by the wizard and "reset to recommended").
- When a role's model is set to a `recommended` catalog entry, **auto-apply its sampler profile** (point 8) unless the user has manually edited samplers for that role (track a `samplersDirty` bit per role).

### Wiring
- The wizard's step 3 and Settings both render the same **RoleMatrix** editor; they call the same `roles.ts` API. No duplicate logic.
- `callStructured`/narrator streaming read the resolved assignment per role at call time — no change to their signatures.

### Guardrail
Classifier, Analyzer, and Story AI are structured-JSON roles. If a user assigns a model with `supportsJsonMode: false` to one of them, allow it but surface a non-blocking warning ("This model may return invalid structured output; recommended models are marked"). Never silently swap models.

---

## 2. Lorebooks: global library + attach/detach

Lorebooks become first-class, story-independent entities with a many-to-many link to stories. This replaces the per-story `lorebook` table from `low-level-plan.md §3`.

### DB (migration `002_lorebooks.sql`)
```sql
CREATE TABLE lorebooks(id TEXT PK, name TEXT, description TEXT, created_at INT, source TEXT);
  -- source: "user" | "imported_card" | "migrated"
CREATE TABLE lorebook_entries(
  id TEXT PK, lorebook_id TEXT, keys TEXT, content TEXT,
  enabled INT, always_on INT, priority INT, insertion_order INT);
CREATE TABLE story_lorebooks(story_id TEXT, lorebook_id TEXT, enabled INT,
  PRIMARY KEY(story_id, lorebook_id));
```
Migrate existing per-story entries: for each story that had lorebook rows, create one `lorebooks` row (`source="migrated"`, name = "<Story title> lore"), move its entries in, and insert a `story_lorebooks` link (`enabled=1`).

### Core (`memory/lorebook.ts`)
- CRUD: `createLorebook`, `renameLorebook`, `deleteLorebook` (blocked if attached — require detach first, or cascade with confirm surfaced by UI), entry CRUD.
- `attach(storyId, lorebookId)`, `detach(storyId, lorebookId)`, `setAttachedEnabled(storyId, lorebookId, enabled)`.
- `listLorebooks()` (global) and `listAttached(storyId)`.

### Pipeline change (context assembly, `low-level-plan.md §7.3` item 7)
The lorebook injection step now scans entries across **all lorebooks attached to the story AND enabled at both link and entry level**, plus `always_on` entries regardless of keyword match. Keyword match against the last 4 messages; order by `priority` then `insertion_order`; obey the ≤800-token budget. Nothing else in §7.3 changes.

### Card import tie-in (point relates to D8)
When importing a Chara Card with a `character_book`, create a lorebook (`source="imported_card"`, name = card name + " lore"), fill entries, and auto-attach it to the story created from that card.

---

## 3. Story builder — full editable field parity (SillyTavern-equivalent)

Expand the card creator/editor into a full **Story Blueprint** authoring surface with all standard fields. **Critical architectural point:** these fields feed identity, style, and premise into the pipeline — they do **not** author mechanics, and user-authored prompt text **never overrides the framework's mechanical-authority instructions**. Mechanics still come only from the Story AI at bootstrap (D2/D3/D8). This is what keeps the integrity USP intact even when a user writes their own system prompt.

### Fields and where each maps
Store on the card/blueprint record (JSON), and map at story-start / prompt-assembly time:

| Field (author-facing) | Internal destination | Effect |
|---|---|---|
| `name` | character identity | display + card |
| `description` / backstory | soft identity | context, dossier |
| `personality` | soft identity `traits` | context, dossier |
| `appearance` | soft identity | dossier, living card |
| `speechStyle` | soft identity | narrator style hint |
| `scenario` | premise seed + world soft overview | seeds bootstrap; sets opening world state |
| `firstMessage` + `alternateGreetings[]` | selectable opening scene | first narrator message; user picks among greetings at start |
| `exampleDialogue` (`mes_example`) | narrator few-shot style block | inserted into narrator prompt STYLE slot only |
| `systemPrompt` | `narratorStyleDirective` | inserted into the narrator prompt STYLE slot — **composed with, never replacing, the authority clause (§8.1)** |
| `postHistoryInstructions` | persistent narrator reminder | injected near the end of context (like ST PHI) — **also subordinate to the authority clause** |
| `creatorNotes`, `tags` | metadata | library display/filtering, not sent to models |
| `characterBook` | lorebook (point 2) | attached lorebook |

### Prompt-assembly guardrail (edit `orchestrator/context.ts` + narrator prompt builder)
The narrator system frame is built in this fixed order, and the authority clause is **framework-owned and last so it wins**:
```
[framework narrator instructions]
[user systemPrompt / narratorStyleDirective]      ← user text, style only
[story style settings: POV, tense, length]
[exampleDialogue few-shot]
… context body (rulings, state, memory, history) …
[user postHistoryInstructions]                     ← user reminder, style only
[FRAMEWORK AUTHORITY CLAUSE — verbatim §8.1]       ← always present, never editable, always last
[this turn's rulings, authoritative]
```
Add a test asserting the authority clause is present and positioned after any user-supplied prompt text, for every narrator call, regardless of blueprint contents.

### Note
Editing blueprint fields never mutates a frozen mechanical schema. Starting a story from a blueprint still runs bootstrap to generate mechanics. Blueprint edits after a story has begun affect only future narration style/identity, not the locked rulebook (consistent with M5.4).

---

## 4. Attach a persona to a story

Personas are already global (`personas` table). Add per-story selection.

### DB (migration `003_story_persona.sql`)
```sql
ALTER TABLE stories ADD COLUMN active_persona_id TEXT;   -- nullable
```
Null ⇒ fall back to the global default persona.

### Core
- `personas.setActiveForStory(storyId, personaId)`, `getActivePersona(storyId)` (returns story's persona or default).
- Story-creation flow accepts an optional persona pick; if omitted, default is used.

### Pipeline
Context assembly's persona slot (`§7.3` item 4) resolves via `getActivePersona(storyId)`. No other change.

---

## 6. Swipe (regenerate) and delete — with correct state rollback

This is the architecturally significant point. The engine commits rulings per turn (`§7` step 6). Swiping or deleting must correctly reverse **hard state** (ledger), **soft state** (analyzer patch), and any **summaries** that consumed the affected messages. Because soft state is model-derived it **cannot be replayed** — so we checkpoint pre-images rather than trying to recompute.

Define a **turn** = one player message + its narrator reply + that turn's rulings + that turn's analyzer patch.

### DB (migration `004_checkpoints.sql`)
```sql
CREATE TABLE turn_checkpoints(
  id TEXT PK, story_id TEXT, message_id TEXT,   -- the narrator msg that closes the turn
  turn_index INT,
  hard_pre_json TEXT,    -- ALL characters' hard state BEFORE this turn's commits
  soft_pre_json TEXT,    -- ALL characters' soft state BEFORE this turn's analyzer patch
  world_pre_json TEXT,   -- world soft BEFORE this turn
  created_at INT);
ALTER TABLE messages ADD COLUMN variants_json TEXT;   -- array of narrator prose variants
ALTER TABLE messages ADD COLUMN active_variant INT DEFAULT 0;
```
Write the checkpoint pre-images **at commit time** inside the same per-turn transaction (`§7` step 6). State is small; this is cheap.

### Swipe (regenerate the latest narrator message) — `orchestrator/swipe.ts`
**Rule (non-negotiable, USP-defining): a swipe regenerates the *telling*, not the *outcome*. Dice are never re-rolled. The ruling and all hard-state effects stay exactly as they were.**

Steps:
1. Restrict to the latest narrator message (v1). 
2. Restore soft + world pre-image from this turn's checkpoint (undo only the analyzer patch; **do not touch hard state or rulings**).
3. Re-run the narrator with the identical context and the identical rulings → new prose. Append it to `variants_json`; set `active_variant` to the new index.
4. Re-run the analyzer on the new prose → new `SoftStatePatch` → apply. (Soft state may legitimately differ because observations read prose; hard state cannot.)
5. Cycling ‹ › between existing variants just changes `active_variant` and re-applies that variant's stored analyzer patch pre-image/patch pair — regenerating a *new* variant is what re-runs the model.

Because hard state is untouched, mastery counts, HP, and inventory are identical across swipes — which is correct: the die already fell. Surface this in UI copy (see design doc point 6) so a failed attack staying failed across swipes reads as integrity, not a bug.

### Delete — `orchestrator/delete.ts`
Two operations:

**a) Delete last exchange (latest turn):**
1. Restore `hard_pre`, `soft_pre`, `world_pre` from this turn's checkpoint (full reversal, robust against clamping and rank thresholds — this is why we snapshot rather than invert deltas).
2. Delete the narrator + player messages, this turn's `rulings`, and this turn's `turn_checkpoints` row.
3. If the deleted messages fell inside an existing chapter/arc, delete those summaries (any chapter with `msg_to ≥` deleted index; any arc whose chapters changed) — the summarizer rebuilds at the next threshold.

**b) Rewind to here (any earlier message):**
Deleting a single mid-history turn is unsafe — later rulings assumed its state, and soft state can't be replayed. So mid-history editing is offered only as a rewind:
1. Restore the checkpoint captured **before** the target message.
2. Truncate: delete the target message and everything after it (messages, rulings, checkpoints).
3. Delete chapters/arcs built from any truncated messages.

### v1 scope / exclusions (add to `low-level-plan.md §11`)
- Swipe: latest narrator message only.
- Delete: "delete last exchange" (latest) and "rewind to here" (any point).
- **Not in v1:** surgical deletion of a single mid-history mechanical turn (no safe replay); editing a past player message to re-resolve (that's rewind + new turn). Deleting a mid-history *narration-only* turn (no ruling, no patch) may be allowed later; for v1 route it through rewind for safety.

### Tests (blocking for this feature)
- Swipe leaves hard state byte-identical; analyzer patch differs and is re-applied; variants array grows; no ruling re-rolled.
- Delete-last restores hard/soft/world exactly to the prior checkpoint (verify mastery rank-up reversal, HP clamp reversal, item-grant reversal, death reversal).
- Rewind restores the correct pre-image and truncates messages + summaries consistently.
- Transaction integrity: a failed narrator call mid-swipe leaves the prior variant and state intact.

---

## 7. Character dossier (deep detail view)

Expand `memory/cardView.ts` with `getCharacterDossier(storyId, characterId): Dossier` — the full read-only join of hard + soft, including **reverse relationships** (who points at this character).

### Assembly
```ts
export interface Dossier {
  identity: { name; whatTheyAre; appearance; tierPrimary; tierSecondary };
  mentality: { traits[]; behavioralSignatures[]; mood; outlook };         // soft
  currentState: { mood; location; goal };                                  // soft
  past: { backstory; observations: {turnIndex; text}[] };                  // soft (observation timeline)
  relationships: {                                                          // soft graph, BOTH directions
    outgoing: {toCharacterId; toName; trust; power; feeling}[];
    incoming: {fromCharacterId; fromName; trust; power; feeling}[];         // reverse-resolved
    toPlayer?: {trust; power; feeling};
  };
  sheet: {                                                                  // hard state (system register)
    resources: {id; label; current; max}[];
    skills: {skillId; name; rank; successCount; toNext}[];
    inventory: {itemId; name; qty; kind}[];
    alive: boolean;
  };
  involvedThreads: {title; note}[];                                         // world threads referencing them
}
```
- **Reverse relationships:** scan all characters' soft `relationships` for edges whose target is this character; assemble `incoming`. Cache per render.
- Read-only. Hard fields are never editable here (the wall). Soft identity is editable only through the card/blueprint editor (point 3), not this view.
- Reuse `MasteryPips`, `ResourceBar`, `RelationshipRow` components.

### Wiring
Reachable from the Characters roster (click a character) and from the Play party strip / living-card drawer ("Open full profile"). No pipeline impact — pure read model.

---

## 8. Sampler defaults, pre-configured per recommended model/role

Define the full sampler surface and ship sane per-role defaults that are auto-selected when a recommended model is chosen (ties to points 1/5).

### Sampler surface (`router/samplers.ts`)
```ts
export interface SamplerProfile {
  temperature: number;        // 0–2
  top_p: number;              // 0–1
  top_k?: number;             // 0 = off
  min_p?: number;             // 0 = off
  frequency_penalty?: number; // -2–2
  presence_penalty?: number;  // -2–2
  repetition_penalty?: number;// 1 = off (provider-dependent)
  max_tokens: number;
  stop?: string[];
  seed?: number;              // optional determinism
}
```
Router adapters translate/omit unsupported fields per provider (e.g. drop `repetition_penalty` where unsupported) and log what was dropped.

### Default profiles by role (the shipped recommendations)
Structured/deterministic roles run cold; narration runs warm:
```
Classifier : temp 0.0, top_p 1.0, max_tokens 500,  json mode on   // determinism matters most here
Analyzer   : temp 0.2, top_p 1.0, max_tokens 800,  json mode on
Story AI   : temp 0.4, top_p 0.95, max_tokens 3000, json mode on
Summarizer : temp 0.5, top_p 0.95, max_tokens 1200
Narrator   : temp 0.8, top_p 0.95, presence 0.3, frequency 0.3, max_tokens per length setting
```
Expose these as named presets in the UI — **Precise** (classifier/analyzer/story-ai), **Balanced** (summarizer), **Creative** (narrator) — plus per-field manual control.

### Behavior
- On assigning a `recommended` catalog model to a role: apply that model's per-role `samplerDefaults` if present, else the role's default profile above. Do this **only if the user hasn't manually edited that role's samplers** (`samplersDirty` bit from point 1). 
- "Reset to recommended" per role re-applies defaults and clears `samplersDirty`.
- Wizard step 3 lands every role on its recommended model **and** its recommended sampler profile with zero user effort; Settings exposes the full surface for power users.

### Guardrail
Never let a creative sampler profile bleed onto a structured role via a global control. Samplers are always per-role. A global "creativity" slider, if ever added, must map only to the narrator.

---

## Migration summary (run in order at startup)
`002_lorebooks.sql` (global lorebooks + m2m + migrate existing) · `003_story_persona.sql` · `004_checkpoints.sql` (+ message variant columns). Point 1/5/8 are settings-shape changes (role assignments gain `source`/`samplersDirty`; add `modelCatalog.json` asset) — no destructive migration.

## Test additions (all blocking)
Authority-clause-always-last (point 3) · swipe-never-rerolls + delete/rewind exact reversal (point 6) · lorebook cross-attach injection budget (point 2) · dossier reverse-relationship resolution (point 7) · recommended-model applies sampler profile unless dirty (points 1/8).
