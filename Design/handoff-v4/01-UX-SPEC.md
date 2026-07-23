# 01 · UX Spec — v4

Behavior and **exact UI copy** per directive item. Copy in `"quotes"` is literal. Registers
unchanged: STORY = warm serif / brass; SYSTEM = mono / teal for anything mechanical.

---

## §A · Lorebook JSON import
**Entry.** Global Lorebook Library header gets a primary button **"Import lorebook"** beside
"New lorebook". Also available via the library empty state.

**Flow & copy.**
1. **Picker** — native file dialog; accept `.json`. Helper: "Choose a lorebook JSON file — SillyTavern, Agnai, or Midnight Tavern format."
2. **Parsing** — "Reading lorebook…" with reduced-motion-safe spinner.
3. **Preview** — header "Import preview". Rows: **Format** (detected, e.g. "SillyTavern World Info v2"), **Name**, **Entries** ("42 entries · 38 enabled · 4 disabled"), **Always-on** ("3 always-in-context"), **Trigger keys** (sampled chips + "+N more"), **Lossy fields** panel when present: "Some fields don’t map to Midnight Tavern and will be dropped:" + list.
4. **Conflict** (shown when a same-name lorebook exists) — radio group: "Create a new lorebook" (default), "Merge into existing…", "Replace duplicate entries", "Keep both", plus "Cancel".
5. **Validation failure** — "This file isn’t a lorebook we can read." + reason line (e.g. "Expected an object with an `entries` map; got an array."), and a disclosure "Show technical detail" revealing parser message + byte offset.
6. **Partial import** — "Imported 38 of 42 entries. 4 were skipped." + expandable "Show skipped" listing entry + reason ("empty keys", "unsupported regex trigger").
7. **Success** — "Lorebook imported." Actions: **"Open lorebook"**, **"Attach to current story"** (only when a story is active — else hidden), **"Done"**. Imported lorebooks show an **"Imported"** source badge in the library.

**Acceptance.** Import reachable from the library; preview shows all listed fields; every conflict
option present; validation failure gives plain reason + optional technical detail; partial result
names skipped entries; success offers Open/Attach(when active)/Done; imported badge persists.

---

## §B · Long-running forging
Operation-status experience. **Never a fake percentage** — progress is the discrete phase list.

**Phases (real events):** "Reading your premise" · "Deciding the rules of this world" · "Writing
the skill and action catalogs" · "Placing characters and starting gear" · "Validating and sealing
the rulebook". Each is completed (✓, teal) / active (animated, brass) / pending (dim).

**Chrome.** Elapsed timer ("0:42"). Under the active phase, a **phase-accurate** explanation that
changes with the phase (e.g. while writing catalogs: "Defining skills, their tiers, and the actions
they gate."). These are tied to emitted phase events, **not** rotating marketing lines.

**Long-op copy.** ≥30s: "This world is a detailed one — still working." ≥2min: "Larger rulebooks
can take a few minutes. You can keep this open or leave — we’ll finish in the background." ≥5min:
"This is taking longer than usual." + **"Run diagnostics"** and **"Cancel"** made prominent.

**Failure/retry.** On provider failure at a phase: "The [phase] step failed — [provider] didn’t
respond." Actions: **"Retry step"** (resumes from the failed phase), **"Start over"**, **"Cancel"**.
Retained-data line: "Completed phases are kept — retrying continues from ‘[failed phase]’."

**Cancel.** "Stop forging this world?" / "Nothing is saved to your library yet. You’ll return to the
premise." → "Stop forging" / "Keep going".

**Diagnostics.** Post-failure "Run diagnostics" → copyable report (phase, provider/model, request id,
error class, elapsed). Copy: **"Copy diagnostics"**.

**Acceptance.** No numeric percent anywhere; phase states correct; elapsed shown; 30s/2min/5min copy
present; retry resumes from failed phase with retained-data statement; cancel is safe and explained;
diagnostics available after failure; all animation respects reduced-motion.

---

## §C · SillyTavern-compatible chat formatting
Safe renderer (full grammar + sanitizer in 03 §C). UX rules: `*action*` → italic story-tone;
`**bold**` → bold; dialogue in quotes gets a subtle brass quote tint; `---`/`***` on their own line
→ scene separator rule; `-`/`1.` lists render as lists; blank line → paragraph; single newline →
line break. Escaped `\*` renders a literal asterisk. Malformed/unclosed markup renders as plain
text (never leaks raw tokens as broken styling). Very long unbroken strings wrap/scroll, never
overflow. Streaming: partial `**` shows plain until closed (no flicker). **Raw HTML/scripts/remote
embeds/card CSS never execute.** Unsafe links are shown as inert text with a hostname note.
**Acceptance:** every listed construct renders per 03 §C before/after fixtures; no XSS vector; no
layout overflow; streamed markdown stabilizes.

---

## §D · Persistent active-story context
One **active story**. Copy for header breadcrumb: "Library / [Story title]". Rail "Story" group
shows the active story title beneath the glyph; clicking any story tab (Play/Overview/Characters/
Lore/Story Settings) resolves to it. Window title: "[Story title] — Midnight Tavern"; non-story
areas: "Library — Midnight Tavern".

**Restore.** On launch, reopen last active story. While restoring, story tabs show a **loading**
skeleton with "Opening [Story title]…" — never "No story open". If the story was deleted/moved:
recovery state "This story could not be found." / "It may have been deleted or moved outside your
library." → "Back to Library" + "Locate folder…". Switching stories: opening another story from the
Library replaces the active story (no confirmation needed; generation guard — see §E).

**Acceptance.** Active story survives navigation to non-story areas and app restart; rail/header/
title reflect it; deleted/moved yields recovery state; story tabs never show "No story open" during
restore.

---

## §E · Navigation during generation
A submitted turn is owned by its story. A **global background-generation indicator** (in the shell,
above the rail bottom) shows: story title, current phase ("Narrating…", "Resolving rules…"), and a
**"Return to story"** action. On completion: toast "[Story title] — your turn is ready." On failure:
toast "[Story title] — generation failed." → "Open". Reopening the story mid-gen restores the
in-progress transcript with the optimistic player message pinned and a Narrator **placeholder**
("The story continues…"). **Cancellation:** "Stop this turn?" → "Stop" / "Keep going"; a stopped
turn keeps the player message with a "Stopped — regenerate" affordance. App close during gen:
"A turn is still generating. Close anyway?" → "Close" / "Wait". Simultaneous ops in different
stories are allowed; the indicator stacks/counts ("2 stories generating").

**Invariant.** No optimistic player message or generated Narrator message may silently vanish.
**Acceptance.** Indicator names story + phase + return; completion/failure notified; reopening shows
placeholder; cancel keeps the player message; close is guarded; multi-story gen represented.

---

## §F · Causal exchange layout
See 03 §F. UX: each exchange renders top→bottom as player line → (resolution activity → ruling(s)) →
Narrator prose. Prose-only turns render just player line → Narrator prose (no ruling area). Exchange
action row (branch, regenerate, delete, copy) sits at the exchange foot, appearing on hover/focus.

---

## §G · DM ruling content — summary + expand
**Summary copy (example, literal):** "Wren attempts Pick the Reliquary Lock using Lockpicking
(Adept). d20 16 + Mastery 3 = 19 vs DC 15 — Success." Expanded details list every field in 00 §G.
**Denied example:** "You can’t Pick the Lock — Lockpicking isn’t a skill Kestrel has learned." +
suggestion "Wren has Lockpicking (Adept) — ask her, or try Force the door (Athletics)." The
attribute-modifier line appears **only when the attribute system is enabled (N2)**.
**Acceptance:** all fields present; summary matches the example grammar; denial explains the missing
requirement and suggests a valid alternative when one exists.

---

## §H · History / rewind / branch / delete
**Rewind to here** (primary, on any exchange) — confirm dialog "Rewind to this exchange?" body:
"This keeps this exchange and removes the [N] exchanges after it. Your stats, inventory, and skills
return to how they were at the end of this exchange." Detail rows: "Kept: [exchange summary]",
"Removed: [N] later exchanges", "Checkpoints affected: [N]", "Summaries after this point will be
rebuilt." Footer: "This can’t be undone." → **"Rewind"** / "Cancel".
**Delete from this exchange** (separate, destructive, red-tinted, in the ⋯ menu — *different name and
placement*) — "Delete this exchange and everything after it?" body: "This removes this exchange too
— [N+? removed]. Hard state returns to the end of the previous exchange." → **"Delete"** / "Cancel".
**Branch** duplicates the timeline up to and including the selected exchange into a new branch.
**Acceptance:** exchange is indivisible; Rewind keeps the selected exchange and removes only later
ones; Delete-from is separately named + visually distinct; both previews state exact counts and
reversibility.

---

## §I · Persona-derived player identity
No invisible "Traveler". Story creation includes a **persona confirm** step (even from an imported
card): "You will play as [persona]." with the persona’s avatar/name/tagline. Controls: **"Change
persona"** (opens picker) and a note that the imported card is the **world/other character**, not
you: "The imported card ‘[card]’ becomes a character in the world — you play as your persona."
**Default:** the global default persona is pre-selected. **No-persona state:** if none exists,
"Create a persona to play as" → persona editor; creation cannot proceed without a chosen persona.
**Change after play begins** (Story Settings): "Changing your persona mid-story updates who ‘you’
are from here on. Earlier turns keep their original framing." → confirm. **Mapping:** persona name,
description, traits, avatar, and optional mechanical hints seed the player character sheet at story
start.
**Acceptance:** creation requires an explicit persona; confirm copy present; change action works;
no-persona blocks with a fix; mid-play change is explained; card ≠ player is unambiguous.

---

## §J · Narrator configuration authority
Story Settings shows a **read-only** card: "Using global Narrator: [provider] · [model]" with a
**"Configure models"** link to the Role Matrix. The independent per-story Narrator dropdown is
**removed**. (Guarded-override fallback, only if later approved: a segmented control "Use global
Narrator / Override for this story"; when Override is chosen, the full provider/model catalog shows
and the active source is labeled "Overridden for this story".)
**Acceptance:** exactly one Narrator source of truth is visible; Story Settings is read-only + link;
no two unlabeled Narrator selectors anywhere.

---

## §K · Skill mastery progression
Existing ranks **Novice → Adept → Expert → Master** made visible. In the Play character card and the
dossier, each skill shows: rank label, mastery modifier ("+3"), progress ("4 / 6 successes to
Expert") with pips/bar, and a subtle gold marker when it advanced this session. On a check that
grants progress, the ruling shows "Lockpicking progress +1 (4→5 of 6 to Expert)". **Rank-up moment:**
an unmistakable inline celebration in the exchange — "Wren reaches Expert Lockpicking (+5)." plus a
one-line "What Expert changes: +5 to Lockpicking checks; unlocks Trapcraft." **Max rank:** "Master
(+7) — highest rank." The dossier lists **progression history** (rank-ups with chapter/turn).
**Acceptance:** all listed fields visible without opening Story Settings; per-ruling progress shown;
rank-up is unmistakable; max-rank state present; dossier shows history.

---

## §L · Mechanics modes & prose-only
Story creation adds a **mode** step (3 cards):
- **"Prose only"** — "Pure storytelling. No dice, no checks, no skills — the story never pauses for
  mechanics. Best for romance, comedy, slice-of-life, and freeform drama."
- **"Light rules"** — "Skills and mastery, quietly. Meaningful actions roll a check and your skills
  grow, with minimal on-screen bookkeeping. Best for mystery and character-driven adventure."
- **"Full rules"** — "The full engine. Skills, actions, resources, equipment, and mastery. Best for
  combat and survival adventure." + note "Attributes are a future addition (pending design)."
**Story Settings** shows the current mode with a description and a guarded **"Change mode"**:
changing to a mode with more mechanics: "New turns will use [mode]. Earlier turns keep how they were
told — we won’t re-roll or reinterpret them." Changing to fewer mechanics: "Mechanics will pause for
new turns. Your sheet is kept but won’t change." **Acceptance:** three modes with examples; prose-only
truly suppresses classifier/dice/rulings/gating/mastery; mode shown in Story Settings; changing mode
never silently reinterprets prior turns.

---

## §M · Accurate model-error states
Each error names the failed **role** and **phase**, states whether the player message was saved,
which step retries, and offers copy-diagnostics. Distinct copy:
- **Classifier invalid output** — "Couldn’t read the mechanics for this turn." / "The Classifier
  returned something we couldn’t parse. Your message is saved." → "Retry mechanics", "Skip
  mechanics (narrate only)".
- **Rules resolution failure** — "A ruling couldn’t be resolved." / "The dice step hit an internal
  error. Your message is saved." → "Retry ruling".
- **Narrator empty output** — "The Narrator returned nothing." / "This role produced no text. Your
  message is saved." → "Regenerate", "Try a recommended model".
- **Analyzer failure (post-turn, background)** — non-blocking notice: "Your turn is complete, but
  updating stats/memory failed." → "Retry update". Never marks the Narrator reply as failed.
- **Provider authentication** — "[Provider] rejected the request." / "Check the key in Settings." →
  "Open provider settings".
- **Timeout / network** — "Couldn’t reach [provider]." / "The request timed out. Your message is
  saved." → "Retry".
- **Cancellation** — "Turn stopped." / "You stopped this turn. Your message is kept." → "Regenerate".
**Acceptance:** phase/role named correctly; Classifier failure never labeled a Narrator failure;
background Analyzer failure keeps the reply successful; each error states save-status + retry step +
copy-diagnostics.
