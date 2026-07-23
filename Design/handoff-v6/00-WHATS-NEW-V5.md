# What's New in V5

v5 closes v4's two open decisions and simplifies the mechanics model. Design language, tokens, and
registers are unchanged. Full authority + traceability in `00-PRODUCT-DECISIONS.md`.

## Headlines
- **Two stat systems, not three.** Every story is **No Stats** or **Full Stats**. **Light Rules is
  gone** from creation, Story Settings, demos, copy, and acceptance.
- **No Stats = Narrator only.** Classifier, Analyzer, Summarizer, and Story AI stay dormant — no
  hidden calls, no cost. No Stats play can never show a mechanics/ruling/role error.
- **Attributes are LOCKED** (v4 N2 resolved). Story-generated genre attributes, score + derived
  modifier `floor((score-10)/2)`, governing attribute on actions, prerequisites, multi-term rulings.
  All "pending/future" attribute language removed.
- **Frozen catalog is LOCKED** (v4 N1 resolved). Definitions are immutable after forge; runtime only
  reveals/unlocks IDs that already exist in the sealed rulebook. No sixth "Controller" role.
- **Narrator is global-only** (v4 J tightened). Per-story override removed entirely.
- **Switching & migration designed.** Full<->No Stats switching preserves history with a boundary
  marker; existing `light` stories get a one-time two-destination migration.

## New / changed screens
- **StoryCreation** - two stat-system cards + "Uses Narrator only" confirmation + role-usage disclosure.
- **SetupWizard** - Narrator-only onboarding completes setup; Full Stats roles are a deferrable group.
- **RoleMatrix** - "Narrator - used by every story" vs "Full Stats roles" with dormant status.
- **ForgingProgress** - attribute-aware Full Stats phases + a separate No Stats Narrator-opening state.
- **Chat** - No Stats exchange (no ruling area/dice/mech errors), Full Stats **multi-term** rulings,
  reveal/unlock events, stat-system boundary marker.
- **StorySettings** - global Narrator read-only, two-mode status/switch, **Attribute catalog**,
  frozen hidden/revealed catalog, No Stats "Narrator-only story" summary.
- **SkillProgression** - attribute prerequisites (`STR >= 14`) + frozen-catalog reveal history; attrs
  kept visually distinct from mastery.
- **CharacterDossier / Living Card / Characters / Overview** - attribute sections + honest No Stats variants.
- **DesignSystem** - final multi-term Ruling artifact variants + attribute components.
- **Migration** - NEW; one-time existing-`light`-story decision + upgrade states.

## Decision-delta checklist (v4 -> v5 superseded)
| v4 artifact | Status in v5 |
|---|---|
| `00-PRODUCT-DECISIONS.md` (N1/N2 UNRESOLVED; J guarded-override; L three modes) | **Superseded** - N1/N2 LOCKED, J global-only, L->two stat systems |
| `01-UX-SPEC.md §L` three mechanics modes | **Superseded** - two stat systems + role-usage/switching/migration copy |
| `04-IMPLEMENTATION-CONTRACT.md §J` `narratorOverride`; §N1/§N2 studies | **Removed / promoted** - override gone; N1/N2 now normative contracts |
| `StoryCreation.dc.html` mode step (Prose/Light/Full) | **Superseded** - No Stats / Full Stats |
| `ForgingProgress.dc.html` (no attributes; single flow) | **Superseded** - attr-aware Full Stats + No Stats opening |
| `Chat.dc.html` (no attribute terms; no reveal events; no boundary) | **Superseded** - multi-term rulings, reveal/unlock, boundary marker |
| `StorySettings.dc.html` (mechanics mode; no attribute catalog) | **Superseded** - two-mode + attribute catalog + frozen-catalog states |
| `SkillProgression.dc.html` (mastery only) | **Extended** - + attribute prereqs + reveal history |
| `CharacterDossier/Characters/Overview/DesignSystem` | **Extended** - attribute sections + No Stats variants |
| `SetupWizard.dc.html` (all five roles equal) | **Superseded** - Narrator-required, Full Stats roles deferrable |
| `RoleMatrix.dc.html` (flat five roles) | **Superseded** - Narrator vs Full Stats-only group + dormancy |
| - | **NEW** `Migration.dc.html` |

Not implementation-ready until the acceptance checklist (instruction §15) passes.