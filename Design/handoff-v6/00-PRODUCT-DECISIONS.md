# 00 · Product Decisions & Traceability — v6

Anchor for the v6 revision. v6 addresses forge latency, imported-card fidelity, SillyTavern macro
compatibility, classifier resilience, scene-entity mechanics, **XP-based mastery**, persona
confirmation, definition-rich rulebooks, **destructive rulebook regeneration**, and an explicit
**primary provider**. Design tokens, typography, and the STORY (warm serif / brass `#D9A648`) vs
SYSTEM (mono / teal `#74B8AE`) registers are unchanged.

> **Authority order** when documents disagree: (1) this file; (2) new decisions resolved in the v6
> handoff; (3) `handoff-v5/`; (4) `reference/attribute-integration.md`; (5) older handoffs/plans.

Legend: **[LOCKED]** build to spec · **[DEFECT]** engineering fix, behavior not reinterpreted.

---

## v6 supersedes these v5 rules

### Attribute scale → 1–10 — [LOCKED] (supersedes v5 1–30 / floor((score−10)/2))
User-facing attribute scores use a **1–10** band. The v5 D&D-like `8..16`/`1..30` representation and
`floor((score−10)/2)` are **removed**. Normal generated attribute **count** stays a soft **3–6**;
>6 only when an imported card/setting clearly defines them.

**Modifier mapping — `scoreToModifier(score) = score − 5`** (open decision #1 resolved):

| Score | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| Mod | −4 | −3 | −2 | −1 | 0 | +1 | +2 | +3 | +4 | +5 |

Average is **5 (+0)**; a typical trained protagonist stat is 6–7 (+1/+2). Against the fixed **DC
5–25** band with mastery (max +? see XP), totals stay sane: raw `d20 + (−4..+5)`; the example card's
**Body 7 (+2), Mind 5 (+0), Nerve 6 (+1)** read as meaningfully distinct. A single centralized
`scoreToModifier(1..10)` is the only place this lives.

**Locked `0` (open decision #2 resolved):** an explicit `0` such as `NEN 0 (unawakened)` is a
**locked/unavailable** state, *not* an ordinary rollable score. It renders greyed with a lock glyph,
never rolls, and shows the card's reason text. Ordinary scores remain 1–10.

### Skill mastery → XP — [LOCKED] (supersedes v5 success-counting)
Mastery advances through **XP recorded by the deterministic ruling**, not by counting successful
uses. `successesPerRank`, pip-counts, and "N more successful uses" are removed.

**Thresholds (open decision #5 resolved):** cumulative XP **within a rank**, reset at rank-up. Base
100, growth ×2.5:

| Transition | XP needed (within rank) |
|---|---|
| Novice → Adept | 100 |
| Adept → Expert | 250 |
| Expert → Master | 625 |
| Master | max rank — XP stops accruing |

**Who awards (open decision resolved):** the **deterministic ruling engine** awards XP from the
action's XP profile (difficulty, outcome, opposition, novelty, risk). The Classifier may tag; it
never writes XP. The Narrator describes but cannot change an award. The Analyzer cannot write XP.
**Award policy (open decision #6 resolved):** success = full; critical success = +50%; **failure =
25% practice XP**; critical failure = 10%; **denied = 0**; scaled by DC/opponent; **diminishing
returns** on repeated trivial actions (same action vs same-or-lower DC within a scene decays 100%→
50%→25%→0). Rewind/delete **rolls XP back** with the exchange; regeneration wipes XP earned under the
old rulebook.

### Rulebook regeneration → allowed, destructive, gated — [LOCKED] (supersedes v5 "permanently sealed")
The rulebook stays **immutable during ordinary play** (no model/controller mutation). The user may
run a deliberate **Regenerate rulebook** operation from Story Settings — a version-boundary reset,
not dynamic mutation. Recommended safe path **Duplicate story and regenerate**; direct destructive
path requires **typed confirmation**. Atomic install or rollback; the old rulebook + hard state stay
usable until the replacement fully validates. Wipe/preserve contract in `01-UX-SPEC §Regen` and
`04-IMPLEMENTATION-CONTRACT §Regen`. (Open decisions #10/#11: old ruling artifacts become **archived
historical text** behind a version boundary; a **rollback snapshot is retained** for a limited period
after direct regeneration — the UI never claims permanent deletion while a backup exists.)

### Primary provider → persisted UX default — [LOCKED] (new)
Exactly one **Primary provider** whenever a valid provider exists; none when none is valid. It is a
persisted UX default (`primaryProviderId`), **not** a routing override: every model role keeps its
own explicit provider+model binding, and those bindings win at inference. Details + 7 acceptance
scenarios in `01-UX-SPEC §Primary` and `04 §Primary`.

---

## v6 does NOT reopen (carried from v5)
Two story modes only (**No Stats** / **Full Stats**) · No Stats is **Narrator-only** · one **global
Narrator** · models never silently mutate the rulebook in ordinary play · the deterministic engine
is the **only** writer of hard mechanical state · **no sixth Controller/DM role** ("DM Ruling" is the
visible name of the engine's verdict) · Rewind and Delete stay distinct.

---

## Engineering defects (documented, behavior not reinterpreted) — §3.1
1. A completed/failed/cancelled/stale stream **must leave** the thinking state (see `§Streaming`).
2. Null/empty optional classifier fields **must not** consume repairs — normalize to omission.
3. A classifier failure follows the **classifier-skipped** path, never discards the turn.
4. Error copy names the **actual** failure (invalid output / timeout / auth / empty), not "returned nothing".
5. Forge progress is driven by **real work events**, never a cosmetic timer.

---

## Resolved open decisions (§17)
1. Modifier table = `score − 5` (above). 2. Locked `0` = separate locked state. 3. Full Stats
**requires** persona confirm; no-persona only via a warned secondary path. 4. Macro support tier =
deterministic set (`01-UX-SPEC §Macros`); unknown macros preserved + warned, never deleted. 5. XP
thresholds 100/250/625 ×2.5. 6. Failure awards 25% practice XP; diminishing returns curb farming.
7/8. Eight universal action families (attack/harm · defend/avoid · move/overcome-obstacle · observe/investigate · influence/deceive · use-item · assist · recover/rest); story actions specialize exactly one. 9. Scene entities materialized via a
registry (`§Entities`). 10. Regen wipe/preserve contract defined; old rulings archived. 11. Rollback
snapshot retained. 12. Forge targets: <1s first activity, <90s healthy, 90s slow, 180s degraded,
abortable timeout. 13. Primary-provider surfaces + replacement flow defined.

---

## Traceability index
| Topic | Decision | Screen(s) | Doc |
|---|---|---|---|
| 1–10 attributes | LOCKED | StoryCreation, Play card, Dossier, StorySettings, DesignSystem | UX §Attributes · 04 §Attributes |
| XP mastery | LOCKED | Chat, Play card, Dossier, SkillProgression, DesignSystem | UX §XP · 04 §XP |
| Macro compat | LOCKED | StoryCreation, DesignSystem | UX §Macros · 04 §Macros |
| Classifier resilience | LOCKED+DEFECT | Chat | UX §Classifier · 02 §Classifier · 04 §Classifier |
| Scene entities | LOCKED | Chat | UX §Entities · 04 §Entities |
| Universal actions | LOCKED | Chat, StorySettings | 04 §Actions |
| Forge speed/progress | LOCKED+DEFECT | ForgingProgress | UX §Forge · 02 §Forge · 04 §Forge |
| Persona confirm | LOCKED | StoryCreation | UX §Persona · 02 §Persona |
| Definitions | LOCKED | StorySettings, Play card, Dossier, Chat | UX §Definitions · 04 §Definitions |
| Streaming terminal | DEFECT | Chat | 02 §Streaming · 04 §Streaming |
| Rulebook regen | LOCKED | StorySettings, ForgingProgress | UX §Regen · 02 §Regen · 04 §Regen |
| Primary provider | LOCKED | Settings, RoleMatrix | UX §Primary · 02 §Primary · 04 §Primary |

Decision-delta checklist (v5→v6 superseded files/screens) at the end of `00-WHATS-NEW-V6.md`.
