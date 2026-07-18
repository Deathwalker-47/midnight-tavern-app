/**
 * ProviderCard — a configured-provider row: provider name + a status dot echoing the key state,
 * a slot for a KeyField, and optional children (model list, actions). The card's left border
 * tracks the key state (empty/validating/valid/rejected) so a glance across the settings page
 * reads which providers are live.
 */
import type { CSSProperties, ReactNode } from "react";
import type { KeyFieldState } from "./KeyField";

export interface ProviderCardProps {
  name: string;
  /** Mirrors the KeyField state to color the card border + status dot. */
  keyState: KeyFieldState;
  /** Optional short descriptor (e.g. "OpenAI-compatible"). */
  subtitle?: string;
  /** The KeyField and any provider-specific controls. */
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

function stateColor(state: KeyFieldState): string {
  switch (state) {
    case "valid":
      return "var(--success)";
    case "validating":
      return "var(--brass)";
    case "rejected":
      return "var(--failure)";
    case "empty":
      return "var(--hairline)";
  }
}

export function ProviderCard(props: ProviderCardProps): JSX.Element {
  const { name, keyState, subtitle, children, className, style } = props;
  const accent = stateColor(keyState);
  return (
    <section
      className={className}
      data-state={keyState}
      style={{
        background: "var(--bg1-panel)",
        border: "1px solid var(--hairline)",
        borderLeft: `3px solid ${accent}`,
        borderRadius: "var(--radius-card)",
        padding: "16px 18px",
        fontFamily: "var(--font-ui)",
        ...style,
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span
          aria-hidden="true"
          style={{ width: 8, height: 8, borderRadius: "50%", background: accent }}
        />
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 18, color: "var(--prose)" }}>{name}</span>
        {subtitle ? (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)", marginLeft: 4 }}>{subtitle}</span>
        ) : null}
      </header>
      {children}
    </section>
  );
}

export default ProviderCard;
