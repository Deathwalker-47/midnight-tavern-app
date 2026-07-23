# 03 · Component States — v4

Component-level contracts for the pieces the directive calls out. Rendering guidance is
prototype-accurate; production must match the *behavior*, not the exact DOM.

---

## §C · SillyTavern-compatible safe renderer

**Goal:** render common text found in ST-style card greetings and long RP replies, safely. This is
a compatibility target — not a visual clone.

### Grammar (supported)
| Construct | Input | Rendered |
|---|---|---|
| Paragraph | blank line between blocks | new `<p>`, para spacing |
| Line break | single newline | `<br>` within a paragraph |
| Italic / action | `*creeps forward*` | italic, story-tone color |
| Bold | `**never**` | bold |
| Combined | `***both***` or `**_x_**` | bold + italic |
| Dialogue | `"Give me a moment."` | subtle brass quote tint (quotes kept) |
| Scene separator | line that is only `---` / `***` / `* * *` | horizontal rule |
| Unordered list | lines starting `- ` / `* ` | `<ul>` |
| Ordered list | lines starting `1. ` | `<ol>` |
| Inline code | `\`token\`` | mono chip (only when useful) |
| Escaped char | `\\*not italic\\*` | literal `*not italic*` |

### Sanitizer (deny — never executes/loads)
Raw HTML tags → escaped to text; `<script>`/`<style>`/`<iframe>`/event handlers → stripped;
card CSS / `class`/`style` attributes → ignored; images/remote embeds → not loaded (show
"🚫 image blocked" chip with alt text); links → rendered as **inert** text with a hostname note
(`example.com — links are disabled in-story`); `javascript:`/`data:` URLs → never linked.

### Edge behavior
- **Malformed/unclosed** (`**bold with no close`) → render literally as typed; no dangling styled run.
- **Very long unbroken token** → `overflow-wrap:anywhere`; never breaks layout width.
- **Streaming** → an open `**` renders plain until its pair arrives; no style flof flicker between tokens.

### Before / after fixtures
1. **Imported greeting:**
   IN: `*She looks up from the map.* "You're late." **Again.**`
   OUT: *She looks up from the map.* "You're late." **Again.** (italic action, quoted line tinted, "Again." bold)
2. **Injection attempt:**
   IN: `<img src=x onerror=alert(1)> <script>steal()</script> Nice to meet you.`
   OUT: literal-escaped `<img …>` + `<script>…` shown as inert text; nothing executes; "Nice to meet you." renders normally.
3. **Long RP reply:** multi-paragraph with `---` separators, a `- ` list of options, and mixed
   emphasis → paragraphs spaced, rule between scenes, list rendered, emphasis applied.

**AC:** every grammar row renders; every deny-row is inert; malformed markup never leaks tokens or
breaks layout; streamed markdown stabilizes without flicker.

---

## §F · Exchange unit
An **exchange** is one indivisible block:
```
[ Player message / action ]
[ resolution activity → ruling(s) ]     (omitted entirely for prose-only turns)
[ Narrator reply (streams beneath rulings) ]
[ actions: Branch · Regenerate · Delete · Copy ]   (hover/focus)
```
Rulings belong to **their** exchange and render between that player message and that Narrator reply —
never beneath a later exchange. Stacked rulings (e.g. NPC action + player reaction) group inside the
one exchange under a quiet "Exchange · N rolls" caption; they must not read like a debug console
(no raw JSON, no stack of monospace boxes without headings).
**States:** normal · streaming (Narrator placeholder + caret) · prose-only (no ruling area) ·
stacked (2+ rulings grouped) · error (ruling/Narrator failed → §M inline) · reduced-motion (no caret
blink). **AC:** ruling↔exchange association is structural; prose-only omits ruling area; stacked
rulings are legible, not console-like.

---

## §G · Ruling artifact — schema + summary/expand
**Summary line (always):** `[Actor] attempts [Action] using [Skill] ([Rank]). d20 [roll] + Mastery
[m]( + Attr [a])( + Ctx [c]) = [total] vs DC [dc] — [Outcome].` Verdict stamp keeps the v3 style
(success/failure/crit/denied/opposed), teal system register.
**Expanded fields:** actor · attempted action · relevant skill · target (if any) · gate requirement
& denial reason · die result · mastery modifier · **attribute modifier (only when attribute system
enabled — N2)** · contextual modifier · total vs DC / opposing total · outcome · costs paid · state
effects · mastery progress / rank advancement.
**Denied:** no dice; shows the missing requirement + a suggested valid alternative when one exists
(UX §G example). **AC:** all fields present in expand; attribute row hidden unless N2 enabled; denial
explains + suggests; summary matches the grammar.

---

## §K · Mastery meter
Per skill, in Play card + dossier:
```
Lockpicking   Adept  +3      ●●●●○○   4/6 → Expert
```
- rank label + modifier (`+1/+3/+5/+7` for Novice/Adept/Expert/Master)
- successes completed / required + pips or bar
- **progress-gained** micro-state after a ruling ("+1")
- **rank-up** moment: inline celebration in the exchange + "what changes" line
- **max rank:** "Master (+7) — highest rank" (bar full, no target)
- dossier **history:** list of rank-ups with chapter/turn
**States:** normal · progress-gained · rank-up · max · recently-changed (gold dot) · reduced-motion
(no pulse). **AC:** all fields visible without Story Settings; rank-up unmistakable; max state clear;
history present in dossier.

---

## §A · Lorebook compatibility matrix + fixtures
### Compatibility matrix
| Field | SillyTavern World Info | Agnai book | Midnight Tavern | Mapping |
|---|---|---|---|---|
| entry text/content | `content` | `entry` | `content` | direct |
| trigger keys | `key[]` | `keywords[]` | `keys[]` | direct |
| secondary keys | `keysecondary[]` | — | `keysAll[]` | merged (AND group) |
| enabled | `disable` (inverted) | `enabled` | `enabled` | normalized to `enabled` |
| always-on | `constant` | `alwaysOn` | `alwaysOn` | direct |
| insertion order | `order`/`insertion_order` | `priority` | `priority` | direct |
| scan depth | `depth` | — | `depth` | direct (default if absent) |
| selective logic | `selective`+`selectiveLogic` | — | `matchMode` | best-effort; **lossy** if unsupported logic |
| regex trigger | `key` w/ `/re/` | — | — | **unsupported → skipped (partial)** |
| position (char-relative) | `position` | — | — | **lossy** (dropped, noted) |
| card CSS / HTML | (embedded) | — | — | **stripped** (see §C) |

### Example fixtures (ship in `reference/fixtures/`, documented here)
- `st-worldinfo-basic.json` — 3 entries, 1 always-on → clean import.
- `st-worldinfo-lossy.json` — includes `position` + `selectiveLogic:AND_ANY` → imports with lossy-field notice.
- `st-worldinfo-regex.json` — 1 regex-keyed entry → **partial** (that entry skipped, reason "unsupported regex trigger").
- `agnai-book.json` — Agnai shape → mapped via matrix.
- `broken-array.json` — top-level array, no `entries` → **validation failure** with reason + technical detail.
**AC:** detected format labeled from the matrix; lossy fields listed in preview; regex/unsupported
entries skipped with reasons; broken file yields a plain-language failure + technical detail.

---

## §H · Rewind confirm preview (component)
Two distinct destructive components, never sharing "Rewind":
- **Rewind to here** — neutral/brass; preview rows: kept exchange summary · "Removes N later
  exchanges" · "Checkpoints affected: N" · "Summaries after this point will be rebuilt" · footer
  "This can’t be undone."
- **Delete from this exchange** — red-tinted, in ⋯ menu; "Removes this exchange and everything after
  it (N total)." · "Hard state returns to the end of the previous exchange."
**AC:** different titles/verbs/placement/color; exact counts; reversibility stated; Cancel is the
default focus.

---

## §D/§E · Active-story + background-generation chrome (component)
- **Breadcrumb:** "Library / [Story]" (collapses to "[Story] ▾" when narrow).
- **Rail Story group:** glyph + active story title; returns to last active story.
- **Window title:** "[Story] — Midnight Tavern" in story context; "Library — Midnight Tavern" else.
- **Background-generation indicator:** pinned near rail bottom; shows story title + phase + Return;
  counts multiple ("2 stories generating"); completion/failure toasts.
- **Restore skeleton:** "Opening [Story]…" (never "No story open").
**AC:** present across all story tabs; survive navigation + restart; reduced-motion static.
