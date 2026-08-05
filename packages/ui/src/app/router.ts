/**
 * Internal router — no react-router dependency. Route names mirror the twelve screen file names
 * (Design/handoff §02/§03), and the current route + params live in a small zustand store so any
 * component can read the route or `navigate(...)` without prop-drilling.
 *
 * The URL hash is kept in sync (`#play?storyId=…`) so a reload/deeplink restores the view, but the
 * store is the source of truth — the hash is a mirror, not a dependency.
 */
import { create } from "zustand";

/** The routes, one per screen file. `story` is not a route — `play` is the story default. */
export const ROUTES = [
  "library",
  "setup",
  "play",
  "overview",
  "characters",
  "dossier",
  "loadout",
  "journal",
  "storysettings",
  "blueprint",
  "settings",
  "rolematrix",
  "personas",
  "lorebook",
  "wizard",
  "designsystem",
  "diagnostics",
] as const;

export type Route = (typeof ROUTES)[number];

/** Route params. `storyId` scopes the story surfaces (play/overview/characters/storysettings). */
export interface RouteParams {
  storyId?: string;
  /** Personas may edit a specific persona. */
  personaId?: string;
  /** Lorebook may open a specific entry. */
  entryId?: string;
  /** Character Dossier scopes to one character within the story. */
  characterId?: string;
  /** Route to resume after the provider/model setup flow completes. */
  returnTo?: Route;
  /** Context shown by setup when a model-dependent action was intercepted. */
  setupReason?: string;
}

/** True for the four surfaces that require an open story (drive the header's sub-tabs). */
export const STORY_ROUTES: readonly Route[] = ["play", "overview", "characters", "dossier", "loadout", "journal", "storysettings"];

export function isRoute(value: string): value is Route {
  return (ROUTES as readonly string[]).includes(value);
}

interface RouterState {
  route: Route;
  params: RouteParams;
  navigate: (route: Route, params?: RouteParams) => void;
}

/** Parse `#play?storyId=abc` → { route, params }. Falls back to `library`. */
function parseHash(hash: string): { route: Route; params: RouteParams } {
  const raw = hash.replace(/^#/, "");
  const [name, query = ""] = raw.split("?");
  const route: Route = name && isRoute(name) ? name : "library";
  const params: RouteParams = {};
  for (const pair of query.split("&")) {
    if (!pair) continue;
    const [k, v = ""] = pair.split("=");
    const value = decodeURIComponent(v);
    if (k === "storyId") params.storyId = value;
    else if (k === "personaId") params.personaId = value;
    else if (k === "entryId") params.entryId = value;
    else if (k === "characterId") params.characterId = value;
    else if (k === "returnTo" && isRoute(value)) params.returnTo = value;
    else if (k === "setupReason") params.setupReason = value;
  }
  return { route, params };
}

/** Serialize a route+params back into a hash string (no leading `#`). */
function toHash(route: Route, params: RouteParams): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join("&");
  return q ? `${route}?${q}` : route;
}

const initial =
  typeof window !== "undefined" && window.location.hash
    ? parseHash(window.location.hash)
    : { route: "library" as Route, params: {} as RouteParams };

/**
 * The route store. Screens/shell call `useRoute()` for `{ route, params, navigate }`. Kept a plain
 * zustand store (not part of uiStore) so routing is importable without the wider UI state.
 */
export const useRoute = create<RouterState>((set) => ({
  route: initial.route,
  params: initial.params,
  navigate: (route, params = {}) => {
    if (typeof window !== "undefined") {
      const next = `#${toHash(route, params)}`;
      if (window.location.hash !== next) window.location.hash = next;
    }
    set({ route, params });
  },
}));

/** Wire browser back/forward → the store. Call once at app mount. Returns an unsubscribe. */
export function bindHashHistory(): () => void {
  if (typeof window === "undefined") return () => {};
  const onHash = () => {
    const { route, params } = parseHash(window.location.hash);
    useRoute.setState({ route, params });
  };
  window.addEventListener("hashchange", onHash);
  return () => window.removeEventListener("hashchange", onHash);
}
