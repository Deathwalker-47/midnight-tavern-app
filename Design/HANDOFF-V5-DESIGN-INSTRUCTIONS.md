# Midnight Tavern — Handoff V5 Design Revision Instructions

**Status:** Design work only. Do not begin production implementation from this document.

**Input artifacts:**

- `Design/handoff-v4/`
- `Plan/attribute-integration.md`

**Required output:** A new `Design/handoff-v5/` revision. Preserve `handoff-v4` unchanged as historical evidence.

This revision closes the two product decisions that v4 left unresolved, replaces the three-mode mechanics model with a two-mode stat-system choice, and makes the model-role behavior of No Stats stories explicit.

---

## 1. Authority and precedence

Use this order whenever documents disagree:

1. The confirmed decisions in this instruction.
2. `Plan/attribute-integration.md`, except for its `none / light / full` mode definitions, which are superseded here.
3. The locked v4 decisions A–M, except where explicitly revised below.
4. The older product spec, high-level plan, low-level plan, design brief, and v3 documents.

Do not leave contradictory legacy copy inside handoff-v5. In particular, remove or rewrite every statement that says:

- there are three mechanics modes;
- attributes are pending or a future addition;
- N1 dynamic catalogs are unresolved;
- N2 attributes are unresolved;
- a per-story Narrator override may be added as a guarded fallback;
- every story calls the Classifier, Analyzer, Summarizer, or Story AI;
- a Ruling mounts mid-stream after Narrator prose has begun.

The new handoff must be internally consistent even when a developer reads only `00-PRODUCT-SPEC.md` or the reference plans.

---

## 2. Confirmed product decisions

| Decision | Final resolution |
|---|---|
| Dynamic skills/actions | The forged catalog is immutable. During play, the system may reveal or unlock only skills/actions that already existed in the sealed rulebook. No model or controller may silently create, rewrite, or delete catalog definitions. Versioned rulebook amendments are deferred beyond v1. |
| Attributes | Approved. Integrate them exactly as specified in `Plan/attribute-integration.md`, subject to the two-mode override in this document. |
| Narrator authority | One global Narrator assignment only. Story Settings is read-only and links to the global Role Matrix. Remove the per-story override fallback entirely. |
| Rewind | “Rewind to here” keeps the selected completed exchange and deletes only later exchanges. “Delete from this exchange” is a separate destructive action. |
| Changing stat systems | Historical turns are never reinterpreted. Mechanical state is preserved when mechanics are paused. Enabling Full Stats where no sealed rulebook exists requires an explicit forge/upgrade flow before the next turn. |
| Number of stat systems | Exactly two user-facing choices: **No Stats** and **Full Stats**. Remove Light Rules from new-story creation, Story Settings, demos, copy, and acceptance criteria. |
| No Stats model behavior | A No Stats story uses the **Narrator role only**. Classifier, Analyzer, Summarizer, and Story AI/Bootstrapper must remain dormant unless the user explicitly changes the story to Full Stats. No hidden background calls to those roles. |

---

## 3. Replace “mechanics mode” with a two-option stat-system choice

Story creation must explicitly ask:

> **Which stat system should this story use?**

Use exactly two primary choices.

### 3.1 No Stats

Recommended card copy:

> **No Stats**  
> Pure roleplay and prose. No attributes, skills, dice, action checks, rulings, inventory rules, or progression. Only your Narrator model is used. Best for romance, comedy, slice-of-life, freeform drama, and users who want a SillyTavern-like experience.

The design must make these guarantees visible:

- only the Narrator role can make model requests for the story;
- no Classifier call runs on player messages;
- no Story AI/Bootstrapper call runs during story creation;
- no deterministic mechanical resolver or ledger runs;
- no Analyzer updates moods, relationships, observations, locations, or other soft state in the background;
- no Summarizer automatically produces chapter or arc summaries;
- no dice, Ruling artifact, mastery, resources, mechanical inventory, actions, skills, or attribute sheets appear;
- lorebook retrieval, persona injection, transcript storage, formatting, and local navigation remain available because they do not require another model role;
- a player message flows directly to the Narrator using the story blueprint, persona, lorebooks, and supported transcript context.

The Story Creation confirmation must state **“Uses Narrator only”** before the user proceeds.

### 3.2 Full Stats

Recommended card copy:

> **Full Stats**  
> A generated roleplaying system with story-specific attributes, skills, actions, resources, equipment, dice, mastery, and persistent consequences. Best for adventure, combat, survival, mystery, progression, CRPG, tabletop, and LitRPG-style stories.

The design must explain that:

- the Story AI forges a sealed rulebook;
- attributes are generated for the premise rather than selected from a universal fixed list;
- Full Stats uses the Narrator, Classifier, Analyzer, Summarizer, and Story AI roles at their appropriate phases;
- mechanical outcomes are deterministic and models cannot write hard state;
- the user does not manually point-buy attributes in v1.

### 3.3 Remove Light Rules

`light` must not appear as a selectable third mode in handoff-v5.

User-facing names are **No Stats** and **Full Stats**. Suggested implementation identifiers are `none` and `full`; implementation naming is a contract note, not a prototype requirement.

The following parts of `Plan/attribute-integration.md` are superseded:

- Decision A3’s `none / light / full` binding;
- the `light` generation instruction in §6.1;
- the three-row table in §7;
- the `light` edge case in §13.

All other attribute decisions remain authoritative.

---

## 4. Model-role activation contract

Add this contract to the product decisions, UX spec, setup flow, Role Matrix, Story Settings, and implementation contract.

| Role/system | No Stats | Full Stats |
|---|---:|---:|
| Narrator | Active | Active |
| Classifier | Never invoked | Active during turn classification |
| Deterministic resolver/ledger | Dormant | Active when a classified action requires it |
| Analyzer | Never invoked | Active after completed turns as designed |
| Summarizer | Never invoked automatically | Active at configured thresholds |
| Story AI / Bootstrapper | Never invoked during creation | Active during forge or explicit No Stats → Full Stats upgrade |

### 4.1 No hidden calls

“Dormant” means no request, no fallback, no retry, and no cost. Configuring those roles globally does not authorize their use in a No Stats story.

No Stats screens must never surface Classifier, Analyzer, Summarizer, Story AI, mechanics, or ruling errors because those phases do not run. If such an error appears, it is a product-contract violation, not a recoverable story state.

### 4.2 Setup Wizard implications

Revise first-run setup so a user can complete onboarding with a valid Narrator alone.

- Narrator is always required.
- Full Stats roles are grouped as **“Required for Full Stats stories”** and may be configured now or deferred.
- Selecting Full Stats during story creation checks whether the required roles are ready.
- If they are missing, route to a focused **Complete Full Stats setup** step and return to the story draft afterward.
- Selecting No Stats must never force the user to configure unused roles.

### 4.3 Role Matrix implications

The global Role Matrix may still expose all roles, but it must distinguish:

- **Narrator — used by every story**;
- **Full Stats roles — used only by Full Stats stories**.

When a No Stats story is active, show a quiet status such as:

> This story uses Narrator only. The Full Stats roles below are configured but dormant.

Do not disable global configuration merely because the active story is No Stats.

### 4.4 No Stats continuity and long histories

Because Analyzer and Summarizer are silent, handoff-v5 must explicitly design what happens to continuity features:

- recent transcript, persona, blueprint, and triggered lorebooks may be assembled locally;
- automatic analyzer-authored character evolution is unavailable;
- automatic chapter/arc summarization by the Summarizer is unavailable;
- Overview and Character screens need intentional No Stats states rather than empty mechanical shells;
- if long-history compression is required, a separately approved design may use the **same global Narrator assignment** through an explicit, visible action; it must not silently route to the Summarizer role.

Provide exact copy explaining these differences without making No Stats feel inferior or broken.

---

## 5. Distinct creation and forging flows

### 5.1 No Stats creation

No Stats must not show the five mechanical forging phases because no Story AI call or rulebook generation occurs.

Design a short path:

1. Premise or imported character card.
2. Stat-system choice: No Stats.
3. Persona confirmation.
4. Blueprint/narration settings confirmation.
5. Open the story.

If an opening needs generation, it must use the global Narrator role and show a simple Narrator-generation state. Do not describe it as forging skills, attributes, gear, or rules.

### 5.2 Full Stats creation

Full Stats retains the event-driven forge experience, updated to include attributes:

1. Reading the premise and imported card/persona cues.
2. Defining the world’s stat system and genre-specific attributes.
3. Writing resources, tiers, skills, and prerequisites.
4. Writing the action and item catalogs, including governing attributes.
5. Placing characters, attribute scores, starting gear, and NPC templates.
6. Validating references and sealing the rulebook.

The prototype may keep five top-level phases by nesting attribute work inside existing stages, but the visible phase detail must truthfully state when attributes are being generated and validated. Do not use a fake percentage.

### 5.3 Full Stats readiness failure

Design states for:

- required Full Stats model role missing;
- attribute generation validation failure;
- an action referencing an unknown governing attribute;
- a character missing an expected attribute score and using the documented default;
- provider failure during forge with phase-level retry;
- user cancellation with retained draft and persona selection.

---

## 6. Attribute integration is now final, not provisional

Move v4 N2 from **UNRESOLVED** to **LOCKED**. Remove all “pending attribute ADR,” “future addition,” and provisional-only treatments.

Use `Plan/attribute-integration.md` as the source of truth for:

- story-generated, genre-specific attributes;
- soft target of 3–6 attributes with no hard count cap;
- score representation and derived modifier;
- typical, heroic, superhuman, and absolute score bands;
- governing attribute on actions;
- attribute prerequisites;
- raw, skilled, flat, and opposed checks;
- rare engine-applied attribute changes;
- no automatic attribute leveling by use;
- no point-buy authoring flow in v1;
- hard-state authority and the Analyzer prohibition;
- missing-score fallback;
- the score-to-modifier formula and single-source derivation rule.

### 6.1 Required Full Stats UI designs

#### Story Creation

- Explain that Full Stats creates a premise-specific stat system automatically.
- Do not ask the user to choose D&D attributes, point-buy, or select a fixed ruleset.
- Imported card/persona attribute cues are honored during generation.

#### Forging Progress

- Include truthful attribute-generation and validation detail.
- Support normal, slow, retry, partial-warning, fatal-validation, cancellation, and reduced-motion states.

#### Story Settings

Add a system-register **Attribute catalog** section showing each generated definition:

- name;
- abbreviation;
- description;
- default score;
- number of actions governed by it;
- skills or unlock conditions that reference it.

No Stats Story Settings must hide this and all other mechanical catalogs, replacing them with a clear **Narrator-only story** summary.

#### Living Card

Add a compact Attributes block before or beside resources:

> STR 16 (+3)

The layout must handle 3, 6, and more-than-6 attributes without clipping. Recently changed attributes use the existing changed-state visual language.

#### Character Dossier

Add a full system-register Attributes section with:

- attribute name and abbreviation;
- current score;
- derived modifier;
- description/what it governs;
- recently changed marker and change source when applicable.

No Stats characters retain identity, card content, persona, and transcript-derived presentation that does not depend on the Analyzer, but show no mechanical sheet.

#### Ruling Artifact

Design the final multi-term layout for:

- raw check: `d20 + attribute`;
- skilled check: `d20 + attribute + mastery`;
- contextual modifier as an optional third modifier term;
- flat/luck check: `d20` only;
- opposed check with visible terms for both sides;
- critical success/failure;
- attribute prerequisite denial;
- rare attribute delta caused by an item, curse, or boon.

Representative copy:

> d20 14 + STR 3 + Blade Adept 3 = 20 vs DC 15 — Success

The die-settle → term count-up → total → verdict motion must remain understandable with multiple modifier terms and must respect reduced motion.

#### Skill and action presentation

- Action catalog rows show their governing attribute.
- Skill prerequisites can show attribute gates such as `STR ≥ 14`.
- Rank/mastery remains separate from attributes.
- Mastery continues to advance through successful use; attributes do not.

#### Advanced developer editing

The attribute plan permits individual score editing only in the advanced/dev schema view after freeze. Design this as a clearly separated power-user operation with:

- current score and derived modifier preview;
- allowed range;
- confirmation;
- warning that future checks change but previous turns do not;
- checkpoint/audit note;
- no resemblance to a normal point-buy character creator.

If this advanced edit is intentionally deferred, mark the deferral explicitly rather than silently dropping the requirement.

### 6.2 Required attribute demo states

Create high-fidelity prototype states for:

1. Ordinary 3-attribute story.
2. Six-attribute story.
3. More-than-6 imported/superhero attribute set.
4. Raw attribute check.
5. Skilled attribute + mastery check.
6. Opposed check showing both characters’ terms.
7. Flat/luck action with no governing attribute.
8. Attribute-gated skill denial.
9. Attribute changed by an engine effect.
10. Superhuman score above 20.
11. Missing attribute fallback to score 10 / modifier 0, identified in diagnostics but not presented as a user-facing failure.

---

## 7. Dynamic skills and actions are resolved as a frozen catalog

Move v4 N1 from **UNRESOLVED** to **LOCKED**.

### 7.1 V1 rule

- All skill and action definitions are generated during Full Stats forging.
- The sealed schema is immutable during play.
- The runtime may change only state such as learned, locked, hidden, revealed, available, and mastery progress.
- A reveal/unlock must reference an ID that already exists in the sealed schema.
- The Classifier may select only actions currently available to the relevant actor.
- Narrator, Classifier, Analyzer, and any “controller” may not invent new IDs or definitions.
- Reveal/unlock state is checkpointed, rewound, and audited with the exchange that caused it.

Do not introduce a sixth “Controller” model role. In v1, controller means deterministic application/engine logic operating on predeclared definitions.

### 7.2 Required UX

Design:

- hidden skill becoming revealed;
- revealed but not yet learned;
- learned at Novice;
- action becoming available because a skill/prerequisite was unlocked;
- denied action explaining the still-locked prerequisite;
- ruling/effect line identifying why the reveal happened;
- character dossier progression history;
- Story Settings developer view distinguishing total definitions from currently revealed definitions;
- rewind removing a reveal that occurred after the selected exchange.

Example reveal copy:

> **New skill revealed: Trapcraft**  
> Kestrel recognized the reliquary’s ward pattern. Trapcraft was already part of this world’s sealed rulebook and is now discoverable.

The interface must not imply that the model created the skill at runtime.

### 7.3 Deferred beyond v1

Versioned rulebook amendments may be reconsidered later. Remove the v4 proposal/approval mockup from implementation-ready screens. Mention it only in a future-work section.

---

## 8. Narrator remains a single global entity

Update v4 decision J from “locked, with guarded override option” to simply **LOCKED**.

- Remove all override switches, fallback schemas, provisional copy, and per-story model dropdowns.
- Story Settings shows only:
  - `Using global Narrator: [provider] · [model]`;
  - `Configure models` link;
  - current story role-usage summary: `Narrator only` or `Full Stats pipeline`.
- The global Role Matrix is the sole editable source.

Do not carry `story.narratorOverride` into the handoff-v5 implementation contract.

---

## 9. Stat-system switching after play begins

Historical exchanges and outcomes never change.

### 9.1 Full Stats → No Stats

- Preserve the sealed rulebook, character sheets, inventory, attributes, mastery, and checkpoints.
- Pause all mechanical mutation from the switch point onward.
- Deactivate Classifier, Analyzer, Summarizer, and Story AI calls.
- Continue with Narrator-only turns.
- Show a permanent timeline/system marker indicating where the stat system changed.
- Story Settings shows **No Stats — previous Full Stats sheet preserved** with a way to inspect the frozen historical sheet.

### 9.2 No Stats → Full Stats

If the story never had a Full Stats rulebook:

- explain that a new sealed rulebook and attributes must be forged from the existing premise, persona, imported card, lorebooks, and story-so-far;
- check required role configuration;
- run an explicit upgrade-forge flow;
- create a checkpoint before enabling mechanics;
- begin Full Stats only on future exchanges;
- never retroactively roll previous prose.

If the story previously used Full Stats and its rulebook was merely paused:

- resume the same sealed rulebook and hard state;
- do not regenerate attributes or catalogs;
- show exactly which exchange will be the first mechanical turn after resumption.

### 9.3 Confirmation copy and recovery

Design confirmation, cancel, in-progress, failure, retry, success, and rollback states for both directions. The dialog must state:

- which model roles will become active or dormant;
- which data is preserved;
- that previous exchanges are unchanged;
- whether a forge is required;
- whether the change can be cancelled before completion.

---

## 10. Existing `light` stories need a migration design

Handoff-v5 must define compatibility for stories already stored with `statMode: light`. Do not silently reinterpret them and do not expose Light Rules as a permanent third choice.

On first open, show a one-time migration decision with only the two final destinations:

- **Continue as No Stats** — pause mechanics, preserve the old sheet as historical state.
- **Upgrade to Full Stats** — preserve existing skills/actions/resources, generate the missing attribute layer and mappings, validate, checkpoint, and apply only to future exchanges.

Requirements:

- automatic pre-migration backup or equivalent recoverability;
- no change to earlier transcript/rulings;
- exact explanation of what will be added or paused;
- retry/rollback for upgrade failure;
- no indefinite hidden “legacy light” behavior after the user chooses.

The design may recommend a different safe migration if it satisfies the same two-mode end state and non-reinterpretation guarantee, but it must document the reasoning explicitly.

---

## 11. No Stats screen behavior

Design dedicated No Stats states instead of merely hiding random Full Stats controls.

### Play / Chat

- Player message → Narrator reply exchange.
- SillyTavern-compatible safe formatting remains active.
- No resolution placeholder, Ruling area, dice, locked-die icon, mastery, or mechanical errors.
- Background indicator has only relevant phases such as `Narrating`.
- Rewind, delete-from, branch, regenerate, copy, and message persistence still work.

### Living Card and Characters

- Identity, avatar, description, traits from the persona/card, and stable authored information may remain.
- No attributes, resources, skills, mastery, mechanical inventory, or Analyzer-generated evolving fields.
- Do not show empty bars or zero-filled sheets.

### Overview

- Do not pretend automatic Summarizer output exists.
- Provide a designed explanation of the continuity available in No Stats.
- If manual notes, pinned memories, or an explicit Narrator-based condensation are proposed, label them clearly and keep them out of hidden background behavior.

### Story Settings

Show a concise Narrator-only configuration summary, blueprint/persona/lorebook controls, formatting/narration settings, and the guarded option to enable Full Stats. Hide mechanical catalogs unless displaying a preserved historical Full Stats sheet.

### Errors

Only Narrator, provider authentication, network/timeout, cancellation, and local persistence errors are relevant. Classifier/Resolver/Analyzer/Summarizer/Story AI error cards must be impossible in active No Stats play.

---

## 12. Carry forward these v4 decisions unchanged

The following v4 work remains approved and must not regress:

- standalone lorebook JSON import;
- real event-driven forge progress and slow-operation states;
- safe SillyTavern-compatible message formatting;
- persistent active-story context;
- generation surviving navigation;
- causal exchange order: player → ruling(s) → Narrator;
- action-specific DM ruling detail;
- visible mastery progression;
- persona-derived player identity with no invisible “Traveler” fallback;
- accurate role/phase-specific errors;
- rewind keeping the selected exchange;
- separate Delete from this exchange action;
- one authoritative global Narrator.

Where Full Stats attributes affect these components, update them rather than replacing their v4 behavior.

---

## 13. Required handoff-v5 screen revisions

At minimum, produce or update high-fidelity prototypes for:

1. **StoryCreation** — exactly two stat-system cards, role-usage disclosure, persona confirmation.
2. **SetupWizard** — Narrator-required baseline; Full Stats roles optional/deferred.
3. **RoleMatrix** — always-used Narrator group and Full Stats-only role group with dormancy state.
4. **ForgingProgress** — Full Stats attribute-aware phases plus separate No Stats opening state.
5. **Play / Chat** — No Stats exchange, Full Stats multi-term rulings, reveal/unlock events, stat-system boundary marker.
6. **StorySettings** — global Narrator read-only, two-mode status/switching, attribute catalog, frozen hidden/revealed catalog states.
7. **Living Card** — attribute block, variable attribute counts, recently changed state, No Stats identity-only variant.
8. **CharacterDossier** — full attribute section, mastery/progression, reveal history, No Stats variant.
9. **Characters** — Full Stats versus No Stats card treatments.
10. **Overview** — Full Stats summarized state and honest No Stats continuity state.
11. **SkillProgression** — attribute prerequisites and frozen-catalog reveal history without conflating attribute scores with mastery.
12. **DesignSystem** — final multi-term Ruling artifact variants and attribute components.
13. **Migration** — one-time existing-Light-story decision and upgrade states.
14. **Index** — links and descriptions updated for v5.

Every prototype must include applicable normal, loading, empty, slow, success, partial-success, recoverable-error, fatal-error, narrow-window, keyboard-focus, and reduced-motion states.

---

## 14. Required document revisions

The new handoff must contain and reconcile:

- `00-PRODUCT-DECISIONS.md` — N1/N2 locked; J global-only; L replaced by two stat systems.
- `00-WHATS-NEW-V5.md` — concise v4 → v5 diff.
- `00-PRODUCT-SPEC.md` — mode-aware architecture; no outdated universal five-role pipeline statement.
- `01-UX-SPEC.md` — exact copy for mode choice, role use, switching, attributes, catalog reveal, migration.
- `02-STATES-AND-FLOWS.md` — No Stats, Full Stats, switching, legacy migration, Full Stats role readiness.
- `03-COMPONENT-STATES.md` — attributes, multi-term ruling, reveal/unlock, No Stats cards.
- `04-IMPLEMENTATION-CONTRACT.md` — role activation matrix, two-mode semantics, attribute contracts, immutable catalog, migration guarantees.
- `03-IMPLEMENTATION-NOTES.md` — separate No Stats and Full Stats pipelines.
- reference `high-level-plan.md` and `low-level-plan.md` — fold in the approved attribute specification and remove `light` as a final mode.
- `README.md` and Index — no unresolved N1/N2 language.

Do not copy contradictory v3/v4 paragraphs forward unchanged. In handoff-v5, plans must win on behavior and must themselves reflect these final decisions.

---

## 15. Acceptance and traceability

The design revision is complete only when all of these are true:

- every new story visibly chooses No Stats or Full Stats;
- there is no third selectable mode;
- No Stats provably invokes only the global Narrator role;
- Narrator-only onboarding does not require unused roles;
- Full Stats readiness checks all required roles before forging;
- attributes are fully designed, not marked pending;
- the attribute layouts handle raw, skilled, opposed, flat, gated, changed, superhuman, missing-fallback, and variable-count cases;
- attribute and mastery progression are visually distinct;
- no normal point-buy UI exists;
- catalog definitions never mutate after forge;
- reveal/unlock states are checkpointed and explained as pre-existing rulebook content;
- no sixth Controller model role is introduced;
- per-story Narrator override language and data contracts are removed;
- Rewind keeps the selected exchange;
- mode switching preserves history and shows a boundary marker;
- existing Light stories have an explicit two-destination migration flow;
- No Stats Overview/Characters/Story Settings are intentionally designed rather than empty Full Stats shells;
- every revised decision maps to exact copy, screens, states, flows, implementation contract, and acceptance criteria;
- the final handoff contains no unresolved N1/N2 markers and no contradictory three-mode copy.

End the handoff with a developer-facing **decision delta checklist** confirming exactly which v4 files and screens were superseded. Do not label the handoff implementation-ready until this checklist passes.

