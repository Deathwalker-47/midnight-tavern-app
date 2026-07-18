/**
 * Shared primitives for the presentational component library: the roll-outcome palette,
 * the two-register accent map, and two small hooks used by animated components
 * (reduced-motion detection + an integer count-up tween for the Ruling total).
 *
 * Pure view-layer. No core store access; importing TYPES from core is fine.
 */
import { useEffect, useRef, useState } from "react";
import type { Outcome } from "@midnight-tavern/core";

/** View-model outcome (hyphenated form used across the UI). */
export type RollOutcome = "crit-success" | "success" | "failure" | "crit-failure";

/** Map the core engine's snake_case Outcome onto the UI's hyphenated form. */
export function fromCoreOutcome(o: Outcome): RollOutcome {
  switch (o) {
    case "crit_success":
      return "crit-success";
    case "crit_failure":
      return "crit-failure";
    case "success":
      return "success";
    case "failure":
      return "failure";
  }
}

/** Wrap a token name as a CSS custom-property reference, e.g. cssVar("brass") → "var(--brass)". */
export function cssVar(name: string): string {
  return `var(--${name})`;
}

/** The verdict color token for a single roll outcome. */
export function outcomeVar(outcome: RollOutcome): string {
  switch (outcome) {
    case "crit-success":
      return cssVar("crit-gold");
    case "success":
      return cssVar("success");
    case "failure":
      return cssVar("failure");
    case "crit-failure":
      return cssVar("crit-crimson");
  }
}

/** Default stamp text per outcome (callers may override). */
export function outcomeStamp(outcome: RollOutcome): string {
  switch (outcome) {
    case "crit-success":
      return "CRITICAL";
    case "success":
      return "SUCCESS";
    case "failure":
      return "FAILURE";
    case "crit-failure":
      return "CRIT FAIL";
  }
}

/**
 * True when the OS requests reduced motion. Reads a media query and updates on change.
 * Falls back to `false` when matchMedia is unavailable (e.g. some test environments).
 */
export function useReducedMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const get = (): boolean =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(query).matches
      : false;

  const [reduced, setReduced] = useState<boolean>(get);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(query);
    const onChange = (): void => setReduced(mql.matches);
    onChange();
    // addEventListener is the modern API; older Safari used addListener.
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);

  return reduced;
}

/**
 * Tween an integer up to `target`. When `enabled` is false (or reduced motion is on), the
 * final value is returned immediately — used by the Ruling total count-up and disabled in
 * tests/lists via the `animate={false}` prop.
 */
export function useCountUp(
  target: number,
  opts: { enabled: boolean; delayMs?: number; durationMs?: number } = { enabled: true }
): number {
  const { enabled, delayMs = 500, durationMs = 600 } = opts;
  const reduced = useReducedMotion();
  const [value, setValue] = useState<number>(enabled && !reduced ? 0 : target);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || reduced) {
      setValue(target);
      return;
    }
    setValue(0);
    let start = 0;
    const step = (ts: number): void => {
      if (start === 0) start = ts;
      const t = Math.min(1, (ts - start) / durationMs);
      setValue(Math.round(t * target));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    timerRef.current = setTimeout(() => {
      rafRef.current = requestAnimationFrame(step);
    }, delayMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, enabled, reduced, delayMs, durationMs]);

  return value;
}

/** Fonts as inline-style fragments (mirror the token families for elements set inline). */
export const FONT = {
  display: cssVar("font-display"),
  prose: cssVar("font-prose"),
  ui: cssVar("font-ui"),
  mono: cssVar("font-mono"),
} as const;
