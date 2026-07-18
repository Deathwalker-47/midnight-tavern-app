/**
 * Screen registry — maps each route name to its lazy-loaded screen component. The App shell
 * renders `registry[route]` inside a <Suspense> boundary.
 *
 * The screens themselves DON'T EXIST YET (they land in the screen wave). Until then every route
 * maps to a tiny inline placeholder so the app compiles and the shell/router are demonstrable.
 * When a real screen file arrives, swap its entry to a `React.lazy` import — the shape below shows
 * exactly how (see the commented example on `library`).
 */
import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { Route } from "../app/router.js";

/**
 * Props every screen receives from the shell. Screens read route params via `useRoute()` too, but
 * `storyId` is passed explicitly since the story surfaces always need it.
 */
export interface ScreenProps {
  storyId?: string;
}

type ScreenComponent = ComponentType<ScreenProps> | LazyExoticComponent<ComponentType<ScreenProps>>;

/**
 * SCREEN PLACEHOLDER — replaced by the screen wave.
 * Renders an empty frame tagged with the route name so the shell is navigable before screens exist.
 * The real entries become e.g.:
 *   library: lazy(() => import("./Library.js").then((m) => ({ default: m.Library }))),
 */
function placeholder(route: Route): ScreenComponent {
  const Placeholder = (_props: ScreenProps) => null;
  Placeholder.displayName = `ScreenPlaceholder(${route})`;
  return Placeholder;
}

/**
 * Example of the real lazy shape (kept commented so the wave can copy it verbatim):
 *
 *   const Library = lazy(() => import("./Library.js").then((m) => ({ default: m.Library })));
 */
void lazy; // referenced so the import is live for the screen wave; remove once a real lazy lands.

/** route → screen component. Every route resolves to a component (placeholder for now). */
export const registry: Record<Route, ScreenComponent> = {
  library: placeholder("library"),
  play: placeholder("play"),
  overview: placeholder("overview"),
  characters: placeholder("characters"),
  storysettings: placeholder("storysettings"),
  settings: placeholder("settings"),
  personas: placeholder("personas"),
  cardcreator: placeholder("cardcreator"),
  lorebook: placeholder("lorebook"),
  wizard: placeholder("wizard"),
  designsystem: placeholder("designsystem"),
};
