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

---

# v6 states & flows (supersede v5 attribute-related items)

## §Forge — states (event-driven; no fake %)
normal (stepper + active substep) · slow-90s ("still working") · degraded-180s (Cancel + Retry
failed step prominent) · repairing ("Repair attempt 1 of 2" on the fragment; indicator still moves) ·
provider-timeout (distinct from cancel; abortable) · validation-failed (names the exact invalid
object) · retry-fragment (only the invalid fragment re-runs; completed phases kept) · cancelled
(draft + persona + card + accepted phases retained) · resume-draft · success · reduced-motion. First
visible activity <1s; healthy <90s. **AC:** no numeric % in any state; a completed phase never
regenerates because a later fragment failed; retry resumes the fragment; cancel is safe + retentive.

## §Classifier — 7 error states
1 provider returned no content · 2 invalid JSON · 3 valid JSON with repairable field diffs
(normalized, ≤1 bounded repair) · 4 target/action could not be resolved · 5 low-confidence →
narration-only · 6 classifier unavailable → narration continued (classifier-skipped notice) · 7
retry succeeded → ruling attached. **AC:** null/empty optional fields never consume 4 repairs; a
failure never discards the turn; copy names the true cause.

## §Entities — scene-entity lifecycle
prose-mention → provisional scene entity (stable app ID + aliases) → included in the classification
roster → hard state instantiated from NPC template / generic default when mechanics first need it →
later identity reconciliation without changing historical IDs → rewind before first appearance
removes it. Ambiguous group → group target or one-line clarification. **AC:** the knife acceptance
scenario (narrate 3 mole rats → target "nearest rat" next turn → pre-narration ruling) passes.

## §XP — flow & states
ruling awards XP (engine) → Living Card/Dossier progress advances → threshold crossed → rank-up event
→ (overflow carries within the multiplicative curve). States: gained · rank-up · master (no further
XP) · multi-skill · diminishing (repeat trivial decays) · rewound (XP removed with the exchange).
**AC:** thresholds 100/250/625; failure = 25%; denied = 0; rollback on rewind.

## §Streaming — terminal (defect)
submit → thinking(opId,storyId) → streaming → **finalizing/"Saving turn"** → idle; branches:
error · timeout · cancelled · stale (token invalidated → watchdog clears without a duplicate call) ·
app-restart (resume or clear). **AC:** 30s-on-Play test — label clears + composer re-enables without
navigation.

## §Regen — destructive rulebook regeneration
entry (Story Settings) → impact summary (exact counts) → mechanic-source review → choose Duplicate
(safe) or Direct (typed confirm) → fragment-aware forge → **atomic install or rollback** → version
boundary in transcript/settings → success summary. Old rulebook + hard state stay usable until the
new one validates. States: entry · impact · review · forging · install · rolled-back · success ·
rollback-snapshot-retained. **AC:** never partially corrupts a story; old rulings archived, not
active; UI doesn't claim permanent deletion while a snapshot exists.

## §Persona — confirm flow
New Story (Full Stats) → premise/card → mechanic-source review → **persona confirm (required)** →
forge. No-persona → warned secondary path only. **AC:** the persona materially shapes starting
attributes/skills/state; `{{user}}` resolves to its name.

## §Primary provider — 7 scenarios (Settings)
1 configure OpenRouter then ElectronHub, set OpenRouter primary, re-save ElectronHub → OpenRouter
stays primary · 2 both inventories refresh independently, correctly labeled · 3 bind Narrator to
ElectronHub while OpenRouter primary → Narrator keeps ElectronHub · 4 change primary → valid bound
roles unchanged · 5 delete primary → explicit replacement required, never silent last-saved · 6
invalidate an unbound role → repair suggests primary but still requires a valid model · 7 reopen app
→ same primary restored. **AC:** exactly one primary when a valid provider exists; none otherwise;
saving/validating another provider never changes it.