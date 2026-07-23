# Midnight Tavern — Handoff V6 Design Instructions

**Status:** Design work only. Do not begin implementation.

**Required output:** Create a new `Design/handoff-v6/` revision. Keep
`Design/handoff-v5/` unchanged as historical reference.

## Purpose

Revise the V5 product and interaction designs for the eleven changes below. Focus on product
behavior, user flows, information hierarchy, states, copy, and screen designs.

Do not include code investigations, log analysis, database design, function names, retry
algorithms, or implementation patches in the design handoff. Engineering will determine those
details after V6 is approved.

## Source material

Use:

- `Design/handoff-v5/` as the current design baseline;
- `Design/attribute-integration.md` for the Full Stats mechanics foundation;
- SillyTavern's macro reference for compatibility expectations:
  `https://docs.sillytavern.app/usage/core-concepts/macros/`;
- the confirmed requirements in this document.

If V5 conflicts with this document, this document wins.

## Confirmed product decisions that remain unchanged

- Story creation offers exactly two systems: **No Stats** and **Full Stats**.
- No Stats is a prose-only mode. Only the Narrator model participates.
- Full Stats uses attributes, skills, actions, rulings, and progression.
- There is one global Narrator assignment. Story Settings must not create a second Narrator
  assignment.
- Ordinary play cannot silently alter the rulebook.
- The user may type free-form actions; the UI must not restrict play to a button list.
- Rewind and Delete remain separate operations.
- Do not introduce another Controller or DM model role.

## Scope of the V6 revision

1. Improve the long story-forging experience and its stalled progress presentation.
2. Preserve attributes explicitly supplied by a story or character card.
3. Support SillyTavern macros, including correct `{{user}}` and `{{char}}` meaning.
4. Design graceful states for intermittent mechanics/classifier failure.
5. Ensure mechanically meaningful actions, such as attacking with a knife, can trigger a ruling.
6. Replace use-count skill advancement with DM-awarded XP and exponential progression.
7. Ensure the streaming/thinking indicator always reaches a clear terminal state.
8. Make persona selection and confirmation prominent before Full Stats creation.
9. Give every attribute, skill, and action a clear definition.
10. Allow destructive rulebook regeneration with strong warnings.
11. Add an explicit Primary model provider in Settings.

---

## 1. Story forging experience

### User problem

Full Stats creation can take several minutes. The current progress presentation appears to stop
early, leaving the user unsure whether the application is working.

### Required design

Design a forging interstitial that:

- immediately confirms that forging started;
- shows meaningful named phases rather than a decorative progress bar;
- visibly continues animating while work is active;
- shows elapsed time;
- distinguishes normal, slow, and unusually delayed states;
- reassures the user that the application is still working;
- provides a safe Cancel action;
- provides Retry when a phase fails;
- makes success, cancellation, timeout, and failure visually distinct;
- never displays a false percentage when real progress is unknown.

The design must not present a loader as the solution to the underlying performance problem.
Engineering will separately reduce unnecessary generation and repair work.

### Required states

- Starting
- Generating world foundation
- Generating mechanics
- Validating
- Correcting a generated section
- Saving
- Slow
- Unusually delayed
- Failed with retry
- Cancelled
- Completed

Show how the interface communicates repeated correction attempts without looking frozen.

---

## 2. Card-defined attributes and persona fidelity

### Required behavior

If an imported card explicitly defines its attribute system or starting values, the generated
rulebook and player sheet must preserve that information. The generator must not quietly replace
those mechanics with a different set.

For newly generated Full Stats systems:

- the normal attribute count is **3–6**;
- normal displayed attribute scores use a **1–10** scale;
- attributes have full names, short labels, and plain-language definitions;
- the selected persona materially influences the player character's starting attributes, skills,
  inventory, identity, and relevant background.

### Source review

Before forging, show a concise Mechanics Preview that identifies:

- mechanics found in the card;
- mechanics derived from the selected persona;
- mechanics that will be generated;
- conflicts that require user confirmation.

The design must distinguish card-supplied, persona-derived, and generated mechanics without making
the creation flow feel like a technical editor.

### Decisions V6 must resolve

- Define the score-to-modifier presentation for the new 1–10 scale.
- Decide how an explicit locked or unavailable `0` value is shown when normal scores are 1–10.
- Define what happens when the card and persona provide conflicting starting information.
- Define when the user may override card-provided mechanics and how strongly that override is
  warned.

---

## 3. SillyTavern macro compatibility

### Required behavior

At minimum:

- `{{user}}` means the currently attached player persona;
- `{{char}}` means the imported card character or story character represented by the card;
- supported macros must resolve before content is sent to a model or shown as story prose;
- raw supported macro tokens must never leak into the visible chat.

V6 must include a compatibility table based on the official SillyTavern macro reference. Classify
macros as:

- supported;
- intentionally unsupported with a clear reason;
- not applicable to Midnight Tavern.

### Required UX

Design:

- an import warning when unsupported macros are detected;
- a readable list of affected fields;
- a safe fallback preview;
- a way to continue, edit, or cancel the import.

Do not invent Midnight Tavern-specific meanings for established SillyTavern macros.

---

## 4. Mechanics rulings, universal actions, and failure states

### User problem

A clearly mechanical prompt such as attacking an enemy with an inventory knife can sometimes
receive ordinary prose without a DM ruling. Mechanics/classifier failure is also sometimes shown as
"returned nothing" even when the broader turn could continue.

### Required Full Stats behavior

- A mechanically consequential action must be evaluated before the Narrator response.
- Free-text wording must be mapped to the closest applicable mechanical action when reasonable.
- The absence of an exact story-specific action name must not automatically bypass the ruling.
- The ruling must clearly identify the attempted action, relevant target, attribute, skill, stakes,
  outcome, and XP award.
- The Narrator response follows the ruling and reflects its result.

### Universal action foundation

Design a small, stable set of universal action families available in every Full Stats story.
Candidate families include:

- attack or harm;
- defend or avoid;
- move or overcome an obstacle;
- observe or investigate;
- influence or deceive;
- use an item;
- assist;
- recover or rest.

V6 must decide the final list and explain how story-specific actions specialize these foundations.
Do not turn the universal list into mandatory UI buttons or block creative free-text play.

### Scene targets

The ruling flow must support a relevant person, creature, or object introduced in recent narration,
even if it was not present when the story was first forged. Design the visible states for:

- target recognized;
- target ambiguous;
- target unavailable;
- user clarification required.

### Graceful mechanics failure

Keep narration usable when mechanics cannot be resolved safely. Design an inline notice that:

- accurately says mechanics could not be resolved;
- does not falsely claim the provider returned nothing;
- lets the user retry mechanics;
- lets the user continue with narration-only for that turn;
- offers a route to model configuration when appropriate.

Classifier robustness and correct trigger detection are engineering defects. The design agent only
needs to provide the user-facing states and recovery flow.

---

## 5. XP-based skill progression

### Confirmed direction

Skill progression is based on XP awarded by the DM ruling, not the number of successful uses.
Higher ranks require exponentially more XP.

The progression sequence remains:

- Novice
- Adept
- Expert
- Master

### V6 must define

- XP thresholds for each rank;
- the exponential growth rule;
- the permitted XP range for one action;
- how difficulty, risk, quality, and outcome affect XP;
- whether failure can grant practice XP;
- anti-grinding rules for trivial repeated actions;
- whether XP can ever be reduced;
- rank-up timing and presentation.

### Required presentation

Design:

- compact XP progress on the Living Card;
- detailed progress and history in the Character Dossier;
- XP granted inside each ruling;
- a noticeable but non-blocking rank-up moment;
- explanations of why XP was granted or withheld.

---

## 6. Persona confirmation before forging

### User problem

The player character depends heavily on the selected persona, but the current creation flow does not
make that dependency prominent enough.

### Required design

Before a Full Stats forge begins, show a prominent persona confirmation block containing:

- persona name and avatar;
- a concise identity/background preview;
- the information that will influence character generation;
- Change Persona;
- Edit Persona;
- confirmation that this is the intended player character.

V6 must decide whether a persona is mandatory or whether the user may proceed through a strong
warning. An accidental or absent persona must never pass unnoticed.

No Stats may use a lighter confirmation because it does not generate mechanical player state.

---

## 7. Definitions for attributes, skills, and actions

### Required behavior

Every generated or imported:

- attribute;
- skill;
- action;

must have a clear, readable definition explaining what it means and when it applies.

Actions should additionally communicate:

- relevant attribute and skill;
- typical use;
- examples;
- limitations or prerequisites.

### Required surfaces

Show definitions through:

- tooltips or compact disclosure on the Living Card;
- full entries in the Character Dossier;
- rulebook detail in Story Settings;
- the Story Blueprint review before forging;
- accessible mobile/keyboard behavior rather than hover-only interaction.

These meanings must also guide DM rulings, but prompt assembly and retrieval are engineering work and
do not belong in the design handoff.

---

## 8. Streaming and thinking terminal states

### User problem

After prose finishes streaming, "The story continues" can remain visible until the user navigates
away and returns.

This is an engineering defect, not a request for a new visual concept.

V6 should preserve the current visual language and document that the activity state ends on:

- successful completion;
- failure;
- timeout;
- cancellation;
- navigation;
- application restoration.

If final saving continues briefly after streaming, use a distinct short `Saving…` state. The input
must not remain indefinitely disabled.

---

## 9. Destructive rulebook regeneration

### Required behavior

Story Settings must allow the user to regenerate an unsatisfactory rulebook.

Regeneration is a destructive exception to ordinary rulebook immutability. It must clearly warn that
existing rule-dependent data will be replaced or wiped.

### Required flow

Design:

1. Regenerate Rulebook entry point.
2. Plain-language explanation of why this is destructive.
3. Impact summary identifying affected attributes, skills, actions, XP, rulings, inventory, flags,
   and other mechanical state.
4. Persona, card, and mechanics-source review.
5. A recommended safer Duplicate Story and Regenerate path.
6. A strongly confirmed direct regeneration path.
7. Forging progress using the V6 progress design.
8. Success and failure outcomes.

The old story must remain usable if regeneration is cancelled or fails.

### V6 must resolve

- Which story content remains after direct regeneration?
- Are old rulings hidden, archived, or removed?
- Is a rollback copy retained?
- How is the new rulebook boundary communicated in an existing transcript?

---

## 10. Primary model provider

### User problem

Settings allows multiple providers but provides no explicit way to choose which provider is the
default. Saving or validating providers can therefore make later defaults and model selection feel
unpredictable.

### Required behavior

Use the user-facing term **Primary provider**.

- Settings must show which configured provider is Primary.
- Every configured provider offers a clear Make Primary action.
- The first successfully configured provider may become Primary during initial setup.
- Adding, saving, validating, or refreshing another provider must not silently change Primary.
- Changing Primary must not silently rewrite valid model-role assignments.
- A role explicitly assigned to a non-primary provider continues to use that provider.
- Primary is the initial suggestion for provider-aware pickers, new/unassigned roles, and recovery
  when a role loses its provider.
- Model lists must remain visibly associated with their actual provider.

### Required states

Design:

- no providers configured;
- first provider becomes Primary;
- multiple providers with one Primary badge;
- Make Primary confirmation and success;
- Primary provider disconnected, invalid, or removed;
- replacement-primary choice;
- Primary provider's model list fails to load;
- role remains bound to a different provider.

If no valid provider remains, return to the existing provider-setup-required state.

### V6 must resolve

- Which exact screens and pickers use Primary as their initial suggestion?
- Is switching Primary immediate or confirmation-gated?
- When Primary is removed, must the user choose a replacement or may the app suggest one for
  confirmation?

---

## 11. Required screens and component states

Create or revise high-fidelity designs for:

1. **Story Creation / Blueprint**
   - persona confirmation;
   - card/persona/generated mechanics preview;
   - 1–10 attribute preview;
   - macro compatibility warning.
2. **Forging Interstitial**
   - meaningful phases;
   - continuing activity;
   - elapsed time;
   - slow, delayed, retry, cancel, failure, and success states.
3. **Play**
   - ruling before narration;
   - universal and story-specific action interpretation;
   - ambiguous target;
   - mechanics skipped/retry;
   - XP and rank-up;
   - terminal streaming/saving states.
4. **Living Card**
   - 1–10 attributes;
   - definitions;
   - XP progress;
   - locked/unavailable attribute.
5. **Character Dossier**
   - full definitions;
   - mechanic source;
   - XP history.
6. **Story Settings**
   - readable rulebook;
   - destructive regeneration flow.
7. **Settings / Providers**
   - Primary badge and Make Primary;
   - replacement-primary flow;
   - per-provider model loading and errors.
8. **Design System**
   - forging phase component;
   - slow/delayed notice;
   - mechanic-source label;
   - macro warning;
   - definition disclosure;
   - XP progress and rank-up;
   - mechanics-failure notice;
   - destructive confirmation;
   - Primary provider treatment.

---

## 12. Mandatory decisions before implementation

The V6 handoff is not implementation-ready until it answers:

1. What modifier presentation accompanies the 1–10 attribute scale?
2. How is an explicit locked `0` represented?
3. How are card/persona mechanic conflicts resolved?
4. Is persona selection mandatory for Full Stats?
5. Which official SillyTavern macros are supported?
6. What happens to unsupported macros?
7. Which universal action families exist in every Full Stats story?
8. How do story-specific actions specialize universal actions?
9. How are narrated targets clarified when mechanically ambiguous?
10. What XP thresholds, award ranges, and anti-grinding rules apply?
11. What exactly is wiped, preserved, or archived during rulebook regeneration?
12. Is a rollback or duplicate mandatory for regeneration?
13. Which surfaces use the Primary provider as their initial suggestion?
14. What is the replacement flow when Primary is removed or invalid?

Do not leave unresolved items hidden in implementation notes. Mark any unresolved decision clearly
and label the handoff not implementation-ready.

---

## 13. Required V6 deliverables

At minimum:

- `README.md`
- `00-WHATS-NEW-V6.md`
- `00-PRODUCT-DECISIONS.md`
- `00-PRODUCT-SPEC.md`
- `01-UX-SPEC.md`
- `01-DESIGN-SYSTEM.md`
- `02-STATES-AND-FLOWS.md`
- `03-COMPONENT-STATES.md`
- `03-IMPLEMENTATION-NOTES.md`
- `04-IMPLEMENTATION-CONTRACT.md`
- updated high-level and low-level reference plans;
- updated screen prototypes for every surface in section 11;
- a V5 → V6 decision-delta checklist.

Implementation notes should describe behavior and constraints needed to preserve the approved
design. They should not contain speculative code patches or repeat the engineering investigation.

---

## 14. Acceptance checklist for the design revision

V6 is ready to return only when:

- all eleven requested changes are represented;
- the forge clearly communicates active, slow, failed, cancelled, and completed work;
- card-defined mechanics and the chosen persona are visibly reviewed before Full Stats forging;
- normal attributes use the agreed 3–6 count and 1–10 scale;
- `{{user}}` and `{{char}}` have correct, visible compatibility behavior;
- a free-text knife attack demonstrates a ruling before narration;
- universal actions do not restrict creative free-text play;
- a mechanics failure can be retried or skipped without losing the whole turn;
- skill advancement is XP-based and visibly exponential;
- attributes, skills, and actions have understandable definitions;
- the thinking indicator has defined terminal states;
- rulebook regeneration has a clear destructive impact summary and safe alternative;
- Settings provides a durable, visible Primary provider;
- changing Primary does not silently alter valid role assignments;
- each decision maps to exact screens, states, copy, and acceptance examples;
- unresolved product decisions are explicitly marked.

End the handoff with a short developer-facing checklist of what V6 supersedes in V5. Keep technical
root-cause analysis out of the design documents.
