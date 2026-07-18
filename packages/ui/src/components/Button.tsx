/**
 * Button — the UI-register button in the five design-system variants:
 *   primary   — brass fill, panel-dark text (main CTAs: Send, Forge, Enter)
 *   secondary — raised fill, brass text, soft brass border
 *   ghost     — transparent, secondary text, hairline border
 *   system    — transparent, teal text + teal-dim border (mechanics/settings actions)
 *   disabled  — raised fill, muted text, not-allowed (also produced by the `disabled` prop)
 *
 * Keyboard-accessible by construction (native <button>); focus-visible uses the token ring
 * from tokens.css. IBM Plex Sans (UI voice), never serif.
 */
import type { ButtonHTMLAttributes, CSSProperties } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "system" | "disabled";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

function variantStyle(variant: ButtonVariant): CSSProperties {
  switch (variant) {
    case "primary":
      return { background: "var(--brass)", color: "var(--bg1-panel)", border: 0, fontWeight: 600 };
    case "secondary":
      return {
        background: "var(--bg3-raised)",
        color: "var(--brass)",
        border: "1px solid color-mix(in srgb, var(--brass) 40%, transparent)",
        fontWeight: 600,
      };
    case "ghost":
      return { background: "transparent", color: "var(--secondary)", border: "1px solid var(--hairline)" };
    case "system":
      return { background: "transparent", color: "var(--teal)", border: "1px solid var(--teal-dim)" };
    case "disabled":
      return { background: "var(--bg3-raised)", color: "var(--muted)", border: "1px solid var(--hairline)" };
  }
}

export function Button(props: ButtonProps): JSX.Element {
  const { variant = "primary", disabled, style, children, ...rest } = props;
  const effective: ButtonVariant = disabled ? "disabled" : variant;
  const base: CSSProperties = {
    fontFamily: "var(--font-ui)",
    fontSize: 14,
    borderRadius: 8,
    padding: "11px 18px",
    cursor: effective === "disabled" ? "not-allowed" : "pointer",
    lineHeight: 1,
    ...variantStyle(effective),
    ...style,
  };
  return (
    <button
      {...rest}
      disabled={disabled || variant === "disabled"}
      data-variant={effective}
      style={base}
    >
      {children}
    </button>
  );
}

export default Button;
