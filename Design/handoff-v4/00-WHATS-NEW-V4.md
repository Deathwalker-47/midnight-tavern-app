# What's New in V4

v4 is a revision resolving 13 locked product decisions (A–M) and opening 2 decision studies
(N1, N2). Design language, tokens, and registers are unchanged. Full traceability lives in
`00-PRODUCT-DECISIONS.md`; this is the human summary.

## Locked & built
- **A · Lorebook import** — `LorebookImport.dc.html`: JSON picker → parse → preview (format, name,
  counts, always-on, trigger keys, lossy fields) → conflict (new/merge/replace/keep-both/cancel) →
  validation failure (reason + technical detail) → partial (skipped + reasons) → success
  (Open / Attach when active / Done) + Imported badge. Compatibility matrix + fixtures in 03 §A.
- **B · Forging** — `ForgingProgress.dc.html`: real phase events, **no fake %**, elapsed, phase-
  accurate explanations, 30s/2min/5min copy, retry-resume, safe cancel, diagnostics.
- **C · ST-safe formatting** — `Chat.dc.html`: italic/bold/dialogue/separators/lists, escaped +
  malformed handling, streamed markdown; HTML/scripts/CSS/remote embeds inert. Grammar + sanitizer
  in 03 §C.
- **D · Active-story context** — breadcrumb "Library / [Story]", rail returns to it, window title,
  restore skeleton (never "No story open"), deleted/moved recovery. Shown in `Chat` + `StorySettings`.
- **E · Navigation during generation** — global background-generation indicator (story + phase +
  return), completion/failure notice, cancellation; no message silently vanishes.
- **F · Causal exchanges** — chat is exchange units (player → resolution → ruling → Narrator);
  **supersedes v3 "ruling mounts mid-stream"**; prose-only omits the ruling area.
- **G · Ruling content** — full field set with concise summary + expand; denied explains + suggests.
- **H · Rewind vs Delete-from** — indivisible exchange; **Rewind to here** (keep selected, remove
  later) is separate and differently named/colored from **Delete from this exchange**; exact previews.
- **I · Persona identity** — no invisible "Traveler"; `StoryCreation` requires choosing/confirming
  the persona, distinct from an imported card; no-persona blocks; mid-play change explained.
- **J · Narrator authority** — one source of truth (global Role Matrix); `StorySettings` shows a
  read-only "Using global Narrator" summary + Configure models; the per-story dropdown is removed.
- **K · Mastery progression** — `SkillProgression.dc.html`: rank, modifier, successes/next, pips,
  per-ruling gain, unmistakable rank-up, max-rank, dossier history.
- **L · Mechanics modes** — `StoryCreation` mode step (Prose only / Light rules / Full rules) with
  examples; shown in `StorySettings`; mode change never reinterprets prior turns.
- **M · Model errors** — `Chat` distinct copy per role/phase (Classifier ≠ Narrator; background
  Analyzer is non-blocking), each stating save-status + retry + copy-diagnostics.

## Unresolved (studies only)
- **N1** dynamic skills/actions · **N2** attributes-beneath-skills — provisional UI variants only in
  `04-IMPLEMENTATION-CONTRACT.md`; not implementation-ready.

## Note on the directive
The change request was received truncated mid-point-4 ("…fetch that provider…"). v4 implements 1–4
in full plus the clearly-implied gating/sampler detail; any points beyond the cut aren’t reflected —
flag them for V5.
