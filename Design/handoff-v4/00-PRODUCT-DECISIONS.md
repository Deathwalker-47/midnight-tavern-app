# 00 · Product Decisions & Traceability — v4

This is the anchor for the v4 revision. It records each directive item (A–N) as a
**locked decision** or an **unresolved product decision**, and maps every one to where it is
specified: a UX requirement, a screen/component state, a flow, exact UI copy, and acceptance
criteria. v4 is a **revision** of Midnight Tavern — tokens, typography, navigation model, and the
STORY (warm serif / brass `#D9A648`) vs SYSTEM (mono / teal `#74B8AE`) register distinction are
preserved unchanged.

> **Reading order:** this file → `01-UX-SPEC.md` → `02-STATES-AND-FLOWS.md` →
> `03-COMPONENT-STATES.md` → `04-IMPLEMENTATION-CONTRACT.md`. Screens live in `screens/`.

Legend: **[LOCKED]** decided, build to spec · **[UNRESOLVED]** decision study only, do **not**
build as implementation-ready.

---

## Decision register

### A · Lorebook JSON import — [LOCKED]
The global Lorebook Library gains a prominent **Import lorebook** action with a full flow: native
JSON picker → parse → preview (format, name, entry count, enabled/disabled, trigger keys, always-on,
lossy fields) → conflict handling (new / merge / replace duplicates / keep both / cancel) →
validation failure with reason + optional technical detail → partial result (skipped entries) →
success (Open lorebook / Attach to current story when active / Done). Imported lorebooks carry an
**Imported** source badge. A compatibility matrix + example fixtures are defined, not a vague
“JSON supported.”
Spec: UX §A · States: 02 §A · Component: 03 §A (matrix + fixtures) · Screen: `Lorebook.dc.html`.

### B · Long-running forging — [LOCKED]
Forge is an **operation-status** experience driven by real phase events; **never a fake
percentage**. Five retained phases with completed / active / pending treatment, reduced-motion-safe
activity, elapsed time, a phase-accurate explanation, “Still working” reassurance, explicit
30s / 2min / 5min+ states, retry/resume on provider failure, safe cancel, retained-data statement,
and a post-failure diagnostics affordance.
Spec: UX §B · States: 02 §B · Contract: 04 §B (event schema) · Screen: `ForgingProgress.dc.html`.

### C · SillyTavern-compatible chat formatting — [LOCKED]
A **safe** rich-text renderer for common ST card text: paragraphs, line breaks, `*italic*`,
`**bold**`, combined, quoted dialogue, scene separators, lists, optional inline code, escaped
characters, malformed/unclosed markup, very long unbroken text, streamed/incomplete Markdown. Raw
HTML, scripts, unsafe links, remote embeds, and card CSS **must not execute**. Compatibility target,
not a visual clone.
Spec: UX §C · Component: 03 §C (grammar + sanitizer allow/deny + before/after) · Screen: `Play.dc.html`.

### D · Persistent active-story context — [LOCKED]
One authoritative **active story**. Play/Overview/Characters/Lore/Story Settings resolve to it;
leaving for Library/Personas/Lorebooks/Settings does not forget it; the Story rail returns to the
last active story; restart restores it if it still exists, else a recovery state; switching stories
deliberately replaces it. Story-context tabs show **loading/error**, never “No story open,” while
restoring. Breadcrumb, rail, header, and window-title behavior defined.
Spec: UX §D · States: 02 §D · Contract: 04 §D (active-story lifecycle) · Screens: shell/header across story tabs.

### E · Navigation during generation — [LOCKED]
A submitted turn belongs to its story across navigation. Global **background-generation indicator**
(story title + current phase + return action), completion/failure notification, reopening mid-gen,
transcript placeholder restoration, cancellation, close/restart behavior, and simultaneous
operations in different stories. **No optimistic player message or generated Narrator message may
silently vanish.**
Spec: UX §E · States: 02 §E · Contract: 04 §E · Screen: global indicator + `Play.dc.html`.

### F · Causal exchange layout — [LOCKED]
Chat is explicit **exchange units**: (1) player message/action, (2) zero-or-more DM rulings,
(3) Narrator reply from those rulings, (4) exchange actions (branch, regenerate, delete, copy). A
ruling never appears under an unrelated later exchange. **Supersedes the v3 “ruling mounts
mid-stream” rule** — causal order is: classification/resolution activity → ruling appears/resolves
→ Narrator prose streams beneath. Prose-only turns omit the ruling area entirely. Stacked rulings
and multiple NPC actions are grouped without a debug-console feel.
Spec: UX §F · Component: 03 §F (exchange unit) · Screen: `Play.dc.html`.

### G · DM ruling content — [LOCKED]
Every ruling identifies: actor, attempted action, relevant skill, target (if any), gate requirement
& denial reason, die result, mastery modifier, attribute modifier (**only if the attribute system is
enabled — see N2**), contextual modifier, total vs DC/opposing total, outcome, costs paid, state
effects, mastery progress / rank advancement. Concise summary + expandable details. Denied rulings
explain what was missing and suggest a valid alternative when possible.
Spec: UX §G · Component: 03 §G (ruling schema + summary/expand) · Screen: `Play.dc.html`.

### H · History / rewind / branch / delete — [LOCKED]
Player message + its rulings + resulting Narrator reply = one **indivisible exchange**. **Rewind to
here** keeps the selected exchange, removes only later exchanges, restores hard state to the end of
the selected exchange, with an exact confirmation preview (kept exchange, # removed, affected
rulings/checkpoints, reversibility). A second destructive boundary that removes the selected
exchange is a **separately named, visually distinct** “Delete from this exchange.” Two boundaries
never share the label “Rewind.”
Spec: UX §H · States: 02 §H · Component: 03 §H (confirm preview) · Screen: `Play.dc.html`.

### I · Persona-derived player identity — [LOCKED]
Remove the invisible **“Traveler”** fallback. Story creation (including from an imported card)
requires choosing/confirming the **player persona** separately from the imported AI character:
“You will play as [persona]” confirmation, default-persona behavior, change-persona action,
no-persona state, consequences of changing persona mid-play, and mapping of persona name /
description / traits / avatar / optional mechanical hints into the player character.
Spec: UX §I · Flow: 02 §I · Screen: story-creation persona step.

### J · Narrator configuration authority — [LOCKED, with guarded override option]
**Preferred:** the global Model Role Matrix owns the Narrator; Story Settings shows a **read-only**
“Using global Narrator: [provider/model]” summary + “Configure models” link; the independent story
Narrator dropdown is **removed**. If per-story overrides are later deemed essential they must use an
explicit **Use global Narrator / Override for this story** control, show the full provider/model
catalog, persist, and label the active source. **Never two unlabeled Narrator selectors.**
Spec: UX §J · Screen: `StorySettings.dc.html` + `RoleMatrix.dc.html`.

### K · Skill mastery progression — [LOCKED]
Make the **existing** Novice → Adept → Expert → Master engine visible (do not invent a new system):
current rank, mastery modifier, successful checks completed, successes required for next rank,
progress bar/pips, progress gained in a ruling, unmistakable rank-up moment, max-rank state, what
the next rank changes, and progression history in the dossier. Understandable without opening Story
Settings.
Spec: UX §K · Component: 03 §K (mastery meter) · Screens: `Play.dc.html` card + `CharacterDossier.dc.html`.

### L · Mechanics modes & prose-only — [LOCKED]
Story creation offers **Prose only** (no classifier/dice/rulings/gating/mastery — uninterrupted
narrative), **Light rules** (skill checks + mastery, minimal bookkeeping, no attributes), **Full
rules** (skills/actions/resources/equipment/mastery; optional attribute layer once N2 is approved).
Explained with story examples (romance, comedy, mystery, combat). Mode is shown in Story Settings;
changing mode after play begins must **not silently reinterpret** previous turns.
Spec: UX §L · States: 02 §L · Screens: story-creation mode step + `StorySettings.dc.html`.

### M · Accurate model-error states — [LOCKED]
Errors name the **actual failed role and pipeline phase**. Distinct copy for: Classifier invalid
output; rules-resolution failure; Narrator empty output; Analyzer failure after a successful turn;
provider authentication; timeout/network; cancellation. Each shows whether the player message was
saved, which step can be retried, and a copy-diagnostics action. A Classifier failure is never
labeled “Narrator returned nothing”; a background Analyzer failure never makes a completed Narrator
reply look failed.
Spec: UX §M · States: 02 §M · Contract: 04 §M (error taxonomy) · Screen: `Play.dc.html`.

---

## Unresolved product decisions — decision studies only

### N1 · Dynamic skills & actions — [UNRESOLVED]
Compare: permanently frozen catalog · frozen broad catalog with hidden/revealable skills · versioned
rulebook amendments proposed by a controller. Covers determinism, user consent, prompt context,
balance, saved-game migration, rewind/checkpoints, audit history, deletion of obsolete definitions.
**Constraint:** the controller must **never silently rewrite** the rulebook. Provisional UI variants
only — see `04-IMPLEMENTATION-CONTRACT.md` §N1. **Do not build as final.**

### N2 · Attributes beneath skills — [UNRESOLVED]
Compare: no attributes · universal fixed list · optional story-generated attributes · import an
external card’s attribute system. Covers schema, ranges, modifier formula, skill→attribute mapping,
NPC generation, card import, DC rebalance, progression, UI density, prompt context, migrations, and
prose-only/light behavior. **Full-Rules attribute screens are not to be completed until this is
approved.** The attribute modifier in a ruling (G) is shown **only when the attribute system is
enabled**. See `04-IMPLEMENTATION-CONTRACT.md` §N2.

---

## Traceability index

| Item | Requirement | Screen / component + states | Flow | Exact copy | Acceptance | Unresolved |
|---|---|---|---|---|---|---|
| A | UX §A | `Lorebook.dc.html` import; 03 §A | 02 §A | UX §A | 02 §A | — |
| B | UX §B | `ForgingProgress.dc.html`; 02 §B | 02 §B | UX §B | 02 §B | — |
| C | UX §C | `Play.dc.html`; 03 §C | — | 03 §C | 03 §C | — |
| D | UX §D | story shell/header; 02 §D | 02 §D | UX §D | 02 §D | — |
| E | UX §E | bg indicator + `Play.dc.html`; 02 §E | 02 §E | UX §E | 02 §E | — |
| F | UX §F | `Play.dc.html`; 03 §F | — | — | 03 §F | — |
| G | UX §G | `Play.dc.html`; 03 §G | — | UX §G | 03 §G | attr row → N2 |
| H | UX §H | `Play.dc.html`; 03 §H | 02 §H | UX §H | 02 §H | — |
| I | UX §I | story-creation persona; 02 §I | 02 §I | UX §I | 02 §I | — |
| J | UX §J | `StorySettings`+`RoleMatrix` | — | UX §J | UX §J | — |
| K | UX §K | `Play` card + `CharacterDossier`; 03 §K | — | UX §K | 03 §K | — |
| L | UX §L | story-creation mode + `StorySettings`; 02 §L | 02 §L | UX §L | 02 §L | attr layer → N2 |
| M | UX §M | `Play.dc.html`; 02 §M; 04 §M | 02 §M | 04 §M | 02 §M | — |
| N1 | study | 04 §N1 provisional | — | — | — | **open** |
| N2 | study | 04 §N2 provisional | — | — | — | **open** |
