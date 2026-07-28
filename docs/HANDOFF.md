# HANDOFF — current live state (the baton)

> Overwrite this file each time an agent stops. It describes **now**, the complete known product
> context, and the **single next action**. History belongs in [`WORKLOG.md`](WORKLOG.md); the
> sequential-agent protocol is in [`/AGENTS.md`](../AGENTS.md).

**Updated:** 2026-07-29
**Branch / HEAD:** `main` at `c5b12d3` (`core(orchestrator): same-turn NPC agency — deterministic
reaction stage`), docs baton commit on top — pushed
**App version:** `0.2.8` (no rebuild since this change; core-only, no packaged artifact yet)
**Tracked tree before this documentation update:** clean
**User-owned/untracked:** `.codex/`, `opencode.json` — do not add, delete, or overwrite without
explicit instruction
**Baseline:** green — typecheck; **core 469 / 38 files + UI 136 / 25 files = 605 tests**
**Known test noise:** seven React `act(...)` warnings (five `RulingBlock`, one `Play`, one `Overview`)
**Active plan:** [`Plan/next-phase-internal-beta.md`](../Plan/next-phase-internal-beta.md)

## Read these sources before changing behavior

1. [`AGENTS.md`](../AGENTS.md), this file, and the newest [`WORKLOG.md`](WORKLOG.md) entries.
2. [`Design/HANDOFF-V7-DESIGN-INSTRUCTIONS.md`](../Design/HANDOFF-V7-DESIGN-INSTRUCTIONS.md) and
   [`Design/handoff-v7/00-V7-DESIGN-SPEC.md`](../Design/handoff-v7/00-V7-DESIGN-SPEC.md).
3. [`Plan/competitive-adoptions.md`](../Plan/competitive-adoptions.md),
   [`Plan/attribute-integration.md`](../Plan/attribute-integration.md), and the active plan.
4. Treat `Design/handoff-v2` through `handoff-v7` as read-only historical/design reference. Runtime
   code is the authority for what is actually implemented.

## Non-negotiable product invariants

- The deterministic DM/framework owns gates, dice, effects, costs, deaths, loot eligibility,
  progression, action budgets, and persisted state. Models may classify, recommend, and write prose;
  they may never override a ruling or directly mutate authoritative state.
- The narrator must receive immutable rulings and must not expose contradictory prose. Do not “fix”
  streaming by flashing unaudited text.
- Routine conversation, thoughts, prayer, maintenance, safe travel, and atmosphere should normally
  continue naturally without dice. Roll only for a consequential, uncertain, opposed, dangerous,
  time-pressured, scarce, costly, or state-changing attempt. The game must not fight the player over
  every harmless action.
- Story creation uses the selected persona as a first-class input for the player character, stats,
  abilities, and starting possessions. `{{user}}` means the selected player persona; `{{char}}`
  means the imported card/story character. Preserve supported SillyTavern macros.
- Starting equipment explicitly carried by the card/persona may be created at forge time. Do not
  pre-generate a universe-wide item catalog. Later loot is generated on demand from encounter
  context, validated by the engine, and awarded only when deserved.
- Engineering owns versioned progression/configuration. Do not ask Design AI or narrator prose to
  invent formulas, caps, universal actions, model defaults, or advancement policy.

## What is already landed at HEAD

- Card-import routing no longer reuses the active chat story draft; Library import owns the working
  flow. Drag/drop, sparse-card warning, trait chips, and import-to-Blueprint tests exist.
- Persona selection is present in story creation; the redundant free-text player-name field was
  removed and the persona is passed into forge/play context.
- Native provider HTTP transport is wired through Tauri, avoiding webview CORS failures.
- Provider/model recommendations are data-driven, with bridge catalog-parity tests.
- V7 deterministic systems exist: configurable universal actions, action budget (default two),
  equipment tiers/effects and seven slots, on-demand loot, skill XP progression, 1–20 attributes,
  deterministic attribute advancement, difficulty, journal/dossier surfaces, contextual
  suggestions, and atomic rulebook regeneration.
- Attribute advancement uses configured score bands plus meaningful, repeated evidence from
  relevant combat or non-combat actions/scenes. Decisions persist as authoritative approved/denied
  events before narrator prose. Ordinary scores cap at 20; 20+ requires explicit superhuman
  provenance.
- In-flight Play operations survive leaving and returning to the same story route.
- Classifier JSON normalization, one bounded repair, and exact sealed-catalog recovery landed.
- Narrator authority-audit normalization and fail-closed fallback landed; a provider-shape error no
  longer causes an automatic second full narrator generation.
- Current unsigned v0.2.8 artifacts:
  - NSIS: `packages/shell/src-tauri/target/release/bundle/nsis/Midnight Tavern_0.2.8_x64-setup.exe`
    — SHA-256 `F747FDEADD5CE1EC38151445BE6FB74F52DF4A2851BAF579B547C62DB9680AC1`
  - MSI: `packages/shell/src-tauri/target/release/bundle/msi/Midnight Tavern_0.2.8_x64_en-US.msi`
    — SHA-256 `8D3C1C5D863FF9D359CA9B5A1213DFD5CDDA71789B8CC21F00234381CBF774BF`

## Latest packaged evidence — do not dismiss as a model-only problem

The human tested Jerusalem Man in v0.2.8. The latest application log is:
`C:\Users\anuji\AppData\Local\com.midnighttavern.app\logs\midnight-tavern.log`.

- One turn took **48,336 ms**: classifier 3,061 + 4,575 ms, narrator 38,081 ms, authority audit
  2,459 ms.
- The next two-action turn took **112,871 ms**: classifier 50,705 ms, repair 5,602 ms, narrator
  54,251 ms, authority audit 2,147 ms.
- The live narrator binding was Electron Hub `claude-opus-4-8`, temperature `0.8`, top-p `0.95`,
  max tokens `1200`. The classifier was Electron Hub `gpt-4o-mini`, max tokens `500`.
- The 50.7-second classifier call is a real provider/upstream stall; the repair then adds another
  serial wait. Opus accounts for another 38–54 seconds. Faster model defaults alone will not fix the
  architecture described below.

## Confirmed root cause 1 — mechanical turns intentionally do not visibly stream

`packages/core/src/orchestrator/authorityGuard.ts::generateGuardedNarration` behaves differently for
the two paths:

- No rulings and no forced audit: passes the real `onDelta` into `router.stream`; UI streaming works.
- Any ruling or forced audit: passes `() => {}` into `router.stream`, buffers the entire draft,
  performs a separate authority audit, and only then calls `onDelta(lastDraft)` once.

The UI store, bridge, router, and provider stream path are functional. The authority guard is the
point that suppresses deltas. This is why “The story continues” remains visible for a long time and
then all prose appears at once. Raw token passthrough is not acceptable because it would expose
unaudited contradictions.

**Required direction:** engine-owned narrative contract plus progressively verified paragraph/beat
chunks. Each chunk must be held until validated against immutable rulings, then released; an unsafe
chunk is repaired or replaced without exposing it. This gives genuine incremental delivery with a
small verification delay while preserving fail-closed DM authority. A post-audit typewriter effect
is not real streaming and does not solve latency.

**FOUNDATION LANDED (2026-07-29, commit `d2f98dd`).** `generateGuardedNarration` now releases each
complete *non-mechanical* paragraph as it streams and holds the first mechanical paragraph + rest for
the whole-draft audit (deterministic `assertsMechanic` guard; fail-closed; rejected remainder →
`safeSummary`). Two tests pin it. **Still required to finish this root cause:** (1) verify the turn
orchestrator (`orchestrator/turn.ts`) + bridge actually thread the real UI `onDelta` into
`generateGuardedNarration` and that the narrator provider streams deltas — otherwise the packaged app
sees no change; add a packaged smoke check. (2) per-beat verification for *mechanical* beats (a
deterministic-first fast path, not a model audit per beat) so combat prose also streams. (3) per-stage
deadlines + a faster default narrator tier to attack the ~50s classifier stall / 38–54s Opus time —
this foundation only improves time-to-first-*narrative*-prose, not total latency.

## Confirmed root cause 2 — NPCs have no same-turn agency pipeline

`packages/core/src/orchestrator/turn.ts::runTurnOperation` can resolve `npcIntents`, but it only gets
them from the same classifier call that parses the player's message. The classifier prompt says to
extract an NPC intent **only when recent narration already committed that NPC to a catalog action**.
Consequences:

- NPC mechanics are one turn late by design: old prose is interpreted during the next player turn.
- Actor/target ids are schema-limited to persisted “present characters”.
- The tested Jerusalem Man database contained only the player character. The hunched creature existed
  only in prose, so it could not legally produce an NPC intent or DM ruling.
- The last five persisted classified turns had `npcIntents: []`.
- Background analysis only patches existing roster records; it does not promote a prose entity into
  a character. Tests prove that supplied NPC intents can resolve, but no end-to-end test proves
  autonomous NPC decisions, scene-entity promotion, or a same-turn reaction.

**Required direction:** consequential entities must be engine-approved and persisted before they
act. After resolving player intents, run an NPC decision stage against updated hard state, goals,
personality, relationships, danger, scene presence, and the sealed action catalog. Resolve those
NPC intents before narration, then give all rulings to the narrator. Obvious direct reactions
(defend, counter, flee, surrender) should use deterministic policy when possible; only ambiguous
social/tactical choices need a small, fast structured model call. Ambient extras may remain
prose-only until promoted. NPC actions use a separate encounter budget and never consume the
player's configured action allowance.

**DETERMINISTIC REACTION STAGE LANDED (2026-07-29).** `orchestrator/npcAgency.ts::planNpcReactions`
+ its wire in `turn.ts::runTurnOperation` now give a **present, living, already-persisted** NPC a
same-turn counter-attack when the player lands an allowed combat action on it: the planner chooses
a `MechanicalIntent` (first sealed combat action the NPC's own gate permits), the engine resolves
it with full gate/dice/effects authority, and its ruling joins the narrative contract before
narration. Own per-NPC encounter budget (`DEFAULT_NPC_ENCOUNTER_BUDGET`), independent of the
player's `actionBudget`; loot/advancement are scoped to the player-ruling prefix so an NPC counter
can't steal the player's reward anchor. Four tests pin it (surviving NPC reacts / slain NPC never
acts / separate budget / narration-only stays quiet). **Still required to finish this root cause:**
(1) **scene-entity promotion** — a consequential prose-only entity (the Jerusalem "hunched
creature") still can't act because no character row exists; promote it via validated
template/generic instantiation *before* it acts, and prove ambient prose extras never gain
mechanics accidentally. (2) a **small bounded planner** for ambiguous social/tactical NPC choices
(deterministic direct reactions are covered; goal-driven non-combat NPC action on a non-combat
player turn is not). (3) widen the provoke predicate beyond combat targets (non-combat
intimidation/"threatens") once promotion lands.

## Required next turn pipeline

1. Persist player text and restore/reuse the operation.
2. Classify player intent with a strict time budget and deterministic sealed-action fallback.
3. Resolve player intents and commit only after the complete turn succeeds.
4. Discover/activate any consequential scene entity through validated templates/generic bounds.
5. Decide NPC reactions/actions from updated state; use deterministic reactions first and a fast
   bounded planner only when necessary.
6. Resolve NPC intents with the same gates/dice/effects authority as player intents.
7. Determine eligible loot and attribute advancement only when deterministic preconditions say the
   stage is relevant; parallelize independent work where safe.
8. Build an immutable narrative contract from every ruling and approved state change.
9. Generate, verify, and release narrator prose incrementally by paragraph/beat.
10. Atomically persist prose, rulings, state, loot, progression, checkpoint, and operation status;
    keep analyzer/summarizer work in the background.

## Complete V6 requirement ledger

1. **Forge duration/progress:** still a priority. Historical runs exceeded five minutes or failed;
   progress appeared stalled. Add stage timings, timeouts, bounded repair/fallback, and a truthful
   progress state. Live packaged forge acceptance is still required.
2. **Card-defined attributes:** generated character attributes must preserve the card's explicit
   concepts/names instead of silently substituting near-equivalents. Needs packaged cross-card
   acceptance coverage.
3. **SillyTavern macros:** `{{user}}` = selected persona/player and `{{char}}` = card/story character;
   preserve all supported card macros through import, forge, lore, and prompts.
4. **Classifier empty/invalid output:** normalization and sealed recovery landed, but live provider
   stalls and malformed-output recovery remain visible risks. Never treat unresolved mechanics as
   success.
5. **Universal actions/DM trigger:** engineering-owned default actions exist for every story. Exact
   player wording such as attacks must trigger classification even when it is not the generated
   action label; gates still reject unavailable skills/items.
6. **Skill progression:** DM grants XP based on meaningful action outcome/evidence, not raw action
   count; thresholds grow exponentially. Prevent grinding.
7. **Stuck “story continues”:** operation persistence landed, but long guarded narration still makes
   the label appear stuck. Progressive verified output and timeout/error completion are required.
8. **Persona warning/input:** selector and persona flow exist; retain a prominent warning that stats
   depend on the correct persona and prove the selected persona reaches bootstrap generation.
9. **Definitions/context:** attributes, skills, and actions require clear descriptions and those
   descriptions must reach classifier/DM prompts for gates, resolution, XP, and advancement.
10. **Rulebook regeneration:** atomic regeneration exists; retain the warning that rule-based data is
    wiped/replaced, keep the old rulebook until complete success, and verify retry/provider routing.

## Complete V7 requirement ledger

1. Narrator must always obey DM rulings at story creation and every narration prompt.
2. Skill/attribute/other progression is engineering-owned, versioned, and deterministic.
3. Universal actions have no arbitrary product-count limit; they live in upgradeable configuration.
4. Recommended models and parameters live in easily updated configuration.
5. Equipment supports Common, Uncommon, Rare, Legendary, and Mythical tiers plus rare attribute
   modifiers, skill modifiers, boosts, lifestyle upgrades, and skill enabling. DM eligibility is
   authoritative.
6. Universal loadout is seven slots: Primary, Secondary, Head, Body, Utility, Accessory I, Accessory
   II. Enforce exclusivity and quantity rules.
7. Loot is encounter-aware, generated on demand, and awarded only after DM validation.
8. Full character profile exposes mentality, personality, history, relationships, state,
   progression, inventory, and loadout; entry points must be obvious from Characters and Play.
9. Player action count is configurable per story, default two, and enforced for combat, dialogue,
   and other actions.
10. Play includes a compact Possible Moves control producing five or six scene-grounded actions,
    moves, or dialogue lines. Suggestions are insert-only/editable and cannot invent mechanics.
11. Attributes use 1–20, with explicit superhuman provenance for 20+; do not confuse this with the
    recommended 3–6 attribute count.
12. Implement applicable [`Plan/competitive-adoptions.md`](../Plan/competitive-adoptions.md)
    features without weakening deterministic authority.

## Post-V7 clarifications and acceptance risks to retain

- **Starting gear:** create/attach plausible basic gear explicitly carried by the card/persona at
  forge. Only the universe-wide item catalog is forbidden at forge; later loot remains on demand.
- **Lorebook information architecture:** Lore landing page lists lorebooks. Opening one shows its
  entries; do not flatten every entry from every book into the global landing screen.
- **Character navigation:** cards and party chips need an obvious route to full dossier/loadout,
  including newly gained items.
- **Suggestions:** previously returned unrelated generic/action-catalog options or failed after
  repair. They must be grounded in the latest prose, rulings, present characters, hard state, and
  persona; failure must preserve the draft and offer retry.
- **Primary provider routing:** a role uses its explicitly bound provider/model. “Primary provider”
  is only the default for unbound roles; never silently route an Electron Hub-bound role through
  OpenRouter. Preserve provider/model/role in logs.
- **Forge/regeneration validation:** historical failures included missing advantage/disadvantage
  condition fields, excessive conditional-action coverage, dead flags/prerequisites, and out-of-range
  NPC attributes. Repair should normalize or safely prune invalid optional model output, while
  rejecting true broken references. Never spend four full retries on the same structural mistake.
- **Attribute advancement:** not score bands alone. Evidence must be tied to specific meaningful
  actions in combat, training, survival, social, investigation, crafting, or other consequential
  scenes. Current bands: 1–5 easy, 6–9 normal, 10–13 moderate, 14–17 hard, 18–19 near-impossible.
- **Runtime skills:** current engine does not create arbitrary brand-new skill definitions during
  play. It supports sealed skills, predefined unlocks, and equipment-enabled skills. If the product
  is to allow genuinely new learned skills, add a separate engine-governed discovery/proposal,
  validation, deduplication, balance, persistence, and UI flow; never let narrator prose add one.
- **Low-friction play:** narration-only actions should receive real, adequately detailed prose.
  Mechanical results should explain consequences in context, but dice cards must not replace story
  continuation.
- **In-flight persistence:** leaving Play and returning must not lose turns, generation, suggestions,
  forge, regeneration, or other long operations. Play turn persistence is landed; other long-running
  screens still need explicit acceptance tests.
- **NPC agency:** newly confirmed missing as described above. NPCs must pursue goals, react to harm,
  protect themselves/allies, assist, converse, flee, surrender, or exploit openings without waiting
  passively for the player.
- **Streaming/latency:** newly confirmed missing for mechanical turns. Instrument time-to-first-safe
  chunk and total duration by stage. Use configurable deadlines, one bounded repair, deterministic
  fallbacks, compact context, and quality/speed labels. Recommended default narrator should be a
  responsive tier (for example Sonnet); Opus remains an explicit slower quality choice.
- **Sequential-agent knowledge transfer:** every agent must update this file, append WORKLOG, update
  the active plan, run typecheck/tests, and commit coherent green changes before handing off.

## Test coverage required for the newly confirmed gap

- Player attacks/threatens a tracked NPC → same-turn NPC reaction produces an authoritative ruling.
- A non-combat player turn still permits a goal-driven NPC action when context warrants it.
- A consequential newly introduced entity is persisted before it can act; ambient prose extras do
  not gain mechanics accidentally.
- Inactive/off-scene/dead NPCs cannot act; NPCs cannot invent action ids, targets, items, skills, or
  bypass gates.
- NPC action budget is separate from the player's configured budget.
- Mechanical narration exposes the first **verified** chunk before the narrator finishes; unsafe
  chunks are never displayed.
- Delayed/malformed classifier and NPC-planner calls hit bounded fallback without duplicate turns.
- Provider role binding is honored end-to-end.
- Full turn persistence remains atomic across cancel, route changes, provider errors, and restart.

## Single next action

The deterministic same-turn NPC **reaction** stage is now landed (see root cause 2 above); a
present, persisted NPC fights back with engine authority. Two things remain, in this order:

1. **Scene-entity promotion — finish root cause 2.** The still-broken half: a consequential entity
   that exists only in narrator prose (the Jerusalem "hunched creature") cannot act because it has
   no character row, so `planNpcReactions` never sees it. Start with a failing core test: the player
   attacks/threatens an NPC that is named only in recent narration → the engine **promotes** it to a
   persisted character (validated NPC template, else generic bounds via `ensureHardState`/bootstrap)
   **before** it acts → it produces a same-turn authoritative ruling. Add the negative test too:
   ambient prose nouns (scenery, crowd) must NOT be promoted or gain mechanics. Wire promotion into
   `runTurnOperation` just before `planNpcReactions`. Then (optional, second slice) add a small
   bounded structured planner for *ambiguous* social/tactical NPC choices — deterministic direct
   reactions already cover defend/counter; goal-driven non-combat NPC action does not. Preserve
   bridge parity and atomic persistence; keep the NPC encounter budget separate from the player's.
2. **Close out streaming end-to-end (root cause 1 tail):** verify `orchestrator/turn.ts` + bridge
   thread the real UI `onDelta` into `generateGuardedNarration` and the narrator streams deltas in
   the packaged app; add per-stage deadlines + first-safe-chunk telemetry; make the default narrator
   a responsive tier (e.g. Sonnet). This is what attacks the ~50s classifier stall / 38–54s Opus
   time — neither NPC-agency change touched total latency.

Do not polish the seven `act(...)` warnings, signing/updater/CSP, or cut another installer before the
NPC-agency gap is fixed and the full suite/build are green.

Do not spend the next cycle polishing the seven `act(...)` warnings, signing/updater/CSP, or producing
another installer before this architectural gap is fixed and the full suite/build are green.

## Watch-outs

- Do not use `onDelta` directly for mechanical turns without chunk verification.
- Do not make the narrator responsible for choosing NPC mechanics; it only dramatizes resolved facts.
- Do not instantiate every noun in prose as an NPC. Promotion must be consequential, scene-grounded,
  bounded, and engine-approved.
- Do not add a slow model call for obvious NPC reactions; deterministic policy is both faster and
  more reliable.
- Do not include player-facing internal ids, schema errors, or provider repair chatter in prose.
- Do not commit `.codex/` or `opencode.json`.
- Release/signing/updater/CSP remains a later phase.
