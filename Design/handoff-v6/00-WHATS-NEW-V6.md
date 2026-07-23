# What's New in V6

v6 addresses forge latency, imported-card fidelity, SillyTavern macros, classifier resilience,
scene entities, XP mastery, persona confirmation, definition-rich rulebooks, destructive rulebook
regeneration, and a primary provider. Tokens/registers unchanged. Authority + full detail in
`00-PRODUCT-DECISIONS.md`.

## Headlines
- **Attributes are now 1–10** (was 1–30). Modifier = `score − 5` (−4..+5); average 5 (+0). A locked
  `0` (e.g. `NEN 0`) is a separate locked/unavailable state, never a rollable score.
- **Mastery is XP-based** (was success-counting). Exponential thresholds 100 / 250 / 625 (×2.5); the
  deterministic engine awards XP; failure gives 25% practice XP; diminishing returns curb farming.
- **Rulebook regeneration is allowed** — a deliberate, destructive, warning-gated version boundary
  (Duplicate-story safe path + typed-confirm direct). Still immutable during ordinary play.
- **Primary provider** — one persisted UX default; supplies picker defaults + repair suggestions but
  never overrides valid per-role provider/model bindings.
- **Imported-card fidelity** — a pre-forge mechanic-source review preserves card-defined stats
  (`BODY 7 | MIND 5 | NERVE 6 | NEN 0`) instead of inventing a new catalog. Precedence: card → persona
  → blueprint → narrative cues → model defaults.
- **SillyTavern macros** — an explicit support table; `{{user}}`/`{{char}}` never leak raw; unknown
  macros are preserved + warned, never silently deleted.
- **Classifier resilience** — null/empty optional fields normalize to omission (no 4-repair waste);
  failure follows the classifier-skipped path with accurate copy; a valid subset of intents survives.
- **Scene entities** — a narrated mole rat becomes a targetable scene entity next turn; the knife
  attack produces a pre-narration ruling.
- **Universal actions** — ten sealed primitives every Full Stats story has; story actions
  specialize/alias them.
- **Truthful forge progress** — discrete stepper + substep + attempt + elapsed + last-progress; no
  fake percentage; targets <90s healthy, 90s slow, 180s degraded.
- **Streaming is terminal** — "The story continues" always exits; a truthful "Saving turn" state
  covers post-prose persistence.

## Engineering defects fixed (documented, not reinterpreted)
Stuck thinking-state; wasted classifier repairs; classifier failure discarding the turn; inaccurate
"model returned nothing" copy; cosmetic forge timer. See `03-IMPLEMENTATION-NOTES.md`.

## Decision-delta checklist (v5 → v6 superseded)
| v5 artifact | Status in v6 |
|---|---|
| `00-PRODUCT-DECISIONS.md` (1–30 attrs; success-count mastery; regen impossible) | **Superseded** — 1–10 scale, XP mastery, regen allowed |
| `reference/attribute-integration.md` §10 (`floor((score−10)/2)`, 1–30 band) | **Superseded** — `score−5`, 1–10 band (reconciliation note appended) |
| `01-UX-SPEC.md` §Attributes | **Superseded** — 1–10 + locked-0 + macro/persona/XP/regen/primary copy |
| `04-IMPLEMENTATION-CONTRACT.md` §Attributes | **Superseded** — 1–10 + XP + entities + actions + macros + regen + primaryProviderId |
| `StoryCreation.dc.html` (attr preview absent) | **Extended** — persona-confirm, card mechanic detection, 1–10 preview, macro warning |
| `ForgingProgress.dc.html` (elapsed only) | **Superseded** — fragment-aware stepper, substep/attempt, slow/degraded/timeout/retry-fragment/resume |
| `Chat.dc.html` (v5 rulings) | **Extended** — classifier-skipped notice, unresolved-target, "Saving turn", XP award/rank-up, scene-entity ruling |
| `Play.dc.html` living card (attr 16(+3)) | **Superseded** — 1–10 scores, locked-0, XP progress, definitions |
| `CharacterDossier.dc.html` | **Extended** — 1–10 attrs, XP history, provenance |
| `SkillProgression.dc.html` (success pips) | **Superseded** — XP bars, exponential thresholds, ruling-source |
| `StorySettings.dc.html` (permanently sealed) | **Extended** — definitions, Regenerate-rulebook flow, version boundary |
| `Settings.dc.html` / `RoleMatrix.dc.html` | **Extended** — Primary badge/Make-primary; primary supplies defaults, not overrides |
| `DesignSystem.dc.html` | **Extended** — stepper, macro warning, source badge, XP/rank-up, entity warning, regen dialog, 1–10 attrs |

Not implementation-ready until the §18 acceptance checklist passes. This build resolves all 13
§17 open decisions (see `00-PRODUCT-DECISIONS.md`).