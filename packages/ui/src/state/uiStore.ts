/**
 * uiStore — cross-cutting UI state that isn't domain data: drawers, toasts, reduced-motion.
 * Routing itself lives in `app/router.ts` (a dedicated store); this store re-exports `useRoute`
 * so screens have one import for "app chrome" state.
 */
import { create } from "zustand";

export { useRoute } from "../app/router.js";
export type { Route, RouteParams } from "../app/router.js";

/** A transient notice (§ InlineNotice/Toast — info/warn/error). */
export interface Toast {
  id: string;
  kind: "info" | "warn" | "error";
  title: string;
  body?: string;
  /** Auto-dismiss after this many ms; omit to keep until dismissed. */
  timeoutMs?: number;
}

interface UiState {
  /** The LivingCard drawer's open character (Play/Characters), or undefined when closed. */
  drawerCharacterId?: string;
  openCharacterDrawer: (characterId: string) => void;
  closeDrawer: () => void;

  toasts: Toast[];
  pushToast: (toast: Omit<Toast, "id">) => string;
  dismissToast: (id: string) => void;

  /** Mirrors `prefers-reduced-motion`; components gate animation on this. */
  reducedMotion: boolean;
  setReducedMotion: (value: boolean) => void;
}

function detectReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export const useUiStore = create<UiState>((set) => ({
  drawerCharacterId: undefined,
  openCharacterDrawer: (characterId) => set({ drawerCharacterId: characterId }),
  closeDrawer: () => set({ drawerCharacterId: undefined }),

  toasts: [],
  pushToast: (toast) => {
    const id = `toast-${Math.random().toString(36).slice(2)}`;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    if (toast.timeoutMs) {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }, toast.timeoutMs);
    }
    return id;
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  reducedMotion: detectReducedMotion(),
  setReducedMotion: (value) => set({ reducedMotion: value }),
}));

/** Subscribe the store to the media query. Call once at app mount; returns an unsubscribe. */
export function bindReducedMotion(): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const onChange = () => useUiStore.getState().setReducedMotion(mq.matches);
  onChange();
  mq.addEventListener?.("change", onChange);
  return () => mq.removeEventListener?.("change", onChange);
}
