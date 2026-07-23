# 01 · UX Spec — v6

Behavior + **exact UI copy** for the v6 decisions. Copy in `"quotes"` is literal. Registers
unchanged: STORY = warm serif / brass; SYSTEM = mono / teal (mechanics render SYSTEM). Supersedes
the v5 attribute copy; carries forward everything not restated here.

## §Attributes · 1–10 scale
Scores display **1–10**; modifier = `score − 5` (see the table in `00-PRODUCT-DECISIONS`). Shown as
`"BODY 7 (+2)"`. Average is 5 (+0). A **locked `0`** renders greyed with a lock glyph and the card's
reason, e.g. `"NEN — locked (unawakened)"`; it never rolls and has no modifier. Generated attribute
count is a soft 3–6; >6 only when a card/setting defines them, and the review UI makes that visible.

## §Persona · confirmation (Full Stats requires it)
Immediately before Full Stats forging, a prominent block: persona portrait/name, short description +
relevant traits, **source badge** (Default / Selected / Imported), **"Change persona"**, a preview of
detected player-mechanic cues, and the line: **"Your persona becomes your character — its
description, traits, and any stats shape your starting sheet."** An explicit acknowledgement is
required to forge. **Continue without a persona** is a clearly-warned secondary path only:
"Without a persona, your character starts from the world's defaults and `{{user}}` has no name."
No Stats also confirms the persona (drives `{{user}}` + prompt injection) but generates no sheet.

## §Macros · SillyTavern compatibility
Card fields keep their **original macro text**; expansion happens at prompt/display assembly, never
by rewriting the card. **No supported macro may reach the model or transcript unresolved** — raw
`{{user}}`/`{{char}}` leaking is a bug.

**Supported (deterministic) — evaluated at prompt/display assembly:**
- Participants: `{{user}}` (selected persona name), `{{char}}` (imported card identity), `{{persona}}`
  (persona description), `{{group}}`, `{{groupNotMuted}}`, `{{charIfNotGroup}}`, `{{notChar}}`.
- Card/persona fields: `{{description}}`, `{{personality}}`, `{{scenario}}`, `{{charPrompt}}`,
  `{{charInstruction}}`, `{{charDepthPrompt}}`, `{{charCreatorNotes}}`, `{{charVersion}}`,
  `{{mesExamples}}`, `{{mesExamplesRaw}}`, `{{charFirstMessage}}`, `{{original}}`.
- History (where locally available): `{{lastMessage}}`, `{{lastUserMessage}}`, `{{lastCharMessage}}`,
  `{{lastMessageId}}`, current/last swipe IDs.
- Legacy markers: `<USER>`, `<BOT>`, `<CHAR>`, `<GROUP>`, `<CHARIFNOTGROUP>`.

**Unsupported tier (separate):** variables, random selection, time/date, extension checks, and
side-effecting Macro Engine 2.0 expressions. These are **preserved, never silently deleted**, and
surface a **pre-forge compatibility warning**: "This card uses macros we don't evaluate: {{roll}},
{{random}}. They'll be left as-is in prompts." Creation is **blocked only** when an unknown macro sits
in a **required** prompt field; otherwise it proceeds with a visible unresolved-macro diagnostic.
Every macro's resolution value, context, evaluation time, determinism, absent-context behavior, and
allowed surfaces are tabulated in `04-IMPLEMENTATION-CONTRACT §Macros`.

## §Forge · speed + truthful progress
Targets: **first activity <1s**, **healthy <90s**, **slow warning at 90s**, **degraded at 180s** with
actionable choices, abortable provider timeout, No Stats never forges. Progress is a **discrete
stepper** (completed stages) + an **indeterminate** indicator inside the active provider call +
current stage/substep (`"Actions: Combat and Social — batch 1 of 2"`) + attempt (`"Repair attempt 1
of 2"`) + elapsed + last-successful-progress time. **No fake percentage.** Slow copy: "This is a
detailed world — still working." Degraded copy: "This is taking longer than usual." + **Cancel** and
**Retry failed step**. A completed phase is never regenerated because a later fragment failed; only
the invalid fragment repairs (cap 2). Cancellation retains the draft, persona, imported card, and
accepted phase output.

## §Regen · destructive rulebook regeneration
Entry: Story Settings → **"Regenerate rulebook"**. Impact summary with exact counts, then the
mechanic-source review, then two paths: recommended **"Duplicate story & regenerate"** (safe) and a
direct destructive path requiring the user to **type the story name** to confirm. Warning copy:
**"Regenerating replaces this story's entire mechanical system. Skills, XP, attributes, items,
resources, rulings, and checkpoints from the current rulebook will be wiped. Your prose, persona,
card, blueprint, and lorebooks are kept."** Old ruling artifacts become **archived historical text**
behind a version boundary (not shown as active). The old rulebook stays usable until the replacement
validates; failure/cancel rolls back atomically. A **rollback snapshot is retained** for a limited
period — copy never claims permanent deletion while it exists.

## §XP · mastery presentation
Ruling line: `"Quiet Hands +8 XP"`. Living Card + Dossier show rank, XP within rank, next threshold,
and a progress bar. Rank-up is an unmistakable inline event: **"Quiet Hands reaches Adept."** +
"what changes" line. Master shows `"Master — mastery complete."`. Multi-skill turns show one line
per skill. XP rolls back visibly on rewind. The skill definition and the earning action are readable
from the progression event.

## §Classifier · resilience & skipped path
On failure the player message stays saved, prose still generates, no hard state mutates, and a quiet
inline notice appears: **"Mechanics were skipped for this turn."** + **"Retry mechanics"** and
**"Configure Classifier"** when safe. Error copy names the real cause — invalid structured output,
timeout, auth, or empty — never a blanket "returned nothing." Null/empty/`unknown`/placeholder
optional fields normalize to omission; names/aliases resolve to IDs; a valid subset of intents
survives when another is malformed.

## §Entities · scene targets
An entity named only in recent prose (e.g. "three mole rats") becomes a **resolvable scene entity**
before the next mechanical classification, with a stable app ID + aliases ("the first mole rat",
"nearest rat", "it"). Ambiguous groups become a group target or prompt a one-line clarification.
Hard state is instantiated from an NPC template or generic defaults only when mechanics first need
it. Rewinding before first appearance removes the entity. No Analyzer/Narrator writes this state.

## §Definitions
Every attribute/skill/action explains itself (concise inline meaning + expandable detail). `"Quiet
Hands"` never appears as only a name + rank. Surfaces: Story Settings catalog, Living Card, Dossier,
ruling details, rank-up/XP events, denied-action notices, pre-forge review. Progressive disclosure —
the Play screen stays readable, not a rule manual.

## §Streaming · terminal (defect)
"The story continues" always exits: on completion → (brief) **"Saving turn"** while persistence runs
→ idle; on error/timeout/cancel/stale/restart → the matching terminal state. The composer re-enables
only when the operation is truly terminal. Acceptance: stream the final token, stay on Play 30s, and
the label disappears + composer re-enables without navigation.

## §Primary · provider
Copy uses **"Primary provider"** (never "current provider"). Each provider card has **"Make
primary"**; the primary shows a **"Primary"** badge + "Used as the default when picking models and
suggested for new roles. Your per-role model choices still win." On fresh setup the first validated
provider becomes primary automatically **with a stated, changeable choice** before confirming roles.
Making another provider primary shows an optional **"Apply to unassigned roles"** — it never migrates
valid bound roles. Removing/invalidating the primary requires an explicit replacement pick when
another valid provider exists; if none remains, the primary clears and the provider-setup-required
state applies. Saving/validating another provider never changes the primary.