/**
 * ResourceBar — a labelled track for a hard-state resource (HP, Stamina). SYSTEM register:
 * the label is mono/secondary, the value is mono and tinted by fraction. Fill color goes
 * success → failure as the fraction drops; an explicit `wounded` flag forces --failure. A
 * change to `current` triggers a one-shot background delta-flash (green up / terracotta down),
 * suppressed under reduced motion or `animate={false}`.
 *
 * Values come from a LivingCardView ResourceBar view-model; this component renders, it does not
 * compute game state.
 */
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { FONT, useReducedMotion } from "./_shared";

export interface ResourceBarProps {
  label: string;
  current: number;
  max: number;
  /** Force the wounded (--failure) treatment regardless of fraction. */
  wounded?: boolean;
  /** Below this fraction the fill uses --failure. Default 0.25. */
  lowThreshold?: number;
  /** Below this fraction the fill uses --crit-gold as a caution step. Default 0.5. */
  cautionThreshold?: number;
  /** Play the delta-flash when `current` changes. Default true. */
  animate?: boolean;
  /** Compact height for dense contexts (party strip uses its own bar; this is for cards). */
  height?: number;
  className?: string;
  style?: CSSProperties;
}

/** Pick the fill color for a fraction (0..1). */
export function resourceFillColor(fraction: number, wounded: boolean, low: number, caution: number): string {
  if (wounded || fraction <= low) return "var(--failure)";
  if (fraction < caution) return "var(--crit-gold)";
  return "var(--success)";
}

export function ResourceBar(props: ResourceBarProps): JSX.Element {
  const {
    label,
    current,
    max,
    wounded = false,
    lowThreshold = 0.25,
    cautionThreshold = 0.5,
    animate = true,
    height = 7,
    className,
    style,
  } = props;

  const reduced = useReducedMotion();
  const safeMax = max > 0 ? max : 1;
  const fraction = Math.max(0, Math.min(1, current / safeMax));
  const pct = Math.round(fraction * 100);
  const fill = resourceFillColor(fraction, wounded, lowThreshold, cautionThreshold);

  // Delta-flash: remember the previous value; flash up (success) or down (failure) on change.
  const prev = useRef<number>(current);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  useEffect(() => {
    if (prev.current === current) return;
    const dir = current > prev.current ? "up" : "down";
    prev.current = current;
    if (!animate || reduced) return;
    setFlash(dir);
    const t = setTimeout(() => setFlash(null), 500);
    return () => clearTimeout(t);
  }, [current, animate, reduced]);

  const trackStyle: CSSProperties = {
    height,
    background: "var(--bg0-ground)",
    borderRadius: 4,
    overflow: "hidden",
  };
  const flashColor =
    flash === "up" ? "rgba(143,181,115,0.4)" : flash === "down" ? "rgba(201,111,87,0.45)" : undefined;
  const fillStyle: CSSProperties = {
    height: "100%",
    width: `${pct}%`,
    background: fill,
    borderRadius: 4,
    transition: reduced ? "none" : "width var(--motion-med) ease",
    ...(flash
      ? {
          animationName: "mt-flash",
          animationDuration: "0.45s",
          animationFillMode: "both",
          ["--flash-color" as string]: flashColor,
        }
      : {}),
  };

  return (
    <div className={className} style={style} data-testid="resource-bar" data-wounded={wounded || undefined}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          fontFamily: FONT.mono,
          color: "var(--secondary)",
          marginBottom: 3,
        }}
      >
        <span style={{ letterSpacing: "0.04em" }}>{label.toUpperCase()}</span>
        <span style={{ color: fill }} data-testid="resource-value">
          {current} / {max}
        </span>
      </div>
      <div style={trackStyle} role="meter" aria-valuenow={current} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
        <div style={fillStyle} data-testid="resource-fill" data-fill={fill} />
      </div>
    </div>
  );
}

export default ResourceBar;
