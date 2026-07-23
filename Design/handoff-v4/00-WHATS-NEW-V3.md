# What's New in V3

V3 resolves a set of locked product decisions about **onboarding, providers, and model
selection**. It is additive to V2 — tokens, the two-register system, the Ruling artifact and its
animation, and all story-side screens are unchanged. This file is the complete diff.

> **Note on scope:** the change request was received truncated mid-point-4 (“…After a provider is
> selected, fetch that provider…”). V3 implements decisions **1–4** in full as written, plus the
> clearly-implied completion/gating and sampler details. If there were points 5+ beyond the cut,
> they are not reflected here — flag them and they’ll go into V4.

---

## New / renamed screens

| Screen | File | Change |
|---|---|---|
| **Setup Wizard** | `SetupWizard.dc.html` | ★NEW, replaces the old combined `Wizard`. Onboarding **only**: connect a provider + confirm the five-role matrix. Completion-gated. |
| **New Story Builder** | in `Library.dc.html` (+ `StoryBlueprint.dc.html`) | Story creation is now unambiguously separate from onboarding: premise + persona (quick) or full blueprint. |
| **Role Matrix** | `RoleMatrix.dc.html` | Reworked: separate Provider/Model controls + live fetch (see #4). |

---

## 1 · Onboarding separated from story creation

- **Setup Wizard** (`SetupWizard.dc.html`) is first-run provider/model onboarding. A **clean
  profile launches here, not the Library** (documented routing; the Index lists it as the entry).
- **Setup is complete only when** (a) at least one provider has **validated successfully**, *and*
  (b) the user has **confirmed the five-role model matrix**. Both are gated: Continue is disabled
  until a key validates; Complete is disabled until the roles are confirmed. An “incomplete” state
  shows the blocking reason.
- **Dismiss / abandon:** the user may skip to the Library, but a **persistent, high-visibility
  “Connect your storyteller” banner** shows in the main content area until a provider is
  configured. Banner contains: primary **Continue setup**, secondary **Open provider settings**,
  and a plain-language line explaining an AI provider is required before forging or playing.
- **Routing with context:** model-dependent actions (New Story, opening a story to play) route the
  unconfigured user back to setup via a short context dialog. **Local actions stay available** —
  browsing the shelf and **Import card** work without a provider.
- **States specified & shown** (SetupWizard Demo switcher): first-launch, validating, rejected,
  incomplete, completed, provider-removed; plus the dismissed state (banner) on the Library.

## 2 · Canonical provider order

Everywhere a provider list appears — Setup Wizard, Settings cards, and every Role Matrix provider
picker — the order is exactly:

```
1 OpenRouter   2 Electron Hub   3 NanoGPT   4 OpenAI   5 Anthropic   6 Google
7 Mistral      8 DeepSeek       9 xAI       10 Groq    11 Custom endpoint
```

OpenRouter stays the recommended path. **Electron Hub** and **NanoGPT** are fully designed as
provider cards — abbreviation, description, key placeholder, signup/help link, and the validating
/ model-loading / valid / rejected states (official spellings “Electron Hub” and “NanoGPT”).

## 3 · Custom endpoint = two independent fields

The combined placeholder is gone. The Custom endpoint card now has:
- **Base URL** — own labelled field, OpenAI-compatible example (`https://host/v1`), URL
  validation with an inline malformed/unreachable error, and normalization guidance (trailing
  `/v1` added if omitted).
- **API key** — a separate, masked/revealable field.
- **Validate connection** action with **validating / valid / rejected / network-error / no-models**
  states, a **model-discovery** attempt against the endpoint, and a **manual model-ID fallback**
  when discovery is unavailable. URL and key are never combined visually or semantically.

## 4 · Live provider → model selection

Every Role Matrix row now has two genuinely separate controls: **Provider** and **Model**.
Selecting a provider triggers a **live model fetch** for that provider, with states: **loading**
(spinner in the model control), **ready** (role-aware “Recommended for <role>” group + others),
**empty** (provider returned no catalog → manual model-ID entry), and **error** (fetch failed →
inline message + **Retry**). Custom endpoint / NanoGPT demonstrate the discovery-unavailable →
manual-entry path. A manual model-ID field is always available. Structured roles still warn when a
chosen model can’t guarantee structured output.

### Sampler (carried from V2, per-role)
Samplers remain **per-role**, opened from a Role Matrix row: temperature, top-p, top-k, min-p,
frequency/presence/repetition penalties, max tokens, stop sequences, seed — with Precise /
Balanced / Creative presets, provider-unsupported fields disabled, and per-role reset.

---

## Unchanged
All story-side screens (Play, Overview, Characters, Character Dossier, Story Settings, Story
Blueprint, Personas, Lorebook), the design tokens, the two-register discipline, and the Ruling
artifact + animation are identical to V2.
