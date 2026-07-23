# 02 · States & Flows — v5

Universal state set where relevant: normal, loading, empty, slow, success, partial-success,
recoverable-error, fatal-error, narrow-window, keyboard-focus, reduced-motion. Supersedes v4's
three-mode content.

## §NoStats — creation & play
**Creation (short path):** premise or imported card → stat-system = No Stats → persona confirm →
blueprint/narration confirm → open. No forging phases (no Story AI). An opening that needs
generation uses the **global Narrator** with a simple Narrator-generation state — never "forging
skills/attributes/gear/rules".
**Play states:** normal (player → Narrator reply); loading (`Narrating…` only); empty (opening
message); slow; recoverable/fatal (Narrator/provider/network/cancel only); narrow; focus;
reduced-motion. **Never present:** resolution placeholder, ruling area, dice, locked-die, mastery,
mechanical inventory, attribute sheet, or any mechanics/role error.
**AC:** only the Narrator is invoked; no mechanical UI or error can appear.

## §FullStats — creation & forge
**Creation:** premise/card → Full Stats → role-readiness check → persona confirm → blueprint confirm
→ **forge**. Attribute-aware phases (truthful detail, no fake %): 1 Reading premise & card/persona
cues · 2 Defining the stat system & genre attributes · 3 Resources, tiers, skills & prerequisites ·
4 Action & item catalogs incl. governing attributes · 5 Characters, attribute scores, gear & NPC
templates · 6 Validate references & seal. (May keep 5 visible phases nesting attribute work, but the
active detail must truthfully name attribute generation/validation.)
**Readiness-failure states:** required role missing (→ Complete-Full-Stats-setup); attribute-gen
validation failure; action references unknown governing attribute; character missing expected score
→ default 10/+0; provider failure with phase-level retry; cancel with retained draft + persona.
**AC:** attributes visibly generated/validated; no fake %; missing role gates before forge.

## §Attributes — demo states (11, prototype-required)
1 ordinary 3-attr · 2 six-attr · 3 >6 imported/superhero · 4 raw (`d20+attr`) · 5 skilled
(`d20+attr+mastery`) · 6 opposed (both sides' terms) · 7 flat/luck (`d20`) · 8 attribute-gated skill
denial · 9 attribute changed by engine effect · 10 superhuman > 20 · 11 missing → 10/+0 (diagnostics
only). Layouts handle 3, 6, >6 without clipping.

## §Reveal — frozen catalog states
hidden→revealed · revealed-not-learned · learned-at-Novice · action-now-available · denied-still-
locked (names locked prereq) · reveal reason line · dossier progression history · Story Settings
total-vs-revealed counts · rewind removes a post-selection reveal. **AC:** every reveal references a
pre-existing sealed ID; no runtime-created definitions.

## §Switching — flows & states
**Full→No Stats** and **No Stats→Full Stats** (new-forge vs paused-resume). Each: confirm (roles
activating/dormant, data preserved, previous exchanges unchanged, forge required?, cancellable?),
in-progress, failure, retry, success, rollback. A permanent timeline **boundary marker** records the
change. **AC:** history never reinterpreted; boundary marker present; new-forge path checkpoints
before enabling mechanics.

## §Migration — existing `light`
One-time, two destinations only: Continue as No Stats · Upgrade to Full Stats. States: decision,
backing-up, upgrading (forge), validation-fail + retry/rollback, success, No Stats pause result.
**AC:** pre-migration backup; earlier turns unchanged; no permanent third mode; no hidden "legacy
light".

## §H — rewind (carried from v4)
Exchange indivisible. "Rewind to here" keeps the selected exchange, removes later ones, restores hard
state to that exchange's end, exact preview + "can't be undone". "Delete from this exchange" is
separate, red, differently named. **AC:** kept-selected; separate delete; exact counts.

## §NoStats screens — intentional states (not empty shells)
- **Overview:** no pretend Summarizer output; a designed explanation of No Stats continuity (local
  transcript/persona/lorebooks assembled; automatic analyzer-evolution & auto-summaries unavailable).
  Any manual notes / pinned memories / explicit Narrator condensation are labeled, never hidden.
- **Characters / Living Card:** identity, avatar, description, authored traits remain; no attributes/
  resources/skills/mastery/mechanical inventory/analyzer-evolving fields; no empty bars or zero sheets.
- **Story Settings:** Narrator-only summary + blueprint/persona/lorebook + formatting/narration +
  guarded "Enable Full Stats"; mechanical catalogs hidden unless showing a preserved historical sheet.