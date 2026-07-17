# 02 · States & Flows

Every screen was designed with full state coverage. In the prototype each screen exposes a
**Demo** switcher (the chip row under the header) that cycles its states — use it to see each
one, then implement the same set. The `demo` value is just a prototype prop; in production these
are driven by real app state.

## Universal states (every screen)

- **Loading** — skeletons or a spinner; never a blank frame.
- **Empty** — an inviting first-run state with a clear primary action.
- **Error** — three families: **provider-auth** (key rejected/missing), **model-output**
  (model returned nothing/garbage), **network** (request failed/timed out). Each names the role
  or resource and the fix.
- **Overflow** — long titles, long lists, long prose all handled without breaking layout.
- **Narrow (~900px)** — side panels/drawers collapse to overlays or toggles.
- **Reduced motion** — `prefers-reduced-motion` collapses all animation.

---

## Per-screen state matrix

### Play (richest)
| State | What shows |
|---|---|
| Live turns | normal stream + composer; Send advances the scripted turn sequence |
| Mid-generation | composer disabled, thinking indicator ("The story continues…" + ink dots) |
| Denied | a DENIED ruling (no die) + prose explaining the gate |
| Death (combat) | stacked exchange, HP flash to a low/zero value; can lead to fallen state |
| Classifier-skipped | inline notice "Mechanics skipped this turn — classifier error"; narration only, stats unchanged |
| Model-failure | error card naming the role (Narrator), CTA "Try a recommended model →" (to Settings) |
| Trial-expired | composer gated in **every** story (generation disabled) and new-story creation gated; reading, chapters/arcs, and living cards stay fully open |
| Network-error | "Couldn't reach the provider," turn saved, resend to resume |
| Loading | thinking state on an otherwise seeded stream |
| Empty | first-turn prompt |
| Ambiguity | short input (<12 chars) shows a gentle hint row above the composer (prototype heuristic — see `03-IMPLEMENTATION-NOTES.md`) |
| Party strip | slim present-cast strip atop the stream (avatar · name · HP · mood glyph); fallen members use the fallen treatment; collapses to avatars-only in the narrow layout |

### Library
shelf · new-story premise overlay · forging interstitial · empty · loading (skeleton cards) ·
error (library folder unreadable) · trial-expired (banner over a dimmed shelf).

**Import a character card** (Chara Card V2/V3): from a file (PNG-with-embedded-data or JSON) ·
**import from URL** overlay with three fetch states (validating / fetched-preview /
rejected-with-reason, reusing KeyField styling) · **drag-drop** a .png/.json anywhere over the
Library (shelf dims, drop target "Drop a character card to import") · **import preview** (card
name, portrait if present, "Card format V2/V3" provenance) → Confirm seeds the new-story flow.

### Wizard
step 1 welcome · step 2 connect with key states idle/validating/valid/rejected + inline test
stream · step 3 model roles with expandable pickers.

### Overview
arc document · need-2-more-messages (summarize precondition) · summarizing (skeleton) ·
no-arc-yet (empty).

### Characters
cast grid · empty (no one named yet) · a-death (a fallen party member).

### Story Settings
default (rulebook, regeneration locked) — plus the locked banner is itself the "post-play"
state; DC/label edits remain live.

### Settings
providers show all four key states simultaneously (one per card) · role matrix with a
deliberate Advanced-fit mismatch · sampler sliders · license (trial).

### Personas / Card Creator / Lorebook
Personas: gallery + new-tile. Card Creator: live-updating preview (type in the form, watch the
card). Lorebook: list + editor, word-count warning past ~80 words, always-in-context toggle.

---

## Flagship flow 1 — First run: setup → first story

The newcomer's path from launch to playing. Screens: **Wizard → Library → (forging) → Play.**

1. **Wizard · Welcome.** Value prop + auto-playing Ruling vignette (teaser of the signature
   animation). → "Set up your storyteller."
2. **Wizard · Connect.** Guided OpenRouter card. User pastes a key →
   **idle → validating (spinner) → valid (green check + balance $4.82)**. On valid, an **inline
   test generation** streams two sentences to prove the pipe works. (Type a key containing
   "bad"/"xxx"/"0000" in the prototype to see the **rejected** state + reason.) Advanced
   disclosure lists other providers. → Continue.
3. **Wizard · Models.** Five roles pre-filled with recommended defaults. Expand any role to pick
   a different model (Recommended / Advanced badges, pricing). → "Enter the library."
4. **Library.** Empty shelf → "Begin your first story" → **premise overlay**. User writes a
   premise (or picks a seed). → "Forge this world."
5. **Forging interstitial.** Five stages check off in sequence: Reading your premise → Deciding
   the rules of this world → Writing the skill catalog → Placing your starting gear → Sealing
   the rulebook → **"The rules are set."** → "Step into the story."
6. **Play.** The story opens on its first prose. Newcomer is now playing.

## Flagship flow 2 — A full turn: premise action → ruling

The core loop, and the scripted demo sequence in `Play.dc.html`. Each **Send** advances one step
so a reviewer can see every ruling type in order:

1. **Send #1 — a denied action.** Player attempts to pick/force the reliquary gate. Because
   Kestrel lacks **Lockpicking**, the app returns a **DENIED** ruling (no dice, dashed glyph,
   `--dead` color) with a reason and a hint ("Wren carries picks. Ask her…"). Prose acknowledges
   the failure in-fiction. *Teaches the gate: you can't do what you haven't learned.*
2. **Send #2 — an NPC skill success.** Player asks Wren to open it. An **NPC ruling** rolls for
   Wren's Lockpicking (16 + 3 = 19 vs DC 15, SUCCESS). Her mastery ticks **3/5 → 4/5** with a
   gold shimmer in the drawer. Prose: the gate sighs open.
3. **Send #3 — a combat exchange (stacked ruling).** A grave-wight attacks. A **stacked**
   artifact shows two rolls: the wight hits Kestrel (15 vs DC 14 → **−5 HP**, drawer HP bar
   flashes and drops to 14) *and* Kestrel's riposte succeeds. *Shows NPC-vs-player and the
   living sheet reacting.*
4. **Send #4 — a natural 20 (critical) + mastery advance.** The finishing blow rolls a **nat
   20** → **CRITICAL SUCCESS** with the ring-burst flourish, and a **mastery advance** line:
   "Blade Adept reaches 5/5 — Kestrel advances to EXPERT (+5)." The drawer's Blade skill flips to
   Expert with a gold dot. *The payoff moment.*
5. **Send #5+ — narration only.** Pure prose, no ruling (the Classifier decided no roll was
   needed). Sending a very short input (<12 chars) triggers the **ambiguity hint** instead of a
   turn.

**Turn anatomy (each step):** composer disables → thinking indicator → Narrator prose streams
in word by word → the Ruling **mounts mid-stream and animates** → prose continues after it →
Analyzer's deltas flash on the living cards → composer re-enables. Esc closes the drawer, the
jump-to-latest anchor appears if the user scrolled up during generation.

---

## Acceptance checklist (for the real build)

- [ ] Two registers never cross (no brass dice, no teal names).
- [ ] Ruling animation matches the sequence in `01-DESIGN-SYSTEM.md`, and collapses under
      reduced-motion.
- [ ] Gate check happens **before** any roll; denied actions never show dice.
- [ ] Every screen implements loading / empty / error(×3) / overflow / narrow / reduced-motion.
- [ ] Play implements all eleven states in the matrix above.
- [ ] Stat/mastery/inventory changes are visible on the living cards the moment they happen.
- [ ] Rulebook regeneration is locked once messages exist; DC/label edits stay available.
- [ ] Trial expiry gates **generation in all stories AND new-story creation**; reading,
      chapters/arcs, and living cards stay open.
- [ ] Library supports character-card import (file), import-from-URL (3 fetch states), and
      drag-drop; copy says "character card," never "story file."
- [ ] Play shows a PartyStrip (default + narrow + fallen), also in the DesignSystem page.
- [ ] Key validation shows idle → validating → valid(+balance) / rejected(+reason).
