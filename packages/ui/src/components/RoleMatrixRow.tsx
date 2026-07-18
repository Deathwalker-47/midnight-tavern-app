/**
 * RoleMatrixRow — one row of the role→model matrix (Settings): a role glyph + name +
 * description, a model dropdown, and a fit badge (Recommended = green / Advanced = amber).
 * The five roles come from the low-level plan (D9): Narrator, Classifier, Analyzer, Summarizer,
 * Bootstrapper. Presentational: options + selection + onChange are supplied by the caller.
 */
import type { CSSProperties } from "react";
import { Chip } from "./Chip";

export type ModelRole = "narrator" | "classifier" | "analyzer" | "summarizer" | "bootstrapper";
export type RoleFit = "recommended" | "advanced";

export interface RoleModelOption {
  value: string;
  label: string;
}

export interface RoleMatrixRowProps {
  role: ModelRole;
  /** Display name; defaults from the role. */
  name?: string;
  description: string;
  options: RoleModelOption[];
  value: string;
  onChange: (value: string) => void;
  /** Fit of the currently-selected model for this role. */
  fit: RoleFit;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
}

const ROLE_GLYPH: Record<ModelRole, string> = {
  narrator: "✎",
  classifier: "⚖",
  analyzer: "❦",
  summarizer: "❏",
  bootstrapper: "✦",
};

const ROLE_NAME: Record<ModelRole, string> = {
  narrator: "Narrator",
  classifier: "Classifier",
  analyzer: "Analyzer",
  summarizer: "Summarizer",
  bootstrapper: "Bootstrapper",
};

export function RoleMatrixRow(props: RoleMatrixRowProps): JSX.Element {
  const { role, name = ROLE_NAME[role], description, options, value, onChange, fit, disabled = false, className, style } = props;
  return (
    <div
      className={className}
      data-role={role}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto",
        alignItems: "center",
        gap: 14,
        padding: "12px 0",
        borderBottom: "1px solid var(--hairline)",
        fontFamily: "var(--font-ui)",
        ...style,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span aria-hidden="true" style={{ fontSize: 18, color: "var(--brass)", width: 22, textAlign: "center" }}>
          {ROLE_GLYPH[role]}
        </span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ui-text)" }}>{name}</div>
          <div style={{ fontSize: 12, color: "var(--secondary)" }}>{description}</div>
        </div>
      </div>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={`${name} model`}
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--ui-text)",
          background: "var(--bg3-raised)",
          border: "1px solid var(--hairline)",
          borderRadius: "var(--radius-chip)",
          padding: "6px 8px",
          maxWidth: 220,
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <Chip tone={fit === "recommended" ? "recommended" : "advanced"}>
        {fit === "recommended" ? "RECOMMENDED" : "ADVANCED"}
      </Chip>
    </div>
  );
}

export default RoleMatrixRow;
