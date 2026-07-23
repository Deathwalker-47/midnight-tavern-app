# Low-Level Implementation Plan — v1

This document is the step-by-step engineering plan for building v1 of the application described in the High-Level Plan. It locks all design decisions, defines the full data model and database schema, specifies every core module with its contracts and build order, details the per-turn pipeline, and sets milestones with acceptance criteria. It is written to be executed top-to-bottom.

---

## 0. Locked design decisions

| # | Decision | Resolution |
|---|----------|-----------|
| D1 | Skill model | **Binary unlock + mastery rank.** A skill is either learned or not (the gate). A learned skill carries a mastery rank: `novice(+1) → adept(+3) → expert(+5) → master(+7)`. Mastery supplies the d20 modifier and can gate advanced uses. |
| D2 | Difficulty values | **Pre-assigned at bootstrap.** Every action in the schema carries its DC(s). No model assigns difficulty at runtime. |
| D3 | Action coverage | **Maximal, all predefined.** The frozen schema contains an **Action Catalog** covering combat, social, exploration, crafting, and utility actions. Anything not in the catalog resolves as pure narration (no roll, no state change). |
| D4 | Input classification | **A classifier model call runs on every player message**, no exceptions. It maps free text onto zero or more catalog actions (or `narration_only`). |
| D5 | Analyzer contract | **JSON patch-ops.** The analyzer emits typed operations (`set`, `append`, `adjust_relationship`, `observe`) that the core merges into soft state. It never emits mechanical fields. |
| D6 | Context budget | **8,192-token default target** for assembled context (excluding the model's own max), user-configurable. Fixed priority order with drop-from-the-bottom overflow handling (§7.3). |
| D7 | NPC mechanics | **The engine rolls for everyone.** NPCs with sheets are full mechanical actors; the classifier also extracts NPC actions the narrator proposes. |
| D8 | Card import | **Chara Card V2 and V3**: PNG with embedded JSON (`tEXt`/`chara`) and raw `.json`; plus import-by-URL (fetch, then same parsers). Imported cards map to identity/soft fields; mechanical fields come from the bootstrapper. |
| D9 | Model roles | Five roles, each independently assignable to any configured provider/model, each with a recommended default: **Narrator** (prose), **Classifier** (cheap/fast), **Analyzer** (cheap/fast), **Summarizer** (mid), **Bootstrapper** (mid/strong). |
| D10 | Stack | TypeScript everywhere. Desktop shell: **Tauri** (smaller footprint; Electron fallback acceptable). UI: React. State: Zustand (UI) reading core stores. DB: SQLite via better-sqlite3 (Tauri sidecar) or tauri-plugin-sql. Validation: **Zod** for every model-facing boundary. |
| D11 | Licensing | Third-party merchant-of-record (Lemon Squeezy or Paddle) license keys; offline-tolerant validation ping; 14-day trial gated by license state. |

---

## 1. Repository layout

```
app/
├─ package.json                 # workspace root
├─ packages/
│  ├─ core/                    # ALL non-UI logic. No React imports. No DOM.
│  │  ├─ src/
│  │  │  ├─ types/             # schema.ts, hardState.ts, softState.ts, actions.ts, events.ts
│  │  │  ├─ store/             # db.ts, migrations/, repositories/
│  │  │  ├─ engine/            # gate.ts, resolver.ts, dice.ts, ledger.ts
│  │  │  ├─ classifier/        # classify.ts, prompt.ts
│  │  │  ├─ router/            # providers/, router.ts, roles.ts, structured.ts
│  │  │  ├─ bootstrap/         # generate.ts, validate.ts, repair.ts, freeze.ts
│  │  │  ├─ memory/            # analyzer.ts, softStore.ts, cardView.ts
│  │  │  ├─ summarizer/        # chapter.ts, arc.ts, injector.ts
│  │  │  ├─ importer/          # pngCard.ts, jsonCard.ts, urlImport.ts, mapToSchema.ts
│  │  │  ├─ orchestrator/      # turn.ts, context.ts
│  │  │  └─ licensing/         # license.ts, trial.ts
│  │  └─ test/                 # vitest; engine tests are the crown jewels
│  ├─ ui/                      # React app (desktop shell mounts this)
│  │  └─ src/
│  │     ├─ screens/           # Wizard, Library, Play, Overview, CardEditor, Persona, Lorebook, Settings
│  │     ├─ components/        # LivingCard, DiceToast, ChapterList, ArcDoc, ProviderForm
│  │     └─ state/             # zustand stores bridging to core
│  └─ shell/                   # Tauri project (windows, menus, fs, packaging)
```

Rules: `core` never imports from `ui`. `ui` calls `core` through a single façade (`core/src/index.ts`) exporting typed functions. All LLM I/O passes Zod validation at the boundary.

---

## 2. Data model (complete v1 types)

These supersede and extend any earlier draft. All live in `core/src/types/`.

### 2.1 Frozen Story Schema

```ts
export type StatMode = "none" | "light" | "full";
export type MasteryRank = "novice" | "adept" | "expert" | "master";
export const MASTERY_MOD: Record<MasteryRank, number> =
  { novice: 1, adept: 3, expert: 5, master: 7 };

export interface StorySchema {
  schemaVersion: 1;
  storyId: string;
  title: string;
  premise: string;                    // the user's input, preserved
  statMode: StatMode;
  resources: ResourceDef[];           // [] when statMode === "none"
  skills: SkillDef[];
  items: ItemDef[];
  tiers: TierDef[];
  actions: ActionDef[];               // THE ACTION CATALOG (D3)
  startingState: StartingState;
  npcTemplates: NpcTemplate[];        // sheets the engine instantiates for key NPCs
  locked: boolean;                    // set true at freeze; gate refuses unlocked schemas
}

export interface ResourceDef {
  id: string; label: string; start: number; max: number;
  playerVisible: boolean;
  regenPerScene?: number;             // optional passive recovery
}

export interface SkillDef {
  id: string; name: string; description: string; tier: string;
  prerequisites: Condition[];
  unlockPaths: UnlockPath[];
  masteryAdvance: MasteryAdvanceRule; // how ranks increase
  advancedUses?: { minRank: MasteryRank; description: string }[];
}

export interface MasteryAdvanceRule {
  // deterministic: rank up after N successful gated uses of the skill
  successesPerRank: number;           // e.g. 5 → novice→adept after 5 successes
}

export interface ItemDef {
  id: string; name: string; description: string;
  kind: "weapon" | "armor" | "consumable" | "tool" | "key" | "misc";
  tier: string;
  requiresSkill?: string;
  props: Record<string, number>;      // e.g. { damage: 6, defense: 2, heal: 10 }
}

export interface TierDef { id: string; label: string; minProgress: number; }

export interface StartingState {
  resources: Record<string, number>;
  skills: { skillId: string; rank: MasteryRank }[];
  inventory: { itemId: string; qty: number }[];
}

export interface NpcTemplate {
  templateId: string; name: string;
  resources: Record<string, number>;  // e.g. { hp: 40 }
  skills: { skillId: string; rank: MasteryRank }[];
  inventory: { itemId: string; qty: number }[];
}

export type Condition =
  | { type: "skill"; skillId: string; minRank?: MasteryRank }
  | { type: "resource"; resourceId: string; min: number }
  | { type: "item"; itemId: string }
  | { type: "flag"; flagId: string; value: boolean };

export type UnlockPath =
  | { method: "trainer"; npcHint: string; cost: CostSpec }
  | { method: "manual"; itemId: string }
  | { method: "trial"; flagId: string };

export interface CostSpec {
  resources?: Record<string, number>;
  items?: { itemId: string; qty: number }[];
}
```

### 2.2 Action Catalog (D2 + D3 — the heart of the gate)

```ts
export type ActionCategory = "combat" | "social" | "exploration" | "crafting" | "utility";
export type Outcome = "crit_success" | "success" | "failure" | "crit_failure";

export interface ActionDef {
  id: string;                          // "attack_melee", "persuade", "pick_lock", "craft_item", ...
  category: ActionCategory;
  label: string;
  requiresSkill?: string;              // gate: must be learned
  minRank?: MasteryRank;               // gate: advanced-use threshold
  requiresItemKind?: ItemDef["kind"];  // e.g. attack_melee needs a weapon
  dc: number;                          // D2: pre-assigned difficulty (5–25 scale)
  opposed?: boolean;                   // if true, contest vs target's roll instead of flat DC
  costs?: CostSpec;                    // paid on ATTEMPT (win or lose)
  effects: Record<Outcome, EffectSpec>;// deterministic outcome table
}

export type EffectSpec = {
  resourceDeltaSelf?: Record<string, number>;      // applied to actor
  resourceDeltaTarget?: Record<string, number>;    // applied to target; weapon props can scale it
  scaleByItemProp?: string;                        // e.g. "damage" — multiply/add item prop
  grantItem?: { itemId: string; qty: number };
  setFlag?: { flagId: string; value: boolean };
  narrationHint: string;                           // guidance for the narrator, not truth
};
```

Bootstrapper requirements for the catalog: **minimum 20 actions**, at least 3 per category; every skill in the schema must be exercised by at least one action; DCs on a 5 (trivial) – 25 (near-impossible) scale.

### 2.3 Hard state (sole writer: engine)

```ts
export interface CharacterHardState {
  characterId: string;
  isPlayer: boolean;
  templateId?: string;                 // for NPCs instantiated from NpcTemplate
  resources: Record<string, { current: number; max: number }>;
  skills: { skillId: string; rank: MasteryRank; successCount: number }[];
  inventory: { itemId: string; qty: number }[];
  flags: Record<string, boolean>;
  alive: boolean;
}
```

### 2.4 Soft state (sole writer: analyzer) & world

Unchanged in shape from the high-level plan: `CharacterSoftState` (identity, behavioral signatures, currentState {mood, location, goal}, relationships, observations, tier primary/secondary) and `WorldSoftState` (overview, locations, arcs, unresolvedThreads). **No mechanical fields.** Add:

```ts
export interface SoftStatePatch {                 // D5 — analyzer output contract
  characterOps: {
    characterId: string;                          // analyzer may propose NEW secondary characters
    ops: (
      | { op: "set"; path: "mood" | "location" | "goal" | "appearance" | "speechStyle"; value: string }
      | { op: "append"; path: "traits" | "likes" | "dislikes"; value: string }
      | { op: "observe"; text: string }
      | { op: "adjust_relationship"; toCharacterId: string; trustDelta: number; powerDelta: number; feeling?: string }
    )[];
  }[];
  worldOps: (
    | { op: "set_overview_hint"; text: string }
    | { op: "add_location"; name: string; description: string }
    | { op: "add_thread"; title: string; note: string }
    | { op: "resolve_thread"; title: string }
  )[];
}
```

### 2.5 Classifier output (D4)

```ts
export interface ClassifiedTurn {
  playerIntents: MechanicalIntent[];   // [] ⇒ narration_only
  npcIntents: MechanicalIntent[];      // actions the fiction implies NPCs take (D7)
  freeText: string;                    // residual narration content
}
export interface MechanicalIntent {
  actorId: string;
  actionId: string;                    // MUST be from the Action Catalog (Zod enum built per-story)
  targetId?: string;
  itemId?: string;                     // item used, if relevant
  confidence: number;                  // 0–1; below 0.6 ⇒ treat as narration, note ambiguity
}
```

### 2.6 Resolution record (engine output, persisted per turn)

```ts
export interface Ruling {
  turnId: string; actorId: string; actionId: string; targetId?: string;
  gate: { allowed: boolean; reason?: string };     // gate verdict BEFORE any roll
  roll?: { d20: number; modifier: number; total: number; dc: number; outcome: Outcome };
  effectsApplied: EffectSpec | null;               // exactly what the ledger committed
  costsPaid?: CostSpec;
}
```

---

## 3. Database schema (SQLite)

One DB file per install; stories are rows, not files. All JSON columns hold Zod-validated payloads.

```sql
CREATE TABLE stories(id TEXT PK, title TEXT, created_at INT, schema_json TEXT, locked INT);
CREATE TABLE characters(id TEXT PK, story_id TEXT, name TEXT, is_player INT,
                        hard_json TEXT, soft_json TEXT, soft_tier TEXT);
CREATE TABLE messages(id TEXT PK, story_id TEXT, idx INT, role TEXT, content TEXT,
                      created_at INT);
CREATE TABLE rulings(id TEXT PK, story_id TEXT, message_id TEXT, ruling_json TEXT);
CREATE TABLE chapters(id TEXT PK, story_id TEXT, idx INT, msg_from INT, msg_to INT,
                      title TEXT, summary TEXT);
CREATE TABLE arcs(id TEXT PK, story_id TEXT, idx INT, chapter_from INT, chapter_to INT,
                  title TEXT, doc_json TEXT);        -- structured arc extraction
CREATE TABLE world_soft(story_id TEXT PK, soft_json TEXT);
CREATE TABLE lorebook(id TEXT PK, story_id TEXT, keys TEXT, content TEXT, enabled INT);
CREATE TABLE personas(id TEXT PK, name TEXT, description TEXT, is_default INT);
CREATE TABLE settings(key TEXT PK, value TEXT);      -- providers, role→model map, budgets, license
```

Repositories in `core/src/store/repositories/` expose typed CRUD; no raw SQL outside that folder. Migrations are numbered files run at startup.

---

## 4. Build order — modules, contracts, and steps

Build strictly in this order; each milestone has acceptance criteria (§9).

### M1 — Types, DB, repositories (foundation)
1. Implement every type in §2 with matching Zod schemas (`types/*.ts` exports both).
2. Implement `db.ts` (open/migrate), migrations `001_init.sql`, repositories for every table.
3. Façade `core/index.ts` exporting the public API surface as it grows.

### M2 — Mechanics engine (the moat; build before any LLM code)
Files: `engine/dice.ts`, `engine/gate.ts`, `engine/resolver.ts`, `engine/ledger.ts`.

1. **dice.ts** — `rollD20(rng?): number`. Injectable RNG for tests; default `crypto.getRandomValues`.
2. **gate.ts** — `checkGate(schema, actor: CharacterHardState, intent: MechanicalIntent): GateVerdict`.
   Checks, in order: action exists in catalog → actor alive → `requiresSkill` learned → `minRank` met → `requiresItemKind` present in inventory → `costs` affordable → all `Condition` prerequisites hold. Returns `{allowed:false, reason}` on the first failure. **Pure function. No I/O.**
3. **resolver.ts** — `resolve(schema, actor, target|undefined, intent, rng): Ruling`.
   - If gate fails → Ruling with `gate.allowed=false`, no roll, no effects.
   - Pay `costs` (attempt cost) via ledger ops staged in the ruling.
   - Compute modifier: `MASTERY_MOD[rank]` of the required skill (0 if action has no skill).
   - `total = d20 + modifier`. Outcome: natural 20 ⇒ `crit_success`; natural 1 ⇒ `crit_failure`; else `total >= dc ? success : failure`. If `opposed`, target rolls too (its own relevant skill modifier); higher total wins, ties defend.
   - Look up `effects[outcome]`; scale `resourceDeltaTarget` by `scaleByItemProp` if the intent used an item.
   - On `success | crit_success` of a skill-gated action: increment `successCount`; if it reaches `masteryAdvance.successesPerRank`, advance rank and reset count.
4. **ledger.ts** — `commit(ruling): void`. The **only** code path that mutates `CharacterHardState`. Applies deltas with clamping (0..max), inventory add/remove, flags, death (`alive=false` when a designated resource hits 0 — the schema marks one resource `lethal:true`; add that field to ResourceDef).
5. **Unlock handling** — `tryUnlock(schema, actor, skillId, viaPath): UnlockResult` validates the path (trainer flag/manual item/trial flag) + prerequisites + costs, then commits via ledger. Called by the orchestrator when the classifier emits the special catalog action `learn_skill`.
6. **Tests (blocking):** table-driven vitest suites — every gate branch; crit rules; opposed contests; cost-on-attempt; mastery advancement; clamping; death. Seeded RNG. Target: 100% branch coverage on `engine/`.

### M3 — Model router (all LLM traffic goes through here)
Files: `router/providers/*.ts`, `router/router.ts`, `router/roles.ts`, `router/structured.ts`.

1. Provider adapters, all speaking OpenAI-compatible chat: `openrouter` (recommended default), `openai`, `anthropic`, `google`, `mistral`, `deepseek`, `xai`, `groq`, `custom` (arbitrary base URL). Each: `{ chat(req): Response; supportsJsonMode: boolean }`.
2. `roles.ts` — role→(provider, model, samplers) mapping persisted in settings. Roles: `narrator | classifier | analyzer | summarizer | bootstrapper`. Ship a recommended-defaults table and a `tier: "recommended"|"advanced"` marker per known model.
3. `structured.ts` — `callStructured<T>(role, prompt, zodSchema, {maxRepairs=3}): T`. Requests JSON (json-mode or fenced), parses, Zod-validates; on failure re-prompts with the exact Zod error text. Throws `ModelOutputError` after retries — every caller surfaces this as the honest "try a recommended model" UX.
4. Streaming support for the **narrator role only**; all other roles are non-streaming structured calls.

### M4 — Classifier
Files: `classifier/classify.ts`, `classifier/prompt.ts`.

1. Build a **per-story Zod schema** where `actionId` is a literal enum of the story's catalog ids (+ `learn_skill`) — the classifier physically cannot emit an unknown action.
2. Prompt (see §8.2) receives: catalog (ids, labels, categories, requiresSkill), present character ids, the player message, and the last 2 narrator messages (for NPC intent extraction).
3. `classify(storyId, playerMessage): ClassifiedTurn` via `callStructured`. Confidence < 0.6 ⇒ drop intent to narration, append a note the narrator sees ("player intent ambiguous; do not resolve mechanically").
4. Tests: golden-file suite of ~40 messages → expected intents (attack phrasing variants, pure dialogue, mixed, NPC-implied actions, ambiguity).

### M5 — Bootstrapper
Files: `bootstrap/generate.ts`, `validate.ts`, `repair.ts`, `freeze.ts`.

1. **Two-phase generation** (keeps outputs small and models accurate):
   - Phase A: premise → `{statMode, resources, tiers, skills}`.
   - Phase B: Phase A output → `{items, actions, startingState, npcTemplates}`.
   Each phase via `callStructured` with its own Zod schema and repair loop.
2. **Cross-validation beyond Zod** (`validate.ts`): every `requiresSkill` exists; every skill exercised by ≥1 action; catalog ≥20 actions, ≥3/category; DCs within 5–25; starting skills exist; exactly one `lethal` resource when statMode ≠ none; unlockPath item/flag references exist. Failures feed the repair loop with precise messages.
3. `freeze.ts` — sets `locked=true`, persists. The gate refuses any unlocked schema.
4. **Regenerate rules:** allowed freely while `messages.count === 0`. After play begins: v1 **locks regeneration** (button disabled with explanation); editing individual DCs/labels allowed in the dev/advanced view. (Migration tooling is v2 — do not build it now.)
5. Silent default: create story → bootstrap → freeze → open Play. Advanced users find schema view/regenerate under story settings.

### M6 — Turn orchestrator (wires everything; the per-turn pipeline)
Files: `orchestrator/turn.ts`, `orchestrator/context.ts`. See §7 for the exact sequence. Implement exactly that.

### M7 — Memory & analyzer
Files: `memory/analyzer.ts`, `memory/softStore.ts`, `memory/cardView.ts`.

1. `analyzer.ts` — after each narrator reply, fire-and-forget (async, non-blocking): `callStructured(role="analyzer") → SoftStatePatch`; prompt in §8.3.
2. `softStore.ts` — `applyPatch(patch)`: merge rules — `set` overwrites; `append` dedupes case-insensitively; `observe` appends with turn index (cap 200, FIFO); `adjust_relationship` clamps trust/power to [-1,1]; unknown `characterId` ⇒ auto-create **secondary** soft profile (no hard state — NPCs get hard state only via `NpcTemplate` instantiation by the orchestrator when they first take a mechanical action).
3. `cardView.ts` — `getLivingCard(characterId): LivingCardView` joining hard + soft (read-only), exactly as the UI renders it.
4. Tests: patch merge semantics; auto-creation; clamping; the wall (attempt to write a mechanical path in a patch must be rejected by Zod — prove it with a test).

### M8 — Summarizer
Files: `summarizer/chapter.ts`, `arc.ts`, `injector.ts`.

1. Thresholds in settings: `messagesPerChapter=20`, `chaptersPerArc=15` (both editable).
2. `chapter.ts` — when unsummarized messages ≥ threshold: summarize that block → `{title, summary}` (structured call), persist. Runs async after a turn completes.
3. `arc.ts` — when chapters since last arc ≥ threshold: produce the **Arc Document** (Zod-typed): plotSummary, characterDevelopment[], relationshipDynamics[], secretsRevealed[], keyDialogue[], promisesAndOaths[], antagonists[], worldLore[], unresolvedThreads[], stakes[], keyItems[], skillsAndPowers[], limitations[], timeline[]. Persist to `arcs.doc_json`.
4. `injector.ts` — builds the memory block for context assembly (§7.3): latest arc doc (condensed) + chapter summaries since that arc + soft-state slices for present characters.
5. UI hooks: Overview screen renders chapters list and the arc document; manual "Summarize now" button calls the same functions.

### M9 — Card importer
Files: `importer/pngCard.ts`, `jsonCard.ts`, `urlImport.ts`, `mapToSchema.ts`.

1. `pngCard.ts` — parse PNG `tEXt` chunk `chara` (base64 JSON), support V2 (`spec:"chara_card_v2"`) and V3 (`spec:"chara_card_v3"`).
2. `jsonCard.ts` — same payloads as raw JSON files.
3. `urlImport.ts` — fetch a user-supplied URL (expect PNG or JSON; follow redirects; 10 MB cap), then delegate to the parsers. Plain fetch only — no site-specific scraping in v1.
4. `mapToSchema.ts` — card fields → soft identity (description→backstory/appearance, personality→traits, first_mes→opening scene, alternate greetings→selectable openings, character book entries→lorebook rows). The card seeds the **premise** handed to the bootstrapper; mechanical content always comes from bootstrap, never the card.

### M10 — UI (build backward from Play)
Order: **Play screen first**, then Library, Wizard, Overview, Card Creator/Editor, Persona, Lorebook, Advanced Settings.

1. **Play** — message list (streamed narrator), input box, dice toast (shows `d20+mod vs DC → outcome` when a ruling occurs; honest math always visible), living-card drawer (tap character name → `LivingCardView`), resource bars for `playerVisible` resources.
2. **Library** — grid of stories + bundled starter cards (ship 3 originals, written in-house) + Import buttons (file / URL). "New story" → premise input → silent bootstrap → Play.
3. **Wizard** (first launch) — three steps: welcome ("connect your AI"), key entry with provider choice (OpenRouter recommended path with deep-link + inline key validation + live test generation; "Advanced" reveals the full provider list), role-model defaults confirmation (one screen, pre-filled with recommendations, including summarizer/classifier/analyzer roles per D9).
4. **Overview** — counts, chapters list (expandable summaries), arc document view, "Summarize now".
5. **Card Creator/Editor** — form over the card fields; editing an imported card edits its soft identity + lorebook.
6. **Persona** — CRUD, one default.
7. **Lorebook** — CRUD rows (keys, content, enabled). Injection: naive keyword match against the last 4 messages, budgeted (§7.3).
8. **Advanced Settings** — providers & keys, role→model matrix with tier badges, sampler settings per role, summarizer thresholds, context budget, story schema dev-view (read + limited edit), license status.

### M11 — Licensing & trial
1. Integrate merchant-of-record (Lemon Squeezy first choice): purchase link out, license key paste-in.
2. `licensing/license.ts` — validate key against provider API; cache result; offline grace of 14 days since last successful check.
3. `trial.ts` — 14-day trial from first launch, stored locally; expiry gates story creation (existing stories remain readable). No aggressive DRM; single check on launch.

### M12 — Packaging & release
1. Tauri builds for Windows (MSI/NSIS) and macOS (dmg, universal).
2. **Code signing:** Windows cert + macOS Developer ID with notarization — required before any public distribution.
3. Auto-update via Tauri updater (static manifest on a plain file host — hosting an update manifest is not content hosting).
4. Crash/error logging is **local file only** in v1 (no telemetry).

---

## 5. NPC lifecycle (D7 clarified)

1. Bootstrapper emits `npcTemplates` for foreseeable key NPCs.
2. A character mentioned in prose gets a **soft** profile automatically (analyzer).
3. A character gains **hard** state only when it first participates mechanically: the orchestrator instantiates from the best-matching `NpcTemplate` (classifier passes a `templateHint`), or from a generic template (`hp = median lethal resource`, no skills) if none match.
4. From then on the engine rolls for it exactly like the player: gate → resolve → ledger. NPC death (`alive=false`) is authoritative; context assembly always states dead characters as dead.

---

## 6. Error handling policy

- Every structured call: repair loop (≤3) → `ModelOutputError` → user-facing toast naming the failing **role** and suggesting a recommended model. Never a silent fallback that fakes success.
- Narrator (unstructured) failures: retry once, then surface.
- Classifier failure: treat the turn as `narration_only`, flag it in the turn record, show a subtle "mechanics skipped (classifier error)" notice — never guess an action.
- Analyzer/summarizer failures: log, skip, retry on the next trigger (they're async and non-critical-path).
- DB writes are transactional per turn: ruling + ledger + message insert commit together or not at all.

---

## 7. The per-turn pipeline (exact implementation of orchestrator/turn.ts)

```
submitTurn(storyId, playerText):
 1. persist player message (idx = n)
 2. classified = classify(storyId, playerText)                         // D4, always
 3. rulings = []
    for intent in classified.playerIntents ∪ classified.npcIntents:
        ensureHardState(intent.actorId)                                // §5 step 3
        ruling = resolver.resolve(schema, actor, target, intent, rng)
        rulings.push(ruling)                                           // NOT committed yet
 4. context = assembleContext(storyId, rulings)                        // §7.3
 5. prose = narrator.stream(context)                                   // rulings are inline,
                                                                       // marked authoritative
 6. TRANSACTION:
      persist narrator message (idx = n+1)
      for ruling in rulings: ledger.commit(ruling); persist ruling
 7. async, non-blocking:
      analyzer.run(lastExchange) → applyPatch
      summarizer.maybeChapter(); summarizer.maybeArc()
 8. return {prose, rulings}                                            // UI renders dice toasts
```

Note the order: rulings are computed **before** the narrator writes (so prose renders truth), but committed **after** (so a narrator crash doesn't leave state changed with no prose). Prose never feeds the ledger.

### 7.3 Context assembly (D6)

Budget: 8,192 tokens (setting `contextBudget`), approx-counted (chars/4). Assemble in priority order; when over budget, drop from the bottom of this list, and truncate raw history before touching anything above it:

1. System frame: narrator instructions + authority rules (§8.1) — never dropped
2. This turn's **rulings**, rendered as authoritative facts — never dropped
3. Hard-state snapshot of present characters (resources, notable inventory, learned skills) — never dropped
4. Player persona + protagonist card essentials
5. Soft-state slices for present characters (identity condensed, mood/goal, top relationships)
6. Latest arc document (condensed) + chapter summaries since that arc
7. Triggered lorebook entries (keyword match, most-recent-first, ≤800 tokens)
8. Raw recent messages (as many as fit, newest kept)

---

## 8. Prompt contracts (summaries; full prompts are implementation files)

### 8.1 Narrator
- Role: write the next story beat in the story's voice; may voice multiple NPCs.
- **Authority clause (verbatim requirement):** "Mechanical outcomes below are already decided and final. You must narrate them exactly as stated. You may not grant items, skills, or successes beyond them. Anything you invent has no mechanical effect."
- Receives rulings as: `RULING: <actor> attempted <action> vs DC <dc> — rolled <d20>+<mod>=<total> → <OUTCOME>. Effects: <effects>. Narrate this outcome.`
- Style constraints from story settings (POV, tense, length target).

### 8.2 Classifier
- Input: action catalog (id, label, category, requiresSkill), present characters, player message, last 2 narrator messages.
- Output: `ClassifiedTurn` JSON only. Instructions: map only to listed ids; prefer `narration_only` over guessing; extract NPC intents only when the fiction clearly commits an NPC to a catalog action; set confidence honestly.

### 8.3 Analyzer
- Input: last player+narrator exchange, current soft snapshots of present characters.
- Output: `SoftStatePatch` JSON only. Explicit prohibition: "Never output skills, items, resources, health, or inventory — those are tracked elsewhere. Only personality, mood, relationships, observations, locations, threads."

### 8.4 Summarizer
- Chapter: input = message block → `{title, summary ≤ 300 words}` capturing events, acquisitions (as narrated), time passed.
- Arc: input = chapter summaries + prior arc doc → full Arc Document JSON (schema in M8.3).

### 8.5 Bootstrapper
- Phase A/B as in M5.1, with the §2.2 catalog constraints stated explicitly and examples of one action per category embedded in the prompt.

---

## 9. Milestones & acceptance criteria

| Milestone | Includes | Accepted when |
|---|---|---|
| **A. Engine proven** | M1, M2 | Full engine test suite green at 100% branch coverage; a scripted “fake story” plays 50 turns via unit harness with correct gating, mastery advancement, death. |
| **B. Talking skeleton** | M3, M4, M6 (context minimal), narrator prompt | End-to-end CLI/dev turn: type text → classifier → rulings → narrator prose that matches rulings, on 3 different recommended models. |
| **C. Stories exist** | M5 | 10 varied premises (fantasy, sci-fi, social-only, survival) each bootstrap to a valid frozen schema on 3 recommended models with ≤3 repairs; statMode `none` produces a playable no-stats story. |
| **D. Memory lives** | M7, M8 | 100-turn scripted playthrough: living card visibly evolves; chapters generate at threshold; arc doc generates and is coherent; assembled context stays ≤ budget. |
| **E. Product shell** | M9, M10 | Import a V2 PNG card and a V3 JSON card and play them; all 8 screens functional; wizard first-run to first successful generation < 5 minutes for a new user. |
| **F. Sellable** | M11, M12 | Trial gate works; license activates; signed installers on both OSes; auto-update from a test manifest. |

Definition of done for v1 = all six milestones accepted.

---

## 10. Test strategy

- **engine/**: exhaustive unit tests, seeded RNG, table-driven (this is the product's guarantee — treat failures as release blockers forever).
- **classifier/**: golden-file corpus (~40 messages) run against the recommended classifier model in CI-manual mode; Zod guarantees structural validity regardless.
- **bootstrap/**: schema-validation fuzz — feed deliberately malformed model outputs to the repair loop.
- **memory/**: patch-merge unit tests incl. the wall test (mechanical field in a patch must fail validation).
- **orchestrator/**: integration test with a mock router (canned model outputs) proving the pipeline order, the transaction semantics, and prose-never-writes-ledger.
- **UI**: smoke tests per screen; manual test script for the wizard.

---

## 11. Deliberate v1 exclusions (do not build)

Drift detection/policing · vector storage · non-d20 dice · schema migration after play begins · mobile build · telemetry · hosted anything · site-specific card scrapers · streaming for non-narrator roles.


---

## v5 reconciliation (authoritative over this document where they conflict)

**Two stat systems only.** `statMode` is **No Stats (`none`)** or **Full Stats (`full`)**. Any
`light` mode in this plan is **superseded** — `light` survives only as a legacy value handled by the
one-time migration to one of the two final modes (see `../02-STATES-AND-FLOWS.md §Migration`). Remove
`light` as a selectable/final mode wherever it appears above.

**No Stats = Narrator only.** A `none` story calls **only the Narrator**. Classifier, Analyzer,
Summarizer, and Story AI/Bootstrapper are dormant (no request/fallback/retry/cost). Any statement
above implying every story runs the full pipeline is void for `none` stories.

**Attributes (LOCKED).** Fold in `attribute-integration.md` in full: `AttributeDef` on the frozen
schema, `governingAttribute` on `ActionDef`, `attributes` on character state (missing → 10/+0),
`attributeDeltaSelf/Target` on `EffectSpec` (ledger-only writer), the attribute `Condition`
variant, resolver term `+ attrMod(governingAttribute)`, and the single `scoreToMod(score) =
floor((score-10)/2)` derivation. Attributes are generated early in bootstrap Phase A, are static (no
leveling by use), and are never point-bought in v1.

**Frozen catalog (N1) & global Narrator (J).** Catalog definitions are immutable after forge (runtime
reveals/unlocks pre-existing IDs only; no sixth model role). The Narrator is a single global
assignment; no per-story override exists.

---

## v6 reconciliation (authoritative over this document where they conflict)
- **Attribute scale 1–10** (was 1–30). `scoreToModifier = score − 5` (−4..+5); locked `0` is an
  unavailable state, not a rollable score. Supersedes `attribute-integration.md §10`.
- **Mastery is XP-based** (not success-counting). Engine-awarded; thresholds 100/250/625 (×2.5);
  failure 25%, denied 0, diminishing returns; rollback with rewind.
- **Rulebook regeneration** is an allowed, destructive, warning-gated version boundary (immutable in
  ordinary play). Duplicate-safe + typed-confirm direct; atomic; retained snapshot.
- **Primary provider** `primaryProviderId`: a persisted UX default; per-role bindings win at inference.
- **Scene entities** materialized from narrated mentions via a local registry; hard state lazily
  instantiated; no model writes it.
- **Universal actions**: ten sealed primitives; story actions specialize/alias them.
- **SillyTavern macros** expand at assembly; unknown macros preserved + warned, never deleted.
- Unchanged: two modes (No Stats/Full Stats), No Stats = Narrator-only, one global Narrator, engine
  is the only hard-state writer, no sixth model role.