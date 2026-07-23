# 02 · States & Flows — v4

Per-screen **state matrices** and **flows**. The universal state set (apply where applicable):
**normal · loading · empty · slow · success · partial-success · recoverable-error · fatal-error ·
narrow-window · keyboard-focus · reduced-motion.** Each section ends with acceptance criteria (AC).

---

## §A · Lorebook import — flow & states
**Flow:** Import lorebook → pick file → parsing → preview (+conflict if name clash) → confirm →
[success | partial | validation-failure].

| State | Treatment |
|---|---|
| normal | Library with "Import lorebook" primary action |
| loading | "Reading lorebook…" spinner (reduced-motion: static) |
| empty | Library empty → "Import a lorebook" secondary CTA |
| slow | parse >3s: "Still reading — large file." |
| success | "Lorebook imported." + Open / Attach(active story) / Done + Imported badge |
| partial-success | "Imported 38 of 42 entries. 4 skipped." + Show skipped |
| recoverable-error | conflict unresolved, or fixable parse (e.g. wrong wrapper) → guidance + retry |
| fatal-error | unreadable file → reason + Show technical detail; only Cancel |
| narrow | preview rows stack; chips wrap; actions become full-width |
| keyboard-focus | dialog traps focus; Esc cancels; radios arrow-navigable |
| reduced-motion | no spinners; text-only progress |

**AC:** every conflict option reachable by keyboard; partial names skipped entries + reasons;
fatal error never blames the user without a reason; Attach only appears with an active story.

---

## §B · Forging — states (event-driven, no % ever)
| State | Treatment |
|---|---|
| normal | 5-phase list, one active; elapsed timer; phase-accurate explanation |
| loading | identical — forging *is* the loading experience |
| slow-30s | "This world is a detailed one — still working." |
| slow-2min | "…keep this open or leave — we’ll finish in the background." |
| slow-5min | "Taking longer than usual." + prominent Run diagnostics / Cancel |
| success | all phases ✓ → "The rules are set." → "Step into the story" |
| partial-success | phase completed with warnings (e.g. skill catalog trimmed) → ⚠ note, continues |
| recoverable-error | phase failed → Retry step (resume) / Start over / Cancel + retained-data line |
| fatal-error | unrecoverable (e.g. auth) → Open provider settings / Cancel + diagnostics |
| narrow | phase list single column; timer under title |
| keyboard-focus | Cancel/Retry reachable; focus ring visible |
| reduced-motion | active phase uses a static ◈ marker + text, no spin/pulse |

**AC:** no numeric percentage in any state; retry resumes from the failed phase and says what’s
retained; cancel is safe + explained; diagnostics present after failure; reduced-motion honored.

---

## §D · Active-story context — states
| State | Treatment |
|---|---|
| normal | header breadcrumb "Library / [Story]"; rail Story shows title; window title set |
| loading (restore) | story tabs show "Opening [Story]…" skeleton — never "No story open" |
| empty (no active story) | Story rail item dimmed → clicking routes to Library "Open a story" |
| recoverable-error | story folder slow/locked → "Trouble opening [Story]" + Retry |
| fatal-error (deleted/moved) | recovery: "This story could not be found." + Back to Library / Locate folder |
| narrow | breadcrumb collapses to "[Story] ▾" menu |
| reduced-motion | skeleton is static |

**Flow (switch):** open story B from Library while A active → A’s active-story pointer replaced by
B; if A has a generation running, it continues in the background (see §E).
**AC:** active story survives non-story navigation + restart; deleted/moved → recovery; no
"No story open" during restore.

---

## §E · Navigation during generation — states
| State | Treatment |
|---|---|
| normal (generating, on story) | in-transcript player message pinned + Narrator placeholder |
| navigated-away | global indicator: "[Story] · Narrating…" + Return to story |
| multi-op | indicator counts "2 stories generating" → popover list |
| success (away) | toast "[Story] — your turn is ready." → Open |
| failure (away) | toast "[Story] — generation failed." → Open (routes to error state, §M) |
| reopen mid-gen | transcript restores placeholder; composer shows "Generating…" disabled |
| cancel | "Stop this turn?" → stopped turn keeps player message + Regenerate |
| app-close mid-gen | guard dialog "A turn is still generating. Close anyway?" |
| reduced-motion | indicator pulse replaced by static dot |

**AC:** player + Narrator messages never vanish; indicator names story + phase + return; completion
and failure both notify; reopening restores placeholder; close is guarded; multi-story represented.

---

## §H · History / rewind — flow & states
**Flow:** hover exchange → Rewind to here → confirm preview → applied (later exchanges removed, hard
state restored). Separate: ⋯ → Delete from this exchange → distinct confirm.
| State | Treatment |
|---|---|
| normal | each exchange shows actions on hover/focus |
| confirm (rewind) | preview: kept exchange, N removed, checkpoints affected, "summaries rebuilt", "can’t be undone" |
| confirm (delete-from) | red-tinted, different title/verb, removes selected + all after |
| applied | transcript truncated; a subtle "Rewound to here" marker on the now-last exchange |
| empty (first exchange) | Rewind on the only exchange disabled with tooltip "Nothing to rewind" |
| narrow | dialog full-width; detail rows stack |
| keyboard-focus | destructive action is NOT the default focus; Cancel is |
| reduced-motion | no truncation animation |

**AC:** exchange indivisible; Rewind keeps selected + removes only later; Delete-from is separately
named/placed/colored; previews show exact counts + reversibility; destructive isn’t default-focused.

---

## §I · Persona confirm — flow & states
**Flow:** New Story → (premise|import card) → **mechanics mode (§L)** → **persona confirm** → forge.
| State | Treatment |
|---|---|
| normal | "You will play as [persona]" + avatar/name/tagline + Change persona |
| default | global default persona pre-selected |
| from-card | note "The imported card becomes a character in the world — you play as your persona." |
| empty (no persona) | "Create a persona to play as" → editor; cannot proceed |
| change-mid-play | Story Settings confirm: earlier turns keep original framing |
| narrow | persona card stacks above actions |
| keyboard-focus | Change persona + Confirm reachable; picker is a focus-trapped menu |

**AC:** creation requires explicit persona (no "Traveler"); card≠player copy present; no-persona
blocks with a fix; mid-play change explained.

---

## §L · Mechanics mode — flow & states
**Flow:** story creation mode step (Prose only / Light rules / Full rules) → carries into forge +
Story Settings.
| State | Treatment |
|---|---|
| normal | 3 selectable cards with examples; one selected |
| prose-only active | Play hides ruling area, dice, skill gating, mastery entirely |
| light active | checks + mastery, minimal bookkeeping; no attributes |
| full active | full engine; attribute layer hidden pending N2 |
| change-more-mechanics | "New turns will use [mode]. Earlier turns keep how they were told." |
| change-fewer-mechanics | "Mechanics will pause for new turns. Your sheet is kept but won’t change." |
| narrow | mode cards stack |
| reduced-motion | selection change has no animation |

**AC:** three modes with examples; prose-only suppresses all mechanics; mode shown in Story
Settings; mode change never silently reinterprets prior turns.

---

## §M · Model-error — states (per role/phase; see 04 §M taxonomy)
Each maps to distinct copy in UX §M. Shared structure: **what failed (role+phase) · was the player
message saved · which step retries · copy diagnostics.**
| Error | Blocking? | Player msg saved | Primary retry |
|---|---|---|---|
| Classifier invalid | yes (this turn) | yes | Retry mechanics / Skip mechanics |
| Rules resolution | yes | yes | Retry ruling |
| Narrator empty | yes | yes | Regenerate / Try recommended |
| Analyzer (post-turn) | **no** (background) | yes (turn done) | Retry update |
| Provider auth | yes | yes | Open provider settings |
| Timeout / network | yes | yes | Retry |
| Cancellation | n/a | yes | Regenerate |

**AC:** the role + phase are named accurately; Classifier failure is never "Narrator returned
nothing"; background Analyzer failure keeps the reply successful; every error states save-status +
retry + copy-diagnostics; narrow + reduced-motion respected.

---

## Cross-screen universal-state checklist
Every affected screen must implement, where applicable: normal, loading, empty, slow, success,
partial-success, recoverable-error, fatal-error, narrow-window (~900px), keyboard-focus (visible
ring + logical order + Esc/Enter), reduced-motion. Screens expose these via a **Demo** switcher in
the prototype (prototype-only affordance; gate behind a dev flag in production).
