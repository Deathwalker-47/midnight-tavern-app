# 01 · UX Spec — v5

Behavior + **exact UI copy** for the v5 decisions. Copy in `"quotes"` is literal. Registers
unchanged: STORY = warm serif / brass; SYSTEM = mono / teal (attributes render SYSTEM). Supersedes
v4 §L; only two stat systems exist.

## §Mode · Stat-system choice (story creation)
Header: **"Which stat system should this story use?"** Exactly two cards.

**No Stats:**
> "Pure roleplay and prose. No attributes, skills, dice, action checks, rulings, inventory rules, or
> progression. Only your Narrator model is used. Best for romance, comedy, slice-of-life, freeform
> drama, and a SillyTavern-like experience."
Confirmation before proceeding: **"Uses Narrator only."**

**Full Stats:**
> "A generated roleplaying system with story-specific attributes, skills, actions, resources,
> equipment, dice, mastery, and persistent consequences. Best for adventure, combat, survival,
> mystery, progression, CRPG, tabletop, and LitRPG-style stories."
Sub-note: "The Story AI forges a sealed rulebook. Attributes are generated for your premise — you
don't point-buy them. Uses Narrator, Classifier, Analyzer, Summarizer, and Story AI."

No third option; `light` never appears.

## §Narrator · authority (J, global-only)
Story Settings shows only `"Using global Narrator: [provider] · [model]"` + **"Configure models"**
link + role-usage line (`"Narrator only"` or `"Full Stats pipeline"`). No per-story dropdown, no
override toggle, no fallback copy.

## §Roles · activation disclosure
- **Setup Wizard:** Narrator required to finish; Full Stats roles grouped **"Required for Full Stats
  stories"**, configurable now or deferred. No Stats never forces configuring unused roles. Full
  Stats at creation checks required roles → if missing route to **"Complete Full Stats setup"** and
  return to the draft.
- **Role Matrix:** two groups — **"Narrator — used by every story"** and **"Full Stats roles — used
  only by Full Stats stories."** When a No Stats story is active: "This story uses Narrator only. The
  Full Stats roles below are configured but dormant." Global config stays enabled.

## §Attributes (LOCKED — source: reference/attribute-integration.md)
- Per-story genre attributes, soft 3–6, no hard cap; shown `"STR 16 (+3)"`. Modifier from one
  function `floor((score − 10) / 2)`.
- Ruling math shows every term; the count-up sums them:
  raw `"d20 11 + DEX 2 = 13 vs DC 12 — Success"`; skilled `"d20 14 + STR 3 + Blade Adept 3 = 20 vs DC
  15 — Success"`; flat `"d20 18 = 18 vs DC 15 — Success"`; opposed shows both sides' terms.
- Governing attribute lives on the **action**; skill prereqs may show `"STR ≥ 14"`.
- Attributes are static — **never level by use**; only rare engine effects change one (item/curse/
  boon) with a recently-changed marker + source. Mastery advances by use, shown separately.
- No point-buy in v1. Individual edits only in advanced/dev schema view post-freeze (current score +
  derived modifier, allowed range, confirm, "future checks change but previous turns do not",
  checkpoint note). Not a chargen screen.
- Superhuman > 20 renders normally. Missing score → 10 (+0), diagnostics only, never a user failure.

## §Reveal · frozen catalog (N1, LOCKED)
Sealed at forge, never mutates; runtime flips state on **pre-existing** IDs. Reveal copy:
> "**New skill revealed: Trapcraft** — Kestrel recognized the reliquary's ward pattern. Trapcraft was
> already part of this world's sealed rulebook and is now discoverable."
Never imply runtime creation. States: hidden→revealed · revealed-not-learned · learned-at-Novice ·
action-now-available · denied-still-locked (names locked prereq) · dossier history · Story Settings
total-vs-revealed counts · rewind removes a later reveal.

## §Switching stat systems
History never changes; a permanent **boundary marker** shows the change point.
- **Full → No Stats:** "Pausing mechanics. Your rulebook, sheet, inventory, attributes, mastery, and
  checkpoints are preserved. Classifier, Analyzer, Summarizer, and Story AI stop. Turns continue with
  the Narrator only. Previous exchanges are unchanged." → Story Settings reads **"No Stats — previous
  Full Stats sheet preserved"** + inspect-frozen-sheet.
- **No Stats → Full Stats (no rulebook yet):** "This forges a new sealed rulebook and attributes from
  your premise, persona, card, lorebooks, and story so far. It applies only to future exchanges —
  earlier prose is never re-rolled." → check roles → upgrade forge → checkpoint → mechanics next turn.
- **No Stats → Full Stats (rulebook paused):** "Resuming your existing rulebook and sheet. Nothing is
  regenerated." Shows which exchange is the first mechanical turn.
Both design confirm/cancel/in-progress/failure/retry/success/rollback; the dialog states which roles
activate/go dormant, what's preserved, that previous exchanges are unchanged, whether a forge is
required, and whether it can be cancelled before completion.

## §Migration · existing `light` stories
First open of a `statMode: light` story → one-time decision, two destinations only:
- **"Continue as No Stats"** — "Mechanics pause. Your old sheet is preserved as historical state."
- **"Upgrade to Full Stats"** — "Keep your skills, actions, and resources; generate the missing
  attribute layer, validate, checkpoint, and apply to future exchanges only."
Copy guarantees: automatic pre-migration backup, earlier transcript/rulings unchanged, exact
add/pause explanation, retry/rollback on failure, no indefinite hidden "legacy light". `light` is
never a permanent choice.

## §Errors (No Stats vs Full Stats)
Full Stats keeps the v4 role/phase-accurate taxonomy. **No Stats** can surface only Narrator,
provider-auth, network/timeout, cancellation, and local-persistence errors. A Classifier / Resolver
/ Analyzer / Summarizer / Story-AI error card in active No Stats play is a contract violation, not a
recoverable state.