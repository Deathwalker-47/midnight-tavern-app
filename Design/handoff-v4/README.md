# Midnight Tavern — Developer Handoff · V4

A design-complete, interactive prototype of **Midnight Tavern**: a local-first roleplay app with
gated, deterministic mechanics and evolving memory. High-fidelity clickable HTML prototypes — the
source of truth for layout, copy, motion, and states. v4 is a **revision** of the existing product;
tokens, typography, navigation, and the STORY (serif/brass) vs SYSTEM (mono/teal) registers are
unchanged.

> **⭐ Read `00-PRODUCT-DECISIONS.md` first** — it records every directive item (A–N) as LOCKED or
> UNRESOLVED and maps each to its UX spec, screen/state, flow, copy, and acceptance criteria. Then
> `01-UX-SPEC.md`, `02-STATES-AND-FLOWS.md`, `03-COMPONENT-STATES.md`, `04-IMPLEMENTATION-CONTRACT.md`.

## Documents
- `00-PRODUCT-DECISIONS.md` — decision register + traceability index (start here)
- `01-UX-SPEC.md` — A–M behavior + exact UI copy
- `02-STATES-AND-FLOWS.md` — flows + universal state matrices
- `03-COMPONENT-STATES.md` — chat renderer, ruling schema, mastery meter, exchange unit, lorebook matrix + fixtures
- `04-IMPLEMENTATION-CONTRACT.md` — forge events, active-story, background-gen, error taxonomy, N1/N2 studies
- `00-WHATS-NEW-V4.md` — the V3→V4 diff · `00-WHATS-NEW-V3.md` retained for history

## Screens (`screens/`) — new/updated in v4
```
SetupWizard.dc.html      onboarding (from v3)
StoryCreation.dc.html    ★NEW mechanics mode (L) + persona confirm (I) + narrator note (J)
ForgingProgress.dc.html  ★NEW event-driven forge (B): phases, elapsed, 30s/2m/5m, retry/cancel/diagnostics
Chat.dc.html             ★NEW v4 Play: causal exchanges (F), full ruling (G), ST-safe formatting (C),
                         model errors (M), background-gen indicator (E), rewind vs delete-from (H)
SkillProgression.dc.html ★NEW mastery meter (K): rank/mod/successes/next/rank-up/max + dossier history
LorebookImport.dc.html   ★NEW import flow (A): picker→parse→preview→conflict→validation/partial→success
Lorebook.dc.html         + prominent "Import lorebook" action
StorySettings.dc.html    + breadcrumb/active-story (D), read-only global Narrator (J), mechanics mode (L)
Library.dc.html          new-story → New Story Builder; "Connect your storyteller" gating (from v3)
Settings.dc.html · RoleMatrix.dc.html · Overview · Characters · CharacterDossier · Personas ·
CardCreator · StoryBlueprint · DesignSystem · Index   (carried from v3)
```

## Fast tour
1. Open `screens/Index.dc.html`. Every screen has a **Demo** switcher for its states.
2. New story: `StoryCreation` (mode → persona) → `ForgingProgress` (try the 30s/2min/5min+/fail demos)
   → `Chat`.
3. In `Chat`, cycle demos: ruling exchange, prose-only, stacked rolls, denied+suggest, streaming,
   the accurate model errors (Classifier vs Narrator vs background Analyzer), ST formatting, and the
   background-generation indicator. Exchange actions open the **Rewind** vs **Delete-from** dialogs.
4. `LorebookImport` walks picker → preview (with lossy fields + conflict) → partial/success.

## Unresolved (do not build as final)
**N1** dynamic skills/actions and **N2** attributes-beneath-skills are decision studies in
`04-IMPLEMENTATION-CONTRACT.md` with provisional UI only. Ruling attribute row and Full-Rules
attribute screens stay gated until N2 is approved.
