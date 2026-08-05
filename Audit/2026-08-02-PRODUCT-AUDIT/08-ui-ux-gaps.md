# 08 — UI/UX Gaps: what the interface fails to convey about the core value

**Method.** A dedicated UI reviewer read the shipped React app route by route against the V7
design spec. Every claim below carries a `file:line` citation and was verified in source, not
inferred from screenshots.

---

> **Revision 2026-08-02 (turn 2).** Two findings here were scored against a pillar the owner
> never had. **U-3 (no art)** was rated *critical / very large effort* against Banner Saga-style
> hand animation; that was never planned, so it is re-scored **high / medium** and repointed at the
> owner's real roadmap item, **user-selectable image generation** — which turns out to be recorded
> nowhere in the repo. **U-13 (motion)** drops from *very large* effort for the same reason.
> Nothing else in this file changes: U-1, U-2 and U-4…U-12 are independent of the combat/animation
> question and all stand as written.

## What this means (read this first)

The UI is in much better shape than I expected, and I want to open with that because the
critique that follows is specific rather than sweeping.

**The Ruling artifact is the best-executed part of the entire product.** When the DM denies
you, the app renders a genuine verdict — a distinct visual register, a rotated stamp, no die
at all (because a denial never rolled), and a plain-English statement that no cost, XP, loot
or consequence occurred. It is placed *above* the prose by construction, not by styling. That
is the product thesis, correctly rendered. Very few teams get this right.

The problems are four:

1. **The memory the app shows you is not the memory the AI gets.** The dossier renders every
   observation beautifully (`CharacterDossier.tsx:506`). The narrator never sees one of them
   (file 05, M-1). **The UI is currently advertising a capability the engine does not
   deliver** — which means the screen most likely to sell the product is also the one most
   likely to be caught lying.
2. **Half the ruling vocabulary is built but never used.** Three declared ruling variants —
   including the one that labels an NPC's action as an NPC's action — are fully implemented in
   the renderer and can never be produced.
3. **There is no art. At all.** Zero image files in the entire UI package. ~~Against "Banner
   Saga-style animation," the gap is total, not partial.~~ **Rescoped (turn 2): the gap is real
   but it is not a missing pillar** — Banner Saga-style animation was never planned. It is a
   *presentation* gap against Isekai Zero, which ships scene art, voice and animated
   expressions, and the owner's actual answer to it is **user-selectable image generation**,
   which is currently written down nowhere. See U-3.
4. **Nothing teaches the player the system.** There is no onboarding, tutorial, or first-run
   explanation anywhere — and the category's own founders report that teaching a novel system
   is the hardest unsolved problem they have.

The connecting thread comes from the competitive research (file 04 §4.3): the category's
success factor is **player expression**, and a refusing engine reduces expression. **The only
way that trade wins is if the refusal is legible and feels earned.** That makes UI work not
cosmetic here — it is the mechanism by which your core differentiator becomes a feature
rather than a frustration.

---

## 1. What is genuinely well done

Said plainly, with citations, because it is substantial.

### 1.1 The Ruling artifact — the thesis, rendered

- **A verdict, not a chat bubble.** Mono-only SYSTEM register, accent left border, rotated
  stamp, and a 900ms staged reveal (die → math → count-up → stamp) with a reduced-motion
  collapse. `components/RulingArtifact.tsx:1–17`, `:125–128`, `:249–270`.
- **Denial is architecturally distinct from failure.** The denied branch renders **no die at
  all** (`RulingArtifact.tsx:318–355`), is coloured `--dead` rather than `--failure`
  (`:113`), and spells out the consequence: *"No roll, cost, XP, loot, equipment change, or
  mechanical consequence."* (`screens/Play.tsx:170`). **That is "the world said no,"
  correctly distinguished from "you tried and failed."** This is the single most important
  distinction in the product and the UI nails it.
- **Rulings precede prose by construction.** `buildStream()` pushes attached rulings, then
  the message (`Play.tsx:308–323`). Structural ordering, not CSS.
- **The maths is auditable.** Denied rulings still show `dcBase → dcEffective` and named
  modifier terms (`RulingArtifact.tsx:234–241`). Advantage/disadvantage shows the discarded
  die at 0.42 opacity, dashed and struck through, with an `aria-label` of "N discarded"
  (`:159–179`), and cancellation gets its own line (`:210–213`).
- **The player can read the rule that bound them.** `detailRows` pulls ACTION / ATTRIBUTE /
  SKILL definitions from the story schema (`Play.tsx:1389–1415`).

### 1.2 A large share of V7 genuinely shipped

- **Seven-slot loadout, exact V7 slot names** — primary, secondary, head, body, utility,
  accessory_1, accessory_2 (`screens/CharacterLoadout.tsx:12–20`), with "7 UNIVERSAL SLOTS"
  and an occupancy count (`:150`, `:158`), two-handed occupying both (`:162`, `:220`), and
  copy stating that stored items grant nothing (`:152`).
- **Five item tiers, exact names** — `Common | Uncommon | Rare | Legendary | Mythical`
  (`components/LootAward.tsx:4`), each with a distinct **glyph** as well as a colour
  (`:17–23`), so tiers are legible without relying on colour alone. Mythical gets a tint and
  glow (`:40`, `:43`).
- **Action budget 1–5, default 2** — stepper disabled at bounds
  (`components/StoryCreationReview.tsx:118–127`, `screens/Wizard.tsx:117`).
- **Persona confirmation before forge**, with an explicit acknowledgement checkbox on the
  no-persona path, and forge blocked until resolved (`StoryCreationReview.tsx:43–69`,
  `Wizard.tsx:511`).
- **Mechanic-source review before forge** — every attribute shows SOURCE
  (CARD/PERSONA/BLUEPRINT/CUE/GENERATED) and scope, and states that card mechanics take
  precedence (`StoryCreationReview.tsx:80–99`). This satisfies a hard V7 requirement.
- **Truthful forge progress.** `ForgingInterstitial` shows named step statuses, active
  substep, repair attempts, elapsed time, "Latest real event", and all eight operation states
  including slow/degraded/timed-out/cancelled/resumable (`components/ForgingInterstitial.tsx:19–27`,
  `:112–133`). **There is no fake percentage and no progress bar** — verified by reading the
  whole component. This is an honesty win most products fail.

### 1.3 The Journal is the strongest V7-conformant screen

Chapter grouping (`Journal.tsx:95–105`), all five required filters plus All (`:24–31`), actor
filter (`:183–186`), expandable details (`:197–203`), Markdown + CSV export with success and
error states (`:135–154`), pagination with its own error state (`:112–134`), and empty vs
filtered-empty distinguished (`:189–190`). Denied is visually distinct via a `⊘` glyph
(`:226`, `:386`).

### 1.4 Design-token discipline

`theme/tokens.css` enforces **two registers** — STORY (serif/brass) vs SYSTEM (mono/teal) —
with helper classes (`:110–125`), a proper focus ring (`:105–108`), and a 66ch prose measure
(`:134–141`). `theme/motion.css` has 10 named keyframes, all correctly gated behind
`@media not (prefers-reduced-motion: reduce)` (`:138–177`), with tokens collapsing to 0.001ms
as a second guard (`tokens.css:72–79`). Accessibility here is better than most commercial
apps.

---

## 2. The findings, ranked by user-visible impact

### 🔴 U-1 — CRITICAL: The UI promises memory the engine does not deliver

**Severity: critical (credibility). Effort: none in UI — fix the engine.**

`screens/CharacterDossier.tsx:506` renders `d.past.observations` as a timeline — the full
per-character observation history, attractively presented, with "recent" highlighting
(`:507`) and invite copy when sparse (`:262`).

**The narrator never receives any of it** (file 05, M-1 — `.observations` is read in exactly
three non-test places, all UI).

So the app shows the player a rich, growing memory of every character — and then writes the
next scene with a model that has never seen it. **The dossier is the product's best sales
pitch and its most direct broken promise.** A player who reads the dossier, then watches the
story contradict it, learns the memory is decorative.

This needs no UI change. It needs the engine wired up. **But it does mean the dossier
currently raises expectations the runtime cannot meet, which makes M-1 more urgent than its
code footprint suggests.**

---

### 🔴 U-2 — CRITICAL: Three ruling variants are built but can never appear

**Severity: critical. Effort: small.**

`RulingArtifactVariant` declares `npc`, `stacked`, and `classifier-unavailable`
(`RulingArtifact.tsx:64`, `:65`, `:69`), and all three are **fully implemented in the
renderer** (`:114–119`, `:341`, `:356–364`).

`rulingToArtifact()` in `Play.tsx:153–245` can only ever emit `budget-exceeded`, `unresolved`,
`denied`, `opposed`, or the four outcome variants (`Play.tsx:157–161`, `:179`). Verified by
grep: outside the design-system showcase, those three literals appear only in
`RulingArtifact`'s own type and branches.

**Consequences, in order of severity:**

1. **NPC rulings are never labelled as NPC.** When an NPC acts against you, the player sees a
   generic ruling with no NPC register and no visible reason. This is the UI half of finding
   D-1 (file 06): when the engine misreads a failed persuasion as a provocation and the
   merchant punches you, **the interface offers no explanation at all.** The player sees an
   unexplained attack and concludes the AI made it up — the precise accusation the product
   exists to refute.
2. **An exchange is never shown as one artifact.** Enemy hits, player ripostes — two
   disconnected cards instead of one `stacked` exchange. There is no visual concept of a
   combat round.
3. **Classifier failures are demoted from ruling to app warning.** The `classifier-unavailable`
   variant exists, but the live path renders an `InlineNotice` instead (`Play.tsx:1150–1163`,
   `:1552–1615`). So an infrastructure failure looks like a software error while the other two
   refusal states look like world rulings — inconsistent, and it teaches the player to
   distrust the register.

**The work is already done. It is unwired.** This is among the cheapest high-impact fixes
available.

---

### 🟠 U-3 — HIGH (was critical): No art, anywhere — and no plan on record for the fix

> **Revision 2026-08-02 (turn 2) — the finding stands, the framing and the remedy both change.**
> **Severity critical → high**, and **effort very large → medium**, for one reason: turn 1 scored
> this against a hand-drawn Banner Saga art pipeline (a $723,886 labour budget) that **was never
> planned**. The owner's real roadmap item is **user-selectable image generation** — the player
> picks provider and model in settings, and images are generated during the story when enabled.
> That is a *software* problem this team is well equipped for, not an art-hiring problem.
>
> **But it is recorded nowhere.** A repo-wide search for `image.?gen`, `text.?to.?image`,
> `stable diffusion`, `sdxl`, `dall` and `imagen` across every `.md`, `.ts`, `.tsx` and `.json`
> outside `Audit/` returns **zero hits** — no design note, no plan slice, no settings surface, and
> no extension point in the provider abstraction that already exists for text models. So the
> honest version of this finding is: **the absence of art is expected and fine; the absence of any
> written plan for the thing that will fix it is the actual gap.** Sized as
> [11](11-implementation-plans.md) Plan 10B.

**Original severity: critical (positioning), effort very large. Revised: high, medium.**

**Verified negative, exhaustively.** A search of `packages/ui` for
`*.png *.jpg *.jpeg *.svg *.webp *.gif *.avif` (excluding `node_modules`) returns **zero
files**. A search of `packages/ui/src` for `<img`, `<canvas`, `<svg`, `backgroundImage`,
`avatarUrl`, `portrait`, `sprite` returns **zero occurrences**. There is no `public/` and no
assets directory.

The entire visual identity is CSS tokens, Unicode glyphs, and web fonts:

- Character "avatars" are two-letter initials in a bordered box
  (`StoryCreationReview.tsx:46`, `:144`)
- Navigation icons are Unicode dingbats — `❏ ✎ ☙ ❦ ⚙` (`app/App.tsx:39–43`)
- Item tier icons are `◇ ◈ ❖ ★ ✷` (`LootAward.tsx:17–23`)
- The wordmark is the letter "M" in a gradient box (`App.tsx:157–159`)

~~Against the stated pillar of *"Banner Saga-style animations"*, the gap is total, not
partial.~~ There is not one illustration, portrait, background plate, or piece of character art
in the product. **That observation is unchanged and still worth acting on — but not against a
pillar that does not exist.**

**What to do instead — the image-generation path (clarification 3).** The right comparison is no
longer Banner Saga's studio pipeline; it is what this app already knows how to do. It already
has a multi-provider abstraction, per-provider key storage, model selection UI and a settings
surface for *text* models. **Image generation is the same shape**: provider + model dropdowns, a
key field, an on/off toggle, and a generation call at scene boundaries. The architectural
question worth answering early is where the images live (a local cache keyed by scene, not
inline in the story record) and what happens on failure — the story must render fine with no
image, exactly as it does today. Detailed slice in [11](11-implementation-plans.md) Plan 10B.

**Why this is the better answer than commissioning art**: it is local-first-compatible
(BYO image key, no hosting cost, no metering — the same argument that already wins on text),
it scales with the player's own taste rather than one house style, and it needs no artists.
It also fits the product's existing economics instead of adding a labour budget to a one-time
purchase.

**Retained for reference** (file 04 §3.6): Banner Saga's look was a frame-by-frame hand-drawn
pipeline with rotoscoped reference, a dedicated lead artist and an outsourced animation studio,
funded by $723,886 — **a labour budget, not a setting.** If a house style is ever wanted
*alongside* generated images, the cheap 80% is composition and palette rules (limited palette
with a near-black anchor, long shadows at a consistent low sun angle, flat graphic shapes,
silhouette-first design), and static compositions carry most of the perceived quality.

Meanwhile Isekai Zero ships scene art, voice narration, animated character expressions, and a
mood-following soundtrack (file 04 §2.1). On presentation, you are not behind — you are
absent.

---

### 🟠 U-4 — HIGH: Nothing teaches the player the system

**Severity: high. Effort: medium.**

**Verified:** a search across `packages/ui/src` for `tutorial|onboard|firstRun|Welcome`
returns hits in exactly one file — `RoleMatrix.tsx` — which is a provider-configuration
screen, not player onboarding. There is no tutorial, no first-run explanation, no "how
rulings work" primer, and no example turn.

The product asks a player to understand: two stat modes, an action budget, gates, DCs,
advantage/disadvantage, mastery ranks, seven equipment slots, five item tiers, chapters and
arcs — and it explains none of it.

Two pieces of evidence make this high severity rather than medium:

- **Banner Saga's most persistent criticism was "under-explained mechanics"** (file 04 §3.7)
  — and it had a visible tactical UI. Midnight Tavern has prose.
- **The category's founders report onboarding as their hardest unsolved problem.** Verbatim:
  *"We redid our tutorial many times and it's still not right."* (file 04 §4.3)

Combined with the BYO-API-key requirement — which AI2U removed deliberately as *"critical
friction removal for mass adoption"* (file 04 §4.5) — **first-run is the riskiest part of
this product's funnel and the least designed.**

---

### 🟠 U-5 — HIGH: Six of sixteen routes have no way in

**Severity: high (discoverability). Effort: small.**

**16 routes exist** (`app/router.ts:12–29`, `screens/registry.ts:50–67`), but the chrome
offers only 5 rail items (`App.tsx:38–44`) and 5 story sub-tabs (`App.tsx:47–53`).

**Six routes have no persistent entry point:** `dossier`, `loadout`, `blueprint`,
`rolematrix`, `wizard`, `designsystem`.

The two that matter most are the two that carry the product's differentiators:

- **`dossier` (848 lines)** — the deep memory surface, *the screen that demonstrates the
  anti-drift promise* — is in `STORY_ROUTES` (`router.ts:49`) but absent from `SUB_TABS`.
  Reachable only via the Play drawer → Full profile, or from the character roster.
- **`loadout` (332 lines)** — the seven-slot equipment screen, the V7 centrepiece — same.

**Your two best proof-of-value screens are hidden behind a drawer.**

And the Mechanical Journal — the audit trail of every DM decision, arguably the single best
evidence that a real engine exists — **is hidden entirely outside Full Stats mode**
(`App.tsx:239`). In No Stats, the player gets no memory (file 05, M-2) *and* no journal, so
there is nothing whatsoever to distinguish the product from a plain chat UI.

---

### 🟠 U-6 — HIGH: Player-facing screens leak raw JSON

**Severity: high (polish/credibility). Effort: trivial.**

The audience is explicitly a non-engineer. Three leaks:

1. **Every expanded journal entry ends with raw JSON** —
   `{ label: "Record", value: JSON.stringify(event.payload) }` (`Journal.tsx:368`).
2. **Dice render as a serialised array** — `JSON.stringify(roll.dice ?? [roll.d20])` produces
   literally `[14,7]` (`Journal.tsx:304`).
3. **Loot effects render as JSON** — `JSON.stringify(effect)` (`Play.tsx:1385`), so the
   otherwise-excellent loot card can print an object.

These are small fixes with outsized effect: raw JSON on screen is the strongest possible
signal of "unfinished software," and it appears on the screens meant to prove rigour.

---

### 🟠 U-7 — HIGH: The chapter number on screen is fabricated

**Severity: high (trust). Effort: small.**

`app/App.tsx:273–277`, `chapterLabelFor()` computes the header's `CH n` as
`Math.floor(messageCount / 20) + 1`.

**The number in the header is a division of the message count, not the engine's chapter
state.** The code's own comment concedes it: *"Fallback chapter label until real chapter data
threads through."*

The engine has real chapters (`store/repositories/chapters.ts`, `summarizer/chapter.ts`). The
UI displays an arithmetic guess instead. For a product whose entire pitch is *"the numbers you
see are real,"* **a fabricated number in the persistent header is a bad thing to ship.** It is
also exactly the kind of detail a sceptical reviewer would find and lead with.

---

### 🟡 U-8 — MEDIUM: Computed ruling detail is discarded before render

**Severity: medium. Effort: small.**

`Play.tsx:216` populates `opposed.reasons` from `opposedAdvantageSources` /
`opposedDisadvantageSources`; `RulingArtifact.tsx:54` declares the field; **nothing renders
it.** Grep confirms zero read sites. The same applies to `opposed.dice`, `opposed.usedIndex`,
and `opposed.rollMode` (`Play.tsx:213–215`) — `DieBlock` only ever renders the attacker's
`roll.dice` (`RulingArtifact.tsx:156`).

**In an opposed contest, the defender's dice and the reasons for advantage are computed,
passed to the component, and thrown away.** The engine did the work of being transparent and
the UI declines to show it.

Related: an opposed contest never shows outcome colour — `accentFor` returns `var(--teal)`
for `opposed` regardless of whether the player won (`RulingArtifact.tsx:114`). The stamp is
correct; the card is not.

---

### 🟡 U-9 — MEDIUM: The action budget is not a live counter

**Severity: medium. Effort: small.**

The composer shows a static string — *"Up to N actions this turn"* (`Play.tsx:1727`) — and
only when `statMode === "full"` (`Play.tsx:1229`). Nothing counts down as the player writes.

Overflow is discoverable **only after submitting**, by regex-sniffing the gate reason
(`Play.tsx:157`). The player writes a three-action turn, submits, and is then told it was too
much. A budget the player cannot see while spending it is a rule they can only break.

---

### 🟡 U-10 — MEDIUM: Ruling variants are classified by regex over prose

**Severity: medium (fragility). Effort: small.**

`Play.tsx:157–161` decides which artifact variant to show by running
`/action budget|actions per turn|overflow/i` and `/target|clarif/i` against `r.gate.reason` —
a human-readable string.

**Rewording a core error message silently downgrades the UI to a generic DENIED card.** The
gate already returns a structured `code` (`engine/gate.ts` — `skill_required` etc.); the UI
parses the prose instead of reading the code. This is the same anti-pattern as W-1 (file 07):
**string-matching where structured state is already available.**

---

### 🟡 U-11 — MEDIUM: A provider timeout is filed as a "denial"

**Severity: medium (conceptual). Effort: trivial.**

`Journal.tsx:250` buckets `classifier_recovery` events under the **"denied"** filter.

A provider timeout is not a world refusal. Filing infrastructure failure under the same
heading as "the DM said no" **corrupts the exact distinction the product is built to
establish** — and it does so in the Journal, the screen whose entire job is to make that
distinction auditable.

---

### 🟡 U-12 — MEDIUM: An arbitrary length check presented as a content judgement

**Severity: medium. Effort: trivial.**

`Play.tsx:808–811` rejects turns under 12 characters client-side as "vague."

"Run." is four characters and a perfectly good action. "I hide." is eight. The check measures
length and reports it as a judgement about quality — and it fires *before* the engine, which
is the only thing entitled to judge an action. **It is a small contradiction of the product's
own authority model**, and it will annoy exactly the terse, tactical players this product
should attract.

---

### 🟢 U-13 — LOW: Motion is UI motion, not game motion

**Severity: low. Effort: ~~very large~~ small-to-medium (turn 2, tied to U-3).**

> **Revision (turn 2):** the "very large" effort assumed a hand-animated pipeline that was never
> planned. With generated images (U-3, Plan 10B) the game-motion question shrinks to *presenting*
> a still: a cross-fade or slow Ken Burns pan on a generated scene plate reads as game motion at
> essentially no art cost, and `theme/motion.css` already has the reduced-motion discipline to do
> it accessibly. Combat/character animation remains out of scope, and that is now a deliberate
> non-goal rather than a gap.

`theme/motion.css` has 10 named keyframes: die settle, stamp, ring, count, fade, rise,
ink-bob, flash, sweep, pulse. Craft quality is high and reduced-motion handling is exemplary.

But every one is a micro-interaction on a card or indicator. **There is no scene, character,
camera, transition, or combat animation.** Correct for an admin tool; nowhere near a game.
This is U-3 restated in the time dimension and shares its fix.

---

### 🟢 U-14 — LOW: Smaller items

- **The `NEW` badge on gained equipment is wall-clock based** — a 10-minute window
  (`CharacterLoadout.tsx:303`) rather than being tied to the ruling that granted the item. It
  will mark items new after a reload and un-mark them mid-session.
- **Narrator voice leaks into the system register.** `resultLine` renders the narrator's
  `narrationHint` inside the ruling card (`Play.tsx:228`, `RulingArtifact.tsx:375–382`). It is
  deliberately kept mono/secondary, so this is a minor blur of an otherwise strictly-enforced
  two-register discipline.
- **Journal "load more" only reaches backwards through already-fetched pages**, and
  undefined-chapter events sort first via `Number.MAX_SAFE_INTEGER` (`Journal.tsx:101–104`),
  so an "OPEN CHAPTER" bucket sits above numbered chapters.

---

## 3. Summary table

| ID | Finding | Severity | Effort | Source |
| --- | --- | --- | --- | --- |
| U-1 | UI shows memory the narrator never receives | 🔴 Critical | (engine fix) | `CharacterDossier.tsx:506` + file 05 M-1 |
| U-2 | 3 ruling variants built but unreachable | 🔴 Critical | Small | `RulingArtifact.tsx:64–69` vs `Play.tsx:153–245` |
| U-3 | No art assets — **and no plan on record for image generation** | ~~🔴 Critical~~ 🟠 High | ~~Very large~~ Medium | Exhaustive search: 0 files; 0 image-gen references repo-wide |
| U-4 | No onboarding or tutorial | 🟠 High | Medium | Search: 0 player-facing hits |
| U-5 | 6/16 routes unreachable; dossier + loadout hidden | 🟠 High | Small | `App.tsx:38–53`, `router.ts:49` |
| U-6 | Raw JSON in player-facing UI | 🟠 High | Trivial | `Journal.tsx:368`, `:304`, `Play.tsx:1385` |
| U-7 | Header chapter number is fabricated | 🟠 High | Small | `App.tsx:273–277` |
| U-8 | Opposed reasons/dice computed then discarded | 🟡 Medium | Small | `Play.tsx:213–216`, `RulingArtifact.tsx:54` |
| U-9 | Action budget is not a live counter | 🟡 Medium | Small | `Play.tsx:1727`, `:1229` |
| U-10 | Ruling variants classified by regex on prose | 🟡 Medium | Small | `Play.tsx:157–161` |
| U-11 | Provider timeout filed under "denied" | 🟡 Medium | Trivial | `Journal.tsx:250` |
| U-12 | 12-character minimum presented as "vague" | 🟡 Medium | Trivial | `Play.tsx:808–811` |
| U-13 | Motion is UI motion, not game motion | 🟢 Low | ~~Very large~~ Small–medium | `theme/motion.css` |
| U-14 | Wall-clock NEW badge; voice leak; journal sort | 🟢 Low | Trivial | various |

---

## 4. What the UI fails to convey — the answer to the actual question

The user asked what the UI fails to convey about the core value. Four things:

**1. That the memory is real.** The dossier is beautiful and the engine ignores it (U-1).
Fixing M-1 turns the app's prettiest screen from a liability into the demo.

**2. That the DM is a character, not an error handler.** Denials are excellent (§1.1). But
NPC actions have no register (U-2), infrastructure failures are dressed as denials (U-11),
and opposed contests hide their reasoning (U-8). **The player sees the DM say no; they never
see the DM think.** In a product whose differentiator is *fair* refusal (file 04 §4.3),
showing the reasoning is not polish — it is the feature.

**3. That this is a game.** ~~No art, no combat surface, no scene transitions, no map, no
initiative — nothing that reads as a game rather than a well-made document tool (U-3, U-13,
and the route inventory's confirmation that there is no `combat` route at all).~~

> **Revised (turn 2, clarification 2).** The absence of a combat surface, map and initiative
> order is **not a gap** — no tactics layer was ever planned, so the missing `combat` route is
> the correct state of the repo rather than a defect. Struck rather than deleted so the change
> stays visible. The finding that survives is narrower and still true: **nothing on screen reads
> as a game rather than a well-made document tool.** The causes are the two already listed —
> no scene imagery (U-3) and no scene-level motion (U-13) — and both are answered by the
> image-generation roadmap item, not by a battle system. Isekai Zero is the proof: it reads as a
> game purely through presentation (scene art, voice, animated expressions) with no grid, map or
> initiative anywhere in it (file 04 §2.2).

**4. That the player can learn to play it.** No tutorial, no primer, hidden key screens, a
budget you cannot watch, and a chapter number that is fabricated (U-4, U-5, U-7, U-9).

---

## 5. The cheapest path to a dramatically better product

Ranked by impact per hour, these are almost all small:

1. **Wire the `npc` and `stacked` ruling variants** (U-2) — the renderer already exists.
2. **Delete the three JSON leaks** (U-6) — three one-line changes.
3. **Put Dossier and Loadout in the sub-tabs** (U-5) — a few lines in `App.tsx`.
4. **Use the real chapter number** (U-7).
5. **Render `opposed.reasons` and the defender's dice** (U-8) — data is already in the props.
6. **Make the action budget a live counter** (U-9).
7. **Read the gate's structured `code` instead of regex** (U-10).
8. **Move `classifier_recovery` out of the "denied" filter** (U-11).

**Every one of those is small, and together they would substantially change how the product
reads** — from "a chat app with a stats panel" to "a game with a visible referee." None of
them requires an artist, a combat system, or the v2 memory port.

Then the two large ones, which are strategy rather than tickets: **art direction** (U-3) and
**onboarding** (U-4).

Step-by-step plans are in [11 — Implementation plans](11-implementation-plans.md),
items **13–18**.

---

*Next: [09 — Go to market](09-go-to-market.md)*
