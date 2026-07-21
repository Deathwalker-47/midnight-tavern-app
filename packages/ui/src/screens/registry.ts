/**
 * Screen registry — maps each route name to its lazy-loaded screen component. The App shell
 * renders `registry[route]` inside a <Suspense> boundary, so each screen is its own chunk.
 *
 * Every screen is a named export wrapped into React.lazy's default-export contract. To add a
 * route, add its name to `Route` (../app/router) and wire it here.
 */
import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { Route } from "../app/router.js";

/**
 * Props every screen receives from the shell. Screens read route params via `useRoute()` too, but
 * `storyId` is passed explicitly since the story surfaces always need it. A screen may widen its
 * own props (e.g. Play adds an optional demo-state flag) as long as they extend this shape.
 */
export interface ScreenProps {
  storyId?: string;
}

type ScreenComponent = ComponentType<ScreenProps> | LazyExoticComponent<ComponentType<ScreenProps>>;

const Library = lazy(() => import("./Library.js").then((m) => ({ default: m.Library })));
const Play = lazy(() => import("./Play.js").then((m) => ({ default: m.Play })));
const Overview = lazy(() => import("./Overview.js").then((m) => ({ default: m.Overview })));
const Characters = lazy(() => import("./Characters.js").then((m) => ({ default: m.Characters })));
const CharacterDossier = lazy(() =>
  import("./CharacterDossier.js").then((m) => ({ default: m.CharacterDossier }))
);
const StorySettings = lazy(() =>
  import("./StorySettings.js").then((m) => ({ default: m.StorySettings }))
);
const StoryBlueprint = lazy(() =>
  import("./StoryBlueprint.js").then((m) => ({ default: m.StoryBlueprint }))
);
const Settings = lazy(() => import("./Settings.js").then((m) => ({ default: m.Settings })));
const RoleMatrix = lazy(() => import("./RoleMatrix.js").then((m) => ({ default: m.RoleMatrix })));
const Personas = lazy(() => import("./Personas.js").then((m) => ({ default: m.Personas })));
const CardCreator = lazy(() => import("./CardCreator.js").then((m) => ({ default: m.CardCreator })));
const Lorebook = lazy(() => import("./Lorebook.js").then((m) => ({ default: m.Lorebook })));
const Wizard = lazy(() => import("./Wizard.js").then((m) => ({ default: m.Wizard })));
const DesignSystem = lazy(() =>
  import("./DesignSystem.js").then((m) => ({ default: m.DesignSystem }))
);

/** route → screen component. */
export const registry: Record<Route, ScreenComponent> = {
  library: Library,
  play: Play,
  overview: Overview,
  characters: Characters,
  dossier: CharacterDossier,
  storysettings: StorySettings,
  blueprint: StoryBlueprint,
  settings: Settings,
  rolematrix: RoleMatrix,
  personas: Personas,
  cardcreator: CardCreator,
  lorebook: Lorebook,
  wizard: Wizard,
  designsystem: DesignSystem,
};
