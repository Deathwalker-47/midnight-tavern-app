# 00 · Product Decisions & Traceability — v5

Anchor for the v5 revision. v5 **closes the two decisions v4 left open** (N1, N2 → LOCKED),
replaces the three-mode mechanics model with a **two stat-system choice** (No Stats / Full Stats),
and makes the model-role behavior of No Stats stories an explicit contract. Design tokens,
typography, navigation, and the STORY (warm serif / brass `#D9A648`) vs SYSTEM (mono / teal
`#74B8AE`) registers are unchanged.

> **Authority order** when documents disagree: (1) this file; (2) `reference/attribute-integration.md`
> *except* its `none/light/full` mode bindings, superseded here; (3) locked v4 decisions A–M except
> where revised below; (4) older product/high-level/low-level/brief/v3 docs.

Legend: **[LOCKED]** build to spec. There are **no UNRESOLVED items in v5.**

---

## Confirmed decisions (this revision)

### Stat systems — exactly two — [LOCKED] (replaces v4 §L "mechanics modes")
Every story is **No Stats** or **Full Stats**. **Light Rules is removed** from creation, Story
Settings, demos, copy, and acceptance. Implementation identifiers may be `none`/`full`; user-facing
names are **No Stats** and **Full Stats**.

### N2 · Attributes — [LOCKED] (was UNRESOLVED in v4)
Approved and integrated per `reference/attribute-integration.md`, with the two-mode override above.
Story-generated genre attributes (soft 3–6, no hard cap), score + derived modifier
`mod = floor((score − 10) / 2)` from a single function, bands typical/heroic/superhuman/absolute,
governing attribute on **actions**, attribute prerequisites, raw/skilled/flat/opposed checks, rare
engine-applied deltas, **no leveling by use**, **no point-buy in v1**, missing score → 10 (+0).
All "pending / future addition / provisional" attribute language is removed.

### N1 · Dynamic skills & actions — [LOCKED, frozen catalog] (was UNRESOLVED in v4)
The forged catalog is **immutable during play**. Runtime may change only state (learned / locked /
hidden / revealed / available / mastery progress) and only by referencing an **ID already in the
sealed rulebook**. No model or controller may create, rewrite, or delete definitions. **No sixth
"Controller" model role** — "controller" means deterministic engine logic. Versioned rulebook
amendments are **deferred beyond v1** (future-work note only; the v4 proposal/approval mockup is
removed from implementation-ready screens).

### J · Narrator authority — [LOCKED, global-only] (tightened from v4)
**One** global Narrator assignment. Story Settings is **read-only** + "Configure models" link. The
per-story override fallback, `story.narratorOverride`, and any second Narrator selector are
**removed entirely**.

### No Stats model behavior — [LOCKED]
A No Stats story uses the **Narrator role only**. Classifier, Analyzer, Summarizer, and Story
AI/Bootstrapper stay **dormant** (no request, no fallback, no retry, no cost) unless the user
explicitly upgrades the story to Full Stats. No hidden background calls.

### Changing stat systems — [LOCKED]
Historical turns are never reinterpreted. Mechanical state is preserved when mechanics pause.
Enabling Full Stats where no sealed rulebook exists requires an explicit forge/upgrade flow before
the next turn. See flows in `02-STATES-AND-FLOWS.md §Switching` and `§Migration`.

### Rewind — [LOCKED, carried from v4 H]
"Rewind to here" keeps the selected completed exchange and deletes only later exchanges. "Delete
from this exchange" is a separate, distinctly-named destructive action.

---

## Model-role activation contract (normative)

| Role / system | No Stats | Full Stats |
|---|---|---|
| **Narrator** | **Active** | **Active** |
| Classifier | **Never invoked** | Active during turn classification |
| Deterministic resolver / ledger | Dormant | Active when a classified action requires it |
| Analyzer | **Never invoked** | Active after completed turns |
| Summarizer | **Never invoked automatically** | Active at configured thresholds |
| Story AI / Bootstrapper | **Never invoked during creation** | Active during forge, or an explicit No Stats → Full Stats upgrade |

"Dormant/never invoked" = no request, no fallback, no retry, no cost. Configuring a role globally
does **not** authorize its use in a No Stats story. No Stats play can never surface Classifier /
Analyzer / Summarizer / Story AI / mechanics / ruling errors — those phases do not run.

---

## Carried forward from v4 unchanged (A–I, K, M)
A lorebook JSON import · B event-driven forge (+attributes now) · C ST-safe formatting · D active-
story context · E generation-survives-navigation · F causal exchange order (player → ruling(s) →
Narrator; **no mid-stream mount**) · G action-specific ruling detail (**now multi-term with the
attribute term**) · H rewind/delete split · I persona-derived identity (no invisible "Traveler") ·
K visible mastery (distinct from attributes) · M accurate role/phase errors.

---

## Traceability index

| Item | Decision | Screen(s) | Doc |
|---|---|---|---|
| Two stat systems | No Stats / Full Stats | StoryCreation, StorySettings | UX §Mode · 02 §NoStats/§FullStats |
| Role activation | Narrator-only vs full pipeline | SetupWizard, RoleMatrix, StorySettings, Chat | 04 §Roles |
| Attributes (N2) | LOCKED | StoryCreation, ForgingProgress, StorySettings, Chat, Living Card, CharacterDossier, SkillProgression, DesignSystem | UX §Attributes · 03 §Attributes · 04 §Attributes · reference/attribute-integration.md |
| Frozen catalog (N1) | LOCKED | Chat (reveal/unlock), StorySettings, SkillProgression, CharacterDossier | UX §Reveal · 03 §Reveal · 04 §Catalog |
| Narrator authority (J) | global-only | StorySettings, RoleMatrix | UX §Narrator · 04 §J |
| Switching | history-preserving | StorySettings, Chat boundary marker | 02 §Switching |
| Light migration | two destinations | Migration | 02 §Migration |
| Rewind (H) | keep-selected + separate delete | Chat | 02 §H |

See the **decision-delta checklist** at the end of `00-WHATS-NEW-V5.md` for exactly which v4
files/screens were superseded.
