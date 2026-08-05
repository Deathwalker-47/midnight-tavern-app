# 11 — Implementation Plans

Every recommended fix and feature, as a numbered plan an engineer can execute without
re-deriving the analysis.

**How to read a plan.** Each carries the finding it closes (with its file), a severity, a
rough effort, the exact files to touch, numbered steps, a test strategy naming real test
files, and a "done when" line.

**Effort estimates** assume one developer working with AI assistance, and include tests.
`XS` = under an hour · `S` = a few hours · `M` = 1–3 days · `L` = 1–3 weeks ·
`XL` = 1–3 months.

**The numbering is stable** — other files in this audit reference these numbers. The
*recommended order* is in §1 and differs from the numeric order.

---

## 1. Recommended sequence

### Sprint 1 — days. Do these first; they unlock every honest claim you want to make.

| # | Plan | Closes | Effort |
| --- | --- | --- | --- |
| 1 | Wire observations into the narrator prompt | M-1, M-5(part) | S |
| 2 | Render character names, not raw IDs | M-8 | XS |
| 3 | Stop `set_overview_hint` destroying the world | M-3 | S |
| 14 | Remove raw JSON from player-facing screens | U-6 | XS |
| 16 | Use the real chapter number | U-7 | S |
| 15 | Surface Dossier and Loadout in the chrome | U-5 | S |
| 13 | Wire the built-but-unreachable ruling variants | U-2 | S |
| 8 | Close the URL-import SSRF | W-3 | S |

### Sprint 2 — 1–2 weeks. Make the DM behave like a character.

| # | Plan | Closes | Effort |
| --- | --- | --- | --- |
| 7 | Provocation ≠ opposed; disposition-aware reactions | D-1, D-2 | M |
| 4 | Fix relationship saturation | M-7 | S |
| 5 | Trait supersession + stable thread ids | M-5, M-6 | M |
| 17 | Ruling-fidelity and composer cluster | U-8…U-12 | M |
| 9 | Prose reroll keeps the ruling immutable | file 10 §2 | M |
| 12 | `Status:` line on every plan and design doc | W-11 | XS |

### Sprint 3 — weeks. Close the credibility gaps.

| # | Plan | Closes | Effort |
| --- | --- | --- | --- |
| 6 | Give No Stats mode a memory | M-2 | M |
| 11 | Local diagnostics panel | W-10 | M |
| 24 | Archive old prototypes; fix the journal tail | W-8, W-9 | S |
| 21 | Decompose `validateStorySchema` | W-5 | M |
| 18 | First-run onboarding | U-4 | L |

### Sprint 4+ — months. The strategic bets (see file 09 §9 before starting).

| # | Plan | Closes | Effort |
| --- | --- | --- | --- |
| 19 | Land the NPC scene/actor model | D-3, W-6 | XL |
| 20 | Port the v2 memory system | M-4, M-9, M-10, M-11 | XL |
| 23 | Art direction and a portrait pipeline | U-3, U-13 | XL |
| 10 | Turn-based combat | W-2 | XL |

---

## Plan 1 — Wire observations into the narrator prompt

**Closes:** M-1 (critical, file 05) and the trait-recency half of M-5. **Effort: S.**
**This is the single highest-value change in the audit.**

**Problem.** The analyzer records up to 200 observations per character; the narrator never
sees one. `condenseSoftSlice` renders traits/mood/goal/location/relationships and skips
`soft.observations` entirely; `assembleContext` has no observations block. The data reaches
the UI dossier only.

**Files**
- `packages/core/src/summarizer/injector.ts` (`condenseSoftSlice`, `:35–48`)
- `packages/core/src/orchestrator/context.ts` (`buildMemoryBlock` / `assembleContext`, `:466–581`)

**Steps**
1. Write the failing test first: build a `CharacterSoftState` with 20 observations, call
   `condenseSoftSlice`, assert the returned string contains the most recent observation text.
   Observe RED.
2. In `condenseSoftSlice`, append a `recent:` segment carrying the **last N observations**
   (start with `N = 5`), newest last so the model reads them in story order. Keep each
   observation to a sane length (truncate at ~160 chars) so one verbose entry cannot dominate.
3. **Same edit, one-line fix for trait recency:** change `soft.identity.traits.slice(0, 6)`
   (`injector.ts:37`) to `.slice(-6)`. `append` pushes to the end, so today the six *oldest*
   traits win permanently and nothing learned later is ever shown.
4. Confirm the observations text flows through `buildMemoryBlock` into the assembled prompt,
   and that it participates in the existing token-budget accounting rather than bypassing it.
   If the budget trims, observations should trim **before** ruling facts and hard state — they
   are the softest content in the prompt.
5. Make `N` a constant next to `OBSERVATION_CAP` so it is tunable in one place.

**Tests** — `packages/core/test/summarizer/summarizer.test.ts` (extend) and
`packages/core/test/orchestrator/turn.test.ts` (assert the assembled prompt contains a known
observation). Add one budget test: with a huge observation set, the prompt must still contain
the ruling facts.

**Done when** a story with recorded observations produces a narrator prompt containing them,
and the full suite is green.

**Note:** doing this raises M-9 (FIFO cap with no consolidation) from medium to high, because
discarded observations now matter. Plan 20 addresses it properly.

---

## Plan 2 — Render character names, not raw IDs

**Closes:** M-8. **Effort: XS.**

**Problem.** `injector.ts:45` renders `${r.toCharacterId}`, so the narrator receives
`char_7f3a91b2(trust 0.8, protective)` and cannot use it. Every relationship in every prompt
is wasted tokens.

**Files**
- `packages/core/src/summarizer/injector.ts:45`
- `packages/core/src/orchestrator/context.ts` (has `nameFor`, `:483`)

**Steps**
1. Failing test: assert the condensed slice contains a character *name*, not an id.
2. Add an optional `nameOf?: (id: string) => string | undefined` parameter to
   `condenseSoftSlice`; render `nameOf(id) ?? humanised-id` rather than the bare id.
3. Pass the existing resolver through from `buildMemoryBlock`. Reuse `nameFor`
   (`context.ts:483`) rather than writing a second lookup.
4. While here: `nameFor` falls back to the raw id for characters outside the present set.
   Make that fallback humanise the id (strip prefix, replace underscores) so an id can never
   appear verbatim in prompt text.

**Tests** — `packages/core/test/summarizer/summarizer.test.ts`.

**Done when** no `char_*` id can appear in an assembled narrator prompt.

---

## Plan 3 — Stop `set_overview_hint` destroying the world overview

**Closes:** M-3 (active data loss). **Effort: S.**

**Problem.** `memory/softStore.ts:101–102` replaces the entire world overview with whatever
single string the analyzer emitted this turn. No merge, no history, no undo. The op is named
a *hint* and implemented as a total overwrite.

**Files**
- `packages/core/src/memory/softStore.ts:101–102`
- `packages/core/src/types/softState.ts` (if the shape changes)
- `packages/core/src/store/repositories/worldSoft.ts`

**Steps**
1. Failing test: apply two different `set_overview_hint` ops in sequence; assert information
   from the first survives. Observe RED.
2. Change the semantics from *replace* to *accumulate*: keep a bounded, de-duplicated list of
   hints (suggest cap 12, newest-wins on near-duplicates) and derive `overview` from it.
3. Prefer the no-migration route if you want this in Sprint 1: keep `overview` a string and
   append with a separator, capped by character count, dropping oldest first. Cheaper, and it
   removes the data-loss bug immediately. The list shape is the better long-term answer and
   belongs with Plan 20.
4. Consider renaming the op to `add_overview_hint` in the Zod union so the name matches the
   behaviour. If you do, update `memory/prompt.ts` so the analyzer emits the new name.

**Tests** — `packages/core/test/memory/softStore.test.ts`.

**Done when** no single analyzer response can erase accumulated world description.

---

## Plan 4 — Fix relationship saturation

**Closes:** M-7. **Effort: S.**

**Problem.** `softStore.ts:78–94` clamps accumulated trust/power to `[-1, 1]`. Once
saturated, a betrayal after twenty kindnesses moves nothing — the most dramatic beat in a
relationship arc is the one the model cannot represent.

**Files** — `packages/core/src/memory/softStore.ts:78–94`,
`packages/core/src/types/softState.ts`, `packages/core/src/summarizer/injector.ts`

**Steps**
1. Failing test: saturate trust to 1.0, apply a large negative delta, assert the state
   registers the shock.
2. Apply a **soft clamp** — scale incoming deltas by `(1 - |current|)` as they approach the
   bound, so movement slows but never stops, then clamp to the legal range for safety.
3. Add a `recentShift` field (last delta plus the turn index) to the relationship record, and
   render it in `condenseSoftSlice` when it is significant — e.g.
   `Kael(trust 0.9, recently shaken)`. **This is the part the player will actually feel**: it
   lets the narrator play the betrayal even while the aggregate stays high.
4. Optional, defer if it complicates the schema: mild decay toward 0 over many turns without
   interaction.

**Tests** — `packages/core/test/memory/softStore.test.ts`, plus one injector assertion.

**Done when** a betrayal at saturation changes the narrator's prompt.

---

## Plan 5 — Trait supersession and stable thread identity

**Closes:** M-5, M-6. **Effort: M.**

**Problem.** `append` (`softStore.ts:64–68`) can add but never contradict — "brave" and
"cowardly" coexist forever, so character development is unrepresentable. Threads are keyed by
lowercased title (`:107–121`), so a rephrased `resolve_thread` silently no-ops and a genuinely
new thread with a similar title is silently dropped.

**Files** — `packages/core/src/types/softState.ts`,
`packages/core/src/memory/softStore.ts`, `packages/core/src/memory/prompt.ts`,
`packages/core/src/store/repositories/worldSoft.ts`, plus a migration (next is **17**)

**Steps**
1. Failing tests for both halves: (a) a trait that supersedes an existing one replaces it;
   (b) `resolve_thread` resolves a thread whose title was rephrased.
2. **Traits:** add an optional `replaces?: string` to the `append` op in the Zod union. When
   present and matched case-insensitively, replace in place rather than appending. Update
   `memory/prompt.ts` so the analyzer is told it may supersede an existing trait, and give it
   the current trait list to choose from.
3. **Threads:** add a stable `id` (uuid) to thread records, allocated on `add_thread`. Change
   `resolve_thread` to take the id. Feed the analyzer the open threads *with their ids* in its
   prompt so it can reference one exactly.
4. Keep a title-match fallback for one release so existing saves keep working, and write
   migration 17 to backfill ids onto existing threads.
5. Make both failure modes loud in dev: a `resolve_thread` that matches nothing should log
   through the diagnostics of Plan 11 rather than silently returning state.

**Tests** — `packages/core/test/memory/softStore.test.ts`,
`packages/core/test/memory/analyzer.test.ts`, `packages/core/test/store/` for the migration.

**Done when** a character can stop being cowardly, and a rephrased resolution closes its
thread.

---

## Plan 6 — Give No Stats mode a memory

**Closes:** M-2 (critical, commercial). **Effort: M.**

**Problem.** `context.ts:498–500` returns empty memory unless `statMode === "full"`, and raw
history is capped at 8 messages (`:503`). Per the V5 role matrix the analyzer and summarizer
are "Silent" in No Stats, so these stories never accumulate memory either. **This is the mode
a SillyTavern user tries first, and in it you are worse than SillyTavern.**

**Files** — `packages/core/src/orchestrator/context.ts:498–503`,
`packages/core/src/orchestrator/turn.ts` (background analyzer/summarizer dispatch),
`packages/core/src/router/roles.ts`, `packages/ui/src/app/App.tsx:239` (journal tab)

**Steps**
1. Decide the product rule explicitly and write it into `CONTEXT.md`: **No Stats means no
   *mechanics*. It does not mean no *memory*.** The current behaviour conflates the two.
2. Failing test: run a No Stats turn, assert soft slices and chapter summaries appear in the
   assembled prompt.
3. Enable the analyzer and summarizer in No Stats. They only ever write soft state
   (`softState.ts` closed union), so no mechanical invariant is at risk — the wall holds by
   construction.
4. Include soft slices, chapters and arc in the No Stats memory block. Keep the *ruling* and
   *hard snapshot* blocks excluded, which is what actually makes the mode statless.
5. Raise the raw-history window from the hard-coded 8 (`:503`) to a setting, defaulting higher
   in No Stats where there is no ruling block competing for budget.
6. Model-role consequence: No Stats now needs an analyzer model configured. Handle it
   gracefully — if none is set, fall back to the narrator model and say so in Settings rather
   than silently degrading.
7. Unhide the Journal tab in No Stats (`App.tsx:239`) or make it show narrative events only.

**Tests** — `packages/core/test/orchestrator/turn.test.ts`,
`packages/core/test/orchestrator/history.test.ts`, `packages/ui/test/app/App.test.tsx`.

**Done when** a No Stats story remembers a fact from 40 turns ago.

---

## Plan 7 — Provocation ≠ opposed, and reactions that fit the character

**Closes:** D-1, D-2 (both critical, file 06). **Effort: M.**

**Problem.** `isProvocation` (`npcAgency.ts:77–90`) returns true for `action.opposed === true`
alone, so a failed *persuade* or *out-stare* counts as an attack. `chooseCounterAction`
(`:107–127`) then returns the **first** gate-legal harmful combat action in catalog order,
with no disposition, relationship or goal input — so every NPC retaliates identically and
behaviour depends on array order.

**Files** — `packages/core/src/orchestrator/npcAgency.ts`,
`packages/core/src/orchestrator/npcIntroduction.ts` (already owns the disposition fact, `:21`,
`:288–301`), `packages/core/src/types/actions.ts`

**Steps**
1. Failing tests, three of them: (a) a failed opposed *social* action against a neutral NPC
   produces **no** counter-attack; (b) a genuine attack still does; (c) two NPCs with different
   dispositions produce different responses to the same provocation. Observe RED on all three.
2. **Split the concept in two.** Replace `isProvocation` with:
   - `isHostileAct` — `category === "combat"`, or the action deals target harm, or the
     committed ruling dealt harm, or stakes are `danger`. **Remove bare `opposed` and bare
     `stakes === "opposed"` from this predicate.**
   - `isOpposedContest` — `opposed === true` without harm. This should produce a *response*,
     not an attack.
3. Thread the engine-owned disposition into `chooseCounterAction`. Change its signature to
   accept the NPC's disposition and its relationship to the actor. **The data already exists**
   — `npcIntroduction.ts:21` defines an "Engine-owned disposition fact"; the reaction path
   simply never reads it.
4. Replace first-match-wins with a small **preference order** by disposition:
   - *hostile* → harmful combat action (today's behaviour)
   - *wary / neutral* → a defensive, withdrawing, or opposed non-harmful action; attack only
     if actually harmed
   - *friendly / allied* → a social or protective action; do not attack on a non-harmful
     provocation at all
   Every candidate still passes `checkGate`, and the engine still resolves it. **No
   prose-derived mechanics** — this only changes *which sealed action is proposed*.
5. If no gate-legal non-harmful response exists, emit **nothing** rather than falling through
   to an attack. Silence is correct; a manufactured punch is not.
6. Keep `DEFAULT_NPC_ENCOUNTER_BUDGET = 1` and every existing presence/alive guard.

**Tests** — `packages/core/test/orchestrator/npcAgency.test.ts` (extend heavily),
`packages/core/test/orchestrator/turn.test.ts` end-to-end via `submitTurn`.

**Done when** losing a staring contest with a friendly NPC does not get you punched, and two
differently-disposed NPCs answer the same act differently.

**Note.** This is a targeted fix to one file. Plan 19 is the structural cure; this is worth
doing first because it removes a user-visible absurdity in days rather than months.

---

## Plan 8 — Close the URL-import SSRF

**Closes:** W-3 (critical security, file 07). **Effort: S. Do before any public release.**

**Problem.** `importer/urlImport.ts:64–87` fetches a user-supplied URL with
`redirect: "follow"`, no scheme allow-list, no private-IP block, and no timeout. On a desktop
app this is a LAN/loopback probe vector via a shared card link — and sharing card links is the
normal workflow for this audience.

**Files** — `packages/core/src/importer/urlImport.ts`, plus a new
`packages/core/src/importer/urlGuard.ts`

**Steps**
1. Failing tests: assert rejection of `file://`, `http://127.0.0.1/x`,
   `http://192.168.1.1/x`, `http://169.254.169.254/x`, and a public URL that redirects to
   loopback. Observe RED — all currently pass through.
2. Create `urlGuard.ts` exporting `assertSafeCardUrl(url: string)`:
   - allow **`https:` only** (permit `http:` solely behind an explicit developer flag)
   - reject literal-IP hosts in loopback, private (`10/8`, `172.16/12`, `192.168/16`),
     link-local (`169.254/16`), CGNAT (`100.64/10`), multicast and reserved ranges, and the
     IPv6 equivalents (`::1`, `fc00::/7`, `fe80::/10`)
   - reject `localhost` and `*.local`
3. Change the fetch to `redirect: "manual"`, cap at **3 hops**, and re-run
   `assertSafeCardUrl` on every `Location` before following. This is the step that stops the
   public-URL-redirects-to-localhost bypass; an allow-list without it is not a fix.
4. Add a **15-second timeout** via `AbortSignal.timeout(15_000)`, combined with any
   caller-supplied signal. Keep the existing 10 MB streamed cap — it is well built.
5. **Bridge parity matters here.** DNS resolution is unavailable in the webview. Do hostname
   and literal-IP validation in shared code so both paths get it; if you later add
   resolve-then-check to defeat DNS rebinding, put it in the Tauri/native path and keep the
   browser path on string validation. Do not import `node:` modules into the shared path.
6. Surface a clear user-facing error: *"That link points to a private or local address and was
   blocked."*

**Tests** — new `packages/core/test/importer/urlGuard.test.ts`, extend
`packages/core/test/importer/`.

**Done when** every case in step 1 is rejected and normal `https://` card imports still work.

---

## Plan 9 — Prose regeneration keeps the ruling immutable

**Closes:** the authority-vs-undo contradiction (file 06 §6, file 10 §2). **Effort: M.**
**This is a product decision first — confirm the intent before implementing.**

**Problem.** Swipe/variant regeneration, delete and rewind all exist. A player can reroll
until the narrator writes the outcome they wanted, which makes the deterministic engine
cosmetic. Consequence is only real when it cannot be shopped for.

**Files** — `packages/core/src/orchestrator/history.ts`,
`packages/core/src/orchestrator/turn.ts`, `packages/core/src/orchestrator/checkpoint.ts`,
`packages/ui/src/screens/Play.tsx`, `packages/ui/src/components/MessageActions.tsx`

**Steps**
1. Confirm the product rule with the owner. Recommended: **regenerating prose re-narrates the
   *same committed ruling*. Same dice, same outcome, new words.**
2. Failing test: regenerate a variant, assert the ruling id, dice and committed effects are
   byte-identical across variants and that hard state is unchanged.
3. Split the regeneration path in two: *re-narrate* (reuses the stored ruling; does **not**
   re-classify, re-roll, or re-commit) and *rewind* (discards the turn entirely via the
   existing checkpoint machinery). Today's swipe conflates them.
4. In the UI, label them distinctly — "Rewrite this scene" vs "Undo this turn" — so the player
   understands the difference. This is most of the value of the plan.
5. Log every rewind to the Mechanical Journal so the record stays honest.
6. Optional: an **Ironman** toggle at story creation that disables rewind entirely.

**Tests** — `packages/core/test/orchestrator/history.test.ts`,
`packages/ui/test/components/MessageActions.test.tsx`.

**Done when** rerolling prose can never change a die.

---

## Plan 10 — ~~Turn-based combat~~ WITHDRAWN → replaced by Plan 10B (image generation, future)

> **Revision 2026-08-02 (clarification 2 + 3): this plan is withdrawn. Do not build it.**
>
> Clarification 2: *"The banner saga model turn based combat and animation was never in my
> plans."* Plan 10 closed W-2, and W-2 has itself been withdrawn in
> [07](07-misguided-implementations.md) — it scored the absence of a **non-goal** as a critical
> defect. With the premise gone, the plan has nothing to close.
>
> Provenance note, because the owner suspected agent insertion: we checked, and **the app's own
> plan/design docs never contained a turn-based combat spec.** `banner saga`, `turn-based`,
> `turn order`, `tactics` and `battle system` all return **0 hits** across tracked `*.md` outside
> `Audit/`. The three `initiative` hits are all *deferrals* the owner's own repo already wrote
> (`Plan/competitive-adoptions.md:706`, `README.md:277`, `Plan/attribute-integration.md:204`),
> dated 2026-07-23 — not today. This XL plan existed **only inside the audit**, generated from
> turn 1's own prompt wording. Nothing in the product needs unwinding. Full evidence:
> `.agents/…/nodes/04-clarify-revise/artifacts/combat-provenance-forensics.md`.
>
> The recommendation on whether to build it anyway is answered directly in
> [10 §9](10-other-feedback.md) — **no**. The original plan text is kept below, struck through,
> for traceability only.

---

## Plan 10B — User-selectable image-generation provider + model (**FUTURE / roadmap**)

> **Revision 2026-08-02 (clarification 3):** this is the roadmap item that actually belongs
> here, in the owner's words: *"give an option to select provider and model for image gen for
> users, and based on their setting we will create images during story if its enabled. **That is
> a future plan.**"*

**Status: FUTURE. Not current scope. Do not schedule this against the Internal Beta exit.**
It is recorded so the roadmap reflects the owner's real intent, not so it gets built now.
Everything in §3's sequencing that previously pointed at Plan 10 should point at nothing —
the slot is deliberately empty in the near term.

**Why it fits this product where combat did not.** Images are *generated from the narration the
engine already produces*, so the feature rides the existing loop instead of competing with it
for player minutes. It also does not touch hard state: an image is a rendering of a turn, never
an input to adjudication. That keeps it outside the drift and authority surfaces entirely —
the opposite of a combat layer, which would have multiplied both (see [10 §9](10-other-feedback.md)).

**Shape, when its time comes** (sketch, not a commitment — deliberately not decomposed into
steps, because per clarification 3 this is not the next thing to build):

- **A user setting, provider-agnostic by construction.** Provider + model are user-chosen, so
  the app must not hard-code one vendor's request shape. The existing model-provider
  configuration is the precedent to copy — same pattern, second axis.
- **Off by default, explicit opt-in.** "based on their setting we will create images … if its
  enabled" — so absent a key and an explicit toggle, the product behaves exactly as today.
- **Bring-your-own-key, local-first.** Consistent with the product's local-first posture; keys
  belong in the same store as existing provider credentials and must never be written into
  save state, turn records, or logs.
- **Asynchronous and non-blocking.** Image latency must never gate a turn. A turn completes on
  prose; the image arrives after, or fails silently, and the turn is unaffected.
- **Scene-prompt derivation is the real design work**, not the API call. What gets sent —
  which entities, which continuity anchors (a character who has been described once must not be
  re-invented per image) — is where this feature will either feel coherent or feel random. That
  is a memory/continuity problem, which is this product's actual strength. Worth noting the
  same drift risk applies to visuals as to prose.
- **Cost and content controls** belong in the same setting surface: per-session cap, and an
  awareness that a user-supplied provider may return content the owner never chose.

**Open question for the owner (unverified, needs a decision before this is planned):** are
images per-scene/location, per-character portrait, or per-turn illustration? The three have very
different prompt-continuity requirements and very different per-session costs. We did not assume
an answer.

---

### ~~Original Plan 10 (withdrawn — retained for traceability only)~~

~~**Closes:** W-2 (a stated pillar with no code, no design, no plan). **Effort: XL.**~~
~~**Read file 09 §9 before starting — this is the "go wide" bet.**~~

**Design first, and on paper.** Banner Saga prototyped its combat with chess pieces before any
code (file 04 §3.2). Do the same with the product owner. The maths to copy is subtraction, not
d20:

- **Strength = health AND damage.** Wounded units hit softer. Depletable, non-replenishable
  in battle.
- **Damage = `STR(attacker) − ARM(target)`.**
- **Armor** is a second, replenishable health bar. **Break** damages armor and its potency
  stays constant.
- **Floor rule:** when `ARM > STR`, deal 1, with
  `miss% = (ARM − STR) × 10`, `hit% = min(100, max(20, 100 − miss%))`.
- **Willpower** funds extra damage, extra movement, and abilities.
- **Do NOT copy side-alternating initiative** — it was a PvP mechanism that produced Banner
  Saga's most persistent complaint in single-player. Use a conventional per-unit initiative
  track; it is also far easier to narrate.

**Files (new)** — `packages/core/src/types/combat.ts`,
`packages/core/src/engine/combat/{initiative,resolution,statusEffects,index}.ts`,
`packages/core/src/orchestrator/encounter.ts`,
`packages/ui/src/screens/Encounter.tsx`, plus a route in `packages/ui/src/app/router.ts`
(there is currently **no** combat route) and a migration for encounter state.

**Steps**
1. Paper prototype with the owner until a 6-unit fight is fun on a spreadsheet.
2. `types/combat.ts` — units, initiative entry, encounter state, status effects. Encounter
   state is **hard state**: engine-owned, model-unwritable, same wall as everything else.
3. `engine/combat/` as pure functions, mirroring `gate.ts`/`resolver.ts` discipline. No I/O,
   fully unit-testable, deterministic given a seed.
4. Migration for encounter persistence; an encounter must survive a crash mid-fight exactly as
   a turn does today.
5. `orchestrator/encounter.ts` — enter/exit combat, per-round narration, and binding each
   round's mechanical result into the narrator prompt as ruling facts (reuse the existing
   authority-clause machinery unchanged).
6. UI: the encounter screen, initiative track, unit cards, target selection, and a
   round-summary artifact reusing the `RulingArtifact` register.
7. **Bind narrative to combat with one integer**, Banner-Saga style: a caravan/morale-like
   value moved by story choices that sets starting Willpower. This is what makes the two
   layers feel like one game (file 04 §3.4).

**Tests** — new `packages/core/test/engine/combat/`, a deterministic seeded full-encounter
test in the style of the existing `playthrough.test.ts`, and UI tests for the encounter screen.

**Done when** a 6-unit fight resolves deterministically, is narrated coherently, survives a
restart, and a story decision measurably changes how a later fight starts.

---

## Plan 11 — Local diagnostics panel

**Closes:** W-10. **Effort: M.**

**Problem.** `packages/core/src/observability/` is 21 lines. The metrics that define whether
the product works are all uncounted, and the 792 tests cover none of this path.

**Files** — `packages/core/src/observability/` (expand),
`packages/core/src/orchestrator/{turn,authorityGuard}.ts`,
`packages/core/src/classifier/classify.ts`, `packages/core/src/engine/gate.ts` (call sites
only), a new `packages/ui/src/screens/Diagnostics.tsx`

**Steps**
1. Define a counter set that maps directly to product promises:
   `gate.denied` (by code) · `authorityGuard.draftRejected` ·
   `authorityGuard.safeSummaryUsed` · `classifier.failed` / `.recovered` ·
   `provider.retried` / `.failed` · `turn.latency` by stage · `story.turnCount` at abandon.
2. Emit through a tiny local sink — in-memory plus an optional SQLite table. **Local-only and
   opt-in.** No network. This is a developer panel, not analytics; say so in the UI.
3. Instrument at existing seams only; do not thread a logger through pure functions like
   `checkGate` — record at the call site so the engine stays pure and testable.
4. Build a read-only Diagnostics screen showing counters and recent events, reachable from
   Settings.
5. Add an export button so a tester can attach the file to a bug report.

**Tests** — `packages/ui/test/observability/logger.test.ts` (extend), plus assertions that
counters move in `packages/core/test/orchestrator/turn.test.ts`.

**Done when** you can answer "how often did the DM say no in my last session?" from the app.

---

## Plan 12 — `Status:` line on every plan and design document

**Closes:** W-11. **Effort: XS. Highest value per minute in this audit.**

**Problem.** Nothing distinguishes a design from a shipped feature. `Plan/v2-memory-system.md:3`
does it correctly; nothing else does. In a workflow where AI agents read these documents as
ground truth, this is a correctness mechanism, not bureaucracy.

**Files** — every file under `Plan/`, `Design/`, `docs/superpowers/plans/`, plus `README.md`

**Steps**
1. Add a second line to each document, using exactly one of:
   `**Status:** SHIPPED (verified <commit>)` ·
   `**Status:** PARTIAL — <what landed>; <what did not>` ·
   `**Status:** PLAN — not implemented` ·
   `**Status:** SUPERSEDED by <doc>`
2. From this audit, the initial values are:
   - `Design/HANDOFF-V7-…` → PARTIAL (loadout, tiers, budget, journal, forge review shipped;
     see file 03 §6)
   - `docs/superpowers/plans/2026-08-02-npc-scene-system-redesign.md` → PLAN — not implemented
   - `docs/superpowers/plans/2026-08-01-live-combat-remediation.md` → SHIPPED (verified `e1e0d86`)
   - `Plan/v2-memory-system.md` → PLAN — not implemented *(already correct)*
   - `Design/HANDOFF-V5/V6` → SUPERSEDED in part by V7
3. Fix the README's test count: **792 (632 core, 160 UI)**, not 393.
4. Add a line to `AGENTS.md` / `CONTRIBUTING.md` requiring the `Status:` line on any new plan,
   and requiring it be updated in the same commit that lands the work.

**Done when** every plan and design document states whether it describes reality.

---

## Plan 13 — Wire the built-but-unreachable ruling variants

**Closes:** U-2 (critical, file 08). **Effort: S.** The renderer already exists.

**Problem.** `npc`, `stacked`, and `classifier-unavailable` are declared
(`RulingArtifact.tsx:64–69`) and fully implemented (`:114–119`, `:341`, `:356–364`), but
`rulingToArtifact()` (`Play.tsx:153–245`) can never emit them. So NPC actions have no visual
register — which is exactly the surface a player needs when D-1 fires and an NPC hits them for
no visible reason.

**Files** — `packages/ui/src/screens/Play.tsx:153–245`,
`packages/ui/src/components/RulingArtifact.tsx`

**Steps**
1. Failing UI test: given a ruling whose actor is an NPC, assert the artifact renders the
   `npc` variant.
2. In `rulingToArtifact()`, emit `npc` when the ruling's actor is not the player. The
   information is already on the ruling; nothing new is needed from core.
3. Emit `stacked` when a player ruling and an NPC reaction share a turn, so an exchange reads
   as one round rather than two disconnected cards.
4. Replace the `InlineNotice` classifier-failure path (`Play.tsx:1150–1163`, `:1552–1615`) with
   the `classifier-unavailable` variant, so all three refusal states share one register.
5. Add the NPC's **reason** to the artifact — with Plan 7 landed, that is a real, honest
   sentence ("you struck them"), not a guess.

**Tests** — `packages/ui/test/components/RulingArtifact.test.tsx`, plus a Play-screen test.

**Done when** every NPC action the engine commits is visibly attributed and explained.

---

## Plan 14 — Remove raw JSON from player-facing screens

**Closes:** U-6. **Effort: XS.**

**Problem.** Three leaks in front of a non-engineer audience: journal payloads
(`Journal.tsx:368`), dice rendered as `[14,7]` (`Journal.tsx:304`), and loot effects
(`Play.tsx:1385`).

**Files** — `packages/ui/src/screens/Journal.tsx:304`, `:368`;
`packages/ui/src/screens/Play.tsx:1385`

**Steps**
1. Dice: render as `14, 7` with the used die emphasised, reusing `DieBlock`'s existing
   presentation rather than inventing a second one.
2. Loot effects: format from the typed effect shape — "+2 damage", "requires Blade rank 2".
   A `formatEffect()` helper belongs next to the equipment types so core and UI agree.
3. Journal "Record": drop it from the default view. Keep the raw payload behind a "Developer
   details" disclosure that appears only when diagnostics (Plan 11) are enabled.

**Tests** — `packages/ui/test/screens/` for the Journal; snapshot the loot card.

**Done when** no `{` or `[` from a serialiser appears in normal play.

---

## Plan 15 — Surface Dossier and Loadout in the chrome

**Closes:** U-5. **Effort: S.**

**Problem.** 16 routes, 5 rail items, 5 sub-tabs. Six routes have no persistent entry —
including `dossier` (848 lines, **the screen that demonstrates the anti-drift promise**) and
`loadout` (the V7 centrepiece). The Journal is hidden entirely outside Full Stats.

**Files** — `packages/ui/src/app/App.tsx:38–53`, `:239`;
`packages/ui/src/app/router.ts:49`

**Steps**
1. Add **Characters → Dossier** and **Loadout** as story sub-tabs, or as a second row under
   Characters. Do not just deep-link them.
2. Unhide the Journal tab in No Stats (`App.tsx:239`) — pair with Plan 6, after which there is
   real content to show.
3. Leave `blueprint`, `rolematrix` and `designsystem` where they are; they are advanced or
   developer surfaces and hiding them is correct.
4. Check the tab bar still works at narrow widths before adding items.

**Tests** — `packages/ui/test/app/App.test.tsx`.

**Done when** a new player can reach the dossier without knowing it exists.

---

## Plan 16 — Use the real chapter number

**Closes:** U-7. **Effort: S.**

**Problem.** `App.tsx:273–277` computes the header's `CH n` as
`Math.floor(messageCount / 20) + 1`. The code's own comment admits it is a placeholder. A
fabricated number in the persistent header of a product selling *"the numbers you see are
real"* is a bad thing to ship, and an easy thing for a reviewer to find.

**Files** — `packages/ui/src/app/App.tsx:273–277`,
`packages/ui/src/bridge/core.ts`, `packages/core/src/store/repositories/chapters.ts`

**Steps**
1. Failing test: with three persisted chapters, assert the header shows `CH 3`.
2. Expose the current chapter through the bridge (the repository already has the data).
3. Render the real value; when no chapter has been summarised yet, show **"Chapter in
   progress"** rather than inventing a number.
4. Delete `chapterLabelFor` and its comment.

**Tests** — `packages/ui/test/app/App.test.tsx`, `packages/ui/test/bridge/`.

**Done when** the header number comes from the engine or is honestly absent.

---

## Plan 17 — The ruling-fidelity and composer cluster

**Closes:** U-8, U-9, U-10, U-11, U-12. **Effort: M.** Five small related fixes; do together.

**Files** — `packages/ui/src/screens/Play.tsx` (`:157–161`, `:213–216`, `:808–811`, `:1229`,
`:1727`), `packages/ui/src/components/RulingArtifact.tsx` (`:54`, `:114`, `:156`),
`packages/ui/src/screens/Journal.tsx:250`

**Steps**
1. **U-8 — render what is already computed.** `opposed.reasons`, `opposed.dice`,
   `opposed.usedIndex` and `opposed.rollMode` are populated at `Play.tsx:213–216`, declared at
   `RulingArtifact.tsx:54`, and never read. Show the defender's dice beside the attacker's and
   list the advantage/disadvantage reasons. **The engine already did the work of being
   transparent; the UI just declines to show it.**
2. **U-8b — colour opposed contests by outcome.** `accentFor` returns `var(--teal)` for
   `opposed` regardless of who won (`RulingArtifact.tsx:114`).
3. **U-9 — live action-budget counter.** Replace the static "Up to N actions this turn"
   (`Play.tsx:1727`) with a counter that updates as the player writes, so overflow is visible
   *before* submitting rather than discovered afterwards.
4. **U-10 — stop classifying rulings by regex.** `Play.tsx:157–161` matches
   `/action budget|actions per turn|overflow/i` against prose. The gate already returns a
   structured `code` (`engine/gate.ts`) — switch to it, and thread the code through the bridge
   if it is not already exposed. Rewording a message must never silently downgrade the UI.
5. **U-11 — a provider timeout is not a denial.** Move `classifier_recovery` out of the
   "denied" filter (`Journal.tsx:250`) into its own "interrupted" category. Filing
   infrastructure failure as a world refusal corrupts the exact distinction the product
   exists to establish.
6. **U-12 — delete the 12-character minimum** (`Play.tsx:808–811`). "Run." is a valid action.
   The engine is the only thing entitled to judge an action, and it fires after this check.

**Tests** — `packages/ui/test/components/RulingArtifact.test.tsx`, Play-screen tests,
Journal filter test.

**Done when** an opposed contest shows both sides' dice and reasons, and no UI decision
depends on parsing English.

---

## Plan 18 — First-run onboarding

**Closes:** U-4. **Effort: L.**

**Problem.** No tutorial, primer, or first-run explanation exists anywhere
(searched: the only `onboard`-ish hit is the provider-config screen). The product asks players
to understand two stat modes, action budgets, gates, DCs, advantage, mastery ranks, seven
slots, five tiers, chapters and arcs — and explains none of it. Banner Saga's most persistent
criticism was "under-explained mechanics," and it had a visible tactical UI.

**Files (new)** — `packages/ui/src/screens/FirstRun.tsx`,
`packages/ui/src/components/CoachMark.tsx`; plus `App.tsx` for the gate and
`store/repositories/settings.ts` for the completion flag

**Steps**
1. **Design the first five minutes explicitly** — it is the highest-risk part of the funnel,
   because BYO-key is a documented adoption barrier (file 04 §4.5).
2. Ship a **guided first story**: a small bundled premise where the third or fourth turn is
   *engineered to be denied*. The denial artifact is your product in one screen — make sure
   every new player sees one within five minutes. This is the conversion event.
3. Coach marks, once each, on: the ruling artifact, the action budget, the dossier, and the
   journal.
4. Make the key setup unmissable but recoverable — validate inline, deep-link to signup, and
   run a real test generation so the first experience is a success (this is already the stated
   plan in `high-level-plan.md:155`; make sure it is what actually ships).
5. Persist a `hasCompletedFirstRun` flag; offer "replay the tour" in Settings.
6. Expect to iterate. The category's own founders say *"we redid our tutorial many times and
   it's still not right."*

**Tests** — `packages/ui/test/screens/` for the first-run gate and the completion flag.

**Done when** a player who has never seen the product understands, unprompted, that the game
can refuse them and why.

---

## Plan 19 — Land the NPC scene/actor model

**Closes:** D-3, W-6. **Effort: XL.** The plan is already written and accepted; it is
unstarted.

**Problem.** Eight subsystems hold private opinions about who is in the scene —
*"registrar, regex promotion, classifier, reaction heuristic, NPC planner, narrator, analyzer,
and suggestion tokenizer do not share one actor/scene/event model."* Invariants 6–10 do not
hold. Every past fix here was a point-patch to one subsystem's heuristic.

**Files** — exactly as specified in
`docs/superpowers/plans/2026-08-02-npc-scene-system-redesign.md`: new `types/scene.ts`,
`orchestrator/sceneReconciler.ts`, `orchestrator/narrativeBeatPlan.ts`,
`orchestrator/npcCapabilityProvisioner.ts`, `store/repositories/characterAliases.ts`, the
`orchestrator/turn/` phase split, and **migration 17** (the ladder currently stops at 16).

**Steps** — follow that document's Tasks 1–10 in order. Additions from this audit:
1. **Do Plan 7 first.** It removes the user-visible absurdity in days; this removes the cause
   in months. They do not conflict — Plan 7's split predicates become inputs to the event
   model.
2. **Sequence migration 17 with Plan 5's thread ids** so there is one migration, not two.
3. When splitting `turn.ts`, **delete `submitTurnLegacy`** (`:399`) rather than carrying it
   into the new structure. Two live paths for one behaviour is how fixes get applied to one
   and not the other.
4. Wire the new event model into the **suggestion builder** at the same time — Plan 22 depends
   on it and the plan already names the tokenizer as one of the eight offenders.

**Done when** invariants 6–10 hold with passing tests, and `CONTEXT.md` is updated to say so.

---

## Plan 20 — Port the v2 memory system

**Closes:** M-4, M-9, M-10, M-11. **Effort: XL.** Plan written, 0% built.

**Problem.** No narrative-fact store, no consolidation, no semantic retrieval, no drift
detection. All five named modules are absent from disk.

**Files** — as specified in `Plan/v2-memory-system.md`: `memory/facts.ts`,
`memory/embeddings.ts`, `memory/consolidator.ts`, `memory/retrieval.ts`, `memory/drift.ts`,
plus a migration for vectors and facts.

**Steps** — follow that plan. Its governing rule is correct and non-negotiable: *"Everything
ported is soft state. None of it can ever write, imply, or reconstruct hard state."* Additions
from this audit:
1. **Do Plans 1–5 first.** They are days of work and they fix retrieval of memory that already
   exists. This plan is months and adds new memory. **Wiring what exists comes first** —
   otherwise you build semantic retrieval over a store the narrator still cannot see.
2. Sequence M-9 (consolidation replacing the FIFO cap) early in this plan, because Plan 1
   promotes it from medium to high.
3. Keep embeddings in-process via `transformers.js` and honour the webview constraint: no
   `node:` imports on the shared path. Core currently has exactly one (`util/uuid.ts`); keep
   it that way.
4. Drift detection lands **last**. Policing consistency is meaningless until the model can see
   the memory it is supposed to be consistent with.

**Done when** a fact established in chapter one is retrievable and demonstrably influences a
turn in chapter nine.

---

## Plan 21 — Decompose `validateStorySchema`

**Closes:** W-5. **Effort: M.**

**Problem.** Cyclomatic 65, cognitive 153, 224 lines (`bootstrap/validate.ts:130`) — the worst
function in the codebase on every axis, worse than `runTurnOperation`. **No plan mentions
it.** It decides whether a freshly generated story is playable, so its failure mode is "story
creation mysteriously fails or repairs forever" — on the first-run path.

**Files** — `packages/core/src/bootstrap/validate.ts`, `packages/core/src/bootstrap/repair.ts`

**Steps**
1. **Characterisation tests first.** Before changing anything, capture current behaviour
   across valid schemas, each individual invalid case, and the repair loop. This function has
   no safe intuition; the tests are the specification.
2. Split into one validator per concern — attributes, skills, actions, items, tiers, starting
   state, cross-references — each a pure function returning a typed list of violations.
3. Make `validateStorySchema` a thin composition over those validators.
4. Give every violation a **stable machine code** plus human text, so `repair.ts` can target a
   specific failure instead of re-sending prose feedback.
5. Cap and instrument the repair loop (via Plan 11) so "repairs forever" becomes a visible,
   countable event rather than a hang.

**Tests** — `packages/core/test/bootstrap/` (extend substantially).

**Done when** each validator is independently tested and no function in `bootstrap/` exceeds
cognitive complexity ~40.

---

## Plan 22 — Replace the reversed-word-bag suggestion builder

**Closes:** W-1 (critical, file 07). **Effort: M.**

**Problem.** `buildSceneAnchors` (`context.ts:276–295`) takes the last narrator paragraph,
keeps words of 4+ characters that are not stop-words, **reverses the word order**, and calls
them scene anchors. That is why the game suggests "describe" and "slowly." The suggestion
chips are the most visible claim the product makes that *the engine understands your scene* —
and they are a bag of words in reverse.

**Files** — `packages/core/src/orchestrator/context.ts:276–295`,
`packages/core/src/orchestrator/suggestions.ts`, `packages/ui/src/components/ActionSuggestions.tsx`

**Steps**
1. Failing test: in a scene with a present hostile NPC and a locked door, assert the
   suggestions are catalog actions legal against present targets — and that no suggestion is
   an adverb from the prose.
2. **Delete the text processing.** Enumerate the frozen catalog, run `checkGate` for each
   action against the player's current hard state, and keep the ones that pass. This is a pure
   function over data the engine already owns and it is *cheaper* than the string work it
   replaces.
3. Pair legal actions with present targets from the registry (post-Plan 19, from the shared
   scene model).
4. Rank by relevance — recent target focus (`orchestrator/targetFocus.ts` already exists),
   action category matching scene stakes, novelty — and slice to the existing 5–6.
5. Keep the current UI behaviour, which is already correct: insert-only, never auto-send,
   editable after insert (`ActionSuggestions.tsx:52–58`).

**Tests** — `packages/core/test/orchestrator/suggestions.test.ts` (exists), plus a UI test.

**Done when** every suggestion is an action the player can legally take right now.

---

## Plan 23 — Art direction and a portrait pipeline

**Closes:** U-3, U-13. **Effort: XL.** Strategy before production.

**Problem.** Zero image files in `packages/ui`. Against "Banner Saga-style animation" the gap
is total. Meanwhile Isekai Zero ships scene art, voice narration and animated expressions.

**Reality check first** (file 04 §3.6): Banner Saga's look was a hand-drawn frame-by-frame
pipeline with rotoscoped reference, a dedicated lead artist and an outsourced animation
studio, funded by $723,886. **It is a labour budget, not a setting.** But its *style* is
mostly composition rules, and Banner Saga's own conversation scenes are largely static.

**Steps**
1. **Codify the rules before commissioning anything.** Limited palette with a near-black
   anchor; long shadows at a consistent low sun angle; flat graphic shapes; heavy negative
   space; silhouette-first character design. Most of this is CSS and can be applied to the
   existing token layer this week, for free.
2. **Then** the cheapest high-impact asset: **static character portraits**. The dossier,
   character roster, and party strip all currently render two-letter initials.
3. Add a two-or-three-frame idle only after portraits exist. This is where most of the
   perceived "animation" comes from at a fraction of the cost.
4. Define an asset pipeline (sprite sheets from a 2D tool remains the correct technical
   approach) and — importantly — **let imported character cards supply portraits.** V2/V3
   cards are PNGs; you are already parsing them. **This gives you an art pipeline you do not
   have to fund**, and it should probably come before commissioning anything.
5. Scene/background plates last. They are the most expensive and the least load-bearing.

**Done when** the product looks like a game in a screenshot.

---

## Plan 24 — ~~Archive old prototypes~~ ✅ **DONE BY THE OWNER**; clean the injected journal tail

> **Revision 2026-08-02 (clarification 5):** *"Yeah i was the one archived all old handoff
> files."* Step 1 — the archiving — **is already done, by the owner, deliberately.** Commit
> `3566c25 "archived old designs to prevent bloat"` removed 190 files / 52,238 lines from
> `Design/handoff*` and added `handoff-archive.rar` (1,217,948 B). W-8 is therefore **closed by
> owner action**, not open.
>
> This also **retires turn 1's closing question, "who deleted 189 files?"** — answered: the
> owner did, on purpose, and it was the right call. Turn 1 recommending it (W-8 / this plan) and
> the owner having already done it is convergence, not a gap. Any place the original audit read
> the missing handoffs as an anomaly, a risk, or a process failure was **wrong**, and is
> corrected here and in [02 §1](02-codebase-map.md).
>
> **What remains open is only W-9** — the malformed journal tail — so the effort drops from S to
> XS and steps 1-2 are struck through below. Steps 3-5 still stand.

**Closes:** ~~W-8,~~ W-9. **Effort:** ~~S~~ → **XS** (archiving already done by the owner).

**Problem.** ~~Seven generations of `Design/handoff*` produce ~800 near-duplicate nodes in the
code index — outweighing the real UI package (602) — so every code search, human or agent,
lands in dead prototypes. Separately, a mangled agent journal left prompt-injection-shaped
text inside the repo.

**Steps**
1. Move `handoff` … `handoff-v5` to `Design/archive/` and exclude that path from the code
   index and from search tooling. Keep V6 and V7 live.
2. Note in `Design/README.md` that the archive is historical and must not be treated as a
   specification.
3. Truncate or fence the malformed tail of
   `.agents/agentic-skills-router agent/run-20260802-audit-midnight-tavern/JOURNAL.md`.
   **Almost certainly an accident, not an attack** — but it is text shaped like an instruction
   sitting in a repo that AI agents read.
4. Adopt one-file-per-step logging for agent work rather than appending to a shared journal.
   The corruption happened *because* of the shared-append pattern.
5. Add a line to `AGENTS.md` recording both rules.

**Done when** a code search for a component name returns only real code.

---

## 3. What this adds up to

**Sprint 1 is roughly a week** and it closes: the biggest memory defect (M-1), the SSRF
(W-3), and the five most visible UI credibility problems. After it you can honestly demo the
product and start the go-to-market in file 09.

**Sprint 2 is one to two weeks** and it makes the DM behave like a character rather than a
trigger — which is the difference between "the engine attacked me for no reason" and "that
NPC responded the way that NPC would."

**Sprints 3 and 4 are the real roadmap**, and the file 09 §9 narrow-vs-wide decision should
be made before starting Sprint 4. Plans 19, 20, 10 and 23 are each a quarter of work; you
cannot do all four at once, and attempting to is how the current situation — four open
designs, two at 0% — came about.

**If you only do three things:** Plan 1, Plan 12, and the Sprint 1 UI cluster
(13/14/15/16). Days of work, and they move the product from "claims a thing it cannot
demonstrate" to "demonstrates the thing it claims."

---

## Plan 25 — Harvest Memory-Keeper: port five proven techniques

**Added 2026-08-02 (owner clarification 4), after auditing the parent repo directly.
Full analysis: [12 — Memory-Keeper audit](12-memory-keeper-audit.md).**

**Why this plan is cheap.** Every item below is code the owner already wrote, in a repo
whose suite passes (`105 passed, 5 skipped`, verified 2026-08-02). This is porting proven
work, not inventing it. Source paths are in `C:\Users\anuji\Documents\Memory-Keeper\Memory-Keeper`.

### 25.1 Relationship exponential smoothing — **do this first**

**Effort: small (≈30 lines + tests). Value: high. Prevents a bug class rather than fixing one.**

Source: `api/pipeline.py:257-309` (`_merge_relationship`).

Numeric relationship dimensions are blended, never overwritten:
`new = (1 - alpha) * old + alpha * observed`, alpha default `0.3`, clamped to `[-1, 1]`
(`pipeline.py:280-282`). An audit line is appended to history only when the label changed
or a dimension moved ≥ 0.05 (`pipeline.py:298-309`).

**The point:** "a single noisy extraction cannot flip an established relationship"
(`pipeline.py:260-262`). One sarcastic line must not convert a long friendship into hostility.

**Steps**
1. **Check first whether Midnight Tavern already overwrites.** Locate where relationship
   or disposition values are updated after a turn. If assignment is direct, this plan is a
   pre-emptive bug fix; if smoothing already exists, close this item.
2. Add a smoothing helper with a configurable alpha, defaulting to `0.3`.
3. Clamp to the domain's valid range.
4. Append an audit-history line only on meaningful movement, so history stays readable.
5. **Tests:** ten identical hostile observations must move an established trusting
   relationship gradually, not instantly; one outlier observation must not flip the label;
   values must never escape the valid range.

### 25.2 Narrator voice as tracked state

**Effort: medium. Value: high. Catches a drift class nothing else in the audit covers.**

Source: `store/models.py:122` (`NarratorState`), `analyzer/narrator_drift_detector.py`,
`analyzer/prompts/narrator_drift_detection.md`.

Track **tense, perspective, description density, pacing, tone** as durable state and diff
it turn over turn. This is the drift a reader *feels* before they can name it — the story
sliding from past to present tense, or from tight third person to chatty omniscience.
Midnight Tavern's invariant work covers facts and entities; prose *voice* is a different axis.

**Steps**
1. Add a narrator-voice record per story: the five dimensions above.
2. Extract them from narrator output on each turn.
3. Compare against the **pre-turn** snapshot (see 25.3 — this is where the race lives).
4. Log a drift entry on divergence, with dimension, previous value, current value, severity.
5. Surface it in the existing drift/ruling UI rather than inventing new surface.
6. **Tests:** a tense flip and a perspective flip must each be detected; steady prose must
   produce no drift entries.

### 25.3 Audit for the pre-capture race

**Effort: small (an audit, possibly zero code). Value: medium-high. Prevents silent wrongness.**

Source: `pipeline.py:133-146`, and Memory-Keeper commit `e370d55`
("Fix narrator drift race condition").

The bug shape: concurrent tasks read-then-write shared state, so a comparison task reads a
value another task has already overwritten and reports no change. The fix is to **capture
the baseline before launching the concurrent batch** and pass it in explicitly.

**Steps**
1. Find every place Midnight Tavern runs concurrent work that reads-then-writes shared state.
2. For each, ask: could a peer task overwrite the value this one compares against?
3. Where yes, capture the baseline before the batch and thread it through as a parameter.
4. **Tests:** a deliberately interleaved pair of updates must still produce the correct diff.

### 25.4 Confidence-gated fact admission

**Effort: small. Value: medium.**

Source: `pipeline.py:187` — a fact is stored only if
`confidence >= analyzer_config.fact_confidence_threshold`.

Cheap gate stopping low-confidence extractions from being canonised as world facts. Pairs
directly with the identity/coreference problem below.

### 25.5 Interval auto-snapshots with a retention cap

**Effort: medium. Value: medium.**

Source: `pipeline.py:499-544`. Every N messages, serialise the session (characters, facts,
relationships, events, arcs, drift logs), then delete the oldest beyond
`max_snapshots_per_session`. Rollback without unbounded growth. Cross-reference the undo
discussion in [06](06-gap-analysis-dm-authority.md).

### 25.6 Two defects to inherit *deliberately* — do not copy these

1. **Silent write-loss (MK-1, HIGH).** Memory-Keeper degrades every extraction failure to
   `logger.warning` (`pipeline.py:200, 255, 359, 375, 402, 458`) with `return_exceptions=True`
   on the gather (`pipeline.py:176`). Memory can stop being written while the app looks
   healthy. **Audit Midnight Tavern for the same pattern — it is strictly more dangerous
   there, because Midnight Tavern's state is authoritative and the story is supposed to be
   unable to contradict it.** Add a per-story failure counter and surface it.
2. **Unbounded auto-creation of characters (MK-4).** Any name the extractor invents becomes
   a permanent cast member (`pipeline.py:71-78, 225-233`). Midnight Tavern has fought this
   twice already — commits `bd4f99d` ("reconcile narrated villager identities") and `a56fe49`
   ("close Cyraeth coreference repair"). **Two codebases hitting the same bug independently
   is the signal to build a named identity/coreference subsystem instead of a third one-off
   repair.**

### Sequencing

25.1 → 25.3 → 25.4 are days of work and mostly defensive. 25.2 and 25.5 are the larger
items. 25.6 is an audit that should happen alongside Plan 1, because a memory pipeline that
silently stops writing would invalidate Plan 1's entire benefit.

---

*Back to [README](README.md)*

