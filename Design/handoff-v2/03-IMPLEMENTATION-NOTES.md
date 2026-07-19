# 03 · Implementation Notes

## How to read the prototype files

Each `screens/*.dc.html` is a **self-contained, browser-openable prototype**. Just open one in a
modern browser — no build step, no server. They share `screens/support.js` (the small runtime
that renders them). Treat them as the **visual + interaction source of truth**.

### What's inside a prototype file

Each file has three parts you'll care about:

1. **A template** — the markup, with inline styles. This is where all the **exact spacing,
   color, radius, font, and layout** live. Read the inline `style="…"` values directly; they map
   1:1 to the numbers in `01-DESIGN-SYSTEM.md`.
2. **A logic class** (`class Component extends DCLogic { … }`) — plain JavaScript. State,
   handlers, and the data that drives each screen (the story content, the role list, the action
   catalog, the scripted turn engine in `Play`, etc.). This is a normal React-style class
   component under the hood (`state`, `setState`, `renderVals()` returns the template's inputs).
3. **Control-flow tags** in the template: `<sc-for list as>` = a loop (like `.map`),
   `<sc-if value>` = conditional. `{{ dotted.path }}` = a value from the logic class.

You do **not** need to reuse this runtime. Port the *markup + styles + behavior* into your real
stack (React/Vue/Svelte/native desktop — see below). The files are the spec; the runtime is
incidental.

> Note: a few dense, static prose blocks (e.g. some Overview/Characters/DesignSystem content) are
> built with `React.createElement` inside the logic class rather than template markup. If you're
> hand-porting, read those as ordinary JSX-equivalent element trees.

### Fastest way to extract exact values

- **Colors / spacing / type:** read the inline styles in the template, or cross-reference
  `01-DESIGN-SYSTEM.md` (every token value is listed there).
- **Copy:** all user-facing strings are in the files verbatim — lift them directly.
- **Data shapes:** the logic classes contain representative data (skills, actions, roles,
  providers, arc sections). They're good starting schemas — but `reference/low-level-plan.md` is
  the authoritative data model.
- **Motion:** `@keyframes` are defined in each file's `<style>` block (`mt-die`, `mt-stamp`,
  `mt-ring`, `mt-count`, `mt-fade`, `mt-rise`, `mt-ink`, `mt-flash`, `mt-sweep`). Timings/delays
  are on the animated elements and summarized in `01-DESIGN-SYSTEM.md`.

---

## Suggested build approach

This is a **local-first desktop app**, so a good target is **Electron/Tauri + React**, or a
native shell with a web UI. Whatever you choose:

1. **Stand up the design system first.** Encode the tokens (`01-DESIGN-SYSTEM.md`) as CSS
   variables / a theme object. Load the four Google fonts. Get the two registers right before
   building screens — everything inherits from them.
2. **Build the shell** — 72px rail + contextual header + story sub-tabs + routing between the
   twelve surfaces (route names mirror the file names).
3. **Build the component library** (`DesignSystem.dc.html` is your checklist): RulingArtifact
   first (it's the soul of the app), then LivingCard/ResourceBar/MasteryPips, then cards, chips,
   notices, key fields, role rows. Unit-test the Ruling states.
4. **Wire the model layer** per `reference/low-level-plan.md`: the five roles, provider adapters,
   key validation, the turn pipeline (Classifier → gate → dice → Narrator stream → Analyzer),
   the forging pipeline, and rolling summarization. Rulings are computed before the Narrator
   writes but committed to the ledger after prose returns, in one transaction.
5. **Build screens** in this order: Play → Library → Wizard → Overview → Characters →
   StorySettings → Settings → Personas → CardCreator → Lorebook. Match each screen's state
   matrix (`02-STATES-AND-FLOWS.md`).
6. **Persistence:** a single local **SQLite** database — stories, characters, messages,
   rulings, chapters, arcs, lorebooks, personas, and settings are rows (see
   `reference/low-level-plan.md` §3). Nothing leaves the machine.

## Determinism & gating (the part that makes this app different)

- The **gate check runs before any roll.** Resolve the attempted action against the character's
  actual skills/prereqs from the frozen rulebook. If unmet → **DENIED** (no dice). This is a
  hard rule, not a stylistic choice — it's why "rules that hold" is the tagline.
- **Dice are real and shown.** d20 + modifier vs DC. The modifier comes from mastery rank
  (novice +1 / adept +3 / expert +5 / master +7). Nat 20 / nat 1 are critical.
- **The rulebook is frozen at forge time.** Skills, actions, DCs, items, resources are generated
  once from the premise, then locked. After play begins, regeneration is disabled (it would
  orphan learned skills/inventory); only DC values and labels stay editable.
- **Outcomes are computed and committed by the deterministic engine** (gate → dice → outcome
  table → ledger). No model ever writes mechanical state. The **Analyzer updates narrative
  memory only** (personality, mood, relationships, observations, locations, threads) and is
  schema-forbidden from touching skills, items, resources, or health. The **Narrator receives
  already-decided rulings and narrates them.**

## Things to preserve exactly

- The **Ruling reveal** timing and the **denied = no-dice** rule.
- The **two-register** discipline.
- **State completeness** — the prototype's whole point is that loading/empty/error/edge states
  are designed, not afterthoughts.
- The **copy** — voice is part of the product. Lift strings verbatim unless product changes them.

## Things that are prototype-only (drop or gate in production)

- The **Demo switcher** chip row under each header (it's for reviewing states).
- The **scripted turn engine** in `Play` (a canned sequence for demoing every ruling type) —
  replace with the real pipeline.
- The **<12-char ambiguity trigger** is a demo heuristic. In production the hint appears only
  when the Classifier returns confidence < 0.6 (see `low-level-plan.md` D4/M4). Never trigger
  on message length.
- Hard-coded content of *Embers of the Silent Vale* — sample data, not product data.
- The `.dc.html` runtime (`support.js`) — a prototype renderer, not for shipping.

---

## Reference docs (in `reference/`)

- **`design-notes.md`** — the condensed design bible used to build the screens (tokens + the
  full content bible + per-screen digests + the turn script). Densest single reference.
- **`high-level-plan.md`** — the product plan: what the app is, its principles, the loop, memory.
- **`low-level-plan.md`** — the engineering plan: data model, model pipeline, save format,
  mechanics rules. **Authoritative for behavior and schemas.**
- **`design-brief.md`** — the original UI requirements brief.

Where this handoff and the plans disagree: **plans win on behavior/data; the prototype wins on
look, layout, copy, and motion.**
