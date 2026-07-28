# @midnight-tavern/ui

The React desktop interface for Midnight Tavern. Presentation and interaction only — it holds no game logic. All application behavior comes from `@midnight-tavern/core`, reached through a single typed façade, the **CoreBridge**.

Stack: **React 18 · Zustand · Vite · TypeScript**, rendered inside the Tauri shell (or a plain browser during development).

## The CoreBridge (`src/bridge/`)

The UI never imports engine internals. It calls `core.ts`'s bridge interface, which has **two interchangeable implementations**:

- an **in-memory backend** — fast, dependency-free, used by the Vite dev server and by tests; and
- **`sqliteBridge.ts` + `sqliteDriver.ts`** — the real backend that talks to the Tauri SQLite driver.

Every bridge method must exist in **both** backends. A method implemented only in memory will pass tests and then fail in the packaged desktop app, so backend parity is a review gate.

## Screens (`src/screens/`)

Fourteen product routes plus a design-system reference:

Library · Play · Overview · Characters · CharacterDossier · CharacterLoadout · StorySettings · StoryBlueprint · Settings · RoleMatrix · Personas · CardCreator (import preview) · Lorebook · Journal · Wizard / SetupWizard — and `DesignSystem` (component gallery). `registry.ts` wires routes.

## Components (`src/components/`)

The reusable system, tokens-first. The signature element is **`RulingArtifact`** — the inline dice-resolution moment (roll → count-up → verdict stamp) that renders the multi-term math (`d20 + STR + skill vs DC → outcome`) including gate-denied and opposed variants. Other notable components: `LivingCard`, `PartyStrip`, `MasteryPips`, `ResourceBar`, `RelationshipRow`, `MessageActions` (swipe counter + locked-die glyph + ⋯ menu), `RoleMatrixRow`, `SamplerPanel`, `DifficultyPicker`, `ForgingInterstitial` (the world-generation wait), `BlueprintForm`, `AttachPanel`, and the provider/key setup pieces.

The interface uses a **two-register visual system**: a warm, literary register for story/prose and a cool, precise register for mechanics/system — the visual expression of the hard/soft wall. Story elements and system elements never borrow each other's styling.

## State (`src/state/`)

Zustand stores bridging UI to core: `playStore`, `storiesStore`, `settingsStore`, `uiStore`. Stores hold view state and call the bridge; they do not reimplement core logic.

## Scripts

```bash
npm run dev        # Vite dev server — runs the UI in a browser against the in-memory core
npm run build      # tsc --noEmit && vite build
npm run typecheck  # tsc --noEmit
npm test           # React Testing Library + vitest
```

`npm run dev` is the fastest way to work on the UI: no Rust, no native build, no API key needed for anything that doesn't call a model. To exercise real persistence and the desktop host, run the app from `packages/shell` instead.

## Tests

`test/` covers screens, components, the bridge, and observability (~82 cases at the last audit). UI tests should run without React `act(...)` warnings; a few screens still need dedicated coverage (see the status audit).
